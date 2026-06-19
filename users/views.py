import secrets
import hashlib
import os
from decimal import Decimal
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework_simplejwt.tokens import RefreshToken
from wallet.models import Transaction, Wallet
from .models import EmailVerificationCode, Notification, ProviderProfile, User
from .serializers import (
    BADGE_FEE,
    ChangePasswordSerializer,
    KYCStatusSerializer,
    KYCUploadSerializer,
    NotificationSerializer,
    ProviderProfileSerializer,
    RegisterSerializer,
    UserSerializer,
)


def issue_tokens(user):
    user.last_seen = timezone.now()
    user.save(update_fields=['last_seen'])
    refresh = RefreshToken.for_user(user)
    return {
        'user': UserSerializer(user).data,
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


def send_email_2fa_code(user, purpose):
    EmailVerificationCode.objects.filter(user=user, purpose=purpose, is_used=False).update(is_used=True)
    code = f'{secrets.randbelow(1000000):06d}'
    code_fingerprint = hashlib.sha256(f'{settings.SECRET_KEY}:{code}'.encode()).hexdigest()
    while EmailVerificationCode.objects.filter(code_fingerprint=code_fingerprint).exists():
        code = f'{secrets.randbelow(1000000):06d}'
        code_fingerprint = hashlib.sha256(f'{settings.SECRET_KEY}:{code}'.encode()).hexdigest()
    challenge = EmailVerificationCode.objects.create(
        user=user,
        code_hash=make_password(code),
        code_fingerprint=code_fingerprint,
        purpose=purpose,
        expires_at=timezone.now() + timedelta(minutes=10),
    )
    send_mail(
        subject='Your Servista verification code',
        message=f'Your Servista verification code is {code}. It expires in 10 minutes.',
        from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@servista.local'),
        recipient_list=[user.email],
        fail_silently=True,
    )
    data = {
        'requires_2fa': True,
        'challenge_id': str(challenge.challenge_id),
        'email': user.email,
        'message': 'A 6 digit verification code has been sent to your email.',
    }
    return data


def get_badge_dss_stats(user):
    from admin_dss.dss_engine import calculate_provider_score
    score = calculate_provider_score(user.id)
    if not score:
        return {
            'activity_percentage': 0,
            'reliability_percentage': 0,
            'quality_percentage': 0,
            'trust_percentage': 0,
        }
    return {
        'activity_percentage': score.activity_score,
        'reliability_percentage': score.reliability_score,
        'quality_percentage': score.quality_score,
        'trust_percentage': score.trust_score,
    }


def provider_is_badge_eligible(profile):
    from admin_dss.dss_engine import calculate_provider_score
    if profile.badge_verification_status == 'verified':
        return False, get_badge_dss_stats(profile.user)
    if profile.badge_verification_status != 'eligible':
        return False, get_badge_dss_stats(profile.user)
    score = calculate_provider_score(profile.user.id)
    stats = get_badge_dss_stats(profile.user)
    if not score:
        return False, stats
    return score.badge_eligible, stats


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response(send_email_2fa_code(user, 'register'), status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email')
        password = request.data.get('password')
        user = authenticate(request, email=email, password=password)
        if user:
            if user.role == 'admin':
                return Response(issue_tokens(user))
            return Response(send_email_2fa_code(user, 'login'))
        return Response({'error': 'Invalid email or password'}, status=status.HTTP_401_UNAUTHORIZED)


class VerifyEmailCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        challenge_id = request.data.get('challenge_id')
        code = str(request.data.get('code', '')).strip()
        if not challenge_id or not code:
            return Response({'error': 'Verification challenge and code are required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            challenge = EmailVerificationCode.objects.select_related('user').get(challenge_id=challenge_id, is_used=False)
        except EmailVerificationCode.DoesNotExist:
            return Response({'error': 'Invalid or expired verification challenge'}, status=status.HTTP_400_BAD_REQUEST)
        if challenge.is_expired:
            challenge.is_used = True
            challenge.save(update_fields=['is_used'])
            return Response({'error': 'Verification code has expired. Please sign in again.'}, status=status.HTTP_400_BAD_REQUEST)
        if not check_password(code, challenge.code_hash):
            return Response({'error': 'Invalid verification code'}, status=status.HTTP_400_BAD_REQUEST)
        challenge.is_used = True
        challenge.save(update_fields=['is_used'])
        return Response(issue_tokens(challenge.user))


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def put(self, request):
        old_photo_path = request.user.profile_photo.path if request.user.profile_photo and 'profile_photo' in request.FILES else None
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            save_kwargs = {}
            if 'profile_photo' in request.FILES:
                save_kwargs['profile_photo_updated_at'] = timezone.now()
            user = serializer.save(**save_kwargs)
            if old_photo_path and user.profile_photo and old_photo_path != user.profile_photo.path and os.path.exists(old_photo_path):
                os.remove(old_photo_path)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request):
        return self.put(request)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            request.user.set_password(serializer.validated_data['new_password'])
            request.user.save()
            return Response({'message': 'Password changed successfully'})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class HeartbeatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.last_seen = timezone.now()
        request.user.save(update_fields=['last_seen'])
        return Response({'last_seen': request.user.last_seen})


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = request.user.notifications.filter(is_cleared=False)
        return Response(NotificationSerializer(notifications, many=True).data)


class NotificationClearView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.notifications.filter(is_cleared=False).update(is_cleared=True, is_read=True)
        return Response({'message': 'Notifications cleared'})


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.notifications.filter(is_cleared=False, is_read=False).update(is_read=True)
        return Response({'message': 'Notifications marked as read'})


class ProviderProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            profile = request.user.provider_profile
        except ProviderProfile.DoesNotExist:
            return Response({'error': 'Provider profile not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProviderProfileSerializer(profile).data)

    def post(self, request):
        if request.user.role != 'provider':
            return Response({'error': 'Only providers can manage a provider profile'}, status=status.HTTP_403_FORBIDDEN)
        profile = ProviderProfile.objects.filter(user=request.user).first()
        serializer = ProviderProfileSerializer(profile, data=request.data, partial=profile is not None, context={'request': request})
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_200_OK if profile else status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProviderKYCView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'provider':
            return Response({'error': 'Only providers can upload KYC documents'}, status=status.HTTP_403_FORBIDDEN)
        try:
            profile = request.user.provider_profile
        except ProviderProfile.DoesNotExist:
            return Response({'error': 'Create a provider profile before uploading KYC documents'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = KYCUploadSerializer(profile, data=request.data, partial=True)
        if serializer.is_valid():
            if profile.kyc_status == 'approved':
                return Response(
                    {'error': 'KYC is already approved. Contact admin if your verification needs to be reviewed again.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if profile.kyc_status == 'pending' and profile.id_front:
                return Response(
                    {'error': 'Your KYC documents are already under admin review.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            serializer.save(kyc_status='pending')
            return Response(ProviderProfileSerializer(profile).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProviderBadgePurchaseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'provider':
            return Response({'error': 'Only providers can buy trust badge verification'}, status=status.HTTP_403_FORBIDDEN)
        try:
            profile = request.user.provider_profile
        except ProviderProfile.DoesNotExist:
            return Response({'error': 'Create a provider profile before buying badge verification'}, status=status.HTTP_400_BAD_REQUEST)
        if profile.badge_verification_status == 'verified':
            return Response({'error': 'Your Servista trust badge is already active'}, status=status.HTTP_400_BAD_REQUEST)
        eligible, stats = provider_is_badge_eligible(profile)
        if not eligible:
            return Response({
                'error': 'Admin approval is required before buying badge verification',
                'requirements': {
                    'activity_percentage': '>= 50',
                    'reliability_percentage': '>= 50',
                    'quality_percentage': '>= 50',
                    'trust_percentage': '100 (requires approved KYC)',
                    'admin_validation': 'required',
                },
                'current_stats': stats,
            }, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            wallet, _ = Wallet.objects.select_for_update().get_or_create(user=request.user)
            fee = Decimal(str(BADGE_FEE))
            if wallet.balance < fee:
                return Response({
                    'error': 'Insufficient wallet balance for badge verification',
                    'badge_fee': BADGE_FEE,
                    'wallet_balance': float(wallet.balance),
                }, status=status.HTTP_400_BAD_REQUEST)
            wallet.balance -= fee
            wallet.save(update_fields=['balance', 'updated_at'])
            Transaction.objects.create(
                wallet=wallet,
                type='payment',
                amount=fee,
                description='Servista trust badge verification fee',
            )
            profile.badge_verification_status = 'verified'
            profile.badge_verified_at = timezone.now()
            profile.save(update_fields=['badge_verification_status', 'badge_verified_at'])
            Notification.objects.create(
                user=request.user,
                title='Trust badge activated',
                message='Your Servista trust badge is now active on your profile.',
                detail='Payment was successful. Clients will now see your verified trust badge on your provider profile.',
                icon='shield-checkmark-outline',
                tone='success',
            )
        return Response(ProviderProfileSerializer(profile).data)


class ApprovedProviderListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        profiles = ProviderProfile.objects.filter(kyc_status='approved').select_related('user')
        return Response(ProviderProfileSerializer(profiles, many=True).data)


class AdminUserListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        return Response(UserSerializer(User.objects.all(), many=True).data)


class AdminPendingKYCListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        providers_without_profiles = User.objects.filter(role='provider', provider_profile__isnull=True)
        for provider in providers_without_profiles:
            ProviderProfile.objects.create(
                user=provider,
                business_name=provider.full_name or provider.email,
            )
        profiles = ProviderProfile.objects.filter(kyc_status='pending').select_related('user')
        return Response(ProviderProfileSerializer(profiles, many=True).data)


class AdminKYCUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, provider_id):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        try:
            profile = ProviderProfile.objects.select_related('user').get(user_id=provider_id)
        except ProviderProfile.DoesNotExist:
            return Response({'error': 'Provider profile not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = KYCStatusSerializer(profile, data=request.data)
        if serializer.is_valid():
            was_approved = profile.kyc_status == 'approved'
            updated_profile = serializer.save()
            if updated_profile.kyc_status == 'approved':
                Notification.objects.create(
                    user=profile.user,
                    title='KYC approved',
                    message='Your provider KYC verification has been approved.',
                    detail='Your KYC documents have been reviewed and approved by Servista admin. Your provider wallet actions and verified provider access are now available.',
                    icon='shield-checkmark-outline',
                    tone='success',
                )
            elif updated_profile.kyc_status == 'rejected':
                Notification.objects.create(
                    user=profile.user,
                    title='KYC rejected' if not was_approved else 'KYC verification revoked',
                    message='Your provider KYC verification was rejected.' if not was_approved else 'Admin has revoked your KYC verification.',
                    detail='Servista admin rejected your KYC verification. Please review your provider profile and upload clear, valid identity documents before submitting again.' if not was_approved else 'Your KYC approval was cancelled by admin. Please submit your verification documents again from Account → KYC Status.',
                    icon='close-circle-outline',
                    tone='danger',
                )
            from admin_dss.dss_engine import calculate_provider_score
            calculate_provider_score(provider_id)
            return Response(ProviderProfileSerializer(profile).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminBadgeUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, provider_id):
        if request.user.role != 'admin':
            return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)
        try:
            profile = ProviderProfile.objects.select_related('user').get(user_id=provider_id)
        except ProviderProfile.DoesNotExist:
            return Response({'error': 'Provider profile not found'}, status=status.HTTP_404_NOT_FOUND)

        decision = request.data.get('status')
        if decision not in ('approved', 'rejected'):
            return Response({'error': 'status must be approved or rejected'}, status=status.HTTP_400_BAD_REQUEST)

        if decision == 'approved':
            profile.badge_verification_status = 'eligible'
            profile.badge_verified_at = None
            profile.save(update_fields=['badge_verification_status', 'badge_verified_at'])
            Notification.objects.create(
                user=profile.user,
                title='Trust badge eligibility approved',
                message='You are now eligible to buy the Servista trust badge.',
                detail='Admin reviewed your DSS scores and approved you for badge purchase. Open Account Settings > Badge Status and pay the 15,000 FCFA badge fee to activate it.',
                icon='ribbon-outline',
                tone='success',
            )
        else:
            profile.badge_verification_status = 'not_verified'
            profile.badge_verified_at = None
            profile.save(update_fields=['badge_verification_status', 'badge_verified_at'])
            Notification.objects.create(
                user=profile.user,
                title='Trust badge not approved',
                message='Your trust badge verification request was not approved.',
                detail='An admin reviewed your provider profile and did not approve the trust badge at this time. Continue building your service quality and try again later.',
                icon='close-circle-outline',
                tone='warning',
            )

        from admin_dss.dss_engine import calculate_provider_score
        calculate_provider_score(provider_id)
        return Response(ProviderProfileSerializer(profile).data)
