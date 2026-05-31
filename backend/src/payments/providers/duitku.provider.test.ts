import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

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

const md5 = (value: string) => createHash('md5').update(value).digest('hex');

describe('DuitkuPaymentProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates create transaction MD5 signature', () => {
    const provider = new DuitkuPaymentProvider();
    expect(provider.createTransactionSignature('ORDER-1', 49000)).toBe(md5('D1234ORDER-149000test-key'));
  });

  it('accepts valid callback signature and maps paid status', async () => {
    const provider = new DuitkuPaymentProvider();
    const signature = md5('D123449000ORDER-1test-key');
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
    expect(provider.checkTransactionSignature('ORDER-1')).toBe(md5('D1234ORDER-1test-key'));
  });

  it('creates sandbox transaction and maps paymentUrl', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.paymentMethod).toBe('BC');
      expect(body.signature).toBe(md5('D1234ORDER-149000test-key'));
      expect(body.merchantKey).toBeUndefined();
      expect(body.expiryPeriod).toBe(60);
      expect(body.itemDetails).toBeUndefined();
      expect(body.customerDetail).toBeUndefined();
      expect(Object.keys(body).sort()).toEqual([
        'callbackUrl',
        'customerVaName',
        'email',
        'expiryPeriod',
        'merchantCode',
        'merchantOrderId',
        'paymentAmount',
        'paymentMethod',
        'phoneNumber',
        'productDetails',
        'returnUrl',
        'signature',
      ].sort());
      return new Response(JSON.stringify({ reference: 'REF-1', paymentUrl: 'https://sandbox.duitku.com/topup/topupdirectv2.aspx?x=1', statusCode: '00', statusMessage: 'SUCCESS' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const provider = new DuitkuPaymentProvider();
    const result = await provider.createPayment({ merchantOrderId: 'ORDER-1', amount: 49000, productDetails: 'Langganan', customerName: 'Tester', customerEmail: 'tester@example.com', paymentMethod: 'bca_va' });
    expect(result.provider).toBe('duitku');
    expect(result.paymentUrl).toContain('sandbox.duitku.com');
    expect(result.internalStatus).toBe('pending');
  });

  it('fails clearly when Duitku omits paymentUrl', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ statusCode: '00', statusMessage: 'SUCCESS' }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const provider = new DuitkuPaymentProvider();
    await expect(provider.createPayment({ merchantOrderId: 'ORDER-2', amount: 49000, productDetails: 'Langganan' })).rejects.toThrow('paymentUrl');
  });
});
