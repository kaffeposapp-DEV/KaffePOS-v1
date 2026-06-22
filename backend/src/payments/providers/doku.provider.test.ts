import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createHash, createHmac } from 'node:crypto';

const DOKU_ENV = vi.hoisted(() => ({
  DOKU_ENVIRONMENT: 'sandbox',
  DOKU_CLIENT_ID: 'BRN-0001-1234567890',
  DOKU_SECRET_KEY: 'SK-test-secret',
  DOKU_SANDBOX_BASE_URL: 'https://api-sandbox.doku.com',
  DOKU_PRODUCTION_BASE_URL: 'https://api.doku.com',
  DOKU_CHECKOUT_PATH: '/checkout/v1/payment',
  DOKU_STATUS_PATH_PREFIX: '/orders/v1/status',
  DOKU_NOTIFICATION_PATH: '/api/webhooks/doku',
  DOKU_CALLBACK_URL: 'https://kaffepos.my.id/settings?billing=doku-return',
  DOKU_PAYMENT_DUE_MINUTES: 60,
}));

vi.mock('../../core', () => ({
  ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } },
  log: vi.fn(),
  serializeError: (error: unknown) => String(error),
  env: DOKU_ENV,
}));

import { DokuPaymentProvider } from './doku.provider';

const sha256Base64 = (body: string) => createHash('sha256').update(body, 'utf8').digest('base64');
const hmac = (component: string) => createHmac('sha256', DOKU_ENV.DOKU_SECRET_KEY).update(component, 'utf8').digest('base64');

describe('DokuPaymentProvider', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('builds the DOKU HMAC-SHA256 signature over the exact component string', () => {
    const provider = new DokuPaymentProvider();
    const expected = `HMACSHA256=${hmac(
      `Client-Id:${DOKU_ENV.DOKU_CLIENT_ID}\nRequest-Id:req-1\nRequest-Timestamp:2026-06-22T10:00:00Z\nRequest-Target:/checkout/v1/payment\nDigest:abc=`,
    )}`;
    expect(provider.buildSignature({ requestId: 'req-1', timestamp: '2026-06-22T10:00:00Z', target: '/checkout/v1/payment', digest: 'abc=' })).toBe(expected);
  });

  it('omits the Digest line for GET-style signatures (status check)', () => {
    const provider = new DokuPaymentProvider();
    const expected = `HMACSHA256=${hmac(
      `Client-Id:${DOKU_ENV.DOKU_CLIENT_ID}\nRequest-Id:req-2\nRequest-Timestamp:2026-06-22T10:00:00Z\nRequest-Target:/orders/v1/status/INV-1`,
    )}`;
    expect(provider.buildSignature({ requestId: 'req-2', timestamp: '2026-06-22T10:00:00Z', target: '/orders/v1/status/INV-1' })).toBe(expected);
  });

  it('creates a checkout payment with valid signed headers and returns payment.url', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers as Record<string, string>;
      capturedBody = String(init?.body);
      return new Response(JSON.stringify({ response: { payment: { url: 'https://app-sandbox.doku.com/checkout/pay/TOKEN-1', token_id: 'TOKEN-1' } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const provider = new DokuPaymentProvider();
    const result = await provider.createPayment({ merchantOrderId: 'SUB-1', amount: 49000, productDetails: 'Langganan Signature', customerName: 'Tester', customerEmail: 'tester@example.com' });

    expect(capturedUrl).toBe('https://api-sandbox.doku.com/checkout/v1/payment');
    expect(capturedHeaders['Client-Id']).toBe(DOKU_ENV.DOKU_CLIENT_ID);
    expect(capturedHeaders['Request-Id']).toBeTruthy();
    expect(capturedHeaders['Request-Timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    // Re-derive the signature from the captured request and confirm it matches.
    const digest = sha256Base64(capturedBody);
    const expectedSig = `HMACSHA256=${hmac(
      `Client-Id:${DOKU_ENV.DOKU_CLIENT_ID}\nRequest-Id:${capturedHeaders['Request-Id']}\nRequest-Timestamp:${capturedHeaders['Request-Timestamp']}\nRequest-Target:/checkout/v1/payment\nDigest:${digest}`,
    )}`;
    expect(capturedHeaders.Signature).toBe(expectedSig);
    expect(JSON.parse(capturedBody).order.invoice_number).toBe('SUB-1');
    expect(result.provider).toBe('doku');
    expect(result.paymentUrl).toBe('https://app-sandbox.doku.com/checkout/pay/TOKEN-1');
    expect(result.providerReference).toBe('TOKEN-1');
    expect(result.internalStatus).toBe('pending');
  });

  it('accepts a notification with a valid header signature and maps SUCCESS -> paid', async () => {
    const provider = new DokuPaymentProvider();
    const body = { order: { invoice_number: 'SUB-1', amount: 49000 }, transaction: { status: 'SUCCESS', date: '2026-06-22T10:00:00Z' } };
    const rawBody = JSON.stringify(body);
    const requestId = 'notif-1';
    const timestamp = '2026-06-22T10:00:01Z';
    const signature = `HMACSHA256=${hmac(
      `Client-Id:${DOKU_ENV.DOKU_CLIENT_ID}\nRequest-Id:${requestId}\nResponse-Timestamp:${timestamp}\nRequest-Target:/api/webhooks/doku\nDigest:${sha256Base64(rawBody)}`,
    )}`;

    const result = await provider.verifyCallback({
      body,
      rawBody,
      headers: { 'client-id': DOKU_ENV.DOKU_CLIENT_ID, 'request-id': requestId, 'response-timestamp': timestamp, signature },
    });

    expect(result.signatureValid).toBe(true);
    expect(result.internalStatus).toBe('paid');
    expect(result.merchantOrderId).toBe('SUB-1');
    expect(result.amount).toBe(49000);
  });

  it('rejects a notification with a tampered signature', async () => {
    const provider = new DokuPaymentProvider();
    const body = { order: { invoice_number: 'SUB-1', amount: 49000 }, transaction: { status: 'SUCCESS' } };
    const result = await provider.verifyCallback({
      body,
      rawBody: JSON.stringify(body),
      headers: { 'client-id': DOKU_ENV.DOKU_CLIENT_ID, 'request-id': 'x', 'response-timestamp': '2026-06-22T10:00:01Z', signature: 'HMACSHA256=tampered' },
    });
    expect(result.signatureValid).toBe(false);
  });

  it('maps DOKU statuses to internal statuses', () => {
    const provider = new DokuPaymentProvider();
    expect(provider.mapProviderStatus('SUCCESS')).toBe('paid');
    expect(provider.mapProviderStatus('PENDING')).toBe('pending');
    expect(provider.mapProviderStatus('FAILED')).toBe('failed');
    expect(provider.mapProviderStatus('EXPIRED')).toBe('expired');
    expect(provider.mapProviderStatus('VOID')).toBe('cancelled');
    expect(provider.mapProviderStatus('weird')).toBe('unknown');
  });
});
