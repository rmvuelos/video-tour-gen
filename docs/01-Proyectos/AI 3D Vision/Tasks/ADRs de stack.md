---
title: "ADRs de stack"
aliases: ["ADRs de stack"]
tags: ["project", "ai-3d-vision", "task", "diseno", "not-started"]
type: task
project: "[[AI 3D Vision]]"
status: "Not started"
phase: "Diseño"
priority: "Medium"
effort: "Small"
updated: 2026-11-11
depends_on: ["[[Arquitectura del sistema]]", "[[Estimación de costes]]"]
blocks: ["[[Repo y CI|Repo + CI]]"]
---

# ADRs de stack

> [!abstract] Resumen
> Architecture Decision Records: frontend (React/TS + React Three Fiber), backend, proveedor de modelos de visión, almacenamiento y hosting.

## Criterios de aceptación

- [ ]  Un ADR por decisión (contexto, opciones, decisión, consecuencias)
- [ ]  Guardados en el repo (docs/adr)

## Stack propuesto

Propuesta de Adria, movida aquí desde Arquitectura y Entradas. Cada decisión necesita su ADR.
**Frontend — TypeScript** (editor 2D y visualizador 3D)

| Tecnología | Responsabilidad |
| --- | --- |
| React | UI |
| Vite | Build |
| Three.js | Motor 3D |
| R3F | Integración de Three.js con React |
| Drei | Controles 3D |
| Konva | Canvas 2D |
| Zustand | Estado |
| Tailwind | Estilos |
| react-dropzone, zod | Subida drag & drop y validaciones |
| pdfjs-dist | Previsualizar PDF y elegir página |

**Backend — Python** (API y visión por computador)

| Tecnología | Responsabilidad |
| --- | --- |
| FastAPI | API REST |
| Pydantic | Esquemas |
| OpenCV, NumPy | Visión por computador |
| Shapely | Geometría |
| PyMuPDF | Procesamiento de PDF |
| python-magic, Pillow | Validación real de archivos |
| PyTorch | ML (opcional) |
| Celery | Tareas en segundo plano |
| Redis | Broker de tareas |

**Datos e infraestructura**

| Tecnología | Responsabilidad |
| --- | --- |
| Supabase | Plataforma |
| PostgreSQL | Base de datos |
| Supabase Storage / S3 | Originales y archivos procesados |
| Docker | Despliegue |

## Decisiones abiertas

- [ ]  Almacenamiento: Supabase Storage (compatible con S3) o un bucket S3 aparte
- [ ]  PDF: PyMuPDF es AGPL-3.0 (obliga a publicar el código del backend) → cambiar a pypdfium2 o comprar la licencia de Artifex (ver [[Licencias de datasets y modelos]])
- [ ]  Modelo o proveedor de visión para el análisis espacial (hoy solo OpenCV): sale de [[Modelos de visión - segmentación y foto a habitación|Modelos de visión: segmentación y foto→habitación]]
