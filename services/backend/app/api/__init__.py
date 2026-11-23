from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.auth import CurrentUserDep
from app.errors import install_error_handlers
from app.startup import validate_startup


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    validate_startup()  # fail fast when the process starts with a bad setup
    yield


app = FastAPI(title="video-tour-gen api", lifespan=lifespan)
install_error_handlers(app)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/me")
def me(user: CurrentUserDep) -> dict[str, str | None]:
    return {"id": str(user.id), "email": user.email}
