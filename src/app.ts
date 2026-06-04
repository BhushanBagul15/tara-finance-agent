import express from 'express';
import { requestIdMiddleware } from './middleware/request-id.js';
import { healthRouter } from './routes/health.routes.js';
import { askRouter } from './routes/ask.routes.js';
import { logger } from './logging/request-logger.js';

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '32kb' }));
  app.use(requestIdMiddleware);

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          latency_ms: Date.now() - start,
          request_id: res.locals.requestId,
        },
        'http_request',
      );
    });
    next();
  });

  app.use(healthRouter);
  app.use(askRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
