---
description: Core REST/WS surface contract. Apply when adding, renaming, or modifying endpoints.
globs: ["routes/**/*", "server/**/*", "src/routes/**/*", "api/**/*"]
alwaysApply: true
---

# API Surface

Minimum endpoints:

- `POST /auth/register`, `POST /auth/login` — bcrypt + JWT.
- `POST /upload` — multipart, auth required.
- `GET /history` — paginated chat history for the authenticated user.
- `POST /chat` or WS `/chat` — streaming chat endpoint.
- `GET /health` — liveness/readiness for monitoring.

All non-auth routes go through JWT middleware. Every handler scopes its DB and vector queries by the authenticated `userId`; cross-user access is forbidden.
