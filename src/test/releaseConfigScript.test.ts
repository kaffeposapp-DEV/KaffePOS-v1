import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('release config script guardrails', () => {
  it('requires the final HTTPS APK origin and transitional legacy origins in production CORS', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/verify-release-config.mjs'), 'utf8');

    expect(script).toContain("requireContains('CORS_ORIGIN', 'http://localhost')");
    expect(script).toContain("requireContains('CORS_ORIGIN', 'https://localhost')");
  });

  it('smoke production readiness verifies final CORS origins, payment, and monitoring', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/smoke-production-readiness.mjs'), 'utf8');

    expect(script).toContain("['http://localhost', 'https://localhost', 'capacitor://localhost']");
    expect(script).toContain('CORS preflight allows final APK origin');
    expect(script).toContain('Midtrans is production and commercially ready');
    expect(script).toContain('Backend error tracking is configured');
  });

  it('ships a no-secret fresh mobile login smoke script for production verification', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/smoke-mobile-fresh-login.mjs'), 'utf8');
    const packageJson = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');

    expect(script).toContain("requireEnv('KAFFEPOS_LOGIN_EMAIL')");
    expect(script).toContain("requireEnv('KAFFEPOS_LOGIN_PASSWORD')");
    expect(script).toContain("process.env.KAFFEPOS_LOGIN_ORIGIN || 'https://localhost'");
    expect(script).toContain('/api/auth/login');
    expect(script).toContain('/api/auth/session');
    expect(script).toContain('/api/stores');
    expect(packageJson).toContain('"smoke:mobile:fresh-login"');
  });

  it('ships a no-transaction production billing smoke gate without unsafe localhost defaults', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/smoke-billing-production.mjs'), 'utf8');
    const packageJson = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');

    expect(packageJson).toContain('"smoke:production:billing"');
    expect(script).toContain("KAFFEPOS_BILLING_API_BASE_URL || process.env.API_BASE_URL || 'https://api.kaffepos.my.id'");
    expect(script).toContain('/system-status');
    expect(script).toContain("payment?.mode === 'midtrans_production'");
    expect(script).toContain("payment?.commerciallyReady === true");
    expect(script).toContain('subscription_payments');
    expect(script).toContain('KAFFEPOS_BILLING_EMAIL');
    expect(script).toContain('/api/subscriptions');
    expect(script).toContain('/api/subscriptions/payments/quote');
    expect(script).toContain('Quote endpoint is ready without creating a transaction');
    expect(script).not.toContain('/api/subscriptions/payments/create');
    expect(script).not.toContain("|| 'http://localhost");
    expect(script).not.toContain('console.log(password)');
  });
});
