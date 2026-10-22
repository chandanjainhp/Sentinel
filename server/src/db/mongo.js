import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { recordDbStatus } from '../utils/metrics.js';

let isIntentionallyClosed = false;
let connectionAttempts = 0;
const MAX_RECONNECTION_ATTEMPTS = 10;
const RECONNECTION_DELAY_MS = 5000;

/**
 * Build MongoDB connection options with sensible defaults
 *
 * Configuration can be overridden via environment variables:
 * - MONGODB_POOL_SIZE: Connection pool size (default: 10, maps to maxPoolSize)
 * - MONGODB_SOCKET_TIMEOUT_MS: Socket timeout in ms (default: 45000)
 * - MONGODB_CONNECT_TIMEOUT_MS: Connection timeout in ms (default: 10000)
 * - MONGODB_SERVER_SELECTION_TIMEOUT_MS: Server selection timeout in ms (default: 5000)
 * - MONGODB_MAX_POOL_SIZE: Maximum pool size (default: 20)
 * - MONGODB_MIN_POOL_SIZE: Minimum pool size (default: 5)
 * - MONGODB_MAX_IDLE_TIME_MS: Max idle time in ms (default: 30000)
 * - MONGODB_WAIT_QUEUE_TIMEOUT_MS: Wait queue timeout in ms (default: 10000)
 */
const buildMongoOptions = () => {
  return {
    maxPoolSize: Number(process.env.MONGODB_POOL_SIZE || process.env.MONGODB_MAX_POOL_SIZE || 10),
    socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS || 45000),
    connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 10000),
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
    minPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE || 5),
    maxIdleTimeMS: Number(process.env.MONGODB_MAX_IDLE_TIME_MS || 30000),
    waitQueueTimeoutMS: Number(process.env.MONGODB_WAIT_QUEUE_TIMEOUT_MS || 10000),
    // Read preference (default: primary)
    readPreference: process.env.MONGODB_READ_PREFERENCE || 'primary',
    // Write concern (default: majority for data safety)
    writeConcern: {
      w: process.env.MONGODB_WRITE_CONCERN || 'majority',
      j: process.env.NODE_ENV === 'production', // Journal in production
      wtimeout: Number(process.env.MONGODB_WRITE_TIMEOUT_MS || 10000),
    },
    // Retry logic
    retryWrites: true,
    retryReads: true,
    // Enable monitoring for connection pool stats
    monitorCommands: process.env.NODE_ENV === 'development',
    // App name for MongoDB monitoring
    appName: process.env.MONGODB_APP_NAME || 'sentinel',
    // Compress large queries (zstd not available, using snappy if available)
    // compressors: ['zstd'],  // Disabled - requires @mongodb-js/zstd package
    // TLS/SSL options
    tls: process.env.MONGODB_TLS === 'true' ? true : undefined,
    tlsAllowInvalidCertificates: process.env.MONGODB_TLS_ALLOW_INVALID === 'true',
    // For replica sets
    replicaSet: process.env.MONGODB_REPLICA_SET,
    // For direct connections
    directConnection: process.env.MONGODB_DIRECT_CONNECTION === 'true',
  };
};

const connectMongo = async () => {
  try {
    const mongodbUri = process.env.MONGODB_URL;
    if (!mongodbUri) {
      throw new Error('MONGODB_URL environment variable not set');
    }

    const options = buildMongoOptions();

    logger.info('[Mongo] Connecting to MongoDB...');
    logger.debug({ options }, '[Mongo] Connection options');

    await mongoose.connect(mongodbUri, options);

    // Extract hostname from connection string for logging
    const urlObj = new URL(mongodbUri);
    logger.info(`[Mongo] ✓ Connected to ${urlObj.hostname}`);
    recordDbStatus('mongo', true);

    // Register connection event listeners
    mongoose.connection.on('connected', () => {
      logger.info('[Mongo] Connected to MongoDB');
      isIntentionallyClosed = false;
      connectionAttempts = 0;
      recordDbStatus('mongo', true);
    });

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, '[Mongo] Connection error');
      recordDbStatus('mongo', false);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('[Mongo] Disconnected from MongoDB');
      recordDbStatus('mongo', false);

      // Attempt reconnection after delay if not intentional
      if (!isIntentionallyClosed && connectionAttempts < MAX_RECONNECTION_ATTEMPTS) {
        connectionAttempts++;
        const delay = Math.min(RECONNECTION_DELAY_MS * connectionAttempts, 30000);
        logger.info(`[Mongo] Attempting to reconnect in ${delay}ms (attempt ${connectionAttempts}/${MAX_RECONNECTION_ATTEMPTS})`);

        setTimeout(() => {
          if (!isIntentionallyClosed && connectionAttempts < MAX_RECONNECTION_ATTEMPTS) {
            mongoose.connect(mongodbUri, options).catch((err) => {
              logger.error({ err }, '[Mongo] Reconnection failed');
            });
          } else {
            logger.error('[Mongo] Max reconnection attempts reached. Giving up.');
          }
        }, delay);
      }
    });

    // Log pool stats periodically in development
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const poolStats = mongoose.connection.pool ? mongoose.connection.pool.getPoolStats() : null;
        if (poolStats) {
          logger.debug(poolStats, '[Mongo] Pool stats');
        }
      }, 60000);
    }

    return mongoose;
  } catch (error) {
    logger.error({ err: error }, '[Mongo] Connection failed');
    recordDbStatus('mongo', false);
    throw error;
  }
};

/**
 * Check if MongoDB is ready (for readiness probes)
 */
export const isMongoReady = () => {
  return mongoose.connection.readyState === 1;
};

/**
 * Get MongoDB connection statistics
 */
export const getMongoStats = () => {
  if (!mongoose.connection.pool) {
    return { readyState: mongoose.connection.readyState };
  }

  try {
    const poolStats = mongoose.connection.pool.getPoolStats();
    return {
      readyState: mongoose.connection.readyState,
      pool: poolStats,
    };
  } catch (error) {
    return {
      readyState: mongoose.connection.readyState,
      error: error.message,
    };
  }
};

const disconnectMongo = async () => {
  try {
    isIntentionallyClosed = true;
    await mongoose.disconnect();
    logger.info('[Mongo] ✓ Disconnected');
    recordDbStatus('mongo', false);
  } catch (error) {
    logger.error({ err: error }, '[Mongo] Disconnection error');
    throw error;
  }
};

export { connectMongo, disconnectMongo, buildMongoOptions };
