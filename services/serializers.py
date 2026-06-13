from rest_framework import serializers
from .models import Service

class ServiceSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source='provider.full_name', read_only=True)
    provider_photo = serializers.ImageField(source='provider.profile_photo', read_only=True)
    provider_last_seen = serializers.DateTimeField(source='provider.last_seen', read_only=True, allow_null=True)

    class Meta:
        model = Service
        fields = [
            'id', 'provider', 'provider_name', 'provider_photo', 'provider_last_seen', 'title', 'description',
            'category', 'price', 'address', 'latitude', 'longitude',
            'image', 'is_available', 'created_at'
        ]
        read_only_fields = ['provider', 'created_at']
