from django.contrib import admin
from .models import EmailVerificationCode, Notification, ProviderProfile, User

admin.site.register(User)
admin.site.register(ProviderProfile)
admin.site.register(Notification)
admin.site.register(EmailVerificationCode)
