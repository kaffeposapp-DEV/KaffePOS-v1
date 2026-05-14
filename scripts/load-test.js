#!/usr/bin/env node
/**
 * KaffePOS basic load testing script
 * Scenarios: concurrent checkouts, API response times, database query performance
 *
 * Usage:
 *   BACKEND_URL=http://localhost:8787 AUTH_TOKEN=... STORE_ID=... MENU_ITEM_ID=... node scripts/load-test.js
 */

const { performance } = require('node:perf_hooks');

const config = {
  baseUrl: process.env.BACKEND_URL || 'http://localhost:8787',
  authToken: process.env.AUTH_TOKEN || process.env.TEST_AUTH_TOKEN || '',
  storeId: process.env.STORE_ID || process.env.TEST_STORE_ID || '',
  menuItemId: process.env.MENU_ITEM_ID || process.env.TEST_MENU_ITEM_ID || '',
  concurrency: Number(process.env.CONCURRENCY || 10),
  iterations: Number(process.env.ITERATIONS || 50),
  timeoutMs: Number(process.env.TIMEOUT_MS || 10000),
};

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function summarize(name, results) {
  const durations = results.map((r) => r.durationMs);
  const failures = results.filter((r) => !r.ok);
  const statusCounts = results.reduce((acc, r) => {
    acc[r.status || 'ERR'] = (acc[r.status || 'ERR'] || 0) + 1;
    return acc;
  }, {});

  return {
    name,
    requests: results.length,
    success: results.length - failures.length,
    failures: failures.length,
    failureRate: results.length ? Number(((failures.length / results.length) * 100).toFixed(2)) : 0,
    minMs: Math.round(Math.min(...durations)),
    avgMs: Math.round(durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length)),
    p50Ms: Math.round(percentile(durations, 50)),
    p95Ms: Math.round(percentile(durations, 95)),
    p99Ms: Math.round(percentile(durations, 99)),
    maxMs: Math.round(Math.max(...durations)),
    statusCounts,
  };
}

async function request(method, path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const started = performance.now();

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const durationMs = performance.now() - started;
    return {
      ok: response.ok,
      status: response.status,
      durationMs,
      body: text,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'ERR',
      durationMs: performance.now() - started,
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runConcurrent(name, taskFactory, total, concurrency) {
  const results = [];
  let next = 0;

  async function worker() {
    while (next < total) {
      const index = next++;
      results.push(await taskFactory(index));
    }
  }

  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const summary = summarize(name, results);
  summary.totalWallMs = Math.round(performance.now() - started);
  summary.requestsPerSecond = Number((results.length / (summary.totalWallMs / 1000)).toFixed(2));
  return summary;
}

async function checkoutTask(index) {
  if (!config.storeId || !config.menuItemId) {
    return {
      ok: false,
      status: 'CONFIG',
      durationMs: 0,
      error: 'STORE_ID and MENU_ITEM_ID required for checkout load test',
    };
  }

  return request('POST', '/api/transactions', {
    store_id: config.storeId,
    items: [{ menu_item_id: config.menuItemId, qty: 1, note: `load-test-${index}` }],
    payment_method: 'cash',
    discount_amount: 0,
  });
}

async function responseTimeTask(index) {
  const endpoints = [
    `/api/inventory?store_id=${encodeURIComponent(config.storeId)}`,
    `/api/transactions?store_id=${encodeURIComponent(config.storeId)}&limit=20`,
    '/health',
  ];
  const endpoint = endpoints[index % endpoints.length];
  return request('GET', endpoint);
}

async function dbPerformanceTask(index) {
  const endpoints = [
    `/api/transactions?store_id=${encodeURIComponent(config.storeId)}&limit=50&offset=${(index % 5) * 10}`,
    `/api/inventory?store_id=${encodeURIComponent(config.storeId)}`,
  ];
  return request('GET', endpoints[index % endpoints.length]);
}

function printSummary(summary) {
  console.log(`\n=== ${summary.name} ===`);
  console.table({
    requests: summary.requests,
    success: summary.success,
    failures: summary.failures,
    failureRate: `${summary.failureRate}%`,
    rps: summary.requestsPerSecond,
    minMs: summary.minMs,
    avgMs: summary.avgMs,
    p50Ms: summary.p50Ms,
    p95Ms: summary.p95Ms,
    p99Ms: summary.p99Ms,
    maxMs: summary.maxMs,
    wallMs: summary.totalWallMs,
  });
  console.log('Status counts:', summary.statusCounts);
}

async function main() {
  console.log('KaffePOS load test starting');
  console.log({
    baseUrl: config.baseUrl,
    concurrency: config.concurrency,
    iterations: config.iterations,
    hasAuthToken: Boolean(config.authToken),
    hasStoreId: Boolean(config.storeId),
    hasMenuItemId: Boolean(config.menuItemId),
  });

  const health = await request('GET', '/health');
  if (!health.ok) {
    console.error('Backend health check failed:', health.status, health.body || health.error);
    process.exit(1);
  }

  const responseSummary = await runConcurrent(
    'API response times',
    responseTimeTask,
    config.iterations,
    config.concurrency
  );
  printSummary(responseSummary);

  const dbSummary = await runConcurrent(
    'Database query performance',
    dbPerformanceTask,
    config.iterations,
    config.concurrency
  );
  printSummary(dbSummary);

  const checkoutSummary = await runConcurrent(
    'Concurrent checkouts',
    checkoutTask,
    config.iterations,
    config.concurrency
  );
  printSummary(checkoutSummary);

  const failed = [responseSummary, dbSummary, checkoutSummary].filter((summary) => summary.failureRate > Number(process.env.MAX_FAILURE_RATE || 5));
  if (failed.length) {
    console.error('\nLoad test failed thresholds:', failed.map((s) => `${s.name}: ${s.failureRate}% failures`).join(', '));
    process.exit(1);
  }

  console.log('\nLoad test completed successfully');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
