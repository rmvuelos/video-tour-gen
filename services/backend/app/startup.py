from app.limits import load_input_limits
from app.settings import get_settings


def validate_startup() -> None:
    """Fail fast when the environment or the shared input limits are unusable."""
    get_settings()
    load_input_limits()
