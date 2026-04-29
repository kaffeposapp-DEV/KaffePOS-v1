#!/usr/bin/env node

const webBase = process.env.WEB_BASE_URL || 'https://kaffepos.my.id';
const apiBase = process.env.API_BASE_URL || 'https://api.kaffepos.my.id';

const fail = (message) => {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
};

const pass = (message) => {
  console.log(`[OK] ${message}`);
};

const warn = (message) => {
  console.warn(`[WARN] ${message}`);
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
};

try {
  const webResponse = await fetch(webBase, {
    method: 'HEAD',
    signal: AbortSignal.timeout(10_000),
  });

  if (webResponse.ok) {
    pass(`Web reachable: ${webBase}`);
  } else {
    fail(`Web returned ${webResponse.status} at ${webBase}`);
  }
} catch (error) {
  fail(`Web unreachable at ${webBase}: ${error instanceof Error ? error.message : String(error)}`);
}

let health;
try {
  health = await fetchJson(`${apiBase}/health`);
  if (health.ok && health.checks?.database?.ok) {
    pass('API health and database check are OK');
  } else {
    fail('API health or database check is not OK');
  }
} catch (error) {
  fail(`API health failed: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const status = await fetchJson(`${apiBase}/system-status`);
  const payment = status.checks?.payment;

  if (status.ok) {
    pass('System status endpoint is OK');
  } else {
    fail('System status endpoint reports not OK');
  }

  if (payment?.environment === 'production' && payment?.commerciallyReady === true) {
    pass('Midtrans is production and commercially ready');
  } else {
    fail(
      `Midtrans is not production-ready (environment=${payment?.environment ?? 'unknown'}, mode=${
        payment?.mode ?? 'unknown'
      }, commerciallyReady=${String(payment?.commerciallyReady)})`,
    );
  }

  if (status.syncMatrix?.subscription_payments === true) {
    pass('Subscription payment sync is enabled');
  } else {
    fail('Subscription payment sync is not enabled');
  }

  for (const message of status.warnings || []) {
    warn(message);
  }
} catch (error) {
  fail(`System status failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (process.exitCode) {
  console.error('Production readiness smoke test failed.');
} else {
  console.log('Production readiness smoke test passed.');
}
