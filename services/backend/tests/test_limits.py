from app.limits import load_input_limits


def test_loads_documented_mvp_limits() -> None:
    limits = load_input_limits()

    assert limits.floor_plan.max_bytes == 20 * 1024 * 1024
    assert limits.floor_plan.max_count == 1
    assert limits.floor_plan.max_pdf_pages == 50
    assert limits.photos.max_bytes == 12 * 1024 * 1024
    assert (limits.photos.min_count, limits.photos.max_count) == (3, 10)
    assert limits.description.max_chars == 2000
    assert limits.area_square_meters.exclusive_min == 0


def test_declares_mime_types_and_extensions() -> None:
    limits = load_input_limits()

    assert "application/pdf" in limits.floor_plan.mime_types
    assert ".webp" in limits.photos.extensions
    assert "image/webp" not in limits.floor_plan.mime_types
