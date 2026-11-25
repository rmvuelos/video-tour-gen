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

MAX_RETRIES = 3  # transient Storage/DB outages, per job
BACKOFF_SECONDS = 5  # retry n waits 5 * 2**n: 5, 10, 20
BACKOFF_TOTAL_SECONDS = sum(BACKOFF_SECONDS * 2**n for n in range(MAX_RETRIES))
# Claims per job (the first run, the retries and the recoveries): stops a file that kills its
# worker (OOM) from looping forever.
MAX_ATTEMPTS = 5
# A `running` job claimed longer ago than this lost its worker (the hard limit already killed it).
STALE_RUNNING_SECONDS = HARD_TIME_LIMIT + HARD_MARGIN_SECONDS
# Redis redelivers unacked messages after this: it must outlast a whole run and its backoff.
VISIBILITY_TIMEOUT = HARD_TIME_LIMIT + BACKOFF_TOTAL_SECONDS + HARD_MARGIN_SECONDS
