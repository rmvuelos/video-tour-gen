from typing import Any

from celery import Celery, signals

from app.settings import Settings, get_settings
from app.startup import validate_startup

celery_app = Celery("worker")


def configure_celery(settings: Settings) -> None:
    celery_app.conf.broker_url = settings.redis_url
    celery_app.conf.result_backend = settings.redis_url


@signals.celeryd_init.connect
def _configure_on_start(**_: Any) -> None:
    validate_startup()  # validates the environment and limits at worker start
    configure_celery(get_settings())


@celery_app.task(name="ping")
def ping() -> str:
    return "pong"
