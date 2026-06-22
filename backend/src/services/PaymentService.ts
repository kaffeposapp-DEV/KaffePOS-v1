import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ApiError,
  assertStoreOwned,
  broadcastKitchenEvent,
  createKitchenOrderFromTransaction,
  fetchKitchenOrder,
  insertKitchenEvent,
  inventoryColumns,
  kitchenOrderColumns,
  log,
  normalizeTransaction,
  pool,
  serializeError,
  toNumber,
  transactionColumns,
  withTransaction,
  type AuthenticatedUser,
  type KitchenRealtimeEvent,
  type PoolClient,
} from '../core';
import { createPaymentProvider, getActivePaymentProviderName } from '../payments/payment-provider.factory';
import { normalizeKitchenStatus, terminalKitchenStatuses } from '../lib/kitchenStatus';
import {
  convertRecipeQuantityToBase,
  type UnitConversionRecord,
} from '../lib/stockEngine';

const paymentItemSchema = z.object({
  id: z.string().uuid().optional(),
  menu_item_id: z.string().uuid().optional(),
  qty: z.number().int().positive().max(100),
  variant_name: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(400).optional().nullable(),
}).transform((item) => {
  const menuItemId = item.menu_item_id ?? item.id;
  if (!menuItemId) throw new ApiError(400, 'Item pembayaran tidak valid.');
  return { ...item, menu_item_id: menuItemId };
});

export const paymentCreateSchema = z.object({
  store_id: z.string().uuid(),
  items: z.array(paymentItemSchema).min(1).max(100),
  discount_amount: z.number().nonnegative().optional().default(0),
  customer: z.object({
    name: z.string().trim().max(120).optional().nullable(),
    email: z.string().trim().email().optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
  }).optional().default({}),
});

export type PaymentCreatePayload = z.infer<typeof paymentCreateSchema>;

type PaymentAttemptInput = {
  userId?: string | null;
  storeId?: string | null;
  paymentOrderId?: string | null;
  eventType: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

type PreparedPayment = {
  paymentOrderId: string;
  orderId: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grossAmount: number;
  itemDetails: Array<{
    id: string;
    price: number;
    quantity: number;
    name: string;
    note: string | null;
    subtotal: number;
  }>;
  expiresAt: string;
};

export type PaymentOrderStatus = 'pending' | 'paid' | 'completed' | 'failed' | 'cancelled';

type PaymentOrderRow = {
  id: string;
  user_id: string;
  store_id: string;
  transaction_id?: string | null;
  midtrans_order_id: string;
  gross_amount: number | string;
  subtotal: number | string;
  discount_amount: number | string;
  tax_amount: number | string;
  customer_name?: string | null;
  items: unknown;
  status: PaymentOrderStatus;
};

function parseVariants(value: unknown): Array<{ name: string; price: number }> {
  if (!value) return [];
  if (Array.isArray(value)) return value as Array<{ name: string; price: number }>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parsePaymentItems(value: unknown): PreparedPayment['itemDetails'] {
  if (Array.isArray(value)) return value as PreparedPayment['itemDetails'];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as PreparedPayment['itemDetails'] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function createPaymentOrderId() {
  return `KAF-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function insertPaymentAttempt(input: PaymentAttemptInput) {
  try {
    await pool.query(
      `
        insert into public.payment_attempt_logs (
          user_id, store_id, payment_order_id, event_type, ip, user_agent, metadata
        ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        input.userId ?? null,
        input.storeId ?? null,
        input.paymentOrderId ?? null,
        input.eventType,
        input.ip ?? null,
        input.userAgent ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  } catch (error) {
    log('warn', 'payment.attempt_log_failed', { error: serializeError(error), eventType: input.eventType });
  }
}

export class PaymentService {
  static async logAttempt(input: PaymentAttemptInput) {
    await insertPaymentAttempt(input);
  }

  static async createTransaction(input: {
    payload: PaymentCreatePayload;
    user: AuthenticatedUser;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    const providerName = getActivePaymentProviderName();
    if (providerName === 'disabled') {
      throw new ApiError(503, 'Pembayaran online belum aktif.');
    }

    await insertPaymentAttempt({
      userId: input.user.id,
      storeId: input.payload.store_id,
      eventType: 'create_requested',
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: { itemCount: input.payload.items.length },
    });

    const prepared = await this.prepareOrder(input.payload, input.user);
    const provider = createPaymentProvider(providerName);

    try {
      const payment = await provider.createPayment({
        merchantOrderId: prepared.orderId,
        amount: prepared.grossAmount,
        productDetails: `KaffePOS checkout ${prepared.orderId}`,
        customerName: input.payload.customer?.name ?? null,
        customerEmail: input.payload.customer?.email ?? input.user.email ?? null,
        customerPhone: input.payload.customer?.phone ?? null,
        itemDetails: prepared.itemDetails.map((item) => ({ name: item.name, price: item.price, quantity: item.quantity })),
      });
      if (!payment.paymentUrl) {
        throw new ApiError(502, 'Respons gateway pembayaran tidak berisi link pembayaran.');
      }

      await pool.query(
        `
          update public.payment_orders
          set provider = $2,
              provider_reference = $3,
              merchant_order_id = coalesce(merchant_order_id, $4),
              payment_url = $5,
              payment_method = $6,
              updated_at = now()
          where id = $1
        `,
        [prepared.paymentOrderId, providerName, payment.providerReference, prepared.orderId, payment.paymentUrl, payment.paymentMethod],
      );

      await insertPaymentAttempt({
        userId: input.user.id,
        storeId: input.payload.store_id,
        paymentOrderId: prepared.paymentOrderId,
        eventType: 'created',
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { orderId: prepared.orderId, grossAmount: prepared.grossAmount, provider: providerName },
      });

      return {
        order_id: prepared.orderId,
        status: 'pending' as const,
        provider: providerName,
        subtotal: prepared.subtotal,
        discount_amount: prepared.discountAmount,
        tax_amount: prepared.taxAmount,
        gross_amount: prepared.grossAmount,
        payment_url: payment.paymentUrl,
        expires_at: prepared.expiresAt,
      };
    } catch (error) {
      await insertPaymentAttempt({
        userId: input.user.id,
        storeId: input.payload.store_id,
        paymentOrderId: prepared.paymentOrderId,
        eventType: 'gateway_create_failed',
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { error: serializeError(error) },
      });
      throw error instanceof ApiError ? error : new ApiError(502, 'Gateway pembayaran belum bisa membuat pembayaran.');
    }
  }

  static async getOrderStatus(input: { orderId: string; user: AuthenticatedUser }) {
    const result = await pool.query(
      `
        select
          po.id,
          po.store_id,
          po.midtrans_order_id,
          po.transaction_id,
          po.status,
          po.transaction_status,
          po.payment_type,
          po.subtotal,
          po.discount_amount,
          po.tax_amount,
          po.gross_amount,
          po.customer_name,
          po.items,
          po.paid_at,
          po.failed_at,
          po.expires_at,
          case when t.id is null then null else to_jsonb(t) end as transaction
        from public.payment_orders po
        left join public.transactions t
          on t.id = po.transaction_id
          and t.store_id = po.store_id
        where po.midtrans_order_id = $1
          and po.user_id = $2
        limit 1
      `,
      [input.orderId, input.user.id],
    );
    const row = result.rows[0];
    if (!row) throw new ApiError(404, 'Order pembayaran tidak ditemukan.');

    return {
      order_id: row.midtrans_order_id,
      status: row.status as PaymentOrderStatus,
      transaction_status: row.transaction_status,
      payment_type: row.payment_type ?? null,
      subtotal: toNumber(row.subtotal),
      discount_amount: toNumber(row.discount_amount),
      tax_amount: toNumber(row.tax_amount),
      gross_amount: toNumber(row.gross_amount),
      customer_name: row.customer_name ?? null,
      items: parsePaymentItems(row.items),
      transaction_id: row.transaction_id ?? null,
      transaction: row.transaction ? normalizeTransaction(row.transaction) : null,
      paid_at: row.paid_at ?? null,
      failed_at: row.failed_at ?? null,
      expires_at: row.expires_at ?? null,
    };
  }

  static async finalizePaidOrder(client: PoolClient, paymentOrder: PaymentOrderRow, input: {
    paymentType?: string | null;
    paidAt: string;
  }) {
    if (paymentOrder.transaction_id) {
      await client.query(
        `
          update public.payment_orders
          set status = 'completed',
              paid_at = coalesce(paid_at, $2::timestamptz),
              updated_at = now()
          where id = $1
        `,
        [paymentOrder.id, input.paidAt],
      );
      return { transactionId: paymentOrder.transaction_id, kitchenOrder: null, replayed: true };
    }

    const items = parsePaymentItems(paymentOrder.items);
    if (!items.length) throw new ApiError(400, 'Item payment order kosong.');

    const transactionId = randomUUID();
    const cashierResult = await client.query(
      `select id, email, role, permissions, account_status from public.profiles where id = $1 limit 1`,
      [paymentOrder.user_id],
    );
    const cashier = cashierResult.rows[0] ?? {};
    const authUser = {
      id: paymentOrder.user_id,
      email: cashier.email ?? null,
      role: cashier.role ?? 'owner_admin',
      permissions: Array.isArray(cashier.permissions) ? cashier.permissions : [],
      account_status: cashier.account_status ?? 'active',
    } as AuthenticatedUser;

    const payload = {
      id: transactionId,
      store_id: paymentOrder.store_id,
      date: input.paidAt,
      items: items.map((item) => ({
        name: item.name,
        qty: item.quantity,
        price: item.price,
        subtotal: item.subtotal,
        menu_item_id: item.id,
        note: item.note ?? null,
      })),
      subtotal: Math.max(0, Math.round(toNumber(paymentOrder.subtotal))),
      discount: Math.max(0, Math.round(toNumber(paymentOrder.discount_amount))),
      discount_label: null,
      tax: Math.max(0, Math.round(toNumber(paymentOrder.tax_amount))),
      total: Math.max(0, Math.round(toNumber(paymentOrder.gross_amount))),
      cogs: 0,
      paid: Math.max(0, Math.round(toNumber(paymentOrder.gross_amount))),
      change: 0,
      method: 'QRIS',
      customer_name: paymentOrder.customer_name ?? null,
      cashier: authUser.email ?? 'Online',
      note: `Online ${input.paymentType ?? 'payment'}: ${paymentOrder.midtrans_order_id}`,
      source: 'cashier' as const,
    };

    const existing = await client.query(
      `select ${transactionColumns} from public.transactions where id = $1 and store_id = $2 limit 1`,
      [payload.id, payload.store_id],
    );
    if (existing.rows[0]) {
      return { transactionId: payload.id, kitchenOrder: null, replayed: true };
    }

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
      if (!item.menu_item_id || item.qty <= 0) continue;
      const menuResult = await client.query(
        `select recipe from public.menu_items where id = $1 and store_id = $2 limit 1`,
        [item.menu_item_id, payload.store_id],
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
        if (!inventoryRow) throw new ApiError(400, 'Bahan inventory tidak ditemukan untuk menu yang dijual.');

        const requiredPerServing = convertRecipeQuantityToBase({
          ingredientId: inventoryId,
          qty: Math.max(0, toNumber(recipeItem?.qty)),
          fromUnit: typeof recipeItem?.unit_reference === 'string'
            ? recipeItem.unit_reference
            : String(inventoryRow.base_unit ?? inventoryRow.unit ?? 'unit'),
          baseUnit: String(inventoryRow.base_unit ?? inventoryRow.unit ?? 'unit'),
          conversions: unitConversions,
        }).quantity;
        const requiredQty = requiredPerServing * item.qty;
        if (requiredQty <= 0) continue;

        const stockBefore = toNumber(inventoryRow.stock);
        if (stockBefore < requiredQty) throw new ApiError(400, `Stok ${inventoryRow.name} tidak cukup untuk checkout.`);

        const stockAfter = stockBefore - requiredQty;
        await client.query(
          `update public.inventory set stock = $1, updated_at = now() where id = $2`,
          [stockAfter, inventoryRow.id],
        );
        await client.query(
          `
            insert into public.transaction_inventory_audit (
              store_id, transaction_id, inventory_id, action, qty_delta, stock_before, stock_after
            ) values ($1, $2, $3, 'sale', $4, $5, $6)
          `,
          [payload.store_id, payload.id, inventoryRow.id, -requiredQty, stockBefore, stockAfter],
        );
        computedCogs += toNumber(inventoryRow.cost_per_unit) * requiredQty;
      }
    }

    await client.query(
      `
        insert into public.transactions (
          id, store_id, date, items, subtotal, discount, discount_label, tax, total, cogs,
          paid, change, method, customer_name, cashier, note, is_void, created_at
        ) values (
          $1, $2, $3::timestamptz, $4::jsonb, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, false, now()
        )
      `,
      [
        payload.id,
        payload.store_id,
        payload.date,
        JSON.stringify(payload.items),
        payload.subtotal,
        payload.discount,
        payload.discount_label,
        payload.tax,
        payload.total,
        Math.round(computedCogs),
        payload.paid,
        payload.change,
        payload.method,
        payload.customer_name,
        payload.cashier,
        payload.note,
      ],
    );

    const kitchenOrder = await createKitchenOrderFromTransaction(client, payload, authUser);
    await client.query(
      `
        update public.payment_orders
        set status = 'completed',
            transaction_id = $2,
            paid_at = coalesce(paid_at, $3::timestamptz),
            updated_at = now()
        where id = $1
      `,
      [paymentOrder.id, payload.id, input.paidAt],
    );

    return { transactionId: payload.id, kitchenOrder, replayed: false };
  }

  static async voidCompletedOrderTransaction(client: PoolClient, paymentOrder: PaymentOrderRow, reason: string) {
    const transactionId = paymentOrder.transaction_id;
    if (!transactionId) return null;

    const currentResult = await client.query(
      `
        select ${transactionColumns}
        from public.transactions
        where id = $1 and store_id = $2
        for update
      `,
      [transactionId, paymentOrder.store_id],
    );
    const current = currentResult.rows[0];
    if (!current || current.is_void) return current ?? null;

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
        [audit.inventory_id, paymentOrder.store_id],
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
            store_id, transaction_id, inventory_id, action, qty_delta, stock_before, stock_after
          ) values ($1, $2, $3, 'void', $4, $5, $6)
        `,
        [paymentOrder.store_id, transactionId, inventoryRow.id, restoreQty, stockBefore, stockAfter],
      );
    }

    await client.query(
      `
        update public.transactions
        set is_void = true,
            void_reason = $1,
            void_at = now(),
            void_by = 'Online'
        where id = $2 and store_id = $3
      `,
      [reason, transactionId, paymentOrder.store_id],
    );

    const kitchenResult = await client.query(
      `
        select ${kitchenOrderColumns}
        from public.kitchen_orders
        where store_id = $1 and transaction_id = $2
        for update
      `,
      [paymentOrder.store_id, transactionId],
    );
    const kitchenOrder = kitchenResult.rows[0];
    let kitchenEvent: KitchenRealtimeEvent | null = null;
    if (kitchenOrder && !terminalKitchenStatuses.has(normalizeKitchenStatus(String(kitchenOrder.overall_status)))) {
      const oldStatus = normalizeKitchenStatus(String(kitchenOrder.overall_status));
      await client.query(
        `
          update public.kitchen_orders
          set overall_status = 'cancelled',
              status_version = status_version + 1,
              cancelled_reason = $1,
              updated_at = now()
          where id = $2 and store_id = $3
        `,
        [reason, kitchenOrder.id, paymentOrder.store_id],
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
        storeId: paymentOrder.store_id,
        orderId: kitchenOrder.id,
        eventType: 'order_cancelled',
        oldStatus,
        newStatus: 'cancelled',
        changedBy: paymentOrder.user_id,
        changedByName: 'Online',
        data: { reason, transactionId },
      });
      kitchenEvent = {
        id: eventMeta.id,
        type: 'order_cancelled',
        store_id: paymentOrder.store_id,
        order_id: kitchenOrder.id,
        created_at: eventMeta.created_at,
        payload: { order: await fetchKitchenOrder(client, kitchenOrder.id), transactionId },
      };
    }
    if (kitchenEvent) broadcastKitchenEvent(kitchenEvent);
    return current;
  }

  private static async prepareOrder(payload: PaymentCreatePayload, user: AuthenticatedUser): Promise<PreparedPayment> {
    return withTransaction(async (client) => {
      const store = await assertStoreOwned(client, payload.store_id, user.id);
      const menuIds = [...new Set(payload.items.map((item) => item.menu_item_id))];
      const menuResult = await client.query(
        `
          select id, name, price, variants, is_available
          from public.menu_items
          where store_id = $1
            and id = any($2::uuid[])
        `,
        [payload.store_id, menuIds],
      );
      const menuById = new Map(menuResult.rows.map((row) => [String(row.id), row]));

      const itemDetails = payload.items.map((item) => {
        const menuItem = menuById.get(item.menu_item_id);
        if (!menuItem || menuItem.is_available === false) {
          throw new ApiError(400, 'Item pembayaran tidak valid atau sudah tidak tersedia.');
        }

        const variants = parseVariants(menuItem.variants);
        const variant = item.variant_name
          ? variants.find((entry) => entry.name.trim().toLowerCase() === item.variant_name?.trim().toLowerCase())
          : null;
        if (item.variant_name && !variant) {
          throw new ApiError(400, 'Varian menu tidak valid.');
        }

        const price = Math.round(toNumber(variant?.price ?? menuItem.price));
        if (price < 0) throw new ApiError(400, 'Harga menu tidak valid.');
        const quantity = item.qty;
        const name = variant ? `${menuItem.name} (${variant.name})` : String(menuItem.name);

        return {
          id: item.menu_item_id,
          price,
          quantity,
          name,
          note: item.note ?? null,
          subtotal: price * quantity,
        };
      });

      const subtotal = itemDetails.reduce((sum, item) => sum + item.subtotal, 0);
      const discountAmount = Math.min(Math.max(0, Math.round(toNumber(payload.discount_amount))), subtotal);
      const taxableAmount = Math.max(0, subtotal - discountAmount);
      const taxAmount = Math.round(taxableAmount * Math.max(0, toNumber(store.tax_percent)) / 100);
      const grossAmount = taxableAmount + taxAmount;
      if (grossAmount <= 0) throw new ApiError(400, 'Total pembayaran tidak valid.');

      const orderId = createPaymentOrderId();
      const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
      const inserted = await client.query(
        `
          insert into public.payment_orders (
            user_id,
            store_id,
            midtrans_order_id,
            status,
            transaction_status,
            subtotal,
            discount_amount,
            tax_amount,
            gross_amount,
            customer_name,
            customer_email,
            customer_phone,
            items,
            expires_at
          ) values (
            $1, $2, $3, 'pending', 'pending', $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12
          )
          returning id
        `,
        [
          user.id,
          payload.store_id,
          orderId,
          subtotal,
          discountAmount,
          taxAmount,
          grossAmount,
          payload.customer?.name ?? null,
          payload.customer?.email ?? user.email ?? null,
          payload.customer?.phone ?? null,
          JSON.stringify(itemDetails),
          expiresAt,
        ],
      );

      return {
        paymentOrderId: inserted.rows[0].id as string,
        orderId,
        subtotal,
        discountAmount,
        taxAmount,
        grossAmount,
        itemDetails,
        expiresAt,
      };
    });
  }
}
