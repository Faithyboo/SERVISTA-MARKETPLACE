from rest_framework import serializers
from .models import Message


class MessageSerializer(serializers.ModelSerializer):
    sender = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Message
        fields = [
            'id', 'sender', 'receiver', 'booking', 'content',
            'attachment', 'attachment_type', 'attachment_name',
            'is_read', 'sent_at'
        ]
        read_only_fields = ['is_read', 'sent_at']
        extra_kwargs = {
            'content': {'required': False, 'allow_blank': True},
            'attachment_type': {'required': False, 'allow_blank': True},
            'attachment_name': {'required': False, 'allow_blank': True},
        }

    def validate(self, attrs):
        content = attrs.get('content', '')
        attachment = attrs.get('attachment')
        if not content and not attachment:
            raise serializers.ValidationError('Message text or an attachment is required.')
        return attrs
