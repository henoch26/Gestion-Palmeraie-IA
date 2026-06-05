from django.apps import AppConfig


class TravauxConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "travaux"

    def ready(self):
        import travaux.signals  # noqa: F401
