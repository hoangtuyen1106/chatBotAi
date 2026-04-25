import path from 'node:path';
import migrationRunner from 'node-pg-migrate';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const migrationsDir = path.resolve(process.cwd(), 'migrations');

const direction = process.argv[2] === 'down' ? 'down' : 'up';

async function main(): Promise<void> {
  logger.info({ direction, migrationsDir }, 'migrate_start');
  const result = await migrationRunner({
    databaseUrl: env.DATABASE_URL,
    dir: migrationsDir,
    migrationsTable: 'pgmigrations',
    direction,
    count: direction === 'up' ? Infinity : 1,
    log: (msg) => logger.info(msg),
    verbose: false,
  });
  logger.info({ applied: result.map((m) => m.name) }, 'migrate_done');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error({ err }, 'migrate_failed');
    process.exit(1);
  });
