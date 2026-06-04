import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { logger } from './logging/request-logger.js';

async function main() {
  const env = getEnv();
  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Tara API listening');
  });
}

main().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
