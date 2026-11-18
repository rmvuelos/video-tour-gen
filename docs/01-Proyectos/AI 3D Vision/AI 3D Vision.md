---
title: "AI 3D Vision"
aliases: ["AI 3D Vision Project"]
tags: ["project", "ai-3d-vision", "not-started"]
type: project
status: "Not started"
assignees: ["Adria Martinez", "Matteo Murcia"]
---

# AI 3D Vision

> [!info] Project workspace
> The associated implementation work is indexed in [[Tasks MOC]].

## Context and inputs

- Upload 5-10 images
- Upload apartment blueprint
- Upload blueprint sketch, canva drawing
- Upload specifitions or description
- show pre-evaluation

## Workflow

Workflow based on your Notion project, covering input collection, AI-assisted spatial reconstruction, editable 3D prototyping, visualization, and export.

INTERACTIVE WORKFLOW DIAGRAM

```mermaid
flowchart TD
A(["Start — New 3D Project"])
subgraph INPUT["01 · USER INPUT"]
B["Upload blueprint / floor plan / Canva sketch"]
C["Upload 3–10 photos or a video"]
D["Optional dimensions, specifications and description"]
E["Validate and organize inputs"]
B --> E
C --> E
D --> E
end
subgraph PREFLIGHT["02 · AI PRE-FLIGHT & PROTOTYPE"]
    F["Analyze layout, walls, geometry and image features"]
    G["Map photos to rooms and spatial positions"]
    H["Generate approximate 3D layout"]
    I["Preview: image overlays and spatial placeholders"]
    J{"User approves prototype?"}
    K["Edit room boundaries, scale, positions and materials"]
    F --> G --> H --> I --> J
    J -->|"No"| K
    K --> I
end

subgraph GENERATION["03 · 3D GENERATION"]
    L["Create validated 3D scene"]
    M["Minimalist 3D artifact"]
    N["Interactive immersive 3D environment"]
    O["First-person / third-person navigation"]
    P["Three.js scene, camera and interactions"]
    L --> M
    L --> N --> O --> P
end

subgraph EXPORT["04 · RENDER & EXPORT"]
    Q["Render / Export Pipeline"]
    R["Video walkthrough · MP4"]
    S["Interactive virtual tour"]
    T["Standalone HTML / Web experience"]
    Q --> R
    Q --> S
    Q --> T
end

A --> B
A --> C
A --> D
E --> F
J -->|"Yes"| L
M --> Q
P --> Q

classDef input fill:#e8f2ff,stroke:#3685de,color:#123b65
classDef preview fill:#fff2dc,stroke:#d59a36,color:#68450d
classDef generation fill:#eae7ff,stroke:#8067d4,color:#33266a
classDef export fill:#e0f4e9,stroke:#399969,color:#174f36
class B,C,D,E input
class F,G,H,I,J,K preview
class L,M,N,O,P generation
class Q,R,S,T export
```

## Technical architecture — recommended implementation

1. Input & ingestion: React / TypeScript, file storage, OpenCV, FFmpeg

2. AI spatial analysis: Vision models, segmentation, layout inference, image-to-room matching

3. 3D scene generation: Three.js, React Three Fiber, Blender, glTF / GLB

4. Interactive delivery: Three.js, WebXR, browser rendering, video export

## Critical design decisions

1. Pre-flight before generation: Produce a lightweight, editable spatial approximation rather than an expensive, detailed model immediately.
2. Spatial consistency: Treat the blueprint as the primary layout reference. Map photographs to rooms and surfaces with confidence scores; avoid inventing geometry without identifying it as estimated.
3. Editable scene representation: Maintain one canonical 3D scene (geometry, materials, cameras, anchors) shared by the minimalist artifact and virtual tour.
4. Multiple exports from one model: Generate video, virtual tour, and HTML from the same approved scene rather than rebuilding the environment for each output.

Recommended MVP: Blueprint + photos → editable 2.5D/3D pre-flight scene → minimalist Three.js model → browser-based virtual tour. Introduce photorealistic reconstruction, automated camera paths, and video generation in subsequent iterations.

The key architectural distinction is that AI generates the spatial structure, while Three.js handles real-time visualization and navigation. A floor plan and a handful of photographs can support an approximate 3D representation, but not necessarily an accurate or photorealistic reconstruction without additional measurements or depth information.

### Cómo trabajamos

[[Convenciones git y PRs]] · [[Definition of Done]]

## Related design

[https://www.figma.com/design/5unPeruE2TiPBhoQb9V0IB/rooma?node-id=0-1&t=psSliMHSQInB3oYr-1](https://www.figma.com/design/5unPeruE2TiPBhoQb9V0IB/rooma?node-id=0-1&t=psSliMHSQInB3oYr-1)
