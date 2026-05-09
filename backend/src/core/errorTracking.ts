import * as Sentry from '@sentry/node';
import { env } from './env';

export type BackendErrorTrackingConfig = {
  enabled: boolean;
  dsn: string;
  environment: string;
  release: string;
  tracesSampleRate: number;
};

type BuildConfigInput = {
  dsn?: string | null;
  appVersion?: string | null;
  nodeEnv?: string | null;
  tracesSampleRate?: string | number | null;
};

type CaptureContext = {
  source: string;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  metadata?: Record<string, unknown>;
};

let initialized = false;

function parseSampleRate(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), 1);
}

export function buildBackendErrorTrackingConfig(input: BuildConfigInput): BackendErrorTrackingConfig {
  const dsn = input.dsn?.trim() ?? '';
  const environment = input.nodeEnv?.trim() || env.NODE_ENV;
  const version = input.appVersion?.trim() || env.APP_VERSION || 'dev';

  return {
    enabled: Boolean(dsn),
    dsn,
    environment,
    release: `kaffepos-api@${version}`,
    tracesSampleRate: parseSampleRate(input.tracesSampleRate),
  };
}

export function getCurrentBackendErrorTrackingConfig() {
  return buildBackendErrorTrackingConfig({
    dsn: env.SENTRY_DSN,
    appVersion: env.APP_VERSION,
    nodeEnv: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  });
}

export function initBackendErrorTracking(config = getCurrentBackendErrorTrackingConfig()) {
  if (!config.enabled || initialized) return;

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate,
  });
  initialized = true;
}

export function captureBackendException(error: unknown, context: CaptureContext) {
  if (!initialized) return;

  Sentry.captureException(error, {
    tags: {
      source: context.source,
      ...(context.method ? { method: context.method } : {}),
      ...(context.statusCode ? { statusCode: String(context.statusCode) } : {}),
    },
    extra: {
      ...(context.path ? { path: context.path } : {}),
      ...(context.metadata ?? {}),
    },
  });
}

export function resetBackendErrorTrackingForTests() {
  initialized = false;
}
