---
title: "Matriz de riesgos"
aliases: ["Matriz de riesgos"]
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
---

# Matriz de riesgos

> [!abstract] Resumen
> Riesgos técnicos y de negocio: precisión con pocas fotos/sin medidas, coste de inferencia, privacidad de imágenes de viviendas, rendimiento 3D en navegador.

## Criterios de aceptación

- [x]  Cada riesgo con probabilidad, impacto y mitigación
- [x]  Riesgos altos con responsable y tarea asociada

## Método

- **Probabilidad (P)** 1–5: 1 muy improbable · 3 puede pasar · 5 casi seguro
- **Impacto (I)** 1–5: 1 molestia menor · 3 retrasa semanas o degrada el MVP · 5 el producto no funciona o no es viable
- **Puntuación = P × I**: 🔴 15–25 alto (mitigar ya) · 🟡 8–14 medio (plan) · 🟢 1–7 bajo (vigilar)
- Revisar cada 2 semanas o al cerrar cada fase. Puntuaciones iniciales: ajustarlas entre los dos.

## Matriz

| # | Riesgo | P | I | P×I | Mitigación | Responsable | Tarea relacionada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Layout poco preciso con plano + pocas fotos, sin medidas | 4 | 5 | 🔴 20 | Pedir ≥1 medida de referencia, marcar geometría estimada, editor pre-flight |  | [[Spike de viabilidad - plano a muros en Three.js|Spike de viabilidad: plano → muros en Three.js]] [[Set de evaluación de modelos y métricas|Set de evaluación de modelos + métricas]] |
| 2 | Planos muy variados (escaneos, sketches a mano, Canva) | 4 | 4 | 🔴 16 | Limitar formatos del MVP, validar al subir, permitir corrección manual |  | [[Entradas soportadas y límites]] |
| 3 | El alcance crece (fotorrealismo, video) | 4 | 3 | 🟡 12 | Fuera de alcance explícito en el PRD, roadmap por iteraciones |  | [[PRD y alcance del MVP]] |
| 4 | Coste de inferencia/GPU alto por proyecto | 3 | 4 | 🟡 12 | Pre-flight ligero, comparar API vs self-hosted, caché |  | [[Estimación de costes]] |
| 5 | Licencias de modelos/datasets no comerciales | 3 | 4 | 🟡 12 | Revisar licencias antes de elegir |  | [[Licencias de datasets y modelos]] |
| 6 | Equipo de 2: si uno no está, se para el trabajo | 3 | 4 | 🟡 12 | Reviews cruzadas, ADRs, documentación |  | [[Convenciones git y PRs]] [[ADRs de stack]] |
| 7 | Privacidad: fotos y planos de viviendas reales (GDPR) | 2 | 5 | 🟡 10 | Consentimiento, almacenamiento privado, borrado, no entrenar con datos de usuarios |  | [[Arquitectura del sistema]] |
| 8 | Fotos asignadas a la habitación equivocada | 3 | 3 | 🟡 9 | Confidence score y confirmación del usuario |  | [[Mapeo fotos a habitaciones|Mapeo fotos → habitaciones]] |
| 9 | Generación lenta que estropea la experiencia | 3 | 3 | 🟡 9 | Jobs asíncronos con progreso visible |  | [[API y pipeline de jobs asíncrono]] |
| 10 | El 3D va lento en portátiles modestos (móvil fuera del MVP) | 3 | 3 | 🟡 9 | Niveles de detalle (LOD), compresión de mallas y texturas |  | [[QA de rendimiento 3D]] |
| 11 | Competidores con producto ya maduro | 3 | 3 | 🟡 9 | Nicho propio: flujo desde el plano + pre-flight editable |  | [[Análisis de competencia]] |
| 12 | Dependencia de un solo proveedor de IA (precio/API cambian) | 2 | 3 | 🟢 6 | Capa propia entre el código y el proveedor |  | [[ADRs de stack]] |
| 13 | Exportar escenas autocontenidas (HTML + recursos en ZIP) resulta complejo | 3 | 3 | 🟡 9 | Escena canónica única; probar el ZIP offline desde el primer export |  | [[Export HTML standalone - GLB|Export HTML standalone / GLB]] |
