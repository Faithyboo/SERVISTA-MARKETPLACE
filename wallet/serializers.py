from rest_framework import serializers
from .models import Transaction, Wallet


class TransactionSerializer(serializers.ModelSerializer):
    booking_payment_status = serializers.CharField(source='booking.payment_status', read_only=True)
    booking_status = serializers.CharField(source='booking.status', read_only=True)

    class Meta:
        model = Transaction
        fields = [
            'id', 'booking', 'booking_status', 'booking_payment_status',
            'type', 'amount', 'description', 'created_at',
        ]


class WalletSerializer(serializers.ModelSerializer):
    transactions = TransactionSerializer(many=True, read_only=True)
    provider_kyc_status = serializers.SerializerMethodField()
    provider_wallet_locked = serializers.SerializerMethodField()
    pin_is_set = serializers.SerializerMethodField()
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_role = serializers.CharField(source='user.role', read_only=True)

    class Meta:
        model = Wallet
        fields = [
            'id', 'balance', 'updated_at', 'transactions',
            'provider_kyc_status', 'provider_wallet_locked',
            'pin_is_set', 'pin_required_for_access', 'pin_reset_status', 'pin_reset_requested_at',
            'user_name', 'user_email', 'user_role',
        ]

    def get_provider_kyc_status(self, wallet):
        if wallet.user.role != 'provider':
            return None
        profile = getattr(wallet.user, 'provider_profile', None)
        return getattr(profile, 'kyc_status', 'pending')

    def get_provider_wallet_locked(self, wallet):
        if wallet.user.role != 'provider':
            return False
        return self.get_provider_kyc_status(wallet) != 'approved'

    def get_pin_is_set(self, wallet):
        return bool(wallet.pin_hash)


class TopUpSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('Amount must be greater than zero.')
        return value


class WalletPinSerializer(serializers.Serializer):
    pin = serializers.CharField(max_length=4)
    current_pin = serializers.CharField(max_length=4, required=False, allow_blank=True)

    def validate_pin(self, value):
        if not value.isdigit() or len(value) != 4:
            raise serializers.ValidationError('PIN must be exactly 4 digits.')
        return value

    def validate_current_pin(self, value):
        if value and (not value.isdigit() or len(value) != 4):
            raise serializers.ValidationError('Current PIN must be exactly 4 digits.')
        return value


class WalletPinResetDecisionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['approved', 'rejected'])
