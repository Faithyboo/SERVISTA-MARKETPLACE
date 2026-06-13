from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from bookings.models import Booking
from .models import Message
from .serializers import MessageSerializer


def get_booking(booking_id):
    try:
        return Booking.objects.select_related('client', 'service__provider').get(pk=booking_id)
    except Booking.DoesNotExist:
        return None


def is_participant(user, booking):
    return user in {booking.client, booking.service.provider}


class MessageCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def post(self, request):
        booking = get_booking(request.data.get('booking'))
        if not booking:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        if not is_participant(request.user, booking):
            return Response({'error': 'Not authorized to message on this booking'}, status=status.HTTP_403_FORBIDDEN)
        receiver_id = request.data.get('receiver')
        other_user = booking.service.provider if request.user == booking.client else booking.client
        if str(other_user.pk) != str(receiver_id):
            return Response({'error': 'Receiver must be the other booking participant'}, status=status.HTTP_400_BAD_REQUEST)
        serializer = MessageSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(sender=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MessageThreadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        booking = get_booking(booking_id)
        if not booking:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        if not is_participant(request.user, booking):
            return Response({'error': 'Not authorized to view this thread'}, status=status.HTTP_403_FORBIDDEN)
        messages = Message.objects.filter(booking=booking).select_related('sender', 'receiver')
        return Response(MessageSerializer(messages, many=True).data)


class MessageReadView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, booking_id):
        booking = get_booking(booking_id)
        if not booking:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        if not is_participant(request.user, booking):
            return Response({'error': 'Not authorized to update this thread'}, status=status.HTTP_403_FORBIDDEN)
        updated = Message.objects.filter(booking=booking, receiver=request.user, is_read=False).update(is_read=True)
        return Response({'message': 'Messages marked as read', 'updated': updated})


class MessageDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, message_id):
        try:
            message = Message.objects.select_related('booking__client', 'booking__service__provider').get(pk=message_id)
        except Message.DoesNotExist:
            return Response({'error': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)
        if not is_participant(request.user, message.booking):
            return Response({'error': 'Not authorized to delete this message'}, status=status.HTTP_403_FORBIDDEN)
        message.delete()
        return Response({'message': 'Message deleted'}, status=status.HTTP_204_NO_CONTENT)


class MessageThreadClearView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, booking_id):
        booking = get_booking(booking_id)
        if not booking:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
        if not is_participant(request.user, booking):
            return Response({'error': 'Not authorized to clear this thread'}, status=status.HTTP_403_FORBIDDEN)
        deleted, _ = Message.objects.filter(booking=booking).delete()
        return Response({'message': 'Chat cleared', 'deleted': deleted})
