# Generated manually for email login verification hardening.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0012_user_location'),
    ]

    operations = [
        migrations.AddField(
            model_name='emailverificationcode',
            name='failed_attempts',
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]
