import { describe, expect, it } from 'vitest';
import {
  MIDTRANS_ENABLED_PAYMENTS,
  appendMidtransRedirectOptions,
  buildMidtransCreateTransactionPayload,
  createMidtransWebhookSignature,
  getMidtransCallbackUrls,
  getMidtransEnvironmentMeta,
  getMidtransWebhookUrl,
  isMidtransConfigured,
  isMidtransWebhookSignatureValid,
} from './midtrans';

describe('backend midtrans helpers', () => {
  it('resolves sandbox and production endpoints correctly', () => {
    expect(getMidtransEnvironmentMeta('sandbox').apiBaseUrl).toBe('https://app.sandbox.midtrans.com');
    expect(getMidtransEnvironmentMeta('sandbox').snapJsUrl).toBe('https://app.sandbox.midtrans.com/snap/snap.js');
    expect(getMidtransEnvironmentMeta('production').apiBaseUrl).toBe('https://app.midtrans.com');
    expect(getMidtransEnvironmentMeta('production').snapJsUrl).toBe('https://app.midtrans.com/snap/snap.js');
  });

  it('marks configuration ready only when snap is enabled and secret config exists', () => {
    expect(
      isMidtransConfigured({
        environment: 'sandbox',
        serverKey: 'server-key',
        merchantId: 'merchant-id',
        snapEnabled: true,
        webBaseUrl: 'https://kaffepos.my.id',
      }),
    ).toBe(true);
    expect(
      isMidtransConfigured({
        environment: 'sandbox',
        serverKey: 'server-key',
        snapEnabled: true,
        webBaseUrl: 'https://kaffepos.my.id',
      }),
    ).toBe(false);
  });

  it('builds callback and webhook urls without duplicated slashes', () => {
    expect(getMidtransWebhookUrl('https://api.kaffepos.my.id/')).toBe(
      'https://api.kaffepos.my.id/api/payments/midtrans/webhook',
    );
    expect(
      getMidtransCallbackUrls({
        webBaseUrl: 'https://kaffepos.my.id/',
      }),
    ).toEqual({
      finish: 'https://kaffepos.my.id/settings?billing=success',
      unfinish: 'https://kaffepos.my.id/settings?billing=pending',
      error: 'https://kaffepos.my.id/settings?billing=failed',
    });
  });

  it('keeps payment restriction on qr and virtual account compatible methods', () => {
    expect([...MIDTRANS_ENABLED_PAYMENTS]).toEqual(['gopay', 'bca_va', 'echannel', 'bni_va', 'bri_va']);
    expect(appendMidtransRedirectOptions('https://app.midtrans.com/snap/v2/vtweb/123', 'qris')).toBe(
      'https://app.midtrans.com/snap/v2/vtweb/123?gopayMode=qr',
    );
  });

  it('builds create transaction payload with env-agnostic structure', () => {
    const payload = buildMidtransCreateTransactionPayload({
      orderId: 'ORDER-123',
      amount: 150000,
      itemId: 'signature-quarterly',
      itemName: 'Langganan signature (quarterly)',
      enabledPayments: ['bca_va'],
      customerName: 'KaffePOS User',
      customerEmail: 'owner@kaffepos.my.id',
      plan: 'signature',
      billingCycle: 'quarterly',
      storeId: 'store-1',
      callbackUrls: {
        finish: 'https://kaffepos.my.id/settings?billing=success',
        unfinish: 'https://kaffepos.my.id/settings?billing=pending',
        error: 'https://kaffepos.my.id/settings?billing=failed',
      },
    });

    expect(payload.enabled_payments).toEqual(['bca_va']);
    expect(payload.transaction_details).toEqual({
      order_id: 'ORDER-123',
      gross_amount: 150000,
    });
    expect(payload.custom_field1).toBe('signature');
    expect(payload.custom_field2).toBe('quarterly');
    expect(payload.custom_field3).toBe('store-1');
  });

  it('validates Midtrans webhook signatures from order, status, amount, and server key', () => {
    const signature = createMidtransWebhookSignature({
      orderId: 'SUB-SIGNATURE-MONTHLY-user-123',
      statusCode: '200',
      grossAmount: '129000.00',
      serverKey: 'server-key',
    });

    expect(signature).toHaveLength(128);
    expect(
      isMidtransWebhookSignatureValid({
        orderId: 'SUB-SIGNATURE-MONTHLY-user-123',
        statusCode: '200',
        grossAmount: '129000.00',
        signatureKey: signature,
        serverKey: 'server-key',
      }),
    ).toBe(true);
    expect(
      isMidtransWebhookSignatureValid({
        orderId: 'SUB-SIGNATURE-MONTHLY-user-123',
        statusCode: '200',
        grossAmount: '129000.00',
        signatureKey: signature,
        serverKey: 'wrong-key',
      }),
    ).toBe(false);
  });
});
