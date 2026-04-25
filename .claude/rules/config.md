---
description: Environment-variable-driven configuration. Apply when adding settings or integrations.
globs: ["**/*.env*", "**/config/**/*", "**/*.ts", "**/*.js"]
alwaysApply: true
---

# Configuration

All connection details are env-driven. The user supplies DB / vector / LLM credentials at deploy time.

```
DATABASE_URL=             # Postgres
MONGODB_URI=              # optional alt for doc metadata
MYSQL_URL=                # optional alt for doc metadata
REDIS_URL=
S3_ENDPOINT= S3_BUCKET= S3_ACCESS_KEY= S3_SECRET_KEY=
VECTOR_STORE=pinecone|pgvector
PINECONE_API_KEY= PINECONE_INDEX=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
LLM_PROVIDER=openai|anthropic
JWT_SECRET=
PORT=
```

Rules:
- Keep `.env.example` in sync with every new variable introduced.
- Read env through a single typed config module (zod-validated on boot) — never `process.env.X` scattered across the codebase.
- Fail fast on startup if a required variable is missing.
