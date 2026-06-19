from django.test import TestCase

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

    def test_provider_registration_does_not_require_client_city_area(self):
        serializer = RegisterSerializer(data={
            'full_name': 'Provider User',
            'email': 'provider@example.com',
            'phone': '670000001',
            'role': 'provider',
            'password': 'password123',
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
