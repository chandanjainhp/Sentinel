const ML_URL = process.env.ML_URL ?? "http://localhost:9000";
const WINDOW = 60;         // recommended window size
const TIMEOUT_MS = 5000;   // never wait forever on the ML service

export function severity(score) {
  if (score >= 0.90) return "CRITICAL";
  if (score >= 0.75) return "WARNING";
  return "OK";
}

/** events: [{ timestamp, values: {temperature, vibration, current, rpm} }], oldest first */
export async function scoreMachine(machineId, events) {
  let res;
  try {
    res = await fetch(`${ML_URL}/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ machineId, machineType: "generic_motor", window: events.slice(-WINDOW) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // timeout or connection refused: treat as "ML unavailable", never as "machine is fine"
    return { kind: "unavailable", reason: err.name === "TimeoutError" ? "timeout" : String(err) };
  }

  if (res.status === 503) return { kind: "unavailable", reason: "model not loaded" };
  if (!res.ok) {
    // 400 / 422 mean our request is wrong; 500 is a server fault. Surface it, do not swallow it.
    throw new Error(`ml-service ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  if (body.status === "insufficient_data") {
    return { kind: "waiting", have: body.have, need: body.need };   // not an error, not an alert
  }
  return {
    kind: "scored",
    severity: severity(body.anomalyScore),
    anomalyScore: body.anomalyScore,
    faultProbability: body.faultProbability,
    faultType: body.faultType,
    suspectChannel: body.suspectChannel,
    rul: body.rulValue === null ? "not available" : body.rulValue,  // null is NOT zero
    modelVersion: body.modelVersion,
  };
}
