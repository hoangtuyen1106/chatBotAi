import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'api_listening');
});

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'shutdown_signal_received');
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'shutdown_error');
      process.exit(1);
    }
    logger.info('server_closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn('shutdown_timeout_forcing_exit');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled_rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught_exception');
  process.exit(1);
});
