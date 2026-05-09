import * as Sentry from '@sentry/react';

export type FrontendErrorTrackingConfig = {
  enabled: boolean;
  dsn: string;
  environment: string;
  release: string;
  tracesSampleRate: number;
};

type BuildConfigInput = {
  dsn?: string | null | undefined;
  releaseChannel?: string | null | undefined;
  appVersion?: string | null | undefined;
  tracesSampleRate?: string | number | null | undefined;
};

type CaptureContext = {
  source: string;
  metadata?: Record<string, unknown>;
};

let initialized = false;

function parseSampleRate(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), 1);
}

export function buildFrontendErrorTrackingConfig(input: BuildConfigInput): FrontendErrorTrackingConfig {
  const dsn = input.dsn?.trim() ?? '';
  const environment = input.releaseChannel?.trim() || (import.meta.env.PROD ? 'production' : 'development');
  const version = input.appVersion?.trim() || import.meta.env.VITE_APP_VERSION || 'dev';

  return {
    enabled: Boolean(dsn),
    dsn,
    environment,
    release: `kaffepos-web@${version}`,
    tracesSampleRate: parseSampleRate(input.tracesSampleRate),
  };
}

export function getCurrentFrontendErrorTrackingConfig() {
  return buildFrontendErrorTrackingConfig({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    releaseChannel: import.meta.env.PROD ? 'production' : 'development',
    appVersion: import.meta.env.VITE_APP_VERSION,
    tracesSampleRate: import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
  });
}

export function initFrontendErrorTracking(config = getCurrentFrontendErrorTrackingConfig()) {
  if (!config.enabled || initialized) return;

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate,
  });
  initialized = true;
}

export function captureFrontendError(error: unknown, context: CaptureContext) {
  if (!initialized) return;

  Sentry.captureException(error, {
    tags: {
      source: context.source,
    },
    extra: context.metadata ?? {},
  });
}

export function resetFrontendErrorTrackingForTests() {
  initialized = false;
}
