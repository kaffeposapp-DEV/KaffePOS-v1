export type SubscriptionPlanId = 'kopi_susu' | 'signature' | 'founder';
export type BillingCycle = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
export type SubscriptionPaymentMethodId = 'qris' | 'bca_va' | 'mandiri_bill' | 'bni_va' | 'bri_va';

export type SubscriptionPaymentMethod = {
  id: SubscriptionPaymentMethodId;
  label: string;
  shortLabel: string;
  category: 'QRIS' | 'Virtual Account';
  description: string;
  midtransPayments: string[];
  redirectMode?: 'qris';
};

export type SubscriptionVoucherResult = {
  code: string;
  amount: number;
  description: string;
};

export type SubscriptionBillingQuote = {
  plan: SubscriptionPlanId;
  billingCycle: BillingCycle;
  planName: string;
  subtotal: number;
  discount: number;
  discountLabel: string | null;
  adminFee: number;
  total: number;
  currency: 'IDR';
  selectedPaymentMethod: SubscriptionPaymentMethod;
  voucher: SubscriptionVoucherResult | null;
  trustLabel: string;
};

type VoucherRule = {
  code: string;
  description: string;
  amountOff?: number;
  percentOff?: number;
  maxDiscount?: number;
  plans?: SubscriptionPlanId[];
};

const PLAN_PRICES: Record<SubscriptionPlanId, Record<BillingCycle, number>> = {
  kopi_susu: { monthly: 49000, quarterly: 129000, semiannual: 249000, yearly: 449000 },
  signature: { monthly: 129000, quarterly: 349000, semiannual: 649000, yearly: 1199000 },
  founder: { monthly: 249000, quarterly: 679000, semiannual: 1249000, yearly: 2299000 },
};

const PLAN_NAMES: Record<SubscriptionPlanId, string> = {
  kopi_susu: 'Kopi Susu',
  signature: 'Signature',
  founder: 'Founder',
};

export const SUBSCRIPTION_PAYMENT_METHODS: Record<SubscriptionPaymentMethodId, SubscriptionPaymentMethod> = {
  qris: {
    id: 'qris',
    label: 'QRIS',
    shortLabel: 'QRIS',
    category: 'QRIS',
    description: 'Scan cepat dari e-wallet atau mobile banking yang mendukung QRIS.',
    midtransPayments: ['gopay'],
    redirectMode: 'qris',
  },
  bca_va: {
    id: 'bca_va',
    label: 'BCA Virtual Account',
    shortLabel: 'BCA VA',
    category: 'Virtual Account',
    description: 'Pembayaran lewat BCA ATM, m-BCA, dan KlikBCA.',
    midtransPayments: ['bca_va'],
  },
  mandiri_bill: {
    id: 'mandiri_bill',
    label: 'Mandiri Bill Payment',
    shortLabel: 'Mandiri Bill',
    category: 'Virtual Account',
    description: 'Pembayaran lewat Livin, ATM Mandiri, atau channel Mandiri lainnya.',
    midtransPayments: ['echannel'],
  },
  bni_va: {
    id: 'bni_va',
    label: 'BNI Virtual Account',
    shortLabel: 'BNI VA',
    category: 'Virtual Account',
    description: 'Pembayaran lewat ATM, mobile banking, atau internet banking BNI.',
    midtransPayments: ['bni_va'],
  },
  bri_va: {
    id: 'bri_va',
    label: 'BRI Virtual Account',
    shortLabel: 'BRI VA',
    category: 'Virtual Account',
    description: 'Pembayaran lewat BRImo, ATM, dan channel BRI lainnya.',
    midtransPayments: ['bri_va'],
  },
};

const SUBSCRIPTION_VOUCHERS: VoucherRule[] = [
  {
    code: 'NGOPIHEMAT',
    description: 'Potongan Rp10.000 untuk langganan berbayar pertama.',
    amountOff: 10000,
  },
  {
    code: 'SIGNATURE10',
    description: 'Diskon 10% untuk paket Signature, maksimal Rp25.000.',
    percentOff: 10,
    maxDiscount: 25000,
    plans: ['signature'],
  },
];

function normalizeVoucherCode(code?: string | null) {
  return code?.trim().toUpperCase() || null;
}

export function getSubscriptionPaymentMethod(methodId: SubscriptionPaymentMethodId) {
  return SUBSCRIPTION_PAYMENT_METHODS[methodId];
}

export function listSubscriptionPaymentMethods() {
  return Object.values(SUBSCRIPTION_PAYMENT_METHODS);
}

export function resolveSubscriptionPlanPrice(plan: SubscriptionPlanId, billingCycle: BillingCycle) {
  return PLAN_PRICES[plan][billingCycle];
}

export function validateSubscriptionVoucher(input: {
  plan: SubscriptionPlanId;
  billingCycle: BillingCycle;
  subtotal: number;
  voucherCode?: string | null;
}) {
  const code = normalizeVoucherCode(input.voucherCode);
  if (!code) return null;

  const voucher = SUBSCRIPTION_VOUCHERS.find((item) => item.code === code);
  if (!voucher) {
    throw new Error('Kode voucher tidak ditemukan.');
  }

  if (voucher.plans && !voucher.plans.includes(input.plan)) {
    throw new Error(`Voucher ${code} tidak berlaku untuk paket ini.`);
  }

  const rawDiscount = voucher.amountOff
    ? voucher.amountOff
    : Math.floor((input.subtotal * (voucher.percentOff ?? 0)) / 100);
  const amount = Math.min(rawDiscount, voucher.maxDiscount ?? rawDiscount, input.subtotal);

  if (amount <= 0) {
    throw new Error('Voucher tidak memberikan potongan untuk transaksi ini.');
  }

  return {
    code,
    amount,
    description: voucher.description,
  };
}

export function buildSubscriptionBillingQuote(input: {
  plan: SubscriptionPlanId;
  billingCycle: BillingCycle;
  paymentMethod: SubscriptionPaymentMethodId;
  voucherCode?: string | null;
}) {
  const selectedPaymentMethod = getSubscriptionPaymentMethod(input.paymentMethod);
  const subtotal = resolveSubscriptionPlanPrice(input.plan, input.billingCycle);
  const voucher = validateSubscriptionVoucher({
    plan: input.plan,
    billingCycle: input.billingCycle,
    subtotal,
    voucherCode: input.voucherCode,
  });
  const discount = voucher?.amount ?? 0;
  const adminFee = 0;
  const total = Math.max(subtotal - discount + adminFee, 0);

  const quote: SubscriptionBillingQuote = {
    plan: input.plan,
    billingCycle: input.billingCycle,
    planName: PLAN_NAMES[input.plan],
    subtotal,
    discount,
    discountLabel: voucher ? `Voucher ${voucher.code}` : null,
    adminFee,
    total,
    currency: 'IDR',
    selectedPaymentMethod,
    voucher,
    trustLabel: 'Pembayaran aman dan diproses melalui Midtrans.',
  };

  return quote;
}
