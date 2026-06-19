from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0011_providerprofile_city_area'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='address',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='user',
            name='city_area',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
