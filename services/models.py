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
