---
description: Change-verification workflow. Apply after every significant change.
globs: ["**/*"]
alwaysApply: true
---

# Workflow & Verification

After every significant change, re-read the feature list and confirm the change did **not** break any of:

- Registration / login (bcrypt + JWT).
- Upload → parse → chunk → embed → store pipeline.
- RAG retrieval scoped to the authenticated user.
- Streaming chat over WebSocket/SSE.
- History retrieval.
- `/health` endpoint.
- Mobile layout at 360 px width.
- Scroll animations on landing sections.

Rules:
- Prefer editing the existing scaffold over creating parallel files.
- Do not leave half-finished implementations; if a change is partial, mark it clearly and call it out to the user.
- If a change affects multiple layers (route → service → adapter → worker), walk each layer to verify consistency before reporting done.
