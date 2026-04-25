---
description: Authoritative tech stack for the AI Chat Bot project. Apply whenever adding dependencies or choosing libraries.
globs: ["**/*"]
alwaysApply: true
---

# Tech Stack

- **Backend:** Node.js + Express + **TypeScript** (strict mode). JWT auth via `jsonwebtoken` + `bcrypt`.
- **Frontend:** Vite + React + TypeScript. Styling via **Tailwind CSS**; UI components via **shadcn/ui** (Radix primitives, copied into `client/src/components/ui/`). Streaming chat via WebSocket or SSE.
- **Primary DB:** PostgreSQL (users, chat history, document metadata). MongoDB or MySQL may be exposed as a configurable alternative for document metadata; connection string supplied via env.
- **Vector store:** Pinecone **or** pgvector — choose one per deployment, abstracted behind a `VectorStore` adapter.
- **Cache / sessions / queue backend:** Redis.
- **Job queue:** Bull (Redis-backed) for async file ingestion.
- **Object storage:** S3 or MinIO for raw file blobs.
- **File parsing:** `multer` (upload) → `pdf-parse` (PDF), `mammoth` (DOCX), `papaparse` (CSV).
- **Embeddings / LLM:** OpenAI `text-embedding-3-small` (or equivalent) for embeddings; Claude or OpenAI for chat completion with streaming.
- **Logging:** Winston or Pino (structured JSON).
- **Orchestration:** Docker Compose for local stack (api + worker + Postgres + Redis + MinIO).

Do **not** introduce alternative stacks (Next.js, FastAPI, plain JavaScript, etc.) without the user's explicit approval.