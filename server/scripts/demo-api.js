/**
 * Minimal JSON client for the demo script.
 *
 * `headers` are forwarded verbatim — the demo sends `Idempotency-Key` so that
 * re-running a phase does not duplicate events.
 */
export const createApi =
  (baseUrl, fetchImpl = fetch) =>
  async (method, path, { cookie, key, body, headers } = {}) => {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        ...headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON */
    }
    return { status: res.status, json, setCookie: res.headers.get("set-cookie") };
  };
