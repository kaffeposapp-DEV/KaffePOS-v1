import type { KitchenOrder, KitchenRealtimeEvent } from '@/types';

export function makeKitchenOrder(overrides: Partial<KitchenOrder> = {}): KitchenOrder {
  const now = '2026-04-28T01:00:00.000Z';
  const orderId = overrides.id ?? 'kitchen_order_1';

  return {
    id: orderId,
    store_id: 'store_test',
    transaction_id: 'transaction_test',
    order_number: 'ORD-001',
    source: 'cashier',
    customer_name: null,
    table_number: null,
    overall_status: 'pending',
    created_by: null,
    created_by_name: 'Kasir Test',
    status_version: 1,
    cancelled_reason: null,
    created_at: now,
    updated_at: now,
    items: [
      {
        id: `${orderId}_item_1`,
        order_id: orderId,
        menu_item_id: 'menu_test',
        item_name: 'Kopi Susu',
        qty: 1,
        note: null,
        station: 'bar',
        item_status: 'pending',
        status_version: 1,
        created_at: now,
        updated_at: now,
      },
    ],
    ...overrides,
  };
}

export function makeKitchenRealtimeEvent(overrides: Partial<KitchenRealtimeEvent> = {}): KitchenRealtimeEvent {
  const order = makeKitchenOrder(overrides.payload?.order ?? undefined);

  return {
    id: 'event_test_1',
    type: 'order_created',
    store_id: order.store_id,
    order_id: order.id,
    created_at: order.created_at,
    payload: {
      order,
    },
    ...overrides,
  };
}

