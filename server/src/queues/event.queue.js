/**
 * Correlation queue — neutralized in Wave 0 of the cohesion plan.
 * The correlation pipeline (correlation.service.js) no longer exists and has
 * no producer, so the queue is not constructed and enqueueing is a no-op.
 * Kept as a stub so any accidental import fails soft instead of crashing.
 */

export const getCorrelationQueue = () => null;

export const enqueueCorrelation = async () => ({
  status: 'skipped',
  reason: 'correlation pipeline deferred',
});

export default { getCorrelationQueue, enqueueCorrelation };
