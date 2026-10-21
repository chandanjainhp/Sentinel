import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import app from "../app.js";
import { connectDatabases, disconnectDatabases } from "../db/index.js";
import { Site } from "../models/site.model.js";

/**
 * Zod transforms (trim/default/coerce) must reach the controller, not just
 * the schema. Before this suite, validate() wrote only req.validated, which
 * no controller except apiKey.controller.js reads, so "  Plant  " was stored
 * untrimmed and a padded email could not log in.
 *
 * Port 8108 (Bun).
 */

const PORT = 8108;
const BASE_URL = `http://localhost:${PORT}/api/v1`;
let server;
let cookie;

const api = (method, path, { cookie: c, body } = {}) =>
  fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(c ? { Cookie: c } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  await connectDatabases();
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
  server = app.listen(PORT);

  const reg = await api("POST", "/auth/register", {
    body: {
      email: "body@factory.com",
      username: "body_user",
      password: "Password123!",
      ageConfirmed: true,
    },
  });
  expect(reg.status).toBe(201);
  cookie = reg.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
});

afterAll(async () => {
  if (server) server.close();
  await disconnectDatabases();
});

describe("validated body is applied", () => {
  it("trims the site name before storing it", async () => {
    const res = await api("POST", "/sites", {
      cookie,
      body: { name: "  Trimmed Plant  ", timezone: "UTC" },
    });
    expect(res.status).toBe(201);
    const data = (await res.json()).data;
    expect(data.name).toBe("Trimmed Plant");
    expect((await Site.findById(data._id).lean()).name).toBe("Trimmed Plant");
  });

  it("trims machine identity fields", async () => {
    const site = (await (await api("GET", "/sites", { cookie })).json()).data[0];
    const res = await api("POST", `/machines/sites/${site.siteId}/machines`, {
      cookie,
      body: {
        assetId: "  TRIM-1  ",
        name: "  Trimmed Motor  ",
        machineType: "  motor  ",
      },
    });
    expect(res.status).toBe(201);
    const machine = (await res.json()).data;
    expect(machine.assetId).toBe("TRIM-1");
    expect(machine.name).toBe("Trimmed Motor");
    expect(machine.machineType).toBe("motor");
  });

  it("logs in with the same address padded with whitespace", async () => {
    const res = await api("POST", "/auth/login", {
      body: { email: "  body@factory.com  ", password: "Password123!" },
    });
    expect(res.status).toBe(200);
  });
});

describe("validation still rejects bad values after trimming", () => {
  it("rejects a whitespace-only site name", async () => {
    const res = await api("POST", "/sites", {
      cookie,
      body: { name: "     ", timezone: "UTC" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a one-character name once trimmed", async () => {
    const res = await api("POST", "/sites", {
      cookie,
      body: { name: "  A  ", timezone: "UTC" },
    });
    expect(res.status).toBe(400);
  });
});
