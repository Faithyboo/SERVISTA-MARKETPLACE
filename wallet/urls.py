from django.urls import path
from .views import (
    AdminPinResetListView,
    AdminPinResetUpdateView,
    WalletDetailView,
    WalletPaymentView,
    WalletPinResetRequestView,
    WalletPinView,
    WalletTopUpView,
)

urlpatterns = [
    path('', WalletDetailView.as_view(), name='wallet-detail'),
    path('topup/', WalletTopUpView.as_view(), name='wallet-topup'),
    path('pin/', WalletPinView.as_view(), name='wallet-pin'),
    path('pin/reset/', WalletPinResetRequestView.as_view(), name='wallet-pin-reset'),
    path('pay/<int:booking_id>/', WalletPaymentView.as_view(), name='wallet-payment'),
    path('admin/pin-resets/', AdminPinResetListView.as_view(), name='admin-pin-resets'),
    path('admin/pin-resets/<int:wallet_id>/', AdminPinResetUpdateView.as_view(), name='admin-pin-reset-update'),
]
