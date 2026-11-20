from typing import Any

from celery import Celery, signals

from app.settings import Settings, get_settings

celery_app = Celery("worker")


def configure_celery(settings: Settings) -> None:
    celery_app.conf.broker_url = settings.redis_url
    celery_app.conf.result_backend = settings.redis_url


@signals.celeryd_init.connect
def _configure_on_start(**_: Any) -> None:
    configure_celery(get_settings())  # validates the environment at worker start


@celery_app.task(name="ping")
def ping() -> str:
    return "pong"
