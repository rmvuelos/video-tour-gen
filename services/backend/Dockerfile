FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /usr/local/bin/uv
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_LINK_MODE=copy PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 \
    INPUT_LIMITS_PATH=/shared/input-limits.json
WORKDIR /app
COPY pyproject.toml uv.lock ./
# dev group included: one image serves api, worker and the test/lint jobs
RUN uv sync --frozen --no-install-project
COPY . .
CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]
