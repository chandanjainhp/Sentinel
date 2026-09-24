import { connectMongo, disconnectMongo } from './mongo.js';
import { connectRedis, disconnectRedis } from './redis.js';

let instances = {
  mongo: null,
  redis: null,
};

const connectDatabases = async () => {
  try {
    console.log('[DB] Connecting to databases...');
    instances.mongo = await connectMongo();
    console.log('[DB] ✓ MongoDB connected');
    instances.redis = await connectRedis();
    console.log('[DB] ✓ Redis connected');
    console.log('[DB] All databases initialized successfully');
    return instances;
  } catch (error) {
    console.error('[DB] Database initialization failed:', error.message);
    throw error;
  }
};

const disconnectDatabases = async () => {
  try {
    console.log('[DB] Disconnecting from databases...');
    await disconnectMongo();
    instances.mongo = null;
    await disconnectRedis();
    instances.redis = null;
    console.log('[DB] All databases disconnected');
  } catch (error) {
    console.error('[DB] Disconnect error:', error.message);
    throw error;
  }
};

const getInstances = () => instances;

export { connectDatabases, disconnectDatabases, getInstances };
export default { connectDatabases, disconnectDatabases, getInstances };
