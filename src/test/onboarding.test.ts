import { describe, expect, it } from 'vitest';
import { getOnboardingChecklist } from '@/lib/onboarding';

describe('onboarding readiness checklist', () => {
  it('shows a green checklist only when store, menu, stock, and first transaction are ready', () => {
    const empty = getOnboardingChecklist({
      storeSettings: { id: 'store_1', owner_id: 'owner_1', store_name: '' },
      menu: [],
      inventory: [],
      transactions: [],
    });

    expect(empty.complete).toBe(false);
    expect(empty.completedCount).toBe(0);
    expect(empty.steps.map((step) => step.done)).toEqual([false, false, false, false]);

    const ready = getOnboardingChecklist({
      storeSettings: { id: 'store_1', owner_id: 'owner_1', store_name: 'Kedai Test' },
      menu: [
        { id: 'menu_1', store_id: 'store_1', name: 'Kopi Susu', price: 15000, category: 'Coffee', is_available: true },
        { id: 'menu_2', store_id: 'store_1', name: 'Americano', price: 12000, category: 'Coffee', is_available: true },
        { id: 'menu_3', store_id: 'store_1', name: 'Roti Bakar', price: 10000, category: 'Snack', is_available: true },
      ],
      inventory: [
        { id: 'inv_1', store_id: 'store_1', name: 'Susu', stock: 10, unit: 'liter', min_stock: 2, cost_per_unit: 12000 },
      ],
      transactions: [
        {
          id: 'tx_1',
          store_id: 'store_1',
          date: '2026-04-30T00:00:00.000Z',
          items: [],
          subtotal: 15000,
          discount: 0,
          tax: 0,
          total: 15000,
          paid: 15000,
          change: 0,
          method: 'Tunai',
          is_void: false,
        },
      ],
    });

    expect(ready.complete).toBe(true);
    expect(ready.completedCount).toBe(4);
    expect(ready.progressPercent).toBe(100);
  });
});
