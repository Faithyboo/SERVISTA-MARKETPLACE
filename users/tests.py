from django.test import TestCase
from rest_framework.test import APIClient
from unittest.mock import patch
import re

from .models import EmailVerificationCode, User
from .serializers import RegisterSerializer


class RegisterSerializerTests(TestCase):
    def test_client_registration_requires_city_area(self):
        serializer = RegisterSerializer(data={
            'full_name': 'Client User',
            'email': 'client@example.com',
            'phone': '670000000',
            'role': 'client',
            'password': 'password123',
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn('city_area', serializer.errors)

    def test_client_registration_accepts_city_area(self):
        serializer = RegisterSerializer(data={
            'full_name': 'Client User',
            'email': 'client@example.com',
            'phone': '670000000',
            'city_area': 'Douala, Bonamousadi',
            'address': '',
            'role': 'client',
            'password': 'password123',
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)


class EmailTwoFactorLoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='member@example.com',
            full_name='Member User',
            password='password123',
        )

    @patch('users.views.send_mail')
    def test_login_requires_email_code_before_tokens_are_issued(self, send_mail_mock):
        login_response = self.client.post(
            '/api/users/login/',
            {'email': self.user.email, 'password': 'password123'},
            format='json',
        )

        self.assertEqual(login_response.status_code, 200)
        self.assertTrue(login_response.data['requires_2fa'])
        self.assertNotIn('access', login_response.data)
        challenge = EmailVerificationCode.objects.get(challenge_id=login_response.data['challenge_id'])
        self.assertFalse(challenge.is_used)

        email_text = send_mail_mock.call_args.kwargs['message']
        code = re.search(r'\b(\d{6})\b', email_text).group(1)
        verify_response = self.client.post(
            '/api/users/verify-email-code/',
            {'challenge_id': login_response.data['challenge_id'], 'code': code},
            format='json',
        )

        self.assertEqual(verify_response.status_code, 200)
        self.assertIn('access', verify_response.data)
        self.assertIn('refresh', verify_response.data)
        challenge.refresh_from_db()
        self.assertTrue(challenge.is_used)

    @patch('users.views.send_mail')
    def test_five_invalid_codes_invalidate_the_challenge(self, _send_mail_mock):
        login_response = self.client.post(
            '/api/users/login/',
            {'email': self.user.email, 'password': 'password123'},
            format='json',
        )

        for _ in range(5):
            response = self.client.post(
                '/api/users/verify-email-code/',
                {'challenge_id': login_response.data['challenge_id'], 'code': '000000'},
                format='json',
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn('Too many invalid codes', response.data['error'])
        challenge = EmailVerificationCode.objects.get(challenge_id=login_response.data['challenge_id'])
        self.assertTrue(challenge.is_used)

    def test_provider_registration_does_not_require_client_city_area(self):
        serializer = RegisterSerializer(data={
            'full_name': 'Provider User',
            'email': 'provider@example.com',
            'phone': '670000001',
            'role': 'provider',
            'password': 'password123',
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
