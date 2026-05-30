#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';

const DEFAULT_ENV_FILES = ['.env.staging.local', 'backend/.env.staging.local'];
const REQUIRED = [
  'DUITKU_MERCHANT_CODE',
  'DUITKU_MERCHANT_KEY',
  'DUITKU_CALLBACK_URL',
  'DUITKU_RETURN_URL',
];

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const parsed = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    parsed[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return parsed;
}

function loadEnv() {
  const explicitFiles = process.argv.filter((arg) => arg.startsWith('--env-file=')).map((arg) => arg.slice('--env-file='.length));
  const files = explicitFiles.length > 0 ? explicitFiles : DEFAULT_ENV_FILES;
  return Object.assign({}, ...files.map((file) => parseEnvFile(path.resolve(process.cwd(), file))), process.env);
}

function hmacSha256(value, key) {
  return createHmac('sha256', key).update(value).digest('hex');
}

async function main() {
  const env = loadEnv();
  const missing = REQUIRED.filter((key) => !env[key] || /^change-me|isi_dari_duitku$/i.test(env[key]));
  if (missing.length > 0) {
    console.error(`DUITKU_SANDBOX_CREDENTIALS_REQUIRED: missing=${missing.join(',')}`);
    process.exit(2);
  }
  const environment = env.DUITKU_ENVIRONMENT || 'sandbox';
  if (environment !== 'sandbox') {
    console.error('Duitku staging smoke requires DUITKU_ENVIRONMENT=sandbox.');
    process.exit(2);
  }
  const baseUrl = (env.DUITKU_SANDBOX_BASE_URL || 'https://sandbox.duitku.com').replace(/\/+$/, '');
  const merchantOrderId = `SMOKE-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const paymentAmount = Number(env.DUITKU_SMOKE_AMOUNT || 10000);
  const payload = {
    merchantCode: env.DUITKU_MERCHANT_CODE,
    paymentAmount,
    paymentMethod: env.DUITKU_DEFAULT_PAYMENT_METHOD || 'VC',
    merchantOrderId,
    productDetails: 'KaffePOS Duitku Sandbox Smoke',
    customerVaName: 'KaffePOS Smoke',
    email: env.DUITKU_SMOKE_EMAIL || 'smoke@kaffepos.local',
    callbackUrl: env.DUITKU_CALLBACK_URL,
    returnUrl: env.DUITKU_RETURN_URL,
    expiryPeriod: Number(env.DUITKU_EXPIRY_PERIOD_MINUTES || 60),
    signature: hmacSha256(`${env.DUITKU_MERCHANT_CODE}${merchantOrderId}${paymentAmount}`, env.DUITKU_MERCHANT_KEY),
  };

  const response = await fetch(`${baseUrl}/webapi/api/merchant/v2/inquiry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(async () => ({ message: await response.text().catch(() => '') }));
  const paymentUrl = body.paymentUrl || body.payment_url;
  if (!response.ok || !paymentUrl) {
    console.error(`Duitku sandbox smoke failed: http=${response.status} paymentUrl=${paymentUrl ? 'present' : 'missing'} merchantOrderId=${merchantOrderId}`);
    process.exit(1);
  }
  console.log(`Duitku sandbox smoke passed: merchantOrderId=${merchantOrderId} paymentUrl=present`);
}

main().catch((error) => {
  console.error(`Duitku sandbox smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
