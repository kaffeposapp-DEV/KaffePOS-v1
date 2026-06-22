#!/usr/bin/env node
/**
 * DOKU Checkout sandbox/production smoke test.
 *
 * Reads DOKU_* credentials from the environment (or .env.staging.local) — never
 * from the command line — fires a real create-payment request, and validates the
 * HMAC-SHA256 signature + response shape. The Secret Key is never printed.
 *
 *   DOKU_CLIENT_ID=... DOKU_SECRET_KEY=... DOKU_ENVIRONMENT=sandbox \
 *     npm run smoke:staging:doku
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { loadStagingEnvFiles } from './lib/staging-env.mjs';

loadStagingEnvFiles();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ ${name} wajib diisi untuk smoke test DOKU (set di env atau .env.staging.local; jangan paste di chat).`);
    process.exit(1);
  }
  return value;
}

function maskTail(value, visible = 4) {
  if (!value) return '[unset]';
  return value.length <= visible ? '*'.repeat(value.length) : `${value.slice(0, 4)}…${value.slice(-visible)}`;
}

const clientId = requireEnv('DOKU_CLIENT_ID');
const secretKey = requireEnv('DOKU_SECRET_KEY');
const environment = process.env.DOKU_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
const baseUrl = (environment === 'production'
  ? process.env.DOKU_PRODUCTION_BASE_URL || 'https://api.doku.com'
  : process.env.DOKU_SANDBOX_BASE_URL || 'https://api-sandbox.doku.com'
).replace(/\/+$/, '');
const checkoutPath = process.env.DOKU_CHECKOUT_PATH || '/checkout/v1/payment';
const callbackUrl = process.env.DOKU_CALLBACK_URL || 'https://kaffepos.my.id/settings?billing=doku-return';
const dueMinutes = Number(process.env.DOKU_PAYMENT_DUE_MINUTES || 60);
const amount = Number(process.env.DOKU_SMOKE_AMOUNT || 1000); // smallest sensible test amount

// ── DOKU signature (mirrors backend/src/payments/providers/doku.provider.ts) ──
function dokuTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
function sha256Base64(body) {
  return createHash('sha256').update(body, 'utf8').digest('base64');
}
function buildSignature({ requestId, timestamp, target, digest }) {
  const component = [
    `Client-Id:${clientId}`,
    `Request-Id:${requestId}`,
    `Request-Timestamp:${timestamp}`,
    `Request-Target:${target}`,
    `Digest:${digest}`,
  ].join('\n');
  return `HMACSHA256=${createHmac('sha256', secretKey).update(component, 'utf8').digest('base64')}`;
}

function pick(payload, path) {
  let cursor = payload;
  for (const key of path) {
    if (cursor && typeof cursor === 'object' && key in cursor) cursor = cursor[key];
    else return undefined;
  }
  return cursor;
}

async function main() {
  const invoiceNumber = `SMOKE-DOKU-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const body = JSON.stringify({
    order: {
      amount,
      invoice_number: invoiceNumber,
      currency: 'IDR',
      callback_url: callbackUrl,
      line_items: [{ name: 'KaffePOS smoke test', price: amount, quantity: 1 }],
    },
    payment: { payment_due_date: dueMinutes },
    customer: { id: invoiceNumber, name: 'Smoke Tester', email: 'smoke@kaffepos.my.id' },
  });

  const requestId = randomUUID();
  const timestamp = dokuTimestamp();
  const signature = buildSignature({ requestId, timestamp, target: checkoutPath, digest: sha256Base64(body) });

  console.log('── DOKU Checkout smoke test ──');
  console.log(`  environment : ${environment}`);
  console.log(`  base url    : ${baseUrl}`);
  console.log(`  endpoint    : POST ${checkoutPath}`);
  console.log(`  client id   : ${maskTail(clientId)}`);
  console.log(`  invoice     : ${invoiceNumber}`);
  console.log(`  amount      : Rp${amount.toLocaleString('id-ID')}`);

  const response = await fetch(`${baseUrl}${checkoutPath}`, {
    method: 'POST',
    headers: {
      'Client-Id': clientId,
      'Request-Id': requestId,
      'Request-Timestamp': timestamp,
      Signature: signature,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body,
    signal: AbortSignal.timeout(20000),
  });

  const raw = await response.json().catch(async () => ({ message: await response.text().catch(() => '') }));
  const paymentUrl = pick(raw, ['response', 'payment', 'url']) ?? pick(raw, ['payment', 'url']);
  const tokenId = pick(raw, ['response', 'payment', 'token_id']) ?? pick(raw, ['payment', 'token_id']);

  console.log(`  http status : ${response.status}`);
  console.log(`  payment.url : ${paymentUrl ? 'present ✓' : 'MISSING ✗'}`);
  if (tokenId) console.log(`  token_id    : ${tokenId}`);

  if (!response.ok || !paymentUrl) {
    console.error('\n✗ Smoke test FAILED. Raw response:');
    console.error(JSON.stringify(raw, null, 2));
    console.error('\nIf this is a 401/signature error: confirm DOKU_SECRET_KEY is the current key,');
    console.error('the base host matches the environment, and the system clock is accurate (timestamp).');
    process.exit(1);
  }

  console.log(`\n✓ Smoke test PASSED — open the payment page to finish a test transaction:`);
  console.log(`  ${paymentUrl}`);
}

main().catch((error) => {
  console.error('✗ Smoke test error:', error?.message ?? error);
  process.exit(1);
});
