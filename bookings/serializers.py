from rest_framework import serializers
from .models import Booking


class BookingSerializer(serializers.ModelSerializer):
    service_title = serializers.CharField(source='service.title', read_only=True)
    service_address = serializers.CharField(source='service.address', read_only=True)
    service_latitude = serializers.FloatField(source='service.latitude', read_only=True, allow_null=True)
    service_longitude = serializers.FloatField(source='service.longitude', read_only=True, allow_null=True)
    provider = serializers.IntegerField(source='service.provider_id', read_only=True)
    provider_name = serializers.CharField(source='service.provider.full_name', read_only=True)
    provider_photo = serializers.ImageField(source='service.provider.profile_photo', read_only=True)
    provider_last_seen = serializers.DateTimeField(source='service.provider.last_seen', read_only=True, allow_null=True)
    provider_badge_verification_status = serializers.SerializerMethodField()
    provider_city_area = serializers.SerializerMethodField()
    provider_exact_address = serializers.SerializerMethodField()
    provider_latitude = serializers.SerializerMethodField()
    provider_longitude = serializers.SerializerMethodField()
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    client_photo = serializers.ImageField(source='client.profile_photo', read_only=True)
    client_last_seen = serializers.DateTimeField(source='client.last_seen', read_only=True, allow_null=True)
    is_paid = serializers.SerializerMethodField()
    has_review = serializers.SerializerMethodField()

    def get_is_paid(self, obj):
        from wallet.models import Transaction
        return obj.payment_status in {'escrowed', 'released'} or Transaction.objects.filter(booking=obj, type='payment', wallet__user=obj.client).exists()

    def get_has_review(self, obj):
        return hasattr(obj, 'review')

    def get_provider_badge_verification_status(self, obj):
        profile = getattr(obj.service.provider, 'provider_profile', None)
        return getattr(profile, 'badge_verification_status', 'not_verified')

    def get_provider_profile(self, obj):
        return getattr(obj.service.provider, 'provider_profile', None)

    def get_provider_city_area(self, obj):
        profile = self.get_provider_profile(obj)
        return getattr(profile, 'city_area', '') or ''

    def get_provider_exact_address(self, obj):
        profile = self.get_provider_profile(obj)
        return getattr(profile, 'address', '') or ''

    def get_provider_latitude(self, obj):
        profile = self.get_provider_profile(obj)
        return getattr(profile, 'latitude', None)

    def get_provider_longitude(self, obj):
        profile = self.get_provider_profile(obj)
        return getattr(profile, 'longitude', None)

    class Meta:
        model = Booking
        fields = [
            'id', 'client', 'client_name', 'service', 'service_title',
            'service_address', 'service_latitude', 'service_longitude',
            'provider', 'provider_name', 'provider_photo', 'provider_last_seen',
            'provider_badge_verification_status', 'provider_city_area',
            'provider_exact_address', 'provider_latitude', 'provider_longitude',
            'client_photo', 'client_last_seen',
            'status', 'payment_status', 'refund_status', 'refund_requested_at',
            'provider_marked_completed_at', 'client_confirmed_at', 'issue_reported_at',
            'escrow_released_at', 'platform_fee',
            'address', 'scheduled_at', 'amount', 'notes', 'is_paid', 'has_review', 'created_at',
        ]
        read_only_fields = [
            'client', 'status', 'payment_status', 'refund_status', 'refund_requested_at',
            'provider_marked_completed_at', 'client_confirmed_at', 'issue_reported_at',
            'escrow_released_at', 'platform_fee', 'amount', 'created_at',
        ]


class BookingStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = ['status']
