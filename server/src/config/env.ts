import 'dotenv/config';
import { z } from 'zod';

const csv = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    CLIENT_ORIGIN: z.string().min(1),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),

    DATABASE_URL: z.string().url(),
    MONGODB_URI: z.string().optional().default(''),
    MYSQL_URL: z.string().optional().default(''),

    REDIS_URL: z.string().url(),

    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z
      .string()
      .optional()
      .default('true')
      .transform((v) => v === 'true'),

    VECTOR_STORE: z.enum(['pinecone', 'pgvector']).default('pgvector'),
    PINECONE_API_KEY: z.string().optional().default(''),
    PINECONE_INDEX: z.string().optional().default(''),
    PINECONE_ENVIRONMENT: z.string().optional().default(''),

    LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
    OPENAI_API_KEY: z.string().optional().default(''),
    OPENAI_BASE_URL: z.string().url().optional(),
    OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
    OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
    ANTHROPIC_API_KEY: z.string().optional().default(''),
    ANTHROPIC_CHAT_MODEL: z.string().default('claude-sonnet-4-6'),

    UPLOAD_MAX_MB: z.coerce.number().int().positive().default(25),
    UPLOAD_ALLOWED_MIME: z.string().min(1),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.VECTOR_STORE === 'pinecone') {
      if (!env.PINECONE_API_KEY || !env.PINECONE_INDEX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PINECONE_API_KEY'],
          message: 'PINECONE_API_KEY and PINECONE_INDEX are required when VECTOR_STORE=pinecone',
        });
      }
    }
    if (env.LLM_PROVIDER === 'openai' && !env.OPENAI_API_KEY && !env.OPENAI_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message:
          'OPENAI_API_KEY is required when LLM_PROVIDER=openai (unless OPENAI_BASE_URL points to a local OpenAI-compatible server like Ollama)',
      });
    }
    if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic',
      });
    }
  });

export type Env = z.infer<typeof envSchema> & {
  CORS_ORIGINS: string[];
  UPLOAD_ALLOWED_MIME_LIST: string[];
};

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('\n');

  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

const base = parsed.data;

export const env: Env = {
  ...base,
  CORS_ORIGINS: csv(base.CLIENT_ORIGIN),
  UPLOAD_ALLOWED_MIME_LIST: csv(base.UPLOAD_ALLOWED_MIME),
};

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
