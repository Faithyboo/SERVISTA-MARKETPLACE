from django.db import transaction
from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from bookings.models import Booking
from users.models import Notification
from .models import Transaction, Wallet
from .serializers import TopUpSerializer, WalletPinResetDecisionSerializer, WalletPinSerializer, WalletSerializer
from .utils import get_reconciled_wallet, reconcile_wallet_balance


def get_wallet(user):
    wallet, _ = Wallet.objects.get_or_create(user=user)
    return wallet


def provider_kyc_is_approved(user):
    if user.role != 'provider':
        return True
    profile = getattr(user, 'provider_profile', None)
    return getattr(profile, 'kyc_status', None) == 'approved'


class WalletDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wallet = get_reconciled_wallet(request.user)
        return Response(WalletSerializer(wallet).data)


class WalletTopUpView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not provider_kyc_is_approved(request.user):
            return Response(
                {'error': 'KYC approval is required before providers can fund or withdraw from their wallet.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = TopUpSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            wallet = Wallet.objects.select_for_update().get(pk=get_wallet(request.user).pk)
            amount = serializer.validated_data['amount']
            wallet.balance += amount
            wallet.save()
            Transaction.objects.create(
                wallet=wallet,
                type='topup',
                amount=amount,
                description='Wallet top up',
            )
            wallet = reconcile_wallet_balance(wallet)
        return Response(WalletSerializer(wallet).data, status=status.HTTP_201_CREATED)


class WalletPinView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        wallet = get_wallet(request.user)
        serializer = WalletPinSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        current_pin = serializer.validated_data.get('current_pin')
        if wallet.pin_hash and wallet.pin_reset_status != 'approved':
            if not current_pin:
                return Response({'error': 'Current PIN is required to change your wallet PIN.'}, status=status.HTTP_400_BAD_REQUEST)
            if not check_password(current_pin, wallet.pin_hash):
                return Response({'error': 'Current PIN is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

        wallet.pin_hash = make_password(serializer.validated_data['pin'])
        wallet.pin_reset_status = 'none'
        wallet.pin_reset_requested_at = None
        wallet.save(update_fields=['pin_hash', 'pin_reset_status', 'pin_reset_requested_at', 'updated_at'])
        return Response(WalletSerializer(wallet).data, status=status.HTTP_200_OK)


class WalletPinVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        wallet = get_wallet(request.user)
        pin = str(request.data.get('pin', ''))
        if not wallet.pin_hash:
            return Response({'verified': True, 'wallet': WalletSerializer(wallet).data})
        if not pin:
            return Response({'error': 'Wallet PIN is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not check_password(pin, wallet.pin_hash):
            return Response({'error': 'Invalid wallet PIN.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'verified': True, 'wallet': WalletSerializer(get_reconciled_wallet(request.user)).data})


class WalletPinPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        wallet = get_wallet(request.user)
        raw_required = request.data.get('pin_required_for_access', False)
        if isinstance(raw_required, str):
            required = raw_required.lower() in ['true', '1', 'yes', 'on']
        else:
            required = bool(raw_required)
        if required and not wallet.pin_hash:
            return Response(
                {'error': 'Set a wallet PIN before requiring PIN access.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        wallet.pin_required_for_access = required
        wallet.save(update_fields=['pin_required_for_access', 'updated_at'])
        return Response(WalletSerializer(wallet).data)


class WalletPinResetRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        wallet = get_wallet(request.user)
        wallet.pin_reset_status = 'requested'
        wallet.pin_reset_requested_at = timezone.now()
        wallet.save(update_fields=['pin_reset_status', 'pin_reset_requested_at', 'updated_at'])
        return Response({'message': 'PIN reset request submitted for admin approval.', 'wallet': WalletSerializer(wallet).data})


class AdminPinResetListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        wallets = Wallet.objects.select_related('user').filter(pin_reset_status='requested').order_by('-pin_reset_requested_at')
        return Response(WalletSerializer(wallets, many=True).data)


class AdminPinResetUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, wallet_id):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        serializer = WalletPinResetDecisionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            wallet = Wallet.objects.select_related('user').get(pk=wallet_id, pin_reset_status='requested')
        except Wallet.DoesNotExist:
            return Response({'error': 'PIN reset request not found'}, status=status.HTTP_404_NOT_FOUND)

        decision = serializer.validated_data['status']
        wallet.pin_reset_status = decision
        if decision == 'approved':
            wallet.pin_hash = ''
        wallet.save(update_fields=['pin_hash', 'pin_reset_status', 'updated_at'])
        return Response(WalletSerializer(wallet).data)


class WalletPaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        if request.user.role != 'client':
            return Response({'error': 'Only clients can pay for bookings'}, status=status.HTTP_403_FORBIDDEN)
        try:
            booking = Booking.objects.select_related('service__provider', 'client').get(pk=booking_id)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        if booking.client != request.user:
            return Response({'error': 'Not authorized to pay for this booking'}, status=status.HTTP_403_FORBIDDEN)
        if booking.status == 'cancelled':
            return Response({'error': 'Cannot pay for a cancelled booking'}, status=status.HTTP_400_BAD_REQUEST)
        pin = str(request.data.get('pin', ''))
        if not pin:
            return Response({'error': 'Wallet PIN is required to complete payment'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            client_wallet = Wallet.objects.select_for_update().get(pk=get_wallet(request.user).pk)
            if not client_wallet.pin_hash:
                return Response({'error': 'Set up your wallet PIN before making payments'}, status=status.HTTP_400_BAD_REQUEST)
            if not check_password(pin, client_wallet.pin_hash):
                return Response({'error': 'Invalid wallet PIN'}, status=status.HTTP_400_BAD_REQUEST)
            if Transaction.objects.filter(wallet=client_wallet, booking=booking, type='payment').exists():
                return Response({'error': 'Booking has already been paid'}, status=status.HTTP_400_BAD_REQUEST)
            if client_wallet.balance < booking.amount:
                return Response({'error': 'Insufficient balance'}, status=status.HTTP_400_BAD_REQUEST)
            client_wallet.balance -= booking.amount
            client_wallet.save(update_fields=['balance', 'updated_at'])
            Transaction.objects.create(
                wallet=client_wallet,
                booking=booking,
                type='payment',
                amount=booking.amount,
                description=f'Payment held in escrow for booking #{booking.pk}',
            )
            booking.payment_status = 'escrowed'
            booking.refund_status = 'none'
            booking.save(update_fields=['payment_status', 'refund_status'])
            Notification.objects.create(
                user=booking.service.provider,
                title='Client payment received',
                message=f'{request.user.full_name or "A client"} has paid for {booking.service.title}.',
                detail=(
                    f'{booking.amount} FCFA is being held securely in Servista escrow. '
                    'The payout will remain in escrow until the job is completed and confirmed.'
                ),
                icon='wallet-outline',
                tone='success',
            )
            client_wallet = reconcile_wallet_balance(client_wallet)
        return Response({'message': 'Payment successful', 'wallet': WalletSerializer(client_wallet).data})
