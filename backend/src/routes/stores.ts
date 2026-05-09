/**
 * Store & Cashier management routes.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  pool,
  withTransaction,
  ApiError,
  requirePermission,
  normalizeStore,
  serializeCashier,
  assertStoreOwned,
  resolveUniqueUsername,
  pickDefined,
  buildUpdateClause,
  storeColumns,
} from '../core';
import { revokeUserSessions } from '../core/session';
import {
  cashierCreateInputSchema,
  cashierUpdateInputSchema,
  normalizeCashierStatus,
} from '../lib/cashierManagement';

const router = Router();
const storeIdSchema = z.string().uuid();

router.get('/api/stores', async (req, res, next) => {
  try {
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : null;
    const cashierFilter = req.authUser!.role === 'cashier'
      ? `
          and exists (
            select 1
            from public.cashier_outlet_assignments a
            join public.profiles p on p.id = a.cashier_id
            where a.store_id = public.stores.id
              and a.cashier_id = $1
              and a.status = 'active'
              and p.account_status = 'active'
          )
        `
      : `and owner_id = $1`;
    const query = storeId
      ? {
          text: `select ${storeColumns} from public.stores where id = $2 ${cashierFilter} order by created_at asc`,
          values: [req.authUser!.id, storeId],
        }
      : {
          text: `select ${storeColumns} from public.stores where true ${cashierFilter} order by created_at asc`,
          values: [req.authUser!.id],
        };

    const result = await pool.query(query.text, query.values);
    res.json({ items: result.rows.map((row: Record<string, unknown>) => normalizeStore(row)) });
  } catch (error) {
    next(error);
  }
});

router.post('/api/stores', requirePermission('can_manage_settings'), async (req, res, next) => {
  try {
    const payload = pickDefined(req.body as Record<string, unknown>, ['store_name']);
    const storeName =
      typeof payload.store_name === 'string' && payload.store_name.trim()
        ? payload.store_name.trim()
        : `Kedai ${req.authUser!.email?.split('@')[0] || 'Kopi'}`;

    const result = await pool.query(
      `
        insert into public.stores (owner_id, store_name)
        values ($1, $2)
        returning ${storeColumns}
      `,
      [req.authUser!.id, storeName],
    );

    res.status(201).json(normalizeStore(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

router.patch('/api/stores/:storeId', requirePermission('can_manage_settings'), async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.params.storeId);
    const payload = pickDefined(req.body as Record<string, unknown>, [
      'store_name',
      'address',
      'whatsapp',
      'tax_percent',
      'receipt_header',
      'receipt_footer',
      'logo_url',
      'logo_base64',
      'logo_position',
      'logo_size',
      'show_logo_on_receipt',
      'currency',
      'tagline',
      'email',
      'website',
      'paper_width',
      'receipt_font_size',
      'receipt_show_address',
      'receipt_show_whatsapp',
      'receipt_show_tax',
      'receipt_show_cashier',
      'receipt_show_trx_id',
      'receipt_divider',
      'receipt_custom_line1',
      'receipt_custom_line2',
      'timezone',
    ]);
    const { clause, values } = buildUpdateClause(payload);

    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `
          update public.stores
          set ${clause}, updated_at = now()
          where id = $${values.length + 1} and owner_id = $${values.length + 2}
          returning ${storeColumns}
        `,
        [...values, storeId, req.authUser!.id],
      );
    });

    res.json(normalizeStore(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

router.get('/api/cashiers', requirePermission('can_manage_users'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        select
          p.id,
          p.display_name,
          p.email,
          p.username,
          p.role,
          p.account_status,
          p.created_at,
          p.updated_at,
          a.store_id,
          s.store_name
        from public.cashier_outlet_assignments a
        join public.profiles p on p.id = a.cashier_id
        join public.stores s on s.id = a.store_id
        where a.owner_id = $1
          and p.role = 'cashier'
        order by p.created_at desc
      `,
      [req.authUser!.id],
    );

    res.json({ items: result.rows.map((row: Record<string, unknown>) => serializeCashier(row)) });
  } catch (error) {
    next(error);
  }
});

router.post('/api/cashiers', requirePermission('can_manage_users'), async (req, res, next) => {
  try {
    const payload = cashierCreateInputSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.storeId, req.authUser!.id);

      const existingEmail = await client.query(
        `select user_id from public.app_auth_credentials where email = $1 limit 1`,
        [payload.email],
      );
      if (existingEmail.rows[0]) {
        throw new ApiError(409, 'Email kasir sudah digunakan.');
      }

      const userId = randomUUID();
      const username = await resolveUniqueUsername(client, payload.email.split('@')[0] || payload.displayName);
      const passwordHash = await bcrypt.hash(payload.password, 12);
      const status = normalizeCashierStatus(payload.status);

      await client.query(
        `
          insert into public.profiles (id, username, display_name, email, role, account_status)
          values ($1, $2, $3, $4, 'cashier', $5)
        `,
        [userId, username, payload.displayName, payload.email, status],
      );

      await client.query(
        `
          insert into public.app_auth_credentials (
            user_id,
            email,
            password_hash,
            email_verified_at,
            updated_at
          ) values ($1, $2, $3, now(), now())
        `,
        [userId, payload.email, passwordHash],
      );

      await client.query(
        `
          insert into public.cashier_outlet_assignments (
            owner_id,
            cashier_id,
            store_id,
            status,
            created_by
          ) values ($1, $2, $3, $4, $1)
        `,
        [req.authUser!.id, userId, payload.storeId, status],
      );

      const cashier = await client.query(
        `
          select
            p.id,
            p.display_name,
            p.email,
            p.username,
            p.role,
            p.account_status,
            p.created_at,
            p.updated_at,
            a.store_id,
            s.store_name
          from public.cashier_outlet_assignments a
          join public.profiles p on p.id = a.cashier_id
          join public.stores s on s.id = a.store_id
          where a.owner_id = $1 and a.cashier_id = $2
          limit 1
        `,
        [req.authUser!.id, userId],
      );

      return serializeCashier(cashier.rows[0]);
    });

    res.status(201).json({ cashier: result });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/cashiers/:cashierId', requirePermission('can_manage_users'), async (req, res, next) => {
  try {
    const cashierId = storeIdSchema.parse(req.params.cashierId);
    const payload = cashierUpdateInputSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `
          select p.id, p.email, p.account_status
          from public.cashier_outlet_assignments a
          join public.profiles p on p.id = a.cashier_id
          where a.owner_id = $1
            and a.cashier_id = $2
            and p.role = 'cashier'
          limit 1
        `,
        [req.authUser!.id, cashierId],
      );
      if (!existing.rows[0]) {
        throw new ApiError(404, 'Kasir tidak ditemukan.');
      }

      if (payload.storeId) {
        await assertStoreOwned(client, payload.storeId, req.authUser!.id);
      }

      if (payload.email && payload.email !== existing.rows[0].email) {
        const conflict = await client.query(
          `select user_id from public.app_auth_credentials where email = $1 and user_id <> $2 limit 1`,
          [payload.email, cashierId],
        );
        if (conflict.rows[0]) {
          throw new ApiError(409, 'Email kasir sudah digunakan.');
        }
      }

      const profileUpdates: Record<string, unknown> = {};
      if (payload.displayName) profileUpdates.display_name = payload.displayName;
      if (payload.email) profileUpdates.email = payload.email;
      if (payload.status) profileUpdates.account_status = normalizeCashierStatus(payload.status);
      if (Object.keys(profileUpdates).length > 0) {
        const { clause, values } = buildUpdateClause(profileUpdates);
        await client.query(
          `
            update public.profiles
            set ${clause}, updated_at = now()
            where id = $${values.length + 1}
              and role = 'cashier'
          `,
          [...values, cashierId],
        );
      }

      const credentialUpdates: Record<string, unknown> = {};
      if (payload.email) credentialUpdates.email = payload.email;
      if (payload.password) credentialUpdates.password_hash = await bcrypt.hash(payload.password, 12);
      if (Object.keys(credentialUpdates).length > 0) {
        credentialUpdates.updated_at = new Date().toISOString();
        const { clause, values } = buildUpdateClause(credentialUpdates);
        await client.query(
          `
            update public.app_auth_credentials
            set ${clause}
            where user_id = $${values.length + 1}
          `,
          [...values, cashierId],
        );
      }

      const assignmentUpdates: Record<string, unknown> = {};
      if (payload.storeId) assignmentUpdates.store_id = payload.storeId;
      if (payload.status) assignmentUpdates.status = normalizeCashierStatus(payload.status);
      if (Object.keys(assignmentUpdates).length > 0) {
        const { clause, values } = buildUpdateClause(assignmentUpdates);
        await client.query(
          `
            update public.cashier_outlet_assignments
            set ${clause}, updated_at = now()
            where owner_id = $${values.length + 1}
              and cashier_id = $${values.length + 2}
          `,
          [...values, req.authUser!.id, cashierId],
        );
      }

      if (payload.status === 'inactive') {
        await revokeUserSessions(client, cashierId);
      }

      const cashier = await client.query(
        `
          select
            p.id,
            p.display_name,
            p.email,
            p.username,
            p.role,
            p.account_status,
            p.created_at,
            p.updated_at,
            a.store_id,
            s.store_name
          from public.cashier_outlet_assignments a
          join public.profiles p on p.id = a.cashier_id
          join public.stores s on s.id = a.store_id
          where a.owner_id = $1 and a.cashier_id = $2
          limit 1
        `,
        [req.authUser!.id, cashierId],
      );

      return serializeCashier(cashier.rows[0]);
    });

    res.json({ cashier: result });
  } catch (error) {
    next(error);
  }
});

export default router;
