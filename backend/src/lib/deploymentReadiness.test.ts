import { describe, expect, it } from 'vitest';
import { validateBackendDeploymentConfig } from './deploymentReadiness';

describe('backend deployment readiness guardrails', () => {
  it('flags production deployment that still uses Midtrans sandbox', () => {
    const result = validateBackendDeploymentConfig({
      nodeEnv: 'production',
      webBaseUrl: 'https://kaffepos.my.id',
      apiBaseUrl: 'https://api.kaffepos.my.id',
      corsOrigin: 'https://kaffepos.my.id,capacitor://localhost',
      midtransEnvironment: 'sandbox',
      subscriptionPaymentMode: 'auto',
      midtransSnapEnabled: true,
      midtransServerKey: 'SB-Mid-server-xxx',
      midtransMerchantId: 'G123',
      resendApiKey: 're_xxx',
      resendFromEmail: 'KaffePOS <no-reply@kaffepos.my.id>',
      sentryDsn: '',
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('MIDTRANS_ENVIRONMENT'),
    ]));
  });

  it('accepts production config when domain, CORS, email, and Midtrans are aligned', () => {
    const result = validateBackendDeploymentConfig({
      nodeEnv: 'production',
      webBaseUrl: 'https://kaffepos.my.id',
      apiBaseUrl: 'https://api.kaffepos.my.id',
      corsOrigin: 'https://kaffepos.my.id,https://www.kaffepos.my.id,capacitor://localhost,https://localhost,http://localhost',
      midtransEnvironment: 'production',
      subscriptionPaymentMode: 'auto',
      midtransSnapEnabled: true,
      midtransServerKey: 'Mid-server-xxx',
      midtransMerchantId: 'G123',
      resendApiKey: 're_xxx',
      resendFromEmail: 'KaffePOS <no-reply@kaffepos.my.id>',
      sentryDsn: 'https://public@sentry.example/1',
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('normalizes configured CORS origins before readiness checks', () => {
    const result = validateBackendDeploymentConfig({
      nodeEnv: 'production',
      webBaseUrl: 'https://kaffepos.my.id',
      apiBaseUrl: 'https://api.kaffepos.my.id',
      corsOrigin: ' HTTPS://KaffePOS.My.ID/ , HTTPS://WWW.KAFFEPOS.MY.ID/ , capacitor://LOCALHOST/ , HTTPS://LOCALHOST/ , HTTP://LOCALHOST/ ',
      midtransEnvironment: 'production',
      subscriptionPaymentMode: 'auto',
      midtransSnapEnabled: true,
      midtransServerKey: 'Mid-server-xxx',
      midtransMerchantId: 'G123',
      resendApiKey: 're_xxx',
      resendFromEmail: 'KaffePOS <no-reply@kaffepos.my.id>',
      sentryDsn: 'https://public@sentry.example/1',
    });

    expect(result.warnings).not.toEqual(expect.arrayContaining([
      expect.stringContaining('CORS_ORIGIN belum memuat'),
    ]));
  });

  it('warns when APK Android HTTPS WebView origin is missing from CORS', () => {
    const result = validateBackendDeploymentConfig({
      nodeEnv: 'production',
      webBaseUrl: 'https://kaffepos.my.id',
      apiBaseUrl: 'https://api.kaffepos.my.id',
      corsOrigin: 'https://kaffepos.my.id,https://www.kaffepos.my.id,capacitor://localhost,http://localhost',
      midtransEnvironment: 'production',
      subscriptionPaymentMode: 'auto',
      midtransSnapEnabled: true,
      midtransServerKey: 'Mid-server-xxx',
      midtransMerchantId: 'G123',
      resendApiKey: 're_xxx',
      resendFromEmail: 'KaffePOS <no-reply@kaffepos.my.id>',
      sentryDsn: 'https://public@sentry.example/1',
    });

    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('https://localhost'),
    ]));
  });

  it('warns when current APK http localhost bridge origin is missing from CORS', () => {
    const result = validateBackendDeploymentConfig({
      nodeEnv: 'production',
      webBaseUrl: 'https://kaffepos.my.id',
      apiBaseUrl: 'https://api.kaffepos.my.id',
      corsOrigin: 'https://kaffepos.my.id,https://www.kaffepos.my.id,capacitor://localhost,https://localhost',
      midtransEnvironment: 'production',
      subscriptionPaymentMode: 'auto',
      midtransSnapEnabled: true,
      midtransServerKey: 'Mid-server-xxx',
      midtransMerchantId: 'G123',
      resendApiKey: 're_xxx',
      resendFromEmail: 'KaffePOS <no-reply@kaffepos.my.id>',
      sentryDsn: 'https://public@sentry.example/1',
    });

    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('http://localhost'),
    ]));
  });
});
