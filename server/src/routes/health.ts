import { Router } from 'express';
import { ping } from '../db/pool.js';
import { logger } from '../config/logger.js';

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/health/ready', async (_req, res) => {
  let postgres: 'ok' | 'down' = 'ok';
  try {
    await ping();
  } catch (err) {
    logger.warn({ err }, 'health_pg_down');
    postgres = 'down';
  }

  const status = postgres === 'ok' ? 'ready' : 'degraded';
  res.status(postgres === 'ok' ? 200 : 503).json({
    status,
    checks: {
      postgres,
      redis: 'skipped',
      s3: 'skipped',
    },
  });
});
