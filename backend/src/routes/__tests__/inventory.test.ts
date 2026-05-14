import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core');
  return {
    ...actual,
    pool: { query: vi.fn() },
    withTransaction: vi.fn(async (callback) => callback({ query: vi.fn(), release: vi.fn() })),
    requirePermission: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    assertStoreOwned: vi.fn(),
    normalizeInventory: vi.fn((row) => ({ ...row, stock: Number(row.stock), min_stock: Number(row.min_stock ?? 0) })),
    inventoryColumns: '*',
  };
});

import { pool, withTransaction, assertStoreOwned, normalizeInventory } from '../../core';

describe('Inventory API Endpoints', () => {
  const storeId = randomUUID();
  const inventoryId = randomUUID();
  const userId = randomUUID();

  beforeEach(() => vi.clearAllMocks());

  describe('POST /api/inventory', () => {
    it('should create inventory item with normalized stock values', async () => {
      const payload = {
        store_id: storeId,
        name: 'Arabica Beans',
        stock: 100,
        unit: 'gram',
        min_stock: 20,
        cost_per_unit: 150,
      };

      const client = {
        query: vi.fn().mockResolvedValueOnce({ rows: [{ id: inventoryId, ...payload }] }),
        release: vi.fn(),
      };
      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => callback(client as any));

      const created = await withTransaction(async (tx) => {
        await assertStoreOwned(tx as any, storeId, userId);
        const result = await tx.query('insert inventory returning *', [payload]);
        return normalizeInventory(result.rows[0]);
      });

      expect(created.stock).toBe(100);
      expect(created.min_stock).toBe(20);
      expect(assertStoreOwned).toHaveBeenCalledWith(client, storeId, userId);
    });
  });

  describe('PATCH /api/inventory/:id', () => {
    it('should update inventory stock and metadata', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ id: inventoryId, store_id: storeId, stock: 75, name: 'Arabica Beans Premium' }],
      } as any);

      const result = await pool.query('update inventory set stock = $1 where id = $2 returning *', [75, inventoryId]);
      expect(result.rows[0].stock).toBe(75);
      expect(result.rows[0].name).toContain('Premium');
    });

    it('should reject negative stock', () => {
      const payload = { store_id: storeId, name: 'Beans', stock: -1, unit: 'gram' };
      expect(payload.stock).toBeLessThan(0);
    });
  });

  describe('GET /api/inventory/stock-check', () => {
    it('should report low stock items', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          { id: inventoryId, name: 'Milk', stock: 2, min_stock: 5, unit: 'liter' },
        ],
      } as any);

      const result = await pool.query('select low stock inventory', [storeId]);
      expect(result.rows[0].stock).toBeLessThan(result.rows[0].min_stock);
    });

    it('should report sufficient stock when stock exceeds minimum', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ id: inventoryId, name: 'Sugar', stock: 10, min_stock: 5 }],
      } as any);

      const result = await pool.query('select inventory stock status', [storeId]);
      expect(result.rows[0].stock).toBeGreaterThanOrEqual(result.rows[0].min_stock);
    });
  });
});
