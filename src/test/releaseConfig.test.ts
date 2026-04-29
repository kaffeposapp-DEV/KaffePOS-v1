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

  it('blocks production release configs that still point payment or API to sandbox/staging values', () => {
    const result = validateFrontendReleaseConfig({
      releaseChannel: 'production',
      apiBaseUrl: 'https://api-staging.kaffepos.my.id',
      webBaseUrl: PRODUCTION_WEB_ORIGIN,
      midtransEnvironment: 'sandbox',
      clarityProjectId: '',
      appTarget: 'mobile',
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('VITE_API_BASE_URL'),
      expect.stringContaining('VITE_MIDTRANS_ENVIRONMENT'),
      expect.stringContaining('VITE_CLARITY_PROJECT_ID'),
    ]));
  });

  it('accepts the expected production release contract', () => {
    const result = validateFrontendReleaseConfig({
      releaseChannel: 'production',
      apiBaseUrl: PRODUCTION_API_ORIGIN,
      webBaseUrl: PRODUCTION_WEB_ORIGIN,
      midtransEnvironment: 'production',
      clarityProjectId: 'clarity-project',
      appTarget: 'web',
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
