from django.apps import AppConfig


class AdminDssConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'admin_dss'

    def ready(self):
        from .signals import connect_dss_signals
        connect_dss_signals()
