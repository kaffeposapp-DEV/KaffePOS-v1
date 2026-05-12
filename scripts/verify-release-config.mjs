#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';

const releaseChannel = process.env.RELEASE_CHANNEL || process.env.NODE_ENV || 'development';
const isProduction = releaseChannel === 'production';

const checks = [];

function requireEquals(name, expected) {
  const actual = process.env[name] || '';
  checks.push({
    ok: actual === expected,
    severity: isProduction ? 'error' : 'warning',
    name,
    message: `${name} harus ${expected}${actual ? `, saat ini ${actual}` : ', saat ini kosong'}.`,
  });
}

function requirePresent(name) {
  const actual = process.env[name] || '';
  checks.push({
    ok: Boolean(actual),
    severity: isProduction ? 'error' : 'warning',
    name,
    message: `${name} wajib diisi untuk release production.`,
  });
}

function requireContains(name, expected) {
  const actual = process.env[name] || '';
  checks.push({
    ok: actual.split(',').map((item) => item.trim()).includes(expected),
    severity: isProduction ? 'error' : 'warning',
    name,
    message: `${name} harus memuat ${expected}${actual ? `, saat ini ${actual}` : ', saat ini kosong'}.`,
  });
}

function forbidPrefix(prefix) {
  const matches = Object.keys(process.env).filter((key) => key.startsWith(prefix));
  checks.push({
    ok: matches.length === 0,
    severity: 'error',
    name: prefix,
    message: `${prefix}* tidak boleh ada di environment KaffePOS final: ${matches.join(', ')}`,
  });
}

function forbidEnvFilePrefix(prefix, files) {
  const matches = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match?.[1]?.startsWith(prefix)) {
        matches.push(`${file}:${match[1]}`);
      }
    }
  }

  checks.push({
    ok: matches.length === 0,
    severity: 'error',
    name: `${prefix} in env files`,
    message: `${prefix}* tidak boleh ada di file env final: ${matches.join(', ')}`,
  });
}

if (isProduction) {
  requireEquals('WEB_BASE_URL', 'https://kaffepos.my.id');
  requireEquals('API_BASE_URL', 'https://api.kaffepos.my.id');
  requireEquals('MIDTRANS_ENVIRONMENT', 'production');
  requireEquals('MIDTRANS_IS_PRODUCTION', 'true');
  requirePresent('MIDTRANS_SERVER_KEY');
  requirePresent('MIDTRANS_CLIENT_KEY');
  requirePresent('MIDTRANS_MERCHANT_ID');
  requirePresent('VITE_CLARITY_PROJECT_ID');
  requirePresent('SENTRY_DSN');
  requirePresent('VITE_SENTRY_DSN');
  requirePresent('RESEND_API_KEY');
  requirePresent('RESEND_FROM_EMAIL');
  requireContains('CORS_ORIGIN', 'http://localhost');
  requireContains('CORS_ORIGIN', 'https://localhost');
}

forbidPrefix('SUPABASE_');
forbidPrefix('VITE_SUPABASE_');
forbidEnvFilePrefix('SUPABASE_', ['.env', '.env.local', '.env.production', '.env.production.local', '.env.release.local', 'android/.env', 'backend/.env']);
forbidEnvFilePrefix('VITE_SUPABASE_', ['.env', '.env.local', '.env.production', '.env.production.local', '.env.release.local', 'android/.env', 'backend/.env']);

const failed = checks.filter((check) => !check.ok);
const errors = failed.filter((check) => check.severity === 'error');

for (const check of checks) {
  const marker = check.ok ? 'OK' : check.severity.toUpperCase();
  console.log(`[${marker}] ${check.name}: ${check.ok ? 'valid' : check.message}`);
}

if (errors.length > 0) {
  console.error(`Release config validation failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log('Release config validation passed.');
