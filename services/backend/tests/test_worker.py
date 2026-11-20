from app.worker import celery_app, ping


def test_ping_returns_pong_in_eager_mode() -> None:
    celery_app.conf.task_always_eager = True

    assert ping.delay().get() == "pong"
