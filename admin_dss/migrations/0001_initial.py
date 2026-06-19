# Generated manually for admin_dss

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('bookings', '0003_booking_client_confirmed_at_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='BatchVerification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('batch_id', models.CharField(max_length=30, unique=True)),
                ('total_providers', models.IntegerField(default=0)),
                ('approved_count', models.IntegerField(default=0)),
                ('rejected_count', models.IntegerField(default=0)),
                ('pending_count', models.IntegerField(default=0)),
                ('status', models.CharField(choices=[('open', 'Open'), ('in_progress', 'In Progress'), ('completed', 'Completed')], default='open', max_length=20)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('admin', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='batches', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='ProviderReport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reason', models.CharField(choices=[('no_show', 'Provider did not show up'), ('poor_quality', 'Poor quality of work'), ('fraud', 'Suspected fraud or scam'), ('overcharging', 'Overcharged beyond agreed price'), ('fake_reviews', 'Suspected fake reviews'), ('other', 'Other reason')], max_length=30)),
                ('description', models.TextField()),
                ('status', models.CharField(choices=[('pending', 'Pending Review'), ('investigating', 'Under Investigation'), ('resolved', 'Resolved'), ('dismissed', 'Dismissed')], default='pending', max_length=20)),
                ('admin_note', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('booking', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reports', to='bookings.booking')),
                ('reported_provider', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='received_reports', to=settings.AUTH_USER_MODEL)),
                ('reporter', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='filed_reports', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='ProviderScore',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('total_bookings', models.IntegerField(default=0)),
                ('jobs_accepted', models.IntegerField(default=0)),
                ('jobs_rejected', models.IntegerField(default=0)),
                ('jobs_cancelled', models.IntegerField(default=0)),
                ('jobs_completed', models.IntegerField(default=0)),
                ('activity_score', models.FloatField(default=0.0)),
                ('average_rating', models.FloatField(default=0.0)),
                ('total_reviews', models.IntegerField(default=0)),
                ('satisfaction_rate', models.FloatField(default=0.0)),
                ('repeat_customers', models.IntegerField(default=0)),
                ('quality_score', models.FloatField(default=0.0)),
                ('avg_response_time_minutes', models.FloatField(default=0.0)),
                ('attendance_rate', models.FloatField(default=0.0)),
                ('completion_rate', models.FloatField(default=0.0)),
                ('reliability_score', models.FloatField(default=0.0)),
                ('is_kyc_verified', models.BooleanField(default=False)),
                ('total_complaints', models.IntegerField(default=0)),
                ('trust_score', models.FloatField(default=0.0)),
                ('overall_score', models.FloatField(default=0.0)),
                ('fraud_risk_points', models.IntegerField(default=0)),
                ('fraud_risk_level', models.CharField(choices=[('LOW', 'Low Risk'), ('MEDIUM', 'Medium Risk'), ('HIGH', 'High Risk')], default='LOW', max_length=10)),
                ('fraud_flags', models.JSONField(default=list)),
                ('last_calculated', models.DateTimeField(auto_now=True)),
                ('provider', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='dss_score', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Review',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rating', models.IntegerField(choices=[(1, 1), (2, 2), (3, 3), (4, 4), (5, 5)])),
                ('comment', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('booking', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='dss_review', to='bookings.booking')),
                ('client', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='given_reviews', to=settings.AUTH_USER_MODEL)),
                ('provider', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='received_reviews', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
