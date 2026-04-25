# AI Chat Bot

Document-grounded chat bot. Users register, upload files (PDF / DOCX / CSV / TXT), and chat with an LLM that answers using their uploaded content via RAG.

- **Backend:** Node.js + Express + TypeScript, Bull worker, JWT auth.
- **Frontend:** Vite + React + TypeScript, streaming chat over WebSocket/SSE.
- **Infra:** PostgreSQL (pgvector), Redis, MinIO (S3-compatible).

See [CLAUDE.md](CLAUDE.md) for the full project plan, rules, and phased checklist.

## Layout

```
.
├── server/          # Express + TS API + Bull worker (Phase 1+)
├── client/          # Vite + React + TS frontend (Phase 5+)
├── .claude/rules/   # Project rules (stack, security, UI, etc.)
├── docker-compose.yml
└── .env.example
```

## Quick start

```bash
# 1. Copy env template
cp .env.example .env

# 2. Bring up supporting services (Postgres + Redis + MinIO)
docker compose up -d postgres redis minio minio-init

# 3. Install + run backend (after Phase 1 scaffolding)
cd server && npm install && npm run dev

# 4. Install + run frontend (after Phase 5 scaffolding)
cd ../client && npm install && npm run dev
```

Full stack via compose (once `server/Dockerfile` exists):

```bash
docker compose up
```

Services:

| Service  | URL                    | Notes                            |
| -------- | ---------------------- | -------------------------------- |
| API      | http://localhost:4000  | Express app                      |
| Client   | http://localhost:5173  | Vite dev server                  |
| Postgres | localhost:5432         | user/pass `chatbot` / `chatbot`  |
| Redis    | localhost:6379         |                                  |
| MinIO S3 | http://localhost:9000  | API                              |
| MinIO UI | http://localhost:9001  | `minioadmin` / `minioadmin`      |

## Status

Phase 0 (repo bootstrap) complete. Tracking in [CLAUDE.md](CLAUDE.md) → **Build Plan (Checklist)**.
