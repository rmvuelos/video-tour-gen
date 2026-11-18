---
title: "Lienzo 2D para dibujar el plano"
aliases: ["Lienzo 2D para dibujar el plano"]
tags: ["project", "ai-3d-vision", "task", "implementacion", "not-started"]
type: task
project: "[[AI 3D Vision]]"
status: "Not started"
phase: "Implementación"
priority: "Medium"
effort: "Large"
updated: 2026-11-11
depends_on: ["[[Repo y CI|Repo + CI]]", "[[Modelo de datos de la escena canónica]]", "[[Wireframes de pantallas clave]]"]
---

# Lienzo 2D para dibujar el plano

> [!abstract] Resumen
> Alternativa a subir un plano: el usuario dibuja la planta en un canvas 2D (Konva) e introduce los m² o una medida de referencia para fijar la escala.

## Criterios de aceptación

- [ ]  Dibujar y editar muros, aberturas y habitaciones con snapping
- [ ]  Validación geométrica: polígonos cerrados, sin intersecciones
- [ ]  Escala fijada con m² o una medida de referencia
- [ ]  El resultado se guarda en el formato de escena canónica, igual que el análisis de un plano subido

## Flujo de desarrollo

- [ ]  Rama feature/nombre desde main
- [ ]  Tests escritos y en verde
- [ ]  PR con descripción y capturas
- [ ]  Review aprobada por el otro miembro
- [ ]  CI verde y merge
