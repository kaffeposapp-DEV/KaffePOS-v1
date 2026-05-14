import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Pool } from 'pg';
import {
  alertOnApiLatency,
  alertOnDatabaseConnectionFailure,
  alertOnErrorRate,
  alertOnPaymentWebhookFailure,
  checkDiskSpace,
} from '../lib/alerting';
import {
  createRequestId,
  getMetricSnapshot,
  incrementMetric,
  logError,
  logEvent,
  observeTiming,
  sanitizeError,
  trackBusinessMetric,
} from '../lib/monitoring';

type QueryablePool = Pool & { __kaffeposApmPatched?: boolean };

type ApmOptions = {
  slowQueryMs?: number;
  slowEndpointMs?: number;
  memoryIntervalMs?: number;
  diskCheckIntervalMs?: number;
  diskPath?: string;
};


declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const DEFAULT_SLOW_QUERY_MS = 500;
const DEFAULT_SLOW_ENDPOINT_MS = 1_000;
const requestWindow = { total: 0, errors: 0, startedAt: Date.now() };

function routeLabel(req: Request) {
  return req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : req.path;
}

export function requestContextMiddleware(): RequestHandler {
  return (req, res, next) => {
    const requestId = createRequestId(req.header('x-request-id') ?? undefined);
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  };
}

export function requestLoggingMiddleware(): RequestHandler {
  return (req, res, next) => {
    const startedAt = Date.now();
    incrementMetric('api.requests.total', 1, { method: req.method });

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const route = routeLabel(req);
      const isError = res.statusCode >= 500;
      requestWindow.total += 1;
      if (isError) requestWindow.errors += 1;

      incrementMetric('api.responses.total', 1, { method: req.method, statusCode: res.statusCode });
      if (isError) incrementMetric('api.errors.total', 1, { method: req.method, statusCode: res.statusCode });
      observeTiming('api.latency_ms', durationMs, { method: req.method, route });

      logEvent(isError ? 'error' : 'info', 'request.completed', {
        requestId: req.requestId ?? null,
        method: req.method,
        path: req.originalUrl,
        route,
        statusCode: res.statusCode,
        durationMs,
        ip: req.ip,
        userId: (req as any).authUser?.id ?? null,
        userAgent: req.get('user-agent') ?? null,
      });

      if (durationMs > DEFAULT_SLOW_ENDPOINT_MS) {
        logEvent('warn', 'apm.slow_endpoint', { requestId: req.requestId ?? null, method: req.method, route, durationMs });
      }
      if (durationMs > 2_000) alertOnApiLatency(route, durationMs);
      if (Date.now() - requestWindow.startedAt >= 60_000) {
        alertOnErrorRate(requestWindow.total, requestWindow.errors);
        trackBusinessMetric('api.requests_per_minute', requestWindow.total);
        trackBusinessMetric('api.errors_per_minute', requestWindow.errors);
        requestWindow.total = 0;
        requestWindow.errors = 0;
        requestWindow.startedAt = Date.now();
      }
      if (/webhook|midtrans|payment/i.test(req.originalUrl) && res.statusCode >= 400) {
        alertOnPaymentWebhookFailure('Payment webhook request failed', {
          requestId: req.requestId ?? null,
          path: req.originalUrl,
          statusCode: res.statusCode,
        });
      }
    });

    next();
  };
}

export function errorLoggingMiddleware(error: unknown, req: Request, _res: Response, next: NextFunction) {
  logError('request.error', error, {
    requestId: req.requestId ?? null,
    method: req.method,
    path: req.originalUrl,
  });
  next(error);
}

export function installDatabaseApm(pool: Pool, options: ApmOptions = {}) {
  const patchedPool = pool as QueryablePool;
  if (patchedPool.__kaffeposApmPatched) return;
  patchedPool.__kaffeposApmPatched = true;

  const slowQueryMs = options.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS;
  const originalQuery = pool.query.bind(pool) as Pool['query'];

  (pool as unknown as { query: (...args: unknown[]) => unknown }).query = (...args: unknown[]) => {
    const startedAt = Date.now();
    const queryText = typeof args[0] === 'string' ? args[0] : typeof args[0] === 'object' && args[0] !== null ? String((args[0] as { text?: unknown }).text ?? '') : '';
    const operation = queryText.trim().split(/\s+/)[0]?.toLowerCase() || 'unknown';

    try {
      const result = (originalQuery as unknown as (...queryArgs: unknown[]) => unknown)(...args);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>)
          .then((value) => {
            const durationMs = Date.now() - startedAt;
            observeTiming('db.query_ms', durationMs, { operation });
            if (durationMs > slowQueryMs) logEvent('warn', 'apm.slow_query', { operation, durationMs, query: queryText.slice(0, 500) });
            return value;
          })
          .catch((error) => {
            incrementMetric('db.query_errors.total', 1, { operation });
            alertOnDatabaseConnectionFailure(error);
            throw error;
          });
      }
      return result;
    } catch (error) {
      incrementMetric('db.query_errors.total', 1, { operation });
      alertOnDatabaseConnectionFailure(error);
      throw error;
    }
  };
}

export function startApmMonitoring(options: ApmOptions = {}) {
  const memoryInterval = setInterval(() => {
    const usage = process.memoryUsage();
    logEvent('info', 'apm.memory_usage', {
      rssMb: Math.round(usage.rss / 1024 / 1024),
      heapUsedMb: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(usage.heapTotal / 1024 / 1024),
      externalMb: Math.round(usage.external / 1024 / 1024),
    });
  }, options.memoryIntervalMs ?? 60_000);
  memoryInterval.unref();

  const diskInterval = setInterval(() => {
    void checkDiskSpace(options.diskPath ?? process.cwd()).catch((error) => {
      logEvent('warn', 'apm.disk_check_failed', { error: sanitizeError(error) });
    });
  }, options.diskCheckIntervalMs ?? 5 * 60_000);
  diskInterval.unref();

  return { memoryInterval, diskInterval };
}

function toPrometheusMetrics(snapshot: ReturnType<typeof getMetricSnapshot>) {
  const lines: string[] = [];
  for (const counter of snapshot.counters) {
    const metricName = counter.name.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`# TYPE ${metricName} counter`);
    lines.push(`${metricName} ${counter.count}`);
    lines.push(`${metricName}_per_minute ${counter.perMinute}`);
  }
  for (const timing of snapshot.timings) {
    const metricName = timing.name.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`# TYPE ${metricName} summary`);
    lines.push(`${metricName}_count ${timing.count}`);
    lines.push(`${metricName}_avg ${timing.avgMs}`);
    lines.push(`${metricName}_p95 ${timing.p95Ms}`);
    lines.push(`${metricName}_max ${timing.maxMs}`);
  }
  return `${lines.join('\n')}\n`;
}

export function metricsHandler(req: Request, res: Response) {
  const snapshot = getMetricSnapshot();
  if (req.accepts(['text/plain', 'application/json']) === 'application/json') {
    res.json(snapshot);
    return;
  }
  res.type('text/plain').send(toPrometheusMetrics(snapshot));
}
