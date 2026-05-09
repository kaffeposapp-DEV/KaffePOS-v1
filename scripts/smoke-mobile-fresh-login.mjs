#!/usr/bin/env node

const apiBaseUrl = normalizeBaseUrl(process.env.KAFFEPOS_API_BASE_URL || 'https://api.kaffepos.my.id');
const email = requireEnv('KAFFEPOS_LOGIN_EMAIL');
const password = requireEnv('KAFFEPOS_LOGIN_PASSWORD');
const origin = process.env.KAFFEPOS_LOGIN_ORIGIN || 'https://localhost';

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} wajib diisi untuk smoke fresh login. Jangan tulis secret di chat; export env lokal saja.`);
  }
  return value;
}

function maskEmail(value) {
  const [local, domain] = value.split('@');
  if (!local || !domain) return '[email hidden]';
  return `${local.slice(0, 2)}***@${domain}`;
}

async function request(path, options = {}) {
  const headers = new Headers({
    Accept: 'application/json',
    Origin: origin,
  });
  if (options.json) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.json ? JSON.stringify(options.json) : undefined,
    signal: AbortSignal.timeout(15_000),
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

  if (!response.ok) {
    throw new Error(`${path} failed (${response.status}): ${data?.message || text || response.statusText}`);
  }

  return data;
}

try {
  console.log(`Fresh login smoke: API=${apiBaseUrl}, origin=${origin}, email=${maskEmail(email)}`);

  const login = await request('/api/auth/login', {
    method: 'POST',
    json: { email, password },
  });

  if (!login?.accessToken || !login?.user?.id || !login?.profile?.id) {
    throw new Error('Login response tidak lengkap: accessToken/user/profile wajib ada.');
  }
  console.log(`PASS login returned token and profile role=${login.profile.role || 'unknown'}`);

  const session = await request('/api/auth/session', { token: login.accessToken });
  if (!session?.profile?.id || session.profile.id !== login.profile.id) {
    throw new Error('Auth session bootstrap tidak mengembalikan profile yang sama.');
  }
  console.log(`PASS session bootstrap profile=${session.profile.id}`);

  const stores = await request('/api/stores', { token: login.accessToken });
  if (!Array.isArray(stores?.items)) {
    throw new Error('Store bootstrap tidak mengembalikan items array.');
  }
  console.log(`PASS store bootstrap items=${stores.items.length}`);
  console.log('Fresh mobile login smoke passed.');
} catch (error) {
  console.error('Fresh mobile login smoke failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
