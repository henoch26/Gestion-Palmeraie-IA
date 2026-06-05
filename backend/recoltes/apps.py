from django.apps import AppConfig


class RecoltesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'recoltes'

    def ready(self):
        import recoltes.signals  # noqa: F401
