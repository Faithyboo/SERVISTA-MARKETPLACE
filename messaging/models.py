from django.db import models
from bookings.models import Booking
from users.models import User


class Message(models.Model):
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')
    receiver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_messages')
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name='messages')
    content = models.TextField(blank=True)
    attachment = models.FileField(upload_to='messages/', null=True, blank=True)
    attachment_type = models.CharField(max_length=20, blank=True)
    attachment_name = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sent_at']

    def __str__(self):
        return f"Message from {self.sender.full_name} on booking #{self.booking_id}"
