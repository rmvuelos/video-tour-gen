---
title: "Modelo de datos de la escena canónica"
aliases: ["Modelo de datos de la escena canónica"]
tags: ["project", "ai-3d-vision", "task", "diseno", "not-started"]
type: task
project: "[[AI 3D Vision]]"
status: "Not started"
phase: "Diseño"
priority: "Medium"
effort: "Medium"
updated: 2026-11-10
depends_on: ["[[Arquitectura del sistema]]"]
blocks: ["[[Diseño del editor pre-flight]]", "[[API y pipeline de jobs asíncrono]]", "[[Análisis de plano a layout 2D|Análisis de plano → layout 2D]]", "[[Lienzo 2D para dibujar el plano]]", "[[Guardar y reabrir proyectos]]"]
---

# Modelo de datos de la escena canónica

> [!abstract] Resumen
> Esquema único de escena (geometría, habitaciones, materiales, cámaras, anclas, confidence scores, flag de geometría estimada) y su mapeo a glTF/GLB.

## Criterios de aceptación

- [ ]  Esquema versionado con ejemplo
- [ ]  Lo usan tanto el modelo minimalista como el tour
- [ ]  Datos estimados vs. observados distinguibles
