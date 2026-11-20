# Dev image (includes the dev group); the production multi-stage image without dev deps goes in the deploy phase.
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /usr/local/bin/uv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_LINK_MODE=copy PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 INPUT_LIMITS_PATH=/shared/input-limits.json \
    RUFF_CACHE_DIR=/tmp/.ruff_cache MYPY_CACHE_DIR=/tmp/.mypy_cache COVERAGE_FILE=/tmp/.coverage \
    PYTEST_ADDOPTS="-o cache_dir=/tmp/.pytest_cache"
RUN useradd --create-home app && mkdir /opt/venv /app /shared && chown app /opt/venv /app /shared
USER app
WORKDIR /app
COPY --chown=app pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project
COPY --chown=app . .
COPY --from=shared --chown=app input-limits.json /shared/
CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]
