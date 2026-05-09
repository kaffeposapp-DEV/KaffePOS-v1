/**
 * Kitchen domain helpers — types, SSE, normalizers, DB ops.
 * Extracted from monolith index.ts.
 */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from './db';
import type { Response } from 'express';
import { normalizeKitchenStatus, type KitchenStatus } from '../lib/kitchenStatus';
import { log, serializeError } from './errors';
import { kitchenOrderColumns, kitchenOrderItemColumns } from './helpers';

// Re-export for convenience
export { kitchenOrderColumns, kitchenOrderItemColumns };


// ─── Types ───────────────────────────────────────────────────────────
export type KitchenRealtimeEventType =
  | 'order_created'
  | 'order_updated'
  | 'order_cancelled'
  | 'item_status_changed'
  | 'order_status_changed'
  | 'snapshot_required';

export type KitchenRealtimeEvent = {
  id: string;
  type: KitchenRealtimeEventType;
  store_id: string;
  order_id?: string | null;
  created_at: string;
  payload?: Record<string, unknown>;
};

export type KitchenSseClient = {
  id: string;
  storeId: string;
  userId: string;
  res: Response;
  keepAlive: NodeJS.Timeout;
};

// ─── SSE client registry (singleton) ─────────────────────────────────
export const kitchenClients = new Map<string, Set<KitchenSseClient>>();

// ─── Normalizers ─────────────────────────────────────────────────────
export function normalizeKitchenItem(row: Record<string, unknown>) {
  return {
    ...row,
    qty: Number(row.qty ?? 0),
    status_version: Number(row.status_version ?? 0),
  };
}

export function normalizeKitchenOrder(row: Record<string, unknown>, items: Record<string, unknown>[] = []) {
  return {
    ...row,
    status_version: Number(row.status_version ?? 0),
    items: items.map(normalizeKitchenItem),
  };
}

export function inferKitchenStation(category: unknown) {
  const value = String(category ?? '').toLowerCase();
  if (value.includes('dessert') || value.includes('cake') || value.includes('pastry')) return 'dessert';
  if (
    value.includes('coffee') ||
    value.includes('kopi') ||
    value.includes('drink') ||
    value.includes('minum') ||
    value.includes('tea') ||
    value.includes('bar')
  ) {
    return 'bar';
  }
  if (value.includes('snack') || value.includes('food') || value.includes('makan') || value.includes('kitchen')) return 'kitchen';
  return 'other';
}

// ─── SSE helpers ─────────────────────────────────────────────────────
export function writeSse(res: Response, event: KitchenRealtimeEvent | { type: 'ping'; ts: string }) {
  const id = 'id' in event ? event.id : `ping-${Date.now()}`;
  res.write(`id: ${id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function broadcastKitchenEvent(event: KitchenRealtimeEvent) {
  const clients = kitchenClients.get(event.store_id);
  if (!clients?.size) return;

  for (const client of clients) {
    try {
      writeSse(client.res, event);
    } catch (error) {
      log('warn', 'kitchen.sse_write_failed', {
        storeId: event.store_id,
        clientId: client.id,
        error: serializeError(error),
      });
    }
  }
}

// ─── DB helpers ──────────────────────────────────────────────────────
export async function fetchKitchenOrder(client: PoolClient, orderId: string) {
  const orderResult = await client.query(
    `select ${kitchenOrderColumns} from public.kitchen_orders where id = $1 limit 1`,
    [orderId],
  );
  const order = orderResult.rows[0];
  if (!order) return null;

  const itemsResult = await client.query(
    `select ${kitchenOrderItemColumns} from public.kitchen_order_items where order_id = $1 order by created_at asc, id asc`,
    [orderId],
  );

  return normalizeKitchenOrder(order, itemsResult.rows);
}

export async function insertKitchenEvent(
  client: PoolClient,
  payload: {
    storeId: string;
    orderId: string;
    orderItemId?: string | null;
    eventType: KitchenRealtimeEventType;
    oldStatus?: string | null;
    newStatus?: string | null;
    changedBy?: string | null;
    changedByName?: string | null;
    data?: Record<string, unknown>;
  },
) {
  const result = await client.query(
    `
      insert into public.kitchen_order_events (
        store_id,
        order_id,
        order_item_id,
        event_type,
        old_status,
        new_status,
        changed_by,
        changed_by_name,
        payload
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      returning id, created_at
    `,
    [
      payload.storeId,
      payload.orderId,
      payload.orderItemId ?? null,
      payload.eventType,
      payload.oldStatus ?? null,
      payload.newStatus ?? null,
      payload.changedBy ?? null,
      payload.changedByName ?? null,
      JSON.stringify(payload.data ?? {}),
    ],
  );

  return {
    id: String(result.rows[0]?.id ?? randomUUID()),
    created_at: new Date(result.rows[0]?.created_at ?? Date.now()).toISOString(),
  };
}

export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  role?: string | null;
};

export async function createKitchenOrderFromTransaction(
  client: PoolClient,
  payload: {
    id: string;
    store_id: string;
    source?: 'cashier' | 'waiter' | 'web' | 'app';
    customer_name?: string | null;
    table_number?: string | null;
    cashier?: string | null;
    items: Array<{
      name: string;
      qty: number;
      menu_item_id?: string;
      note?: string | null;
      station?: 'kitchen' | 'bar' | 'dessert' | 'other' | null;
    }>;
  },
  changedBy: AuthenticatedUser,
) {
  const existing = await client.query(
    `select ${kitchenOrderColumns} from public.kitchen_orders where store_id = $1 and transaction_id = $2 limit 1`,
    [payload.store_id, payload.id],
  );
  if (existing.rows[0]) {
    return fetchKitchenOrder(client, existing.rows[0].id);
  }

  const orderResult = await client.query(
    `
      insert into public.kitchen_orders (
        store_id,
        transaction_id,
        order_number,
        source,
        customer_name,
        table_number,
        overall_status,
        created_by,
        created_by_name
      ) values ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
      returning ${kitchenOrderColumns}
    `,
    [
      payload.store_id,
      payload.id,
      payload.id,
      payload.source ?? 'cashier',
      payload.customer_name ?? null,
      payload.table_number ?? null,
      changedBy.id,
      payload.cashier ?? changedBy.email ?? null,
    ],
  );

  const order = orderResult.rows[0];
  for (const item of payload.items) {
    let station = item.station ?? null;
    if (!station && item.menu_item_id) {
      const menuResult = await client.query(
        `select category from public.menu_items where id = $1 and store_id = $2 limit 1`,
        [item.menu_item_id, payload.store_id],
      );
      station = inferKitchenStation(menuResult.rows[0]?.category);
    }

    await client.query(
      `
        insert into public.kitchen_order_items (
          order_id,
          menu_item_id,
          item_name,
          qty,
          note,
          station,
          item_status
        ) values ($1, $2, $3, $4, $5, $6, 'pending')
      `,
      [
        order.id,
        item.menu_item_id ?? null,
        item.name,
        item.qty,
        item.note ?? null,
        station ?? 'other',
      ],
    );
  }

  const fullOrder = await fetchKitchenOrder(client, order.id);
  await insertKitchenEvent(client, {
    storeId: payload.store_id,
    orderId: order.id,
    eventType: 'order_created',
    newStatus: 'pending',
    changedBy: changedBy.id,
    changedByName: payload.cashier ?? changedBy.email ?? null,
    data: { transactionId: payload.id },
  });

  return fullOrder;
}

export async function recalculateKitchenOrderStatus(client: PoolClient, orderId: string) {
  const { deriveKitchenOrderStatus } = await import('../lib/kitchenStatus');
  const itemsResult = await client.query(
    `select item_status from public.kitchen_order_items where order_id = $1 order by created_at asc, id asc`,
    [orderId],
  );
  const statuses = itemsResult.rows.map((row) => normalizeKitchenStatus(String(row.item_status)));
  return deriveKitchenOrderStatus(statuses as KitchenStatus[]);
}
