/**
 * Bounded awaiting for operations that can hang (LLM calls, BullMQ enqueues
 * against a dead Redis). Mirrors the ML client's AbortSignal.timeout pattern:
 * the caller decides the timeout; on expiry the promise rejects and the
 * caller's existing error handling takes over (retry → fallback / degrade).
 */
export const withTimeout = (promise, ms, label = "operation") =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
