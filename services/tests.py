from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from bookings.models import Booking
from users.models import User
from .models import Service, ServiceReview


class ProviderRatingTests(APITestCase):
    def setUp(self):
        self.provider = User.objects.create_user(
            email='new-provider@example.com',
            full_name='New Provider',
            password='password123',
            role='provider',
        )
        self.client_user = User.objects.create_user(
            email='new-client@example.com',
            full_name='New Client',
            password='password123',
            role='client',
        )
        self.service = Service.objects.create(
            provider=self.provider,
            title='Carpentry service',
            description='Furniture repairs',
            category='carpentry',
            price=Decimal('10000.00'),
            address='Douala',
        )
        self.other_service = Service.objects.create(
            provider=self.provider,
            title='Painting service',
            description='Interior painting',
            category='painting',
            price=Decimal('12000.00'),
            address='Douala',
        )

    def test_new_client_review_updates_provider_rating_on_all_listings(self):
        booking = Booking.objects.create(
            client=self.client_user,
            service=self.service,
            status='completed',
            payment_status='released',
            address='Bonamoussadi',
            scheduled_at=timezone.now(),
            amount=self.service.price,
        )
        self.client.force_authenticate(self.client_user)
        response = self.client.post(
            reverse('service-review-list-create', args=[self.service.pk]),
            {'booking': booking.pk, 'rating': 4, 'comment': 'Good work'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(ServiceReview.objects.filter(booking=booking, client=self.client_user).exists())

        first = self.client.get(reverse('service-detail', args=[self.service.pk]))
        second = self.client.get(reverse('service-detail', args=[self.other_service.pk]))
        self.assertEqual(first.data['average_rating'], 4.0)
        self.assertEqual(second.data['average_rating'], 4.0)
        self.assertEqual(first.data['review_count'], 1)
        self.assertEqual(second.data['review_count'], 1)

    def test_client_can_review_provider_from_another_provider_service_page(self):
        booking = Booking.objects.create(
            client=self.client_user,
            service=self.service,
            status='completed',
            payment_status='released',
            address='Bonamoussadi',
            scheduled_at=timezone.now(),
            amount=self.service.price,
        )
        self.client.force_authenticate(self.client_user)
        response = self.client.post(
            reverse('service-review-list-create', args=[self.other_service.pk]),
            {'booking': booking.pk, 'rating': 5, 'comment': 'Excellent provider'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        review = ServiceReview.objects.get(booking=booking)
        self.assertEqual(review.service, self.service)
        self.assertEqual(review.provider, self.provider)
