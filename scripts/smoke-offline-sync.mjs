#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { assertMinimalStagingTarget, loadStagingEnvFiles } from './lib/staging-env.mjs';

loadStagingEnvFiles();
assertMinimalStagingTarget();

if (!process.env.KAFFEPOS_SMOKE_EMAIL && process.env.KAFFEPOS_OWNER_EMAIL) {
  process.env.KAFFEPOS_SMOKE_EMAIL = process.env.KAFFEPOS_OWNER_EMAIL;
}
if (!process.env.KAFFEPOS_SMOKE_PASSWORD && process.env.KAFFEPOS_OWNER_PASSWORD) {
  process.env.KAFFEPOS_SMOKE_PASSWORD = process.env.KAFFEPOS_OWNER_PASSWORD;
}
if (!process.env.KAFFEPOS_SMOKE_CONFIRM && process.env.KAFFEPOS_STOCK_SMOKE_CONFIRM === '1') {
  process.env.KAFFEPOS_SMOKE_CONFIRM = 'YES';
}

const required = [
  'KAFFEPOS_STAGING_API_URL',
  'KAFFEPOS_SMOKE_EMAIL',
  'KAFFEPOS_SMOKE_PASSWORD',
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`[offline-smoke] Missing ${key}`);
    process.exit(1);
  }
}

if (process.env.KAFFEPOS_SMOKE_CONFIRM !== 'YES') {
  console.error('[offline-smoke] Set KAFFEPOS_SMOKE_CONFIRM=YES to run against staging.');
  process.exit(1);
}

const apiBase = process.env.KAFFEPOS_STAGING_API_URL.replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed ${response.status}: ${body?.message ?? text}`);
  }
  return { response, body };
}

const login = await request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({
    email: process.env.KAFFEPOS_SMOKE_EMAIL,
    password: process.env.KAFFEPOS_SMOKE_PASSWORD,
  }),
});

const token = login.body?.accessToken;
if (!token) throw new Error('Login smoke berhasil tapi accessToken kosong.');

const authHeaders = { authorization: `Bearer ${token}` };
const stores = await request('/api/stores', { headers: authHeaders });
const storeId = process.env.KAFFEPOS_SMOKE_STORE_ID || stores.body?.items?.[0]?.id;
if (!storeId) throw new Error('Tidak ada store/outlet untuk smoke test.');

const transactionId = randomUUID();
const payload = {
  id: transactionId,
  store_id: storeId,
  date: new Date().toISOString(),
  items: [
    {
      name: 'Smoke Offline Item',
      qty: 1,
      price: 1000,
      subtotal: 1000,
      note: 'offline sync staging smoke',
    },
  ],
  subtotal: 1000,
  discount: 0,
  tax: 0,
  total: 1000,
  cogs: 0,
  paid: 1000,
  change: 0,
  method: 'Tunai',
  cashier: 'Offline Smoke',
  is_void: false,
  note: 'offline-sync-smoke',
};

const first = await request('/api/transactions/checkout', {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify(payload),
});
const second = await request('/api/transactions/checkout', {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify(payload),
});

if (first.response.status !== 201) {
  throw new Error(`Checkout pertama harus create 201, dapat ${first.response.status}`);
}
if (second.response.status !== 200) {
  throw new Error(`Replay checkout harus idempotent 200, dapat ${second.response.status}`);
}
if (first.body?.id !== transactionId || second.body?.id !== transactionId) {
  throw new Error('ID transaksi replay tidak konsisten.');
}

const transactions = await request(`/api/transactions?storeId=${encodeURIComponent(storeId)}`, {
  headers: authHeaders,
});
const count = (transactions.body?.items ?? []).filter((entry) => entry.id === transactionId).length;
if (count !== 1) {
  throw new Error(`Expected exactly one replayed transaction in PostgreSQL, got ${count}.`);
}

console.log(JSON.stringify({
  ok: true,
  scenario: 'offline-reconnect-idempotent-replay',
  apiBase,
  storeId,
  transactionId,
  firstStatus: first.response.status,
  replayStatus: second.response.status,
}, null, 2));
