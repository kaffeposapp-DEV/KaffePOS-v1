#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND_REQUIRED = [
  'VITE_APP_ENV',
  'VITE_API_BASE_URL',
  'VITE_ANALYTICS_ENABLED',
  'VITE_GA4_MEASUREMENT_ID',
  'VITE_CLARITY_PROJECT_ID',
  'VITE_PUBLIC_ASSET_BASE_URL',
  'VITE_MIDTRANS_IS_PRODUCTION',
  'VITE_MIDTRANS_CLIENT_KEY',
  'VITE_PAYMENT_GATEWAY_PROVIDER',
  'VITE_AFFILIATE_REFERRAL_ENABLED',
  'VITE_REFERRAL_ENABLED',
  'VITE_AFFILIATE_ENABLED',
  'VITE_ADMIN_COMMISSION_ENABLED',
];

const BACKEND_REQUIRED = [
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
  'PAYMENT_GATEWAY_PROVIDER',
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

const MINIMAL_FRONTEND_REQUIRED = [
  'VITE_APP_ENV',
  'VITE_STAGING_PROFILE',
  'VITE_API_BASE_URL',
  'VITE_ANALYTICS_ENABLED',
  'VITE_MIDTRANS_IS_PRODUCTION',
];

const PAYMENT_FRONTEND_REQUIRED = [
  'VITE_APP_ENV',
  'VITE_STAGING_PROFILE',
  'VITE_API_BASE_URL',
  'VITE_ANALYTICS_ENABLED',
  'VITE_PAYMENT_GATEWAY_PROVIDER',
];

const MINIMAL_BACKEND_REQUIRED = [
  'NODE_ENV',
  'STAGING_PROFILE',
  'WEB_BASE_URL',
  'API_BASE_URL',
  'DATABASE_URL',
  'JWT_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'PAYMENT_INTEGRATION_ENABLED',
  'PAYMENT_GATEWAY_PROVIDER',
  'EMAIL_INTEGRATION_ENABLED',
  'R2_STORAGE_ENABLED',
  'ANALYTICS_SERVER_ENABLED',
];

const PAYMENT_BACKEND_REQUIRED = [
  'NODE_ENV',
  'STAGING_PROFILE',
  'WEB_BASE_URL',
  'API_BASE_URL',
  'DATABASE_URL',
  'JWT_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'PAYMENT_INTEGRATION_ENABLED',
  'PAYMENT_GATEWAY_PROVIDER',
  'DUITKU_ENVIRONMENT',
  'DUITKU_MERCHANT_CODE',
  'DUITKU_MERCHANT_KEY',
  'DUITKU_CALLBACK_URL',
  'DUITKU_RETURN_URL',
  'SUBSCRIPTION_PAYMENT_MODE',
  'MIDTRANS_SNAP_ENABLED',
];

const PAYMENT_OPTIONAL_SKIPPED = [
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'EMAIL_REPLY_TO',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_R2_PUBLIC_URL',
  'GA4_MEASUREMENT_ID',
  'GA4_API_SECRET',
  'VITE_GA4_MEASUREMENT_ID',
  'VITE_CLARITY_PROJECT_ID',
  'VITE_PUBLIC_ASSET_BASE_URL',
];

const MINIMAL_OPTIONAL_SKIPPED = [
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

const SMOKE_REQUIRED = [
  'KAFFEPOS_STAGING_API_URL',
  'KAFFEPOS_STAGING_FRONTEND_URL',
  'KAFFEPOS_OWNER_EMAIL',
  'KAFFEPOS_OWNER_PASSWORD',
  'KAFFEPOS_TEST_CASHIER_EMAIL',
  'KAFFEPOS_TEST_CASHIER_PASSWORD',
  'KAFFEPOS_TEST_EMAIL_TO',
  'KAFFEPOS_STOCK_SMOKE_CONFIRM',
];

const FORBIDDEN_FRONTEND_PATTERNS = [
  /DATABASE_URL/i,
  /JWT_SECRET/i,
  /SESSION_SECRET/i,
  /ENCRYPTION_KEY/i,
  /MIDTRANS_SERVER_KEY/i,
  /DUITKU_(MERCHANT_KEY|API_KEY|SECRET)/i,
  /RESEND_API_KEY/i,
  /CLOUDFLARE_R2_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)/i,
  /GA4_API_SECRET/i,
  /PASSWORD/i,
  /TOKEN/i,
  /PRIVATE/i,
];

const PLACEHOLDER_PATTERNS = [
  /^change-me/i,
  /change[_-]?me/i,
  /placeholder/i,
  /your-/i,
  /^x+$/i,
  /xxx/i,
  /example\.com/i,
  /staging-api\.example\.com/i,
  /staging\.example\.com/i,
  /assets(-staging)?\.example\.com/i,
  /^G-XXXXXXXXXX$/,
  /^SB-Mid-(server|client)-change-me$/,
  /^re_change_me$/,
  /^postgresql:\/\/user:password@host:5432\/kaffepos_staging$/,
  /^owner-staging@example\.com$/,
  /^cashier-staging@example\.com$/,
  /^test-recipient@example\.com$/,
];

const STAGING_URL_KEY_PATTERNS = [/URL/i, /BASE_URL/i, /ORIGIN/i];
const URL_REQUIRED_KEYS = [
  'VITE_API_BASE_URL',
  'VITE_PUBLIC_ASSET_BASE_URL',
  'KAFFEPOS_STAGING_API_URL',
  'KAFFEPOS_STAGING_FRONTEND_URL',
  'WEB_BASE_URL',
  'API_BASE_URL',
  'CLOUDFLARE_R2_PUBLIC_URL',
];

const MINIMAL_URL_REQUIRED_KEYS = [
  'VITE_API_BASE_URL',
  'KAFFEPOS_STAGING_API_URL',
  'KAFFEPOS_STAGING_FRONTEND_URL',
  'WEB_BASE_URL',
  'API_BASE_URL',
];

const PAYMENT_URL_REQUIRED_KEYS = [
  'VITE_API_BASE_URL',
  'WEB_BASE_URL',
  'API_BASE_URL',
  'DUITKU_CALLBACK_URL',
  'DUITKU_RETURN_URL',
];

const DEFAULT_ENV_FILES = [
  '.env.staging.local',
  '.env.staging',
  'backend/.env.staging.local',
  'backend/.env.staging',
];

function parseEnvFile(filename) {
  if (!fs.existsSync(filename)) return {};
  const parsed = {};
  const content = fs.readFileSync(filename, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function loadEnv() {
  const env = { ...process.env };
  const explicitFiles = process.argv
    .filter((arg) => arg.startsWith('--env-file='))
    .map((arg) => arg.slice('--env-file='.length));
  const files = explicitFiles.length > 0 ? explicitFiles : DEFAULT_ENV_FILES;
  const loadedFiles = [];
  for (const file of files) {
    const absolute = path.resolve(process.cwd(), file);
    if (!fs.existsSync(absolute)) continue;
    Object.assign(env, parseEnvFile(absolute));
    loadedFiles.push(file);
  }
  return { env, loadedFiles };
}

function maskValue(_key, value) {
  if (!value) return 'missing';
  return 'present';
}

function isPlaceholderValue(key, value) {
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) return true;
  if (STAGING_URL_KEY_PATTERNS.some((pattern) => pattern.test(key)) && /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value)) {
    return true;
  }
  return false;
}

function checkRequired(label, keys, env) {
  const missing = [];
  const placeholders = [];
  console.log(`\n${label}`);
  for (const key of keys) {
    const value = env[key];
    const present = typeof value === 'string' && value.trim().length > 0;
    if (!present) missing.push(key);
    if (present && isPlaceholderValue(key, value.trim())) {
      placeholders.push(key);
    }
    console.log(`- ${key}: ${present ? maskValue(key, value.trim()) : 'missing'}`);
  }
  return { missing, placeholders };
}

function checkUrlValues(keys, env) {
  const invalid = [];
  for (const key of keys) {
    const value = env[key];
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    try {
      const parsed = new URL(value.trim());
      if (parsed.protocol !== 'https:') invalid.push(`${key} must be an HTTPS URL`);
    } catch {
      invalid.push(`${key} must be a valid HTTPS URL`);
    }
  }
  return invalid;
}

function main() {
  const { env, loadedFiles } = loadEnv();
  const forcedProfile = process.argv.find((arg) => arg.startsWith('--profile='))?.slice('--profile='.length);
  const rawProfile = forcedProfile || env.STAGING_PROFILE || env.VITE_STAGING_PROFILE || 'full';
  const stagingProfile = rawProfile === 'minimal' || rawProfile === 'payment' ? rawProfile : 'full';
  const frontendRequired = stagingProfile === 'minimal' ? MINIMAL_FRONTEND_REQUIRED : stagingProfile === 'payment' ? PAYMENT_FRONTEND_REQUIRED : FRONTEND_REQUIRED;
  const backendRequired = stagingProfile === 'minimal' ? MINIMAL_BACKEND_REQUIRED : stagingProfile === 'payment' ? PAYMENT_BACKEND_REQUIRED : BACKEND_REQUIRED;
  const smokeRequired = stagingProfile === 'payment' ? [] : SMOKE_REQUIRED;
  const urlRequired = stagingProfile === 'minimal' ? MINIMAL_URL_REQUIRED_KEYS : stagingProfile === 'payment' ? PAYMENT_URL_REQUIRED_KEYS : URL_REQUIRED_KEYS;
  console.log('KaffePOS staging env verification');
  console.log(`Loaded env files: ${loadedFiles.length > 0 ? loadedFiles.join(', ') : '(none; process env only)'}`);
  console.log(`Staging profile: ${stagingProfile}`);

  const frontendCheck = checkRequired('Frontend staging env', frontendRequired, env);
  const backendCheck = checkRequired('Backend staging env', backendRequired, env);
  const smokeCheck = checkRequired(stagingProfile === 'payment' ? 'Smoke runner env (skipped for payment profile)' : 'Smoke runner env', smokeRequired, env);
  const missing = [...frontendCheck.missing, ...backendCheck.missing, ...smokeCheck.missing];
  const placeholders = [...frontendCheck.placeholders, ...backendCheck.placeholders, ...smokeCheck.placeholders];

  const forbiddenFrontend = Object.keys(env)
    .filter((key) => key.startsWith('VITE_'))
    .filter((key) => FORBIDDEN_FRONTEND_PATTERNS.some((pattern) => pattern.test(key)));

  if (forbiddenFrontend.length > 0) {
    console.log('\nForbidden frontend env keys detected:');
    for (const key of forbiddenFrontend) console.log(`- ${key}`);
  } else {
    console.log('\nForbidden frontend env keys detected: none');
  }

  const invalidStagingValues = [];
  if (env.VITE_APP_ENV && env.VITE_APP_ENV !== 'staging') invalidStagingValues.push('VITE_APP_ENV must be staging');
  if (env.NODE_ENV && env.NODE_ENV !== 'staging') invalidStagingValues.push('NODE_ENV must be staging');
  if (stagingProfile === 'minimal' && env.STAGING_PROFILE !== 'minimal') invalidStagingValues.push('STAGING_PROFILE must be minimal');
  if (stagingProfile === 'minimal' && env.VITE_STAGING_PROFILE !== 'minimal') invalidStagingValues.push('VITE_STAGING_PROFILE must be minimal');
  if (stagingProfile === 'payment' && env.STAGING_PROFILE !== 'payment') invalidStagingValues.push('STAGING_PROFILE must be payment');
  if (stagingProfile === 'payment' && env.VITE_STAGING_PROFILE !== 'payment') invalidStagingValues.push('VITE_STAGING_PROFILE must be payment');
  if (env.MIDTRANS_IS_PRODUCTION && env.MIDTRANS_IS_PRODUCTION !== 'false') invalidStagingValues.push('MIDTRANS_IS_PRODUCTION must be false');
  if (env.VITE_MIDTRANS_IS_PRODUCTION && env.VITE_MIDTRANS_IS_PRODUCTION !== 'false') invalidStagingValues.push('VITE_MIDTRANS_IS_PRODUCTION must be false');
  if (stagingProfile === 'minimal') {
    for (const key of ['PAYMENT_INTEGRATION_ENABLED', 'EMAIL_INTEGRATION_ENABLED', 'R2_STORAGE_ENABLED', 'ANALYTICS_SERVER_ENABLED']) {
      if (env[key] !== 'false') invalidStagingValues.push(`${key} must be false in minimal staging`);
    }
    if (env.PAYMENT_GATEWAY_PROVIDER !== 'disabled') invalidStagingValues.push('PAYMENT_GATEWAY_PROVIDER must be disabled in minimal staging');
    if (env.VITE_ANALYTICS_ENABLED !== 'false') invalidStagingValues.push('VITE_ANALYTICS_ENABLED must be false in minimal staging');
  }
  if (stagingProfile === 'payment') {
    const expected = {
      PAYMENT_GATEWAY_PROVIDER: 'duitku',
      PAYMENT_INTEGRATION_ENABLED: 'true',
      DUITKU_ENVIRONMENT: 'sandbox',
      SUBSCRIPTION_PAYMENT_MODE: 'duitku_sandbox',
      MIDTRANS_SNAP_ENABLED: 'false',
      VITE_PAYMENT_GATEWAY_PROVIDER: 'duitku',
    };
    for (const [key, value] of Object.entries(expected)) {
      if (env[key] !== value) invalidStagingValues.push(`${key} must be ${value} in payment staging`);
    }
    const optionalEnabled = {
      EMAIL_INTEGRATION_ENABLED: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'],
      R2_STORAGE_ENABLED: ['CLOUDFLARE_R2_BUCKET', 'CLOUDFLARE_R2_PUBLIC_URL'],
      ANALYTICS_SERVER_ENABLED: ['GA4_MEASUREMENT_ID', 'GA4_API_SECRET'],
    };
    for (const [flag, keys] of Object.entries(optionalEnabled)) {
      if (env[flag] === 'true') {
        for (const key of keys) {
          if (!env[key]) invalidStagingValues.push(`${key} required when ${flag}=true`);
        }
      }
    }
  }
  if (env.KAFFEPOS_STOCK_SMOKE_CONFIRM && env.KAFFEPOS_STOCK_SMOKE_CONFIRM !== '1') invalidStagingValues.push('KAFFEPOS_STOCK_SMOKE_CONFIRM must be 1');
  invalidStagingValues.push(...checkUrlValues(urlRequired, env));

  if (stagingProfile === 'minimal') {
    console.log('\nOptional provider keys skipped in minimal staging:');
    for (const key of MINIMAL_OPTIONAL_SKIPPED) console.log(`- ${key}`);
  }

  if (stagingProfile === 'payment') {
    console.log('\nOptional integration keys skipped unless enabled in payment staging:');
    for (const key of PAYMENT_OPTIONAL_SKIPPED) console.log(`- ${key}`);
  }

  if (invalidStagingValues.length > 0) {
    console.log('\nInvalid staging values:');
    for (const issue of invalidStagingValues) console.log(`- ${issue}`);
  }

  if (placeholders.length > 0) {
    console.log('\nPlaceholder values detected:');
    for (const key of placeholders) console.log(`- ${key}`);
  }

  if (missing.length > 0 || forbiddenFrontend.length > 0 || invalidStagingValues.length > 0 || placeholders.length > 0) {
    console.error(`\nStaging env verification failed: missing=${missing.length}, placeholders=${placeholders.length}, forbiddenFrontend=${forbiddenFrontend.length}, invalid=${invalidStagingValues.length}`);
    process.exit(1);
  }

  console.log('\nStaging env verification passed.');
}

main();
