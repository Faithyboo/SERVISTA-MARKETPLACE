from django.urls import path
from .dss_views import (
    DSSDashboardView, ProviderScoreListView, ProviderScoreDetailView,
    FraudAlertsView, ReportListView, ReportDetailView,
    FileReportView, SubmitReviewView,
    BatchVerificationListView, BatchVerificationDetailView,
    BatchEligibleProvidersView, BadgeEligibleProvidersView,
)

urlpatterns = [
    path('dashboard/', DSSDashboardView.as_view(), name='dss-dashboard'),
    path('scores/', ProviderScoreListView.as_view(), name='provider-scores'),
    path('scores/<int:provider_id>/', ProviderScoreDetailView.as_view(), name='provider-score-detail'),
    path('fraud-alerts/', FraudAlertsView.as_view(), name='fraud-alerts'),
    path('reports/', ReportListView.as_view(), name='report-list'),
    path('reports/<int:report_id>/', ReportDetailView.as_view(), name='report-detail'),
    path('batches/', BatchVerificationListView.as_view(), name='batch-list'),
    path('batches/eligible-providers/', BatchEligibleProvidersView.as_view(), name='batch-eligible-providers'),
    path('badges/eligible-providers/', BadgeEligibleProvidersView.as_view(), name='badge-eligible-providers'),
    path('batches/<str:batch_id>/', BatchVerificationDetailView.as_view(), name='batch-detail'),
    path('file-report/', FileReportView.as_view(), name='file-report'),
    path('reviews/', SubmitReviewView.as_view(), name='submit-review'),
]
