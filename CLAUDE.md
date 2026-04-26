# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Chat Bot website with document-grounded RAG. Users can register, upload documents (PDF / DOCX / CSV / TXT), and chat with an LLM that answers using their uploaded content as context.

**Status:** Phases 0–6 complete. Backend (auth + upload + ingest + RAG chat SSE), frontend app shell (chat / documents / auth) and a public landing page with scroll animations + dark-mode toggle + code-split routes — all verified end-to-end against local Ollama (`qwen2.5:14b` chat, `bge-m3` embeddings). Phase 7 (prod hardening + CI) is next.

## Current Status (updated 2026-04-25, end of Phase 5 session)

Two commits on `main`:
- `c00af83` — Phases 0–4 (backend scaffold + auth + ingestion + RAG chat)
- `2fdb4cd` — Phase 5 (Vite + React + Tailwind + shadcn/ui frontend)

### ✅ Completed (chronological per phase)

### Phase 2 (Auth) — done
- node-pg-migrate wired, [server/src/db/migrate.ts](server/src/db/migrate.ts) replaces the no-op; first migration creates `users` with `citext` email + `pgcrypto` UUIDs.
- Postgres pool at [server/src/db/pool.ts](server/src/db/pool.ts); `/health/ready` now pings it (returns 503 if down).
- [server/src/services/auth.ts](server/src/services/auth.ts) — register/login (zod, bcrypt cost 12, JWT). Includes a constant-time dummy hash on login miss to avoid email-enumeration timing leak.
- [server/src/routes/auth.ts](server/src/routes/auth.ts) — `POST /auth/register`, `POST /auth/login`; `express-rate-limit` mounted on the router.
- [server/src/middleware/requireAuth.ts](server/src/middleware/requireAuth.ts) — Bearer JWT → `req.userId`.
- Verified: register / dup / login / wrong-pw / short-pw / unknown-field / citext-case-insensitive all return correct status; `/health/ready` reports postgres ok.

### Phase 3 (Upload + ingestion) — done
- Migration [server/migrations/1714000010000_create-documents-and-chunks.cjs](server/migrations/1714000010000_create-documents-and-chunks.cjs) creates `documents`, `document_chunks(embedding vector(1024))`, HNSW cosine index, `document_status` enum, vector + pgcrypto extensions.
- Adapters: [server/src/adapters/object-storage/s3.ts](server/src/adapters/object-storage/s3.ts) (AWS SDK v3, MinIO-compatible via path-style + endpoint), [server/src/adapters/embeddings/openai-compat.ts](server/src/adapters/embeddings/openai-compat.ts) (OpenAI SDK + `OPENAI_BASE_URL` → Ollama), [server/src/adapters/vector-store/pgvector.ts](server/src/adapters/vector-store/pgvector.ts) (real) + [pinecone.ts](server/src/adapters/vector-store/pinecone.ts) (stub).
- Parsers registry [server/src/services/ingestion/parsers/](server/src/services/ingestion/parsers/) — pdf/docx/csv/txt; pdf imports `pdf-parse/lib/pdf-parse.js` to bypass that package's debug-block side-effect on import.
- Chunker [server/src/services/ingestion/chunker.ts](server/src/services/ingestion/chunker.ts) — paragraph-then-window splitter, target 2000 chars / ~570 tokens / 200-char overlap, merges trailing tiny chunks.
- Bull queue [server/src/services/queue.ts](server/src/services/queue.ts) (Redis), worker [server/src/workers/index.ts](server/src/workers/index.ts) processes `ingest-document` jobs with concurrency 2 and 3 attempts + exponential backoff.
- Routes: `POST /upload` (multer memory + magic-byte sniff via `file-type` + MIME allowlist + size cap from env) and `GET /documents` (per-user, ordered desc); both wrapped in `requireAuth`.
- Verified end-to-end: upload sample.txt → S3 (MinIO) → enqueue → parse → 1 chunk → embed via Ollama bge-m3 (~3 s) → vector(1024) upsert with HNSW index → status `ready`. Cross-user isolation OK (`bob` sees empty list). MIME allowlist rejects `application/x-msdownload`.

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

### Phase 5 (Frontend scaffold) — done
- Vite 6 + React 18 + TS strict + project references (`tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json`); `@/*` path alias; dev proxy `/api/*` → `http://localhost:4000` (avoids CORS in dev).
- Tailwind CSS 3 + CSS-variable theme tokens in [client/src/index.css](client/src/index.css) (light + dark modes, accent = HSL primary), `tailwindcss-animate` plugin.
- shadcn/ui primitives **hand-written** (CLI not used — alias already configured): [button](client/src/components/ui/button.tsx), [input](client/src/components/ui/input.tsx), [label](client/src/components/ui/label.tsx), [card](client/src/components/ui/card.tsx), [textarea](client/src/components/ui/textarea.tsx), [toast](client/src/components/ui/toast.tsx), [scroll-area](client/src/components/ui/scroll-area.tsx) + [lib/utils.ts](client/src/lib/utils.ts) `cn()`.
- Routing via `react-router-dom@7`: `/login`, `/register`, `/chat`, `/chat/:id`, `/documents`. [ProtectedRoute](client/src/lib/auth.tsx) redirects to `/login` with `state.from` for post-login bounce.
- Auth: [lib/auth.tsx](client/src/lib/auth.tsx) `AuthProvider` decodes JWT payload to populate `user`; [lib/api.ts](client/src/lib/api.ts) attaches `Authorization: Bearer <token>` and clears + notifies subscribers on 401.
- Toast system: tiny imperative store at [lib/toast.ts](client/src/lib/toast.ts) + [Toaster.tsx](client/src/components/Toaster.tsx) consuming Radix Toast primitive — no Provider wiring per call.
- Pages: [LoginPage](client/src/pages/LoginPage.tsx) + [RegisterPage](client/src/pages/RegisterPage.tsx) (RHF + zod-resolver mirroring server schema), [DocumentsPage](client/src/pages/DocumentsPage.tsx) (drag-drop + 25 MB / MIME-allowlist client mirror + 2 s polling on `pending`/`processing`), [ChatPage](client/src/pages/ChatPage.tsx) (sticky-scroll, Enter-to-send, abort-mid-stream, collapsible citations, history sidebar).
- SSE client [lib/chatStream.ts](client/src/lib/chatStream.ts) — chunked-buffer parser splitting on `\n\n`, dispatches `open`/`start`/`delta`/`done`/`error`, ignores `: ping` heartbeats, supports `AbortSignal`.
- App chrome: [AppShell](client/src/components/AppShell.tsx) (top header desktop, bottom tab bar mobile), [HistorySidebar](client/src/components/HistorySidebar.tsx).
- Verified: `npm run typecheck` ✅, `npm run build` ✅ (354 KB JS / 18.7 KB CSS gzipped → 108 KB / 4.6 KB), `npm run dev` serves `/login` `/register` `/chat` `/documents` (200), `/api/*` proxy hits backend, login round-trip via proxy returns JWT, `/chat/stream` SSE via proxy emits `start` (1 citation) → `delta` x N for the same Vietnamese question used in Phase 4.

### Phase 6 (Landing + UI polish) — done
- Public marketing route at `/` ([client/src/pages/LandingPage.tsx](client/src/pages/LandingPage.tsx)) with hero + features (4-card grid) + how-it-works (3 steps) + CTA + sticky header (logo, theme toggle, login/register or "Mở ứng dụng" depending on auth). Vietnamese copy throughout.
- Scroll-in animation primitive: [client/src/lib/reveal.ts](client/src/lib/reveal.ts) `useReveal` hook (one-shot `IntersectionObserver`, threshold 0.15, rootMargin `0px 0px -10% 0px`, starts in the visible state if `prefers-reduced-motion: reduce`); [client/src/components/Reveal.tsx](client/src/components/Reveal.tsx) `<Reveal>` wrapper applies `transition-all duration-500 ease-out` + opacity/translate, supports per-element `delayMs` for staggered grids and an `as` prop for `<li>`/`<section>`/etc. Built with `createElement` (not generic `JSX.IntrinsicElements`) to avoid a TS2590 union-too-complex error.
- Dark mode: [client/src/lib/theme.tsx](client/src/lib/theme.tsx) `ThemeProvider` with `light | dark | system` modes, persisted at `localStorage['chatbot.theme']`, applies `.dark`/`.light` to `<html>`, listens to `prefers-color-scheme` while in `system`. [client/src/components/ThemeToggle.tsx](client/src/components/ThemeToggle.tsx) is a single icon button cycling light → dark → system. Provider wired in [main.tsx](client/src/main.tsx) above `AuthProvider`. Toggle mounted in `LandingPage` header and `AppShell` header.
- Code-splitting: [client/src/App.tsx](client/src/App.tsx) wraps `LoginPage`/`RegisterPage`/`ChatPage`/`DocumentsPage` in `React.lazy(...)` + `<Suspense>` fallback. `LandingPage` stays in the main bundle so the marketing page paints immediately. Result: initial JS 354 KB → 253 KB (gzip 109 KB → 82 KB), and each route ships its own ~2–8 KB chunk.
- Skeletons: [client/src/components/ui/skeleton.tsx](client/src/components/ui/skeleton.tsx) (Tailwind `animate-pulse`); used in [HistorySidebar](client/src/components/HistorySidebar.tsx) (4 rows during fetch) and [DocumentsPage](client/src/pages/DocumentsPage.tsx) (3 rows). Replaces the generic spinner placeholder.
- Message bubble entrance: `<MessageBubble>` in [ChatPage](client/src/pages/ChatPage.tsx) gets `animate-fade-in motion-reduce:animate-none` (`fade-in` keyframes already defined in [tailwind.config.ts](client/tailwind.config.ts)).
- A11y pass: `aria-expanded` on the citations-toggle button + focus ring; aria-label on `ThemeToggle` includes current mode in Vietnamese; existing aria-labels on send/stop/logout retained.
- Verified: `npm run typecheck` ✅, `npm run build` ✅ emits `index-*.js` 253 KB + `LoginPage`/`RegisterPage`/`ChatPage`/`DocumentsPage` chunks; dev server (`npm run dev`) returns 200 for `/`, `/login`, `/chat`, `/documents`; `/src/pages/LandingPage.tsx` served with Vietnamese strings.

⚠ Known follow-ups
- Mobile @ 360 px verified via build, not via real-device click-through.
- Initial render of the lazy chunks shows a centered spinner via `<Suspense fallback>`; could be a route-specific skeleton later.
- LandingPage uses static copy; no CMS layer.

### ✅ Earlier scaffold

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
| Frontend scaffold (Phase 5) | ✅ **Done** — Vite + React + Tailwind + shadcn/ui; auth, chat (SSE), documents, history all wired through Vite `/api` proxy |
| Landing + polish (Phase 6) | ✅ **Done** — landing page with scroll animations, dark mode toggle, code-split routes (354 KB → 253 KB initial), skeletons, bubble fade-in |
| Prod hardening + CI (Phase 7) | ⏳ **Not started** — **next phase** |

### ⏭ Next steps (Phase 7 — Production hardening + CI)
1. **CI pipeline** (GitHub Actions): one workflow per push that runs (a) `npm --prefix server run lint && npm --prefix server run typecheck && npm --prefix server run build`, (b) `npm --prefix client run typecheck && npm --prefix client run build`. Optionally a `docker build --target prod ./server` smoke step. Fail on any non-zero exit.
2. **Client ESLint** ([client/eslint.config.mjs](client/eslint.config.mjs)) — flat config mirroring [server/eslint.config.mjs](server/eslint.config.mjs) with `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`. Wire into client `lint` script + add to lint-staged in root [package.json](package.json) for staged `client/src/**/*.{ts,tsx}`.
3. **JWT migration** to httpOnly cookie + short-lived access (15 m) + refresh (7 d) endpoint. Server side: emit `Set-Cookie: token=...; HttpOnly; Secure; SameSite=Lax`; new `POST /auth/refresh` rotates token. CSRF: double-submit cookie or per-request token. Client side: drop `lib/api.ts` Bearer header path, rely on cookies (also drop `getToken()`/`setToken()` helpers). Migration is a breaking change — coordinate with a single deploy.
4. **Rate-limit every public endpoint** — currently only `/auth/*` and `/chat/*`/`/chats/*` have limiters. Add a global default limiter (higher cap, e.g. 300/min) before all routers, then keep tighter limiters on `/auth/*` and `/chat/*`.
5. **Pinecone adapter real impl** — write [server/src/adapters/vector-store/pinecone.ts](server/src/adapters/vector-store/pinecone.ts) using `@pinecone-database/pinecone` (upsert + query + deleteByDocument); env validator already enforces `PINECONE_API_KEY`/`PINECONE_INDEX` when `VECTOR_STORE=pinecone`.
6. **Anthropic LLM adapter real impl** — [server/src/adapters/llm/anthropic.ts](server/src/adapters/llm/anthropic.ts) with `@anthropic-ai/sdk` streaming via `messages.stream` / `MessageStream`; map deltas to the `LLMClient.stream` AsyncIterable contract.
7. **Structured logs review** — confirm `pino` redact list catches every secret-bearing field new since Phase 4 (e.g. `req.body.password`, citation previews? Probably fine). Add request-id (`pino-http` already supplies one — verify it appears in error logs).
8. **Finalize Dockerfiles** — verify [server/Dockerfile](server/Dockerfile) `prod` target boots (`docker build --target prod ./server && docker run -p 4000:4000 --env-file .env <image>`); add a `Dockerfile` for `client` (multi-stage: build → static-serve via `nginx:alpine` or `caddy:alpine`); update [docker-compose.yml](docker-compose.yml) prod-overlay file.
9. **Health probes wired to compose** — extend api/worker compose blocks with `healthcheck:` calling `/health/ready` and `/health` respectively (worker doesn't expose HTTP yet — add a tiny `GET /health` on a side port or a Bull queue ping).
10. **Final verification pass** against [.claude/rules/workflow.md](.claude/rules/workflow.md) checklist: register/login, upload→ingest, RAG retrieval scoped per user, SSE chat, history, `/health`, mobile @ 360 px, scroll animations.

### ⚠ Known follow-ups / caveats (live)

**Operational gotchas**
- Root `.env` is **not** committed (by design). Copy [.env.example](.env.example) → `.env` before `docker compose up` or local `npm run dev`; zod loader fails fast otherwise.
- Root [package.json](package.json) exists for Husky/lint-staged — run `npm install` at repo root once so `npm run prepare` activates hooks. **Do not install runtime deps at the root** — they belong in [server/package.json](server/package.json) or [client/package.json](client/package.json). (We hit this twice during Phase 3 and Phase 5 setup.)
- `docker-compose.yml` `api` + `worker` services bind-mount `./server:/app` with an anonymous `/app/node_modules` volume. **After changing `server/package.json`** the recipe is: `docker compose build api worker && docker compose stop api worker && docker compose rm -fv api worker && docker compose up -d api worker`. Just `down/up` keeps the stale anonymous volume and the new deps will be missing.
- Ollama on host requires manual restart if it dies (e.g. after Docker Desktop bounce on Windows). The chat endpoint surfaces `Connection error.` if Ollama is down — start it with `ollama serve` in a hidden process or run as a Windows service. ChatPage will also surface this as an SSE `error` event.
- `qwen2.5:14b` Q4 needs ~9 GB VRAM. On a 12 GB GPU with other apps consuming ~4 GB, allocation fails with "unable to allocate CUDA0 buffer". Restart Ollama to free GPU memory, or pull a smaller chat model (`qwen2.5:7b` ~5 GB) and switch `OPENAI_CHAT_MODEL` in `.env`.

**Backend caveats**
- Pinecone adapter at [server/src/adapters/vector-store/pinecone.ts](server/src/adapters/vector-store/pinecone.ts) throws — implement before allowing `VECTOR_STORE=pinecone`.
- Anthropic LLM adapter at [server/src/adapters/llm/anthropic.ts](server/src/adapters/llm/anthropic.ts) throws — implement before allowing `LLM_PROVIDER=anthropic`. (User runs entirely on local Ollama via the OpenAI-compat path, so unblocked.)
- SSE compression is bypassed by path filter on `/chat/stream`. If we add more streaming endpoints, extend the filter — otherwise tokens batch and break the live-typing UX.
- Worker has no per-user fairness — large bursts from one user can monopolize the queue. Revisit in Phase 7 if needed.
- Chunker is char-window-based (estimateTokens = chars/3.5). Switch to a real tokenizer if precise context budgeting matters for the chat endpoint.
- `pdf-parse` pinned to v1; v2 changed entry shape and removes the `lib/pdf-parse.js` workaround we depend on.
- `OPENAI_API_KEY=ollama` in `.env` is a placeholder string the OpenAI SDK requires; not an actual credential. Production must change `JWT_SECRET` and either set a real `OPENAI_API_KEY` (cloud) or keep the Ollama base URL.

**Frontend caveats**
- JWT in localStorage — flagged for migration to httpOnly cookie + refresh token in Phase 7 (XSS surface).
- Initial bundle now 253 KB (gzip 82 KB) after Phase 6 code-split. If Phase 7 adds bigger deps, reconsider per-route splitting strategy.
- Client has **no ESLint config** (server has flat config; client only relies on `tsc`). Add Phase 7.
- Mobile @ 360 px verified via build only, not real-device click-through.
- Frontend Phases 5 and 6 were code-verified (`typecheck`, `build`, dev-server SPA routes return 200, SSE proxy round-trip, landing route serves Vietnamese copy) but **not** clicked through in a real browser session by the user yet.

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

### Upload + ingestion (Phase 3)
- **HNSW index with cosine ops, dim=1024.** HNSW is the right default for read-heavy similarity search at our scale; cosine matches what `bge-m3` is optimized for. Locking dim=1024 in the migration means changing embedding model later requires a migration + re-embed.
- **Magic-byte sniff (`file-type`) on top of MIME allowlist.** Client-supplied `Content-Type` is trivially spoofed; sniffing the buffer prevents an executable from being uploaded as `text/plain`. Falls back to the multer-reported MIME *only* for `text/plain` and `text/csv` (which `file-type` can't always detect because plain text has no magic bytes).
- **Storage key `users/{userId}/{uuid}{ext}`, not original filename.** Original filename kept in `documents.filename` as metadata only. Prevents path traversal and filename-collision attacks, makes per-user cleanup trivial (`rm users/{userId}/*`).
- **`document_chunks.user_id` denormalized.** Avoids a join on every vector search and lets the WHERE clause filter on a single indexed column. Worth the duplication for security-critical scoping.
- **Char-window chunker, not token-aware.** Initial implementation; a real tokenizer adds a heavy dep (tiktoken/js-tiktoken WASM) and chunk-size precision doesn't change retrieval quality much. Will revisit if Phase 4 chat shows context-budget issues.
- **Bull (Redis-backed) over BullMQ.** Existing dep was `bull`; both work. Bull's API is sufficient for our parse-chunk-embed flow. Migrate to BullMQ only if we need flow producers/streams.
- **Pinecone adapter shipped as a throwing stub.** User runs entirely local; pulling the Pinecone SDK and writing real upsert/query for a code path nobody will exercise is dead weight. The factory + interface are real, so swapping in is a focused task.
- **`pdf-parse` v1 with `lib/pdf-parse.js` inner-path import.** v1's main entry has a debug block that opens a sample PDF on `require`, breaking when the package is loaded for production use. The inner path bypasses it. v2 changed the API and removed the workaround — revisit when v2 is stable.

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

### Landing + polish (Phase 6)
- **Public landing at `/`, no auth wall on the marketing page.** Unauthenticated visitors should be able to read what the product does before being asked to register. CTAs route to `/register` (or `/chat` if already authenticated). Trade-off: the route hierarchy now differs from the auth-gated app; OK because `react-router` handles both cleanly.
- **Custom `useReveal` hook over Framer Motion.** A 50-line `IntersectionObserver` wrapper does what we need (one-shot fade-up when in view, respects `prefers-reduced-motion`); pulling Framer Motion would add ~30 KB gzipped for one effect. Revisit only if we need orchestrated/spring animations.
- **`Reveal` typed via `createElement` not `JSX.IntrinsicElements` generic.** TypeScript hits a TS2590 ("union too complex to represent") if we generic over all intrinsic tags; restricting `as` to a small enum and using `createElement` keeps the type checker happy and is just as ergonomic.
- **Theme has three modes (light / dark / system), not a binary toggle.** `system` is the default — most users want the OS preference unless they intentionally pick. The icon-only toggle cycles through all three (Sun → Moon → Laptop) so users can land on their preferred state without a multi-option menu.
- **Code-split protected routes only; landing stays in main bundle.** Marketing pages need to paint immediately; auth/chat/documents only load after navigation. Saves the first-paint cost on the most-visited URL while still trimming 100 KB off the initial JS.
- **Skeletons over spinners for list loads.** Skeletons hint at the eventual layout (4 chat rows / 3 document rows), reducing perceived latency vs. a single centered spinner. Spinners remain for indeterminate states (in-flight chat send button).
- **Message bubble fade-in via Tailwind `animate-fade-in` (already defined), not Framer.** Single 280 ms keyframe; `motion-reduce:animate-none` falls back gracefully.

### Frontend scaffold (Phase 5)
- **Hand-write shadcn primitives instead of `npx shadcn@latest init`.** Init CLI prompts for path aliases / colour scheme and writes `components.json`. Our Vite alias `@/*` and Tailwind theme were already configured manually; copying the small set of primitives we need is faster and avoids dragging in `components.json` + the CLI's defaults that don't match our existing tokens. Future additions can still use the CLI without breaking these primitives.
- **JWT in localStorage (Phase 5 v1).** Avoids httpOnly-cookie + CSRF + refresh-token complexity for an internal dev app. Trade-off: any XSS executes with the user's bearer. Migration to httpOnly cookies + short-lived access + refresh token logged as Phase 7 follow-up.
- **Vite dev proxy `/api/*` → `localhost:4000`.** Frontend always calls relative `/api/...` so production deploy can swap origins without code changes. Avoids CORS round-trips during local dev (browser sees same-origin from `localhost:5173`).
- **SSE consumed via `fetch` + `ReadableStream` (not native `EventSource`).** Native `EventSource` only supports GET; our `POST /chat/stream` carries the message in the body. fetch's `ReadableStream` works with POST and handles abort cleanly via `AbortController`.
- **Imperative toast store, not React context per-toast.** A tiny module-level subscriber list ([lib/toast.ts](client/src/lib/toast.ts)) lets non-React code (api error handler, stream callbacks) call `toast({ ... })` directly, no `useToast()` hook needed at the call site.
- **JWT decoded on the client to populate `user.email` without a `/me` round trip.** Token signature isn't verified client-side — the server still verifies on every request. We use the payload only for display.
- **Sticky-to-bottom auto-scroll with a "scrolled-up" guard.** Standard chat UX: user scrolling up to read history must NOT be yanked back when new tokens stream. We track distance-from-bottom < 80 px to decide whether to auto-scroll.
- **Message bubble accumulates `delta`s in React state directly.** No virtual list needed at chat-history scale (≤ 200 messages); `whitespace-pre-wrap` handles long content. Revisit if a single chat exceeds 1000 messages.

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
- [x] Vite + React + TS project with **Tailwind CSS** for styling and **shadcn/ui** primitives (hand-written into `client/src/components/ui/` — `button`, `input`, `label`, `card`, `textarea`, `toast`, `scroll-area`).
- [x] Auth pages (register / login), JWT in localStorage (`useAuth` + `ProtectedRoute`), 401 auto-logout via `subscribeUnauthorized`.
- [x] Chat page: message list with sticky-scroll-to-bottom-unless-scrolled-up, streaming input (Enter to send), typing indicator while in-flight, collapsible citations under each assistant message.
- [x] Upload UI with drag-and-drop, MIME + size mirror, polling every 2 s while documents have `pending`/`processing` status.
- [x] History sidebar (`GET /history`); clicking a chat loads `GET /chats/:id/messages`.
- [x] SSE client via `fetch` + `ReadableStream` consuming `POST /chat/stream` (parses `event:`/`data:` lines, dispatches by event name, supports `AbortController`).

### Phase 6 — Landing page & UI polish
- [x] Minimal, modern, professional landing page (hero, features, how-it-works, CTA).
- [x] Mobile-first responsive across all pages; verify at 360 px.
- [x] Scroll animations on every landing section via `IntersectionObserver` (custom `useReveal` hook + `<Reveal>` wrapper), honoring `prefers-reduced-motion`.
- [x] Accessibility pass: focus rings on primitives, aria-labels on icon-only buttons (chat send/stop, theme toggle, logout), `aria-expanded` on citations toggle.
- [x] Dark mode toggle (light / dark / system, persisted in localStorage, follows OS in `system` mode).
- [x] Code-split routes via `React.lazy` — initial bundle dropped from 354 KB → 253 KB (gzip 109 KB → 82 KB).
- [x] Skeletons for history sidebar + documents list during loading; fade-in animation on chat message bubbles.

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
