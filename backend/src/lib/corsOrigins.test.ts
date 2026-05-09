import { describe, expect, it } from 'vitest';
import { APK_WEBVIEW_ORIGINS, buildAllowedCorsOrigins, isOriginAllowed, splitCorsOrigins } from './corsOrigins';

describe('backend CORS origin guardrails', () => {
  it('normalizes trailing slashes and host casing from configured env origins', () => {
    expect(splitCorsOrigins(' https://LOCALHOST/, HTTPS://KaffePOS.My.ID/ ')).toEqual([
      'https://localhost',
      'https://kaffepos.my.id',
    ]);
  });

  it('keeps final APK WebView origins allowed even when Coolify CORS_ORIGIN is incomplete', () => {
    const origins = buildAllowedCorsOrigins('https://kaffepos.my.id');

    for (const origin of APK_WEBVIEW_ORIGINS) {
      expect(origins.has(origin)).toBe(true);
      expect(isOriginAllowed(origin, origins)).toBe(true);
    }
  });

  it('does not allow arbitrary localhost ports or unknown origins implicitly', () => {
    const origins = buildAllowedCorsOrigins('https://kaffepos.my.id');

    expect(isOriginAllowed('http://localhost:9999', origins)).toBe(false);
    expect(isOriginAllowed('https://evil.example', origins)).toBe(false);
  });
});
