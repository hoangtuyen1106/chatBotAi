# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Chat Bot website with document-grounded RAG. Users can register, upload documents (PDF / DOCX / CSV / TXT), and chat with an LLM that answers using their uploaded content as context.

**Status:** Phases 0–4 complete. Auth + document upload + ingestion + RAG chat (SSE streaming with citations) all verified end-to-end against local Ollama (`qwen2.5:14b` chat, `bge-m3` embeddings). Phase 5 (frontend scaffold) is next.

## Current Status (updated 2026-04-25)

### Phase 2 (Auth) — done
- node-pg-migrate wired, [server/src/db/migrate.ts](server/src/db/migrate.ts) replaces the no-op; first migration creates `users` with `citext` email + `pgcrypto` UUIDs.
- Postgres pool at [server/src/db/pool.ts](server/src/db/pool.ts); `/health/ready` now pings it (returns 503 if down).
- [server/src/services/auth.ts](server/src/services/auth.ts) — register/login (zod, bcrypt cost 12, JWT). Includes a constant-time dummy hash on login miss to avoid email-enumeration timing leak.
- [server/src/routes/auth.ts](server/src/routes/auth.ts) — `POST /auth/register`, `POST /auth/login`; `express-rate-limit` mounted on the router.
- [server/src/middleware/requireAuth.ts](server/src/middleware/requireAuth.ts) — Bearer JWT → `req.userId`.
- Verified: register/dup/login/wrong-pw/short-pw/unknown-field/citext-case-insensitive all return correct status; `/health/ready` reports postgres ok.

### Phase 4 (RAG chat) — done
- Migration [server/migrations/1714000020000_create-chats-and-messages.cjs](server/migrations/1714000020000_create-chats-and-messages.cjs) — `chats(id, user_id, title, created_at, updated_at)` + `messages(id, chat_id, user_id, role enum, content, citations jsonb, truncated bool, created_at)` with `(chat_id, created_at)` and `(user_id, updated_at)` indexes.
- LLM adapter [server/src/adapters/llm/](server/src/adapters/llm/) — `LLMClient.stream(opts) -> AsyncIterable<string>` interface; OpenAI-compat impl reuses `OPENAI_BASE_URL` so Ollama `qwen2.5:14b` works without a code change; Anthropic is a throwing stub.
- Retrieval helper [server/src/services/retrieval.ts](server/src/services/retrieval.ts) embeds the question once via `bge-m3`, runs `getVectorStore().query({ userId, embedding, topK: 6, documentId? })`, returns chunks + citation previews (240-char trim).
- Prompt builder [server/src/services/chat/prompt.ts](server/src/services/chat/prompt.ts) — Vietnamese system prompt with `[#n]` citation contract, numbered chunk block, then chat history + question.
- Persistence [server/src/services/chat/persistence.ts](server/src/services/chat/persistence.ts) — `ensureChat`, `recentMessages` (Redis read-through, PG source of truth), `saveExchange` (transactional insert of user + assistant messages + chat updated_at + Redis cache append). Redis client at [server/src/db/redis.ts](server/src/db/redis.ts).
- Orchestrator [server/src/services/chat/index.ts](server/src/services/chat/index.ts) — runs retrieval + history in parallel, emits `onStart` (with citations), `onDelta`, `onDone`, `onError`. Honors `AbortSignal`; persists partial-with-`truncated=true` if client disconnects mid-stream.
- Routes [server/src/routes/chat.ts](server/src/routes/chat.ts) — `POST /chat/stream` (SSE, 15 s heartbeat, abort on client close), `GET /history`, `GET /chats/:id/messages`. All under `requireAuth` + a dedicated `express-rate-limit`.
- Compression bypass for SSE: [server/src/app.ts](server/src/app.ts) `compression({ filter })` returns false on `/chat/stream` so deltas flush immediately.
- Verified: alice asks "pgvector dùng để làm gì?" → SSE emits `start` with 1 citation (chunk #0 of sample.txt, score 0.51) → 30+ delta events → assistant replies in Vietnamese with `[#1]` citation tag → `done` event with messageId. `/history` lists 3 chats; `/chats/:id/messages` returns user + assistant rows with `citations` jsonb populated. Cross-user isolation: bob's `/history` empty, bob's query against alice's chatId returns empty messages array, bob's RAG question retrieves 0 citations (alice's chunks invisible).

### Phase 3 (Upload + ingestion) — done
- Migration [server/migrations/1714000010000_create-documents-and-chunks.cjs](server/migrations/1714000010000_create-documents-and-chunks.cjs) creates `documents`, `document_chunks(embedding vector(1024))`, HNSW cosine index, `document_status` enum, vector + pgcrypto extensions.
- Adapters: [server/src/adapters/object-storage/s3.ts](server/src/adapters/object-storage/s3.ts) (AWS SDK v3, MinIO-compatible via path-style + endpoint), [server/src/adapters/embeddings/openai-compat.ts](server/src/adapters/embeddings/openai-compat.ts) (OpenAI SDK + `OPENAI_BASE_URL` → Ollama), [server/src/adapters/vector-store/pgvector.ts](server/src/adapters/vector-store/pgvector.ts) (real) + [pinecone.ts](server/src/adapters/vector-store/pinecone.ts) (stub).
- Parsers registry [server/src/services/ingestion/parsers/](server/src/services/ingestion/parsers/) — pdf/docx/csv/txt; pdf imports `pdf-parse/lib/pdf-parse.js` to bypass that package's debug-block side-effect on import.
- Chunker [server/src/services/ingestion/chunker.ts](server/src/services/ingestion/chunker.ts) — paragraph-then-window splitter, target 2000 chars / ~570 tokens / 200-char overlap, merges trailing tiny chunks.
- Bull queue [server/src/services/queue.ts](server/src/services/queue.ts) (Redis), worker [server/src/workers/index.ts](server/src/workers/index.ts) processes `ingest-document` jobs with concurrency 2 and 3 attempts + exponential backoff.
- Routes: `POST /upload` (multer memory + magic-byte sniff via `file-type` + MIME allowlist + size cap from env) and `GET /documents` (per-user, ordered desc); both wrapped in `requireAuth`.
- Verified end-to-end: upload sample.txt → S3 (MinIO) → enqueue → parse → 1 chunk → embed via Ollama bge-m3 (~3 s) → vector(1024) upsert with HNSW index → status `ready`. Cross-user isolation OK (`bob` sees empty list). MIME allowlist rejects `application/x-msdownload`.

⚠ Known follow-ups
- Pinecone adapter is a stub — implement before allowing `VECTOR_STORE=pinecone`.
- Worker has no per-document concurrency cap — large bursts of uploads from one user could starve others. Add a fairness scheme in Phase 7.
- Chunker is char-window-based (estimateTokens = chars/3.5). Switch to a real tokenizer if chunk sizes need to be precise per LLM context budget.
- `pdf-parse` is on v1 (v2 changed entry shape); revisit if v2 stabilizes.

### ✅ Completed

**Phase 0 — Repo bootstrap**
- Git repo on `main`; root [.gitignore](.gitignore), [README.md](README.md), [CLAUDE.md](CLAUDE.md).
- Rule files under [.claude/rules/](.claude/rules/) (`stack`, `architecture`, `api`, `security`, `ui-ux`, `config`, `commands`, `workflow`) — each with frontmatter; imported from CLAUDE.md via `@path`.
- Monorepo directories [server/](server/) and [client/](client/).
- [.env.example](.env.example) covers every variable in [config.md](.claude/rules/config.md).
- [docker-compose.yml](docker-compose.yml) with `postgres` (pgvector/pg16), `redis`, `minio`, `minio-init` bucket bootstrap, `api`, `worker`.

**Phase 1 — Backend scaffold (`/server`)**
- [server/package.json](server/package.json) with all required scripts: `dev`, `build`, `start`, `worker`, `lint`, `typecheck`, `test`, `migrate` (+ `lint:fix`, `format`, `test:watch`, `worker:start`). Deps pinned for Express 4, Pino, Zod, Bull, bcrypt, JWT, helmet, cors, compression.
- [server/tsconfig.json](server/tsconfig.json) — strict, NodeNext, `exactOptionalPropertyTypes`, `noUnused*`, `@/*` path alias. Separate [tsconfig.build.json](server/tsconfig.build.json) relaxes unused checks for compile.
- ESLint (`@typescript-eslint` recommended + type-checked) and Prettier at [server/.eslintrc.cjs](server/.eslintrc.cjs) / [.prettierrc.json](server/.prettierrc.json). Pre-commit hook via root [package.json](package.json) + Husky ([.husky/pre-commit](.husky/pre-commit)) + lint-staged running `lint --fix` and `format` on staged `server/src/**/*.ts`.
- Source tree created: [src/routes](server/src/routes), [src/services](server/src/services), [src/workers](server/src/workers), [src/adapters](server/src/adapters), [src/db](server/src/db), [src/middleware](server/src/middleware), [src/config](server/src/config).
- [src/config/env.ts](server/src/config/env.ts) — single zod-validated env module; coerces numbers/booleans, parses CSV `CLIENT_ORIGIN` → `CORS_ORIGINS` and `UPLOAD_ALLOWED_MIME` → `UPLOAD_ALLOWED_MIME_LIST`. Cross-field `superRefine` rules: `VECTOR_STORE=pinecone` requires `PINECONE_API_KEY` + `PINECONE_INDEX`; `LLM_PROVIDER=openai|anthropic` requires the matching API key. Fail-fast with a readable error list on invalid env.
- [src/config/logger.ts](server/src/config/logger.ts) — Pino with `pino-pretty` in dev, redacts `authorization` / `cookie` / `password` / `token` / `jwt` / `secret`.
- [src/middleware/errorHandler.ts](server/src/middleware/errorHandler.ts) — typed `HttpError` class, 404 handler, central error middleware that generalizes 500 messages in production.
- [src/routes/health.ts](server/src/routes/health.ts) — `GET /health` (uptime) and `GET /health/ready` (infra check stubs for Phase 2+).
- [src/app.ts](server/src/app.ts) — Express factory with `helmet`, CORS allowlist from `CORS_ORIGINS`, compression, 1 MB JSON/urlencoded limits, `pino-http` with custom log-level mapping, and `trust proxy`.
- [src/index.ts](server/src/index.ts) — HTTP bootstrap with SIGINT/SIGTERM graceful shutdown (10 s force-exit) and `unhandledRejection` / `uncaughtException` handlers.
- [src/workers/index.ts](server/src/workers/index.ts) — worker entrypoint stub (Bull processors arrive in Phase 3).
- [src/db/migrate.ts](server/src/db/migrate.ts) — no-op placeholder invoked by `npm run migrate` (first real migration lands in Phase 2).
- [server/Dockerfile](server/Dockerfile) — multi-stage: `base` → `deps` → `dev` (target used by compose) / `build` → `prod-deps` → `prod` (non-root `app` user, `dumb-init`). [.dockerignore](server/.dockerignore) excludes `node_modules`, `dist`, `.env`, `.git`.

**Verification performed**
- `npm install` → 376 packages clean.
- `npm run typecheck` → passes.
- `npm run build` → [server/dist/](server/dist/) emitted.
- Server booted on port 4010 with injected env; `GET /health` → 200, `GET /health/ready` → 200, unknown path → 404.
- Env fail-fast verified: short `JWT_SECRET` + `VECTOR_STORE=pinecone` with no keys + missing `OPENAI_API_KEY` → three errors printed, no boot.
- `docker build --target dev ./server` → OK. `docker build --target prod ./server` → OK.
- Note: `docker compose up` not exercised end-to-end (requires a populated `.env` at repo root); scheduled for first Phase 2 run.

### 🟡 Current state by area
| Area | State |
| --- | --- |
| Repo / docs / rules | ✅ **Done** |
| Infra compose (postgres / redis / minio / minio-init / api / worker) | ✅ **Booted end-to-end** — all 6 services healthy; `GET /health/ready` reports `postgres: ok` |
| Local LLM stack (Ollama on host) | ✅ `qwen2.5:14b` (chat) + `bge-m3` (embeddings, 1024d) pulled and verified |
| Backend scaffold (Phase 1) | ✅ **Done** — typecheck, build, `/health`, dev + prod Docker images verified |
| Auth (Phase 2) | ✅ **Done** — register / login / JWT / rate-limit / requireAuth verified |
| Upload + ingestion (Phase 3) | ✅ **Done** — `POST /upload` → S3 → Bull → parse → chunk → embed (Ollama) → pgvector upsert with HNSW index → `status=ready`. Pinecone adapter is a stub. |
| RAG chat (Phase 4) | ✅ **Done** — SSE streaming, citations, history, Redis cache, cross-user isolation verified |
| Frontend scaffold (Phase 5) | ⏳ **Not started** — [client/](client/) is still a placeholder; **next phase** |
| Landing + polish (Phase 6) | ⏳ **Not started** |
| Prod hardening + CI (Phase 7) | ⏳ **Not started** |

### ⏭ Next steps (Phase 5 — Frontend scaffold)
1. Init Vite + React + TS in [client/](client/): `npm create vite@latest client -- --template react-ts` (or scaffold manually so we don't recreate the existing folder). Add `npm run dev`/`build`/`preview` scripts.
2. Tailwind CSS + CSS variables: install tailwind/postcss/autoprefixer, init config, add CSS variable accent color in `client/src/index.css` (matches shadcn convention).
3. shadcn/ui init: `npx shadcn@latest init` (puts components in `client/src/components/ui/`), then add: `button`, `input`, `label`, `card`, `textarea`, `toast`, `dialog`, `dropdown-menu`, `scroll-area`.
4. Routing: `react-router-dom` with `/login`, `/register`, `/chat`, `/chat/:id`, `/documents`. Protected route wrapper that redirects to `/login` if no JWT in storage.
5. JWT storage decision: localStorage (simple, susceptible to XSS) vs in-memory + refresh token (Phase 7). Phase 5 v1: localStorage with a `useAuth` hook; flag in known-followups to migrate to httpOnly cookie + refresh in Phase 7.
6. API client (fetch wrapper) at `client/src/lib/api.ts` — attaches `Authorization: Bearer <token>`, handles 401 by clearing token + redirecting.
7. Auth pages (`/login`, `/register`) — shadcn forms, zod-resolver client-side validation mirroring server zod schema, error toasts on 4xx.
8. Documents page (`/documents`) — list from `GET /documents`, drag-drop upload (mirror MIME allowlist + size cap from env client-side), polling `status=processing` rows every 2 s until `ready`/`failed`.
9. Chat UI (`/chat[/:id]`) — message list (sticky-scroll-to-bottom unless user scrolls up), streaming input via `fetch` + `ReadableStream` consuming `POST /chat/stream` SSE (parse `event:`/`data:` lines, dispatch by event name); typing indicator while in-flight; collapsible citation list under each assistant message linking to the document.
10. History sidebar — `GET /history` with infinite scroll via `?before=<updatedAt>&limit=30`; clicking a chat loads `GET /chats/:id/messages`.
11. Mobile-first responsive verify at 360 px (rule from [ui-ux.md](.claude/rules/ui-ux.md)): chat input, message list, upload, auth forms all usable on touch.
12. Smoke test: register → upload sample.txt → wait `ready` → ask question → see streaming response with citation badges.

After Phase 5, Phase 6 (landing + scroll animations) and Phase 7 (prod hardening + CI).

### ⚠ Known follow-ups / caveats (live)
- Root `.env` is **not** committed (by design). Copy [.env.example](.env.example) → `.env` before `docker compose up` or local `npm run dev`; zod loader fails fast otherwise.
- Root [package.json](package.json) exists for Husky/lint-staged — run `npm install` at repo root once so `npm run prepare` activates hooks. **Do not install runtime deps at the root** — they belong in [server/package.json](server/package.json) (we hit this once during Phase 3 install and had to clean up).
- `docker-compose.yml` `api` + `worker` services bind-mount `./server:/app` with an anonymous `/app/node_modules` volume. **After changing `server/package.json`** the recipe is: `docker compose build api worker && docker compose stop api worker && docker compose rm -fv api worker && docker compose up -d api worker`. Just `down/up` keeps the stale anonymous volume and the new deps will be missing.
- Pinecone adapter at [server/src/adapters/vector-store/pinecone.ts](server/src/adapters/vector-store/pinecone.ts) throws — implement before allowing `VECTOR_STORE=pinecone`.
- Anthropic LLM adapter at [server/src/adapters/llm/anthropic.ts](server/src/adapters/llm/anthropic.ts) throws — implement before allowing `LLM_PROVIDER=anthropic`. (User runs entirely on local Ollama via the OpenAI-compat path, so unblocked.)
- Ollama on host requires manual restart if it dies (e.g. after Docker Desktop bounce on Windows). The chat endpoint surfaces `Connection error.` if Ollama is down — start it with `ollama serve` in a hidden process or run as a Windows service.
- `qwen2.5:14b` Q4 needs ~9 GB VRAM. On a 12 GB GPU with other apps consuming ~4 GB, allocation fails with "unable to allocate CUDA0 buffer". Restart Ollama to free GPU memory, or pull a smaller chat model (`qwen2.5:7b` ~5 GB) and switch `OPENAI_CHAT_MODEL` in `.env`.
- SSE compression is bypassed by path filter on `/chat/stream`. If we add more streaming endpoints, extend the filter — otherwise tokens batch and break the live-typing UX.
- Worker has no per-user fairness — large bursts from one user can monopolize the queue. Revisit in Phase 7 if needed.
- Chunker is char-window-based (estimateTokens = chars/3.5). Switch to a real tokenizer if precise context budgeting matters for the chat endpoint.
- `pdf-parse` pinned to v1; v2 changed entry shape and removes the `lib/pdf-parse.js` workaround we depend on.
- `OPENAI_API_KEY=ollama` in `.env` is a placeholder string the OpenAI SDK requires; not an actual credential. Production must change `JWT_SECRET` and either set a real `OPENAI_API_KEY` (cloud) or keep the Ollama base URL.

## Key Decisions & Rationale

### Phase 0 / 1 (foundation)
- **TypeScript everywhere (strict).** User required Node+Express+TS and Vite+React+TS explicitly. Strict mode chosen up-front because retrofitting strictness onto an existing codebase is painful.
- **Adapter pattern for VectorStore / ObjectStorage / LLMClient / EmbeddingClient.** The spec allows Pinecone *or* pgvector and OpenAI *or* Claude. Abstracting behind adapters lets the provider be swapped via env (`VECTOR_STORE`, `LLM_PROVIDER`) without touching services.
- **Postgres as primary DB; Mongo/MySQL only as optional metadata stores via env.** User listed several DB options but also specified pgvector as a vector-store choice. Standardizing on Postgres avoids running two transactional stores; Mongo/MySQL URLs remain in `.env.example` so a deployment can opt in.
- **`pgvector/pgvector:pg16` image in compose.** If the user picks `VECTOR_STORE=pgvector`, the same container serves transactional data *and* vector search — fewer moving parts for local dev. Swapping to vanilla `postgres:16` is trivial if they move to Pinecone.
- **Separate `worker` process, not an in-process queue consumer.** Bull jobs (parse → chunk → embed → upsert) are CPU- and IO-heavy; running them inside the web process would risk timeouts and back-pressure on chat streaming. Compose defines a dedicated `worker` service from day one.
- **MinIO bootstrap as a one-shot `minio-init` service.** Creating the `chatbot-uploads` bucket via `mc` on container start means a fresh clone works without manual console steps.
- **Rules split into topic files with frontmatter, imported from CLAUDE.md via `@path`.** Keeps `CLAUDE.md` scannable while ensuring each concern (security, UI, architecture, etc.) auto-loads into context.
- **Checklist-driven phases.** User asked for an ordered, checkable plan; phases are gated by [workflow.md](.claude/rules/workflow.md) verify-after-every-change rule.

### LLM / embeddings
- **Local Ollama via OpenAI-compat path, not a separate `ollama` provider.** Ollama exposes `/v1/chat/completions` and `/v1/embeddings` that match the OpenAI SDK shape, so we kept `LLM_PROVIDER=openai` and added one optional env var: `OPENAI_BASE_URL`. Net change to support local-first: ~5 lines in [env.ts](server/src/config/env.ts) + one base-URL pass-through in adapters. A dedicated `ollama` provider would have doubled adapter surface for no behavior gain. (Re-evaluate only if we need Ollama-specific knobs like `keep_alive`, `num_ctx`, `num_gpu`.)
- **`bge-m3` (1024d) over `nomic-embed-text` (768d) for embeddings.** Chosen because the user works in Vietnamese; `nomic-embed-text` is English-leaning. `bge-m3` is multilingual (100+ langs), trained contrastively for retrieval. Cost: 1.2 GB vs 270 MB on disk and ~3× slower per chunk. Worth it for retrieval quality on TV documents. The dim choice locks the pgvector schema.
- **Why an embedding model at all (vs reusing `qwen2.5:14b`).** Chat models predict next-token; embedding models are contrastively trained so semantically similar inputs map close in vector space. Using a 14B chat model for embeddings would (a) be ~100× slower per chunk, (b) emit 5120-dim vectors (5× the storage and HNSW cost), (c) score worse on retrieval benchmarks. Documented in chat history because it's a question that recurs.

### Auth (Phase 2)
- **`node-pg-migrate` over a hand-rolled SQL runner.** Mature, supports both JS migration files and raw SQL via `pgm.sql()`, has up/down semantics out of the box, ships a CLI we can invoke programmatically from [migrate.ts](server/src/db/migrate.ts). The alternative — SQL files + custom runner — meant writing transaction/lock handling we'd then have to maintain.
- **`citext` for `users.email`.** Case-insensitive comparison enforced by the type, so `ALICE@example.com` and `alice@example.com` collide on the unique constraint without custom lower() logic in queries.
- **Constant-time dummy hash on login miss.** [auth.ts](server/src/services/auth.ts) compares against a fixed bcrypt hash when the email isn't found, so timing doesn't leak which emails exist. Uses ~same CPU as a real bcrypt compare.
- **JWT in Authorization header (Bearer), not cookies.** Phase 2 is API-only; cookie + CSRF complexity is unwarranted until Phase 5 introduces a browser SPA. Revisit cookie strategy when wiring the frontend.

### RAG chat (Phase 4)
- **SSE over WebSocket.** Chat is a one-way stream of tokens; SSE works through Express middleware unchanged, doesn't need a separate upgrade handshake, and reconnects via standard HTTP. WebSocket only buys us bidirectional events we don't need yet (typing indicators from server, multi-user rooms). Revisit if those land.
- **POST /chat/stream (not GET).** Native browser `EventSource` only supports GET, but modern frontends consume SSE via `fetch` + `ReadableStream` which supports POST bodies. Choosing POST keeps the message body in the request rather than encoded in a query string (size limits, log noise).
- **Compression bypass via path filter.** `compression()` middleware buffers the response; SSE needs immediate flush. Filtering by path keeps the global compression for everything else and isolates the SSE exception.
- **Persist user message + assistant message in the same transaction at stream end** (not user-on-arrival). Simplifies failure handling — if the LLM call dies before any token, the user sees the error and we don't have an orphan user-message in their history. Trade-off: if the API process crashes mid-stream, we lose the user message too. Acceptable for v1.
- **`truncated: boolean` on messages.** Distinguishes "client disconnected mid-stream → partial saved" from a complete reply. Useful for UI ("[truncated]" badge) and for downstream features (don't summarize a truncated turn into the title).
- **Redis cache holds last 20 messages per chat with PG fallback.** Bypasses a chat-history JOIN on every turn. Sliding 24 h TTL. Cache is read-through (fill on miss) and write-through (append on save). PG remains source of truth — cache eviction is harmless.
- **Citations stored as jsonb on the assistant message, not in a separate table.** Citations are read whenever the message is read and never queried independently — denormalization beats a join. Schema includes `chunkId` so we can re-resolve to current chunk content if the document is re-ingested.
- **Single embedding model for ingest + query.** `bge-m3` embeds documents at ingest and questions at retrieval — required so vectors live in the same space. Locked by the `vector(1024)` column.
- **Vietnamese-first system prompt.** User works in TV; the LLM behaves better when system instructions match the expected output language. Reword if we add an English-only deployment.

### Upload + ingestion (Phase 3)
- **HNSW index with cosine ops, dim=1024.** HNSW is the right default for read-heavy similarity search at our scale; cosine matches what `bge-m3` is optimized for. Locking dim=1024 in the migration means changing embedding model later requires a migration + re-embed.
- **Magic-byte sniff (`file-type`) on top of MIME allowlist.** Client-supplied `Content-Type` is trivially spoofed; sniffing the buffer prevents an executable from being uploaded as `text/plain`. Falls back to the multer-reported MIME *only* for `text/plain` and `text/csv` (which `file-type` can't always detect because plain text has no magic bytes).
- **Storage key `users/{userId}/{uuid}{ext}`, not original filename.** Original filename kept in `documents.filename` as metadata only. Prevents path traversal and filename-collision attacks, makes per-user cleanup trivial (`rm users/{userId}/*`).
- **`document_chunks.user_id` denormalized.** Avoids a join on every vector search and lets the WHERE clause filter on a single indexed column. Worth the duplication for security-critical scoping.
- **Char-window chunker, not token-aware.** Initial implementation; a real tokenizer adds a heavy dep (tiktoken/js-tiktoken WASM) and chunk-size precision doesn't change retrieval quality much. Will revisit if Phase 4 chat shows context-budget issues.
- **Bull (Redis-backed) over BullMQ.** Existing dep was `bull`; both work. Bull's API is sufficient for our parse-chunk-embed flow. Migrate to BullMQ only if we need flow producers/streams.
- **Pinecone adapter shipped as a throwing stub.** User runs entirely local; pulling the Pinecone SDK and writing real upsert/query for a code path nobody will exercise is dead weight. The factory + interface are real, so swapping in is a focused task.
- **`pdf-parse` v1 with `lib/pdf-parse.js` inner-path import.** v1's main entry has a debug block that opens a sample PDF on `require`, breaking when the package is loaded for production use. The inner path bypasses it. v2 changed the API and removed the workaround — revisit when v2 is stable.

## Build Plan (Checklist)

Work top-down. Do not skip a phase until every item in it is checked. Mark `[x]` when done.

### Phase 0 — Repo bootstrap
- [x] Initialize git repo, add `.gitignore` (node, env, dist, uploads).
- [x] Create monorepo layout: `/server` (Express+TS) and `/client` (Vite+React+TS).
- [x] Add `.env.example` at root covering every variable in [config.md](.claude/rules/config.md).
- [x] Add `docker-compose.yml` with services: `api`, `worker`, `postgres`, `redis`, `minio`.
- [x] Add root `README.md` with quick-start commands.

### Phase 1 — Backend scaffold (`/server`)
- [x] `package.json` with scripts from [commands.md](.claude/rules/commands.md) (`dev`, `build`, `start`, `worker`, `lint`, `typecheck`, `test`, `migrate`).
- [x] `tsconfig.json` with `strict: true`.
- [x] ESLint + Prettier + Husky pre-commit.
- [x] Folder layout: `routes/`, `services/`, `workers/`, `adapters/`, `db/`, `middleware/`, `config/`.
- [x] Typed env loader (zod-validated) in `config/env.ts`.
- [x] Express app with `helmet`, CORS allowlist, JSON body limit, request logger (Winston/Pino).
- [x] `GET /health` liveness + readiness endpoint.

### Phase 2 — Auth
- [x] Postgres `users` table migration (id, email unique, password_hash, created_at).
- [x] `POST /auth/register` — validate, bcrypt hash (cost ≥ 12), insert, return JWT.
- [x] `POST /auth/login` — verify, return JWT.
- [x] JWT middleware that attaches `userId` to the request.
- [x] `express-rate-limit` on auth routes.

### Phase 3 — File upload & ingestion pipeline
- [x] Postgres `documents` table (id, user_id, filename, mime, size, status, created_at).
- [x] S3/MinIO adapter (`ObjectStorage`).
- [x] `POST /upload` with multer — validate MIME + magic bytes + size cap, store by UUID, insert row, enqueue Bull job.
- [x] Bull worker process (separate entrypoint).
- [x] Parsers registry: PDF (`pdf-parse`), DOCX (`mammoth`), CSV (`papaparse`), TXT.
- [x] Chunker: ~500–1000 tokens with small overlap.
- [x] Embedding adapter (`EmbeddingClient`) — OpenAI-compatible (cloud OpenAI **or** local Ollama via `OPENAI_BASE_URL`); current default `bge-m3` (1024d) via Ollama.
- [x] Vector store adapter (`VectorStore`) — pgvector implementation real; Pinecone is a stub (throws until implemented — set `VECTOR_STORE=pgvector`).
- [x] Worker flow: parse → chunk → embed → upsert with `{userId, documentId, chunkIndex}` → mark `ready`.

### Phase 4 — RAG chat
- [x] Postgres `chats` + `messages` tables.
- [x] LLM adapter (`LLMClient`) — OpenAI-compatible (cloud OpenAI **or** local Ollama via `OPENAI_BASE_URL`), streaming via OpenAI SDK; Anthropic is a stub (throws until implemented — set `LLM_PROVIDER=openai`).
- [x] Embed question → vector search top-K scoped by `userId`.
- [x] Prompt builder: system + retrieved chunks (with citations) + recent history + question.
- [x] SSE endpoint `POST /chat/stream` that streams tokens (chose SSE over WebSocket — one-way, fits Express middleware, simpler for chat).
- [x] Persist full exchange to Postgres; cache last 20 messages per chat in Redis (24 h TTL, sliding) with PG fallback.
- [x] `GET /history` paginated per user; `GET /chats/:id/messages` for in-chat history.
- [x] Rate-limit chat endpoint (separate limiter on `/chat` + `/chats/*`).

### Phase 5 — Frontend scaffold (`/client`)
- [ ] Vite + React + TS project with **Tailwind CSS** for styling and **shadcn/ui** for components (init via `npx shadcn@latest init`; generated components live in `client/src/components/ui/`).
- [ ] Auth pages (register / login), JWT stored securely, protected routes.
- [ ] Chat page: message list, streaming input, loading/typing indicator, citation display.
- [ ] Upload UI with drag-and-drop, progress, file-type/size validation mirrored client-side.
- [ ] History view.
- [ ] WebSocket/SSE client for streaming.

### Phase 6 — Landing page & UI polish
- [ ] Minimal, modern, professional landing page (hero, features, how-it-works, CTA).
- [ ] Mobile-first responsive across all pages; verify at 360 px.
- [ ] Scroll animations on every landing section via IntersectionObserver / Framer Motion `whileInView`, honoring `prefers-reduced-motion`.
- [ ] Accessibility pass: focus states, aria labels, keyboard navigation.

### Phase 7 — Production hardening
- [ ] Centralized error handler + structured logs.
- [ ] Rate limiting on all public endpoints.
- [ ] Input validation (zod) on every route.
- [ ] Dockerfiles for `api` and `worker`; finalize `docker-compose.yml`.
- [ ] CI pipeline: lint → typecheck → test → build.
- [ ] Health + readiness probes wired to compose/CI.
- [ ] Verification pass against [workflow.md](.claude/rules/workflow.md) checklist.

## Rules

Detailed rules live in [.claude/rules/](.claude/rules/). Load each before acting on the matching concern:

@.claude/rules/stack.md
@.claude/rules/architecture.md
@.claude/rules/api.md
@.claude/rules/security.md
@.claude/rules/ui-ux.md
@.claude/rules/config.md
@.claude/rules/commands.md
@.claude/rules/workflow.md

| File | Scope |
| --- | --- |
| [stack.md](.claude/rules/stack.md) | Authoritative tech stack and forbidden substitutions |
| [architecture.md](.claude/rules/architecture.md) | Ingestion + RAG pipelines and service layering |
| [api.md](.claude/rules/api.md) | Core REST / WebSocket surface |
| [security.md](.claude/rules/security.md) | Security requirements (top priority) |
| [ui-ux.md](.claude/rules/ui-ux.md) | Aesthetic, mobile-first, scroll-animation rules |
| [config.md](.claude/rules/config.md) | Env-driven configuration contract |
| [commands.md](.claude/rules/commands.md) | Build / dev / test commands |
| [workflow.md](.claude/rules/workflow.md) | Post-change verification checklist |
