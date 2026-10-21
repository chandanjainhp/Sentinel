import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import {
  getInvestigationQueue,
  closeInvestigationQueue,
  resolveInvestigationQueueName,
} from "../queues/investigation.queue.js";
import {
  startInvestigationWorker,
  stopInvestigationWorker,
} from "../queues/investigation.worker.js";

/**
 * The producer used to hardcode 'investigations' while the worker read
 * INVESTIGATION_QUEUE_NAME. Setting the env var then enqueued jobs on a queue
 * nobody consumed, and nothing failed loudly.
 *
 * These tests pin one resolved name for both sides, with and without the env
 * var, using a throwaway queue name so no real jobs are touched.
 */

let workerConnection;
let queueNameBefore;

const uniqueName = () => `investigations_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  queueNameBefore = process.env.INVESTIGATION_QUEUE_NAME;
  await connectDatabases();
  workerConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
});

afterAll(async () => {
  await stopInvestigationWorker();
  await closeInvestigationQueue();
  if (workerConnection) await workerConnection.quit();
  if (queueNameBefore === undefined) delete process.env.INVESTIGATION_QUEUE_NAME;
  else process.env.INVESTIGATION_QUEUE_NAME = queueNameBefore;
  await disconnectDatabases();
});

const restoreEnv = (value) => {
  if (value === undefined) delete process.env.INVESTIGATION_QUEUE_NAME;
  else process.env.INVESTIGATION_QUEUE_NAME = value;
};

describe("investigation queue name", () => {
  it("defaults to 'investigations' when the env var is absent or empty", () => {
    expect(resolveInvestigationQueueName({})).toBe("investigations");
    expect(resolveInvestigationQueueName({ INVESTIGATION_QUEUE_NAME: "" })).toBe("investigations");
    expect(resolveInvestigationQueueName({ INVESTIGATION_QUEUE_NAME: "investigations_x" })).toBe(
      "investigations_x",
    );
  });

  it("gives the producer and the worker the same env-driven name", async () => {
    const name = uniqueName();
    process.env.INVESTIGATION_QUEUE_NAME = name;

    const queue = getInvestigationQueue();
    const worker = startInvestigationWorker(workerConnection);

    expect(queue.name).toBe(name);
    expect(worker.name).toBe(name);

    await stopInvestigationWorker();
    await closeInvestigationQueue();
  });

  it("keeps the default queue name when the env var is unset", async () => {
    restoreEnv(undefined);

    const queue = getInvestigationQueue();
    expect(queue.name).toBe("investigations");
    expect(resolveInvestigationQueueName()).toBe(queue.name);

    await closeInvestigationQueue();
  });
});
