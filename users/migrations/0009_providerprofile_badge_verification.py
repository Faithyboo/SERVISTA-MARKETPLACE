from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_user_profile_photo_updated_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='providerprofile',
            name='badge_verification_status',
            field=models.CharField(
                choices=[('not_verified', 'Not Verified'), ('verified', 'Verified')],
                default='not_verified',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='providerprofile',
            name='badge_verified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
