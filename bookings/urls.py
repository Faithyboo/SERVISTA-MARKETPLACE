from django.urls import path
from .views import (
    AdminRefundListView,
    AdminRefundUpdateView,
    AdminEscrowListView,
    AdminEscrowReleaseView,
    BookingConfirmCompletionView,
    BookingDetailView,
    BookingListCreateView,
    BookingReportIssueView,
    BookingRefundRequestView,
    BookingStatusUpdateView,
)

urlpatterns = [
    path('', BookingListCreateView.as_view(), name='booking-list-create'),
    path('<int:pk>/', BookingDetailView.as_view(), name='booking-detail'),
    path('<int:pk>/status/', BookingStatusUpdateView.as_view(), name='booking-status'),
    path('<int:pk>/refund/', BookingRefundRequestView.as_view(), name='booking-refund-request'),
    path('<int:pk>/confirm/', BookingConfirmCompletionView.as_view(), name='booking-confirm-completion'),
    path('<int:pk>/issue/', BookingReportIssueView.as_view(), name='booking-report-issue'),
    path('admin/escrow/', AdminEscrowListView.as_view(), name='admin-escrow-list'),
    path('admin/escrow/<int:pk>/release/', AdminEscrowReleaseView.as_view(), name='admin-escrow-release'),
    path('admin/refunds/', AdminRefundListView.as_view(), name='admin-refund-list'),
    path('admin/refunds/<int:pk>/', AdminRefundUpdateView.as_view(), name='admin-refund-update'),
]
