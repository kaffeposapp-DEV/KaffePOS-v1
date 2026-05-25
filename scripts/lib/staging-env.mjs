import fs from 'node:fs';

const DEFAULT_STAGING_ENV_FILES = ['.env.staging.local', 'backend/.env.staging.local'];

export function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const parsed = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function loadStagingEnvFiles(files = DEFAULT_STAGING_ENV_FILES) {
  for (const file of files) {
    const parsed = parseEnvFile(file);
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

export function resolveStagingApiBase() {
  return (process.env.KAFFEPOS_STAGING_API_URL || process.env.KAFFEPOS_API_BASE_URL || 'https://api.kaffepos.my.id').replace(/\/+$/, '');
}

export function assertMinimalStagingTarget() {
  const profile = process.env.STAGING_PROFILE || process.env.VITE_STAGING_PROFILE;
  if (profile !== 'minimal') {
    throw new Error('STAGING_PROFILE=minimal wajib untuk smoke minimal staging.');
  }
  if (process.env.NODE_ENV !== 'staging') {
    throw new Error('NODE_ENV=staging wajib untuk smoke minimal staging.');
  }
  if (!process.env.KAFFEPOS_STAGING_API_URL) {
    throw new Error('KAFFEPOS_STAGING_API_URL wajib untuk smoke minimal staging.');
  }
}
