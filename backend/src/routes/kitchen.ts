/**
 * Kitchen orders, SSE events, order/item status change routes.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  withTransaction,
  ApiError,
  requirePermission,
  assertStoreOwned,
  kitchenOrderColumns,
  kitchenOrderItemColumns,
  type KitchenRealtimeEvent,
  type KitchenRealtimeEventType,
  type KitchenSseClient,
  kitchenClients,
  normalizeKitchenOrder,
  writeSse,
  broadcastKitchenEvent,
  fetchKitchenOrder,
  insertKitchenEvent,
  recalculateKitchenOrderStatus,
} from '../core';
import {
  normalizeKitchenStatus,
  assertKitchenTransition,
  terminalKitchenStatuses,
} from '../lib/kitchenStatus';

const router = Router();
const storeIdSchema = z.string().uuid();

router.get('/api/kitchen/orders', requirePermission('can_view_kitchen'), async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const status = typeof req.query.status === 'string' && req.query.status.trim()
      ? normalizeKitchenStatus(req.query.status)
      : null;
    const station = typeof req.query.station === 'string' && req.query.station.trim()
      ? req.query.station.trim()
      : null;

    const orders = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);

      const params: unknown[] = [storeId];
      const where = ['ko.store_id = $1'];
      if (status) {
        params.push(status);
        where.push(`ko.overall_status = $${params.length}`);
      } else {
        where.push(`ko.overall_status not in ('served', 'completed', 'cancelled')`);
      }
      if (station && ['kitchen', 'bar', 'dessert', 'other'].includes(station)) {
        params.push(station);
        where.push(`exists (
          select 1 from public.kitchen_order_items koi
          where koi.order_id = ko.id and koi.station = $${params.length}
        )`);
      }

      const orderResult = await client.query(
        `
          select
            ko.id,
            ko.store_id,
            ko.transaction_id,
            ko.order_number,
            ko.source,
            ko.customer_name,
            ko.table_number,
            ko.overall_status,
            ko.created_by,
            ko.created_by_name,
            ko.status_version,
            ko.cancelled_reason,
            ko.created_at,
            ko.updated_at
          from public.kitchen_orders ko
          where ${where.join(' and ')}
          order by ko.created_at asc, ko.id asc
          limit 150
        `,
        params,
      );

      const orderIds = orderResult.rows.map((row) => row.id);
      if (orderIds.length === 0) return [];

      const itemResult = await client.query(
        `
          select ${kitchenOrderItemColumns}
          from public.kitchen_order_items
          where order_id = any($1::uuid[])
          order by created_at asc, id asc
        `,
        [orderIds],
      );
      const itemsByOrder = new Map<string, Record<string, unknown>[]>();
      for (const item of itemResult.rows) {
        const list = itemsByOrder.get(item.order_id) || [];
        list.push(item);
        itemsByOrder.set(item.order_id, list);
      }

      return orderResult.rows.map((order) => normalizeKitchenOrder(order, itemsByOrder.get(order.id) || []));
    });

    res.json({ items: orders });
  } catch (error) {
    next(error);
  }
});

router.get('/api/kitchen/events', requirePermission('can_view_kitchen'), async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
    });

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as typeof res & { flushHeaders?: () => void }).flushHeaders?.();

    const client: KitchenSseClient = {
      id: randomUUID(),
      storeId,
      userId: req.authUser!.id,
      res,
      keepAlive: setInterval(() => {
        writeSse(res, { type: 'ping', ts: new Date().toISOString() });
      }, 25_000),
    };

    const clients = kitchenClients.get(storeId) || new Set<KitchenSseClient>();
    clients.add(client);
    kitchenClients.set(storeId, clients);

    writeSse(res, {
      id: randomUUID(),
      type: 'snapshot_required',
      store_id: storeId,
      created_at: new Date().toISOString(),
      payload: { reason: 'connected' },
    });

    req.on('close', () => {
      clearInterval(client.keepAlive);
      const current = kitchenClients.get(storeId);
      current?.delete(client);
      if (current && current.size === 0) kitchenClients.delete(storeId);
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/kitchen/orders/:id/status', requirePermission('can_manage_kitchen_status'), async (req, res, next) => {
  try {
    const orderId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        store_id: z.string().uuid(),
        status: z.enum(['pending', 'preparing', 'ready', 'served', 'completed', 'cancelled']),
        reason: z.string().trim().max(500).optional().nullable(),
        changed_by_name: z.string().trim().max(160).optional().nullable(),
      })
      .parse(req.body);

    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, body.store_id, req.authUser!.id);
      const currentResult = await client.query(
        `
          select ${kitchenOrderColumns}
          from public.kitchen_orders
          where id = $1 and store_id = $2
          for update
        `,
        [orderId, body.store_id],
      );
      const current = currentResult.rows[0];
      if (!current) throw new ApiError(404, 'Order kitchen tidak ditemukan.');

      const oldStatus = normalizeKitchenStatus(String(current.overall_status));
      const newStatus = normalizeKitchenStatus(body.status);
      assertKitchenTransition(oldStatus, newStatus);

      if (oldStatus === newStatus) {
        return { order: await fetchKitchenOrder(client, orderId), event: null };
      }

      await client.query(
        `
          update public.kitchen_orders
          set
            overall_status = $1,
            status_version = status_version + 1,
            cancelled_reason = case when $1 = 'cancelled' then $2 else cancelled_reason end,
            updated_at = now()
          where id = $3 and store_id = $4
        `,
        [newStatus, body.reason ?? null, orderId, body.store_id],
      );

      await client.query(
        `
          update public.kitchen_order_items
          set
            item_status = $1,
            status_version = status_version + 1,
            updated_at = now()
          where order_id = $2
            and item_status not in ('served', 'completed', 'cancelled')
        `,
        [newStatus, orderId],
      );

      const eventType: KitchenRealtimeEventType = newStatus === 'cancelled' ? 'order_cancelled' : 'order_status_changed';
      const eventMeta = await insertKitchenEvent(client, {
        storeId: body.store_id,
        orderId,
        eventType,
        oldStatus,
        newStatus,
        changedBy: req.authUser!.id,
        changedByName: body.changed_by_name ?? req.authUser!.email ?? null,
        data: { reason: body.reason ?? null },
      });
      const order = await fetchKitchenOrder(client, orderId);

      return {
        order,
        event: {
          id: eventMeta.id,
          type: eventType,
          store_id: body.store_id,
          order_id: orderId,
          created_at: eventMeta.created_at,
          payload: { order },
        } satisfies KitchenRealtimeEvent,
      };
    });

    if (result.event) broadcastKitchenEvent(result.event);
    res.json(result.order);
  } catch (error) {
    next(error);
  }
});

router.patch('/api/kitchen/items/:id/status', requirePermission('can_manage_kitchen_status'), async (req, res, next) => {
  try {
    const itemId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        store_id: z.string().uuid(),
        status: z.enum(['pending', 'preparing', 'ready', 'served', 'completed', 'cancelled']),
        changed_by_name: z.string().trim().max(160).optional().nullable(),
      })
      .parse(req.body);

    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, body.store_id, req.authUser!.id);
      const itemResult = await client.query(
        `
          select koi.*, ko.store_id, ko.overall_status
          from public.kitchen_order_items koi
          join public.kitchen_orders ko on ko.id = koi.order_id
          where koi.id = $1 and ko.store_id = $2
          for update of koi, ko
        `,
        [itemId, body.store_id],
      );
      const item = itemResult.rows[0];
      if (!item) throw new ApiError(404, 'Item kitchen tidak ditemukan.');

      const oldItemStatus = normalizeKitchenStatus(String(item.item_status));
      const newItemStatus = normalizeKitchenStatus(body.status);
      assertKitchenTransition(oldItemStatus, newItemStatus);

      if (oldItemStatus !== newItemStatus) {
        await client.query(
          `
            update public.kitchen_order_items
            set item_status = $1, status_version = status_version + 1, updated_at = now()
            where id = $2
          `,
          [newItemStatus, itemId],
        );
      }

      const oldOrderStatus = normalizeKitchenStatus(String(item.overall_status));
      const recalculatedStatus = terminalKitchenStatuses.has(oldOrderStatus)
        ? oldOrderStatus
        : await recalculateKitchenOrderStatus(client, item.order_id);

      if (recalculatedStatus !== oldOrderStatus) {
        await client.query(
          `
            update public.kitchen_orders
            set overall_status = $1, status_version = status_version + 1, updated_at = now()
            where id = $2 and store_id = $3
          `,
          [recalculatedStatus, item.order_id, body.store_id],
        );
      } else {
        await client.query(
          `update public.kitchen_orders set updated_at = now() where id = $1 and store_id = $2`,
          [item.order_id, body.store_id],
        );
      }

      const eventMeta = await insertKitchenEvent(client, {
        storeId: body.store_id,
        orderId: item.order_id,
        orderItemId: itemId,
        eventType: 'item_status_changed',
        oldStatus: oldItemStatus,
        newStatus: newItemStatus,
        changedBy: req.authUser!.id,
        changedByName: body.changed_by_name ?? req.authUser!.email ?? null,
      });
      const order = await fetchKitchenOrder(client, item.order_id);

      return {
        order,
        event: {
          id: eventMeta.id,
          type: 'item_status_changed',
          store_id: body.store_id,
          order_id: item.order_id,
          created_at: eventMeta.created_at,
          payload: { order, itemId },
        } satisfies KitchenRealtimeEvent,
      };
    });

    broadcastKitchenEvent(result.event);
    res.json(result.order);
  } catch (error) {
    next(error);
  }
});

export default router;
