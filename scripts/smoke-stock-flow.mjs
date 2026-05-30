#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { assertMinimalStagingTarget, loadStagingEnvFiles, resolveStagingApiBase } from './lib/staging-env.mjs';

loadStagingEnvFiles();
assertMinimalStagingTarget();

const apiBaseUrl = resolveStagingApiBase();
const confirmed = process.env.KAFFEPOS_STOCK_SMOKE_CONFIRM === '1';
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const summary = [];

if (!confirmed) {
  throw new Error('Set KAFFEPOS_STOCK_SMOKE_CONFIRM=1 agar smoke test yang menulis data staging ini bisa dijalankan.');
}

const ownerEmail = requireEnv('KAFFEPOS_OWNER_EMAIL');
const ownerPassword = requireEnv('KAFFEPOS_OWNER_PASSWORD');

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} wajib diisi untuk smoke test stok staging.`);
  }
  return value;
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

  const text = await response.text();
  let data = null;
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

async function login(email, password, path = '/api/auth/login') {
  return request(path, {
    method: 'POST',
    json: { email, password },
  });
}

function findByName(items, name) {
  return (items || []).find((item) => String(item.name || '').toLowerCase() === name.toLowerCase()) || null;
}

async function main() {
  console.log('KaffePOS stock staging smoke test');
  console.log(`API: ${apiBaseUrl}`);
  console.log(`Owner: ${maskEmail(ownerEmail)}`);

  const status = await request('/system-status');
  assert(status?.ok === true, 'System status tidak OK.');
  assert(status?.checks?.database?.ok === true, 'Database staging belum sehat menurut /system-status.');
  pass('API and PostgreSQL health');

  const ownerSession = await login(ownerEmail, ownerPassword, '/api/v1/auth/login');
  const ownerToken = ownerSession.accessToken;
  assert(ownerSession.profile?.role === 'owner_admin', 'Akun smoke harus role owner_admin.');
  pass('owner/admin login through API v1 auth alias');

  const stores = await request('/api/stores', { token: ownerToken });
  const store = stores.items?.[0] || null;
  assert(store?.id, 'Owner smoke membutuhkan minimal satu outlet/store.');
  pass('store scope available');

  const ingredientName = `Smoke Bahan ${runId}`;
  const productName = `Smoke Produk ${runId}`;
  const transactionId = randomUUID();
  const importRows = [
    { rowNumber: 2, kind: 'ingredient', name: ingredientName, stock: 1000, base_unit: 'gram', purchase_unit: 'kg', total_cost: 20000, min_stock: 50, sku: `SMK-${runId}` },
    { rowNumber: 3, kind: 'product', name: productName, price: 15000, category: 'Smoke' },
    { rowNumber: 4, kind: 'conversion', ingredient_name: ingredientName, from_unit: 'kg', to_unit: 'gram', ratio: 1000 },
    { rowNumber: 5, kind: 'recipe', product_name: productName, ingredient_name: ingredientName, qty_per_serving: 125, unit_reference: 'gram' },
  ];

  const importResult = await request('/api/inventory/bulk-import/commit', {
    method: 'POST',
    token: ownerToken,
    json: {
      store_id: store.id,
      mode: 'upsert',
      rows: importRows,
    },
  });
  assert(importResult?.committed?.ingredients === 1, 'Import staging tidak commit bahan.');
  assert(importResult?.committed?.products === 1, 'Import staging tidak commit produk.');
  assert(importResult?.committed?.recipes === 1, 'Import staging tidak commit resep.');
  pass('transactional stock bulk import');

  let inventory = await request(`/api/inventory?storeId=${encodeURIComponent(store.id)}`, { token: ownerToken });
  let menu = await request(`/api/menu-items?storeId=${encodeURIComponent(store.id)}`, { token: ownerToken });
  const conversions = await request(`/api/inventory/conversions?storeId=${encodeURIComponent(store.id)}`, { token: ownerToken });
  const ingredient = findByName(inventory.items, ingredientName);
  assert(ingredient?.id, 'Bahan hasil import tidak ditemukan di inventory.');
  let product = findByName(menu.items, productName);
  if (!product?.id) {
    product = await request('/api/menu-items', {
      method: 'POST',
      token: ownerToken,
      json: {
        store_id: store.id,
        name: productName,
        price: 15000,
        category: 'Smoke',
        is_available: true,
        recipe: [{ matId: ingredient.id, qty: 125, unit_reference: 'gram' }],
      },
    });
    menu = await request(`/api/menu-items?storeId=${encodeURIComponent(store.id)}`, { token: ownerToken });
  }
  assert(product?.id, 'Produk hasil import tidak ditemukan di menu.');
  assert(Number(ingredient.stock) === 1000, `Stock awal tidak sesuai, dapat ${ingredient?.stock}.`);
  assert((product.recipe || []).some((line) => line.matId === ingredient.id && Number(line.qty) === 125), 'Recipe hasil import tidak tersimpan pada produk.');
  assert((conversions.items || []).some((item) => item.ingredient_id === ingredient.id && item.from_unit === 'kg' && item.to_unit === 'gram'), 'Konversi satuan hasil import tidak ditemukan.');
  pass('imported ingredient/product/conversion/recipe visible through API');

  const checkoutPayload = {
    id: transactionId,
    date: new Date().toISOString(),
    items: [
      {
        name: product.name,
        qty: 2,
        price: Number(product.price),
        subtotal: Number(product.price) * 2,
        menu_item_id: product.id,
        station: 'kitchen',
      },
    ],
    subtotal: Number(product.price) * 2,
    discount: 0,
    tax: 0,
    total: Number(product.price) * 2,
    paid: Number(product.price) * 2,
    change: 0,
    method: 'Tunai',
    cashier: 'Stock Smoke',
    source: 'web',
    store_id: store.id,
  };

  await request('/api/transactions/checkout', {
    method: 'POST',
    token: ownerToken,
    json: checkoutPayload,
  });
  const transactions = await request(`/api/transactions?storeId=${encodeURIComponent(store.id)}&limit=5`, {
    token: ownerToken,
  });
  assert(
    (transactions.items || []).some((entry) => entry.id === transactionId),
    'API transactions tidak menampilkan transaksi smoke.',
  );
  assert(transactions.pagination?.limit === 5, 'API transactions tidak membawa pagination metadata.');
  pass('protected transaction list and pagination');

  inventory = await request(`/api/inventory?storeId=${encodeURIComponent(store.id)}`, { token: ownerToken });
  let stockAfterCheckout = Number(findByName(inventory.items, ingredientName)?.stock);
  assert(stockAfterCheckout === 750, `Checkout harus memotong stok menjadi 750, dapat ${stockAfterCheckout}.`);
  pass('checkout deducts recipe stock once');

  await request('/api/transactions/checkout', {
    method: 'POST',
    token: ownerToken,
    json: checkoutPayload,
  });
  inventory = await request(`/api/inventory?storeId=${encodeURIComponent(store.id)}`, { token: ownerToken });
  stockAfterCheckout = Number(findByName(inventory.items, ingredientName)?.stock);
  assert(stockAfterCheckout === 750, `Replay checkout idempotent tidak boleh memotong ulang stok, dapat ${stockAfterCheckout}.`);
  pass('duplicate checkout replay is idempotent for stock deduction');

  await request(`/api/transactions/${transactionId}/void`, {
    method: 'POST',
    token: ownerToken,
    json: {
      store_id: store.id,
      reason: 'Staging stock smoke cleanup',
      void_by: 'Stock Smoke',
    },
  });
  inventory = await request(`/api/inventory?storeId=${encodeURIComponent(store.id)}`, { token: ownerToken });
  const stockAfterVoid = Number(findByName(inventory.items, ingredientName)?.stock);
  assert(stockAfterVoid === 1000, `Void smoke harus restore stok menjadi 1000, dapat ${stockAfterVoid}.`);
  pass('void restores stock after smoke checkout');

  const countedStock = 930;
  await request('/api/inventory/adjustments', {
    method: 'POST',
    token: ownerToken,
    json: {
      store_id: store.id,
      inventory_id: ingredient.id,
      counted_stock: countedStock,
      reason: 'Opname smoke staging',
      note: `run ${runId}`,
    },
  });
  inventory = await request(`/api/inventory?storeId=${encodeURIComponent(store.id)}`, { token: ownerToken });
  const stockAfterOpname = Number(findByName(inventory.items, ingredientName)?.stock);
  assert(stockAfterOpname === countedStock, `Opname smoke harus menyimpan stok ${countedStock}, dapat ${stockAfterOpname}.`);
  pass('stock opname adjustment persists through API');

  assert(findByName(inventory.items, ingredientName)?.id === ingredient.id, 'Bahan smoke hilang setelah checkout/void.');
  pass('final stock state remains readable');

  console.log('\nSmoke test stok selesai.');
  console.log(summary.join('\n'));
}

main().catch((error) => {
  console.error('\nSmoke test stok gagal.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
