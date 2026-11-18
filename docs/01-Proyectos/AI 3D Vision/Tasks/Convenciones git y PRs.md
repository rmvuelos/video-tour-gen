---
title: "Convenciones git y PRs"
aliases: ["Convenciones git y PRs"]
tags: ["project", "ai-3d-vision", "task", "lanzamiento", "review"]
type: task
project: "[[AI 3D Vision]]"
status: "Review"
phase: "Lanzamiento"
priority: "High"
effort: "Small"
updated: 2026-11-11
blocks: ["[[Repo y CI|Repo + CI]]", "[[Definition of Done]]"]
---

# Convenciones git y PRs

> [!abstract] Resumen
> Acordar flujo: rama por feature desde main, conventional commits, PR pequeño con plantilla, revisión obligatoria del otro miembro, merge solo con CI verde.

## Criterios de aceptación

- [ ]  `CONTRIBUTING.md` con convenciones de ramas, commits y PRs
- [ ]  Plantilla de PR en el repo
- [ ]  Acordado por ambos

## Resumen

**Una rama por tarea → commits pequeños con Conventional Commits → PR con plantilla → CI verde + revisión del otro → rebase-merge a main.** Este texto es el borrador del `CONTRIBUTING.md`; se copia al repo en [[Repo y CI|Repo + CI]].

## 1. Ramas

- `main` siempre desplegable y protegida: sin push directo.
- Una rama por tarea del tracker, creada desde `main` actualizado.
- Formato `tipo/descripcion-corta`, en minúsculas y con guiones.

| Prefijo | Para | Ejemplo |
| --- | --- | --- |
| feature/ | Funcionalidad nueva | feature/ingesta-archivos |
| fix/ | Corrección de un bug | fix/escala-pdf-multipagina |
| refactor/ | Cambio interno sin cambiar el comportamiento | refactor/pipeline-muros |
| docs/ | Documentación y ADRs | docs/adr-almacenamiento |
| chore/ | Configuración, dependencias, CI | chore/ci-lint-backend |
| spike/ | Pruebas desechables. **Nunca se mergean**: las conclusiones van a Notion | spike/plano-muros-threejs |
- Ramas de vida corta: idealmente menos de 3 días. Si una tarea es más grande, se parte.
- La rama se borra después del merge.

## 2. Commits

- Formato [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/): `tipo(ámbito): descripción`.
- **Tipos:** feat, fix, refactor, docs, test, chore, perf, ci.
- **Ámbitos:** frontend, backend, cv (visión), scene (escena canónica), infra, docs.
- Descripción en imperativo y en minúsculas, de 72 caracteres como máximo. Ejemplo: `feat(cv): detectar muros con transformada de Hough`.
- **Commits atómicos:** un cambio lógico por commit. Un PR puede tener muchos commits; cada uno debe compilar y pasar los tests.
- Cambios que rompen compatibilidad: `feat(scene)!: ...` y una línea `BREAKING CHANGE:` en el cuerpo.
- Nunca subir secretos: van en `.env` (ignorado por git) y se documentan en `.env.example`.

## 3. Pull requests

- Un PR por tarea, pequeño: orientativamente menos de 400 líneas cambiadas, sin contar los archivos generados.
- Abrirlo pronto como **borrador** para enseñar el avance; se marca como listo cuando cumple la [[Definition of Done]].
- **El título sigue Conventional Commits** y la descripción usa la plantilla de abajo, con el enlace a la tarea de Notion.
- **Para mergear:** CI en verde, una aprobación del otro miembro y la rama al día con `main`.
- **Merge con rebase**, para que el historial quede lineal y se conserven los commits atómicos. Lo hace el autor del PR después de la aprobación.
- **Al mergear,** se mueve la tarea a Done en el tracker, si cumple la DoD.

## 4. Revisión

- La revisión se hace en menos de 24 h laborables. Si no puedes, avisa.
- **Qué mirar:** que cumpla los criterios de aceptación de la tarea, la claridad, los tests, el manejo de errores y la seguridad (archivos subidos, secretos, datos de usuarios).
- **Comentarios:** los que bloquean se explican; los menores van con el prefijo `nit:` y no bloquean.
- **Si toca el 3D o la UI:** el revisor lo prueba en local o en el preview y deja una captura.
- Las discrepancias de diseño se resuelven en un ADR, no en hilos largos de comentarios.

## 5. Protección de main (configurar en GitHub)

- [ ]  Requerir PR antes de mergear
- [ ]  Requerir una aprobación y que se descarten las aprobaciones si llegan commits nuevos
- [ ]  Requerir que pasen las comprobaciones de CI y que la rama esté al día
- [ ]  Requerir historial lineal; permitir solo rebase-merge
- [ ]  Bloquear el force-push y el borrado de main

## 6. Versiones

- Tags semver en `main`: `v0.1.0` para la primera demo del MVP.
- El changelog se genera a partir de los commits (`feat` → novedades, `fix` → correcciones).

## Plantilla de PR (`.github/pull_request_template.md`)

```markdown
## Qué y por qué
<!-- Qué cambia y por qué. Una o dos frases. -->

## Tarea
<!-- Enlace a la tarea de Notion -->

## Cómo probarlo
1.
2.

## Capturas o vídeo
<!-- Obligatorio si cambia la UI o el 3D -->

## Checklist
- [ ] Cumple los criterios de aceptación de la tarea
- [ ] Tests añadidos o actualizados, y en verde
- [ ] Sin secretos, sin código de depuración
- [ ] Documentación o ADR actualizados si hace falta
```
