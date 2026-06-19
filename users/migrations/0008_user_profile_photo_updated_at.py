from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_emailverificationcode_code_fingerprint'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='profile_photo_updated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
