---
title: "Estado del arte: reconstrucción desde fotos"
aliases: ["Estado del arte - reconstrucción desde fotos"]
tags: ["project", "ai-3d-vision", "task", "investigacion", "in-progress"]
type: task
project: "[[AI 3D Vision]]"
status: "In progress"
phase: "Investigación"
priority: "Medium"
effort: "Medium"
updated: 2026-11-11
assignees: ["Matteo Murcia", "Adria Martinez"]
depends_on: ["[[Entradas soportadas y límites]]"]
blocks: ["[[Modelos de visión - segmentación y foto a habitación|Modelos de visión: segmentación y foto→habitación]]"]
---

# Estado del arte: reconstrucción desde fotos

> [!abstract] Resumen
> Comparar profundidad monocular, fotogrametría, NeRF y Gaussian Splatting para pocas fotos (incluye referencia http://alexanderell.is/posts/3d-scan).

## Criterios de aceptación

- [ ]  Comparativa de calidad, nº de fotos necesario, coste y tiempo
- [ ]  Qué entra en el MVP y qué en v2

## Conclusión

Con 3–10 fotos de interior **ninguna técnica reconstruye una habitación completa y fiable**: las paredes lisas tienen poca textura y las fotos se solapan poco. Por eso, en el MVP **el plano manda la geometría** y las fotos solo **orientan y dan apariencia**, como dice el [[PRD y alcance del MVP]]. NeRF, [[Gaussian Splatting]] y fotogrametría quedan para v2.

## Comparativa

Cifras orientativas (nº de fotos y tiempos dependen del hardware y de la escena). Las licencias hay que confirmarlas en el repositorio oficial antes de usar nada.

| Técnica | Ejemplos | Fotos necesarias | Qué da con pocas fotos de interior | Coste y tiempo | Licencias | Encaje |
| --- | --- | --- | --- | --- | --- | --- |
| Fotogrametría clásica (SfM + MVS) | COLMAP, Meshroom | Decenas a cientos, con mucho solape | Falla: sin textura en paredes y poco solape no hay correspondencias | Minutos a horas | COLMAP BSD (comercial OK) | ❌ No |
| NeRF | Nerfstudio, Instant-NGP | Decenas o más, con poses | Vistas borrosas y geometría pobre con pocas vistas | GPU, minutos a horas por escena | Mixtas; Instant-NGP no comercial | ❌ No (I+D) |
| [[Gaussian Splatting]] clásico | 3DGS, gsplat | Decenas, con poses | Fotorrealista si hay muchas fotos; no es una malla editable | GPU, minutos por escena | 3DGS original no comercial; gsplat Apache 2.0 | 🔜 v2 (fotorrealismo) |
| Gaussian Splatting para pocas vistas, sin poses | FLARE, SPFSplatV2, InstantSplat | 2–10 | Prometedor en investigación (FLARE muestra un dormitorio con 6 fotos poco solapadas), pero sin garantía de geometría correcta | GPU, segundos a minutos | Revisar caso a caso | 🔜 v2 (I+D) |
| Reconstrucción multivista feed-forward | DUSt3R, MASt3R, VGGT y derivados | 2–30, sin poses | Nube de puntos y posición relativa de las cámaras en segundos; ruidosa, útil para saber qué fotos ven lo mismo | GPU, segundos | DUSt3R/MASt3R CC BY-NC-SA (no comercial); VGGT revisar | 🔜 v2 (alinear fotos) |
| Profundidad monocular | Depth Anything 3 (métrico), MoGe, Metric3D | 1 por foto | Profundidad aproximada por foto: altura de techo, distancia a paredes, posición de la cámara | Segundos por foto, GPU barata o CPU | DA3 Metric Large Apache 2.0; modelos any-view de DA3 CC BY-NC | ✅ MVP |
| Generación 3D desde imagen | TRELLIS, Hunyuan3D | 1 | Modelos de objetos; en una habitación inventa geometría | GPU, segundos a minutos | Mixtas | 🔜 v3 (mobiliario) |

## Qué entra en el MVP

- **Geometría:** solo del plano subido o dibujado, más los m² o una medida de referencia.
- **Fotos:** asignación foto → habitación con confidence ([[Modelos de visión - segmentación y foto a habitación|Modelos de visión: segmentación y foto→habitación]]) y profundidad monocular para estimar la posición y orientación de la cámara y la altura del techo. Todo marcado como estimado y corregible en el pre-flight.
- **Apariencia:** las fotos se proyectan como referencia o textura sobre paredes y suelo.
- **Infra:** inferencia de profundidad en el backend Python (PyTorch, ya opcional en el stack), sin GPU dedicada si los tiempos lo permiten.

## Qué queda para v2

- Alinear fotos entre sí con un modelo feed-forward (tipo VGGT o MASt3R), si hay uno con licencia comercial.
- [[Gaussian Splatting]] para pocas vistas, como modo fotorrealista opcional.

## Riesgos que salen de aquí

- **Licencias:** muchos modelos punteros son no comerciales. Afecta al riesgo 5 de la [[Matriz de riesgos]] y a [[Licencias de datasets y modelos]].
- **Escala:** la profundidad monocular "métrica" se equivoca en interiores atípicos; contrastarla siempre con el plano.

## Experimento propuesto para el Spike

- [ ]  Con 2–3 viviendas reales (plano + 5 fotos + medidas), ejecutar Depth Anything 3 Metric en cada foto
- [ ]  Comparar la altura de techo y la distancia a la pared estimadas con las reales (objetivo: error ≤ 10 %)
- [ ]  Medir el tiempo por foto en CPU y en GPU barata

## Fuentes

- [Depth Anything 3 (arXiv 2511.10647)](https://arxiv.org/abs/2511.10647) · [paquete y tabla de licencias](https://pypi.org/project/depth-anything-3/)
- [FLARE (arXiv 2502.12138)](https://arxiv.org/abs/2502.12138)
- [SPFSplatV2 (arXiv 2509.17246)](https://arxiv.org/html/2509.17246v1)
- [GGPT, CVPR 2026](https://openaccess.thecvf.com/content/CVPR2026/papers/Chen_GGPT_Geometry-Grounded_Point_Transformer_CVPR_2026_paper.pdf)
- [alexanderell.is/posts/3d-scan](https://alexanderell.is/posts/3d-scan/) (referencia del proyecto)
