from django.contrib import admin
from .models import ProviderScore, ProviderReport, Review, BatchVerification


@admin.register(ProviderScore)
class ProviderScoreAdmin(admin.ModelAdmin):
    list_display = ['provider', 'overall_score', 'fraud_risk_level', 'batch_eligible', 'badge_eligible', 'last_calculated']
    list_filter = ['fraud_risk_level', 'batch_eligible', 'batch_eligible_override', 'badge_eligible']
    search_fields = ['provider__full_name']


@admin.register(ProviderReport)
class ProviderReportAdmin(admin.ModelAdmin):
    list_display = ['reported_provider', 'reason', 'status', 'created_at']
    list_filter = ['status', 'reason']


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ['client', 'provider', 'rating', 'created_at']
    list_filter = ['rating']


@admin.register(BatchVerification)
class BatchVerificationAdmin(admin.ModelAdmin):
    list_display = ['batch_id', 'admin', 'status', 'total_providers', 'created_at']
