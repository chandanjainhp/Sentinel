import { describe, it, expect } from "bun:test";
import { createApi } from "../../scripts/demo-api.js";

/**
 * demo-run's postCycle sends `Idempotency-Key` via a `headers` option that the
 * old inline client silently dropped, so every demo run created fresh events.
 */

describe("demo-run api client", () => {
  it("forwards explicitly supplied headers such as Idempotency-Key", async () => {
    const calls = [];
    const fakeFetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json", "set-cookie": "session=abc" },
      });
    };

    const api = createApi("http://demo.test/api/v1", fakeFetch);
    const res = await api("POST", "/events", {
      key: "sk_demo",
      body: { values: { temperature: 1 } },
      headers: { "Idempotency-Key": "demo-1-temperature" },
    });

    expect(res.status).toBe(201);
    expect(res.json).toEqual({ ok: true });
    expect(res.setCookie).toBe("session=abc");

    const { url, init } = calls[0];
    expect(url).toBe("http://demo.test/api/v1/events");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe("demo-1-temperature");
    expect(init.headers.Authorization).toBe("Bearer sk_demo");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ values: { temperature: 1 } }));
  });
});
