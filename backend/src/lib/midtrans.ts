export type MidtransEnvironment = 'sandbox' | 'production';

export type MidtransConfig = {
  environment: MidtransEnvironment;
  serverKey?: string;
  merchantId?: string;
  snapEnabled: boolean;
  webBaseUrl: string;
  webhookBaseUrl?: string;
  finishUrl?: string;
  unfinishUrl?: string;
  errorUrl?: string;
};

export type MidtransCreateTransactionInput = {
  orderId: string;
  amount: number;
  itemId: string;
  itemName: string;
  enabledPayments: string[];
  customerName?: string;
  customerEmail?: string;
  plan: string;
  billingCycle: string;
  storeId?: string | null;
  callbackUrls: {
    finish: string;
    unfinish: string;
    error: string;
  };
};

export const MIDTRANS_ENABLED_PAYMENTS = ['gopay', 'bca_va', 'echannel', 'bni_va', 'bri_va'] as const;

const MIDTRANS_ENDPOINTS: Record<
  MidtransEnvironment,
  { apiBaseUrl: string; snapJsUrl: string }
> = {
  sandbox: {
    apiBaseUrl: 'https://app.sandbox.midtrans.com',
    snapJsUrl: 'https://app.sandbox.midtrans.com/snap/snap.js',
  },
  production: {
    apiBaseUrl: 'https://app.midtrans.com',
    snapJsUrl: 'https://app.midtrans.com/snap/snap.js',
  },
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function getMidtransEnvironmentMeta(environment: MidtransEnvironment) {
  const endpoints = MIDTRANS_ENDPOINTS[environment];
  return {
    environment,
    isProduction: environment === 'production',
    isSandbox: environment === 'sandbox',
    apiBaseUrl: endpoints.apiBaseUrl,
    snapJsUrl: endpoints.snapJsUrl,
    logMode: environment === 'production' ? 'live' : 'test',
  };
}

export function isMidtransConfigured(config: MidtransConfig) {
  return Boolean(config.snapEnabled && config.serverKey && config.merchantId);
}

export function getMidtransWebhookUrl(baseUrl?: string) {
  if (!baseUrl?.trim()) return null;
  return `${trimTrailingSlash(baseUrl.trim())}/api/payments/midtrans/webhook`;
}

export function getMidtransCallbackUrls(config: Pick<MidtransConfig, 'webBaseUrl' | 'finishUrl' | 'unfinishUrl' | 'errorUrl'>) {
  const base = trimTrailingSlash(config.webBaseUrl);
  return {
    finish: config.finishUrl ?? `${base}/settings?billing=success`,
    unfinish: config.unfinishUrl ?? `${base}/settings?billing=pending`,
    error: config.errorUrl ?? `${base}/settings?billing=failed`,
  };
}

export function appendMidtransRedirectOptions(url: string, mode?: 'qris') {
  const redirectUrl = new URL(url);
  if (mode === 'qris') {
    redirectUrl.searchParams.set('gopayMode', 'qr');
  }
  return redirectUrl.toString();
}

export function buildMidtransCreateTransactionPayload(input: MidtransCreateTransactionInput) {
  const payload: Record<string, unknown> = {
    enabled_payments: [...input.enabledPayments],
    transaction_details: {
      order_id: input.orderId,
      gross_amount: input.amount,
    },
    item_details: [
      {
        id: input.itemId,
        price: input.amount,
        quantity: 1,
        name: input.itemName,
      },
    ],
    customer_details: {
      first_name: input.customerName ?? 'KaffePOS User',
      email: input.customerEmail ?? undefined,
    },
    callbacks: input.callbackUrls,
    expiry: {
      unit: 'minutes',
      duration: 30,
    },
    custom_field1: input.plan,
    custom_field2: input.billingCycle,
    custom_field3: input.storeId ?? '',
  };

  return payload;
}
