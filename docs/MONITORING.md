# Production Monitoring & Operations Guide

This document covers the monitoring, alerting, and operational tooling added to KaffePOS backend.

## Overview

The monitoring system provides:
- **Request/response logging** with timing and error tracking
- **Application Performance Monitoring (APM)** for slow queries and endpoints
- **Business metrics** tracking (transactions/min, errors/min)
- **Alerting** for critical issues (error rate, latency, payment failures, disk space)
- **Operational scripts** for backup, health checks, and log rotation

## Architecture

### Core Components

**`backend/src/lib/monitoring.ts`**
- Metric collection (counters, timings)
- Structured logging with sanitization
- Request ID tracking
- Business metric helpers

**`backend/src/lib/alerting.ts`**
- Alert delivery via webhook (Slack/generic)
- Cooldown logic to prevent alert storms
- Pre-configured alerts for common issues

**`backend/src/middleware/apm.ts`**
- Request context and logging middleware
- Database query instrumentation
- Memory and disk monitoring
- Prometheus-compatible metrics endpoint

### Integration Points

The monitoring system is wired into `backend/src/index.ts`:
```typescript
import { installDatabaseApm, startApmMonitoring, requestContextMiddleware, requestLoggingMiddleware, errorLoggingMiddleware, metricsHandler } from './middleware/apm';

installDatabaseApm(pool);
startApmMonitoring();
app.use(requestContextMiddleware());
app.use(requestLoggingMiddleware());
// ... routes ...
app.use(errorLoggingMiddleware);
app.get('/metrics', metricsHandler);
```

Payment webhook failures are tracked in `backend/src/routes/webhooks.ts` via `alertOnPaymentWebhookFailure()`.

## Metrics Endpoint

**GET /metrics**

Returns current metrics in Prometheus format (text/plain) or JSON (application/json).

Example metrics:
- `api_requests_total` - Total API requests
- `api_responses_total` - Responses by status code
- `api_errors_total` - Error responses
- `api_latency_ms` - Request latency (avg, p95, max)
- `db_query_ms` - Database query timing
- `db_query_errors_total` - Database errors

Access via:
```bash
curl http://localhost:8787/metrics
curl -H "Accept: application/json" http://localhost:8787/metrics
```

## Alerting

### Configuration

Set environment variable to enable webhook alerts:
```bash
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
# or
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### Alert Types

| Alert | Severity | Trigger | Cooldown |
|-------|----------|---------|----------|
| `error_rate_high` | critical | Error rate > 5% (min 20 requests) | 5 min |
| `api_latency_high` | warning | p95 latency > 2000ms | 5 min |
| `database_connection_failure` | critical | DB connection error | 5 min |
| `payment_webhook_failure` | critical | Webhook signature fail or processing error | 5 min |
| `disk_space_low` | critical | Disk usage > 90% | 5 min |

Alerts are automatically throttled to prevent spam.

## Operational Scripts

### Database Backup

**`scripts/backup-db.sh`**

Automated PostgreSQL backup with retention policy.

```bash
# Manual run
./scripts/backup-db.sh

# With custom settings
BACKUP_DIR=/secure/backups RETENTION_DAYS=30 ./scripts/backup-db.sh

# Daily cron (example)
15 17 * * * cd /app && BACKUP_DIR=/secure/backups ./scripts/backup-db.sh >> /var/log/kaffepos/backup.log 2>&1
```

Environment variables:
- `BACKUP_DIR` - Backup directory (default: `./backups/postgres`)
- `RETENTION_DAYS` - Days to keep backups (default: 14)
- `DATABASE_URL` - Connection string (or use `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`)
- `DB_SSLMODE` - SSL mode (default: `require`)

Backups are stored as `kaffepos-YYYYMMDDTHHMMSSZ.dump` with SHA256 checksums.

### Health Check

**`scripts/health-check.sh`**

Production health checker for monitoring systems (Nagios, Zabbix, etc).

```bash
# Manual run
./scripts/health-check.sh

# With custom settings
BASE_URL=https://api.kaffepos.my.id DISK_THRESHOLD_PERCENT=85 ./scripts/health-check.sh

# Monitoring integration (example)
*/5 * * * * /app/scripts/health-check.sh || /usr/local/bin/alert-ops
```

Environment variables:
- `BASE_URL` - API base URL (default: `http://127.0.0.1:8787`)
- `HEALTH_PATH` - Health endpoint path (default: `/health`)
- `TIMEOUT_SECONDS` - Request timeout (default: 10)
- `DISK_PATH` - Path to check disk usage (default: `.`)
- `DISK_THRESHOLD_PERCENT` - Disk usage alert threshold (default: 90)
- `REQUIRE_DB_SSL` - Enforce DB SSL check (default: `true`)

Exit codes:
- `0` - OK
- `2` - CRITICAL (health check failed)

### Log Rotation

**`scripts/logrotate-kaffepos.conf`**

Logrotate configuration for KaffePOS logs.

Install:
```bash
sudo cp scripts/logrotate-kaffepos.conf /etc/logrotate.d/kaffepos
sudo chown root:root /etc/logrotate.d/kaffepos
sudo chmod 644 /etc/logrotate.d/kaffepos
```

Logs are rotated daily, compressed, and kept for 14 days.

## Monitoring Stack (Optional)

**`docker-compose.monitoring.yml`**

Optional Prometheus + Grafana stack for metrics visualization.

### Setup

1. Configure Prometheus data source:
```bash
# Set PostgreSQL exporter connection
export POSTGRES_EXPORTER_DSN="postgresql://user:pass@host:5432/kaffepos_production?sslmode=require"
```

2. Start monitoring stack:
```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

3. Access dashboards:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/change-me)

4. Configure Grafana:
- Add Prometheus data source: http://prometheus:9090
- Import dashboards for Node Exporter and PostgreSQL

### Services

- **Prometheus** - Metrics collection and storage
- **Grafana** - Visualization and dashboards
- **Node Exporter** - System metrics (CPU, memory, disk, network)
- **PostgreSQL Exporter** - Database metrics (connections, queries, locks)

Metrics are scraped every 15 seconds and retained for 15 days.

## Logging

### Structured Logs

All logs are JSON-formatted with:
```json
{
  "ts": "2026-05-14T12:00:00.000Z",
  "level": "info",
  "service": "kaffepos-backend",
  "version": "1.0.0",
  "msg": "request.completed",
  "requestId": "uuid",
  "method": "POST",
  "path": "/api/transactions",
  "statusCode": 201,
  "durationMs": 45,
  "ip": "192.168.1.100",
  "userId": "user-uuid"
}
```

### Log Levels

- `debug` - Verbose debugging (disabled in production)
- `info` - Normal operations, request logs
- `warn` - Warnings, validation errors, slow queries
- `error` - Errors, exceptions, failures

Set via `LOG_LEVEL` environment variable (default: `info`).

### Sensitive Data

Logs automatically redact:
- Passwords, tokens, API keys, secrets
- Long strings (truncated to 512 chars)
- Deep object nesting (max depth: 4)

## Performance Monitoring

### Slow Query Detection

Queries exceeding 500ms are logged as warnings:
```json
{
  "level": "warn",
  "msg": "apm.slow_query",
  "operation": "select",
  "durationMs": 750,
  "query": "select * from transactions where..."
}
```

### Slow Endpoint Detection

Endpoints exceeding 1000ms are logged as warnings. Endpoints exceeding 2000ms (p95) trigger alerts.

### Memory Monitoring

Memory usage is logged every 60 seconds:
```json
{
  "level": "info",
  "msg": "apm.memory_usage",
  "rssMb": 256,
  "heapUsedMb": 128,
  "heapTotalMb": 192,
  "externalMb": 8
}
```

## Business Metrics

Track business events:
```typescript
import { trackBusinessMetric } from '../lib/monitoring';

trackBusinessMetric('transactions.completed', 1, { storeId, paymentMethod });
trackBusinessMetric('revenue.idr', amount, { storeId });
```

Metrics are logged and exposed via `/metrics` endpoint.

## Troubleshooting

### No metrics appearing

Check that APM is initialized:
```typescript
installDatabaseApm(pool);
startApmMonitoring();
```

Verify `/metrics` endpoint is accessible.

### Alerts not sending

1. Check `ALERT_WEBHOOK_URL` or `SLACK_WEBHOOK_URL` is set
2. Verify webhook URL is reachable
3. Check logs for `alert.delivery_failed` messages
4. Verify alert cooldown hasn't suppressed the alert

### High memory usage

Check memory logs (`apm.memory_usage`) and metric snapshot size. Consider:
- Resetting metric windows: `resetMetricWindows()` (called automatically on restart)
- Reducing `MAX_TIMING_SAMPLES` in `monitoring.ts`

### Backup failures

1. Check `pg_dump` is installed and in PATH
2. Verify database credentials and SSL settings
3. Check disk space in `BACKUP_DIR`
4. Review backup logs for errors

## Production Checklist

- [ ] Set `LOG_LEVEL=info` (not `debug`)
- [ ] Configure `ALERT_WEBHOOK_URL` for critical alerts
- [ ] Set up daily database backups via cron
- [ ] Configure health check monitoring (Nagios/Zabbix)
- [ ] Install logrotate configuration
- [ ] Set `DB_SSL=true` and `DB_SSL_REJECT_UNAUTHORIZED=true`
- [ ] Configure Prometheus scraping (optional)
- [ ] Set up Grafana dashboards (optional)
- [ ] Test alert delivery
- [ ] Verify backup restoration procedure

## Files Created/Modified

### New Files
- `backend/src/lib/monitoring.ts` - Core monitoring utilities
- `backend/src/lib/alerting.ts` - Alert system
- `backend/src/middleware/apm.ts` - APM middleware
- `scripts/backup-db.sh` - Database backup script
- `scripts/health-check.sh` - Health check script
- `scripts/logrotate-kaffepos.conf` - Log rotation config
- `docker-compose.monitoring.yml` - Monitoring stack
- `monitoring/prometheus.yml` - Prometheus config
- `docs/MONITORING.md` - This document

### Modified Files
- `backend/src/index.ts` - Integrated APM middleware and metrics endpoint
- `backend/src/routes/webhooks.ts` - Added payment webhook failure alerts

## Support

For issues or questions about monitoring:
1. Check logs for error messages
2. Review this documentation
3. Verify environment variables are set correctly
4. Test individual components (backup, health check, metrics endpoint)
