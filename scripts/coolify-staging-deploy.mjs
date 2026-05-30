#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const COOLIFY_EXAMPLE = '.env.coolify.example';
const COOLIFY_LOCAL = '.env.coolify.local';
const STAGING_ENV_FILES = ['.env.staging.local', 'backend/.env.staging.local'];
const REPORT_PATH = 'docs/engineering/COOLIFY_STAGING_AUTOMATION_REPORT.md';
const FINAL_REPORT_PATH = 'docs/engineering/FINAL_STAGING_EXECUTION_REPORT.md';
const STAGING_SMOKE_REPORT = 'docs/engineering/STAGING_SMOKE_REPORT.md';
const PRODUCTION_CHECKLIST = 'docs/engineering/PRODUCTION_READINESS_CHECKLIST.md';
const CHANGELOG = 'docs/product/CHANGELOG_PRODUCT.md';

const BACKEND_KEYS = [
  'NODE_ENV',
  'WEB_BASE_URL',
  'API_BASE_URL',
  'DATABASE_URL',
  'JWT_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'MIDTRANS_IS_PRODUCTION',
  'MIDTRANS_SERVER_KEY',
  'MIDTRANS_CLIENT_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'EMAIL_REPLY_TO',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_BUCKET',
  'CLOUDFLARE_R2_PUBLIC_URL',
  'GA4_MEASUREMENT_ID',
  'GA4_API_SECRET',
  'AFFILIATE_REFERRAL_ENABLED',
  'REFERRAL_ENABLED',
  'AFFILIATE_ENABLED',
  'ADMIN_COMMISSION_ENABLED',
  'REFERRAL_COMMISSION_CREATION_ENABLED',
];

const MINIMAL_BACKEND_KEYS = [
  'NODE_ENV',
  'STAGING_PROFILE',
  'WEB_BASE_URL',
  'API_BASE_URL',
  'DATABASE_URL',
  'JWT_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'STAGING_REPAIR_TOKEN',
  'PAYMENT_INTEGRATION_ENABLED',
  'EMAIL_INTEGRATION_ENABLED',
  'R2_STORAGE_ENABLED',
  'ANALYTICS_SERVER_ENABLED',
];

const PAYMENT_BACKEND_KEYS = [
  'NODE_ENV',
  'STAGING_PROFILE',
  'WEB_BASE_URL',
  'API_BASE_URL',
  'DATABASE_URL',
  'JWT_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'PAYMENT_GATEWAY_PROVIDER',
  'PAYMENT_INTEGRATION_ENABLED',
  'DUITKU_ENVIRONMENT',
  'DUITKU_MERCHANT_CODE',
  'DUITKU_MERCHANT_KEY',
  'DUITKU_SANDBOX_BASE_URL',
  'DUITKU_PRODUCTION_BASE_URL',
  'DUITKU_CALLBACK_URL',
  'DUITKU_RETURN_URL',
  'DUITKU_SUCCESS_URL',
  'DUITKU_PENDING_URL',
  'DUITKU_FAILED_URL',
  'DUITKU_EXPIRY_PERIOD_MINUTES',
  'DUITKU_DEFAULT_PAYMENT_METHOD',
  'SUBSCRIPTION_PAYMENT_MODE',
  'MIDTRANS_SNAP_ENABLED',
];

const FRONTEND_KEYS = [
  'VITE_APP_ENV',
  'VITE_API_BASE_URL',
  'VITE_ANALYTICS_ENABLED',
  'VITE_GA4_MEASUREMENT_ID',
  'VITE_CLARITY_PROJECT_ID',
  'VITE_PUBLIC_ASSET_BASE_URL',
  'VITE_MIDTRANS_IS_PRODUCTION',
  'VITE_MIDTRANS_CLIENT_KEY',
  'VITE_AFFILIATE_REFERRAL_ENABLED',
  'VITE_REFERRAL_ENABLED',
  'VITE_AFFILIATE_ENABLED',
  'VITE_ADMIN_COMMISSION_ENABLED',
];

const MINIMAL_FRONTEND_KEYS = [
  'VITE_APP_ENV',
  'VITE_STAGING_PROFILE',
  'VITE_API_BASE_URL',
  'VITE_ANALYTICS_ENABLED',
  'VITE_MIDTRANS_IS_PRODUCTION',
];

const PAYMENT_FRONTEND_KEYS = [
  'VITE_APP_ENV',
  'VITE_STAGING_PROFILE',
  'VITE_API_BASE_URL',
  'VITE_ANALYTICS_ENABLED',
  'VITE_PAYMENT_GATEWAY_PROVIDER',
];

const MINIMAL_PROVIDER_SKIPPED = [
  'VITE_GA4_MEASUREMENT_ID',
  'VITE_CLARITY_PROJECT_ID',
  'VITE_PUBLIC_ASSET_BASE_URL',
  'VITE_MIDTRANS_CLIENT_KEY',
  'MIDTRANS_SERVER_KEY',
  'MIDTRANS_CLIENT_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'EMAIL_REPLY_TO',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_PUBLIC_URL',
  'GA4_MEASUREMENT_ID',
  'GA4_API_SECRET',
];

const SMOKE_ONLY_KEYS = [
  'KAFFEPOS_STAGING_API_URL',
  'KAFFEPOS_STAGING_FRONTEND_URL',
  'KAFFEPOS_OWNER_EMAIL',
  'KAFFEPOS_OWNER_PASSWORD',
  'KAFFEPOS_TEST_CASHIER_EMAIL',
  'KAFFEPOS_TEST_CASHIER_PASSWORD',
  'KAFFEPOS_TEST_EMAIL_TO',
  'KAFFEPOS_STOCK_SMOKE_CONFIRM',
];

const COOLIFY_REQUIRED = [
  'COOLIFY_URL',
  'COOLIFY_TOKEN',
  'COOLIFY_STAGING_FRONTEND_UUID',
  'COOLIFY_STAGING_BACKEND_UUID',
];

const OPTIONAL_COOLIFY = [
  'COOLIFY_STAGING_POSTGRES_UUID',
  'COOLIFY_STAGING_PROJECT_UUID',
  'COOLIFY_STAGING_SERVER_UUID',
  'COOLIFY_STAGING_ENVIRONMENT_UUID',
  'COOLIFY_DEPLOY_FORCE',
];

const PLACEHOLDER_PATTERNS = [
  /^change-me$/i,
  /change[_-]?me/i,
  /example\.com/i,
  /placeholder/i,
  /^x+$/i,
];

const QUALITY_COMMANDS = [
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'lint']],
  ['npm', ['run', 'test']],
  ['npm', ['run', 'build']],
  ['npm', ['--prefix', 'backend', 'run', 'check']],
  ['npm', ['run', 'release:verify-config']],
  ['npx', ['-y', 'react-doctor@latest', '--verbose', '--full']],
  ['npx', ['-y', 'react-doctor@0.2.3', '--verbose', '--diff']],
];

const SMOKE_COMMANDS = [
  ['npm', ['run', 'smoke:staging:cashier']],
  ['npm', ['run', 'smoke:staging:offline-sync']],
  ['npm', ['run', 'smoke:staging:stock'], { KAFFEPOS_STOCK_SMOKE_CONFIRM: '1' }],
];

const PAYMENT_SMOKE_COMMANDS = [
  ['npm', ['run', 'smoke:staging:duitku']],
];

const EXTERNAL_CHECKS = [
  { name: 'Midtrans sandbox', candidates: ['scripts/smoke-midtrans-staging.mjs', 'scripts/smoke-staging-midtrans.mjs'] },
  { name: 'Resend staging', candidates: ['scripts/smoke-resend-staging.mjs', 'scripts/smoke-staging-resend.mjs'] },
  { name: 'Cloudflare/R2 staging', candidates: ['scripts/smoke-r2-staging.mjs', 'scripts/smoke-staging-r2.mjs'] },
  { name: 'GA4/Clarity staging', candidates: ['scripts/smoke-analytics-staging.mjs', 'scripts/smoke-staging-analytics.mjs'] },
  { name: 'Backup/restore drill', candidates: ['scripts/smoke-backup-restore-staging.mjs', 'scripts/smoke-staging-backup-restore.mjs'] },
];

const flags = new Set(process.argv.slice(2));
const debugApi = flags.has('--debug-api');
const commandLog = [];
const result = {
  status: 'UNKNOWN',
  coolifyConnection: 'not checked',
  envVerifier: null,
  coolifyConfig: null,
  envSync: [],
  deployment: [],
  health: [],
  smoke: [],
  manualChecks: [],
  blockers: [],
  commands: commandLog,
};

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

function loadEnv(files) {
  return Object.assign({}, ...files.map(parseEnvFile));
}

function hasPlaceholder(value) {
  return typeof value !== 'string' || value.trim().length === 0 || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

function run(command, args, options = {}) {
  const label = [command, ...args].join(' ');
  console.log(`RUN ${label}`);
  const processResult = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  commandLog.push({ command: label, status: processResult.status === 0 ? 'PASS' : 'FAIL' });
  return processResult;
}

function gitEnvSafety() {
  const files = [...STAGING_ENV_FILES, COOLIFY_LOCAL];
  const checks = files.map((file) => {
    const ignored = spawnSync('git', ['check-ignore', '-q', file], { cwd: process.cwd() }).status === 0;
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', file], { cwd: process.cwd(), stdio: 'ignore' }).status === 0;
    return { file, ignored, tracked };
  });
  commandLog.push({ command: 'git env safety check', status: checks.every((item) => item.ignored && !item.tracked) ? 'PASS' : 'FAIL' });
  return checks;
}

function initCoolifyLocal(force = false) {
  if (!fs.existsSync(COOLIFY_EXAMPLE)) throw new Error(`${COOLIFY_EXAMPLE} missing`);
  if (fs.existsSync(COOLIFY_LOCAL) && !force) {
    console.log(`${COOLIFY_LOCAL} exists; not overwritten`);
    return;
  }
  fs.copyFileSync(COOLIFY_EXAMPLE, COOLIFY_LOCAL);
  console.log(`${COOLIFY_LOCAL} ${force ? 'recreated' : 'created'} from ${COOLIFY_EXAMPLE}`);
}

function parseVerifierOutput(text) {
  const failed = text.match(/Staging env verification failed: missing=(\d+), placeholders=(\d+), forbiddenFrontend=(\d+), invalid=(\d+)/);
  const profile = text.match(/Staging profile:\s*(\w+)/)?.[1] || 'full';
  const placeholderBlock = text.match(/Placeholder values detected:\n([\s\S]*?)(?:\n\n|$)/);
  const skippedBlock = text.match(/Optional provider keys skipped in minimal staging:\n([\s\S]*?)(?:\n\n|$)/) || text.match(/Optional integration keys skipped unless enabled in payment staging:\n([\s\S]*?)(?:\n\n|$)/);
  const toList = (block) => (block ? block[1].split('\n').map((line) => line.replace(/^-\s*/, '').trim()).filter(Boolean) : []);
  return {
    passed: /Staging env verification passed\./.test(text),
    missing: failed ? Number(failed[1]) : 0,
    placeholders: failed ? Number(failed[2]) : 0,
    forbiddenFrontend: failed ? Number(failed[3]) : 0,
    invalid: failed ? Number(failed[4]) : 0,
    profile,
    placeholderKeys: toList(placeholderBlock),
    skippedKeys: toList(skippedBlock),
  };
}

function runStagingVerifier() {
  const verifier = run('npm', ['run', 'verify:staging-env', '--', '--env-file=.env.staging.local', '--env-file=backend/.env.staging.local']);
  const parsed = parseVerifierOutput(`${verifier.stdout || ''}\n${verifier.stderr || ''}`);
  commandLog[commandLog.length - 1].status = parsed.passed ? 'PASS' : 'FAIL';
  result.envVerifier = parsed;
  return parsed;
}

function validateCoolifyConfig() {
  const env = loadEnv([COOLIFY_LOCAL]);
  const missing = COOLIFY_REQUIRED.filter((key) => !env[key]);
  const placeholders = [...COOLIFY_REQUIRED, ...OPTIONAL_COOLIFY].filter((key) => key in env && hasPlaceholder(env[key]));
  result.coolifyConfig = { missing, placeholders };
  return { env, missing, placeholders };
}

function assertDeployPreconditions() {
  const verifier = runStagingVerifier();
  if (!verifier.passed) {
    result.status = 'BLOCKED_BY_STAGING_ENV';
    result.blockers.push('Staging env verifier failed; placeholders/missing/invalid remain.');
    throw new Error('BLOCKED_BY_STAGING_ENV');
  }
}

async function coolifyFetch(env, path, options = {}) {
  const baseUrl = env.COOLIFY_URL.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.COOLIFY_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (debugApi) {
    console.log(`Coolify API ${options.method || 'GET'} ${path}: HTTP ${response.status}`);
  }
  return response;
}

async function checkCoolifyConnection(env) {
  const paths = ['/version', '/health'];
  for (const path of paths) {
    try {
      const response = await coolifyFetch(env, path);
      if (response.status >= 200 && response.status < 500) {
        result.coolifyConnection = `checked ${path}: HTTP ${response.status}`;
        commandLog.push({ command: `Coolify API GET ${path}`, status: response.ok ? 'PASS' : 'FAIL' });
        return response.ok;
      }
    } catch {
      commandLog.push({ command: `Coolify API GET ${path}`, status: 'FAIL' });
    }
  }
  result.coolifyConnection = 'failed; confirm Coolify API endpoint/version';
  return false;
}

function extractEnvList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['data', 'envs', 'environment_variables', 'environmentVariables', 'variables']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function getEnvEntryKey(entry) {
  return entry?.key || entry?.name || entry?.variable || entry?.environment_variable?.key;
}

function getEnvEntryId(entry) {
  return entry?.uuid || entry?.id || entry?.environment_variable?.uuid || entry?.environment_variable?.id;
}

async function fetchCoolifyEnvList(env, resourceUuid, label) {
  const endpoints = [
    `/applications/${resourceUuid}/envs`,
    `/applications/${resourceUuid}/environment-variables`,
    `/services/${resourceUuid}/envs`,
  ];
  for (const endpoint of endpoints) {
    const response = await coolifyFetch(env, endpoint);
    result.envSync.push(`${label}: env list ${endpoint} HTTP ${response.status}`);
    if (!response.ok) {
      if (response.status === 404 || response.status === 405) continue;
      continue;
    }
    try {
      const payload = await response.json();
      const entries = extractEnvList(payload);
      const byKey = new Map();
      for (const entry of entries) {
        const key = getEnvEntryKey(entry);
        if (key) byKey.set(key, entry);
      }
      return { endpoint, byKey };
    } catch {
      return { endpoint, byKey: new Map() };
    }
  }
  return { endpoint: `/applications/${resourceUuid}/envs`, byKey: new Map() };
}

function buildCoolifyPayload(key, value) {
  const payload = {
    key,
    value,
    is_preview: false,
    is_literal: true,
    is_multiline: false,
    is_shown_once: false,
  };
  if (key.startsWith('VITE_')) payload.is_buildtime = true;
  return payload;
}

async function tryBulkEnvSync(env, endpoint, entries, label) {
  const payloads = entries.map(([key, value]) => buildCoolifyPayload(key, value));
  const bulkEndpoint = `${endpoint.replace(/\/+$/, '')}/bulk`;
  const candidates = [
    { path: bulkEndpoint, method: 'PATCH', body: { data: payloads } },
    { path: bulkEndpoint, method: 'PUT', body: { data: payloads } },
    { path: endpoint, method: 'PATCH', body: { data: payloads } },
    { path: endpoint, method: 'PUT', body: { data: payloads } },
    { path: endpoint, method: 'PATCH', body: { envs: Object.fromEntries(entries) } },
    { path: endpoint, method: 'PUT', body: { envs: Object.fromEntries(entries) } },
  ];
  for (const candidate of candidates) {
    const response = await coolifyFetch(env, candidate.path, {
      method: candidate.method,
      body: JSON.stringify(candidate.body),
    });
    result.envSync.push(`${label}: bulk ${candidate.method} ${candidate.path} HTTP ${response.status}`);
    if (response.ok) return true;
    if (response.status === 422 || response.status === 400 || response.status === 404 || response.status === 405) continue;
    break;
  }
  return false;
}

async function updateCoolifyEnvKey(env, endpoint, key, value, entry) {
  const payload = buildCoolifyPayload(key, value);
  const id = getEnvEntryId(entry);
  const candidates = [];
  if (id) {
    candidates.push({ method: 'PATCH', path: `${endpoint}/${encodeURIComponent(id)}`, body: payload });
    candidates.push({ method: 'PUT', path: `${endpoint}/${encodeURIComponent(id)}`, body: payload });
  }
  candidates.push({ method: 'PATCH', path: endpoint, body: payload });
  candidates.push({ method: 'PUT', path: endpoint, body: payload });
  candidates.push({ method: 'POST', path: endpoint, body: { ...payload, _method: 'PATCH' } });
  for (const candidate of candidates) {
    const response = await coolifyFetch(env, candidate.path, {
      method: candidate.method,
      body: JSON.stringify(candidate.body),
    });
    if (response.ok) return { ok: true, status: response.status, path: candidate.path, method: candidate.method };
    if (![400, 404, 405, 422].includes(response.status)) return { ok: false, status: response.status, path: candidate.path, method: candidate.method };
  }
  return { ok: false, status: 'no compatible update endpoint', path: endpoint, method: 'PATCH' };
}

async function createCoolifyEnvKey(env, endpoint, key, value) {
  const payload = buildCoolifyPayload(key, value);
  const candidates = [
    { method: 'POST', body: payload },
    { method: 'POST', body: { key, value, is_preview: false, is_literal: true, is_multiline: false, is_shown_once: false } },
  ];
  for (const candidate of candidates) {
    const response = await coolifyFetch(env, endpoint, {
      method: candidate.method,
      body: JSON.stringify(candidate.body),
    });
    if (response.ok) return { ok: true, exists: false, status: response.status };
    if (response.status === 422) return { ok: false, exists: true, status: response.status };
    if (![400, 404, 405].includes(response.status)) return { ok: false, exists: false, status: response.status };
  }
  return { ok: false, exists: false, status: 'no compatible create endpoint' };
}

async function upsertCoolifyEnv(env, resourceUuid, keys, sourceEnv, label) {
  const actions = [];
  const skipped = [];
  const entries = keys.filter((key) => key in sourceEnv).map((key) => [key, sourceEnv[key]]);
  for (const key of keys) {
    if (!(key in sourceEnv)) {
      skipped.push(key);
    }
  }
  for (const key of skipped) result.envSync.push(`${label}: ${key} skipped`);

  const { endpoint, byKey } = await fetchCoolifyEnvList(env, resourceUuid, label);
  const bulkOk = entries.length > 1 ? await tryBulkEnvSync(env, endpoint, entries, label) : false;
  if (bulkOk) {
    for (const [key] of entries) {
      const action = byKey.has(key) ? 'updated' : 'created';
      result.envSync.push(`${label}: ${key} ${action}`);
      actions.push({ key, action, ok: true });
    }
    return skipped.length === 0;
  }

  for (const [key, value] of entries) {
    const existing = byKey.get(key);
    if (existing) {
      const update = await updateCoolifyEnvKey(env, endpoint, key, value, existing);
      const action = update.ok ? 'updated' : 'failed';
      result.envSync.push(`${label}: ${key} ${action}`);
      actions.push({ key, action, ok: update.ok });
      continue;
    }

    const created = await createCoolifyEnvKey(env, endpoint, key, value);
    if (created.ok) {
      result.envSync.push(`${label}: ${key} created`);
      actions.push({ key, action: 'created', ok: true });
      continue;
    }

    if (created.exists) {
      const refreshed = await fetchCoolifyEnvList(env, resourceUuid, label);
      const update = await updateCoolifyEnvKey(env, refreshed.endpoint, key, value, refreshed.byKey.get(key));
      const action = update.ok ? 'updated' : 'failed';
      result.envSync.push(`${label}: ${key} ${action}`);
      actions.push({ key, action, ok: update.ok });
      continue;
    }

    result.envSync.push(`${label}: ${key} failed`);
    actions.push({ key, action: 'failed', ok: false });
  }
  return skipped.length === 0 && actions.every((action) => action.ok);
}

async function syncEnv(env) {
  assertDeployPreconditions();
  const stagingEnv = loadEnv(STAGING_ENV_FILES);
  const minimal = result.envVerifier?.profile === 'minimal';
  const payment = result.envVerifier?.profile === 'payment';
  for (const key of SMOKE_ONLY_KEYS) {
    if (key in stagingEnv) result.envSync.push(`smoke-only skipped: ${key}`);
  }
  if (minimal) {
    for (const key of MINIMAL_PROVIDER_SKIPPED) result.envSync.push(`minimal provider skipped: ${key}`);
  }
  const backendKeys = minimal ? MINIMAL_BACKEND_KEYS : payment ? PAYMENT_BACKEND_KEYS : BACKEND_KEYS;
  const frontendKeys = minimal ? MINIMAL_FRONTEND_KEYS : payment ? PAYMENT_FRONTEND_KEYS : FRONTEND_KEYS;
  const backendOk = await upsertCoolifyEnv(env, env.COOLIFY_STAGING_BACKEND_UUID, backendKeys, stagingEnv, 'backend');
  const frontendOk = await upsertCoolifyEnv(env, env.COOLIFY_STAGING_FRONTEND_UUID, frontendKeys, stagingEnv, 'frontend');
  if (!backendOk || !frontendOk) {
    result.status = 'BLOCKED_BY_COOLIFY_API';
    result.blockers.push('Coolify env API did not accept all keys; confirm API version/endpoints.');
    throw new Error('BLOCKED_BY_COOLIFY_API');
  }
}

async function triggerDeploy(env, uuid, label) {
  const force = String(env.COOLIFY_DEPLOY_FORCE || '').toLowerCase() === 'true';
  const candidates = [
    { path: `/deploy?uuid=${encodeURIComponent(uuid)}${force ? '&force=true' : ''}`, method: 'GET' },
    { path: '/deploy', method: 'POST', body: { uuid, force } },
    { path: `/applications/${uuid}/deploy`, method: 'POST', body: { force } },
  ];
  for (const candidate of candidates) {
    const response = await coolifyFetch(env, candidate.path, {
      method: candidate.method,
      body: candidate.body ? JSON.stringify(candidate.body) : undefined,
    });
    result.deployment.push(`${label}: ${candidate.method} ${candidate.path} HTTP ${response.status}`);
    if (response.ok) return true;
    if (response.status !== 404 && response.status !== 405) break;
  }
  return false;
}

async function deploy(env) {
  assertDeployPreconditions();
  for (const [uuid, label] of [
    [env.COOLIFY_STAGING_BACKEND_UUID, 'backend'],
    [env.COOLIFY_STAGING_FRONTEND_UUID, 'frontend'],
  ]) {
    const ok = await triggerDeploy(env, uuid, label);
    if (!ok) {
      result.status = 'BLOCKED_BY_DEPLOYMENT';
      result.blockers.push(`${label} deploy trigger failed; confirm Coolify deploy API endpoint.`);
      throw new Error('BLOCKED_BY_DEPLOYMENT');
    }
  }
}

async function healthCheck() {
  const env = loadEnv(STAGING_ENV_FILES);
  const targets = [
    ['frontend', env.KAFFEPOS_STAGING_FRONTEND_URL],
    ['api /health', env.KAFFEPOS_STAGING_API_URL ? `${env.KAFFEPOS_STAGING_API_URL.replace(/\/+$/, '')}/health` : ''],
    ['api /health/db', env.KAFFEPOS_STAGING_API_URL ? `${env.KAFFEPOS_STAGING_API_URL.replace(/\/+$/, '')}/health/db` : ''],
  ];
  for (const [label, url] of targets) {
    if (!url) {
      result.health.push(`${label}: missing URL`);
      result.status = 'BLOCKED_BY_STAGING_HEALTH';
      throw new Error('BLOCKED_BY_STAGING_HEALTH');
    }
    let ok = false;
    let lastStatus = 'no response';
    for (let attempt = 1; attempt <= 18; attempt += 1) {
      try {
        const response = await fetch(url, { redirect: 'follow' });
        lastStatus = `HTTP ${response.status}`;
        if (response.status >= 200 && response.status < 400) {
          ok = true;
          break;
        }
      } catch (error) {
        lastStatus = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    result.health.push(`${label}: ${ok ? 'PASS' : `FAIL ${lastStatus}`}`);
    if (!ok) {
      result.status = 'BLOCKED_BY_STAGING_HEALTH';
      throw new Error('BLOCKED_BY_STAGING_HEALTH');
    }
  }
}

function runQualityGate() {
  assertDeployPreconditions();
  for (const [command, args] of QUALITY_COMMANDS) {
    const check = run(command, args);
    if (check.status !== 0) {
      result.status = 'BLOCKED_BY_LOCAL_QUALITY_GATE';
      result.blockers.push(`${command} ${args.join(' ')} failed`);
      throw new Error('BLOCKED_BY_LOCAL_QUALITY_GATE');
    }
  }
}

function runSmoke() {
  const commands = result.envVerifier?.profile === 'payment' ? PAYMENT_SMOKE_COMMANDS : SMOKE_COMMANDS;
  for (const [command, args, env] of commands) {
    const check = run(command, args, env ? { env } : {});
    result.smoke.push(`${command} ${args.join(' ')}: ${check.status === 0 ? 'PASS' : 'FAIL'}`);
    if (check.status !== 0) {
      result.status = 'BLOCKED_BY_STAGING_SMOKE';
      result.blockers.push(`${command} ${args.join(' ')} failed`);
      throw new Error('BLOCKED_BY_STAGING_SMOKE');
    }
  }
}

function runExternalChecks() {
  for (const check of EXTERNAL_CHECKS) {
    const script = check.candidates.find((candidate) => fs.existsSync(candidate));
    if (!script) {
      result.manualChecks.push(`${check.name}: MANUAL_CHECK_REQUIRED`);
      continue;
    }
    const scriptResult = run('node', [script]);
    result.manualChecks.push(`${check.name}: ${scriptResult.status === 0 ? 'PASS' : 'FAIL'}`);
  }
}

function replaceSection(file, marker, content) {
  const start = `<!-- ${marker}:START -->`;
  const end = `<!-- ${marker}:END -->`;
  const block = `${start}\n${content.trim()}\n${end}`;
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.includes(start) && current.includes(end)) {
    const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    fs.writeFileSync(file, `${current.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`), block).trim()}\n`);
    return;
  }
  fs.writeFileSync(file, `${current.trim()}\n\n${block}\n`.trimStart());
}

function writeReports() {
  const timestamp = new Date().toISOString();
  const commands = commandLog.map((entry) => `- \`${entry.command}\`: ${entry.status}`).join('\n') || '- none';
  const placeholders = (result.envVerifier?.placeholderKeys || []).map((key) => `- \`${key}\``).join('\n') || '- none';
  const skippedKeys = (result.envVerifier?.skippedKeys || []).map((key) => `- \`${key}\``).join('\n') || '- none';
  const sync = result.envSync.map((item) => `- ${item}`).join('\n') || '- not run';
  const deployment = result.deployment.map((item) => `- ${item}`).join('\n') || '- not run';
  const health = result.health.map((item) => `- ${item}`).join('\n') || '- not run';
  const smoke = result.smoke.map((item) => `- ${item}`).join('\n') || '- not run';
  const manual = result.manualChecks.map((item) => `- ${item}`).join('\n') || '- none';
  const blockers = result.blockers.map((item) => `- ${item}`).join('\n') || '- none';
  const report = `# KaffePOS Coolify Staging Automation Report

Generated: ${timestamp}

## Status
${result.status}

## Command Flags Used
${[...flags].join(', ') || '(none)'}

## Coolify Connection
${result.coolifyConnection}

## Env Verifier Result
- profile: ${result.envVerifier?.profile ?? 'not run'}
- missing: ${result.envVerifier?.missing ?? 'not run'}
- placeholders: ${result.envVerifier?.placeholders ?? 'not run'}
- forbidden frontend secrets: ${result.envVerifier?.forbiddenFrontend ?? 'not run'}
- invalid: ${result.envVerifier?.invalid ?? 'not run'}

## Remaining Placeholder Keys
${placeholders}

## Provider Keys Skipped
${skippedKeys}

## Quality Gate Result
${commands}

## Env Sync Result
${sync}

## Deploy Trigger Result
${deployment}

## Health Result
${health}

## Smoke Result
${smoke}

## Manual Checks
${manual}

## Blockers
${blockers}

## Next Action
${nextAction()}
`;
  fs.writeFileSync(REPORT_PATH, report);
  fs.writeFileSync(FINAL_REPORT_PATH, report.replace('# KaffePOS Coolify Staging Automation Report', '# KaffePOS Final Staging Execution Report'));

  const summary = `## Coolify Staging Automation Update

Generated: ${timestamp}

Status: ${result.status}.

Verifier summary: profile ${result.envVerifier?.profile ?? 'not run'}, missing ${result.envVerifier?.missing ?? 'not run'}, placeholders ${result.envVerifier?.placeholders ?? 'not run'}, forbidden frontend secrets ${result.envVerifier?.forbiddenFrontend ?? 'not run'}, invalid ${result.envVerifier?.invalid ?? 'not run'}.

Coolify connection: ${result.coolifyConnection}.

See \`${REPORT_PATH}\` for full automation details.`;
  replaceSection(STAGING_SMOKE_REPORT, 'COOLIFY_STAGING_AUTOMATION', summary);
  replaceSection(PRODUCTION_CHECKLIST, 'COOLIFY_STAGING_AUTOMATION', summary);

  const changelog = `## 2026-05-25 Coolify Staging Automation

### Added
- Added \`npm run coolify:staging:deploy\` local automation for Coolify config checks, staging env guard, optional env sync, deploy trigger, health checks, smoke tests, and safe reporting.
- Added \`.env.coolify.example\` template with placeholders only; \`.env.coolify.local\` remains ignored.

### Status
- ${result.status}: ${result.blockers[0] || 'no blocker'}.

### Docs
- Updated Coolify staging automation report, final staging execution report, staging smoke report, production readiness checklist, and README command docs.`;
  replaceSection(CHANGELOG, 'COOLIFY_STAGING_AUTOMATION', changelog);
}

function nextAction() {
  if (result.status === 'BLOCKED_BY_STAGING_ENV') return 'Replace remaining staging placeholders with real values from secure sources, then rerun --check.';
  if (result.status === 'BLOCKED_BY_COOLIFY_CONFIG') return 'Fill .env.coolify.local with Coolify URL, token, and resource UUIDs, then rerun --check.';
  if (result.status === 'BLOCKED_BY_COOLIFY_API') return 'Confirm Coolify API version/endpoints and token permissions.';
  if (result.status === 'BLOCKED_BY_LOCAL_QUALITY_GATE') return 'Fix failing local quality command, then rerun --all.';
  if (result.status === 'BLOCKED_BY_DEPLOYMENT') return 'Check Coolify deploy endpoint/resource UUIDs and retry.';
  if (result.status === 'BLOCKED_BY_STAGING_HEALTH') return 'Fix staging frontend/API/DB health before smoke.';
  if (result.status === 'BLOCKED_BY_STAGING_SMOKE') return 'Fix staging smoke failure before production candidate.';
  if (result.status === 'READY_FOR_MINIMAL_STAGING') return 'Minimal staging is ready for core verification only. Complete full staging before production candidate.';
  return 'Complete manual external checks if required, then proceed to production candidate review.';
}

async function main() {
  if (flags.has('--init') || flags.has('--force-init')) {
    initCoolifyLocal(flags.has('--force-init'));
  }

  if (!fs.existsSync(COOLIFY_LOCAL)) initCoolifyLocal(false);

  const initOnly = (flags.has('--init') || flags.has('--force-init')) && process.argv.slice(2).every((flag) => flag === '--init' || flag === '--force-init');
  if (initOnly) {
    result.status = 'COOLIFY_LOCAL_ENV_INITIALIZED';
    result.blockers.push('Fill .env.coolify.local from Coolify dashboard before --check.');
    return;
  }

  const envSafety = gitEnvSafety();
  if (!envSafety.every((item) => item.ignored && !item.tracked)) {
    result.status = 'BLOCKED_BY_COOLIFY_CONFIG';
    result.blockers.push('Local env files must be ignored and untracked.');
    return;
  }

  const shouldCheck = flags.has('--check') || flags.has('--all');
  const shouldSync = flags.has('--sync-env') || flags.has('--all');
  const shouldDeploy = flags.has('--deploy') || flags.has('--all');
  const shouldHealth = flags.has('--health') || flags.has('--all');
  const shouldSmoke = flags.has('--smoke') || flags.has('--all');

  if (!shouldCheck && !shouldSync && !shouldDeploy && !shouldHealth && !shouldSmoke && !flags.has('--init') && !flags.has('--force-init')) {
    result.status = 'BLOCKED_BY_COOLIFY_CONFIG';
    result.blockers.push('No action flag provided. Use --check, --sync-env, --deploy, --health, --smoke, --all, or --init.');
    return;
  }

  const verifier = runStagingVerifier();
  if (!verifier.passed) {
    result.status = 'BLOCKED_BY_STAGING_ENV';
    result.blockers.push('Staging env verifier failed; do not sync/deploy placeholders.');
    return;
  }

  const { env: coolifyEnv, missing, placeholders } = validateCoolifyConfig();
  if (missing.length > 0 || placeholders.length > 0) {
    result.status = 'BLOCKED_BY_COOLIFY_CONFIG';
    result.blockers.push(`Coolify config missing=${missing.join(', ') || 'none'} placeholders=${placeholders.join(', ') || 'none'}`);
    return;
  }

  if (shouldCheck) {
    const connected = await checkCoolifyConnection(coolifyEnv);
    if (!connected) {
      result.status = 'BLOCKED_BY_COOLIFY_API';
      result.blockers.push('Coolify API connection failed; confirm URL/token/API version.');
      return;
    }
  }

  if (shouldSync) await syncEnv(coolifyEnv);
  if (shouldDeploy) {
    runQualityGate();
    await deploy(coolifyEnv);
  }
  if (shouldHealth) await healthCheck();
  if (shouldSmoke) runSmoke();

  if (result.envVerifier?.profile === 'minimal') {
    result.manualChecks.push(...MINIMAL_PROVIDER_SKIPPED.map((key) => `${key}: SKIPPED_BY_MINIMAL_STAGING`));
    result.status = 'READY_FOR_MINIMAL_STAGING';
    return;
  }

  if (result.envVerifier?.profile === 'payment') {
    result.status = 'READY_FOR_PAYMENT_STAGING';
    return;
  }

  if (flags.has('--all')) runExternalChecks();
  result.status = result.manualChecks.some((item) => item.includes('MANUAL_CHECK_REQUIRED')) ? 'MANUAL_CHECK_REQUIRED' : 'READY_FOR_PRODUCTION_CANDIDATE';
}

main()
  .catch((error) => {
    if (String(error?.message || error).startsWith('BLOCKED_')) return;
    result.status = 'BLOCKED_BY_COOLIFY_API';
    result.blockers.push(error instanceof Error ? error.message : String(error));
  })
  .finally(() => {
    writeReports();
    console.log(JSON.stringify({
      status: result.status,
      coolifyConnection: result.coolifyConnection,
      envVerifier: result.envVerifier,
      blockers: result.blockers,
      envSync: result.envSync,
      deployment: result.deployment,
      health: result.health,
      smoke: result.smoke,
      manualChecks: result.manualChecks,
    }, null, 2));
    const successStatuses = new Set(['READY_FOR_PRODUCTION_CANDIDATE', 'READY_FOR_MINIMAL_STAGING', 'READY_FOR_PAYMENT_STAGING', 'MANUAL_CHECK_REQUIRED']);
    process.exit(successStatuses.has(result.status) ? 0 : 2);
  });
