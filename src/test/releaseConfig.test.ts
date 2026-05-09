import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_WEB_ORIGIN,
  resolveRuntimeApiBaseUrl,
  validateFrontendReleaseConfig,
} from '@/lib/releaseConfig';

describe('frontend release config guardrails', () => {
  it('routes production web and Android/native builds to the production API by default', () => {
    expect(resolveRuntimeApiBaseUrl({
      explicitApiBaseUrl: '',
      hostname: 'kaffepos.my.id',
      isNativePlatform: false,
    })).toBe(PRODUCTION_API_ORIGIN);

    expect(resolveRuntimeApiBaseUrl({
      explicitApiBaseUrl: '',
      hostname: 'localhost',
      isNativePlatform: true,
    })).toBe(PRODUCTION_API_ORIGIN);
  });

  it('keeps local web development on relative API paths', () => {
    expect(resolveRuntimeApiBaseUrl({
      explicitApiBaseUrl: '',
      hostname: 'localhost',
      isNativePlatform: false,
    })).toBe('');
  });

  it('blocks APK/mobile builds that still point to local development API hosts', () => {
    const localhostResult = validateFrontendReleaseConfig({
      releaseChannel: 'development',
      apiBaseUrl: 'http://localhost:8787',
      webBaseUrl: PRODUCTION_WEB_ORIGIN,
      midtransEnvironment: 'sandbox',
      clarityProjectId: '',
      appTarget: 'mobile',
    });

    const emulatorResult = validateFrontendReleaseConfig({
      releaseChannel: 'development',
      apiBaseUrl: 'https://10.0.2.2:8787',
      webBaseUrl: PRODUCTION_WEB_ORIGIN,
      midtransEnvironment: 'sandbox',
      clarityProjectId: '',
      appTarget: 'mobile',
    });

    expect(localhostResult.ok).toBe(false);
    expect(localhostResult.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('APK/mobile build tidak boleh memakai API lokal'),
      expect.stringContaining('HTTPS'),
    ]));
    expect(emulatorResult.ok).toBe(false);
    expect(emulatorResult.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('APK/mobile build tidak boleh memakai API lokal'),
    ]));
  });

  it('blocks production release configs that still point payment or API to sandbox/staging values', () => {
    const result = validateFrontendReleaseConfig({
      releaseChannel: 'production',
      apiBaseUrl: 'https://api-staging.kaffepos.my.id',
      webBaseUrl: PRODUCTION_WEB_ORIGIN,
      midtransEnvironment: 'sandbox',
      clarityProjectId: '',
      sentryDsn: '',
      appTarget: 'mobile',
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('VITE_API_BASE_URL'),
      expect.stringContaining('VITE_MIDTRANS_ENVIRONMENT'),
      expect.stringContaining('VITE_CLARITY_PROJECT_ID'),
      expect.stringContaining('VITE_SENTRY_DSN'),
    ]));
  });

  it('accepts the expected production release contract', () => {
    const result = validateFrontendReleaseConfig({
      releaseChannel: 'production',
      apiBaseUrl: PRODUCTION_API_ORIGIN,
      webBaseUrl: PRODUCTION_WEB_ORIGIN,
      midtransEnvironment: 'production',
      clarityProjectId: 'clarity-project',
      sentryDsn: 'https://public@sentry.example/1',
      appTarget: 'web',
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
