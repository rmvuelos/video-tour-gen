---
title: "PRD y alcance del MVP"
aliases: ["PRD y alcance del MVP"]
tags: ["project", "ai-3d-vision", "task", "planeacion", "in-progress"]
type: task
project: "[[AI 3D Vision]]"
status: "In progress"
phase: "Planeación"
priority: "High"
effort: "Medium"
updated: 2026-11-11
assignees: ["Matteo Murcia", "Adria Martinez"]
blocks: ["[[Objetivos y métricas de éxito]]", "[[Matriz de riesgos]]", "[[Entradas soportadas y límites]]", "[[Análisis de competencia]]", "[[Flujos UX end-to-end]]"]
---

# PRD y alcance del MVP

> [!abstract] Resumen
> Documento de producto: problema, usuarios, alcance del MVP (plano + fotos → pre-flight editable → modelo Three.js → tour web) y qué queda fuera.

**Versión:** 0.1 — MVP

**Estado:** Pendiente de revisión y aprobación

**Producto:** Plataforma web de generación y visualización de espacios 3D mediante IA

---

## 1. Visión del producto

[[AI 3D Vision]] es una plataforma web que permite transformar planos arquitectónicos, dibujos de distribución y fotografías de espacios interiores en modelos tridimensionales simplificados e interactivos.

El producto busca reducir la barrera técnica y económica de crear representaciones 3D de habitaciones, viviendas y locales, sin requerir conocimientos de modelado profesional.

### Problema

Actualmente, convertir un plano 2D y fotografías en una representación tridimensional requiere herramientas especializadas, conocimientos técnicos y tiempo de modelado.

Las soluciones existentes suelen presentar alguna de estas limitaciones:

- Curva de aprendizaje elevada.
- Procesos manuales de reconstrucción y posicionamiento.
- Dependencia de software CAD o de modelado 3D.
- Costes elevados para usuarios que únicamente necesitan visualizar la distribución espacial.

### Propuesta de valor

**De un plano y varias fotografías a un espacio 3D navegable, editable y compatible desde el navegador.**

La plataforma combina interpretación visual asistida por IA, generación geométrica y visualización web para simplificar el proceso.

---

## 2. Usuarios objetivo

| Segmento | Necesidad |
| --- | --- |
| Particulares | Visualizar habitaciones, viviendas y posibles reformas |
| Diseñadores de interiores | Crear prototipos espaciales rápidos |
| Profesionales inmobiliarios | Presentar distribuciones 3D de propiedades |
| Arquitectos y técnicos | Validar propuestas conceptuales preliminares |

**Usuario principal del MVP:** Particular o diseñador que dispone de un plano y fotografías y desea obtener una visualización espacial sin utilizar herramientas CAD.

---

## 3. Objetivo del MVP

Validar que un usuario puede completar autónomamente el siguiente flujo:

**Upload → AI Preflight → Edición → Generación 3D → Visualización → Exportación**

El MVP prioriza tres capacidades:

1. Interpretar un plano para generar una estructura espacial aproximada.
2. Permitir al usuario revisar y corregir esa estructura antes de generar el modelo final.
3. Construir una escena tridimensional simplificada, navegable y reutilizable.

No se pretende conseguir una reconstrucción arquitectónica exacta ni un resultado fotorealista.

---

## 4. Alcance funcional del MVP

### Etapa 1 — Upload & Input

**Incluido**

- Subida de planos en PDF, PNG o JPG.
- Lienzo interactivo para dibujar plano 2D de planta
- Subida de entre 3 y 10 fotografías.
- Descripción opcional del espacio.
- Introducción manual de m2.
- Validación de archivos y previsualización de entradas.

**Resultado:** Conjunto de referencias visuales procesables.

### Etapa 2 — AI Preflight

**Incluido**

- Interpretación asistida del plano 2D.
- Identificación preliminar de paredes, límites y habitaciones.
- Generación de una estructura geométrica 2.5D/3D aproximada.
- Asociación sugerida de fotografías con habitaciones o paredes.
- Previsualización tridimensional de baja complejidad.
- Corrección manual de dimensiones, paredes, posiciones y anclajes fotográficos.
- Confirmación del usuario antes de generar el modelo final.

La asociación espacial de fotografías será una **sugerencia corregible**, no una reconstrucción automática garantizada.

**Resultado:** Representación espacial editable y validada por el usuario.

### Etapa 3 — 3D Generation

**Incluido**

- Generación de geometría tridimensional sencilla a partir del modelo validado.
- Paredes, suelo, techo opcional y aperturas básicas.
- Aplicación de materiales y colores simplificados.
- Incorporación de fotografías como referencias visuales o texturas asociadas a superficies.
- Visualización mediante Three.js.
- Navegación orbital y recorrido básico en primera persona desde navegador de escritorio.
- Persistencia del proyecto y sus parámetros.

**Resultado:** Escena 3D minimalista y navegable.

### Etapa 4 — Export & Delivery

**Incluido**

- Visualización interactiva directamente en la aplicación web.
- Exportación del modelo en GLB/glTF.
- Descarga de una experiencia web HTML/Three.js empaquetada con sus recursos, cuando sea necesario, en ZIP.
- Acceso posterior al proyecto guardado.

**Resultado:** Modelo 3D reutilizable y experiencia web exportable.

---

## 5. Funcionalidades fuera del MVP

| Funcionalidad | Planificación |
| --- | --- |
| Reconstrucción fotorealista | Iteración posterior |
| [[Gaussian Splatting]] / NeRF | I+D posterior |
| Generación automática de vídeos | Iteración posterior |
| Camera paths y recorridos cinematográficos | Iteración posterior |
| Vídeo como entrada para reconstrucción | Iteración posterior |
| VR inmersiva mediante WebXR y gafas | Iteración posterior |
| Navegación en tercera persona | Iteración posterior |
| Modelado automático detallado de mobiliario | Iteración posterior |
| Reconstrucción 3D de precisión arquitectónica | Fuera del objetivo inicial |
| Colaboración multiusuario en tiempo real | Iteración posterior |
| Integraciones nativas con herramientas CAD o Canva | Iteración posterior |

**Principio de alcance:** Priorizar una escena geométricamente coherente, editable y navegable sobre la calidad visual final.

---

## 6. Flujo de usuario principal

1. **Crear proyecto.** El usuario inicia un proyecto y carga el plano y las fotografías.
2. **Procesar referencias.** El sistema valida archivos, analiza el plano y propone una distribución espacial.
3. **Previsualizar.** Se presenta un prototipo 3D con las fotografías asociadas a ubicaciones aproximadas.
4. **Editar.** El usuario modifica dimensiones, geometría básica y asociaciones fotográficas.
5. **Confirmar.** El usuario aprueba la estructura.
6. **Generar.** El sistema transforma la estructura validada en una escena 3D.
7. **Explorar.** El usuario navega por el entorno desde el navegador.
8. **Exportar.** Descarga el modelo o la experiencia web.

---

## 7. Requisitos no funcionales

**Arquitectura**

- Frontend web basado en React, TypeScript y Three.js.
- Backend responsable de ingestión, procesamiento y generación.
- Formato de escena estructurado y persistente, independiente del motor de visualización.
- Separación entre interpretación del plano, edición geométrica y renderizado.

**Experiencia de usuario**

- Flujo guiado con tres etapas claramente identificadas.
- Feedback visual sobre el estado de procesamiento.
- Recuperación de proyectos y configuraciones guardadas.
- Posibilidad de corregir resultados incorrectos sin reiniciar el proyecto.

**Rendimiento y fiabilidad**

- Procesamiento asíncrono para las operaciones de IA.
- Gestión explícita de errores y archivos incompatibles.
- Visualización fluida de geometrías simples en navegadores de escritorio compatibles con WebGL.
- Evitar dependencias de modelos generativos costosos para operaciones geométricas deterministas.

---

## 8. Criterios de aceptación funcionales

### Upload

- [ ]  El usuario puede subir un plano válido y entre 3 y 10 fotografías.
- [ ]  El sistema valida formatos y comunica errores.
- [ ]  Las entradas quedan asociadas al proyecto.

### Preflight

- [ ]  Se genera una estructura espacial aproximada a partir de un plano de prueba.
- [ ]  Las fotografías pueden asociarse a posiciones de la escena.
- [ ]  El usuario puede editar dimensiones y paredes básicas.
- [ ]  La geometría modificada se refleja en la previsualización.
- [ ]  La generación final requiere aprobación explícita.

### Generación 3D

- [ ]  Se genera una escena 3D a partir de los parámetros confirmados.
- [ ]  La escena permite rotar, ampliar y navegar mediante controles de escritorio.
- [ ]  Las modificaciones confirmadas se conservan.
- [ ]  El proyecto puede reabrirse.

### Exportación

- [ ]  El usuario puede descargar el modelo GLB.
- [ ]  El usuario puede exportar una experiencia web ejecutable.
- [ ]  La exportación conserva la geometría y los recursos necesarios.

---

## 9. Métricas de validación

| KPI | Objetivo inicial |
| --- | --- |
| Completitud del flujo | Un usuario puede llegar de Upload a Export sin intervención técnica |
| Generación geométrica | Escena utilizable con al menos un plano de prueba representativo |
| Edición | Las correcciones se conservan hasta el modelo final |
| Navegación | Experiencia interactiva funcional en navegador de escritorio |
| Fiabilidad | Los errores se muestran y permiten reintentar sin perder el proyecto |

Los umbrales cuantitativos de tiempo, coste por generación y tasa de éxito se establecerán tras las primeras pruebas técnicas. Valores provisionales: [[Objetivos y métricas de éxito]].

---

## 10. Riesgos y dependencias

**Riesgo principal:** Un conjunto limitado de fotografías no permite deducir con certeza la geometría completa de un espacio.

**Mitigación:** Utilizar el plano como referencia geométrica principal, la IA como asistente de interpretación y la edición manual como mecanismo de corrección.

Otros riesgos:

- Planos sin escala o con información incompleta.
- Fotografías sin referencias espaciales claras.
- Coste y latencia de inferencia.
- Complejidad de exportar escenas autocontenidas.

Se priorizarán reglas geométricas deterministas siempre que resulten suficientes.

Matriz completa con puntuación, mitigación y responsables: [[Matriz de riesgos]].

---

## 11. Aprobación del PRD

**Estado:** Pendiente

| Responsable | Validación | Estado |
| --- | --- | --- |
| Responsable de Producto | Problema, usuarios, propuesta de valor y alcance | Pendiente |
| Responsable Técnico | Viabilidad, requisitos y restricciones del MVP | Pendiente |

### Checklist de aprobación

- [x]  
    
    PRD redactado con problema, usuarios y propuesta de valor.
    
- [x]  
    
    Alcance del MVP definido.
    
- [x]  
    
    Funcionalidades fuera del MVP explicitadas.
    
- [x]  
    
    Flujo principal y criterios de aceptación documentados.
    
- [ ]  
    
    Revisión conjunta del alcance.
    
- [ ]  
    
    Aprobación de ambos responsables.
    

**Definición de Done:** El PRD queda aprobado únicamente cuando ambas partes han revisado el alcance, resuelto las discrepancias y confirmado su aceptación.

**Decisión pendiente:** Congelar el alcance de esta versión para iniciar el desarrollo del MVP.
