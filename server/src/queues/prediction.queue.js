import { Queue } from "bullmq";
import { getRedis } from "../db/redis.js";

let predictionQueueInstance = null;
let predictionQueueConnection = null;

export const getPredictionQueue = () => {
  const connection = getRedis();
  // Rebuild the queue when the Redis client was reconnected — a cached Queue
  // bound to a closed connection silently fails every add() with
  // "Connection is closed".
  if (!predictionQueueInstance || predictionQueueConnection !== connection) {
    // Configurable so test suites (and parallel deployments) can isolate
    // their queue from any other consumer of the same Redis database.
    const queueName = process.env.PREDICTION_QUEUE_NAME || "prediction";
    predictionQueueInstance = new Queue(queueName, {
      connection,
    });
    predictionQueueConnection = connection;
  }
  return predictionQueueInstance;
};

export const predictionQueue = new Proxy({}, {
  get(_target, prop) {
    const q = getPredictionQueue();
    const val = q[prop];
    return typeof val === 'function' ? val.bind(q) : val;
  }
});
