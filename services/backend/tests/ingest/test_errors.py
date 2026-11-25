import copy
import pickle

import pytest

from app.ingest import IngestError, IngestErrorCode


@pytest.mark.parametrize(
    "clone", [lambda e: pickle.loads(pickle.dumps(e)), copy.copy, copy.deepcopy]
)
def test_error_survives_pickle_and_copy(clone: object) -> None:
    restored = clone(IngestError(IngestErrorCode.PDF_ENCRYPTED))  # type: ignore[operator]

    assert isinstance(restored, IngestError)
    assert restored.code is IngestErrorCode.PDF_ENCRYPTED
    assert str(restored) == "pdf_encrypted"
