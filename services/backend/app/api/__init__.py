from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.auth import CurrentUserDep
from app.db import create_pool
from app.errors import install_error_handlers
from app.files import router as files_router
from app.projects import router as projects_router
from app.startup import validate_startup
from app.storage import create_storage


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    validate_startup()  # fail fast when the process starts with a bad setup
    app.state.pool = create_pool()
    app.state.storage = create_storage()
    try:
        yield
    finally:
        app.state.pool.close()
        app.state.storage.close()


app = FastAPI(title="video-tour-gen api", lifespan=lifespan)
install_error_handlers(app)
app.include_router(projects_router)
app.include_router(files_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/me")
def me(user: CurrentUserDep) -> dict[str, str | None]:
    return {"id": str(user.id), "email": user.email}
