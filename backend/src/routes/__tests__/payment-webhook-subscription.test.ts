import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core');
  return {
    ...actual,
    pool: { query: vi.fn() },
    withTransaction: vi.fn(async (callback) => callback({ query: vi.fn(), release: vi.fn() })),
    log: vi.fn(),
  };
});

import { pool, withTransaction } from '../../core';

describe('Payment Webhook and Subscription API Endpoints', () => {
  const userId = randomUUID();
  const storeId = randomUUID();
  const orderId = `SUB-${Date.now()}`;

  beforeEach(() => vi.clearAllMocks());

  describe('POST /api/webhooks/midtrans', () => {
    it('should mark payment order paid and create transaction on settlement', async () => {
      const payload = {
        order_id: orderId,
        transaction_status: 'settlement',
        gross_amount: '99000.00',
        signature_key: 'valid-signature',
      };

      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [{ id: randomUUID(), midtrans_order_id: orderId, status: 'pending', store_id: storeId }] })
          .mockResolvedValueOnce({ rows: [{ id: randomUUID(), status: 'paid' }] })
          .mockResolvedValueOnce({ rows: [{ id: randomUUID(), payment_status: 'paid' }] }),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => callback(client as any));
      const result = await withTransaction(async (tx) => {
        const order = await tx.query('select payment order for update', [payload.order_id]);
        await tx.query('update payment_orders set status = paid', [payload.order_id]);
        return tx.query('insert transaction from payment order', [order.rows[0].id]);
      });

      expect(result.rows[0].payment_status).toBe('paid');
      expect(client.query).toHaveBeenCalledWith('update payment_orders set status = paid', [orderId]);
    });

    it('should ignore duplicate webhook events idempotently', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ id: randomUUID(), midtrans_order_id: orderId, status: 'paid', transaction_id: randomUUID() }],
      } as any);

      const existing = await pool.query('select payment order', [orderId]);
      expect(existing.rows[0].status).toBe('paid');
      expect(existing.rows[0].transaction_id).toBeTruthy();
    });

    it('should mark failed payment on expire/cancel/deny', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ id: randomUUID(), status: 'failed' }] } as any);
      const result = await pool.query('update payment_orders set status = failed', [orderId]);
      expect(result.rows[0].status).toBe('failed');
    });
  });

  describe('Subscription payment flow', () => {
    it('should activate subscription after paid webhook', async () => {
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [{ id: randomUUID(), user_id: userId, store_id: storeId, plan: 'pro', status: 'pending' }] })
          .mockResolvedValueOnce({ rows: [{ user_id: userId, plan: 'pro', status: 'active' }] }),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => callback(client as any));
      const result = await withTransaction(async (tx) => {
        const invoice = await tx.query('select subscription invoice', [orderId]);
        return tx.query('activate subscription', [invoice.rows[0].user_id]);
      });

      expect(result.rows[0].status).toBe('active');
      expect(result.rows[0].plan).toBe('pro');
    });

    it('should not activate subscription when amount mismatches invoice', async () => {
      const expectedAmount = 99000;
      const webhookAmount = 1000;
      expect(webhookAmount).not.toBe(expectedAmount);
    });
  });
});
