import { Pool } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'pg_pool_error');
});

export const ping = async (): Promise<void> => {
  await pool.query('SELECT 1');
};
