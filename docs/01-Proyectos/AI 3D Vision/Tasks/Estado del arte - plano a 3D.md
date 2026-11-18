---
title: "Estado del arte: plano → 3D"
aliases: ["Estado del arte - plano a 3D"]
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
blocks: ["[[Licencias de datasets y modelos]]", "[[Spike de viabilidad - plano a muros en Three.js|Spike de viabilidad: plano → muros en Three.js]]"]
---

# Estado del arte: plano → 3D

> [!abstract] Resumen
> Revisar técnicas y modelos para parsear planos (detección de muros, puertas, habitaciones) y convertirlos en geometría.

## Criterios de aceptación

- [ ]  Resumen de 3–5 enfoques/modelos con pros, contras y licencia
- [ ]  Recomendación para el MVP

## Conclusión

Pasar de la geometría 2D a 3D es fácil y determinista: se extruyen los polígonos de los muros. Lo difícil es **leer bien el plano**: muros, habitaciones, aberturas y escala. Para el MVP propongo un **pipeline híbrido**: visión clásica determinista como base, un modelo de segmentación si el Spike demuestra que hace falta, y corrección manual en el pre-flight. Los VLM generales (GPT, Gemini) **no sirven para la geometría**, solo para leer etiquetas.

## Comparativa de enfoques

Licencias pendientes de verificar en [[Licencias de datasets y modelos]].

| Enfoque | Ejemplos | Pros | Contras | Licencia | Encaje |
| --- | --- | --- | --- | --- | --- |
| 1. Visión clásica (reglas) | OpenCV: binarización, morfología, Hough, contornos + Shapely | Determinista, sin entrenamiento, rápido en CPU, fácil de depurar. Coincide con el PRD ("reglas deterministas") | Frágil con escaneos, sketches a mano, mobiliario dibujado y textos sobre muros | OpenCV Apache 2.0, Shapely BSD | ✅ MVP (base) |
| 2. Segmentación de muros con deep learning | Modelo multitarea de CubiCasa5K, MitUNet (2025), Raster-to-Vector (2017, código MIT) | Más robusto a estilos de plano; da máscaras de muros, puertas y ventanas | Hay que reentrenar o ajustar con planos parecidos a los nuestros; datos escasos | CubiCasa5K sin confirmar; MitUNet código público | ✅ MVP si el Spike lo pide |
| 3. Vectorización directa a polígonos o grafo | Raster-to-Graph (2024), modelos autoregresivos de polígonos (2026) | Estado del arte en benchmarks (CubiCasa5K, Structured3D); salida ya vectorial | Código de investigación; generaliza mal fuera de su dataset; más complejo de operar | Revisar caso a caso | 🔜 v2 |
| 4. VLM especializado en planos | FloorplanVLM (2026): imagen → JSON vectorial | Salida estructurada; 92,5 % de IoU en muros exteriores en su propio benchmark | Muy reciente; cifras solo de su benchmark; disponibilidad y licencia por confirmar | Por confirmar | 🔍 Evaluar en el Spike si se puede |
| 5. VLM general | GPT, Gemini | Leen etiquetas, nombres de habitaciones y cotas (OCR + contexto) | Poco fiables en geometría precisa: Blueprint-Bench abandonó la extracción con LLM y otro estudio de 2026 los sitúa por debajo de los métodos deterministas | API de pago | ⚠️ Solo etiquetas, opcional |
| 6. Plano dibujado por el usuario | [[Lienzo 2D para dibujar el plano]] | Geometría exacta, sin parseo | Más trabajo para el usuario | Propio | ✅ MVP (alternativa) |

## De 2D a 3D (parte determinista)

- **Muros:** se extruyen los polígonos de Shapely hasta una altura por defecto de 2,5 m, ajustable con la profundidad monocular de las fotos ([[Estado del arte - reconstrucción desde fotos|Estado del arte: reconstrucción desde fotos]]).
- **Puertas y ventanas:** huecos en los muros; suelo con el contorno de cada habitación y techo opcional.
- **Escala:** a partir de los m² o una medida del usuario, o de las cotas del plano leídas con OCR (Tesseract o PaddleOCR, ambos Apache 2.0).
- **Salida:** escena canónica, exportable a glTF/GLB.

## Recomendación para el MVP

1. Preprocesar con PyMuPDF y OpenCV: página elegida, enderezar, binarizar y quitar textos.
2. Detectar muros con visión clásica y cerrar habitaciones como polígonos con Shapely.
3. Fijar la escala con los m² o la medida del usuario; las cotas por OCR son opcionales.
4. Detectar puertas y ventanas de forma simple; lo que falte se marca en el pre-flight.
5. El usuario corrige en el pre-flight. Si el plano es ilegible, usa el lienzo 2D.
6. Si en el Spike la visión clásica falla en muchos planos, se cambia el paso 2 por un modelo de segmentación (opción 2), sin tocar el resto del pipeline.

## Experimento para el Spike

- [ ]  Reunir 10 planos variados: CubiCasa5K y planos reales (PDF, foto de un plano impreso, sketch)
- [ ]  Ejecutar la visión clásica y, si da tiempo, un modelo de segmentación preentrenado
- [ ]  Medir el IoU de muros y habitaciones con el script del [[Set de evaluación de modelos y métricas|Set de evaluación de modelos + métricas]] (objetivo ≥ 0,75)
- [ ]  Decidir: ¿basta la visión clásica para el MVP?

## Fuentes

- [CubiCasa5K (arXiv 1904.01920)](https://arxiv.org/abs/1904.01920v1) · [repositorio](https://github.com/CubiCasa/CubiCasa5k)
- [MitUNet (arXiv 2512.02413)](https://arxiv.org/html/2512.02413v2)
- [Raster-to-Vector, Liu et al.](https://art-programmer.github.io/floorplan-transformation/paper.pdf)
- [Raster-to-Graph, Eurographics 2024](https://diglib7.eg.org/bitstream/handle/10.1111/cgf15007/v43i2_03_15007.pdf)
- [Modelo autoregresivo de polígonos (arXiv 2602.09016)](https://arxiv.org/html/2602.09016)
- [FloorplanVLM (arXiv 2602.06507)](https://arxiv.org/html/2602.06507)
- [Blueprint-Bench, ICLR 2026](https://en.papernotes.org/ICLR2026/image_generation/blueprint-bench_comparing_spatial_intelligence_of_llms_agents_and_image_models/)
- [Aliyev y Barsi, 2026](https://pp.omikk.bme.hu/ci/article/download/44138/24640/262788)
