import { randomUUID, timingSafeEqual } from 'node:crypto';
import { type NextFunction, type Request, type Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, withTransaction, ApiError, normalizeEmail, resolveUniqueUsername } from '../core';

const router = Router();

const stagingSmokeRepairSchema = z.object({
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8),
  cashierEmail: z.string().email(),
  cashierPassword: z.string().min(8),
});

function isMinimalStagingEnabled() {
  return process.env.NODE_ENV === 'staging' && process.env.STAGING_PROFILE === 'minimal';
}

function getRepairToken() {
  return process.env.STAGING_REPAIR_TOKEN || '';
}

function safeTokenEquals(received: string, expected: string) {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function ensureOwner(input: { email: string; password: string }) {
  return withTransaction(async (client) => {
    const email = normalizeEmail(input.email);
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
    const userId = (existing.rows[0]?.user_id as string | undefined) || (existing.rows[0]?.id as string | undefined) || randomUUID();
    const username = await resolveUniqueUsername(client, email.split('@')[0] || 'staging_owner');
    const passwordHash = await bcrypt.hash(input.password, 12);

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
      return { userId, storeId: store.rows[0].id as string, ownerAction: existing.rows[0] ? 'updated' : 'created', storeAction: 'reused' };
    }

    const createdStore = await client.query(
      `
        insert into public.stores (owner_id, store_name)
        values ($1, 'Staging Outlet')
        returning id
      `,
      [userId],
    );
    return { userId, storeId: createdStore.rows[0].id as string, ownerAction: existing.rows[0] ? 'updated' : 'created', storeAction: 'created' };
  });
}

async function ensureCashier(input: { ownerId: string; storeId: string; email: string; password: string }) {
  return withTransaction(async (client) => {
    const email = normalizeEmail(input.email);
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
    const userId = (existing.rows[0]?.user_id as string | undefined) || (existing.rows[0]?.id as string | undefined) || randomUUID();
    const username = await resolveUniqueUsername(client, `${email.split('@')[0] || 'staging'}_cashier`);
    const passwordHash = await bcrypt.hash(input.password, 12);

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
      [input.ownerId, userId, input.storeId],
    );

    return { cashierAction: existing.rows[0] ? 'updated' : 'created', assignmentAction: 'ensured' };
  });
}

async function handleSmokeDataRepair(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isMinimalStagingEnabled()) {
      throw new ApiError(404, 'Not found.');
    }
    const expectedToken = getRepairToken();
    const receivedToken = String(req.header('x-kaffepos-staging-repair-token') || '');
    if (!expectedToken) {
      throw new ApiError(503, 'Staging repair token is not configured.');
    }
    if (!receivedToken || !safeTokenEquals(receivedToken, expectedToken)) {
      throw new ApiError(403, 'Invalid staging repair token.');
    }

    const payload = stagingSmokeRepairSchema.parse(req.body);
    const owner = await ensureOwner({ email: payload.ownerEmail, password: payload.ownerPassword });
    const cashier = await ensureCashier({
      ownerId: owner.userId,
      storeId: owner.storeId,
      email: payload.cashierEmail,
      password: payload.cashierPassword,
    });

    await pool.query('select 1');
    res.json({
      ok: true,
      owner: owner.ownerAction,
      outlet: owner.storeAction,
      cashier: cashier.cashierAction,
      assignment: cashier.assignmentAction,
    });
  } catch (error) {
    next(error);
  }
}

router.post('/staging/smoke-data/repair', handleSmokeDataRepair);
router.post('/api/staging/smoke-data/repair', handleSmokeDataRepair);

export default router;
