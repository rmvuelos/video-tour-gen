# video-tour-gen

## Proyecto

Qué es: a partir del plano de una vivienda y 3–10 fotos, genera una escena 3D que se recorre en primera persona y se exporta (GLB o web en un ZIP). MVP solo de escritorio.

Stack:
- Web: React + Vite + TypeScript, Tailwind v4, Zustand, zod, react-dropzone, pdfjs-dist, supabase-js; R3F en partes posteriores.
- Backend: Python con uv (`services/backend`): FastAPI (`api`) y Celery + Redis (`worker`), Pillow y pypdfium2.
- Datos: Supabase (Postgres, Auth, Storage) local con su CLI; Docker para Redis, la API y el worker.

Documentación del producto: `docs/01-Proyectos/AI 3D Vision/` (PRD, Entradas y límites, Convenciones git y PRs, Definition of Done, tareas).
Planning (plan por fases, `decisions.md`, `reviews/`, `design/`): fuera del repo, en `../video-tour-gen-planning/`. Si no existe en tu máquina, trabaja desde la tarea de `docs/` y la descripción del PR.

## Roles

- El humano decide el alcance y el gasto, crea las cuentas, pega los secretos en `.env.local` y aprueba cada gate de diseño.
- Cada PR lo revisa y aprueba el otro miembro del equipo. El merge lo hace el autor, con **rebase-merge**, después de la aprobación y con la CI en verde.
- La sesión principal orquesta: planifica, delega, revisa diffs y verifica. No escribe el código de las features.
- Los subagentes ejecutan tareas acotadas con TDD.

## Reglas no negociables

- Convenciones del equipo (`docs/.../Convenciones git y PRs.md`):
  - Una rama por tarea, desde `main` actualizado: `feature/`, `fix/`, `refactor/`, `docs/`, `chore/` o `spike/` (las `spike/` nunca se mergean).
  - Conventional Commits con ámbito: frontend, backend, cv, scene, infra o docs. Commits atómicos, con el `test:` antes del `feat:`.
- Sin atribución a la IA: ni `Co-Authored-By` ni "Generated with…", tampoco en los PRs. Repetírselo a cada subagente.
- Nunca `--no-verify`. Nunca push sin confirmación del humano. Nunca merge desde la IA.
- Los planes, los informes de review y las capturas van al planning, nunca al repo.
- Secretos:
  - Solo en `.env.local`. Nunca pedirlos por el chat ni imprimirlos.
  - Para comprobar que existen: `grep -c NOMBRE .env.local`.
  - En los tests, valores de baja entropía para que gitleaks no salte.
- Las fotos de los usuarios nunca salen de nuestra infraestructura: nada de APIs de visión externas. Los derivados se guardan sin EXIF ni GPS.
- Los archivos originales nunca se modifican; los derivados van aparte.
- "Listo" significa:
  - `pnpm verify:ci` en verde;
  - la conclusión del run de CI en verde (`gh run watch`);
  - la Definition of Done cumplida.
- Si un permiso o un hook bloquea algo, no esquivarlo: explicárselo al humano y que decida.
- Al cerrar cada fase, marcar el plan con checks y "Resultado real" (cifras, versiones, problemas).
- Avisar de una cuenta externa una fase antes de necesitarla.

## Bucle por rama

1. `git checkout main && git pull --ff-only && git checkout -b <tipo>/<nombre>`
2. Delegar con el prompt plantilla (abajo), en segundo plano.
3. Revisar el diff local:
   - `/ecc:code-review`;
   - el especialista del área: `ecc:security-reviewer` (auth, uploads), `ecc:database-reviewer` (esquema, RLS), `ecc:react-reviewer` + `ecc:a11y-architect` (UI) o `ecc:python-reviewer` (backend).
4. Correcciones: continuar el mismo agente con SendMessage.
5. El ejecutor ejecuta `pnpm verify:ci` una vez; el orquestador lee su salida.
6. Actualizar el plan, pedir confirmación, push, `gh pr create` (con la plantilla del repo) y `gh run watch`. Avisar para la review.

## Modelo por tarea

| Tarea | subagent_type | model |
|---|---|---|
| Configs, renombrados, fixes de 1–5 líneas, verificación | general-purpose | haiku |
| Features, UI, tests, correcciones de review | general-purpose / ecc:tdd-guide | sonnet |
| Review por PR | ecc:*-reviewer | sonnet |
| Review de seguridad final, arquitectura | ecc:security-reviewer / ecc:architect | opus |
| Fases independientes en paralelo | cualquiera + `isolation: "worktree"` | — |

Tareas pequeñas, `run_in_background: true` y "commit a medida que avanzas". Si un agente pasa de unas 100 llamadas a herramientas, la tarea era grande y hay que partirla.

## Prompt plantilla del ejecutor

```
Repo <ruta>, rama <rama> (desde <sha>). Stack: ver CLAUDE.md.
REGLAS: commits convencionales atómicos con ámbito (test antes de feat); sin atribución a la IA
(ni la palabra "claude" en los mensajes); nunca --no-verify; NO push ni merge; commit a medida
que avanzas; no modificar .env.local; ninguna API externa de visión; los planes viven en el planning.
LEE PRIMERO: <plan/fase-XX.md, tarea de docs/, archivos clave>.
TAREAS: <lista numerada con criterios concretos>.
VERIFICA: `pnpm verify:ci` en verde + <checks específicos>. Detén lo que arranques.
INFORME (español, conciso): commits, decisión por tarea, verificación, riesgos y qué NO comprobaste.
```

## Diseño

Figma **rooma** (`5unPeruE2TiPBhoQb9V0IB`): frames 01 Uploader, 02 AI Preflight, 03 3D Generation & Export y la paleta "Caramel light" (DM Sans).
- Valores exactos por la API REST de Figma (`/files/:key/nodes`, `/images`), con el token fuera del repo. Nada se estima a ojo.
- Tokens en el `@theme` de Tailwind. Ningún color, tamaño o radio sale de un componente sin venir de un token; un token se corrige en su sitio.
- Cada pantalla: captura a 1920×1080, diff de píxeles frente al frame y regresión visual con `toHaveScreenshot`.
- Lo no diseñado (estados, login, errores) se deriva de los tokens y se anota para el README.
- UI en inglés, como el Figma. Solo tema claro. En las entradas manda el PRD: sin vídeo ni CAD, aunque el Figma los mencione.
