import os
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class FileRule(_CamelModel):
    mime_types: list[str] = Field(min_length=1)
    extensions: list[str] = Field(min_length=1)
    max_count: int = Field(gt=0)
    max_bytes: int = Field(gt=0)


class FloorPlanRule(FileRule):
    max_pdf_pages: int = Field(gt=0)


class PhotosRule(FileRule):
    min_count: int = Field(gt=0)


class DescriptionRule(_CamelModel):
    max_chars: int = Field(gt=0)


class AreaRule(_CamelModel):
    optional: bool
    exclusive_min: float = Field(ge=0)


class InputLimits(_CamelModel):
    floor_plan: FloorPlanRule
    photos: PhotosRule
    description: DescriptionRule
    area_square_meters: AreaRule


def load_input_limits(path: Path | None = None) -> InputLimits:
    """Read the shared limits file (INPUT_LIMITS_PATH overrides the repo default)."""
    repo_default = (
        Path(__file__).resolve().parents[1].parent.parent / "shared" / "input-limits.json"
    )
    resolved = path or Path(os.environ.get("INPUT_LIMITS_PATH") or repo_default)
    return InputLimits.model_validate_json(resolved.read_text(encoding="utf-8"))
