from django.db import models
from users.models import User

class Service(models.Model):
    CATEGORY_CHOICES = [
        ('plumbing', 'Plumbing'),
        ('electrical', 'Electrical'),
        ('cleaning', 'Cleaning'),
        ('beauty', 'Beauty & Makeup'),
        ('catering', 'Catering & Food'),
        ('carpentry', 'Carpentry'),
        ('painting', 'Painting'),
        ('laundry', 'Laundry & Ironing'),
        ('delivery', 'Delivery & Transport'),
        ('tech_repair', 'Tech & Phone Repair'),
        ('tutoring', 'Tutoring'),
        ('health', 'Health & Wellness'),
        ('other', 'Other'),
    ]

    provider        = models.ForeignKey(User, on_delete=models.CASCADE, related_name='services')
    title           = models.CharField(max_length=255)
    description     = models.TextField()
    category        = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    price           = models.DecimalField(max_digits=10, decimal_places=2)
    address         = models.CharField(max_length=255)
    latitude        = models.FloatField(null=True, blank=True)
    longitude       = models.FloatField(null=True, blank=True)
    image           = models.ImageField(upload_to='services/', null=True, blank=True)
    is_available    = models.BooleanField(default=True)
    created_at      = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} by {self.provider.full_name}"


class ServiceReview(models.Model):
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='reviews')
    booking = models.OneToOneField('bookings.Booking', on_delete=models.CASCADE, related_name='review')
    client = models.ForeignKey(User, on_delete=models.CASCADE, related_name='service_reviews')
    provider = models.ForeignKey(User, on_delete=models.CASCADE, related_name='provider_reviews')
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.rating}/5 for {self.service.title}"
