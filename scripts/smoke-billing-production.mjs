#!/usr/bin/env node

const apiBaseUrl = normalizeBaseUrl(
  process.env.KAFFEPOS_BILLING_API_BASE_URL || process.env.API_BASE_URL || 'https://api.kaffepos.my.id',
);
const email = process.env.KAFFEPOS_BILLING_EMAIL || process.env.KAFFEPOS_LOGIN_EMAIL || '';
const password = process.env.KAFFEPOS_BILLING_PASSWORD || process.env.KAFFEPOS_LOGIN_PASSWORD || '';
const quotePayload = {
  plan: process.env.KAFFEPOS_BILLING_PLAN || 'signature',
  billingCycle: process.env.KAFFEPOS_BILLING_CYCLE || 'monthly',
  paymentMethod: process.env.KAFFEPOS_BILLING_PAYMENT_METHOD || 'qris',
};

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`[OK] ${message}`);
}

function warn(message) {
  console.warn(`[WARN] ${message}`);
}

function maskEmail(value) {
  const [local, domain] = value.split('@');
  if (!local || !domain) return '[email hidden]';
  return `${local.slice(0, 2)}***@${domain}`;
}

function assertProductionBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error(`Billing production smoke requires HTTPS API base URL, got ${url.origin}`);
  }

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (loopbackHosts.has(url.hostname)) {
    throw new Error(`Billing production smoke cannot target loopback API host (${url.hostname}).`);
  }
}

async function request(path, options = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.json) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.json ? JSON.stringify(options.json) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${data?.message || text || response.statusText}`);
  }

  return data;
}

async function checkCommercialStatus() {
  const health = await request('/health');
  if (health?.ok && health.checks?.database?.ok) {
    pass('API health and database are OK');
  } else {
    fail('API health or database check is not OK');
  }

  const status = await request('/system-status');
  const payment = status?.checks?.payment;

  if (status?.ok) {
    pass('Commercial system status is OK');
  } else {
    fail('Commercial system status reports not OK');
  }

  if (payment?.ok === true) {
    pass('Payment gateway credentials are configured');
  } else {
    fail('Payment gateway credentials are not configured');
  }

  if (
    payment?.environment === 'production' &&
    payment?.mode === 'doku_production' &&
    payment?.onlinePaymentAvailable === true &&
    payment?.commerciallyReady === true
  ) {
    pass('DOKU production billing is commercially ready');
  } else {
    fail(
      `DOKU billing is not production-ready (environment=${payment?.environment ?? 'unknown'}, mode=${
        payment?.mode ?? 'unknown'
      }, online=${String(payment?.onlinePaymentAvailable)}, commerciallyReady=${String(payment?.commerciallyReady)})`,
    );
  }

  if (status?.syncMatrix?.subscriptions === true && status?.syncMatrix?.subscription_payments === true) {
    pass('Subscription and subscription payment sync are enabled');
  } else {
    fail('Subscription or subscription payment sync is not enabled');
  }

  for (const message of status?.warnings || []) {
    warn(message);
  }
}

async function checkAuthenticatedBillingReadiness() {
  if (!email || !password) {
    warn(
      'Skipping authenticated subscription and quote checks; set KAFFEPOS_BILLING_EMAIL and KAFFEPOS_BILLING_PASSWORD.',
    );
    return;
  }

  console.log(`[INFO] Authenticated billing checks enabled for ${maskEmail(email)}`);
  const login = await request('/api/auth/login', {
    method: 'POST',
    json: { email, password },
  });

  if (!login?.accessToken || !login?.profile?.id) {
    fail('Billing login response does not include accessToken and profile.');
    return;
  }
  pass(`Billing account login succeeded (role=${login.profile.role || 'unknown'})`);

  const permissions = Array.isArray(login.profile.permissions) ? login.profile.permissions : [];
  if (permissions.includes('can_manage_billing')) {
    pass('Billing account has can_manage_billing permission');
  } else {
    fail('Billing account is missing can_manage_billing permission');
  }

  const subscriptions = await request('/api/subscriptions', { token: login.accessToken });
  if (Array.isArray(subscriptions?.subscriptions) && Array.isArray(subscriptions?.paymentHistory)) {
    pass('Subscription endpoint returns billing collections');
  } else {
    fail('Subscription endpoint response is missing billing collections');
  }

  if (subscriptions?.paymentConfig?.commerciallyReady === true) {
    pass('Subscription endpoint reports commercial payment readiness');
  } else {
    fail('Subscription endpoint paymentConfig is not commercially ready');
  }

  const quote = await request('/api/subscriptions/payments/quote', {
    method: 'POST',
    token: login.accessToken,
    json: quotePayload,
  });

  if (quote?.quote?.total > 0 && quote.quote.currency === 'IDR' && Array.isArray(quote.paymentMethods)) {
    pass(
      `Quote endpoint is ready without creating a transaction (${quote.quote.plan}/${quote.quote.billingCycle}/${quote.quote.selectedPaymentMethod?.id})`,
    );
  } else {
    fail('Quote endpoint response is incomplete or invalid');
  }

  if (quote?.paymentConfig?.commerciallyReady === true) {
    pass('Quote endpoint returns commercially ready paymentConfig');
  } else {
    fail('Quote endpoint paymentConfig is not commercially ready');
  }
}

try {
  console.log(`KaffePOS production billing smoke: API=${apiBaseUrl}`);
  assertProductionBaseUrl(apiBaseUrl);
  await checkCommercialStatus();
  await checkAuthenticatedBillingReadiness();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (process.exitCode) {
  console.error('Production billing smoke gate failed.');
} else {
  console.log('Production billing smoke gate passed.');
}
