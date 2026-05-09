/**
 * Finance routes — expenses, cash flow, cash register.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  pool,
  withTransaction,
  ApiError,
  requirePermission,
  assertStoreOwned,
  pickDefined,
  buildUpdateClause,
  buildPaginationMeta,
  parsePaginationQuery,
  expenseColumns,
  cashFlowColumns,
  cashRegisterColumns,
} from '../core';

const router = Router();
const storeIdSchema = z.string().uuid();

const expenseWriteSchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  date: z.string().datetime().optional(),
  description: z.string().trim().min(1),
  amount: z.number().positive(),
  category: z.string().trim().min(1).default('Operasional'),
  cashier: z.string().trim().optional().nullable(),
  source: z.enum(['cashier', 'inventory']).default('cashier'),
});
const cashFlowWriteSchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  date: z.string().datetime().optional(),
  type: z.enum(['in', 'out']),
  amount: z.number().positive(),
  description: z.string().trim().optional().nullable(),
  cashier: z.string().trim().optional().nullable(),
});
const cashRegisterWriteSchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  date: z.string().datetime().optional(),
  amount: z.number().nonnegative(),
  note: z.string().trim().optional().nullable(),
  opened_by: z.string().trim().min(1),
});

router.get('/api/expenses', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 500, maxLimit: 1000 });
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `
          select ${expenseColumns}
          from public.expenses
          where store_id = $1
          order by date desc, created_at desc
          limit $2 offset $3
        `,
        [storeId, pagination.limit, pagination.offset],
      );
    });

    res.json({ items: result.rows, pagination: buildPaginationMeta({ ...pagination, returned: result.rows.length }) });
  } catch (error) {
    next(error);
  }
});

router.post('/api/expenses', requirePermission('can_view_reports'), async (req, res, next) => {
  try {
    const payload = expenseWriteSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      return client.query(
        `
          insert into public.expenses (
            id, store_id, date, description, amount, category, cashier, source
          ) values (
            coalesce($1, gen_random_uuid()),
            $2, coalesce($3::timestamptz, now()), $4, $5, $6, $7, $8
          )
          returning ${expenseColumns}
        `,
        [
          payload.id ?? null,
          payload.store_id,
          payload.date ?? null,
          payload.description,
          Math.round(payload.amount),
          payload.category,
          payload.cashier ?? null,
          payload.source,
        ],
      );
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/api/expenses/:id', requirePermission('can_view_reports'), async (req, res, next) => {
  try {
    const expenseId = storeIdSchema.parse(req.params.id);
    await withTransaction(async (client) => {
      const result = await client.query(
        `
          delete from public.expenses e
          using public.stores s
          where e.store_id = s.id
            and e.id = $1
            and s.owner_id = $2
          returning e.id
        `,
        [expenseId, req.authUser!.id],
      );
      if (!result.rows[0]) {
        throw new ApiError(404, 'Pengeluaran tidak ditemukan.');
      }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/api/cash-flow', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 500, maxLimit: 1000 });
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `
          select ${cashFlowColumns}
          from public.cash_flow
          where store_id = $1
          order by date desc, created_at desc
          limit $2 offset $3
        `,
        [storeId, pagination.limit, pagination.offset],
      );
    });

    res.json({ items: result.rows, pagination: buildPaginationMeta({ ...pagination, returned: result.rows.length }) });
  } catch (error) {
    next(error);
  }
});

router.post('/api/cash-flow', requirePermission('can_view_reports'), async (req, res, next) => {
  try {
    const payload = cashFlowWriteSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      return client.query(
        `
          insert into public.cash_flow (
            id, store_id, date, type, amount, description, cashier
          ) values (
            coalesce($1, gen_random_uuid()),
            $2, coalesce($3::timestamptz, now()), $4, $5, $6, $7
          )
          returning ${cashFlowColumns}
        `,
        [
          payload.id ?? null,
          payload.store_id,
          payload.date ?? null,
          payload.type,
          Math.round(payload.amount),
          payload.description ?? null,
          payload.cashier ?? null,
        ],
      );
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get('/api/cash-register', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 500, maxLimit: 1000 });
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `
          select ${cashRegisterColumns}
          from public.cash_register
          where store_id = $1
          order by date desc, created_at desc
          limit $2 offset $3
        `,
        [storeId, pagination.limit, pagination.offset],
      );
    });

    res.json({ items: result.rows, pagination: buildPaginationMeta({ ...pagination, returned: result.rows.length }) });
  } catch (error) {
    next(error);
  }
});

router.post('/api/cash-register', async (req, res, next) => {
  try {
    const payload = cashRegisterWriteSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      return client.query(
        `
          insert into public.cash_register (
            id, store_id, date, amount, note, opened_by
          ) values (
            coalesce($1, gen_random_uuid()),
            $2, coalesce($3::timestamptz, now()), $4, $5, $6
          )
          returning ${cashRegisterColumns}
        `,
        [
          payload.id ?? null,
          payload.store_id,
          payload.date ?? null,
          Math.round(payload.amount),
          payload.note ?? null,
          payload.opened_by,
        ],
      );
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.patch('/api/cash-register/:id', async (req, res, next) => {
  try {
    const registerId = storeIdSchema.parse(req.params.id);
    const payload = pickDefined(req.body as Record<string, unknown>, ['amount', 'note', 'opened_by', 'date']);
    const { clause, values } = buildUpdateClause(payload);

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `
          select cr.id
          from public.cash_register cr
          join public.stores s on s.id = cr.store_id
          where cr.id = $1 and s.owner_id = $2
          limit 1
        `,
        [registerId, req.authUser!.id],
      );
      if (!existing.rows[0]) {
        throw new ApiError(404, 'Register kasir tidak ditemukan.');
      }

      return client.query(
        `
          update public.cash_register
          set ${clause}
          where id = $${values.length + 1}
          returning ${cashRegisterColumns}
        `,
        [...values, registerId],
      );
    });

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
