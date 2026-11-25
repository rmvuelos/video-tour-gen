"""Time limits of the ingest task, derived from what one job can contain."""

from app.ingest.sandbox import Limits
from app.limits import load_input_limits
from app.storage import TRANSFER_SECONDS

HARD_MARGIN_SECONDS = 60  # between the soft limit (cleanup runs) and the kill
# One file = download + child + two uploads, each bounded by its own timeout.
PER_FILE_SECONDS = 3 * TRANSFER_SECONDS + Limits().wall_seconds
MAX_FILES = 1 + load_input_limits().photos.max_count  # one plan and the photos
SOFT_TIME_LIMIT = int(MAX_FILES * PER_FILE_SECONDS)
HARD_TIME_LIMIT = SOFT_TIME_LIMIT + HARD_MARGIN_SECONDS
