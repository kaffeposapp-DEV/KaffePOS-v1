import { describe, expect, it } from 'vitest';
import { calculateStockAdjustmentDelta, stockAdjustmentInputSchema } from './stockAdjustment';

describe('stock opname adjustment validation', () => {
  it('normalizes counted stock and reason for safe adjustment writes', () => {
    const parsed = stockAdjustmentInputSchema.parse({
      store_id: '11111111-1111-4111-8111-111111111111',
      inventory_id: '22222222-2222-4222-8222-222222222222',
      counted_stock: 12.5,
      reason: '  Opname tutup bulan  ',
      note: 'Rak A',
    });

    expect(parsed.reason).toBe('Opname tutup bulan');
    expect(parsed.counted_stock).toBe(12.5);
  });

  it('rejects negative counted stock and calculates delta explicitly', () => {
    expect(() => stockAdjustmentInputSchema.parse({
      store_id: '11111111-1111-4111-8111-111111111111',
      inventory_id: '22222222-2222-4222-8222-222222222222',
      counted_stock: -1,
      reason: 'Opname',
    })).toThrow();

    expect(calculateStockAdjustmentDelta({ currentStock: 8, countedStock: 11 })).toBe(3);
    expect(calculateStockAdjustmentDelta({ currentStock: 8, countedStock: 5 })).toBe(-3);
  });
});
