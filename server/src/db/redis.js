import Redis from 'ioredis';

// Key naming constants
const AGENT_STATE_KEY = (jobId) => `agent:state:${jobId}`;
const AGENT_EVENTS_KEY = (jobId) => `agent:events:${jobId}`;
const AGENT_STATE_TTL = 2 * 60 * 60; // 2 hours in seconds

let redisClient = null;

const connectRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        if (times > 10) {
          console.error('[Redis] Max retries exceeded, stopping reconnection');
          return null;
        }
        return delay;
      },
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      enableOfflineQueue: true,
    });

    // Connection event listeners
    redisClient.on('connect', () => {
      console.log('[Redis] Connected to server');
    });

    redisClient.on('ready', () => {
      console.log('[Redis] Ready to accept commands');
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Error:', err.message);
    });

    redisClient.on('reconnecting', () => {
      console.log('[Redis] Attempting to reconnect...');
    });

    redisClient.on('close', () => {
      console.log('[Redis] Connection closed');
    });

    // Ping to verify connection
    const pong = await redisClient.ping();
    console.log('[Redis] ✓ Connected and responsive:', pong);

    return redisClient;
  } catch (error) {
    console.error('[Redis] Connection failed:', error.message);
    throw error;
  }
};

const disconnectRedis = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
      console.log('[Redis] ✓ Disconnected');
      redisClient = null;
    }
  } catch (error) {
    console.error('[Redis] Disconnection error:', error.message);
    throw error;
  }
};

const getRedis = () => redisClient;

// Agent state management helpers
const setAgentState = async (jobId, state) => {
  try {
    if (!redisClient) {
      throw new Error('Redis client not connected');
    }
    const key = AGENT_STATE_KEY(jobId);
    const value = JSON.stringify(state);
    await redisClient.setex(key, AGENT_STATE_TTL, value);
    console.log(`[Redis] Agent state cached for job ${jobId}`);
  } catch (error) {
    console.error('[Redis] setAgentState failed:', error.message);
    throw error;
  }
};

const getAgentState = async (jobId) => {
  try {
    if (!redisClient) {
      throw new Error('Redis client not connected');
    }
    const key = AGENT_STATE_KEY(jobId);
    const value = await redisClient.get(key);
    if (!value) {
      return null;
    }
    return JSON.parse(value);
  } catch (error) {
    console.error('[Redis] getAgentState failed:', error.message);
    throw error;
  }
};

const deleteAgentState = async (jobId) => {
  try {
    if (!redisClient) {
      throw new Error('Redis client not connected');
    }
    const key = AGENT_STATE_KEY(jobId);
    await redisClient.del(key);
    console.log(`[Redis] Agent state cleaned up for job ${jobId}`);
  } catch (error) {
    console.error('[Redis] deleteAgentState failed:', error.message);
    throw error;
  }
};

export {
  connectRedis,
  disconnectRedis,
  getRedis,
  setAgentState,
  getAgentState,
  deleteAgentState,
  AGENT_STATE_KEY,
  AGENT_EVENTS_KEY,
};
