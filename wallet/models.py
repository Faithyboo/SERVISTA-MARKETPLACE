from django.db import models
from bookings.models import Booking
from users.models import User


class Wallet(models.Model):
    PIN_RESET_CHOICES = [
        ('none', 'None'),
        ('requested', 'Requested'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    pin_hash = models.CharField(max_length=128, blank=True)
    pin_reset_status = models.CharField(max_length=20, choices=PIN_RESET_CHOICES, default='none')
    pin_reset_requested_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.full_name}: {self.balance}"


class Transaction(models.Model):
    TYPE_CHOICES = [
        ('topup', 'Top Up'),
        ('payment', 'Payment'),
        ('refund', 'Refund'),
    ]

    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name='transactions')
    booking = models.ForeignKey(Booking, null=True, blank=True, on_delete=models.CASCADE)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.type}: {self.amount}"
