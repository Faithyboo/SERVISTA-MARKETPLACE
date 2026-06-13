import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from .models import EmailVerificationCode, Notification, ProviderProfile, User
from .serializers import (
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
    challenge = EmailVerificationCode.objects.create(
        user=user,
        code_hash=make_password(code),
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
    if settings.DEBUG:
        data['dev_code'] = code
    return data


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
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
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
        serializer = ProviderProfileSerializer(profile, data=request.data, partial=profile is not None)
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
            serializer.save(kyc_status='pending')
            return Response(ProviderProfileSerializer(profile).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


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
                    title='KYC rejected',
                    message='Your provider KYC verification was rejected.',
                    detail='Servista admin rejected your KYC verification. Please review your provider profile and upload clear, valid identity documents before submitting again.',
                    icon='close-circle-outline',
                    tone='danger',
                )
            return Response(ProviderProfileSerializer(profile).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
