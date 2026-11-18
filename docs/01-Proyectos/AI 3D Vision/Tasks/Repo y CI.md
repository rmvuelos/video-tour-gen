---
title: "Repo + CI"
aliases: ["Repo y CI"]
tags: ["project", "ai-3d-vision", "task", "implementacion", "not-started"]
type: task
project: "[[AI 3D Vision]]"
status: "Not started"
phase: "Implementación"
priority: "High"
effort: "Small"
updated: 2026-11-10
depends_on: ["[[ADRs de stack]]", "[[Convenciones git y PRs]]"]
blocks: ["[[Ingesta y validación de archivos]]", "[[Estrategia y setup de tests]]", "[[Deploy staging y producción|Deploy staging + producción]]", "[[Lienzo 2D para dibujar el plano]]", "[[Guardar y reabrir proyectos]]"]
---

# Repo + CI

> [!abstract] Resumen
> Crear repositorio, estructura base (React/TS + R3F), lint, formato, tests y pipeline de CI en cada PR.

## Criterios de aceptación

- [ ]  Repo creado con README y estructura base
- [ ]  CI ejecuta lint + tests + build en cada PR
- [ ]  main protegida (PR + review + CI verde obligatorios)

## Flujo de desarrollo

- [ ]  Rama feature/<nombre> desde main
- [ ]  Tests escritos y en verde
- [ ]  PR con descripción y capturas
- [ ]  Review aprobada por el otro miembro
- [ ]  CI verde y merge
