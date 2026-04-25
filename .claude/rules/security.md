---
description: Security is the top priority. Apply to every route, input, and external call.
globs: ["**/*"]
alwaysApply: true
---

# Security (Top Priority)

- Every route is authenticated unless it is explicitly public (`/auth/*`, `/health`).
- Validate every input with zod (or equivalent) at the route boundary. Reject unknown fields.
- Never trust client-supplied filenames — store files by UUID; preserve original name only as metadata.
- Scope every vector search and every DB query by the authenticated `userId`. No cross-user reads.
- Enforce rate limiting with `express-rate-limit` on auth and chat endpoints.
- Secrets only via environment variables. Never commit `.env`. Keep `.env.example` in sync.
- Hash passwords with `bcrypt` (cost ≥ 12). Sign JWTs with a strong `JWT_SECRET`; set reasonable expiry and refresh.
- Set security headers (helmet), CORS allowlist, cookie flags `HttpOnly` + `Secure` + `SameSite`.
- Validate upload MIME type **and** magic bytes, cap file size, and reject executables/archives unless explicitly supported.
- Log authentication failures and rate-limit hits; never log secrets, tokens, or full file contents.
