from django.urls import path
from .views import MessageCreateView, MessageDeleteView, MessageReadView, MessageThreadClearView, MessageThreadView

urlpatterns = [
    path('', MessageCreateView.as_view(), name='message-create'),
    path('<int:booking_id>/', MessageThreadView.as_view(), name='message-thread'),
    path('<int:booking_id>/read/', MessageReadView.as_view(), name='message-read'),
    path('<int:booking_id>/clear/', MessageThreadClearView.as_view(), name='message-thread-clear'),
    path('message/<int:message_id>/', MessageDeleteView.as_view(), name='message-delete'),
]
