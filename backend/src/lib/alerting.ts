import { statfs } from 'node:fs/promises';
import { log, serializeError } from '../core/errors';

type AlertLevel = 'info' | 'warning' | 'critical';
type Alert = { level: AlertLevel; title: string; message: string; timestamp: number; metadata?: Record<string, unknown> };

class AlertingService {
  private readonly alerts: Alert[] = [];
  private readonly throttles = new Map<string, number>();
  private readonly throttleWindowMs = 5 * 60 * 1000;

  alert(level: AlertLevel, title: string, message: string, metadata?: Record<string, unknown>): void {
    const key = `${level}:${title}`;
    const now = Date.now();
    const last = this.throttles.get(key);
    if (last && now - last < this.throttleWindowMs) return;
    this.throttles.set(key, now);

    const alert = { level, title, message, timestamp: now, metadata };
    this.alerts.push(alert);
    if (this.alerts.length > 1000) this.alerts.shift();

    log(level === 'critical' ? 'error' : level === 'warning' ? 'warn' : 'info', 'alert', alert);
  }

  getAlerts(since?: number): Alert[] {
    return since ? this.alerts.filter((alert) => alert.timestamp >= since) : [...this.alerts];
  }
}

export const alerting = new AlertingService();

export function alertOnErrorRate(total: number, errors: number, threshold = 0.05): void {
  if (total < 20) return;
  const errorRate = errors / total;
  if (errorRate > threshold) {
    alerting.alert('critical', 'High Error Rate', `Error rate ${(errorRate * 100).toFixed(2)}%`, { total, errors, threshold });
  }
}

export function alertOnApiLatency(endpoint: string, durationMs: number, threshold = 2000): void {
  if (durationMs > threshold) {
    alerting.alert('warning', 'Slow API Endpoint', `${endpoint} took ${durationMs}ms`, { endpoint, durationMs, threshold });
  }
}

export function alertOnDatabaseConnectionFailure(error: unknown): void {
  alerting.alert('critical', 'Database Issue', 'Database operation failed', { error: serializeError(error) });
}

export function alertOnPaymentWebhookFailure(message: string, metadata?: Record<string, unknown>): void {
  alerting.alert('critical', 'Payment Webhook Failure', message, metadata);
}

export async function checkDiskSpace(path: string, threshold = 0.9): Promise<void> {
  const stats = await statfs(path);
  const usedRatio = 1 - stats.bavail / stats.blocks;
  if (usedRatio > threshold) {
    alerting.alert('critical', 'Low Disk Space', `Disk usage ${(usedRatio * 100).toFixed(1)}%`, { path, usedRatio, threshold });
  }
}

export function alertHighErrorRate(errorRate: number, threshold = 0.05): void {
  if (errorRate > threshold) alerting.alert('critical', 'High Error Rate', `Error rate ${(errorRate * 100).toFixed(2)}%`, { errorRate, threshold });
}

export function alertSlowApi(endpoint: string, durationMs: number, threshold = 2000): void {
  alertOnApiLatency(endpoint, durationMs, threshold);
}

export function alertDatabaseIssue(message: string, metadata?: Record<string, unknown>): void {
  alerting.alert('critical', 'Database Issue', message, metadata);
}

export function alertPaymentFailure(orderId: string, error: string): void {
  alerting.alert('critical', 'Payment Processing Failed', `Order ${orderId}: ${error}`, { orderId, error });
}
