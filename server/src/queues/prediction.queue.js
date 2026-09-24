import { Queue } from "bullmq";
import { getRedis } from "../db/redis.js";

let predictionQueueInstance = null;

export const getPredictionQueue = () => {
  if (!predictionQueueInstance) {
    const connection = getRedis();
    predictionQueueInstance = new Queue("prediction", {
      connection,
    });
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
