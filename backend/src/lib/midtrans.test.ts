import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MIDTRANS_ENABLED_PAYMENTS,
  appendMidtransRedirectOptions,
  buildMidtransCreateTransactionPayload,
  getMidtransCallbackUrls,
  getMidtransEnvironmentMeta,
  getMidtransWebhookUrl,
  isMidtransConfigured,
} from './midtrans';

test('resolves sandbox and production endpoints correctly', () => {
  assert.equal(getMidtransEnvironmentMeta('sandbox').apiBaseUrl, 'https://app.sandbox.midtrans.com');
  assert.equal(getMidtransEnvironmentMeta('sandbox').snapJsUrl, 'https://app.sandbox.midtrans.com/snap/snap.js');
  assert.equal(getMidtransEnvironmentMeta('production').apiBaseUrl, 'https://app.midtrans.com');
  assert.equal(getMidtransEnvironmentMeta('production').snapJsUrl, 'https://app.midtrans.com/snap/snap.js');
});

test('marks configuration ready only when snap is enabled and secret config exists', () => {
  assert.equal(
    isMidtransConfigured({
      environment: 'sandbox',
      serverKey: 'server-key',
      merchantId: 'merchant-id',
      snapEnabled: true,
      webBaseUrl: 'https://kaffepos.my.id',
    }),
    true,
  );
  assert.equal(
    isMidtransConfigured({
      environment: 'sandbox',
      serverKey: 'server-key',
      snapEnabled: true,
      webBaseUrl: 'https://kaffepos.my.id',
    }),
    false,
  );
});

test('builds callback and webhook urls without duplicated slashes', () => {
  assert.equal(
    getMidtransWebhookUrl('https://api.kaffepos.my.id/'),
    'https://api.kaffepos.my.id/api/payments/midtrans/webhook',
  );
  assert.deepEqual(
    getMidtransCallbackUrls({
      webBaseUrl: 'https://kaffepos.my.id/',
    }),
    {
      finish: 'https://kaffepos.my.id/settings?billing=success',
      unfinish: 'https://kaffepos.my.id/settings?billing=pending',
      error: 'https://kaffepos.my.id/settings?billing=failed',
    },
  );
});

test('keeps payment restriction on qr and virtual account compatible methods', () => {
  assert.deepEqual([...MIDTRANS_ENABLED_PAYMENTS], ['gopay', 'bca_va', 'echannel', 'bni_va', 'bri_va']);
  assert.equal(
    appendMidtransRedirectOptions('https://app.midtrans.com/snap/v2/vtweb/123', 'qris'),
    'https://app.midtrans.com/snap/v2/vtweb/123?gopayMode=qr',
  );
});

test('builds create transaction payload with env-agnostic structure', () => {
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

  assert.deepEqual(payload.enabled_payments, ['bca_va']);
  assert.deepEqual(payload.transaction_details, {
    order_id: 'ORDER-123',
    gross_amount: 150000,
  });
  assert.equal(payload.custom_field1, 'signature');
  assert.equal(payload.custom_field2, 'quarterly');
  assert.equal(payload.custom_field3, 'store-1');
});
