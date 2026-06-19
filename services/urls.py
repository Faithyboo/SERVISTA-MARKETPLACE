from django.urls import path
from .views import ServiceDetailView, ServiceListView, ServiceReviewListCreateView

urlpatterns = [
    path('', ServiceListView.as_view(), name='service-list'),
    path('<int:service_id>/reviews/', ServiceReviewListCreateView.as_view(), name='service-review-list-create'),
    path('<int:pk>/', ServiceDetailView.as_view(), name='service-detail'),
]
