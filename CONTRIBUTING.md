# Contribuir

**Una rama por tarea, commits pequeños con Conventional Commits, PR con plantilla, CI verde y revisión del otro miembro, rebase-merge a `main`.**

Fuente: `docs/01-Proyectos/AI 3D Vision/Tasks/Convenciones git y PRs.md`.

## 1. Ramas

- `main` siempre desplegable y protegida: sin push directo (el hook `pre-push` lo bloquea).
- Una rama por tarea, creada desde `main` actualizado, con el formato `tipo/descripcion-corta` (minúsculas y guiones).

| Prefijo     | Para                                         |
| ----------- | -------------------------------------------- |
| `feature/`  | Funcionalidad nueva                          |
| `fix/`      | Corrección de un bug                         |
| `refactor/` | Cambio interno sin cambiar el comportamiento |
| `docs/`     | Documentación y ADRs                         |
| `chore/`    | Configuración, dependencias, CI              |
| `spike/`    | Pruebas desechables. **Nunca se mergean**    |

- Ramas de vida corta (idealmente menos de 3 días). La rama se borra tras el merge.

## 2. Commits

- Formato [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/): `tipo(ámbito): descripción`. El ámbito es obligatorio.
- **Tipos:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
- **Ámbitos:** `frontend`, `backend`, `cv`, `scene`, `infra`, `docs`.
- Descripción en imperativo, de 72 caracteres como máximo; empieza en minúscula y los nombres propios se respetan. Ejemplo: `feat(cv): detectar muros con transformada de Hough`.
- Commits atómicos: un cambio lógico por commit, y el `test:` antes del `feat:`. Cada commit compila y pasa los tests.
- Cambios que rompen compatibilidad: `feat(scene)!: ...` y una línea `BREAKING CHANGE:` en el cuerpo.
- Nunca subir secretos: van en `.env.local` (ignorado por git) y se documentan en `.env.example`.
- `commitlint` valida el mensaje con un hook de `lefthook`. No se usa `--no-verify`.

## 3. Pull requests

- Un PR por tarea, pequeño (orientativamente menos de 400 líneas, sin contar archivos generados).
- Ábrelo pronto como borrador; márcalo como listo cuando cumpla la Definition of Done.
- El título sigue Conventional Commits y la descripción usa `.github/pull_request_template.md`, con la ruta de la tarea en `docs/`.
- Para mergear: CI en verde, una aprobación del otro miembro y la rama al día con `main`.
- Merge con **rebase**, hecho por el autor tras la aprobación.

## 4. Revisión

- En menos de 24 h laborables; si no puedes, avisa.
- Mirar: criterios de aceptación, claridad, tests, manejo de errores y seguridad (archivos subidos, secretos, datos de usuarios).
- Los comentarios que bloquean se explican; los menores llevan el prefijo `nit:`.
- Si toca el 3D o la UI, el revisor lo prueba en local y deja una captura.
- Las discrepancias de diseño se resuelven en un ADR.

## 5. Protección de `main` (configurar en GitHub)

- PR obligatorio, una aprobación (se descartan al llegar commits nuevos).
- CI en verde y rama al día; historial lineal y solo rebase-merge.
- Sin force-push ni borrado de `main`.

## 6. Versiones

- Tags semver en `main` (`v0.1.0` para la primera demo del MVP). El changelog sale de los commits.
