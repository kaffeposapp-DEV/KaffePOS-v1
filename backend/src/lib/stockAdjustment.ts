import { z } from 'zod';

export const stockAdjustmentInputSchema = z.object({
  store_id: z.string().uuid(),
  inventory_id: z.string().uuid(),
  counted_stock: z.coerce.number().nonnegative(),
  reason: z.string().trim().min(3).max(160),
  note: z.string().trim().max(500).optional().nullable(),
});

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentInputSchema>;

export function calculateStockAdjustmentDelta(input: { currentStock: number; countedStock: number }) {
  return Number((input.countedStock - input.currentStock).toFixed(4));
}
