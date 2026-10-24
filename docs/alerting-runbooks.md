# Sentinel Alerting Rules and Operational Runbooks

**Version:** 1.0  
**Last Updated:** 2026-10-22  
**Status:** Rules defined, not yet deployed or verified

---

## Overview

This document defines the alerting rules and operational runbooks for the Sentinel system. These alerts are designed to be **actionable** - each alert has a clear investigation path and recovery procedure.

**Current Status:** Alert rules and runbooks are **documented but not deployed**. No actual alerting infrastructure (Prometheus Alertmanager, PagerDuty, etc.) has been configured or tested at this time.

---

## Alerting Architecture

### Monitoring Stack

The Sentinel monitoring stack consists of:

1. **Metrics Collection** (Phase 2):
   - Prometheus-compatible metrics endpoint at `/api/v1/metrics`
   - Metrics include: API request rates, latencies, error rates, database health, queue depths, investigation outcomes, ML service availability
   - All metrics avoid high-cardinality labels and sensitive data

2. **Metrics Endpoint Configuration**:
   - **Path:** `/api/v1/metrics` (configurable via `METRICS_PATH` env var)
   - **Format:** Prometheus exposition format
   - **Access Control:** 
     - Optional IP-based allowlist via `METRICS_ALLOWED_IPS`
     - Optional API key authentication via `METRICS_API_KEY`
   - **Security:** Should be restricted to internal network or VPN

3. **Recommended Deployment**:
   ```
   +------------------+     +-------------------+     +------------------+
   | Sentinel App    |---->| Prometheus       |---->| Alertmanager     |
   | /api/v1/metrics |     | (scrape config)  |     | (alert rules)    |
   +------------------+     +-------------------+     +------------------+
                                                            |
                                                            v
   +-------------------------------------------------------+
   | Notification Destinations:                          |
   | - PagerDuty/Slack (critical alerts)                   |
   | - Email (warning alerts)                            |
   | - Logging (all alerts for audit)                    |
   +-------------------------------------------------------+
   ```

---

## Alert Severity Levels

| Severity | Response Time | Notification Method | Example Conditions |
|----------|---------------|---------------------|-------------------|
| **Critical** | Immediate (24/7) | Pager + SMS + Slack | System down, data loss, security breach |
| **High** | Within 1 hour | Pager + Slack | Degraded service, high error rates |
| **Medium** | Within 4 hours | Slack | Elevated error rates, resource exhaustion |
| **Low** | Within 24 hours | Email / Log | Informational, non-urgent |

---

## Alert Rules

### Critical Alerts (P0 - Immediate Response Required)

#### ALERT-001: Application Unavailable

```yaml
# Prometheus Alertmanager Rule
- alert: SentinelApplicationUnavailable
  expr: up{job="sentinel"} == 0
  for: 5m
  labels:
    severity: critical
    category: availability
  annotations:
    summary: "Sentinel application is down"
    description: "The Sentinel server has been down for more than 5 minutes"
    runbook: "https://github.com/sentinel/docs/alerting-runbooks#alert-001"
```

**Runbook:**

1. **Investigation:**
   - Check server process: `docker compose ps`
   - Check logs: `docker compose logs server`
   - Check port binding: `netstat -tlnp | grep 8000`
   - Check resource usage: `docker stats`

2. **Common Causes:**
   - Docker container crashed (OOM, exit code)
   - Port already in use
   - Missing environment variables
   - Database connection failure

3. **Recovery Steps:**
   - Restart container: `docker compose restart server`
   - Check for OOM: `docker stats --no-stream`
   - If OOM: Increase memory limits in docker-compose.yml
   - Check database connectivity: `docker compose exec mongodb mongosh --eval "db.adminCommand({ping: 1})"`
   - Verify secrets: Ensure all required .env variables are set
   - Check for port conflicts: `lsof -i :8000`

4. **Escalation:**
   - If restart doesn't work within 5 minutes, escalate to on-call engineer
   - If database is down, check MongoDB container and volumes

**Rollback:** Not applicable - this is infrastructure, not code

---

#### ALERT-002: MongoDB Unavailable

```yaml
- alert: SentinelMongoDBUnavailable
  expr: sentinel_dependency_status{name="mongo"} == 0
  for: 2m
  labels:
    severity: critical
    category: database
  annotations:
    summary: "MongoDB is unavailable"
    description: "MongoDB connection has been down for more than 2 minutes"
    runbook: "https://github.com/sentinel/docs/alerting-runbooks#alert-002"
```

**Runbook:**

1. **Investigation:**
   - Check MongoDB container: `docker compose ps | grep mongodb`
   - Check MongoDB logs: `docker compose logs mongodb`
   - Test connection: `docker compose exec mongodb mongosh --eval "db.adminCommand({ping: 1}).ok"`
   - Check disk space: `docker system df`

2. **Common Causes:**
   - MongoDB container crashed
   - Disk space exhausted
   - OOM killer terminated process
   - Authentication failure

3. **Recovery Steps:**
   - Restart MongoDB: `docker compose restart mongodb`
   - If disk space: Clean up old data or increase volume
   - Check authentication: Verify `MONGO_ROOT_PASSWORD` is set correctly
   - If data corruption: Restore from backup (see backup-restore.md)

4. **Escalation:**
   - If data loss suspected, do NOT restart - escalate immediately
   - If restart doesn't work within 10 minutes, escalate

**Rollback:** Restore from most recent backup if data corruption is confirmed

---

#### ALERT-003: Redis Unavailable

```yaml
- alert: SentinelRedisUnavailable
  expr: sentinel_dependency_status{name="redis"} == 0
  for: 2m
  labels:
    severity: critical
    category: database
  annotations:
    summary: "Redis is unavailable"
    description: "Redis connection has been down for more than 2 minutes"
    runbook: "https://github.com/sentinel/docs/alerting-runbooks#alert-003"
```

**Runbook:**

1. **Investigation:**
   - Check Redis container: `docker compose ps | grep redis`
   - Check Redis logs: `docker compose logs redis`
   - Test connection: `docker compose exec redis redis-cli ping`
   - Check memory usage: `docker compose exec redis redis-cli INFO memory`

2. **Common Causes:**
   - Redis container crashed
   - OOM (Redis maxmemory limit reached)
   - Configuration error

3. **Recovery Steps:**
   - Restart Redis: `docker compose restart redis`
   - Check maxmemory policy: Verify `maxmemory-policy` in docker-compose.yml
   - If OOM: Increase `maxmemory` limit or adjust eviction policy
   - Check authentication: Verify `REDIS_PASSWORD` is set correctly

4. **Impact:**
   - Rate limiting will fail open (no limiting)
   - BullMQ queues will not process jobs
   - Session caching will fail

**Rollback:** Not applicable - restart should resolve

---

### High Alerts (P1 - Urgent Response Required)

#### ALERT-010: High API Error Rate

```yaml
- alert: SentinelHighAPIErrorRate
  expr: |
    rate(sentinel_api_status_codes{code=~"5.."}[5m]) / 
    rate(sentinel_api_requests_total[5m]) > 0.1
  for: 5m
  labels:
    severity: high
    category: api
  annotations:
    summary: "High API error rate detected"
    description: "More than 10% of API requests are returning 5xx errors"
    runbook: "https://github.com/sentinel/docs/alerting-runbooks#alert-010"
```

**Runbook:**

1. **Investigation:**
   - Check error rate by endpoint: `/api/v1/metrics` (look for endpoint-specific errors)
   - Check server logs: `docker compose logs server | grep -i error`
   - Check database connectivity: Verify MongoDB and Redis are healthy
   - Check resource usage: `docker stats --no-stream`

2. **Common Causes:**
   - Database connection issues (see ALERT-002)
   - Redis connection issues (see ALERT-003)
   - ML service unavailable (see ALERT-011)
   - Memory exhaustion
   - Request timeouts

3. **Recovery Steps:**
   - Restart server: `docker compose restart server`
   - Check for specific error patterns in logs
   - If database issues: See MongoDB/Redis runbooks
   - If ML service: See ALERT-011
   - Increase resources if OOM

4. **Escalation:**
   - If error rate > 20% for more than 10 minutes, escalate
   - If pattern indicates security issue (401/403 spikes), escalate immediately

**Rollback:** Not applicable - investigate and fix root cause

---

#### ALERT-011: ML Service Unavailable

```yaml
- alert: SentinelMLServiceUnavailable
  expr: sentinel_dependency_status{name="ml_service"} == 0
  for: 5m
  labels:
    severity: high
    category: ml
  annotations:
    summary: "ML service is unavailable"
    description: "ML service has been unavailable for more than 5 minutes"
    runbook: "https://github.com/sentinel/docs/alerting-runbooks#alert-011"
```

**Runbook:**

1. **Investigation:**
   - Check ML service container: `docker compose ps | grep ml-service`
   - Check ML service logs: `docker compose logs ml-service`
   - Test health endpoint: `curl http://localhost:9000/health`
   - Check ML service authentication: Verify `ML_API_KEY` is set correctly in both server and ml-service

2. **Common Causes:**
   - ML service container crashed
   - Missing or invalid ML_API_KEY
   - Model loading failure
   - GPU/OOM issues (if using GPU)

3. **Recovery Steps:**
   - Restart ML service: `docker compose restart ml-service`
   - Verify ML_API_KEY matches in both server and ml-service .env files
   - Check model directory: Verify models are in `./ml-service/models/`
   - Test model loading: Check ml-service logs for model loading errors

4. **Impact:**
   - Predictions will fail, using fallback classification
   - Investigations will use deterministic fallback (no LLM analysis)
   - System degrades gracefully but with reduced accuracy

**Rollback:** Not applicable

---

#### ALERT-012: Investigation Queue Stalled

```yaml
- alert: SentinelInvestigationQueueStalled
  expr: |
    sentinel_queue_investigations_active > 0 and 
    rate(sentinel_queue_investigations_completed_total[15m]) == 0
  for: 15m
  labels:
    severity: high
    category: queue
  annotations:
    summary: "Investigation queue is stalled"
    description: "Active investigation jobs are not completing"
    runbook: "https://github.com/sentinel/docs/alerting-runbooks#alert-012"
```

**Runbook:**

1. **Investigation:**
   - Check queue stats: `curl http://localhost:8000/api/v1/metrics | grep sentinel_queue`
   - Check worker container: `docker compose ps | grep server` (workers run in server container)
   - Check worker logs: `docker compose logs server | grep -i worker`
   - Check Redis: Verify Redis is healthy (see ALERT-003)

2. **Common Causes:**
   - Worker crashed or not started
   - Redis connection issues
   - Jobs stuck due to errors
   - ML service unavailable (jobs will retry but eventually fail)

3. **Recovery Steps:**
   - Restart server: `docker compose restart server` (this restarts workers)
   - Check for failed jobs: Use BullMQ CLI or API to list failed jobs
   - Retry failed jobs: If jobs failed due to transient issues, they will auto-retry
   - Check ML service: See ALERT-011 if ML is unavailable

4. **Manual Intervention:**
   - List failed jobs: `GET /api/v1/health/full` may show queue status
   - Check specific job: Use job ID to query status

**Rollback:** Not applicable

---

#### ALERT-013: Failed Investigation Jobs Accumulating

```yaml
- alert: SentinelFailedInvestigationsAccumulating
  expr: |
    increase(sentinel_queue_investigations_failed[1h]) > 5
  for: 30m
  labels:
    severity: high
    category: queue
  annotations:
    summary: "Failed investigation jobs are accumulating"
    description: "More than 5 investigation jobs have failed in the last hour"
    runbook: "https://github.com/sentinel/docs/alerting-runbooks#alert-013"
```

**Runbook:**

1. **Investigation:**
   - Check failed job count: `/api/v1/metrics` for `sentinel_queue_investigations_failed`
   - Check server logs for job failures: `docker compose logs server | grep -i "failed\|error"`
   - Check ML service: See ALERT-011
   - Check database: See ALERT-002

2. **Common Causes:**
   - Persistent ML service failures
   - Database connection issues
   - Bug in investigation logic
   - Missing required data

3. **Recovery Steps:**
   - Identify failure pattern from logs
   - If ML service issue: Fix ML service (see ALERT-011)
   - If database issue: Fix database (see ALERT-002)
   - Check if specific incidents/machines are failing
   - Manual retry: Use API to retry specific failed jobs

4. **Escalation:**
   - If > 10 failed jobs in 1 hour, escalate
   - If failure pattern suggests data corruption, escalate immediately

**Rollback:** Not applicable

---

### Medium Alerts (P2 - Response Within 4 Hours)

#### ALERT-020: Elevated API Error Rate (4xx)

```yaml
- alert: SentinelElevatedClientErrorRate
  expr: |
    rate(sentinel_api_status_codes{code=~"4.."}[15m]) / 
    rate(sentinel_api_requests_total[15m]) > 0.05
  for: 15m
  labels:
    severity: medium
    category: api
  annotations:
    summary: "Elevated client error rate"
    description: "More than 5% of API requests are returning 4xx errors"
    runbook: "https://github.com/sentinel/docs/alerting-runbooks#alert-020"
```

**Runbook:**

1. **Investigation:**
   - Check 4xx errors by code: `/api/v1/metrics` for specific status codes
   - Check most common 4xx endpoints: Look for patterns in specific routes
   - Check authentication errors: Look for 401/403 spikes

2. **Common Causes:**
   - Client sending malformed requests
   - Authentication/authorization issues
   - Rate limiting triggering (429)
   - CSRF protection blocking requests

3. **Recovery Steps:**
   - If authentication: Verify client credentials are valid
   - If rate limiting: Check if legitimate traffic is being limited
   - If CSRF: Verify frontend is sending Origin headers correctly
   - Check for client bugs if specific endpoints are affected

4. **Escalation:**
   - If error rate > 10% for more than 30 minutes, escalate
   - If authentication failures spike, check for security issues

**Rollback:** Not applicable

---

#### ALERT-021: High Request Latency

```yaml
- alert: SentinelHighRequestLatency
  expr: |
    histogram_quantile(0.95, sum(rate(sentinel_api_requests_duration_ms_bucket[5m])) by (le)) > 5000
  for: 10m
  labels:
    severity: medium
    category: performance
  annotations:
    summary: "High request latency detected"
    description: "95th percentile request latency exceeds 5 seconds"
    runbook: "https://github.com/sentinel/docs/alerting-runbooks#alert-021"
```

**Note:** This alert requires histogram metrics. Current implementation uses counters. 
For now, use a simplified version:

```yaml
- alert: SentinelHighAverageLatency
  expr: |
    (rate(sentinel_api_requests_duration_ms[5m]) / rate(sentinel_api_requests_count[5m])) > 2000
  for: 10m
  labels:
    severity: medium
    category: performance
  annotations:
    summary: "High average request latency"
    description: "Average request latency exceeds 2 seconds"
```

**Runbook:**

1. **Investigation:**
   - Check latency by endpoint: `/api/v1/metrics` for endpoint-specific metrics
   - Check database query performance: Enable MongoDB profiling
   - Check ML service latency: Verify ML predictions are not slow
   - Check resource usage: CPU, memory, disk I/O

2. **Common Causes:**
   - Slow database queries
   - ML service delays
   - High server load
   - Network latency

3. **Recovery Steps:**
   - Optimize slow queries (add indexes, reduce data fetched)
   - Check ML service performance (see ALERT-011)
   - Scale up resources if CPU/memory constrained
   - Add query timeouts if missing

4. **Escalation:**
   - If latency > 5 seconds average for more than 30 minutes, escalate

**Rollback:** Not applicable

---

#### ALERT-022: Queue Backlog Growing

```yaml
- alert: SentinelQueueBacklogGrowing
  expr: |
    sentinel_queue_investigations_waiting > 100
  for: 30m
  labels:
    severity: medium
    category: queue
  annotations:
    summary: "Investigation queue backlog is growing"
    description: "More than 100 investigation jobs are waiting in the queue"
    runbook: "https://github.com/sentinel/docs/alerting-runbooks#alert-022"
```

**Runbook:**

1. **Investigation:**
   - Check queue depth: `/api/v1/metrics` for `sentinel_queue_investigations_waiting`
   - Check worker concurrency: Currently set to 2 (see investigation.queue.js)
   - Check worker health: Verify workers are running
   - Check job processing rate: Compare completed vs waiting

2. **Common Causes:**
   - Insufficient worker concurrency
   - Slow job processing (ML delays, database slowness)
   - Burst of new incidents
   - Worker crashed or not processing

3. **Recovery Steps:**
   - Increase worker concurrency: Set `concurrency` higher in worker configuration
   - Restart workers: `docker compose restart server`
   - Check for slow dependencies (ML service, database)
   - Scale horizontally: Add more worker instances

4. **Configuration:**
   - Current concurrency: 2
   - Recommended: Increase to match available CPU cores
   - Command to change: Modify `concurrency` in investigation.worker.js

**Rollback:** Reduce concurrency if resource exhaustion occurs

---

### Low Alerts (P3 - Informational)

#### ALERT-030: Backup Not Performed

```yaml
- alert: SentinelBackupNotPerformed
  expr: |
    (time() - sentinel_backup_last_success_timestamp) > 86400
  labels:
    severity: low
    category: backup
  annotations:
    summary: "Backup has not been performed recently"
    description: "No successful backup in the last 24 hours"
    runbook: "https://github.com/sentinel/docs/alerting-runbooks#alert-030"
```

**Note:** This requires adding a `sentinel_backup_last_success_timestamp` metric. 
See backup-restore.md for backup implementation.

**Runbook:**

1. **Investigation:**
   - Check backup scripts: Verify backup-mongodb.sh exists and is executable
   - Check backup directory: `ls -la /var/backups/mongodb/`
   - Check cron/systemd: Verify backup automation is configured
   - Check logs: `/var/log/mongodb-backup.log`

2. **Common Causes:**
   - Backup script not configured in cron
   - Permission issues
   - Disk space exhausted
   - MongoDB authentication failure

3. **Recovery Steps:**
   - Run manual backup: `./scripts/backup-mongodb.sh /var/backups/mongodb`
   - Fix cron configuration if missing
   - Check disk space: `df -h /var/backups`
   - Verify MongoDB credentials in environment

4. **Escalation:**
   - If backup not working after manual run, escalate
   - If data loss risk, escalate immediately

**Rollback:** Not applicable

---

## Runbook Index

| Alert ID | Title | Severity | Category | Page |
|----------|-------|----------|----------|------|
| ALERT-001 | Application Unavailable | Critical | Availability | [Link](#alert-001-application-unavailable) |
| ALERT-002 | MongoDB Unavailable | Critical | Database | [Link](#alert-002-mongodb-unavailable) |
| ALERT-003 | Redis Unavailable | Critical | Database | [Link](#alert-003-redis-unavailable) |
| ALERT-010 | High API Error Rate | High | API | [Link](#alert-010-high-api-error-rate) |
| ALERT-011 | ML Service Unavailable | High | ML | [Link](#alert-011-ml-service-unavailable) |
| ALERT-012 | Investigation Queue Stalled | High | Queue | [Link](#alert-012-investigation-queue-stalled) |
| ALERT-013 | Failed Investigation Jobs Accumulating | High | Queue | [Link](#alert-013-failed-investigations-accumulating) |
| ALERT-020 | Elevated Client Error Rate | Medium | API | [Link](#alert-020-elevated-client-error-rate) |
| ALERT-021 | High Request Latency | Medium | Performance | [Link](#alert-021-high-request-latency) |
| ALERT-022 | Queue Backlog Growing | Medium | Queue | [Link](#alert-022-queue-backlog-growing) |
| ALERT-030 | Backup Not Performed | Low | Backup | [Link](#alert-030-backup-not-performed) |

---

## Alerting Configuration Examples

### Prometheus Scrape Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'sentinel'
    scrape_interval: 15s
    scrape_timeout: 10s
    metrics_path: '/api/v1/metrics'
    static_configs:
      - targets: ['sentinel-server:8000']
    # If authentication is enabled
    basic_auth:
      username: metrics
      password: ${METRICS_PASSWORD}
    # Or use bear token
    # bearer_token: ${METRICS_API_KEY}
```

### Alertmanager Configuration

```yaml
# alertmanager.yml
route:
  group_by: ['alertname', 'severity', 'category']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 3h
  receiver: 'default-receiver'
  
  routes:
    - match:
        severity: critical
      receiver: 'critical-receiver'
      group_interval: 1m
      repeat_interval: 5m
    
    - match:
        severity: high
      receiver: 'high-receiver'
      group_interval: 5m
      repeat_interval: 1h
    
    - match:
        severity: medium
      receiver: 'medium-receiver'
      group_interval: 15m
      repeat_interval: 4h

receivers:
  - name: 'default-receiver'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/...'
        channel: '#sentinel-alerts'
        send_resolved: true
        title: '{{ template "slack.title" . }}'
        text: '{{ template "slack.text" . }}'

  - name: 'critical-receiver'
    pagerduty_configs:
      - service_key: 'your-pagerduty-service-key'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/...'
        channel: '#sentinel-critical'
    email_configs:
      - to: 'sentinel-oncall@example.com'
        send_resolved: true

  - name: 'high-receiver'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/...'
        channel: '#sentinel-high'
    email_configs:
      - to: 'sentinel-team@example.com'

  - name: 'medium-receiver'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/...'
        channel: '#sentinel-medium'
```

---

## Slack Templates

```yaml
# For Alertmanager Slack integration
templates:
  - '/etc/alertmanager/templates/*.tmpl'
```

Example template file (`sentinel.tmpl`):

```tmpl
{{ define "slack.title" }}
[{{ .Status | toUpper }}] {{ .CommonLabels.alertname }}
{{ end }}

{{ define "slack.text" }}
*Alert:* {{ .CommonLabels.alertname }}
*Severity:* {{ .CommonLabels.severity | toUpper }}
*Category:* {{ .CommonLabels.category }}
*Summary:* {{ .CommonAnnotations.summary }}
*Description:* {{ .CommonAnnotations.description }}
*Starts At:* {{ .StartsAt.Format "2006-01-02 15:04:05 UTC" }}

{{ if gt (len .Alerts.Firing) 0 }}
*Firing Alerts:*
{{ range .Alerts.Firing }}  - {{ .Labels.instance }}: {{ .Annotations.description }}
{{ end }}{{ end }}

{{ if gt (len .Alerts.Resolved) 0 }}
*Resolved Alerts:*
{{ range .Alerts.Resolved }}  - {{ .Labels.instance }}: {{ .Annotations.description }}
{{ end }}{{ end }}

*Runbook:* {{ .CommonAnnotations.runbook }}
{{ end }}
```

---

## Infrastructure Setup Still Required

### To Deploy Alerting:

1. **Deploy Prometheus**:
   - Install and configure Prometheus server
   - Add Sentinel scrape configuration
   - Set up persistence and retention policies

2. **Deploy Alertmanager**:
   - Install and configure Alertmanager
   - Set up notification channels (Slack, PagerDuty, Email)
   - Configure alert routing rules

3. **Configure Sentinel Metrics Endpoint**:
   - Set `METRICS_API_KEY` in server/.env if authentication required
   - Set `METRICS_ALLOWED_IPS` if IP-based access control required
   - Or configure network-level access control (firewall, VPN)

4. **Test Alerts**:
   - Trigger test alerts to verify delivery
   - Verify escalation paths
   - Test runbook procedures

5. **Configure Backup Monitoring**:
   - Set up monitoring for backup script execution
   - Verify backup files are created
   - Test restore from backups

---

## Verification Checklist

- [ ] Prometheus can scrape `/api/v1/metrics` endpoint
- [ ] Metrics include all required measurements (API, database, queues, etc.)
- [ ] No sensitive data in metric labels
- [ ] Metrics endpoint is accessible only to monitoring infrastructure
- [ ] Alertmanager receives alerts from Prometheus
- [ ] Notifications are delivered to Slack/PagerDuty/Email
- [ ] On-call rotation is configured and tested
- [ ] Runbooks are accessible to on-call engineers
- [ ] Backup monitoring is in place

**Note:** None of these have been verified at this time. This is a documentation-only implementation.

---

## Related Documentation

- [Backup and Restore Procedures](backup-restore.md)
- [Health Check Endpoints](../server/src/routes/healthcheck.routes.js)
- [Metrics Collection](../server/src/utils/metrics.js)
- [Production Readiness Audit Report](../../.vibe/scratchpad/sentinel_audit_report.md)

---

*Document version: 1.0*  
*Last updated: 2026-10-22*  
*Status: Rules defined, not deployed or verified*
