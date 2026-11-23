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

## Verificación

`pnpm verify:ci` reproduce en local, en orden y parando en el primer fallo, los jobs de `.github/workflows/ci.yml` con el mismo entorno (`CI=1`, `IGNORE_LOCAL_ENV=1`, sin `.env.local` ni `VITE_*`): `web-quality` (eslint, tsc, prettier, knip), `web-test` (vitest con cobertura), `web-build`, `py-quality` y `py-test` (en la imagen Docker del backend), `e2e` (smoke con Playwright), `db` (Supabase local: `db reset` y tests pgTAP con `supabase test db`), `security` (gitleaks sobre todo el historial en Docker, `pnpm audit`, `pip-audit`) y `commits` (commitlint y sin atribución a la IA, contra `origin/main`). Termina con un resumen ✔/✖ y la duración de cada job; con las imágenes ya descargadas tarda cerca de un minuto (más la primera vez). Ejecútalo antes de abrir un PR.

Detalles:

- La CI ejecuta Python en la misma imagen (`docker compose build` y `run`), no con `setup-python`. `infra/docker-compose.ci.yml` impide que el contenedor lea `services/backend/.env.local`.
- Cobertura mínima del 80 % en `apps/web/src/lib/**` (líneas, funciones, ramas) y en `services/backend/app`. El umbral de la web se evalúa sobre los archivos que cumplan `coverage.include` en `apps/web/vite.config.ts`: con `src/lib` vacío pasa, y se aplica en cuanto haya archivos.
- knip se configura en `knip.jsonc`; las excepciones llevan su motivo.
- Las acciones de terceros están fijadas por SHA de commit (el tag va en un comentario) y gitleaks por versión de imagen; se actualizan a mano.
- El e2e de la CI solo cubre la web. Supabase, api y worker se añaden en la fase 3.

### Protección de `main`

La configura el owner del repositorio (Settings, Branches, regla para `main`), según CONTRIBUTING §5:

- Require a pull request before merging, con una aprobación y "Dismiss stale approvals" al llegar commits nuevos.
- Require status checks to pass y "Require branches to be up to date": `web-quality`, `web-test`, `web-build`, `py-quality`, `py-test`, `e2e`, `db`, `security` y `commits`.
- Require linear history y solo "Rebase and merge" permitido.
- Sin force-push ni borrado de `main`.

Cualquier cambio en `.github/`, `scripts/` o la configuración de gitleaks necesita la revisión del otro miembro del equipo. No usamos CODEOWNERS: somos dos y la aprobación ya es obligatoria.
