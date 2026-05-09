import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildBackendErrorTrackingConfig,
  captureBackendException,
  initBackendErrorTracking,
  resetBackendErrorTrackingForTests,
} from './errorTracking';

const sentryInit = vi.fn();
const sentryCaptureException = vi.fn();

vi.mock('@sentry/node', () => ({
  init: (...args: unknown[]) => sentryInit(...args),
  captureException: (...args: unknown[]) => sentryCaptureException(...args),
}));

describe('backend external error tracking', () => {
  beforeEach(() => {
    sentryInit.mockReset();
    sentryCaptureException.mockReset();
    resetBackendErrorTrackingForTests();
  });

  it('stays disabled without a DSN', () => {
    const config = buildBackendErrorTrackingConfig({
      dsn: '',
      appVersion: '1.0.0',
      nodeEnv: 'production',
    });

    expect(config.enabled).toBe(false);
    initBackendErrorTracking(config);
    captureBackendException(new Error('route crashed'), { source: 'global_error_handler' });
    expect(sentryInit).not.toHaveBeenCalled();
    expect(sentryCaptureException).not.toHaveBeenCalled();
  });

  it('initializes once and captures route context', () => {
    const config = buildBackendErrorTrackingConfig({
      dsn: 'https://public@sentry.example/1',
      appVersion: '1.0.0',
      nodeEnv: 'production',
    });

    expect(config.enabled).toBe(true);
    initBackendErrorTracking(config);
    initBackendErrorTracking(config);
    captureBackendException(new Error('route crashed'), {
      source: 'global_error_handler',
      path: '/api/menu-items',
      method: 'POST',
      statusCode: 500,
    });

    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(sentryCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { source: 'global_error_handler', method: 'POST', statusCode: '500' },
      extra: { path: '/api/menu-items' },
    });
  });
});
