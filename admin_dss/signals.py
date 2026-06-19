from django.db.models.signals import post_save
from django.dispatch import receiver


def connect_dss_signals():
    from services.models import ServiceReview
    from .dss_engine import calculate_provider_score

    @receiver(post_save, sender=ServiceReview)
    def recalculate_on_service_review(sender, instance, **kwargs):
        if instance.provider_id:
            calculate_provider_score(instance.provider_id)
