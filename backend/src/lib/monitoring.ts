import { randomUUID } from 'node:crypto';
import { log, serializeError } from '../core/errors';

type Labels = Record<string, string | number | boolean>;

type CounterMetric = { name: string; count: number; labels?: Labels; startedAt: number };
type TimingMetric = { name: string; values: number[]; labels?: Labels };

class MonitoringService {
  private readonly counters = new Map<string, CounterMetric>();
  private readonly timings = new Map<string, TimingMetric>();
  private readonly maxTimingValues = 500;

  increment(name: string, value = 1, labels?: Labels): void {
    const key = this.key(name, labels);
    const current = this.counters.get(key) ?? { name, count: 0, labels, startedAt: Date.now() };
    current.count += value;
    this.counters.set(key, current);
  }

  observe(name: string, value: number, labels?: Labels): void {
    const key = this.key(name, labels);
    const current = this.timings.get(key) ?? { name, values: [], labels };
    current.values.push(value);
    if (current.values.length > this.maxTimingValues) current.values.shift();
    this.timings.set(key, current);
  }

  snapshot() {
    const now = Date.now();
    return {
      counters: [...this.counters.values()].map((counter) => ({
        ...counter,
        perMinute: counter.count / Math.max(1, (now - counter.startedAt) / 60_000),
      })),
      timings: [...this.timings.values()].map((timing) => {
        const sorted = [...timing.values].sort((a, b) => a - b);
        const sum = sorted.reduce((total, value) => total + value, 0);
        const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
        return {
          name: timing.name,
          labels: timing.labels,
          count: sorted.length,
          avgMs: sorted.length ? sum / sorted.length : 0,
          p95Ms: sorted[p95Index] ?? 0,
          maxMs: sorted[sorted.length - 1] ?? 0,
        };
      }),
    };
  }

  clear(): void {
    this.counters.clear();
    this.timings.clear();
  }

  private key(name: string, labels?: Labels): string {
    return `${name}:${JSON.stringify(labels ?? {})}`;
  }
}

export const monitoring = new MonitoringService();

export function createRequestId(input?: string): string {
  return input?.trim() || randomUUID();
}

export function incrementMetric(name: string, value = 1, labels?: Labels): void {
  monitoring.increment(name, value, labels);
}

export function observeTiming(name: string, durationMs: number, labels?: Labels): void {
  monitoring.observe(name, durationMs, labels);
}

export function getMetricSnapshot() {
  return monitoring.snapshot();
}

export function logEvent(level: 'debug' | 'info' | 'warn' | 'error', event: string, metadata?: Record<string, unknown>): void {
  log(level, event, metadata);
}

export function logError(event: string, error: unknown, metadata?: Record<string, unknown>): void {
  log('error', event, { ...metadata, error: serializeError(error) });
}

export function sanitizeError(error: unknown) {
  return serializeError(error);
}

export function trackApiCall(method: string, path: string, statusCode: number, durationMs: number): void {
  incrementMetric('api.requests.total', 1, { method, statusCode });
  observeTiming('api.requests.duration_ms', durationMs, { method, path });

  if (statusCode >= 500) incrementMetric('api.errors.5xx', 1, { method, path });
  if (statusCode >= 400 && statusCode < 500) incrementMetric('api.errors.4xx', 1, { method, path });
  if (durationMs > 2000) logEvent('warn', 'api.slow_request', { method, path, durationMs, statusCode });
}

export function trackDbQuery(query: string, durationMs: number, success: boolean): void {
  observeTiming('db.query.duration_ms', durationMs, { success });
  if (durationMs > 500) {
    incrementMetric('db.query.slow', 1);
    logEvent('warn', 'db.slow_query', { query: query.slice(0, 100), durationMs });
  }
  if (!success) incrementMetric('db.query.errors', 1);
}

export function trackBusinessMetric(name: string, value: number, labels?: Labels): void {
  monitoring.observe(`business.${name}`, value, labels);
}
