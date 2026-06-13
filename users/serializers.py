from rest_framework import serializers
from .models import Notification, ProviderProfile, User

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'phone', 'role', 'password']

    def validate_role(self, value):
        if value == 'admin':
            raise serializers.ValidationError('Admin accounts cannot be created through registration.')
        return value

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'phone', 'role', 'profile_photo', 'last_seen', 'created_at']
        read_only_fields = ['role', 'last_seen', 'created_at']


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

    class Meta:
        model = ProviderProfile
        fields = [
            'id', 'user', 'business_name', 'bio', 'address', 'latitude',
            'longitude', 'kyc_status', 'id_front', 'id_back', 'selfie',
            'created_at',
        ]
        read_only_fields = ['kyc_status', 'created_at']


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
