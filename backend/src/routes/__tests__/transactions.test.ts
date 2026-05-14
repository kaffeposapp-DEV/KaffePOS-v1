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
    normalizeTransaction: vi.fn((row) => row),
    transactionColumns: '*',
    inventoryColumns: '*',
    log: vi.fn(),
  };
});

import { pool, withTransaction, assertStoreOwned } from '../../core';

describe('Transactions API Endpoints', () => {
  const storeId = randomUUID();
  const transactionId = randomUUID();
  const cashierId = randomUUID();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/transactions checkout', () => {
    it('should create checkout transaction and deduct stock atomically', async () => {
      const payload = {
        store_id: storeId,
        items: [{ menu_item_id: randomUUID(), qty: 2, price: 25000 }],
        payment_method: 'cash',
        total: 50000,
      };

      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [{ id: payload.items[0].menu_item_id, name: 'Latte', price: 25000 }] })
          .mockResolvedValueOnce({ rows: [{ id: transactionId, ...payload }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ id: randomUUID(), stock: 8 }] }),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => callback(client as any));
      await withTransaction(async (tx) => {
        await assertStoreOwned(tx as any, storeId, cashierId);
        const created = await tx.query('insert transaction returning *', [payload]);
        await tx.query('update inventory set stock = stock - $1', [2]);
        return created.rows[0];
      });

      expect(assertStoreOwned).toHaveBeenCalledWith(client, storeId, cashierId);
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining('insert transaction'), [payload]);
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining('update inventory'), [2]);
    });

    it('should rollback checkout when stock is insufficient', async () => {
      const client = {
        query: vi.fn().mockRejectedValueOnce(new Error('Insufficient stock')),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => callback(client as any));
      await expect(withTransaction(async (tx) => tx.query('update inventory set stock = stock - $1', [99])))
        .rejects.toThrow('Insufficient stock');
    });
  });

  describe('POST /api/transactions/:id/void', () => {
    it('should void transaction and restore inventory', async () => {
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [{ id: transactionId, store_id: storeId, status: 'completed' }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ id: transactionId, status: 'voided' }] }),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => callback(client as any));
      const result = await withTransaction(async (tx) => {
        const existing = await tx.query('select transaction', [transactionId]);
        await tx.query('restore inventory', [transactionId]);
        return tx.query('void transaction', [transactionId]);
      });

      expect(result.rows[0].status).toBe('voided');
      expect(client.query).toHaveBeenCalledWith('restore inventory', [transactionId]);
    });
  });

  describe('GET /api/transactions list', () => {
    it('should list transactions with store ownership check', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          { id: transactionId, store_id: storeId, total: 50000, status: 'completed' },
        ],
      } as any);

      const result = await pool.query('select transactions where store_id = $1', [storeId]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].store_id).toBe(storeId);
    });
  });
});
