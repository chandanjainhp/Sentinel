/**
 * Metrics Collection Middleware
 *
 * Collects request metrics for API endpoints and exposes a /metrics endpoint
 * for Prometheus scraping.
 *
 * Security: The /metrics endpoint is restricted and should only be accessible
 * to trusted monitoring infrastructure via network-level controls or authentication.
 */

import { recordRequest, formatPrometheusMetrics } from '../utils/metrics.js';

/**
 * Metrics collection middleware - records request timing and status
 * 
 * Must be placed AFTER the request starts timing but BEFORE route handlers.
 * We use a custom timing approach since we want to measure the full request lifecycle.
 */
export const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  // Store start time for later calculation
  req._metricsStart = start;
  
  // Original res.end to capture status code
  const originalEnd = res.end;
  res.end = function (...args) {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    
    // Try to get status code
    let statusCode = res.statusCode || 200;
    if (res._statusCode) {
      statusCode = res._statusCode;
    }
    
    // Record the request
    const endpoint = req.path || req.url;
    recordRequest(endpoint, durationMs, statusCode);
    
    // Restore original end
    res.end = originalEnd;
    return originalEnd.apply(this, args);
  };
  
  next();
};

/**
 * Metrics endpoint handler
 * 
 * Returns Prometheus-formatted metrics. This endpoint should be protected
 * and only accessible to trusted monitoring infrastructure.
 *
 * Security considerations:
 * - No authentication in this handler - access control MUST be at the network/firewall level
 * - Never exposes sensitive data in metric labels
 * - High-cardinality labels are avoided
 * - Endpoint path can be configured via METRICS_PATH env var
 */
export const metricsHandler = async (req, res) => {
  try {
    // Optional: Add IP-based access control if METRICS_ALLOWED_IPS is configured
    const allowedIps = process.env.METRICS_ALLOWED_IPS?.split(',') || [];
    if (allowedIps.length > 0) {
      const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
      if (!allowedIps.includes(clientIp)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Optional: Add authentication if METRICS_API_KEY is configured
    const metricsApiKey = process.env.METRICS_API_KEY;
    if (metricsApiKey) {
      const providedKey = req.headers.authorization?.replace('Bearer ', '') ||
                        req.headers['x-metrics-api-key'] ||
                        req.query.api_key;
      
      if (providedKey !== metricsApiKey) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }
    
    const metrics = await formatPrometheusMetrics();
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    // Metrics collection should never break the application
    console.error('[Metrics] Error in metrics handler:', error.message);
    res.status(500).send('# Error collecting metrics\n');
  }
};

/**
 * Health check that includes metrics readiness
 * 
 * Returns a simple health status that can be used by load balancers.
 * Does not expose detailed metrics.
 */
export const metricsHealthHandler = async (req, res) => {
  try {
    // If we can format metrics, we're healthy
    const metrics = await formatPrometheusMetrics();
    if (metrics.includes('Error')) {
      return res.status(503).json({ status: 'unhealthy', error: 'Metrics collection failed' });
    }
    
    res.json({
      status: 'healthy',
      metrics: 'available',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
};

export default {
  metricsMiddleware,
  metricsHandler,
  metricsHealthHandler,
};
