#!/usr/bin/env node
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { assertMinimalStagingTarget, loadStagingEnvFiles, resolveStagingApiBase } from './lib/staging-env.mjs';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

loadStagingEnvFiles();
assertMinimalStagingTarget();

const apiBaseUrl = resolveStagingApiBase();
const required = [
  'KAFFEPOS_OWNER_EMAIL',
  'KAFFEPOS_OWNER_PASSWORD',
  'KAFFEPOS_TEST_CASHIER_EMAIL',
  'KAFFEPOS_TEST_CASHIER_PASSWORD',
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} wajib tersedia untuk repair smoke data staging.`);
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function usernameFromEmail(email, suffix = '') {
  const local = email.split('@')[0] || 'smoke';
  return `${local}${suffix}`.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 30) || `smoke_${randomUUID().slice(0, 8)}`;
}

function decodePart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parsePostgresConnection(value) {
  const match = value.match(/^postgres(?:ql)?:\/\/(.+)$/i);
  if (!match) throw new Error('DATABASE_URL harus memakai skema PostgreSQL.');
  const withoutProtocol = match[1];
  const atIndex = withoutProtocol.lastIndexOf('@');
  if (atIndex === -1) throw new Error('DATABASE_URL tidak memuat host PostgreSQL.');
  const authPart = withoutProtocol.slice(0, atIndex);
  const hostAndPath = withoutProtocol.slice(atIndex + 1);
  const colonIndex = authPart.indexOf(':');
  const user = colonIndex === -1 ? authPart : authPart.slice(0, colonIndex);
  const password = colonIndex === -1 ? '' : authPart.slice(colonIndex + 1);
  const slashIndex = hostAndPath.indexOf('/');
  const hostPort = slashIndex === -1 ? hostAndPath : hostAndPath.slice(0, slashIndex);
  const pathAndQuery = slashIndex === -1 ? '' : hostAndPath.slice(slashIndex + 1);
  const queryIndex = pathAndQuery.indexOf('?');
  const database = queryIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : pathAndQuery.slice(queryIndex + 1);
  const portIndex = hostPort.lastIndexOf(':');
  const host = portIndex === -1 ? hostPort : hostPort.slice(0, portIndex);
  const port = portIndex === -1 ? undefined : Number(hostPort.slice(portIndex + 1));
  const params = new URLSearchParams(query);
  const sslmode = params.get('sslmode');
  return {
    user: decodePart(user),
    password: decodePart(password),
    host,
    port: Number.isFinite(port) ? port : undefined,
    database: decodePart(database),
    ssl: sslmode === 'disable' ? false : { rejectUnauthorized: false },
  };
}

async function request(path, options = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.json) headers.set('Content-Type', 'application/json');
  if (options.repairToken) headers.set('x-kaffepos-staging-repair-token', options.repairToken);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.json ? JSON.stringify(options.json) : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text }; }
  }
  return { response, data };
}

async function repairViaStagingApi() {
  const repairToken = process.env.STAGING_REPAIR_TOKEN || process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!repairToken) return null;
  const { response, data } = await request('/api/staging/smoke-data/repair', {
    method: 'POST',
    repairToken,
    json: {
      ownerEmail: normalizeEmail(process.env.KAFFEPOS_OWNER_EMAIL),
      ownerPassword: process.env.KAFFEPOS_OWNER_PASSWORD,
      cashierEmail: normalizeEmail(process.env.KAFFEPOS_TEST_CASHIER_EMAIL),
      cashierPassword: process.env.KAFFEPOS_TEST_CASHIER_PASSWORD,
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Staging repair API gagal HTTP ${response.status}.`);
  return data;
}

async function assertRemoteStagingHealth() {
  for (const path of ['/health', '/health/db']) {
    const { response } = await request(path);
    if (!response.ok) throw new Error(`${path} staging health gagal HTTP ${response.status}.`);
  }
}

async function ensureOwner(client) {
  const email = normalizeEmail(process.env.KAFFEPOS_OWNER_EMAIL);
  const passwordHash = await bcrypt.hash(process.env.KAFFEPOS_OWNER_PASSWORD, 12);
  const existing = await client.query(
    `
      select c.user_id, p.id, p.role, p.account_status
      from public.app_auth_credentials c
      full join public.profiles p on p.id = c.user_id
      where c.email = $1 or p.email = $1
      limit 1
    `,
    [email],
  );
  const userId = existing.rows[0]?.user_id || existing.rows[0]?.id || randomUUID();
  const username = usernameFromEmail(email);

  await client.query(
    `
      insert into public.profiles (id, username, display_name, email, role, account_status)
      values ($1, $2, 'Staging Smoke Owner', $3, 'owner_admin', 'active')
      on conflict (id) do update
      set email = excluded.email,
          role = 'owner_admin',
          account_status = 'active',
          updated_at = now()
    `,
    [userId, username, email],
  );

  await client.query(
    `
      insert into public.app_auth_credentials (user_id, email, password_hash, email_verified_at, updated_at)
      values ($1, $2, $3, now(), now())
      on conflict (user_id) do update
      set email = excluded.email,
          password_hash = excluded.password_hash,
          email_verified_at = now(),
          updated_at = now()
    `,
    [userId, email, passwordHash],
  );

  const store = await client.query(
    `select id from public.stores where owner_id = $1 order by created_at asc limit 1`,
    [userId],
  );
  if (store.rows[0]?.id) {
    return { userId, storeId: store.rows[0].id, ownerAction: existing.rows[0] ? 'updated' : 'created', storeAction: 'reused' };
  }

  const createdStore = await client.query(
    `
      insert into public.stores (owner_id, store_name)
      values ($1, 'Staging Outlet')
      returning id
    `,
    [userId],
  );
  return { userId, storeId: createdStore.rows[0].id, ownerAction: existing.rows[0] ? 'updated' : 'created', storeAction: 'created' };
}

async function ensureCashier(client, ownerId, storeId) {
  const email = normalizeEmail(process.env.KAFFEPOS_TEST_CASHIER_EMAIL);
  const passwordHash = await bcrypt.hash(process.env.KAFFEPOS_TEST_CASHIER_PASSWORD, 12);
  const existing = await client.query(
    `
      select c.user_id, p.id
      from public.app_auth_credentials c
      full join public.profiles p on p.id = c.user_id
      where c.email = $1 or p.email = $1
      limit 1
    `,
    [email],
  );
  const userId = existing.rows[0]?.user_id || existing.rows[0]?.id || randomUUID();
  const username = usernameFromEmail(email, '_cashier');

  await client.query(
    `
      insert into public.profiles (id, username, display_name, email, role, account_status)
      values ($1, $2, 'Staging Smoke Cashier', $3, 'cashier', 'active')
      on conflict (id) do update
      set email = excluded.email,
          role = 'cashier',
          account_status = 'active',
          updated_at = now()
    `,
    [userId, username, email],
  );

  await client.query(
    `
      insert into public.app_auth_credentials (user_id, email, password_hash, email_verified_at, updated_at)
      values ($1, $2, $3, now(), now())
      on conflict (user_id) do update
      set email = excluded.email,
          password_hash = excluded.password_hash,
          email_verified_at = now(),
          updated_at = now()
    `,
    [userId, email, passwordHash],
  );

  await client.query(
    `
      insert into public.cashier_outlet_assignments (owner_id, cashier_id, store_id, status, created_by)
      values ($1, $2, $3, 'active', $1)
      on conflict (owner_id, cashier_id) do update
      set store_id = excluded.store_id,
          status = 'active',
          updated_at = now()
    `,
    [ownerId, userId, storeId],
  );

  return { cashierAction: existing.rows[0] ? 'updated' : 'created', assignmentAction: 'ensured' };
}

async function verifyLogin(email, password, expectedRole) {
  const { response, data } = await request('/api/auth/login', {
    method: 'POST',
    json: { email, password },
  });
  if (!response.ok) throw new Error(`Login ${expectedRole} smoke gagal HTTP ${response.status}.`);
  if (data?.profile?.role !== expectedRole) throw new Error(`Login smoke tidak menghasilkan role ${expectedRole}.`);
}

async function main() {
  console.log('KaffePOS staging smoke data repair');
  console.log(`Profile: ${process.env.STAGING_PROFILE}`);
  console.log(`Node env: ${process.env.NODE_ENV}`);
  console.log(`API target: ${apiBaseUrl}`);

  await assertRemoteStagingHealth();

  const apiRepair = await repairViaStagingApi();
  if (apiRepair?.ok) {
    await verifyLogin(normalizeEmail(process.env.KAFFEPOS_OWNER_EMAIL), process.env.KAFFEPOS_OWNER_PASSWORD, 'owner_admin');
    await verifyLogin(normalizeEmail(process.env.KAFFEPOS_TEST_CASHIER_EMAIL), process.env.KAFFEPOS_TEST_CASHIER_PASSWORD, 'cashier');
    console.log(`Owner: ${apiRepair.owner}`);
    console.log(`Cashier: ${apiRepair.cashier}`);
    console.log(`Outlet: ${apiRepair.outlet}`);
    console.log(`Cashier assignment: ${apiRepair.assignment}`);
    console.log('Repair complete via staging API; secret values not printed.');
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib tersedia untuk fallback repair DB langsung.');
  const pool = new Pool(parsePostgresConnection(process.env.DATABASE_URL));
  try {
    const outcome = await pool.connect().then(async (client) => {
      try {
        await client.query('begin');
        const owner = await ensureOwner(client);
        const cashier = await ensureCashier(client, owner.userId, owner.storeId);
        await client.query('commit');
        return { ...owner, ...cashier };
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    });

    await verifyLogin(normalizeEmail(process.env.KAFFEPOS_OWNER_EMAIL), process.env.KAFFEPOS_OWNER_PASSWORD, 'owner_admin');
    await verifyLogin(normalizeEmail(process.env.KAFFEPOS_TEST_CASHIER_EMAIL), process.env.KAFFEPOS_TEST_CASHIER_PASSWORD, 'cashier');

    console.log(`Owner: ${outcome.ownerAction}`);
    console.log(`Cashier: ${outcome.cashierAction}`);
    console.log(`Outlet: ${outcome.storeAction}`);
    console.log(`Cashier assignment: ${outcome.assignmentAction}`);
    console.log('Repair complete; secret values not printed.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Repair failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
