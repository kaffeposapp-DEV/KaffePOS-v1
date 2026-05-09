import { describe, expect, it } from 'vitest';
import {
  redactOperationalWarnings,
  redactSystemStatusForPublic,
  type SystemStatusPayload,
} from './health';

const detailedPayload: SystemStatusPayload = {
  ok: true,
  service: 'kaffepos-backend',
  version: '1.0.0',
  env: 'production',
  time: '2026-05-09T00:00:00.000Z',
  checks: {
    backend: { ok: true },
    database: { ok: true, latencyMs: 12 },
    email: { ok: true, provider: 'resend', fromEmail: 'KaffePOS <no-reply@kaffepos.my.id>' },
    payment: {
      ok: true,
      commerciallyReady: true,
      mode: 'midtrans_production',
      onlinePaymentAvailable: true,
      manualActivationAvailable: false,
      provider: 'midtrans',
      environment: 'production',
      merchantId: 'G123456789',
    },
    monitoring: { backendErrorTracking: true, provider: 'sentry' },
  },
  syncMatrix: { auth: true, subscription_payments: true },
  warnings: [
    'CORS_ORIGIN belum memuat https://localhost.',
    'SENTRY_DSN wajib diisi untuk error tracking backend production.',
    'Midtrans belum dikonfigurasi penuh di backend.',
    'Resend belum lengkap; email register/reset/payment tidak akan terkirim.',
  ],
  readiness: { backend: 9 },
  error: { message: 'database password leaked in stack' },
};

describe('system status redaction', () => {
  it('keeps public warnings actionable without exposing exact deployment config', () => {
    expect(redactOperationalWarnings(detailedPayload.warnings)).toEqual([
      'Konfigurasi deployment perlu dicek oleh tim operasional.',
      'Payment flow perlu dicek oleh tim operasional.',
      'Email delivery perlu dicek oleh tim operasional.',
    ]);
  });

  it('removes operational identifiers and internal errors from public status payloads', () => {
    const redacted = redactSystemStatusForPublic(detailedPayload);

    expect(redacted.checks.email.fromEmail).toBeNull();
    expect(redacted.checks.payment.merchantId).toBeNull();
    expect(redacted.error).toBeUndefined();
    expect(JSON.stringify(redacted)).not.toContain('G123456789');
    expect(JSON.stringify(redacted)).not.toContain('no-reply@kaffepos.my.id');
    expect(JSON.stringify(redacted)).not.toContain('database password leaked');
    expect(JSON.stringify(redacted)).not.toContain('CORS_ORIGIN');
    expect(JSON.stringify(redacted)).not.toContain('SENTRY_DSN');
  });
});
