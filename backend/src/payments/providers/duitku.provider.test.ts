import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../../core', () => ({
  ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } },
  log: vi.fn(),
  serializeError: (error: unknown) => String(error),
  env: {
    DUITKU_ENVIRONMENT: 'sandbox',
    DUITKU_MERCHANT_CODE: 'D1234',
    DUITKU_MERCHANT_KEY: 'test-key',
    DUITKU_SANDBOX_BASE_URL: 'https://sandbox.duitku.com',
    DUITKU_PRODUCTION_BASE_URL: 'https://passport.duitku.com',
    DUITKU_CALLBACK_URL: 'https://api.kaffepos.my.id/api/webhooks/duitku',
    DUITKU_RETURN_URL: 'https://kaffepos.my.id/settings?billing=duitku-return',
    DUITKU_EXPIRY_PERIOD_MINUTES: 60,
    DUITKU_DEFAULT_PAYMENT_METHOD: 'VC',
  },
}));

import { DuitkuPaymentProvider } from './duitku.provider';

const hmac = (value: string) => createHmac('sha256', 'test-key').update(value).digest('hex');

describe('DuitkuPaymentProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates create transaction HMAC SHA256 signature', () => {
    const provider = new DuitkuPaymentProvider();
    expect(provider.createTransactionSignature('ORDER-1', 49000)).toBe(hmac('D1234ORDER-149000'));
  });

  it('accepts valid callback signature and maps paid status', async () => {
    const provider = new DuitkuPaymentProvider();
    const signature = hmac('D123449000ORDER-1');
    const result = await provider.verifyCallback({ body: { merchantCode: 'D1234', amount: '49000', merchantOrderId: 'ORDER-1', resultCode: '00', reference: 'REF-1', signature } });
    expect(result.signatureValid).toBe(true);
    expect(result.internalStatus).toBe('paid');
  });

  it('rejects invalid callback signature', async () => {
    const provider = new DuitkuPaymentProvider();
    const result = await provider.verifyCallback({ body: { merchantCode: 'D1234', amount: '49000', merchantOrderId: 'ORDER-1', resultCode: '00', signature: 'bad' } });
    expect(result.signatureValid).toBe(false);
  });

  it('generates check transaction signature', () => {
    const provider = new DuitkuPaymentProvider();
    expect(provider.checkTransactionSignature('ORDER-1')).toBe(hmac('D1234ORDER-1'));
  });
});
