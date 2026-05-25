#!/usr/bin/env node
import { assertMinimalStagingTarget, loadStagingEnvFiles, resolveStagingApiBase } from './lib/staging-env.mjs';

loadStagingEnvFiles();
assertMinimalStagingTarget();

const apiBaseUrl = resolveStagingApiBase();
const ownerEmail = requireEnv('KAFFEPOS_OWNER_EMAIL');
const ownerPassword = requireEnv('KAFFEPOS_OWNER_PASSWORD');
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const cashierEmail = process.env.KAFFEPOS_TEST_CASHIER_EMAIL || process.env.KAFFEPOS_CASHIER_EMAIL || deriveSmokeEmail(ownerEmail, runId);
const cashierPassword = process.env.KAFFEPOS_TEST_CASHIER_PASSWORD || process.env.KAFFEPOS_CASHIER_PASSWORD || `SmokeKasir-${runId}`;
const secondOutletName = process.env.KAFFEPOS_SECOND_OUTLET_NAME || `Smoke Outlet ${runId}`;

const summary = [];

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} wajib diisi untuk smoke test staging.`);
  }
  return value;
}

function deriveSmokeEmail(email, suffix) {
  const [local, domain] = email.split('@');
  if (!local || !domain) {
    throw new Error('KAFFEPOS_OWNER_EMAIL harus berupa email valid agar email kasir smoke bisa dibuat.');
  }
  return `${local}+cashier-smoke-${suffix}@${domain}`;
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '[email hidden]';
  return `${local.slice(0, 2)}***@${domain}`;
}

function pass(label) {
  summary.push(`PASS ${label}`);
  console.log(`PASS ${label}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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
  });

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (options.expectStatus) {
    assert(
      options.expectStatus.includes(response.status),
      `${path} expected status ${options.expectStatus.join('/')} but got ${response.status}: ${data?.message || text}`,
    );
    return { status: response.status, data };
  }

  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${data?.message || text || response.statusText}`);
  }

  return data;
}

async function login(email, password) {
  return request('/api/auth/login', {
    method: 'POST',
    json: { email, password },
  });
}

async function main() {
  console.log(`KaffePOS owner/cashier staging smoke test`);
  console.log(`API: ${apiBaseUrl}`);
  console.log(`Owner: ${maskEmail(ownerEmail)}`);
  console.log(`Cashier: ${maskEmail(cashierEmail)}`);

  const status = await request('/system-status');
  assert(status?.ok === true, 'System status tidak OK.');
  assert(status?.checks?.database?.ok === true, 'Database staging belum sehat menurut /system-status.');
  pass('frontend/backend dependency target reachable via API health');

  const ownerSession = await login(ownerEmail, ownerPassword);
  const ownerToken = ownerSession.accessToken;
  assert(ownerSession.profile?.role === 'owner_admin', 'Akun owner smoke harus role owner_admin.');
  pass('owner/admin login');

  let stores = await request('/api/stores', { token: ownerToken });
  let firstStore = stores.items?.[0] || null;
  if (!firstStore) {
    firstStore = await request('/api/stores', {
      method: 'POST',
      token: ownerToken,
      json: { store_name: `Smoke Main Outlet ${runId}` },
    });
  }
  assert(firstStore?.id, 'Outlet utama untuk owner tidak tersedia.');

  const secondStore = await request('/api/stores', {
    method: 'POST',
    token: ownerToken,
    json: { store_name: secondOutletName },
  });
  assert(secondStore?.id, 'Outlet kedua untuk test pindah outlet gagal dibuat.');
  pass('owner outlet setup');

  const created = await request('/api/cashiers', {
    method: 'POST',
    token: ownerToken,
    json: {
      displayName: `Smoke Kasir ${runId}`,
      email: cashierEmail,
      password: cashierPassword,
      storeId: firstStore.id,
      status: 'active',
    },
  });
  const cashier = created.cashier;
  assert(cashier?.id, 'Create cashier tidak mengembalikan id.');
  assert(cashier.role === 'cashier', 'Kasir yang dibuat tidak role cashier.');
  assert(cashier.status === 'active', 'Kasir baru tidak aktif.');
  assert(cashier.store_id === firstStore.id, 'Assignment outlet kasir baru tidak sesuai.');
  pass('owner creates cashier with active outlet assignment');

  const listAfterCreate = await request('/api/cashiers', { token: ownerToken });
  assert(
    listAfterCreate.items?.some((item) => item.id === cashier.id && item.store_id === firstStore.id),
    'List kasir owner tidak refresh/sinkron setelah create.',
  );
  pass('cashier list reflects created cashier');

  const cashierSession = await login(cashierEmail, cashierPassword);
  let cashierToken = cashierSession.accessToken;
  assert(cashierSession.profile?.role === 'cashier', 'Login kasir tidak memuat role cashier.');
  assert(cashierSession.profile?.assigned_store_id === firstStore.id, 'Login kasir tidak memuat outlet assignment awal.');
  assert(cashierSession.profile?.assignment_status === 'active', 'Assignment kasir tidak aktif saat login.');
  pass('cashier login bootstrap includes role and outlet');

  const cashierStores = await request('/api/stores', { token: cashierToken });
  assert(cashierStores.items?.length === 1, 'Kasir harus hanya melihat satu outlet assignment aktif.');
  assert(cashierStores.items[0].id === firstStore.id, 'Kasir melihat outlet yang tidak sesuai assignment awal.');
  pass('cashier store visibility restricted to assigned outlet');

  await request('/api/subscriptions', { token: cashierToken, expectStatus: [403] });
  await request('/api/cashiers', { token: cashierToken, expectStatus: [403] });
  pass('cashier is blocked from billing and user management APIs');

  const moved = await request(`/api/cashiers/${cashier.id}`, {
    method: 'PATCH',
    token: ownerToken,
    json: { storeId: secondStore.id, status: 'active' },
  });
  assert(moved.cashier?.store_id === secondStore.id, 'Update cashier tidak menyimpan outlet baru.');
  pass('owner reassigns cashier outlet');

  const sessionAfterMove = await request('/api/auth/session', { token: cashierToken });
  assert(sessionAfterMove.profile?.assigned_store_id === secondStore.id, 'Session kasir tidak membaca outlet baru setelah reassignment.');
  const storesAfterMove = await request('/api/stores', { token: cashierToken });
  assert(storesAfterMove.items?.length === 1, 'Kasir setelah pindah outlet tetap harus hanya melihat satu outlet.');
  assert(storesAfterMove.items[0].id === secondStore.id, 'Kasir masih melihat outlet lama setelah reassignment.');
  pass('existing cashier session reflects reassigned outlet through backend');

  const cashierRelogin = await login(cashierEmail, cashierPassword);
  cashierToken = cashierRelogin.accessToken;
  assert(cashierRelogin.profile?.assigned_store_id === secondStore.id, 'Login ulang kasir tidak memuat outlet baru.');
  pass('cashier relogin reflects reassigned outlet');

  const deactivated = await request(`/api/cashiers/${cashier.id}`, {
    method: 'PATCH',
    token: ownerToken,
    json: { status: 'inactive' },
  });
  assert(deactivated.cashier?.status === 'inactive', 'Deactivate cashier tidak mengembalikan status inactive.');
  pass('owner deactivates cashier');

  await request('/api/auth/login', {
    method: 'POST',
    json: { email: cashierEmail, password: cashierPassword },
    expectStatus: [403],
  });
  await request('/api/auth/session', { token: cashierToken, expectStatus: [401, 403] });
  pass('inactive cashier cannot login and existing session is rejected');

  console.log('\nSmoke test selesai.');
  console.log(summary.join('\n'));
}

main().catch((error) => {
  console.error('\nSmoke test gagal.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
