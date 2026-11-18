---
title: "Guardar y reabrir proyectos"
aliases: ["Guardar y reabrir proyectos"]
tags: ["project", "ai-3d-vision", "task", "implementacion", "not-started"]
type: task
project: "[[AI 3D Vision]]"
status: "Not started"
phase: "Implementación"
priority: "Medium"
effort: "Medium"
updated: 2026-11-11
depends_on: ["[[Repo y CI|Repo + CI]]", "[[Modelo de datos de la escena canónica]]", "[[API y pipeline de jobs asíncrono]]"]
blocks: ["[[Aprobación y escena validada]]"]
---

# Guardar y reabrir proyectos

> [!abstract] Resumen
> Persistir el proyecto (entradas, escena, ediciones y versión aprobada) en Supabase/PostgreSQL y permitir reabrirlo sin perder trabajo, también tras un error.

## Criterios de aceptación

- [ ]  Lista de proyectos del usuario y reapertura en el punto donde se dejó
- [ ]  Las ediciones del pre-flight se guardan automáticamente
- [ ]  Un job fallido se puede reintentar sin perder el proyecto

## Flujo de desarrollo

- [ ]  Rama feature/nombre desde main
- [ ]  Tests escritos y en verde
- [ ]  PR con descripción y capturas
- [ ]  Review aprobada por el otro miembro
- [ ]  CI verde y merge
