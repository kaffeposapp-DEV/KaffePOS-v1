import { describe, expect, it } from 'vitest';
import {
  buildSubscriptionBillingQuote,
  listSubscriptionPaymentMethods,
  validateSubscriptionVoucher,
} from './subscriptionBilling';

describe('backend subscription billing helpers', () => {
  it('lists only supported subscription payment methods', () => {
    const methods = listSubscriptionPaymentMethods().map((item) => item.id);
    expect(methods).toEqual(['qris', 'bca_va', 'mandiri_bill', 'bni_va', 'bri_va']);
  });

  it('builds quote with voucher discount', () => {
    const quote = buildSubscriptionBillingQuote({
      plan: 'signature',
      billingCycle: 'monthly',
      paymentMethod: 'bca_va',
      voucherCode: 'SIGNATURE10',
    });

    expect(quote.subtotal).toBe(129000);
    expect(quote.discount).toBe(12900);
    expect(quote.adminFee).toBe(0);
    expect(quote.total).toBe(116100);
  });

  it('rejects invalid voucher', () => {
    expect(() =>
      validateSubscriptionVoucher({
        plan: 'founder',
        billingCycle: 'monthly',
        subtotal: 249000,
        voucherCode: 'SALAH',
      }),
    ).toThrow('Kode voucher tidak ditemukan');
  });
});
