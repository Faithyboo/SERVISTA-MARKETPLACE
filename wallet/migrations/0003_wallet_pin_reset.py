from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('wallet', '0002_alter_transaction_options'),
    ]

    operations = [
        migrations.AddField(
            model_name='wallet',
            name='pin_hash',
            field=models.CharField(blank=True, max_length=128),
        ),
        migrations.AddField(
            model_name='wallet',
            name='pin_reset_requested_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='wallet',
            name='pin_reset_status',
            field=models.CharField(
                choices=[
                    ('none', 'None'),
                    ('requested', 'Requested'),
                    ('approved', 'Approved'),
                    ('rejected', 'Rejected'),
                ],
                default='none',
                max_length=20,
            ),
        ),
    ]
