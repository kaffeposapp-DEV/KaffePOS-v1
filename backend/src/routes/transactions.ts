/**
 * Transaction routes — list, checkout, void.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  pool,
  withTransaction,
  ApiError,
  requirePermission,
  assertStoreOwned,
  normalizeTransaction,
  toNumber,
  transactionColumns,
  buildPaginationMeta,
  parsePaginationQuery,
  inventoryColumns,
  kitchenOrderColumns,
  broadcastKitchenEvent,
  fetchKitchenOrder,
  insertKitchenEvent,
  createKitchenOrderFromTransaction,
  type KitchenRealtimeEvent,
} from '../core';
import {
  normalizeKitchenStatus,
  terminalKitchenStatuses,
} from '../lib/kitchenStatus';
import {
  convertRecipeQuantityToBase,
  type UnitConversionRecord,
} from '../lib/stockEngine';

const router = Router();
const storeIdSchema = z.string().uuid();

const checkoutItemSchema = z.object({
  name: z.string().trim().min(1),
  qty: z.number().int().positive(),
  price: z.number().nonnegative(),
  menu_item_id: z.string().uuid().optional(),
  note: z.string().trim().optional().nullable(),
  station: z.enum(['kitchen', 'bar', 'dessert', 'other']).optional().nullable(),
  variant: z.string().trim().optional().nullable(),
});

const checkoutSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  date: z.string().datetime(),
  items: z.array(checkoutItemSchema).min(1),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative(),
  discount_label: z.string().trim().optional().nullable(),
  tax: z.number().nonnegative(),
  total: z.number().nonnegative(),
  cogs: z.number().nonnegative().optional(),
  paid: z.number().nonnegative(),
  change: z.number().nonnegative(),
  method: z.string().trim().min(1),
  customer_name: z.string().trim().optional().nullable(),
  cashier: z.string().trim(),
  note: z.string().trim().optional().nullable(),
  source: z.enum(['cashier', 'waiter', 'web', 'app']).optional(),
  table_number: z.string().trim().optional().nullable(),
});

router.get('/api/transactions', requirePermission('can_view_transaction_history'), async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 500, maxLimit: 1000 });
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `
          select ${transactionColumns}
          from public.transactions
          where store_id = $1
          order by date desc, created_at desc
          limit $2 offset $3
        `,
        [storeId, pagination.limit, pagination.offset],
      );
    });

    res.json({
      items: result.rows.map((row: Record<string, unknown>) => normalizeTransaction(row)),
      pagination: buildPaginationMeta({ ...pagination, returned: result.rows.length }),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/transactions/checkout', requirePermission('can_use_pos'), async (req, res, next) => {
  try {
    const payload = checkoutSchema.parse(req.body);

    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);

      const existing = await client.query(
        `select ${transactionColumns} from public.transactions where id = $1 and store_id = $2 limit 1`,
        [payload.id, payload.store_id],
      );
      if (existing.rows[0]) {
        const existingKitchen = await client.query(
          `select id from public.kitchen_orders where store_id = $1 and transaction_id = $2 limit 1`,
          [payload.store_id, payload.id],
        );
        const kitchenOrder = existingKitchen.rows[0]?.id
          ? await fetchKitchenOrder(client, String(existingKitchen.rows[0].id))
          : null;
        return {
          transaction: existing.rows[0],
          kitchenOrder,
          replayed: true,
        };
      }

      const safeSubtotal = Math.max(0, Math.round(payload.subtotal));
      const safeDiscount = Math.min(Math.max(0, Math.round(payload.discount)), safeSubtotal);
      const safeTax = Math.max(0, Math.round(payload.tax));
      const safeTotal = Math.max(0, safeSubtotal - safeDiscount) + safeTax;
      const safePaid = Math.max(0, Math.round(payload.paid));
      const safeChange = Math.max(0, safePaid - safeTotal);

      let computedCogs = 0;
      const conversionResult = await client.query(
        `
          select ingredient_id, from_unit, to_unit, ratio, is_active
          from public.inventory_unit_conversions
          where store_id = $1 and is_active = true
        `,
        [payload.store_id],
      );
      const unitConversions = conversionResult.rows.map((row: Record<string, unknown>) => ({
        ingredient_id: row.ingredient_id == null ? null : String(row.ingredient_id),
        from_unit: String(row.from_unit ?? ''),
        to_unit: String(row.to_unit ?? ''),
        ratio: toNumber(row.ratio),
        is_active: row.is_active !== false,
      })) satisfies UnitConversionRecord[];

      for (const item of payload.items) {
        const qty = Math.max(0, item.qty);
        if (qty <= 0) continue;

        let menuId = item.menu_item_id ?? null;
        if (!menuId) {
          const menuLookup = await client.query(
            `
              select id
              from public.menu_items
              where store_id = $1 and name = $2
              order by created_at asc
              limit 1
            `,
            [payload.store_id, item.name],
          );
          menuId = menuLookup.rows[0]?.id ?? null;
        }

        if (!menuId) continue;

        const menuResult = await client.query(
          `select recipe from public.menu_items where id = $1 and store_id = $2 limit 1`,
          [menuId, payload.store_id],
        );
        const recipe = Array.isArray(menuResult.rows[0]?.recipe) ? menuResult.rows[0].recipe : [];

        for (const recipeItem of recipe) {
          const inventoryId = String(recipeItem?.matId ?? '');
          const inventoryResult = await client.query(
            `
              select ${inventoryColumns}
              from public.inventory
              where id = $1 and store_id = $2
              for update
            `,
            [inventoryId, payload.store_id],
          );

          const inventoryRow = inventoryResult.rows[0];
          if (!inventoryRow) {
            throw new ApiError(400, 'Bahan inventory tidak ditemukan untuk menu yang dijual.');
          }

          let requiredPerServing = 0;
          try {
            requiredPerServing = convertRecipeQuantityToBase({
              ingredientId: inventoryId,
              qty: Math.max(0, toNumber(recipeItem?.qty)),
              fromUnit: typeof recipeItem?.unit_reference === 'string'
                ? recipeItem.unit_reference
                : String(inventoryRow.base_unit ?? inventoryRow.unit ?? 'unit'),
              baseUnit: String(inventoryRow.base_unit ?? inventoryRow.unit ?? 'unit'),
              conversions: unitConversions,
            }).quantity;
          } catch (error) {
            throw new ApiError(400, error instanceof Error ? error.message : 'Konversi satuan resep tidak valid.');
          }

          const requiredQty = requiredPerServing * qty;
          if (requiredQty <= 0) continue;

          const stockBefore = toNumber(inventoryRow.stock);
          if (stockBefore < requiredQty) {
            throw new ApiError(400, `Stok ${inventoryRow.name} tidak cukup untuk checkout.`);
          }

          const stockAfter = stockBefore - requiredQty;
          await client.query(
            `update public.inventory set stock = $1, updated_at = now() where id = $2`,
            [stockAfter, inventoryRow.id],
          );
          await client.query(
            `
              insert into public.transaction_inventory_audit (
                store_id,
                transaction_id,
                inventory_id,
                action,
                qty_delta,
                stock_before,
                stock_after
              ) values ($1, $2, $3, 'sale', $4, $5, $6)
            `,
            [payload.store_id, payload.id, inventoryRow.id, -requiredQty, stockBefore, stockAfter],
          );

          computedCogs += toNumber(inventoryRow.cost_per_unit) * requiredQty;
        }
      }

      const insertResult = await client.query(
        `
          insert into public.transactions (
            id,
            store_id,
            date,
            items,
            subtotal,
            discount,
            discount_label,
            tax,
            total,
            cogs,
            paid,
            change,
            method,
            customer_name,
            cashier,
            note,
            is_void,
            created_at
          ) values (
            $1, $2, $3::timestamptz, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false, now()
          )
          returning ${transactionColumns}
        `,
        [
          payload.id,
          payload.store_id,
          payload.date,
          JSON.stringify(payload.items),
          safeSubtotal,
          safeDiscount,
          payload.discount_label ?? null,
          safeTax,
          safeTotal,
          Math.max(Math.round(payload.cogs ?? Math.round(computedCogs)), Math.round(computedCogs)),
          safePaid,
          safeChange,
          payload.method,
          payload.customer_name ?? null,
          payload.cashier,
          payload.note ?? null,
        ],
      );

      const kitchenOrder = await createKitchenOrderFromTransaction(client, payload, req.authUser!);

      return {
        transaction: insertResult.rows[0],
        kitchenOrder,
        replayed: false,
      };
    });

    if (result.kitchenOrder && !result.replayed) {
      const kitchenOrder = result.kitchenOrder as Record<string, unknown>;
      broadcastKitchenEvent({
        id: randomUUID(),
        type: 'order_created',
        store_id: payload.store_id,
        order_id: String(kitchenOrder.id),
        created_at: new Date().toISOString(),
        payload: { order: kitchenOrder, transactionId: payload.id },
      });
    }

    res.status(result.replayed ? 200 : 201).json({
      ...normalizeTransaction(result.transaction),
      kitchen_order: result.kitchenOrder,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/transactions/:id/void', requirePermission('can_void_transaction'), async (req, res, next) => {
  try {
    const transactionId = req.params.id;
    const body = z
      .object({
        store_id: z.string().uuid(),
        reason: z.string().trim().optional().nullable(),
        void_by: z.string().trim().optional().nullable(),
      })
      .parse(req.body);

    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, body.store_id, req.authUser!.id);

      const currentResult = await client.query(
        `
          select ${transactionColumns}
          from public.transactions
          where id = $1 and store_id = $2
          for update
        `,
        [transactionId, body.store_id],
      );
      const current = currentResult.rows[0];
      if (!current) {
        throw new ApiError(404, 'Transaksi tidak ditemukan.');
      }
      if (current.is_void) {
        return current;
      }

      const audits = await client.query(
        `
          select inventory_id, qty_delta
          from public.transaction_inventory_audit
          where transaction_id = $1
            and action = 'sale'
          order by created_at asc, id asc
        `,
        [transactionId],
      );

      for (const audit of audits.rows) {
        const inventoryResult = await client.query(
          `
            select ${inventoryColumns}
            from public.inventory
            where id = $1 and store_id = $2
            for update
          `,
          [audit.inventory_id, body.store_id],
        );
        const inventoryRow = inventoryResult.rows[0];
        if (!inventoryRow) continue;

        const stockBefore = toNumber(inventoryRow.stock);
        const restoreQty = Math.abs(toNumber(audit.qty_delta));
        const stockAfter = stockBefore + restoreQty;

        await client.query(
          `update public.inventory set stock = $1, updated_at = now() where id = $2`,
          [stockAfter, inventoryRow.id],
        );
        await client.query(
          `
            insert into public.transaction_inventory_audit (
              store_id,
              transaction_id,
              inventory_id,
              action,
              qty_delta,
              stock_before,
              stock_after
            ) values ($1, $2, $3, 'void', $4, $5, $6)
          `,
          [body.store_id, transactionId, inventoryRow.id, restoreQty, stockBefore, stockAfter],
        );
      }

      const updated = await client.query(
        `
          update public.transactions
          set
            is_void = true,
            void_reason = $1,
            void_at = now(),
            void_by = $2
          where id = $3 and store_id = $4
          returning ${transactionColumns}
        `,
        [body.reason ?? null, body.void_by ?? null, transactionId, body.store_id],
      );

      const kitchenResult = await client.query(
        `
          select ${kitchenOrderColumns}
          from public.kitchen_orders
          where store_id = $1 and transaction_id = $2
          for update
        `,
        [body.store_id, transactionId],
      );
      const kitchenOrder = kitchenResult.rows[0];
      let kitchenEvent: KitchenRealtimeEvent | null = null;
      let fullKitchenOrder: Record<string, unknown> | null = null;

      if (kitchenOrder && !terminalKitchenStatuses.has(normalizeKitchenStatus(String(kitchenOrder.overall_status)))) {
        const oldStatus = normalizeKitchenStatus(String(kitchenOrder.overall_status));
        await client.query(
          `
            update public.kitchen_orders
            set
              overall_status = 'cancelled',
              status_version = status_version + 1,
              cancelled_reason = $1,
              updated_at = now()
            where id = $2 and store_id = $3
          `,
          [body.reason ?? null, kitchenOrder.id, body.store_id],
        );
        await client.query(
          `
            update public.kitchen_order_items
            set item_status = 'cancelled', status_version = status_version + 1, updated_at = now()
            where order_id = $1 and item_status not in ('served', 'completed', 'cancelled')
          `,
          [kitchenOrder.id],
        );
        const eventMeta = await insertKitchenEvent(client, {
          storeId: body.store_id,
          orderId: kitchenOrder.id,
          eventType: 'order_cancelled',
          oldStatus,
          newStatus: 'cancelled',
          changedBy: req.authUser!.id,
          changedByName: body.void_by ?? req.authUser!.email ?? null,
          data: { reason: body.reason ?? null, transactionId },
        });
        fullKitchenOrder = await fetchKitchenOrder(client, kitchenOrder.id);
        kitchenEvent = {
          id: eventMeta.id,
          type: 'order_cancelled',
          store_id: body.store_id,
          order_id: kitchenOrder.id,
          created_at: eventMeta.created_at,
          payload: { order: fullKitchenOrder, transactionId },
        };
      }

      return {
        transaction: updated.rows[0],
        kitchenOrder: fullKitchenOrder,
        kitchenEvent,
      };
    });

    if (result.kitchenEvent) broadcastKitchenEvent(result.kitchenEvent);
    res.json({
      ...normalizeTransaction(result.transaction),
      kitchen_order: result.kitchenOrder,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
