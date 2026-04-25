---
description: Expected build/dev/test commands once the project is scaffolded. Wire these up in package.json as work proceeds.
globs: ["package.json", "docker-compose.yml", "Dockerfile*"]
alwaysApply: false
---

# Commands

Backend (root `package.json`):

- `npm run dev` — backend in watch mode (`tsx` or `ts-node-dev`).
- `npm run build` / `npm start` — compile TS and run from `dist/`.
- `npm test` / `npm test -- <pattern>` — run a single test by name pattern.
- `npm run lint` / `npm run typecheck`.
- `npm run worker` — start the Bull worker process (separate from the web process).
- `npm run migrate` — database migrations.

Frontend (separate `web/` or `client/` package):

- `npm run dev`, `npm run build`, `npm run preview`.

Infrastructure:

- `docker compose up` — full local stack (api + worker + Postgres + Redis + MinIO).

When a command is referenced in docs or tasks but does not yet exist in `package.json`, add the script — don't invent shell pipelines on the fly.
