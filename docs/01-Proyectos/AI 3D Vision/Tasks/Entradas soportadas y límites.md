---
title: "Entradas soportadas y límites"
aliases: ["Entradas soportadas y límites"]
tags: ["project", "ai-3d-vision", "task", "planeacion", "in-progress"]
type: task
project: "[[AI 3D Vision]]"
status: "In progress"
phase: "Planeación"
priority: "High"
effort: "Small"
updated: 2026-11-11
assignees: ["Adria Martinez"]
depends_on: ["[[PRD y alcance del MVP]]"]
blocks: ["[[Estado del arte - plano a 3D|Estado del arte: plano → 3D]]", "[[Estado del arte - reconstrucción desde fotos|Estado del arte: reconstrucción desde fotos]]", "[[Flujos UX end-to-end]]", "[[Ingesta y validación de archivos]]"]
---

# Entradas soportadas y límites

> [!abstract] Resumen
> Especificar formatos y límites: plano (PDF/PNG/JPG o dibujado en el lienzo 2D), sketch exportado, 3–10 fotos, m² y descripción opcionales. Video fuera del MVP.

### 1. Matriz de entradas para el MVP

Límites propuestos; se confirman en la revisión conjunta del [[PRD y alcance del MVP]].

| Entrada | Formatos | Cantidad | Límite propuesto |
| --- | --- | --- | --- |
| Plano de planta | PDF, PNG, JPG/JPEG | 1 por planta | 20 MB |
| Sketch de plano 2D | PDF, PNG, JPG exportados | 1 | 20 MB |
| Plano dibujado | Lienzo 2D interno | 1 por planta | Validación geométrica |
| Fotografías | JPG, PNG, WebP | 3–10 | 12 MB por foto |
| Descripción | Texto UTF-8 | 1 | 2.000 caracteres |
| Superficie | Número decimal en m² | Opcional | Positivo y finito |
| Vídeo | No admitido | — | Fuera del MVP |

### 2. Validaciones

- Cliente: extensiones permitidas, cantidad de fotografías, tamaño máximo, previsualización y dimensiones de imagen.
- Servidor: comprobar MIME real y firma del archivo, integridad, archivos corruptos, PDF cifrados y límites de recursos al decodificar. En imágenes, mitigar prompt injection y otras vulnerabilidades.
- Geometría: verificar continuidad, polígonos válidos, intersecciones y calibración de escala.
- Mensajes de error: identificar el archivo afectado, explicar el problema y ofrecer una acción correctiva concreta.
- PDF multipágina: el usuario selecciona una única página de planta por procesamiento.
- Se conserva el archivo original y se generan versiones optimizadas para visión por computador.

Las librerías para subida y validación están en [[ADRs de stack]].

### 3. Criterios de aceptación

- [ ]  La aplicación acepta únicamente los formatos definidos y muestra sus límites antes de subir archivos.
- [ ]  Se admiten entre 3 y 10 fotografías, con validación tanto en cliente como en servidor.
- [ ]  El usuario puede visualizar el plano y las imágenes antes de iniciar el procesamiento.
- [ ]  Los PDF multipágina permiten seleccionar la página que contiene la planta.
- [ ]  Los archivos inválidos generan mensajes comprensibles y específicos.
- [ ]  Las medidas y la descripción son opcionales; la escala geométrica debe confirmarse cuando no pueda inferirse de forma fiable.
- [ ]  Los archivos originales se conservan sin alterar y los derivados se almacenan por separado.
- [ ]  Los vídeos quedan explícitamente fuera del MVP.
