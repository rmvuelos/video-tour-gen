# video-tour-gen

A partir del plano de una vivienda y 3–10 fotos, genera una escena 3D que se recorre en primera persona y se exporta. Producto: **rooma**. Documentación en `docs/` (vault de Obsidian); convenciones en [CONTRIBUTING.md](CONTRIBUTING.md).

## Estructura

| Ruta               | Qué es                                                               |
| ------------------ | -------------------------------------------------------------------- |
| `apps/web`         | React + Vite + TypeScript + Tailwind v4                              |
| `services/backend` | Python (uv): `app.api` (FastAPI) y `app.worker` (Celery)             |
| `supabase/`        | Config de Supabase local (puertos 554xx)                             |
| `infra/`           | `docker-compose.yml`: redis, api y worker                            |
| `shared/`          | `input-limits.json`: límites de entrada que leen la web y el backend |

## Requisitos

Node 24+, pnpm 12, Docker (con compose) y uv. **El backend Python corre siempre en Docker**: en algunos equipos Windows `pydantic_core` no carga de forma nativa, y Celery no soporta Windows. No hace falta un venv local.

## Puesta en marcha

1. `pnpm install` (instala también los hooks de git con lefthook).
2. Copia los ejemplos de entorno y rellénalos (los reales van solo en `.env.local`, ignorado por git):
   - `apps/web/.env.example` a `apps/web/.env.local`
   - `services/backend/.env.example` a `services/backend/.env.local`
3. `pnpm dev`: arranca Supabase (sin Studio ni servicios innecesarios), el stack de Docker (redis, api en `:58000`, worker) y Vite.
4. Para parar: `pnpm stack:down` y `pnpm supabase:stop`.

El build de la web funciona sin secretos.

## Comandos

| Comando             | Qué hace                                                 |
| ------------------- | -------------------------------------------------------- |
| `pnpm lint`         | ESLint (web) y ruff (backend, en Docker)                 |
| `pnpm typecheck`    | tsc (web) y mypy (backend, en Docker)                    |
| `pnpm format:check` | prettier y `ruff format --check` (`pnpm format` arregla) |
| `pnpm test`         | Vitest (web) y pytest con cobertura (backend, en Docker) |
| `pnpm e2e`          | Playwright (smoke contra `vite preview`)                 |

En Windows, Playwright usa el Edge del sistema; en otros sistemas ejecuta antes `pnpm --filter web exec playwright install chromium`.
