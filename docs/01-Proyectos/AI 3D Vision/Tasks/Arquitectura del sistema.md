---
title: "Arquitectura del sistema"
aliases: ["Arquitectura del sistema"]
tags: ["project", "ai-3d-vision", "task", "diseno", "not-started"]
type: task
project: "[[AI 3D Vision]]"
status: "Not started"
phase: "Diseño"
priority: "Medium"
effort: "Medium"
updated: 2026-11-11
depends_on: ["[[Spike de viabilidad - plano a muros en Three.js|Spike de viabilidad: plano → muros en Three.js]]", "[[Modelos de visión - segmentación y foto a habitación|Modelos de visión: segmentación y foto→habitación]]"]
blocks: ["[[Modelo de datos de la escena canónica]]", "[[ADRs de stack]]", "[[API y pipeline de jobs asíncrono]]"]
---

# Arquitectura del sistema

> [!abstract] Resumen
> Diagrama de componentes: ingesta, análisis espacial IA, escena canónica, editor pre-flight, visor/tour y pipeline de export.

## Criterios de aceptación

- [ ]  Diagrama de componentes y flujo de datos
- [ ]  Responsabilidades y límites de cada componente
- [ ]  Revisado por ambos

## Stack

El stack propuesto (frontend, backend, datos e infraestructura) está en [[ADRs de stack]].
