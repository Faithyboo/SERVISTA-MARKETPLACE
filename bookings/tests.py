from decimal import Decimal
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from services.models import Service
from users.models import Notification, ProviderProfile, User
from wallet.models import Transaction
from .models import Booking


class MarketplaceWorkflowTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            email='client@example.com',
            full_name='Client User',
            password='password123',
            role='client',
        )
        self.provider = User.objects.create_user(
            email='provider@example.com',
            full_name='Provider User',
            password='password123',
            role='provider',
        )
        self.service = Service.objects.create(
            provider=self.provider,
            title='Home plumbing',
            description='Pipe repairs',
            category='plumbing',
            price=Decimal('5000.00'),
            address='Douala',
        )

    def test_client_can_book_pay_and_message_provider(self):
        self.client.force_authenticate(self.client_user)
        topup = self.client.post(reverse('wallet-topup'), {'amount': '6000.00'}, format='json')
        self.assertEqual(topup.status_code, status.HTTP_201_CREATED)
        pin_setup = self.client.post(reverse('wallet-pin'), {'pin': '1234'}, format='json')
        self.assertEqual(pin_setup.status_code, status.HTTP_200_OK)

        booking_response = self.client.post(
            reverse('booking-list-create'),
            {
                'service': self.service.pk,
                'address': 'Bonamoussadi',
                'scheduled_at': timezone.now().isoformat(),
                'notes': 'Please call first',
            },
            format='json',
        )
        self.assertEqual(booking_response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=booking_response.data['id'])
        self.assertEqual(booking.amount, self.service.price)

        payment = self.client.post(reverse('wallet-payment', args=[booking.pk]), {'pin': '1234'}, format='json')
        self.assertEqual(payment.status_code, status.HTTP_200_OK)
        self.client_user.wallet.refresh_from_db()
        self.provider.wallet.refresh_from_db()
        self.assertEqual(self.client_user.wallet.balance, Decimal('1000.00'))
        self.assertEqual(self.provider.wallet.balance, Decimal('0.00'))
        self.assertEqual(Transaction.objects.filter(booking=booking, type='payment').count(), 1)
        self.assertTrue(Notification.objects.filter(
            user=self.provider,
            title='Client payment received',
            is_read=False,
        ).exists())

        duplicate = self.client.post(reverse('wallet-payment', args=[booking.pk]), {'pin': '1234'}, format='json')
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

        message = self.client.post(
            reverse('message-create'),
            {'booking': booking.pk, 'receiver': self.provider.pk, 'content': 'Hello'},
            format='json',
        )
        self.assertEqual(message.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(self.provider)
        thread = self.client.get(reverse('message-thread', args=[booking.pk]))
        self.assertEqual(thread.status_code, status.HTTP_200_OK)
        self.assertEqual(len(thread.data), 1)
        marked_read = self.client.put(reverse('message-read', args=[booking.pk]))
        self.assertEqual(marked_read.data['updated'], 1)

    def test_provider_profile_can_be_approved_by_admin(self):
        self.client.force_authenticate(self.provider)
        profile_response = self.client.post(
            reverse('provider-profile'),
            {
                'business_name': 'Reliable Repairs',
                'bio': 'Local plumbing services',
                'city_area': 'Douala, Bonamousadi',
            },
            format='json',
        )
        self.assertEqual(profile_response.status_code, status.HTTP_201_CREATED)
        profile = ProviderProfile.objects.get(user=self.provider)

        admin = User.objects.create_user(
            email='admin@example.com',
            full_name='Admin User',
            password='password123',
            role='admin',
        )
        self.client.force_authenticate(admin)
        approval = self.client.put(
            reverse('admin-update-kyc', args=[self.provider.pk]),
            {'status': 'approved'},
            format='json',
        )
        self.assertEqual(approval.status_code, status.HTTP_200_OK)
        profile.refresh_from_db()
        self.assertEqual(profile.kyc_status, 'approved')

        self.client.force_authenticate(user=None)
        providers = self.client.get(reverse('approved-providers'))
        self.assertEqual(providers.status_code, status.HTTP_200_OK)
        self.assertEqual(len(providers.data), 1)

    def test_public_registration_cannot_create_admin(self):
        response = self.client.post(
            reverse('register'),
            {
                'email': 'attacker@example.com',
                'full_name': 'Not Admin',
                'password': 'password123',
                'role': 'admin',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
