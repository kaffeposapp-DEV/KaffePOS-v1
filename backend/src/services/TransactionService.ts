import {
  withTransaction,
  ApiError,
  assertStoreOwned,
  normalizeTransaction,
  toNumber,
  transactionColumns,
  inventoryColumns,
  kitchenOrderColumns,
  fetchKitchenOrder,
  insertKitchenEvent,
  createKitchenOrderFromTransaction,
  insertNotification,
  type PoolClient,
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

import { checkChallengeCompletionForUser } from '../routes/challenges';

async function getStoreNotificationContext(client: PoolClient, storeId: string) {
  const result = await client.query(
    `select id, owner_id, store_name from public.stores where id = $1 limit 1`,
    [storeId],
  );
  const row = result.rows[0];
  return row
    ? { ownerId: String(row.owner_id), storeName: String(row.store_name || 'Outlet') }
    : null;
}

async function notificationExists(client: PoolClient, input: {
  userId: string;
  storeId: string;
  type: string;
  dedupeKey: string;
  hours?: number;
}) {
  const result = await client.query(
    `
      select id
      from public.notifications
      where user_id = $1
        and store_id = $2
        and type = $3
        and metadata->>'dedupeKey' = $4
        and created_at >= now() - ($5::text || ' hours')::interval
      limit 1
    `,
    [input.userId, input.storeId, input.type, input.dedupeKey, input.hours ?? 24],
  );
  return Boolean(result.rows[0]);
}

async function insertDedupedNotification(client: PoolClient, input: {
  userId: string;
  storeId: string;
  title: string;
  message: string;
  type: string;
  category: string;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
  hours?: number;
}) {
  const exists = await notificationExists(client, {
    userId: input.userId,
    storeId: input.storeId,
    type: input.type,
    dedupeKey: input.dedupeKey,
    hours: input.hours,
  });
  if (exists) return;

  await insertNotification(
    client,
    input.userId,
    input.title,
    input.message,
    input.type,
    {
      category: input.category,
      dedupeKey: input.dedupeKey,
      ...(input.metadata ?? {}),
    },
    input.storeId,
  );
}

async function notifyAfterCheckout(client: PoolClient, input: {
  storeId: string;
  transactionId: string;
  cashierUserId: string;
  cashierName: string;
  total: number;
  date: string;
}) {
  const store = await getStoreNotificationContext(client, input.storeId);
  if (!store) return;

  const currency = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  });

  const lowStock = await client.query(
    `
      select distinct i.id, i.name, i.stock, i.unit, i.min_stock
      from public.transaction_inventory_audit a
      join public.inventory i on i.id = a.inventory_id
      where a.store_id = $1
        and a.transaction_id = $2
        and a.action = 'sale'
        and i.is_active = true
        and i.stock <= i.min_stock
      order by i.name asc
      limit 5
    `,
    [input.storeId, input.transactionId],
  );

  for (const item of lowStock.rows) {
    await insertDedupedNotification(client, {
      userId: store.ownerId,
      storeId: input.storeId,
      title: 'Stok perlu restock',
      message: `${item.name} tersisa ${toNumber(item.stock)} ${item.unit || ''}, sudah di bawah batas minimum ${toNumber(item.min_stock)}.`,
      type: 'stock',
      category: 'stock',
      dedupeKey: `low-stock:${item.id}`,
      metadata: {
        inventoryId: item.id,
        stock: toNumber(item.stock),
        minStock: toNumber(item.min_stock),
        unit: item.unit ?? null,
      },
      hours: 12,
    });
  }

  const txDate = new Date(input.date);
  const dayKey = Number.isFinite(txDate.getTime())
    ? txDate.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const hour = Number.isFinite(txDate.getTime()) ? txDate.getHours() : new Date().getHours();
  const daily = await client.query(
    `
      select count(*)::int as count, coalesce(sum(total), 0)::numeric as revenue
      from public.transactions
      where store_id = $1
        and is_void = false
        and date >= $2::date
        and date < ($2::date + interval '1 day')
    `,
    [input.storeId, dayKey],
  );
  const todayCount = Number(daily.rows[0]?.count ?? 0);
  const todayRevenue = toNumber(daily.rows[0]?.revenue);

  if (hour >= 20 && todayCount > 0) {
    await insertDedupedNotification(client, {
      userId: store.ownerId,
      storeId: input.storeId,
      title: 'Ringkasan penjualan hari ini',
      message: `${store.storeName}: ${todayCount} transaksi dengan omzet ${currency.format(todayRevenue)}.`,
      type: 'business_alert',
      category: 'business_alert',
      dedupeKey: `daily-summary:${dayKey}`,
      metadata: { date: dayKey, transactions: todayCount, revenue: todayRevenue },
      hours: 36,
    });
  }

  if ([10, 25, 50, 100].includes(todayCount)) {
    await insertDedupedNotification(client, {
      userId: store.ownerId,
      storeId: input.storeId,
      title: 'Kopi Score milestone tercapai',
      message: `${store.storeName} mencapai ${todayCount} transaksi hari ini. Momentum operasional sedang bagus.`,
      type: 'gamification',
      category: 'gamification',
      dedupeKey: `kopi-score:transactions:${dayKey}:${todayCount}`,
      metadata: { date: dayKey, transactions: todayCount },
      hours: 48,
    });
  }

  const staffCount = await client.query(
    `
      select count(*)::int as count
      from public.transactions
      where store_id = $1
        and is_void = false
        and cashier = $2
        and date >= date_trunc('month', $3::timestamptz)
        and date < date_trunc('month', $3::timestamptz) + interval '1 month'
    `,
    [input.storeId, input.cashierName, input.date],
  );
  const monthlyStaffTransactions = Number(staffCount.rows[0]?.count ?? 0);
  if ([10, 25, 50, 100].includes(monthlyStaffTransactions)) {
    await insertDedupedNotification(client, {
      userId: input.cashierUserId,
      storeId: input.storeId,
      title: 'Level kasir naik',
      message: `${input.cashierName} sudah mencatat ${monthlyStaffTransactions} transaksi bulan ini.`,
      type: 'gamification',
      category: 'gamification',
      dedupeKey: `staff-level:${input.cashierUserId}:${dayKey}:${monthlyStaffTransactions}`,
      metadata: { transactions: monthlyStaffTransactions },
      hours: 48,
    });
  }
}

export class TransactionService {
  static async listTransactions(storeId: string, userId: string, pagination: { limit: number; offset: number }) {
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, userId);
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
    return result.rows.map((row: Record<string, unknown>) => normalizeTransaction(row));
  }

  static async checkout(payload: any, authUser: { id: string; email: string | null }) {
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, authUser.id);

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

      const kitchenOrder = await createKitchenOrderFromTransaction(client, payload, authUser);
      await checkChallengeCompletionForUser(client, {
        storeId: payload.store_id,
        userId: authUser.id,
        metrics: { transactionId: payload.id },
      });
      await notifyAfterCheckout(client, {
        storeId: payload.store_id,
        transactionId: payload.id,
        cashierUserId: authUser.id,
        cashierName: payload.cashier,
        total: safeTotal,
        date: payload.date,
      });

      return {
        transaction: insertResult.rows[0],
        kitchenOrder,
        replayed: false,
      };
    });

    return result;
  }

  static async voidTransaction(transactionId: string, body: any, authUser: { id: string; email: string | null }) {
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, body.store_id, authUser.id);

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
        return { transaction: current, kitchenOrder: null, kitchenEvent: null };
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
          changedBy: authUser.id,
          changedByName: body.void_by ?? authUser.email ?? null,
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

    return result;
  }
}
