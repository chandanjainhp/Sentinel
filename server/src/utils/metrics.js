/**
 * Sentinel Metrics Collection
 *
 * Lightweight, dependency-free metrics collection that exports in Prometheus format.
 * Designed to work without requiring prom-client or other heavy dependencies.
 *
 * Security considerations:
 * - Metrics endpoint is protected and should only be accessible to trusted monitoring
 * - No sensitive data (tokens, user IDs, credentials) in metric labels
 * - High-cardinality labels are avoided
 */

import { getInvestigationQueue } from '../queues/investigation.queue.js';
import { getRedis } from '../db/redis.js';
import mongoose from 'mongoose';

/**
 * Metrics storage - in-memory counters and gauges
 * In production, these should be backed by Redis or similar for persistence
 */
const metrics = {
  // API request metrics
  api: {
    requests_total: 0,
    requests_duration_ms: 0,
    requests_count: 0,
    status_codes: {},
    // Per-endpoint metrics (limited cardinality)
    endpoints: {},
  },
  
  // Dependency health
  dependencies: {
    mongo_connected: 0,
    mongo_disconnected: 0,
    redis_connected: 0,
    redis_disconnected: 0,
    ml_service_up: 0,
    ml_service_down: 0,
  },
  
  // Queue metrics
  queues: {
    investigations_waiting: 0,
    investigations_active: 0,
    investigations_completed: 0,
    investigations_failed: 0,
    investigations_delayed: 0,
    investigations_total: 0,
  },
  
  // Investigation outcomes
  investigations: {
    started_total: 0,
    completed_total: 0,
    failed_total: 0,
    by_classification: {},
  },
  
  // Prediction metrics
  predictions: {
    total: 0,
    scored: 0,
    insufficient_data: 0,
    failed: 0,
  },
  
  // Event ingestion
  events: {
    received_total: 0,
    processed_total: 0,
    skipped_total: 0,
  },
  
  // Incident metrics
  incidents: {
    created_total: 0,
    reviewed_total: 0,
    closed_total: 0,
  },
  
  // Startup timestamp
  started_at: Date.now(),
};

/**
 * Increment a counter metric
 * @param {string} name - Metric name (dot notation supported)
 * @param {number} value - Increment value (default: 1)
 * @param {Object} labels - Optional labels (NOT for high-cardinality data)
 */
export const incrementCounter = (name, value = 1, labels = {}) => {
  try {
    const parts = name.split('.');
    let current = metrics;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    const finalKey = parts[parts.length - 1];
    if (!current[finalKey]) {
      current[finalKey] = 0;
    }
    current[finalKey] += value;
    
    // If labels provided, store them separately (but avoid high cardinality)
    if (Object.keys(labels).length > 0) {
      const labelKey = `${finalKey}_labels`;
      if (!current[labelKey]) {
        current[labelKey] = {};
      }
      const labelString = Object.entries(labels)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => `${key}=${escapeLabelValue(val)}`)
        .join(',');
      
      if (!current[labelKey][labelString]) {
        current[labelKey][labelString] = 0;
      }
      current[labelKey][labelString] += value;
    }
  } catch (error) {
    // Metrics collection should never break the application
    console.error('[Metrics] Error incrementing counter:', error.message);
  }
};

/**
 * Set a gauge metric value
 * @param {string} name - Metric name (dot notation supported)
 * @param {number} value - Gauge value
 */
export const setGauge = (name, value) => {
  try {
    const parts = name.split('.');
    let current = metrics;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    const finalKey = parts[parts.length - 1];
    current[finalKey] = value;
  } catch (error) {
    // Metrics collection should never break the application
    console.error('[Metrics] Error setting gauge:', error.message);
  }
};

/**
 * Record request timing
 * @param {string} endpoint - Endpoint path (normalized to avoid high cardinality)
 * @param {number} durationMs - Request duration in milliseconds
 * @param {number} statusCode - HTTP status code
 */
export const recordRequest = (endpoint, durationMs, statusCode) => {
  try {
    incrementCounter('api.requests_total');
    incrementCounter(`api.status_codes.${statusCode}`);
    
    // Normalize endpoint to avoid high cardinality
    const normalized = normalizeEndpoint(endpoint);
    incrementCounter(`api.endpoints.${normalized}.total`);
    incrementCounter(`api.endpoints.${normalized}.status_${statusCode}`);
    
    // Record duration (for calculating averages)
    incrementCounter('api.requests_duration_ms', durationMs);
    incrementCounter('api.requests_count');
  } catch (error) {
    console.error('[Metrics] Error recording request:', error.message);
  }
};

/**
 * Normalize endpoint path to avoid high cardinality
 * - Group by route pattern, not exact path
 * - Remove IDs and dynamic segments
 */
const normalizeEndpoint = (endpoint) => {
  // Remove query parameters
  let path = endpoint.split('?')[0];
  
  // Replace IDs with :id
  path = path.replace(/\/[a-f0-9]{24}/gi, '/:id');
  
  // Replace other dynamic segments
  path = path.replace(/\/\d{4}-\d{2}-\d{2}/g, '/:date');
  path = path.replace(/\/[a-zA-Z0-9_-]+\/status/g, '/:resource/status');
  path = path.replace(/\/[a-zA-Z0-9_-]+\/start/g, '/:resource/start');
  
  // Collapse consecutive slashes
  path = path.replace(/\/+/g, '/');
  
  return path || 'root';
};

/**
 * Escape label value to be safe for Prometheus
 */
const escapeLabelValue = (value) => {
  if (value === undefined || value === null) {
    return 'null';
  }
  const str = String(value);
  // Prometheus label values can contain letters, numbers, and underscores
  // Replace special characters
  return str
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .substring(0, 100); // Limit length
};

/**
 * Record database connection status
 * @param {string} dbName - Database name (mongo, redis)
 * @param {boolean} connected - Connection status
 */
export const recordDbStatus = (dbName, connected) => {
  try {
    const key = `${dbName}_${connected ? 'connected' : 'disconnected'}`;
    incrementCounter(`dependencies.${key}`);
  } catch (error) {
    console.error('[Metrics] Error recording DB status:', error.message);
  }
};

/**
 * Record ML service availability
 * @param {boolean} available - Whether ML service is available
 */
export const recordMlStatus = (available) => {
  try {
    const key = available ? 'ml_service_up' : 'ml_service_down';
    incrementCounter(`dependencies.${key}`);
  } catch (error) {
    console.error('[Metrics] Error recording ML status:', error.message);
  }
};

/**
 * Record investigation outcome
 * @param {string} classification - Investigation classification
 */
export const recordInvestigationOutcome = (classification) => {
  try {
    incrementCounter('investigations.completed_total');
    incrementCounter(`investigations.by_classification.${classification || 'unknown'}`);
  } catch (error) {
    console.error('[Metrics] Error recording investigation outcome:', error.message);
  }
};

/**
 * Record prediction outcome
 * @param {string} outcome - 'scored', 'insufficient_data', or 'failed'
 */
export const recordPredictionOutcome = (outcome) => {
  try {
    incrementCounter('predictions.total');
    incrementCounter(`predictions.${outcome}`);
  } catch (error) {
    console.error('[Metrics] Error recording prediction outcome:', error.message);
  }
};

/**
 * Record event ingestion
 * @param {string} type - 'received', 'processed', or 'skipped'
 */
export const recordEventIngestion = (type) => {
  try {
    incrementCounter(`events.${type}_total`);
  } catch (error) {
    console.error('[Metrics] Error recording event ingestion:', error.message);
  }
};

/**
 * Record incident action
 * @param {string} action - 'created', 'reviewed', 'closed'
 */
export const recordIncidentAction = (action) => {
  try {
    incrementCounter(`incidents.${action}_total`);
  } catch (error) {
    console.error('[Metrics] Error recording incident action:', error.message);
  }
};

/**
 * Collect current queue metrics
 * @returns {Promise<Object>} Queue metrics
 */
export const collectQueueMetrics = async () => {
  try {
    const queue = getInvestigationQueue();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    
    return {
      investigations_waiting: waiting,
      investigations_active: active,
      investigations_completed: completed,
      investigations_failed: failed,
      investigations_delayed: delayed,
    };
  } catch (error) {
    console.error('[Metrics] Error collecting queue metrics:', error.message);
    return {
      investigations_waiting: 0,
      investigations_active: 0,
      investigations_completed: 0,
      investigations_failed: 0,
      investigations_delayed: 0,
    };
  }
};

/**
 * Collect current MongoDB metrics
 * @returns {Object} MongoDB metrics
 */
export const collectMongoMetrics = () => {
  try {
    const readyState = mongoose.connection.readyState;
    return {
      mongo_connected: readyState === 1 ? 1 : 0,
      mongo_connecting: readyState === 2 ? 1 : 0,
      mongo_disconnecting: readyState === 3 ? 1 : 0,
      mongo_disconnected: readyState === 0 ? 1 : 0,
    };
  } catch (error) {
    console.error('[Metrics] Error collecting MongoDB metrics:', error.message);
    return {
      mongo_connected: 0,
      mongo_connecting: 0,
      mongo_disconnecting: 0,
      mongo_disconnected: 1,
    };
  }
};

/**
 * Collect current Redis metrics
 * @returns {Promise<Object>} Redis metrics
 */
export const collectRedisMetrics = async () => {
  try {
    const redis = getRedis();
    if (!redis) {
      return {
        redis_connected: 0,
        redis_ready: 0,
      };
    }
    
    const status = redis.status;
    return {
      redis_connected: status === 'ready' || status === 'connect' ? 1 : 0,
      redis_ready: status === 'ready' ? 1 : 0,
    };
  } catch (error) {
    console.error('[Metrics] Error collecting Redis metrics:', error.message);
    return {
      redis_connected: 0,
      redis_ready: 0,
    };
  }
};

/**
 * Format metrics in Prometheus exposition format
 * @returns {Promise<string>} Prometheus-formatted metrics string
 */
export const formatPrometheusMetrics = async () => {
  const lines = [];
  
  try {
    // Collect live metrics
    const queueMetrics = await collectQueueMetrics();
    const mongoMetrics = collectMongoMetrics();
    const redisMetrics = await collectRedisMetrics();
    
    // Add type declarations
    lines.push('# HELP sentinel_api_requests_total Total number of API requests');
    lines.push('# TYPE sentinel_api_requests_total counter');
    lines.push(`sentinel_api_requests_total ${metrics.api.requests_total || 0}`);
    
    lines.push('# HELP sentinel_api_requests_duration_ms Total request duration in milliseconds');
    lines.push('# TYPE sentinel_api_requests_duration_ms counter');
    lines.push(`sentinel_api_requests_duration_ms ${metrics.api.requests_duration_ms || 0}`);
    
    lines.push('# HELP sentinel_api_requests_count Total number of requests');
    lines.push('# TYPE sentinel_api_requests_count counter');
    lines.push(`sentinel_api_requests_count ${metrics.api.requests_count || 0}`);
    
    // Status codes
    lines.push('# HELP sentinel_api_status_codes HTTP status code counts');
    lines.push('# TYPE sentinel_api_status_codes counter');
    for (const [code, count] of Object.entries(metrics.api.status_codes || {})) {
      lines.push(`sentinel_api_status_codes{code="${code}"} ${count}`);
    }
    
    // Endpoints (normalized)
    if (metrics.api.endpoints) {
      for (const [endpoint, endpointMetrics] of Object.entries(metrics.api.endpoints)) {
        const prefix = `sentinel_api_endpoint`;
        lines.push(`# HELP ${prefix}_total Total requests per endpoint`);
        lines.push(`# TYPE ${prefix}_total counter`);
        lines.push(`${prefix}_total{path="${endpoint}"} ${endpointMetrics.total || 0}`);
        
        for (const [status, count] of Object.entries(endpointMetrics)) {
          if (status !== 'total' && count > 0) {
            const statusCode = status.replace('status_', '');
            lines.push(`${prefix}_status_codes{path="${endpoint}",code="${statusCode}"} ${count}`);
          }
        }
      }
    }
    
    // Queue metrics
    lines.push('# HELP sentinel_queue_investigations_waiting Number of waiting investigation jobs');
    lines.push('# TYPE sentinel_queue_investigations_waiting gauge');
    lines.push(`sentinel_queue_investigations_waiting ${queueMetrics.investigations_waiting || 0}`);
    
    lines.push('# HELP sentinel_queue_investigations_active Number of active investigation jobs');
    lines.push('# TYPE sentinel_queue_investigations_active gauge');
    lines.push(`sentinel_queue_investigations_active ${queueMetrics.investigations_active || 0}`);
    
    lines.push('# HELP sentinel_queue_investigations_completed Number of completed investigation jobs');
    lines.push('# TYPE sentinel_queue_investigations_completed gauge');
    lines.push(`sentinel_queue_investigations_completed ${queueMetrics.investigations_completed || 0}`);
    
    lines.push('# HELP sentinel_queue_investigations_failed Number of failed investigation jobs');
    lines.push('# TYPE sentinel_queue_investigations_failed gauge');
    lines.push(`sentinel_queue_investigations_failed ${queueMetrics.investigations_failed || 0}`);
    
    lines.push('# HELP sentinel_queue_investigations_delayed Number of delayed investigation jobs');
    lines.push('# TYPE sentinel_queue_investigations_delayed gauge');
    lines.push(`sentinel_queue_investigations_delayed ${queueMetrics.investigations_delayed || 0}`);
    
    // Dependency metrics
    lines.push('# HELP sentinel_dependency_status Dependency connection status (1 = up, 0 = down)');
    lines.push('# TYPE sentinel_dependency_status gauge');
    lines.push(`sentinel_dependency_status{name="mongo"} ${mongoMetrics.mongo_connected || 0}`);
    lines.push(`sentinel_dependency_status{name="redis"} ${redisMetrics.redis_connected || 0}`);
    
    // Investigation outcomes
    lines.push('# HELP sentinel_investigations_completed_total Total completed investigations');
    lines.push('# TYPE sentinel_investigations_completed_total counter');
    lines.push(`sentinel_investigations_completed_total ${metrics.investigations.completed_total || 0}`);
    
    lines.push('# HELP sentinel_investigations_failed_total Total failed investigations');
    lines.push('# TYPE sentinel_investigations_failed_total counter');
    lines.push(`sentinel_investigations_failed_total ${metrics.investigations.failed_total || 0}`);
    
    if (metrics.investigations.by_classification) {
      lines.push('# HELP sentinel_investigations_by_classification Investigations by classification');
      lines.push('# TYPE sentinel_investigations_by_classification counter');
      for (const [classification, count] of Object.entries(metrics.investigations.by_classification)) {
        lines.push(`sentinel_investigations_by_classification{classification="${classification}"} ${count}`);
      }
    }
    
    // Prediction outcomes
    lines.push('# HELP sentinel_predictions_total Total predictions processed');
    lines.push('# TYPE sentinel_predictions_total counter');
    lines.push(`sentinel_predictions_total ${metrics.predictions.total || 0}`);
    
    lines.push('# HELP sentinel_predictions_scored Predictions that returned scored results');
    lines.push('# TYPE sentinel_predictions_scored counter');
    lines.push(`sentinel_predictions_scored ${metrics.predictions.scored || 0}`);
    
    lines.push('# HELP sentinel_predictions_insufficient_data Predictions with insufficient data');
    lines.push('# TYPE sentinel_predictions_insufficient_data counter');
    lines.push(`sentinel_predictions_insufficient_data ${metrics.predictions.insufficient_data || 0}`);
    
    lines.push('# HELP sentinel_predictions_failed Failed predictions');
    lines.push('# TYPE sentinel_predictions_failed counter');
    lines.push(`sentinel_predictions_failed ${metrics.predictions.failed || 0}`);
    
    // Event ingestion
    lines.push('# HELP sentinel_events_received_total Events received');
    lines.push('# TYPE sentinel_events_received_total counter');
    lines.push(`sentinel_events_received_total ${metrics.events.received_total || 0}`);
    
    lines.push('# HELP sentinel_events_processed_total Events processed');
    lines.push('# TYPE sentinel_events_processed_total counter');
    lines.push(`sentinel_events_processed_total ${metrics.events.processed_total || 0}`);
    
    lines.push('# HELP sentinel_events_skipped_total Events skipped');
    lines.push('# TYPE sentinel_events_skipped_total counter');
    lines.push(`sentinel_events_skipped_total ${metrics.events.skipped_total || 0}`);
    
    // Incident actions
    lines.push('# HELP sentinel_incidents_created_total Incidents created');
    lines.push('# TYPE sentinel_incidents_created_total counter');
    lines.push(`sentinel_incidents_created_total ${metrics.incidents.created_total || 0}`);
    
    lines.push('# HELP sentinel_incidents_reviewed_total Incidents reviewed');
    lines.push('# TYPE sentinel_incidents_reviewed_total counter');
    lines.push(`sentinel_incidents_reviewed_total ${metrics.incidents.reviewed_total || 0}`);
    
    lines.push('# HELP sentinel_incidents_closed_total Incidents closed');
    lines.push('# TYPE sentinel_incidents_closed_total counter');
    lines.push(`sentinel_incidents_closed_total ${metrics.incidents.closed_total || 0}`);
    
    // Uptime
    lines.push('# HELP sentinel_uptime_seconds Time since server start');
    lines.push('# TYPE sentinel_uptime_seconds gauge');
    lines.push(`sentinel_uptime_seconds ${Math.floor((Date.now() - metrics.started_at) / 1000)}`);
    
    // Add a comment about metrics collection
    lines.push('# Sentinel metrics collected at: ' + new Date().toISOString());
    
    return lines.join('\n');
  } catch (error) {
    console.error('[Metrics] Error formatting metrics:', error.message);
    return '# Error collecting metrics\n';
  }
};

/**
 * Reset all metrics (for testing)
 * This clears all metrics including dynamically created ones
 */
export const resetMetrics = () => {
  // Store the started_at timestamp before resetting
  const startedAt = metrics.started_at;
  
  // Clear all keys from the metrics object and reinitialize
  for (const key in metrics) {
    delete metrics[key];
  }
  
  // Reinitialize with default structure
  metrics.api = {
    requests_total: 0,
    requests_duration_ms: 0,
    requests_count: 0,
    status_codes: {},
    endpoints: {},
  };
  metrics.dependencies = {
    mongo_connected: 0,
    mongo_disconnected: 0,
    redis_connected: 0,
    redis_disconnected: 0,
    ml_service_up: 0,
    ml_service_down: 0,
  };
  metrics.queues = {
    investigations_waiting: 0,
    investigations_active: 0,
    investigations_completed: 0,
    investigations_failed: 0,
    investigations_delayed: 0,
    investigations_total: 0,
  };
  metrics.investigations = {
    started_total: 0,
    completed_total: 0,
    failed_total: 0,
    by_classification: {},
  };
  metrics.predictions = {
    total: 0,
    scored: 0,
    insufficient_data: 0,
    failed: 0,
  };
  metrics.events = {
    received_total: 0,
    processed_total: 0,
    skipped_total: 0,
  };
  metrics.incidents = {
    created_total: 0,
    reviewed_total: 0,
    closed_total: 0,
  };
  metrics.started_at = startedAt;
};

/**
 * Get raw metrics (for testing)
 */
export const getRawMetrics = () => ({ ...metrics });

export default {
  incrementCounter,
  setGauge,
  recordRequest,
  recordDbStatus,
  recordMlStatus,
  recordInvestigationOutcome,
  recordPredictionOutcome,
  recordEventIngestion,
  recordIncidentAction,
  collectQueueMetrics,
  collectMongoMetrics,
  collectRedisMetrics,
  formatPrometheusMetrics,
  resetMetrics,
  getRawMetrics,
};
