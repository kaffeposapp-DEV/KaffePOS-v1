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
      corsOrigin: 'https://kaffepos.my.id,https://www.kaffepos.my.id,capacitor://localhost,http://localhost',
      midtransEnvironment: 'production',
      subscriptionPaymentMode: 'auto',
      midtransSnapEnabled: true,
      midtransServerKey: 'Mid-server-xxx',
      midtransMerchantId: 'G123',
      resendApiKey: 're_xxx',
      resendFromEmail: 'KaffePOS <no-reply@kaffepos.my.id>',
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
