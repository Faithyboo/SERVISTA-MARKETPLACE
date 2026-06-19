from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('admin_dss', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='providerscore',
            name='batch_eligible',
            field=models.BooleanField(default=False),
        ),
    ]
