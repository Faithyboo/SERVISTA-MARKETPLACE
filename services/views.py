from rest_framework import status
from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from .models import Service
from .serializers import ServiceSerializer


class ServiceListView(APIView):
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get(self, request):
        category = request.query_params.get('category')
        search = request.query_params.get('search') or request.query_params.get('q')
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
            serializer.save(provider=request.user)
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
