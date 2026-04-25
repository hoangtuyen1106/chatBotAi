---
description: High-level architecture — ingestion pipeline, RAG query pipeline, and service layering. Apply when designing or modifying backend flow.
globs: ["server/**/*", "src/**/*", "api/**/*", "workers/**/*"]
alwaysApply: true
---

# Architecture

## Ingestion pipeline (upload → searchable)
1. `POST /upload` (multer) — validate MIME type and size, persist raw file to S3/MinIO, create a `document` row with status `pending`, enqueue a Bull job.
2. Worker consumes the job → parse with the appropriate library → chunk text into ~500–1000 token segments (with small overlap) → embed each chunk → upsert vectors (with `{userId, documentId, chunkIndex}` metadata) into the vector store → mark document `ready`.
3. Keep the HTTP upload handler thin; all heavy work runs in the worker so the request never times out.

## RAG query pipeline (chat turn)
1. `POST /chat` (or WS message) receives the user message.
2. Embed the question → vector-search top-K chunks filtered by `userId` (and optionally `documentId`).
3. Build prompt: system instructions + retrieved chunks (with source citations) + recent chat history + user question.
4. Stream the LLM response token-by-token to the frontend over WebSocket/SSE.
5. Persist the full exchange to PostgreSQL; cache the active session in Redis.

## Layering
- `routes/` — thin HTTP handlers, validation only.
- `services/` — business logic (auth, ingestion, retrieval, chat).
- `workers/` — Bull processors.
- `adapters/` — swappable integrations: `VectorStore`, `ObjectStorage`, `LLMClient`, `EmbeddingClient`. Route all external calls through these so Pinecone↔pgvector and OpenAI↔Claude can be swapped via env.
- `db/` — migrations and typed query layer.

When adding a new document type, extend the parser registry in `services/ingestion/parsers/` and add a MIME-type entry to the upload validator — don't branch inline in the route.

When swapping LLM or vector providers, only the adapter implementation should change; services must stay provider-agnostic.
