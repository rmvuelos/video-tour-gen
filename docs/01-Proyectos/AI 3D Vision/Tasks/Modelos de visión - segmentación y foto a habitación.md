---
title: "Modelos de visión: segmentación y foto→habitación"
aliases: ["Modelos de visión - segmentación y foto a habitación"]
tags: ["project", "ai-3d-vision", "task", "investigacion", "in-progress"]
type: task
project: "[[AI 3D Vision]]"
status: "In progress"
phase: "Investigación"
priority: "Medium"
effort: "Medium"
updated: 2026-11-11
assignees: ["Matteo Murcia", "Adria Martinez"]
depends_on: ["[[Estado del arte - reconstrucción desde fotos|Estado del arte: reconstrucción desde fotos]]", "[[Licencias de datasets y modelos]]"]
blocks: ["[[Estimación de costes]]", "[[Arquitectura del sistema]]"]
---

# Modelos de visión: segmentación y foto→habitación

> [!abstract] Resumen
> Evaluar modelos de segmentación, detección de superficies y matching de fotos con habitaciones del plano con confidence score.

## Criterios de aceptación

- [ ]  Prueba rápida de al menos 2 modelos sobre fotos reales
- [ ]  Elección documentada (calidad, latencia, coste, API vs self-hosted)

## Conclusión

Para el MVP propongo **modelos abiertos self-hosted con licencia comercial**: SigLIP 2, DINOv2, Grounding DINO, SAM 2 y Depth Anything 3. Combinados, cubren las tres necesidades: qué habitación es cada foto, qué superficies se ven y con qué confianza. Un VLM por API (GPT, Gemini, Claude) queda como **baseline para comparar en la prueba**, no como base del MVP, por coste, privacidad y prompt injection.

## Qué tiene que resolver

1. **Foto → habitación:** a qué habitación del plano pertenece cada foto, con un confidence score.
2. **Superficies:** qué parte de la foto es pared, suelo, techo, puerta o ventana, para proyectarla como textura.
3. **Mobiliario:** que elementos se visualizan en las fotos asignar un valor de elemento para proyectarlo en el artefacto 3D (sillas, sofás, cuadros, etc.)
4. **Pistas geométricas:** aberturas visibles y dimensiones aproximadas para contrastarlas con el plano.

## Candidatos

Licencias verificadas en [[Licencias de datasets y modelos]]. Tiempos orientativos.

| Modelo | Para qué | Licencia | Dónde corre | Encaje |
| --- | --- | --- | --- | --- |
| SigLIP 2 | Clasificar el tipo de habitación sin entrenar (cocina, baño, dormitorio, salón…) | ✅ Apache 2.0 | CPU o GPU, menos de 1 s por foto | ✅ MVP |
| DINOv2 | Agrupar las fotos de la misma habitación por similitud visual | ✅ Apache 2.0 | CPU o GPU, menos de 1 s por foto | ✅ MVP |
| Grounding DINO | Detectar puertas, ventanas y muebles con texto libre | ✅ Apache 2.0 (código; confirmar pesos) | GPU recomendable | ✅ MVP |
| SAM 2 | Máscaras precisas de paredes, suelo y techo a partir de las cajas de Grounding DINO | ✅ Apache 2.0 | GPU recomendable | ✅ MVP |
| SAM 3 | Igual que Grounding DINO + SAM 2, pero en un solo modelo que acepta texto | ⚠️ SAM License: permite uso comercial; excluye uso militar; acceso con solicitud | GPU | 🔍 Alternativa a probar |
| Depth Anything 3 Metric / MoGe-2 | Profundidad para estimar dimensiones y posición de la cámara | ✅ Apache 2.0 / MIT | CPU o GPU | ✅ MVP (ver estado del arte) |
| Mask2Former / OneFormer entrenados con ADE20K | Segmentación semántica clásica de interiores | ⚠️ Imágenes de ADE20K solo para investigación no comercial | GPU | ❌ Evitar |
| VLM por API (GPT, Gemini, Claude) | Clasificar y describir la foto en lenguaje natural | API de pago | Externo | 🔍 Baseline de comparación |

## Propuesta de pipeline foto → habitación

1. **Tipo de habitación:** SigLIP 2 da una probabilidad por tipo para cada foto.
2. **Grupos:** DINOv2 agrupa las fotos que muestran la misma habitación.
3. **Habitaciones del plano:** nombres leídos con OCR; si no los hay, el tipo se infiere por tamaño o lo pone el usuario.
4. **Pistas geométricas:** Grounding DINO cuenta puertas y ventanas, y Depth Anything 3 estima las dimensiones. Ambas cosas se comparan con cada habitación del plano.
5. **Puntuación:** se combinan tipo, tamaño y aberturas en un confidence score por foto y habitación. Por debajo de 0,6, el pre-flight pide al usuario que confirme.

## API vs self-hosted

|  | Self-hosted (modelos abiertos) | VLM por API |
| --- | --- | --- |
| Calidad | Buena en tareas concretas; hay que combinar varios modelos | Muy buena clasificando y describiendo; mala en geometría precisa |
| Coste | Fijo (una GPU o CPU); casi cero por foto | Por llamada; sube con cada proyecto |
| Privacidad | Las fotos no salen de nuestra infraestructura | Fotos de viviendas enviadas a terceros (riesgo 7, GDPR) |
| Seguridad | Sin prompt injection | Texto en las imágenes puede manipular la respuesta |
| Esfuerzo | Más integración | Una llamada |

## Prueba rápida (por hacer, junto al Spike)

- [ ]  3 viviendas reales, 15–30 fotos etiquetadas a mano con su habitación
- [ ]  Comparar el acierto foto → habitación de SigLIP 2 + DINOv2 frente a un VLM por API (objetivo de la métrica 2: ≥ 80 %)
- [ ]  Revisar las máscaras de Grounding DINO + SAM 2 (y SAM 3 si da tiempo) en 10 fotos
- [ ]  Medir el tiempo por foto en CPU y en GPU, y pasar las cifras a [[Estimación de costes]]

## Fuentes

- [SAM 2](https://github.com/facebookresearch/sam2) · [SAM 3 y su licencia](https://raw.githubusercontent.com/facebookresearch/sam3/main/LICENSE)
- [SigLIP 2 en Hugging Face](https://huggingface.co/google/siglip2-so400m-patch14-384)
- [DINOv2](https://github.com/facebookresearch/dinov2)
- [Grounding DINO](https://github.com/IDEA-Research/GroundingDINO)
- [Términos de uso de ADE20K](https://ade20k.csail.mit.edu/terms/)
