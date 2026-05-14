/**
 * Transaction routes — list, checkout, void.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  requirePermission,
  normalizeTransaction,
  buildPaginationMeta,
  parsePaginationQuery,
  broadcastKitchenEvent,
} from '../core';
import { TransactionService } from '../services/TransactionService';

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
    const items = await TransactionService.listTransactions(storeId, req.authUser!.id, pagination);

    res.json({
      items,
      pagination: buildPaginationMeta({ ...pagination, returned: items.length }),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/transactions/checkout', requirePermission('can_use_pos'), async (req, res, next) => {
  try {
    const payload = checkoutSchema.parse(req.body);
    const result = await TransactionService.checkout(payload, req.authUser!);

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
    const transactionId = storeIdSchema.parse(req.params.id);
    const body = z
      .object({
        store_id: z.string().uuid(),
        reason: z.string().trim().optional().nullable(),
        void_by: z.string().trim().optional().nullable(),
      })
      .parse(req.body);

    const result = await TransactionService.voidTransaction(transactionId, body, req.authUser!);

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
