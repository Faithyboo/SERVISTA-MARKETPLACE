import copy
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.contrib.auth import get_user_model
from django.db.models import Avg
from django.utils import timezone
from .models import AIAnalysisRun, ProviderScore, ProviderReport, BatchVerification, badge_eligibility_check
from services.models import ServiceReview
from .dss_serializers import (
    ProviderScoreSerializer, ProviderReportSerializer,
    ReviewSerializer, BatchVerificationSerializer,
    BatchEligibleProviderSerializer, AIAnalysisRunSerializer,
)
from .dss_engine import calculate_provider_score, recalculate_all_providers

User = get_user_model()
logger = logging.getLogger(__name__)


def is_admin(user):
    return user.is_authenticated and user.role == 'admin'


def build_ai_snapshot():
    """Return the current decision-support facts used by the admin UI and run history."""
    scores = ProviderScore.objects.all()
    from users.models import ProviderProfile

    high_risk = scores.filter(fraud_risk_level='HIGH').count()
    medium_risk = scores.filter(fraud_risk_level='MEDIUM').count()
    low_risk = scores.filter(fraud_risk_level='LOW').count()
    pending_reports = ProviderReport.objects.filter(status='pending').count()
    total_reviews = ServiceReview.objects.count()
    avg_platform_rating = ServiceReview.objects.aggregate(avg=Avg('rating'))['avg'] or 0
    eligible_provider_ids = scores.filter(badge_eligible=True).values_list('provider_id', flat=True)
    pending_eligible_count = ProviderProfile.objects.filter(
        user_id__in=eligible_provider_ids,
        badge_verification_status='not_verified',
    ).count()

    return {
        'fraud_overview': {
            'high_risk': high_risk,
            'medium_risk': medium_risk,
            'low_risk': low_risk,
            'total_scored': scores.count(),
        },
        'reports_overview': {
            'pending': pending_reports,
            'total': ProviderReport.objects.count(),
        },
        'quality_overview': {
            'total_reviews': total_reviews,
            'avg_platform_rating': round(float(avg_platform_rating), 2),
        },
        'batch_overview': {'eligible_count': pending_eligible_count},
        'badge_overview': {'eligible_count': pending_eligible_count},
    }


def build_batch_provider_queue():
    """
    Snapshot providers meeting DSS verification rules at this moment:
    activity, reliability, quality >= 50%; trust = 100% (approved KYC); not yet badge-verified.
    """
    from users.models import ProviderProfile

    profiles = ProviderProfile.objects.filter(
        user__role='provider',
        badge_verification_status='not_verified',
    ).select_related('user')

    queue = []
    for profile in profiles:
        try:
            score = profile.user.dss_score
        except ProviderScore.DoesNotExist:
            continue
        if not badge_eligibility_check(
            score.activity_score,
            score.reliability_score,
            score.quality_score,
            score.trust_score,
            is_kyc_verified=score.is_kyc_verified,
        ):
            continue
        queue.append({
            'profile_id': profile.id,
            'user_id': profile.user_id,
            'decision': 'pending',
            'activity_score': score.activity_score,
            'reliability_score': score.reliability_score,
            'quality_score': score.quality_score,
            'trust_score': score.trust_score,
            'overall_score': score.overall_score,
            'fraud_risk_level': score.fraud_risk_level,
        })
    return queue


def sync_batch_counts(batch):
    queue = batch.provider_queue or []
    batch.total_providers = len(queue)
    batch.approved_count = sum(1 for item in queue if item.get('decision') == 'approved')
    batch.rejected_count = sum(1 for item in queue if item.get('decision') == 'rejected')
    batch.pending_count = sum(1 for item in queue if item.get('decision') == 'pending')
    if batch.pending_count < batch.total_providers and batch.status == 'open':
        batch.status = 'in_progress'


def ensure_batch_queue(batch):
    """Re-snapshot eligible providers when an open batch has no queue yet."""
    if batch.status == 'completed':
        return batch.provider_queue or []
    if not batch.provider_queue:
        batch.provider_queue = build_batch_provider_queue()
        sync_batch_counts(batch)
        batch.save(update_fields=[
            'provider_queue', 'total_providers', 'approved_count',
            'rejected_count', 'pending_count', 'status',
        ])
    return batch.provider_queue


def refresh_open_batches():
    """Ensure open batches have a queue snapshot and counts derived from it."""
    batches = BatchVerification.objects.filter(status__in=['open', 'in_progress'])
    for batch in batches:
        ensure_batch_queue(batch)


def batch_queue_to_providers(queue):
    from users.models import ProviderProfile
    from users.serializers import UserSerializer

    profile_ids = [item['profile_id'] for item in queue]
    profiles = {
        p.id: p
        for p in ProviderProfile.objects.filter(id__in=profile_ids).select_related('user')
    }
    payload = []
    for item in queue:
        profile = profiles.get(item['profile_id'])
        if not profile:
            continue
        payload.append({
            'id': profile.id,
            'user': UserSerializer(profile.user).data,
            'business_name': profile.business_name,
            'address': profile.address or '',
            'kyc_status': profile.kyc_status,
            'id_front': profile.id_front.url if profile.id_front else None,
            'id_back': profile.id_back.url if profile.id_back else None,
            'selfie': profile.selfie.url if profile.selfie else None,
            'batch_eligible': True,
            'batch_decision': item.get('decision', 'pending'),
            'activity_score': item.get('activity_score', 0),
            'reliability_score': item.get('reliability_score', 0),
            'quality_score': item.get('quality_score', 0),
            'trust_score': item.get('trust_score', 0),
            'overall_score': item.get('overall_score', 0),
            'fraud_risk_level': item.get('fraud_risk_level', 'LOW'),
        })
    return payload


class DSSDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        # Keep the governance dashboard aligned with current booking, review,
        # KYC, and report data, including providers created before DSS signals.
        recalculate_all_providers()
        return Response(build_ai_snapshot())


class AIAnalysisHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        runs = AIAnalysisRun.objects.select_related('admin')[:50]
        return Response(AIAnalysisRunSerializer(runs, many=True).data)

    def post(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        action = request.data.get('action', 'integrity_review')
        if action not in {'integrity_review', 'score_recalculation'}:
            return Response({'error': 'Invalid analysis action'}, status=400)
        run = AIAnalysisRun.objects.create(
            admin=request.user,
            action=action,
            snapshot=build_ai_snapshot(),
        )
        return Response(AIAnalysisRunSerializer(run).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        run_id = request.query_params.get('id')
        if run_id:
            deleted, _ = AIAnalysisRun.objects.filter(id=run_id).delete()
        else:
            deleted, _ = AIAnalysisRun.objects.all().delete()
        return Response({'deleted': deleted})


class ProviderScoreListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        scores = ProviderScore.objects.select_related('provider').all().order_by('-overall_score')
        if request.query_params.get('batch_eligible') == 'true':
            scores = scores.filter(batch_eligible=True)
        serializer = ProviderScoreSerializer(scores, many=True)
        return Response(serializer.data)

    def post(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        results = recalculate_all_providers()
        return Response({'message': f'Recalculated {len(results)} providers', 'results': results})


class ProviderScoreDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, provider_id):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        score = calculate_provider_score(provider_id)
        if not score:
            return Response({'error': 'Provider not found'}, status=404)
        return Response(ProviderScoreSerializer(score).data)

    def patch(self, request, provider_id):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        try:
            score = ProviderScore.objects.get(provider_id=provider_id)
        except ProviderScore.DoesNotExist:
            return Response({'error': 'Provider score not found'}, status=404)

        if 'batch_eligible' in request.data:
            approved = bool(request.data['batch_eligible'])
            score.batch_eligible_override = approved
            if approved:
                score.batch_eligible = True
            else:
                from .models import batch_eligibility_check
                score.batch_eligible = batch_eligibility_check(
                    score.activity_score,
                    score.reliability_score,
                    score.quality_score,
                    score.trust_score,
                    is_kyc_verified=score.is_kyc_verified,
                    total_complaints=score.total_complaints,
                )
            score.save()
        return Response(ProviderScoreSerializer(score).data)


class FraudAlertsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        risk_level = request.query_params.get('risk', 'HIGH')
        alerts = ProviderScore.objects.filter(
            fraud_risk_level=risk_level
        ).order_by('-fraud_risk_points')
        return Response(ProviderScoreSerializer(alerts, many=True).data)


class ReportListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        reports = ProviderReport.objects.all().order_by('-created_at')
        return Response(ProviderReportSerializer(reports, many=True).data)


class ReportDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, report_id):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        try:
            report = ProviderReport.objects.get(id=report_id)
        except ProviderReport.DoesNotExist:
            return Response({'error': 'Report not found'}, status=404)
        new_status = request.data.get('status')
        admin_note = request.data.get('admin_note', '')
        if new_status:
            report.status = new_status
        if admin_note:
            report.admin_note = admin_note
        report.save()
        calculate_provider_score(report.reported_provider.id)
        return Response(ProviderReportSerializer(report).data)


class FileReportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data.copy()
        serializer = ProviderReportSerializer(data=data)
        if serializer.is_valid():
            report = serializer.save(reporter=request.user)
            calculate_provider_score(report.reported_provider.id)
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)


class SubmitReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from bookings.models import Booking
        booking_id = request.data.get('booking')
        try:
            booking = Booking.objects.get(
                id=booking_id, client=request.user, status='completed'
            )
        except Booking.DoesNotExist:
            return Response({
                'error': 'Booking not found or not completed'
            }, status=404)
        if hasattr(booking, 'dss_review'):
            return Response({'error': 'Review already submitted'}, status=400)
        serializer = ReviewSerializer(data=request.data)
        if serializer.is_valid():
            review = serializer.save(
                client=request.user,
                provider=booking.service.provider
            )
            calculate_provider_score(booking.service.provider.id)
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)


class BatchVerificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        refresh_open_batches()
        batches = BatchVerification.objects.all().order_by('-created_at')
        return Response(BatchVerificationSerializer(batches, many=True).data)

    def post(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        queue = build_batch_provider_queue()
        batch = BatchVerification.objects.create(
            admin=request.user,
            provider_queue=queue,
        )
        sync_batch_counts(batch)
        batch.save(update_fields=[
            'total_providers', 'approved_count', 'rejected_count', 'pending_count', 'status',
        ])
        return Response(BatchVerificationSerializer(batch).data, status=201)


class BatchEligibleProvidersView(APIView):
    """Providers in an active batch queue, or currently eligible for a new batch."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)

        batch_id = request.query_params.get('batch_id')
        if batch_id:
            try:
                batch = BatchVerification.objects.get(batch_id=batch_id)
            except BatchVerification.DoesNotExist:
                return Response({'error': 'Batch not found'}, status=404)
            queue = ensure_batch_queue(batch)
            payload = batch_queue_to_providers(queue)
            return Response({
                'count': len(payload),
                'batch': BatchVerificationSerializer(batch).data,
                'requirements': (
                    'Activity, Reliability & Quality at or above 50%, '
                    'Trust at 100% from approved KYC, and no active complaints'
                ),
                'providers': payload,
            })

        queue = build_batch_provider_queue()
        payload = batch_queue_to_providers(queue)
        return Response({
            'count': len(payload),
            'requirements': (
                'Activity, Reliability & Quality at or above 50%, '
                'Trust at 100% from approved KYC, and no active complaints'
            ),
            'providers': payload,
        })


class BatchVerificationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_id):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        try:
            batch = BatchVerification.objects.get(batch_id=batch_id)
        except BatchVerification.DoesNotExist:
            return Response({'error': 'Batch not found'}, status=404)
        ensure_batch_queue(batch)
        batch.refresh_from_db()
        queue = batch.provider_queue or []
        providers = batch_queue_to_providers(queue)
        return Response({
            'batch': BatchVerificationSerializer(batch).data,
            'providers': providers,
            'count': len(providers),
        })

    def put(self, request, batch_id):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)
        try:
            batch = BatchVerification.objects.get(batch_id=batch_id)
        except BatchVerification.DoesNotExist:
            return Response({'error': 'Batch not found'}, status=404)

        action = request.data.get('action')
        provider_id = request.data.get('provider_id')

        if action == 'complete':
            batch.status = 'completed'
            batch.completed_at = timezone.now()
            batch.save()
            return Response(BatchVerificationSerializer(batch).data)

        if action not in ('approve', 'reject'):
            return Response({'error': 'Invalid action'}, status=400)
        if not provider_id:
            return Response({'error': 'provider_id is required'}, status=400)

        ensure_batch_queue(batch)
        batch.refresh_from_db()
        queue = copy.deepcopy(batch.provider_queue or [])
        updated = False
        for item in queue:
            if item.get('user_id') == int(provider_id):
                if item.get('decision') != 'pending':
                    return Response({
                        'error': 'Provider already processed in this batch',
                    }, status=400)
                item['decision'] = 'approved' if action == 'approve' else 'rejected'
                updated = True
                break

        if not updated:
            return Response({'error': 'Provider not found in batch queue'}, status=404)

        batch.provider_queue = queue
        sync_batch_counts(batch)
        batch.save(update_fields=[
            'provider_queue', 'total_providers', 'approved_count',
            'rejected_count', 'pending_count', 'status',
        ])
        return Response(BatchVerificationSerializer(batch).data)


class BadgeEligibleProvidersView(APIView):
    """Providers meeting DSS badge criteria and not yet badge-verified."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin(request.user):
            return Response({'error': 'Admin only'}, status=403)

        from users.models import ProviderProfile
        from users.serializers import UserSerializer
        from .models import badge_eligibility_debug
        from .dss_engine import calculate_provider_score

        profiles = ProviderProfile.objects.filter(
            user__role='provider',
            badge_verification_status='not_verified',
        ).select_related('user')

        payload = []
        debug_rows = []
        for profile in profiles:
            score = calculate_provider_score(profile.user_id)
            if not score:
                continue
            debug = badge_eligibility_debug(score)
            debug_row = {
                'provider_id': profile.user_id,
                'provider_name': profile.user.full_name,
                'badge_status': profile.badge_verification_status,
                **debug,
            }
            debug_rows.append(debug_row)
            logger.info(
                'Badge eligibility check - %s (id=%s): activity=%s%% [%s] '
                'reliability=%s%% [%s] quality=%s%% [%s] trust=%s%% [%s] '
                'kyc_verified=%s => %s',
                profile.user.full_name,
                profile.user_id,
                debug['activity_percentage'],
                'PASS' if debug['activity_ok'] else 'FAIL',
                debug['reliability_percentage'],
                'PASS' if debug['reliability_ok'] else 'FAIL',
                debug['quality_percentage'],
                'PASS' if debug['quality_ok'] else 'FAIL',
                debug['trust_percentage'],
                'PASS' if debug['trust_ok'] else 'FAIL',
                debug['kyc_verified'],
                'ELIGIBLE' if debug['eligible'] else 'NOT ELIGIBLE',
            )
            if not debug['eligible']:
                continue
            payload.append({
                'id': profile.id,
                'user': UserSerializer(profile.user).data,
                'business_name': profile.business_name,
                'address': profile.address or '',
                'kyc_status': profile.kyc_status,
                'badge_verification_status': profile.badge_verification_status,
                'badge_eligible': True,
                'activity_percentage': score.activity_score,
                'reliability_percentage': score.reliability_score,
                'quality_percentage': score.quality_score,
                'trust_percentage': score.trust_score,
                'overall_score': score.overall_score,
                'fraud_risk_level': score.fraud_risk_level,
                'eligibility_checks': debug,
            })

        return Response({
            'count': len(payload),
            'requirements': (
                'Activity, Reliability & Quality >= 50%; Trust = 100% (approved KYC); '
                'badge not already verified'
            ),
            'providers': payload,
            'debug': debug_rows,
        })
