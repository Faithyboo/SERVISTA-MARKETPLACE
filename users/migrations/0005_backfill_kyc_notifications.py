from django.db import migrations


def create_kyc_notifications(apps, schema_editor):
    ProviderProfile = apps.get_model('users', 'ProviderProfile')
    Notification = apps.get_model('users', 'Notification')

    for profile in ProviderProfile.objects.select_related('user').exclude(kyc_status='pending'):
        if profile.kyc_status == 'approved':
            title = 'KYC approved'
            message = 'Your provider KYC verification has been approved.'
            detail = 'Your KYC documents have been reviewed and approved by Servista admin. Your provider wallet actions and verified provider access are now available.'
            icon = 'shield-checkmark-outline'
            tone = 'success'
        elif profile.kyc_status == 'rejected':
            title = 'KYC rejected'
            message = 'Your provider KYC verification was rejected.'
            detail = 'Servista admin rejected your KYC verification. Please review your provider profile and upload clear, valid identity documents before submitting again.'
            icon = 'close-circle-outline'
            tone = 'danger'
        else:
            continue

        Notification.objects.get_or_create(
            user_id=profile.user_id,
            title=title,
            message=message,
            defaults={
                'detail': detail,
                'icon': icon,
                'tone': tone,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_notification'),
    ]

    operations = [
        migrations.RunPython(create_kyc_notifications, migrations.RunPython.noop),
    ]
