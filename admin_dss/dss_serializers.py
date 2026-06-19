from rest_framework import serializers
from .models import ProviderScore, ProviderReport, Review, BatchVerification
from django.contrib.auth import get_user_model

User = get_user_model()


class ProviderScoreSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source='provider.full_name', read_only=True)
    provider_email = serializers.CharField(source='provider.email', read_only=True)
    provider_id = serializers.IntegerField(source='provider.id', read_only=True)
    batch_eligibility = serializers.SerializerMethodField()
    badge_eligibility = serializers.SerializerMethodField()

    class Meta:
        model = ProviderScore
        fields = '__all__'

    def get_batch_eligibility(self, obj):
        return {
            'eligible': obj.batch_eligible,
            'manual_override': obj.batch_eligible_override,
            'activity_ok': obj.activity_score >= 50,
            'reliability_ok': obj.reliability_score >= 50,
            'quality_ok': obj.quality_score >= 50,
            'trust_ok': obj.trust_score >= 100 and obj.total_complaints == 0 and obj.is_kyc_verified,
            'kyc_approved': obj.is_kyc_verified,
            'requirements': (
                'Activity, Reliability & Quality >= 50%; Trust = 100% from approved KYC; no active complaints'
            ),
        }

    def get_badge_eligibility(self, obj):
        from .models import badge_eligibility_debug
        debug = badge_eligibility_debug(obj)
        return {
            **debug,
            'requirements': (
                'Activity, Reliability & Quality >= 50%; Trust = 100% (approved KYC)'
            ),
        }


class ProviderReportSerializer(serializers.ModelSerializer):
    reporter_name = serializers.CharField(source='reporter.full_name', read_only=True)
    provider_name = serializers.CharField(
        source='reported_provider.full_name', read_only=True
    )

    class Meta:
        model = ProviderReport
        fields = '__all__'
        read_only_fields = ['reporter', 'status', 'admin_note']


class ReviewSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    provider_name = serializers.CharField(source='provider.full_name', read_only=True)

    class Meta:
        model = Review
        fields = '__all__'
        read_only_fields = ['client', 'provider']


class BatchEligibleProviderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    user = serializers.DictField()
    business_name = serializers.CharField()
    address = serializers.CharField(allow_blank=True)
    kyc_status = serializers.CharField()
    id_front = serializers.CharField(allow_null=True)
    id_back = serializers.CharField(allow_null=True)
    selfie = serializers.CharField(allow_null=True)
    batch_eligible = serializers.BooleanField()
    activity_score = serializers.FloatField()
    reliability_score = serializers.FloatField()
    quality_score = serializers.FloatField()
    trust_score = serializers.FloatField()
    overall_score = serializers.FloatField()
    fraud_risk_level = serializers.CharField()


class BatchVerificationSerializer(serializers.ModelSerializer):
    admin_name = serializers.CharField(source='admin.full_name', read_only=True)

    class Meta:
        model = BatchVerification
        fields = '__all__'
