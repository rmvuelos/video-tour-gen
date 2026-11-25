from typing import Any

from celery import Celery, signals

from app.settings import Settings, get_settings
from app.startup import validate_startup
from app.worker.limits import VISIBILITY_TIMEOUT

celery_app = Celery("worker", include=["app.worker.ingest"])
celery_app.conf.update(
    task_acks_late=True,  # the message leaves the broker only after the task ends...
    task_reject_on_worker_lost=True,  # ...and a killed worker process gives it back
    worker_prefetch_multiplier=1,  # one long task per process; do not hoard messages
    task_ignore_result=True,  # nobody reads results: the state lives in the database
    broker_transport_options={"visibility_timeout": VISIBILITY_TIMEOUT},
)


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
