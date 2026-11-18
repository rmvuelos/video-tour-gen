---
title: "Ingesta y validación de archivos"
aliases: ["Ingesta y validación de archivos"]
tags: ["project", "ai-3d-vision", "task", "implementacion", "not-started"]
type: task
project: "[[AI 3D Vision]]"
status: "Not started"
phase: "Implementación"
priority: "Medium"
effort: "Medium"
updated: 2026-11-11
depends_on: ["[[Repo y CI|Repo + CI]]", "[[API y pipeline de jobs asíncrono]]", "[[Entradas soportadas y límites]]"]
blocks: ["[[Análisis de plano a layout 2D|Análisis de plano → layout 2D]]"]
---

# Ingesta y validación de archivos

> [!abstract] Resumen
> Subida de plano (PDF/PNG/JPG), 3–10 fotos, m² y descripción opcionales; validación en cliente y servidor según la tarea Entradas, almacenamiento y preprocesado (PyMuPDF, OpenCV). Video fuera del MVP.

## Criterios de aceptación

- [ ]  Subida con progreso y validación de formato/tamaño/cantidad
- [ ]  Archivos guardados y organizados por proyecto
- [ ]  PDF multipágina: el usuario elige la página de la planta; originales y derivados se guardan por separado

## Flujo de desarrollo

- [ ]  Rama feature/<nombre> desde main
- [ ]  Tests escritos y en verde
- [ ]  PR con descripción y capturas
- [ ]  Review aprobada por el otro miembro
- [ ]  CI verde y merge
