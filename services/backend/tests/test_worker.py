from app.worker import celery_app, ping
from app.worker.limits import BACKOFF_TOTAL_SECONDS, HARD_TIME_LIMIT


def test_ping_returns_pong_in_eager_mode() -> None:
    celery_app.conf.task_always_eager = True

    assert ping.delay().get() == "pong"


def test_a_lost_worker_gives_the_message_back_to_the_broker() -> None:
    conf = celery_app.conf

    assert conf.task_acks_late and conf.task_reject_on_worker_lost and conf.task_ignore_result
    assert conf.worker_prefetch_multiplier == 1
    # the broker must not redeliver a message that is still being worked on
    assert conf.broker_transport_options["visibility_timeout"] > HARD_TIME_LIMIT + BACKOFF_TOTAL_SECONDS
