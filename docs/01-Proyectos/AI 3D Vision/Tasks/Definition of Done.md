---
title: "Definition of Done"
aliases: ["Definition of Done"]
tags: ["project", "ai-3d-vision", "task", "lanzamiento", "in-progress"]
type: task
project: "[[AI 3D Vision]]"
status: "In progress"
phase: "Lanzamiento"
priority: "High"
effort: "Small"
updated: 2026-11-11
depends_on: ["[[Convenciones git y PRs]]"]
---

# Definition of Done

> [!abstract] Resumen
> Checklist común para mover una tarea a Done: criterios de aceptación cumplidos, tests, review, merge, desplegado en staging y documentado.

## Criterios de aceptación

- [ ]  DoD escrito y enlazado desde el proyecto
- [ ]  Aplicado a todas las tareas de implementación

## [[Definition of Done]]

Una tarea pasa a **Done** solo si cumple la parte común y la de su tipo. Si algo no aplica, se indica en la tarea o en el PR.

### Todas las tareas

- [ ]  Criterios de aceptación de la tarea cumplidos y marcados
- [ ]  Revisado por el otro miembro
- [ ]  Decisiones abiertas convertidas en tareas del tracker o en ADRs
- [ ]  Enlace al resultado (PR, documento o ADR) en la tarea

### Código (Implementación, Testing)

- [ ]  Sigue las [[Convenciones git y PRs]]: PR aprobado, CI en verde y rebase-merge a main
- [ ]  Tests unitarios y de integración del cambio, y en verde; cobertura ≥ 80 % en el código nuevo
- [ ]  Lint y tipos sin errores; sin secretos ni código de depuración
- [ ]  Errores gestionados, con mensajes comprensibles para el usuario
- [ ]  Desplegado en staging y probado allí
- [ ]  Si toca el 3D o la UI: probado en Chrome y Firefox de escritorio, con captura en el PR
- [ ]  Si toca la IA o la visión: las métricas del set de evaluación no empeoran
- [ ]  README o ADR actualizados si cambia cómo se usa o se despliega

### Investigación y diseño

- [ ]  Conclusión y recomendación escritas, con las fuentes enlazadas
- [ ]  Licencias revisadas si se propone un modelo, dataset o librería
- [ ]  Riesgos nuevos añadidos a la [[Matriz de riesgos]]
