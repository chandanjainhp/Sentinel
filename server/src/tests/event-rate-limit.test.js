import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import express from "express";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import {
  buildLimiter,
  eventKey,
  eventsLimiter,
} from "../middlewares/rateLimit.middleware.js";
import eventRoutes from "../routes/event.routes.js";

/**
 * Event ingestion used to skip the global limiter with no replacement, so a
 * runaway gateway (or a stolen API key) could write events as fast as it could
 * connect. The limiter is keyed per API key/user so one site cannot throttle
 * another behind the same IP, and it is mounted on POST /events only.
 */

const LIMIT = 3;
let server;
let baseUrl;

beforeAll(async () => {
  await connectDatabases();

  // Same construction path as the real eventsLimiter, with a small max so the
  // test sends four requests instead of six hundred.
  const limiter = buildLimiter(60_000, LIMIT, `events-test-${Date.now()}`, eventKey);

  const app = express();
  app.use((req, _res, next) => {
    const user = req.get("x-test-user");
    if (user) req.apiKey = { userId: user };
    next();
  });
  app.use(limiter);
  app.post("/", (_req, res) => res.json({ ok: true }));
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

afterAll(async () => {
  if (server) server.close();
  await disconnectDatabases();
});

const post = (user) =>
  fetch(`${baseUrl}/`, { method: "POST", headers: { "x-test-user": user } });

describe("event ingestion rate limiting", () => {
  it("is mounted on POST /events directly after API-key authentication", () => {
    const layers = eventRoutes.stack[0].route.stack.map((l) => l.handle);
    expect(layers.length).toBe(4);
    expect(layers[1]).toBe(eventsLimiter);
  });

  it("keys the limit by user, not by IP", () => {
    expect(eventKey({ apiKey: { userId: "abc123" }, ip: "10.0.0.1" })).toBe("abc123");
    expect(eventKey({ ip: "10.0.0.1" })).toBe("10.0.0.1");
  });

  it("rejects a burst above the limit but keeps legitimate traffic flowing", async () => {
    for (let i = 0; i < LIMIT; i += 1) {
      expect((await post("user-a")).status).toBe(200);
    }

    const throttled = await post("user-a");
    expect(throttled.status).toBe(429);

    // A different API key on the same IP is unaffected.
    expect((await post("user-b")).status).toBe(200);
  });
});
