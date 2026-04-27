process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '4000';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173';
process.env.JWT_SECRET ??= 'x'.repeat(64);
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_BUCKET ??= 'test';
process.env.S3_ACCESS_KEY ??= 'test';
process.env.S3_SECRET_KEY ??= 'test';
process.env.UPLOAD_ALLOWED_MIME ??=
  'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,text/plain';
process.env.OPENAI_BASE_URL ??= 'http://localhost:11434/v1';
