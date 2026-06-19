"""
Servista DSS Engine - Rule-based AI scoring for provider quality and fraud detection
"""
from django.db.models import Avg, Count
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

User = get_user_model()


def calculate_provider_score(provider_id):
    """
    Main function - calculates all scores for a provider and saves to ProviderScore.
    Call this whenever new reviews, bookings, or reports are added.
    Returns the updated ProviderScore object.
    """
    from .models import ProviderScore, ProviderReport, batch_eligibility_check, badge_eligibility_check
    from bookings.models import Booking
    from services.models import ServiceReview

    try:
        provider = User.objects.get(id=provider_id, role='provider')
    except User.DoesNotExist:
        return None

    score, _ = ProviderScore.objects.get_or_create(provider=provider)

    # ── ACTIVITY SCORE ────────────────────────────────
    bookings = Booking.objects.filter(service__provider=provider)
    score.total_bookings = bookings.count()
    score.jobs_completed = bookings.filter(status='completed').count()
    score.jobs_accepted = bookings.filter(
        status__in=['confirmed', 'in_progress', 'completed']
    ).count()
    score.jobs_rejected = bookings.filter(status='cancelled').count()
    score.jobs_cancelled = bookings.filter(status='cancelled').count()
    if score.total_bookings > 0:
        score.activity_score = round(
            (score.jobs_completed / score.total_bookings) * 100, 1
        )
    else:
        score.activity_score = 0.0

    # ── QUALITY SCORE (from platform ServiceReview data) ─────────────
    reviews = ServiceReview.objects.filter(provider=provider)
    score.total_reviews = reviews.count()
    if score.total_reviews > 0:
        avg = reviews.aggregate(avg=Avg('rating'))['avg'] or 0
        score.average_rating = round(avg, 2)
        satisfied = reviews.filter(rating__gte=4).count()
        score.satisfaction_rate = round(
            (satisfied / score.total_reviews) * 100, 1
        )
        repeat = bookings.values('client').annotate(
            cnt=Count('client')).filter(cnt__gte=2).count()
        score.repeat_customers = repeat
        score.quality_score = round(
            (score.average_rating / 5) * 40 +
            (score.satisfaction_rate / 100) * 40 +
            min(score.repeat_customers * 5, 20), 1
        )
    else:
        score.average_rating = 0.0
        score.satisfaction_rate = 0.0
        score.repeat_customers = 0
        score.quality_score = 0.0

    # ── RELIABILITY SCORE ─────────────────────────────
    accepted_bookings = bookings.filter(
        status__in=['confirmed', 'in_progress', 'completed']
    )
    total_accepted = accepted_bookings.count()
    if total_accepted > 0:
        score.attendance_rate = round(
            (score.jobs_completed / total_accepted) * 100, 1
        )
    else:
        score.attendance_rate = 0.0
    if score.total_bookings > 0:
        score.completion_rate = round(
            (score.jobs_completed / score.total_bookings) * 100, 1
        )
    else:
        score.completion_rate = 0.0
    score.reliability_score = round(
        (score.attendance_rate * 0.5) + (score.completion_rate * 0.5), 1
    )

    # ── TRUST SCORE ───────────────────────────────────
    try:
        score.is_kyc_verified = (
            provider.provider_profile.kyc_status == 'approved'
        )
    except Exception:
        score.is_kyc_verified = False
    score.total_complaints = ProviderReport.objects.filter(
        reported_provider=provider,
        status__in=['pending', 'investigating']
    ).count()
    kyc_points = 40 if score.is_kyc_verified else 0
    complaint_deduction = min(score.total_complaints * 15, 40)
    score.trust_score = max(0, kyc_points + 60 - complaint_deduction)

    # ── FRAUD DETECTION ENGINE ────────────────────────
    fraud_points = 0
    fraud_flags = []

    if score.average_rating >= 4.9 and score.total_reviews < 3:
        fraud_points += 30
        fraud_flags.append('HIGH RATING WITH TOO FEW REVIEWS - possible fake reviews')

    if score.total_bookings >= 5 and score.completion_rate < 40:
        fraud_points += 35
        fraud_flags.append('COMPLETION RATE BELOW 40% - accepts bookings but rarely completes them')

    if score.total_complaints >= 3:
        fraud_points += 40
        fraud_flags.append(f'{score.total_complaints} ACTIVE COMPLAINTS - multiple clients have reported this provider')

    if not score.is_kyc_verified and score.total_bookings > 0:
        fraud_points += 20
        fraud_flags.append('IDENTITY NOT VERIFIED - provider is unverified but has active bookings')

    recent_reviews = ServiceReview.objects.filter(
        provider=provider,
        created_at__gte=timezone.now() - timedelta(hours=24)
    ).count()
    if recent_reviews >= 5:
        fraud_points += 35
        fraud_flags.append(f'{recent_reviews} REVIEWS IN LAST 24 HOURS - suspected review farming')

    very_recent_reviews = ServiceReview.objects.filter(
        provider=provider,
        created_at__gte=timezone.now() - timedelta(hours=6)
    ).count()
    if very_recent_reviews >= 3:
        fraud_points += 25
        fraud_flags.append(f'{very_recent_reviews} REVIEWS IN LAST 6 HOURS - unusual rating velocity')

    if score.total_reviews >= 5:
        five_star = reviews.filter(rating=5).count()
        if five_star / score.total_reviews >= 0.95:
            fraud_points += 20
            fraud_flags.append('95%+ FIVE-STAR REVIEWS - statistically suspicious overrating pattern')

    score.fraud_risk_points = fraud_points
    score.fraud_flags = fraud_flags
    if fraud_points >= 60:
        score.fraud_risk_level = 'HIGH'
    elif fraud_points >= 30:
        score.fraud_risk_level = 'MEDIUM'
    else:
        score.fraud_risk_level = 'LOW'

    score.overall_score = round(
        score.activity_score * 0.25 +
        score.quality_score * 0.35 +
        score.reliability_score * 0.25 +
        score.trust_score * 0.15, 1
    )

    auto_eligible = batch_eligibility_check(
        score.activity_score,
        score.reliability_score,
        score.quality_score,
        score.trust_score,
        is_kyc_verified=score.is_kyc_verified,
        total_complaints=score.total_complaints,
    )
    score.batch_eligible = score.batch_eligible_override or auto_eligible

    score.badge_eligible = badge_eligibility_check(
        score.activity_score,
        score.reliability_score,
        score.quality_score,
        score.trust_score,
        is_kyc_verified=score.is_kyc_verified,
    )

    score.save()
    return score


def recalculate_all_providers():
    """Recalculates scores for all providers. Run this from admin or a cron job."""
    providers = User.objects.filter(role='provider')
    results = []
    for provider in providers:
        score = calculate_provider_score(provider.id)
        if score:
            results.append({
                'provider': provider.full_name,
                'overall_score': score.overall_score,
                'fraud_risk': score.fraud_risk_level,
                'batch_eligible': score.batch_eligible,
            })
    return results
