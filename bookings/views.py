from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from services.models import Service
from wallet.models import Transaction, Wallet
from wallet.utils import reconcile_wallet_balance
from users.models import Notification, User
from .models import Booking
from .serializers import BookingSerializer, BookingStatusSerializer


def booking_has_payment(booking):
    return booking.payment_status in {'escrowed', 'released'} or Transaction.objects.filter(
        booking=booking,
        type='payment',
        wallet__user=booking.client,
    ).exists()


def get_wallet(user):
    wallet, _ = Wallet.objects.get_or_create(user=user)
    return wallet


def create_notification(user, title, message, detail='', icon='notifications-outline', tone='blue'):
    Notification.objects.create(
        user=user,
        title=title,
        message=message,
        detail=detail,
        icon=icon,
        tone=tone,
    )


def calculate_platform_fee(amount):
    return (amount * Decimal('0.05')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def release_escrow(booking, reason='client_confirmed'):
    if booking.payment_status != 'escrowed':
        return booking, Decimal('0.00')
    if booking.refund_status == 'requested' or booking.issue_reported_at:
        raise ValueError('This escrow is blocked because an issue or refund request is pending.')

    fee = calculate_platform_fee(booking.amount)
    payout = booking.amount - fee
    with transaction.atomic():
        locked_booking = Booking.objects.select_for_update().select_related('service__provider', 'client').get(pk=booking.pk)
        if locked_booking.payment_status != 'escrowed':
            return locked_booking, Decimal('0.00')
        if locked_booking.refund_status == 'requested' or locked_booking.issue_reported_at:
            raise ValueError('This escrow is blocked because an issue or refund request is pending.')

        provider_wallet = Wallet.objects.select_for_update().get(pk=get_wallet(locked_booking.service.provider).pk)
        provider_wallet.balance += payout
        provider_wallet.save(update_fields=['balance', 'updated_at'])
        Transaction.objects.create(
            wallet=provider_wallet,
            booking=locked_booking,
            type='payment',
            amount=payout,
            description=f'Escrow released for booking #{locked_booking.pk} after 5% Servista fee',
        )
        provider_wallet = reconcile_wallet_balance(provider_wallet)
        locked_booking.platform_fee = fee
        locked_booking.payment_status = 'released'
        locked_booking.escrow_released_at = timezone.now()
        locked_booking.status = 'completed'
        if reason == 'client_confirmed' and not locked_booking.client_confirmed_at:
            locked_booking.client_confirmed_at = timezone.now()
        locked_booking.save(update_fields=[
            'platform_fee', 'payment_status', 'escrow_released_at',
            'status', 'client_confirmed_at',
        ])
        create_notification(
            locked_booking.service.provider,
            'Escrow released',
            f'{payout} XAF has been released to your wallet for {locked_booking.service.title}.',
            detail=f'Servista fee: {fee} XAF. Booking #{locked_booking.pk}.',
            icon='wallet-outline',
            tone='success',
        )
    return locked_booking, payout


def auto_release_due_escrows():
    cutoff = timezone.now() - timedelta(hours=24)
    bookings = Booking.objects.select_related('service__provider', 'client').filter(
        payment_status='escrowed',
        provider_marked_completed_at__isnull=False,
        provider_marked_completed_at__lte=cutoff,
        client_confirmed_at__isnull=True,
        issue_reported_at__isnull=True,
    ).exclude(refund_status='requested')
    for booking in bookings:
        try:
            release_escrow(booking, reason='auto_release_24h')
        except ValueError:
            continue


class BookingListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        auto_release_due_escrows()
        if request.user.role == 'client':
            bookings = Booking.objects.filter(client=request.user)
        elif request.user.role == 'provider':
            bookings = Booking.objects.filter(service__provider=request.user)
        else:
            bookings = Booking.objects.all()
        return Response(BookingSerializer(bookings.select_related('service__provider', 'client'), many=True).data)

    def post(self, request):
        if request.user.role != 'client':
            return Response({'error': 'Only clients can create bookings'}, status=status.HTTP_403_FORBIDDEN)
        service_id = request.data.get('service')
        try:
            service = Service.objects.get(pk=service_id, is_available=True)
        except Service.DoesNotExist:
            return Response({'error': 'Available service not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = BookingSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(client=request.user, amount=service.price)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class BookingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            booking = Booking.objects.select_related('service__provider', 'client').get(pk=pk)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user not in {booking.client, booking.service.provider} and request.user.role != 'admin':
            return Response({'error': 'Not authorized to view this booking'}, status=status.HTTP_403_FORBIDDEN)
        return Response(BookingSerializer(booking).data)


class BookingStatusUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        try:
            booking = Booking.objects.select_related('service').get(pk=pk)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get('status')
        if new_status == 'cancelled' and booking_has_payment(booking):
            return Response(
                {'error': 'Paid bookings cannot be cancelled directly. A refund request must be reviewed by admin.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if request.user == booking.service.provider:
            allowed = {
                'pending': {'confirmed', 'cancelled'},
                'confirmed': {'in_progress'},
                'in_progress': {'completed'},
            }
        elif request.user == booking.client:
            allowed = {
                'pending': {'cancelled'},
                'confirmed': {'cancelled'},
            }
        else:
            return Response({'error': 'Not authorized to update this booking'}, status=status.HTTP_403_FORBIDDEN)
        if new_status not in allowed.get(booking.status, set()):
            return Response({'error': f'Cannot change booking status from {booking.status} to {new_status}'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = BookingStatusSerializer(booking, data=request.data)
        if serializer.is_valid():
            previous_status = booking.status
            updated_booking = serializer.save()
            if (
                request.user == updated_booking.service.provider
                and previous_status == 'in_progress'
                and updated_booking.status == 'completed'
            ):
                update_fields = []
                if not updated_booking.provider_marked_completed_at:
                    updated_booking.provider_marked_completed_at = timezone.now()
                    update_fields.append('provider_marked_completed_at')
                if update_fields:
                    updated_booking.save(update_fields=update_fields)
                create_notification(
                    updated_booking.client,
                    'Provider marked job completed',
                    f'{updated_booking.service.provider.full_name or "Your provider"} marked {updated_booking.service.title} completed. Please confirm or report an issue.',
                    detail='Confirm the service if everything is complete. Admin will then review and release the escrow payout.',
                    icon='checkmark-done-outline',
                    tone='warning',
                )
            return Response(BookingSerializer(booking).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class BookingRefundRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related('service__provider', 'client').get(pk=pk)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        if booking.client != request.user:
            return Response({'error': 'Only the client can request a refund'}, status=status.HTTP_403_FORBIDDEN)
        if not booking_has_payment(booking):
            return Response({'error': 'Only paid escrow bookings can request a refund'}, status=status.HTTP_400_BAD_REQUEST)
        if booking.payment_status in {'released', 'refunded'}:
            return Response({'error': 'This booking is no longer refundable'}, status=status.HTTP_400_BAD_REQUEST)
        if booking.refund_status == 'requested':
            return Response({'error': 'Refund request is already pending admin review'}, status=status.HTTP_400_BAD_REQUEST)
        booking.refund_status = 'requested'
        booking.refund_requested_at = timezone.now()
        booking.issue_reported_at = timezone.now()
        if booking.payment_status == 'unpaid':
            booking.payment_status = 'escrowed'
        booking.save(update_fields=['refund_status', 'refund_requested_at', 'issue_reported_at', 'payment_status'])
        create_notification(
            booking.service.provider,
            'Client reported an issue',
            f'{booking.client.full_name or "A client"} requested admin review for {booking.service.title}.',
            detail=f'Booking #{booking.pk} escrow is blocked until admin review.',
            icon='warning-outline',
            tone='red',
        )
        return Response(BookingSerializer(booking).data)


class BookingConfirmCompletionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related('service__provider', 'client').get(pk=pk)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        if booking.client != request.user:
            return Response({'error': 'Only the client can confirm completion'}, status=status.HTTP_403_FORBIDDEN)
        if booking.payment_status != 'escrowed':
            if booking.payment_status == 'unpaid' and booking_has_payment(booking):
                booking.payment_status = 'escrowed'
                booking.save(update_fields=['payment_status'])
            else:
                return Response({'error': 'Only escrowed bookings can be confirmed'}, status=status.HTTP_400_BAD_REQUEST)
        if not booking.provider_marked_completed_at and booking.status != 'completed':
            return Response({'error': 'The provider has not marked this job completed yet'}, status=status.HTTP_400_BAD_REQUEST)
        if not booking.provider_marked_completed_at:
            booking.provider_marked_completed_at = timezone.now()
            booking.save(update_fields=['provider_marked_completed_at'])
        if booking.issue_reported_at or booking.refund_status == 'requested':
            return Response({'error': 'This booking has a pending issue and needs admin review'}, status=status.HTTP_400_BAD_REQUEST)
        booking.client_confirmed_at = timezone.now()
        booking.save(update_fields=['client_confirmed_at'])
        for admin in User.objects.filter(role='admin'):
            create_notification(
                admin,
                'Escrow ready for release',
                f'{booking.client.full_name or "A client"} confirmed completion for {booking.service.title}.',
                detail=f'Booking #{booking.pk} is ready for admin payout review. Release {booking.amount} XAF minus the 5% Servista fee to {booking.service.provider.full_name or booking.service.provider.email}.',
                icon='wallet-outline',
                tone='warning',
            )
        create_notification(
            booking.service.provider,
            'Client confirmed completion',
            f'{booking.client.full_name or "The client"} confirmed {booking.service.title}.',
            detail='Admin has been notified to review and release the escrow payout.',
            icon='checkmark-circle-outline',
            tone='success',
        )
        return Response(BookingSerializer(booking).data)


class BookingReportIssueView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            booking = Booking.objects.select_related('service__provider', 'client').get(pk=pk)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        if booking.client != request.user:
            return Response({'error': 'Only the client can report an issue'}, status=status.HTTP_403_FORBIDDEN)
        if booking.payment_status != 'escrowed':
            return Response({'error': 'Only escrowed bookings can be reported for admin review'}, status=status.HTTP_400_BAD_REQUEST)
        if booking.refund_status == 'requested':
            return Response({'error': 'This issue is already pending admin review'}, status=status.HTTP_400_BAD_REQUEST)
        booking.issue_reported_at = timezone.now()
        booking.refund_requested_at = timezone.now()
        booking.refund_status = 'requested'
        booking.save(update_fields=['issue_reported_at', 'refund_requested_at', 'refund_status'])
        create_notification(
            booking.service.provider,
            'Escrow issue reported',
            f'{booking.client.full_name or "A client"} reported an issue on {booking.service.title}.',
            detail=f'Booking #{booking.pk} will remain blocked until admin resolves it.',
            icon='warning-outline',
            tone='red',
        )
        return Response(BookingSerializer(booking).data)


class AdminRefundListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        bookings = Booking.objects.filter(refund_status='requested').select_related('service__provider', 'client')
        return Response(BookingSerializer(bookings, many=True).data)


class AdminRefundUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        decision = request.data.get('status')
        if decision not in {'approved', 'rejected'}:
            return Response({'error': 'Status must be approved or rejected'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            booking = Booking.objects.select_related('service__provider', 'client').get(pk=pk, refund_status='requested')
        except Booking.DoesNotExist:
            return Response({'error': 'Pending refund request not found'}, status=status.HTTP_404_NOT_FOUND)

        if decision == 'rejected':
            booking.refund_status = 'rejected'
            booking.save(update_fields=['refund_status'])
            return Response(BookingSerializer(booking).data)

        with transaction.atomic():
            client_wallet = Wallet.objects.select_for_update().get(pk=get_wallet(booking.client).pk)
            provider_payment_exists = Transaction.objects.filter(
                wallet__user=booking.service.provider,
                booking=booking,
                type='payment',
            ).exists()
            if provider_payment_exists:
                provider_wallet = Wallet.objects.select_for_update().get(pk=get_wallet(booking.service.provider).pk)
                if provider_wallet.balance < booking.amount:
                    return Response(
                        {'error': 'Provider wallet has insufficient balance to reverse this old escrow payment'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                provider_wallet.balance -= booking.amount
                provider_wallet.save(update_fields=['balance', 'updated_at'])
                provider_wallet = reconcile_wallet_balance(provider_wallet)
            client_wallet.balance += booking.amount
            client_wallet.save(update_fields=['balance', 'updated_at'])
            Transaction.objects.create(
                wallet=client_wallet,
                booking=booking,
                type='refund',
                amount=booking.amount,
                description=f'Refund approved for booking #{booking.pk}',
            )
            client_wallet = reconcile_wallet_balance(client_wallet)
            booking.refund_status = 'approved'
            booking.payment_status = 'refunded'
            booking.status = 'cancelled'
            booking.save(update_fields=['refund_status', 'payment_status', 'status'])
            create_notification(
                booking.client,
                'Refund approved',
                f'{booking.amount} XAF has been returned to your wallet for {booking.service.title}.',
                detail=f'Booking #{booking.pk}',
                icon='refresh-circle-outline',
                tone='success',
            )
        return Response(BookingSerializer(booking).data)


class AdminEscrowListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        auto_release_due_escrows()
        bookings = Booking.objects.filter(payment_status='escrowed').select_related('service__provider', 'client').order_by('-created_at')
        return Response(BookingSerializer(bookings, many=True).data)


class AdminEscrowReleaseView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        try:
            booking = Booking.objects.select_related('service__provider', 'client').get(pk=pk, payment_status='escrowed')
        except Booking.DoesNotExist:
            return Response({'error': 'Escrow booking not found'}, status=status.HTTP_404_NOT_FOUND)
        if booking.refund_status == 'requested' and request.data.get('force') != True:
            return Response({'error': 'This escrow has a reported issue. Resolve the dispute or send force=true to release.'}, status=status.HTTP_400_BAD_REQUEST)
        if booking.refund_status == 'requested':
            booking.refund_status = 'rejected'
            booking.issue_reported_at = None
            booking.save(update_fields=['refund_status', 'issue_reported_at'])
        try:
            booking, _ = release_escrow(booking, reason='admin_release')
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(BookingSerializer(booking).data)
