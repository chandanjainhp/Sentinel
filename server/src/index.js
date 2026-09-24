import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import app from './app.js';
import { connectDatabases, disconnectDatabases } from './db/index.js';
import { startWorker, stopWorker } from './queues/worker.js';
import logger from './utils/logger.js';

dotenv.config({ path: './.env' });

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});

const port = process.env.PORT || 8000;
let server;

connectDatabases()
  .then(async () => {
    // Step 1: Start background workers
    await startWorker();

    // Step 2: Open server port
    const startServer = (attemptNumber = 1) => {
      server = app.listen(port, () => {
        logger.info(`Server listening on http://localhost:${port}`);
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${port} is already in use.`);
          if (attemptNumber < 3) {
            logger.info(`Retrying in 2 seconds (attempt ${attemptNumber}/3)...`);
            setTimeout(() => {
              startServer(attemptNumber + 1);
            }, 2000);
          } else {
            logger.error(
              `Failed to start server after 3 attempts. Please kill existing processes on port ${port}`
            );
            process.exit(1);
          }
        } else {
          logger.error({ err: error }, 'Server error');
          process.exit(1);
        }
      });
    };

    startServer();
  })
  .catch((error) => {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  });

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received. Shutdown signal received, closing gracefully`);

  const safetyTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10000);

  if (server) {
    server.close(async () => {
      try {
        await stopWorker();
        await disconnectDatabases();
        clearTimeout(safetyTimeout);
        logger.info('All connections closed, exiting');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        clearTimeout(safetyTimeout);
        process.exit(1);
      }
    });
  } else {
    try {
      await stopWorker();
      await disconnectDatabases();
      clearTimeout(safetyTimeout);
      logger.info('All connections closed, exiting');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      clearTimeout(safetyTimeout);
      process.exit(1);
    }
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled Promise Rejection');
  Sentry.captureException(reason);
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught Exception');
  Sentry.captureException(error);
});
