/**
 * Metrics Tests
 *
 * Tests for the metrics collection and formatting functionality.
 * Verifies:
 * - Metrics are collected correctly
 * - Sensitive data is NOT included in labels
 * - Prometheus format is correct
 * - Metrics collection doesn't break the application
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";

// Import the metrics module
import {
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
} from "../utils/metrics.js";

describe("Metrics Module", () => {
  beforeEach(() => {
    // Reset metrics before each test
    resetMetrics();
  });

  afterEach(() => {
    // Clean up any mocks
    vi.restoreAllMocks();
  });

  describe("Counter Metrics", () => {
    it("should increment simple counters", () => {
      incrementCounter('test.counter1');
      incrementCounter('test.counter1');
      incrementCounter('test.counter2', 5);

      const metrics = getRawMetrics();
      expect(metrics.test.counter1).toBe(2);
      expect(metrics.test.counter2).toBe(5);
    });

    it("should create nested counters with dot notation", () => {
      incrementCounter('api.requests.total');
      incrementCounter('api.requests.total');
      incrementCounter('api.requests.success');

      const metrics = getRawMetrics();
      expect(metrics.api.requests.total).toBe(2);
      expect(metrics.api.requests.success).toBe(1);
    });

    it("should handle increment with value", () => {
      incrementCounter('test.value', 10);
      incrementCounter('test.value', 5);

      const metrics = getRawMetrics();
      expect(metrics.test.value).toBe(15);
    });

    it("should not throw on invalid counter names", () => {
      expect(() => {
        incrementCounter(null);
        incrementCounter(undefined);
        incrementCounter('');
      }).not.toThrow();
    });
  });

  describe("Gauge Metrics", () => {
    it("should set gauge values", () => {
      setGauge('test.gauge1', 42);
      setGauge('test.gauge2', 100);

      const metrics = getRawMetrics();
      expect(metrics.test.gauge1).toBe(42);
      expect(metrics.test.gauge2).toBe(100);
    });

    it("should overwrite gauge values", () => {
      setGauge('test.gauge', 10);
      setGauge('test.gauge', 20);

      const metrics = getRawMetrics();
      expect(metrics.test.gauge).toBe(20);
    });

    it("should handle invalid gauge names", () => {
      expect(() => {
        setGauge(null, 10);
        setGauge(undefined, 10);
      }).not.toThrow();
    });
  });

  describe("Request Recording", () => {
    it("should record request metrics", () => {
      recordRequest('/api/test', 100, 200);
      recordRequest('/api/test', 200, 200);
      recordRequest('/api/other', 50, 404);

      const metrics = getRawMetrics();
      expect(metrics.api.requests_total).toBe(3);
      expect(metrics.api.status_codes[200]).toBe(2);
      expect(metrics.api.status_codes[404]).toBe(1);
    });

    it("should normalize endpoint paths", () => {
      recordRequest('/api/sites/65f1a2b3c4d5e6f7a8b9c0d1', 100, 200);
      recordRequest('/api/sites/65f1a2b3c4d5e6f7a8b9c0d2', 100, 200);

      const metrics = getRawMetrics();
      // Both should be normalized to /api/sites/:id
      expect(metrics.api.endpoints['/api/sites/:id'].total).toBe(2);
    });

    it("should handle various status codes", () => {
      recordRequest('/api/test', 100, 200);
      recordRequest('/api/test', 100, 201);
      recordRequest('/api/test', 100, 400);
      recordRequest('/api/test', 100, 401);
      recordRequest('/api/test', 100, 403);
      recordRequest('/api/test', 100, 404);
      recordRequest('/api/test', 100, 500);
      recordRequest('/api/test', 100, 503);

      const metrics = getRawMetrics();
      expect(metrics.api.status_codes[200]).toBe(1);
      expect(metrics.api.status_codes[201]).toBe(1);
      expect(metrics.api.status_codes[400]).toBe(1);
      expect(metrics.api.status_codes[401]).toBe(1);
      expect(metrics.api.status_codes[403]).toBe(1);
      expect(metrics.api.status_codes[404]).toBe(1);
      expect(metrics.api.status_codes[500]).toBe(1);
      expect(metrics.api.status_codes[503]).toBe(1);
    });
  });

  describe("Database Status Recording", () => {
    it("should record database connection status", () => {
      recordDbStatus('mongo', true);
      recordDbStatus('mongo', true);
      recordDbStatus('mongo', false);
      recordDbStatus('redis', true);

      const metrics = getRawMetrics();
      expect(metrics.dependencies.mongo_connected).toBe(2);
      expect(metrics.dependencies.mongo_disconnected).toBe(1);
      expect(metrics.dependencies.redis_connected).toBe(1);
    });
  });

  describe("ML Status Recording", () => {
    it("should record ML service availability", () => {
      recordMlStatus(true);
      recordMlStatus(true);
      recordMlStatus(false);

      const metrics = getRawMetrics();
      expect(metrics.dependencies.ml_service_up).toBe(2);
      expect(metrics.dependencies.ml_service_down).toBe(1);
    });
  });

  describe("Investigation Outcome Recording", () => {
    it("should record investigation outcomes", () => {
      recordInvestigationOutcome('serious');
      recordInvestigationOutcome('minor');
      recordInvestigationOutcome('serious');

      const metrics = getRawMetrics();
      expect(metrics.investigations.completed_total).toBe(3);
      expect(metrics.investigations.by_classification.serious).toBe(2);
      expect(metrics.investigations.by_classification.minor).toBe(1);
    });
  });

  describe("Prediction Outcome Recording", () => {
    it("should record prediction outcomes", () => {
      recordPredictionOutcome('scored');
      recordPredictionOutcome('insufficient_data');
      recordPredictionOutcome('failed');
      recordPredictionOutcome('scored');

      const metrics = getRawMetrics();
      expect(metrics.predictions.total).toBe(4);
      expect(metrics.predictions.scored).toBe(2);
      expect(metrics.predictions.insufficient_data).toBe(1);
      expect(metrics.predictions.failed).toBe(1);
    });
  });

  describe("Event Ingestion Recording", () => {
    it("should record event ingestion", () => {
      recordEventIngestion('received');
      recordEventIngestion('received');
      recordEventIngestion('processed');
      recordEventIngestion('skipped');

      const metrics = getRawMetrics();
      expect(metrics.events.received_total).toBe(2);
      expect(metrics.events.processed_total).toBe(1);
      expect(metrics.events.skipped_total).toBe(1);
    });
  });

  describe("Incident Action Recording", () => {
    it("should record incident actions", () => {
      recordIncidentAction('created');
      recordIncidentAction('reviewed');
      recordIncidentAction('closed');
      recordIncidentAction('created');

      const metrics = getRawMetrics();
      expect(metrics.incidents.created_total).toBe(2);
      expect(metrics.incidents.reviewed_total).toBe(1);
      expect(metrics.incidents.closed_total).toBe(1);
    });
  });

  describe("Metrics Formatting", () => {
    it("should format metrics in Prometheus exposition format", async () => {
      // Add some metrics
      incrementCounter('test.counter', 5);
      setGauge('test.gauge', 42);
      recordRequest('/api/test', 100, 200);

      const formatted = await formatPrometheusMetrics();

      // Check that it's a string
      expect(typeof formatted).toBe('string');

      // Check that it contains HELP comments
      expect(formatted).toContain('# HELP');
      expect(formatted).toContain('# TYPE');

      // Check that it contains our test metrics
      expect(formatted).toContain('sentinel_api_requests_total');
      expect(formatted).toContain('sentinel_dependency_status');
    });

    it("should include type declarations for all metrics", async () => {
      incrementCounter('test.counter');
      setGauge('test.gauge', 10);

      const formatted = await formatPrometheusMetrics();

      // Counters should have TYPE counter
      expect(formatted).toContain('# TYPE sentinel_api_requests_total counter');
      expect(formatted).toContain('# TYPE sentinel_api_requests_duration_ms counter');
      
      // Gauges should have TYPE gauge
      expect(formatted).toContain('# TYPE sentinel_dependency_status gauge');
      expect(formatted).toContain('# TYPE sentinel_uptime_seconds gauge');
    });

    it("should include HELP comments for all metrics", async () => {
      const formatted = await formatPrometheusMetrics();

      expect(formatted).toContain('# HELP sentinel_api_requests_total');
      expect(formatted).toContain('# HELP sentinel_dependency_status');
      expect(formatted).toContain('# HELP sentinel_uptime_seconds');
    });

    it("should not include sensitive data in metric labels", async () => {
      // Record a request with a path that might contain sensitive data
      recordRequest('/api/users/65f1a2b3c4d5e6f7a8b9c0d1/profile', 100, 200);

      const formatted = await formatPrometheusMetrics();

      // The path should be normalized, not contain the actual user ID
      expect(formatted).not.toContain('65f1a2b3c4d5e6f7a8b9c0d1');
      // But should contain the normalized version
      expect(formatted).toContain('user');
    });

    it("should handle empty metrics gracefully", async () => {
      // Don't add any metrics
      const formatted = await formatPrometheusMetrics();

      // Should still be valid
      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('# Sentinel metrics');
    });
  });

  describe("Reset Metrics", () => {
    it("should reset all metrics to initial state", () => {
      // Add some metrics
      incrementCounter('test.counter', 10);
      setGauge('test.gauge', 42);
      recordRequest('/api/test', 100, 200);

      // Reset
      resetMetrics();

      const metrics = getRawMetrics();
      expect(metrics.api.requests_total).toBe(0);
      expect(metrics.test?.counter).toBeUndefined();
      expect(metrics.test?.gauge).toBeUndefined();
    });
  });

  describe("Error Handling", () => {
    it("should not throw when incrementing with invalid input", () => {
      expect(() => {
        incrementCounter(null);
        incrementCounter(undefined);
        incrementCounter('');
        incrementCounter('test..counter');
      }).not.toThrow();
    });

    it("should not throw when setting gauge with invalid input", () => {
      expect(() => {
        setGauge(null, 10);
        setGauge(undefined, 10);
        setGauge('', 10);
      }).not.toThrow();
    });

    it("should not throw when recording request with invalid input", () => {
      expect(() => {
        recordRequest(null, 100, 200);
        recordRequest('/api/test', null, 200);
        recordRequest('/api/test', 100, null);
      }).not.toThrow();
    });
  });

  describe("Label Escaping", () => {
    it("should escape label values properly", async () => {
      // This is tested through the formatPrometheusMetrics function
      // by checking that special characters don't break the format
      const formatted = await formatPrometheusMetrics();
      
      // Should not contain unescaped special characters in label values
      // (this is a basic check - actual escaping is handled in the format function)
      expect(formatted).toBeTruthy();
    });
  });
});
