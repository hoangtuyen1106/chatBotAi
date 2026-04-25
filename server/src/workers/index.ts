import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { closeQueue, ingestQueue } from '../services/queue.js';
import { ingestDocument } from '../services/ingestion/index.js';

const queue = ingestQueue();

void queue.process(2, async (job) => {
  const data = job.data;
  logger.info({ jobId: job.id, ...data }, 'ingest_job_start');
  return ingestDocument(data);
});

queue.on('completed', (job, result: unknown) => {
  logger.info({ jobId: job.id, result }, 'ingest_job_completed');
});

queue.on('failed', (job, err) => {
  logger.error({ jobId: job.id, attemptsMade: job.attemptsMade, err }, 'ingest_job_failed');
});

logger.info({ env: env.NODE_ENV, redis: env.REDIS_URL }, 'worker_started');

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'worker_shutdown');
  void closeQueue().finally(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'worker_unhandled_rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'worker_uncaught_exception');
  process.exit(1);
});
