from rest_framework import serializers
from django.db.models import Avg, Q
from .models import Service, ServiceReview


class ServiceReviewSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    client_photo = serializers.ImageField(source='client.profile_photo', read_only=True)
    service_title = serializers.CharField(source='service.title', read_only=True)

    class Meta:
        model = ServiceReview
        fields = [
            'id', 'service', 'booking', 'client', 'client_name', 'client_photo',
            'provider', 'service_title', 'rating', 'comment', 'created_at',
        ]
        read_only_fields = ['service', 'client', 'provider', 'created_at']

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError('Rating must be between 1 and 5.')
        return value

class ServiceSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source='provider.full_name', read_only=True)
    provider_photo = serializers.ImageField(source='provider.profile_photo', read_only=True)
    provider_last_seen = serializers.DateTimeField(source='provider.last_seen', read_only=True, allow_null=True)
    provider_badge_verification_status = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    booking_count = serializers.SerializerMethodField()
    completed_booking_count = serializers.SerializerMethodField()

    def get_average_rating(self, obj):
        value = obj.reviews.aggregate(avg=Avg('rating'))['avg']
        return round(value, 1) if value is not None else None

    def get_review_count(self, obj):
        return obj.reviews.count()

    def get_booking_count(self, obj):
        return obj.bookings.count()

    def get_completed_booking_count(self, obj):
        return obj.bookings.filter(
            Q(status='completed') | Q(client_confirmed_at__isnull=False) | Q(payment_status='released')
        ).count()

    def get_provider_badge_verification_status(self, obj):
        profile = getattr(obj.provider, 'provider_profile', None)
        return getattr(profile, 'badge_verification_status', 'not_verified')

    class Meta:
        model = Service
        fields = [
            'id', 'provider', 'provider_name', 'provider_photo', 'provider_last_seen',
            'provider_badge_verification_status', 'title', 'description',
            'category', 'price', 'address', 'latitude', 'longitude',
            'image', 'is_available', 'average_rating', 'review_count',
            'booking_count', 'completed_booking_count', 'created_at'
        ]
        read_only_fields = ['provider', 'created_at']
