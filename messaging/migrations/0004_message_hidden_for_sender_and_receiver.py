from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('messaging', '0003_message_attachment'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='hidden_for_sender',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='message',
            name='hidden_for_receiver',
            field=models.BooleanField(default=False),
        ),
    ]
