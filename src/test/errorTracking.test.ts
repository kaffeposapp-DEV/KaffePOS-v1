import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFrontendErrorTrackingConfig,
  captureFrontendError,
  initFrontendErrorTracking,
  resetFrontendErrorTrackingForTests,
} from '@/lib/errorTracking';

const sentryInit = vi.fn();
const sentryCaptureException = vi.fn();

vi.mock('@sentry/react', () => ({
  init: (...args: unknown[]) => sentryInit(...args),
  captureException: (...args: unknown[]) => sentryCaptureException(...args),
}));

describe('frontend external error tracking', () => {
  beforeEach(() => {
    sentryInit.mockReset();
    sentryCaptureException.mockReset();
    resetFrontendErrorTrackingForTests();
  });

  it('keeps error tracking disabled without a DSN', () => {
    const config = buildFrontendErrorTrackingConfig({
      dsn: '',
      appVersion: '2.0.0',
      releaseChannel: 'production',
    });

    expect(config.enabled).toBe(false);
    initFrontendErrorTracking(config);
    captureFrontendError(new Error('boom'), { source: 'test' });
    expect(sentryInit).not.toHaveBeenCalled();
    expect(sentryCaptureException).not.toHaveBeenCalled();
  });

  it('initializes Sentry once and captures sanitized context when DSN exists', () => {
    const config = buildFrontendErrorTrackingConfig({
      dsn: 'https://public@sentry.example/1',
      appVersion: '2.0.0',
      releaseChannel: 'production',
    });

    expect(config.enabled).toBe(true);
    initFrontendErrorTracking(config);
    initFrontendErrorTracking(config);
    captureFrontendError(new Error('UI crashed'), { source: 'global_error_boundary', metadata: { tab: 'POS' } });

    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(sentryCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { source: 'global_error_boundary' },
      extra: { tab: 'POS' },
    });
  });
});
