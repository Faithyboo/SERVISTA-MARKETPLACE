from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class ProviderScore(models.Model):
    """Stores the AI-calculated scores for each provider"""
    provider = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='dss_score'
    )
    # Activity Score
    total_bookings = models.IntegerField(default=0)
    jobs_accepted = models.IntegerField(default=0)
    jobs_rejected = models.IntegerField(default=0)
    jobs_cancelled = models.IntegerField(default=0)
    jobs_completed = models.IntegerField(default=0)
    activity_score = models.FloatField(default=0.0)
    # Quality Score
    average_rating = models.FloatField(default=0.0)
    total_reviews = models.IntegerField(default=0)
    satisfaction_rate = models.FloatField(default=0.0)
    repeat_customers = models.IntegerField(default=0)
    quality_score = models.FloatField(default=0.0)
    # Reliability Score
    avg_response_time_minutes = models.FloatField(default=0.0)
    attendance_rate = models.FloatField(default=0.0)
    completion_rate = models.FloatField(default=0.0)
    reliability_score = models.FloatField(default=0.0)
    # Trust Score
    is_kyc_verified = models.BooleanField(default=False)
    total_complaints = models.IntegerField(default=0)
    trust_score = models.FloatField(default=0.0)
    # Overall + Fraud
    overall_score = models.FloatField(default=0.0)
    fraud_risk_points = models.IntegerField(default=0)
    fraud_risk_level = models.CharField(
        max_length=10,
        choices=[('LOW', 'Low Risk'), ('MEDIUM', 'Medium Risk'), ('HIGH', 'High Risk')],
        default='LOW'
    )
    fraud_flags = models.JSONField(default=list)
    batch_eligible = models.BooleanField(default=False)
    batch_eligible_override = models.BooleanField(
        default=False,
        help_text='Admin manually approved this provider for trust badge purchase eligibility.',
    )
    badge_eligible = models.BooleanField(default=False)
    last_calculated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.provider.full_name} - {self.fraud_risk_level}'


def badge_eligibility_check(activity, reliability, quality, trust, is_kyc_verified=False):
    """Badge verification requires strong DSS scores and full trust from approved KYC."""
    if not is_kyc_verified:
        return False
    return (
        activity >= 50 and
        reliability >= 50 and
        quality >= 50 and
        trust >= 100
    )


def badge_eligibility_debug(score):
    """Return per-metric pass/fail details for badge eligibility debugging."""
    activity_ok = score.activity_score >= 50
    reliability_ok = score.reliability_score >= 50
    quality_ok = score.quality_score >= 50
    trust_ok = score.is_kyc_verified and score.trust_score >= 100
    eligible = badge_eligibility_check(
        score.activity_score,
        score.reliability_score,
        score.quality_score,
        score.trust_score,
        is_kyc_verified=score.is_kyc_verified,
    )
    return {
        'activity_percentage': score.activity_score,
        'reliability_percentage': score.reliability_score,
        'quality_percentage': score.quality_score,
        'trust_percentage': score.trust_score,
        'activity_ok': activity_ok,
        'reliability_ok': reliability_ok,
        'quality_ok': quality_ok,
        'trust_ok': trust_ok,
        'kyc_verified': score.is_kyc_verified,
        'eligible': eligible,
    }

def batch_eligibility_check(
    activity, reliability, quality, trust,
    is_kyc_verified=False, total_complaints=0,
):
    """
    Legacy batch gate used by older screens. Current trust-badge approval uses
    badge_eligibility_check because Trust must be 100% from approved KYC.
    """
    return (
        activity >= 50 and
        reliability >= 50 and
        quality >= 50 and
        total_complaints == 0 and
        trust >= 100 and
        is_kyc_verified
    )


class ProviderReport(models.Model):
    """Stores reports filed against providers by clients"""
    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('investigating', 'Under Investigation'),
        ('resolved', 'Resolved'),
        ('dismissed', 'Dismissed'),
    ]
    REASON_CHOICES = [
        ('no_show', 'Provider did not show up'),
        ('poor_quality', 'Poor quality of work'),
        ('fraud', 'Suspected fraud or scam'),
        ('overcharging', 'Overcharged beyond agreed price'),
        ('fake_reviews', 'Suspected fake reviews'),
        ('other', 'Other reason'),
    ]
    reporter = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='filed_reports'
    )
    reported_provider = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='received_reports'
    )
    booking = models.ForeignKey(
        'bookings.Booking', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reports'
    )
    reason = models.CharField(max_length=30, choices=REASON_CHOICES)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    admin_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Report against {self.reported_provider.full_name} - {self.status}'


class Review(models.Model):
    """Client reviews for completed bookings"""
    client = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='given_reviews'
    )
    provider = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='received_reviews'
    )
    booking = models.OneToOneField(
        'bookings.Booking', on_delete=models.CASCADE, related_name='dss_review'
    )
    rating = models.IntegerField(choices=[(i, i) for i in range(1, 6)])
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.client.full_name} → {self.provider.full_name}: {self.rating}★'


class BatchVerification(models.Model):
    """Tracks batch KYC verification sessions by admin"""
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]
    batch_id = models.CharField(max_length=30, unique=True)
    admin = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='batches'
    )
    total_providers = models.IntegerField(default=0)
    approved_count = models.IntegerField(default=0)
    rejected_count = models.IntegerField(default=0)
    pending_count = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    provider_queue = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.batch_id:
            from django.utils import timezone
            self.batch_id = f'VER-{timezone.now().strftime("%Y%m%d%H%M%S")}'
        super().save(*args, **kwargs)


class AIAnalysisRun(models.Model):
    """Persistent audit trail for admin-triggered AI decision-support runs."""
    ACTION_CHOICES = [
        ('integrity_review', 'Integrity Review'),
        ('score_recalculation', 'Score Recalculation'),
    ]

    admin = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='ai_analysis_runs'
    )
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_action_display()} at {self.created_at:%Y-%m-%d %H:%M}'
