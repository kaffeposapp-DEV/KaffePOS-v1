import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSubscriptionBillingQuote,
  listSubscriptionPaymentMethods,
  validateSubscriptionVoucher,
} from './subscriptionBilling';

test('lists only supported subscription payment methods', () => {
  const methods = listSubscriptionPaymentMethods().map((item) => item.id);
  assert.deepEqual(methods, ['qris', 'bca_va', 'mandiri_bill', 'bni_va', 'bri_va']);
});

test('builds quote with voucher discount', () => {
  const quote = buildSubscriptionBillingQuote({
    plan: 'signature',
    billingCycle: 'monthly',
    paymentMethod: 'bca_va',
    voucherCode: 'SIGNATURE10',
  });

  assert.equal(quote.subtotal, 99000);
  assert.equal(quote.discount, 9900);
  assert.equal(quote.adminFee, 0);
  assert.equal(quote.total, 89100);
});

test('rejects invalid voucher', () => {
  assert.throws(
    () =>
      validateSubscriptionVoucher({
        plan: 'founder',
        billingCycle: 'monthly',
        subtotal: 199000,
        voucherCode: 'SALAH',
      }),
    /Kode voucher tidak ditemukan/,
  );
});
