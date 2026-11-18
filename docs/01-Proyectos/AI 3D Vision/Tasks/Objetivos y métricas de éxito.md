---
title: "Objetivos y métricas de éxito"
aliases: ["Objetivos y métricas de éxito"]
tags: ["project", "ai-3d-vision", "task", "planeacion", "in-progress"]
type: task
project: "[[AI 3D Vision]]"
status: "In progress"
phase: "Planeación"
priority: "High"
effort: "Small"
updated: 2026-11-11
assignees: ["Matteo Murcia"]
depends_on: ["[[PRD y alcance del MVP]]"]
blocks: ["[[Set de evaluación de modelos y métricas|Set de evaluación de modelos + métricas]]"]
---

# Objetivos y métricas de éxito

> [!abstract] Resumen
> Definir objetivos medibles del MVP: precisión del layout, tiempo de generación, coste por proyecto, % de prototipos aprobados sin edición.

## Criterios de aceptación

- [x]  3–5 métricas con valor objetivo numérico
- [x]  Método de medición definido para cada una

## Objetivos del MVP

1. **Validar la propuesta:** con un plano + 3–10 fotos se genera un pre-flight 3D lo bastante fiel como para que el usuario lo apruebe con pocas correcciones.
2. **Que sea rápido y barato:** el usuario ve su pre-flight en minutos y el coste por proyecto permite un modelo de negocio.
3. **Que llegue al final del flujo:** el usuario termina en el visor/tour virtual y puede exportarlo.

## Métricas de éxito

Valores objetivo iniciales: son hipótesis. Recalibrarlas tras [[Spike de viabilidad - plano a muros en Three.js|Spike de viabilidad: plano → muros en Three.js]] y [[Estimación de costes]].

| # | Métrica | Objetivo | Cómo se mide | Cuándo | Objetivo del MVP |
| --- | --- | --- | --- | --- | --- |
| 1 | Precisión del layout (IoU medio de habitaciones vs. ground truth) y error de escala | IoU ≥ 0,75 · error de escala ≤ 10 % con 1 medida de referencia | Script del [[Set de evaluación de modelos y métricas|Set de evaluación de modelos + métricas]] | En cada PR que toque el análisis de plano | 1 |
| 2 | Acierto foto → habitación (top-1) | ≥ 80 % | Script del set de evaluación | En cada PR que toque el mapeo | 1 |
| 3 | Tiempo hasta el pre-flight (p90, desde que termina la subida) | ≤ 2 min | Timestamps de los jobs en logs | Semanal en staging | 2 |
| 4 | Coste por proyecto (inferencia + almacenamiento) | ≤ 0,50 € | Facturación del proveedor ÷ nº de proyectos generados | Mensual | 2 |
| 5 | Aprobación y finalización: % de pre-flights aprobados con ≤ 5 ediciones · % de usuarios que llegan de la subida al tour | ≥ 60 % aprobados · ≥ 50 % llegan al tour | Eventos de analítica (subida, edición, aprobación, tour abierto) | En la demo y luego semanal | 1 y 3 |

## Límites que no deben romperse

- Visor/tour a ≥ 30 FPS en un portátil de gama media (móvil fuera del MVP) y carga inicial ≤ 5 s ([[QA de rendimiento 3D]]).
- Ninguna geometría inventada sin marcarla como estimada.

## Siguiente paso

- [ ]  Revisar y ajustar los valores objetivo entre los dos
- [ ]  Definir los eventos de analítica de la métrica 5 en el diseño de la API
