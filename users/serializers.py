from rest_framework import serializers
from .models import Notification, ProviderProfile, User

BADGE_FEE = 15000
BADGE_MIN_RATING = 4.5
BADGE_MIN_REVIEWS = 3
BADGE_MIN_COMPLETED_JOBS = 5

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'phone', 'city_area', 'address', 'role', 'password']

    def validate_role(self, value):
        if value == 'admin':
            raise serializers.ValidationError('Admin accounts cannot be created through registration.')
        return value

    def validate(self, attrs):
        role = attrs.get('role') or 'client'
        if role == 'client' and not str(attrs.get('city_area') or '').strip():
            raise serializers.ValidationError({'city_area': 'City/Area is required for client accounts.'})
        return attrs

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'phone', 'city_area', 'address', 'role', 'profile_photo', 'profile_photo_updated_at', 'last_seen', 'created_at']
        read_only_fields = ['role', 'profile_photo_updated_at', 'last_seen', 'created_at']


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)
    confirm_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'New passwords do not match.'})
        return attrs


class ProviderProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    badge_fee = serializers.SerializerMethodField()
    badge_average_rating = serializers.SerializerMethodField()
    badge_review_count = serializers.SerializerMethodField()
    badge_completed_jobs = serializers.SerializerMethodField()
    badge_activity_percentage = serializers.SerializerMethodField()
    badge_reliability_percentage = serializers.SerializerMethodField()
    badge_quality_percentage = serializers.SerializerMethodField()
    badge_trust_percentage = serializers.SerializerMethodField()
    badge_is_eligible = serializers.SerializerMethodField()
    badge_eligibility_message = serializers.SerializerMethodField()

    def get_badge_stats(self, obj):
        if hasattr(obj, '_badge_stats'):
            return obj._badge_stats
        from django.db.models import Avg, Q
        from bookings.models import Booking
        from services.models import ServiceReview

        review_qs = ServiceReview.objects.filter(provider=obj.user)
        average_rating = review_qs.aggregate(avg=Avg('rating'))['avg'] or 0
        review_count = review_qs.count()
        completed_jobs = Booking.objects.filter(
            service__provider=obj.user
        ).filter(
            Q(status='completed') | Q(client_confirmed_at__isnull=False) | Q(payment_status='released')
        ).count()
        obj._badge_stats = {
            'average_rating': round(float(average_rating), 1),
            'review_count': review_count,
            'completed_jobs': completed_jobs,
        }
        return obj._badge_stats

    def get_badge_fee(self, obj):
        return BADGE_FEE

    def get_badge_average_rating(self, obj):
        return self.get_badge_stats(obj)['average_rating']

    def get_badge_review_count(self, obj):
        return self.get_badge_stats(obj)['review_count']

    def get_badge_completed_jobs(self, obj):
        return self.get_badge_stats(obj)['completed_jobs']

    def get_badge_dss_stats(self, obj):
        if hasattr(obj, '_badge_dss_stats'):
            return obj._badge_dss_stats
        from admin_dss.dss_engine import calculate_provider_score
        score = calculate_provider_score(obj.user_id)
        if not score:
            obj._badge_dss_stats = {
                'activity_percentage': 0,
                'reliability_percentage': 0,
                'quality_percentage': 0,
                'trust_percentage': 0,
            }
        else:
            obj._badge_dss_stats = {
                'activity_percentage': score.activity_score,
                'reliability_percentage': score.reliability_score,
                'quality_percentage': score.quality_score,
                'trust_percentage': score.trust_score,
            }
        return obj._badge_dss_stats

    def get_badge_activity_percentage(self, obj):
        return self.get_badge_dss_stats(obj)['activity_percentage']

    def get_badge_reliability_percentage(self, obj):
        return self.get_badge_dss_stats(obj)['reliability_percentage']

    def get_badge_quality_percentage(self, obj):
        return self.get_badge_dss_stats(obj)['quality_percentage']

    def get_badge_trust_percentage(self, obj):
        return self.get_badge_dss_stats(obj)['trust_percentage']

    def get_badge_is_eligible(self, obj):
        if obj.badge_verification_status == 'verified':
            return False
        if obj.badge_verification_status != 'eligible':
            return False
        from admin_dss.dss_engine import calculate_provider_score
        score = calculate_provider_score(obj.user_id)
        return bool(score and score.badge_eligible)

    def get_badge_eligibility_message(self, obj):
        if obj.badge_verification_status == 'verified':
            return 'Your Servista trust badge is active.'
        if obj.badge_verification_status == 'eligible':
            return f'Admin approved your badge purchase. Pay {BADGE_FEE:,} FCFA from your wallet to activate your trust badge.'
        dss = self.get_badge_dss_stats(obj)
        missing = []
        if obj.kyc_status != 'approved':
            missing.append('approved KYC (trust must reach 100%)')
        if dss['activity_percentage'] < 50:
            missing.append('activity score at least 50%')
        if dss['reliability_percentage'] < 50:
            missing.append('reliability score at least 50%')
        if dss['quality_percentage'] < 50:
            missing.append('quality score at least 50%')
        if dss['trust_percentage'] < 100:
            missing.append('trust score at 100%')
        if missing:
            return 'To qualify, you need ' + ', '.join(missing) + '.'
        return 'You meet the DSS score criteria. Admin must approve your badge eligibility before purchase.'

    def validate(self, attrs):
        request = self.context.get('request')
        is_provider_self_save = bool(request and getattr(request.user, 'role', None) == 'provider')
        is_new_profile = self.instance is None
        location_was_submitted = 'city_area' in getattr(self, 'initial_data', {})

        if is_provider_self_save and (is_new_profile or location_was_submitted):
            city_area = attrs.get('city_area', getattr(self.instance, 'city_area', ''))
            if not str(city_area or '').strip():
                raise serializers.ValidationError({'city_area': 'City/Area is required for provider profiles.'})

        return attrs

    class Meta:
        model = ProviderProfile
        fields = [
            'id', 'user', 'business_name', 'bio', 'city_area', 'address', 'latitude',
            'longitude', 'kyc_status', 'id_front', 'id_back', 'selfie',
            'badge_verification_status', 'badge_verified_at', 'badge_fee',
            'badge_average_rating', 'badge_review_count', 'badge_completed_jobs',
            'badge_activity_percentage', 'badge_reliability_percentage',
            'badge_quality_percentage', 'badge_trust_percentage',
            'badge_is_eligible', 'badge_eligibility_message', 'created_at',
        ]
        read_only_fields = [
            'kyc_status', 'badge_verification_status', 'badge_verified_at',
            'badge_fee', 'badge_average_rating', 'badge_review_count',
            'badge_completed_jobs', 'badge_activity_percentage',
            'badge_reliability_percentage', 'badge_quality_percentage',
            'badge_trust_percentage', 'badge_is_eligible', 'badge_eligibility_message',
            'created_at',
        ]


class KYCUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProviderProfile
        fields = ['id_front', 'id_back', 'selfie']


class KYCStatusSerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(source='kyc_status', choices=['approved', 'rejected'])

    class Meta:
        model = ProviderProfile
        fields = ['status']


class NotificationSerializer(serializers.ModelSerializer):
    time = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'detail', 'icon', 'tone', 'is_read', 'time']
