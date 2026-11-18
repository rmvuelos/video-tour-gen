---
title: "Licencias de datasets y modelos"
aliases: ["Licencias de datasets y modelos"]
tags: ["project", "ai-3d-vision", "task", "investigacion", "in-progress"]
type: task
project: "[[AI 3D Vision]]"
status: "In progress"
phase: "Investigación"
priority: "Medium"
effort: "Small"
updated: 2026-11-11
assignees: ["Matteo Murcia", "Adria Martinez"]
depends_on: ["[[Estado del arte - plano a 3D|Estado del arte: plano → 3D]]"]
blocks: ["[[Set de evaluación de modelos y métricas|Set de evaluación de modelos + métricas]]", "[[Modelos de visión - segmentación y foto a habitación|Modelos de visión: segmentación y foto→habitación]]"]
---

# Licencias de datasets y modelos

> [!abstract] Resumen
> Identificar datasets de planos y escenas interiores y revisar las licencias de datasets y de modelos preentrenados (visión, profundidad, reconstrucción) para saber cuáles permiten uso comercial.

## Criterios de aceptación

- [ ]  Lista de datasets con licencia y uso permitido (comercial o no)
- [ ]  Dataset elegido para el set de evaluación
- [ ]  Lista de modelos candidatos con licencia del checkpoint concreto, verificada en el repositorio oficial (no en mirrors)
- [ ]  Cada modelo marcado como ✅ uso comercial / ❌ no comercial / ⚠️ dudoso

## Modelos a revisar

Salen de [[Estado del arte - reconstrucción desde fotos|Estado del arte: reconstrucción desde fotos]] y [[Modelos de visión - segmentación y foto a habitación|Modelos de visión: segmentación y foto→habitación]].

- [x]  Depth Anything 3: Metric Large y modelos any-view
- [x]  MoGe y Metric3D
- [x]  VGGT
- [x]  DUSt3R y MASt3R
- [x]  Modelos de segmentación y foto→habitación: SAM 2 y SigLIP 2 (Apache 2.0), DINOv2 (Apache 2.0), Grounding DINO (Apache 2.0 el código, confirmar pesos), SAM 3 (SAM License: comercial OK salvo uso militar), modelos entrenados con ADE20K (imágenes solo no comerciales, evitar)
- [x]  gsplat y 3DGS original (para v2)
- [x]  Planos: dataset y modelo de CubiCasa5K, MitUNet, Raster-to-Graph, FloorplanVLM
- [x]  OCR: Tesseract y PaddleOCR

## Resultado (revisado el 11/11/2026)

✅ uso comercial · ❌ no comercial · ⚠️ dudoso o con condiciones. Fuente: repositorio oficial salvo que se indique.

| Recurso | Licencia | Uso comercial | Nota |
| --- | --- | --- | --- |
| Depth Anything 3 — Metric Large, Mono Large, Base, Small | Apache 2.0 (código y pesos) | ✅ | Candidato principal para profundidad monocular |
| Depth Anything 3 — Large, Giant, Nested (any-view) | CC BY-NC 4.0 | ❌ |  |
| MoGe-2 | Código MIT; pesos MIT (ficha de Hugging Face) | ✅ | Alternativa a Depth Anything 3 |
| Metric3D | Código BSD-2; pesos sin licencia publicada | ⚠️ | Los autores piden contactar para uso comercial |
| VGGT — VGGT-1B-Commercial | Licencia propia de Meta | ✅ | Excluye uso militar; hay que solicitar acceso. El checkpoint original es no comercial |
| DUSt3R y MASt3R | CC BY-NC-SA 4.0 + licencias de sus datasets | ❌ | Descartados |
| gsplat | Apache 2.0 | ✅ | Para v2 |
| 3D [[Gaussian Splatting]] original (Inria) | Solo investigación | ❌ | Usar gsplat en su lugar |
| CubiCasa5K (dataset) | CC BY-NC 4.0 (GitHub) / CC BY-NC-SA 4.0 (Zenodo) | ❌ | Solo para investigación en el Spike, no para entrenar el modelo del producto |
| MitUNet | Código MIT; pesos CC BY-NC 4.0 (entrenados con CubiCasa5K) | ⚠️ | El código se puede usar; los pesos no. Habría que reentrenar con datos propios |
| Raster-to-Graph | Código GPL-3.0; pesos y datos con términos propios | ⚠️ | Copyleft; los datos requieren solicitud |
| FloorplanVLM | Sin código ni pesos publicados (solo el benchmark FPBench-2K) | ❌ | No disponible |
| Structured3D (dataset) | Términos de uso propios; código MIT | ⚠️ | Leer los términos antes de usarlo |
| Tesseract, PaddleOCR | Apache 2.0 | ✅ | No revisado en el repo esta vez; licencia conocida |
| OpenCV, Shapely | Apache 2.0, BSD | ✅ |  |
| PyMuPDF (en el stack actual) | AGPL-3.0 o licencia comercial de Artifex | ⚠️ | En un servicio web, AGPL obliga a publicar el código del backend. Alternativa: pypdfium2 (Apache/BSD) |

## Qué implica

- **El pipeline recomendado para el MVP es comercialmente limpio:** visión clásica (OpenCV, Shapely), profundidad con Depth Anything 3 Metric o MoGe-2 y OCR con Tesseract o PaddleOCR.
- **PyMuPDF es el único problema del stack actual.** Hay que decidir en [[ADRs de stack]]: cambiar a pypdfium2 o comprar la licencia.
- **No hay un modelo de planos preentrenado con licencia comercial.** Si el Spike demuestra que hace falta deep learning para los muros, habrá que entrenar con planos propios o con licencia. Ese coste va en [[Estimación de costes]].
- **El set de evaluación del producto no puede basarse en CubiCasa5K:** hay que reunir planos reales con permiso.

## Pendiente

- [ ]  Leer los términos de Structured3D y de los datos de Raster-to-Graph
- [ ]  Contactar a los autores de Metric3D solo si hace falta como alternativa
- [ ]  Confirmar la licencia de los pesos de Grounding DINO
