from rest_framework import status
from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from bookings.models import Booking
from .models import Service
from .serializers import ServiceReviewSerializer, ServiceSerializer


class ServiceListView(APIView):
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request):
        category = request.query_params.get('category')
        search = request.query_params.get('search') or request.query_params.get('q')
        mine = request.query_params.get('mine') in {'1', 'true', 'yes'}
        if mine:
            if not request.user.is_authenticated:
                return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
            if request.user.role != 'provider':
                return Response({'error': 'Only providers can view their own listings'}, status=status.HTTP_403_FORBIDDEN)
            services = Service.objects.filter(provider=request.user).order_by('-created_at')
        else:
            services = Service.objects.filter(is_available=True).order_by('-created_at')
        if category:
            services = services.filter(category=category)
        if search:
            services = services.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(address__icontains=search)
                | Q(category__icontains=search)
                | Q(provider__full_name__icontains=search)
            )
        serializer = ServiceSerializer(services, many=True)
        return Response(serializer.data)

    def post(self, request):
        if request.user.role != 'provider':
            return Response(
                {'error': 'Only providers can create services'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = ServiceSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(provider=request.user, is_available=True)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ServiceDetailView(APIView):
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_object(self, pk):
        try:
            return Service.objects.get(pk=pk)
        except Service.DoesNotExist:
            return None

    def get(self, request, pk):
        service = self.get_object(pk)
        if not service:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ServiceSerializer(service)
        return Response(serializer.data)

    def put(self, request, pk):
        service = self.get_object(pk)
        if not service:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)
        if service.provider != request.user:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        serializer = ServiceSerializer(service, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        service = self.get_object(pk)
        if not service:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)
        if service.provider != request.user:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        service.delete()
        return Response({'message': 'Service deleted'}, status=status.HTTP_204_NO_CONTENT)


class ServiceReviewListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_service(self, service_id):
        try:
            return Service.objects.get(pk=service_id)
        except Service.DoesNotExist:
            return None

    def get(self, request, service_id):
        service = self.get_service(service_id)
        if not service:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)
        reviews = service.reviews.select_related('client', 'provider', 'service')
        return Response(ServiceReviewSerializer(reviews, many=True).data)

    def post(self, request, service_id):
        if request.user.role != 'client':
            return Response({'error': 'Only clients can leave reviews'}, status=status.HTTP_403_FORBIDDEN)
        service = self.get_service(service_id)
        if not service:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)
        booking_id = request.data.get('booking')
        try:
            booking = Booking.objects.select_related('service__provider', 'client').get(pk=booking_id, service=service)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found for this service'}, status=status.HTTP_404_NOT_FOUND)
        if booking.client != request.user:
            return Response({'error': 'Only the client who booked this service can review it'}, status=status.HTTP_403_FORBIDDEN)
        if not (booking.status == 'completed' or booking.client_confirmed_at or booking.payment_status == 'released'):
            return Response({'error': 'You can review this provider after the service is completed'}, status=status.HTTP_400_BAD_REQUEST)
        if hasattr(booking, 'review'):
            return Response({'error': 'You already reviewed this booking'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ServiceReviewSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                service=service,
                booking=booking,
                client=request.user,
                provider=service.provider,
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
