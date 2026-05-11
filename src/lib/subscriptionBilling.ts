export type SubscriptionPaymentMethodId = 'qris' | 'bca_va' | 'mandiri_bill' | 'bni_va' | 'bri_va';

export type SubscriptionPaymentMethod = {
  id: SubscriptionPaymentMethodId;
  label: string;
  shortLabel: string;
  category: 'QRIS' | 'Virtual Account';
  description: string;
};

export type SubscriptionBillingQuote = {
  plan: 'kopi_susu' | 'signature' | 'founder';
  billingCycle: 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
  planName: string;
  subtotal: number;
  discount: number;
  discountLabel: string | null;
  adminFee: number;
  total: number;
  currency: 'IDR';
  selectedPaymentMethod: SubscriptionPaymentMethod;
  voucher: {
    code: string;
    amount: number;
    description: string;
  } | null;
  trustLabel: string;
};

export const SUBSCRIPTION_PAYMENT_METHODS: SubscriptionPaymentMethod[] = [
  {
    id: 'qris',
    label: 'QRIS',
    shortLabel: 'QRIS',
    category: 'QRIS',
    description: 'Bayar cepat dengan scan QR dari e-wallet atau mobile banking.',
  },
  {
    id: 'bca_va',
    label: 'BCA Virtual Account',
    shortLabel: 'BCA VA',
    category: 'Virtual Account',
    description: 'Cocok untuk outlet yang memakai BCA sebagai rekening utama.',
  },
  {
    id: 'mandiri_bill',
    label: 'Mandiri Bill Payment',
    shortLabel: 'Mandiri Bill',
    category: 'Virtual Account',
    description: 'Pembayaran lewat Livin, ATM, atau internet banking Mandiri.',
  },
  {
    id: 'bni_va',
    label: 'BNI Virtual Account',
    shortLabel: 'BNI VA',
    category: 'Virtual Account',
    description: 'Bayar lewat mobile banking, ATM, atau internet banking BNI.',
  },
  {
    id: 'bri_va',
    label: 'BRI Virtual Account',
    shortLabel: 'BRI VA',
    category: 'Virtual Account',
    description: 'Bayar lewat BRImo, ATM, atau channel BRI lainnya.',
  },
];

export function getSubscriptionPaymentMethod(methodId: SubscriptionPaymentMethodId) {
  return SUBSCRIPTION_PAYMENT_METHODS.find((method) => method.id === methodId) ?? SUBSCRIPTION_PAYMENT_METHODS[0];
}

export function groupSubscriptionPaymentMethods() {
  return {
    qris: SUBSCRIPTION_PAYMENT_METHODS.filter((item) => item.category === 'QRIS'),
    virtualAccount: SUBSCRIPTION_PAYMENT_METHODS.filter((item) => item.category === 'Virtual Account'),
  };
}
