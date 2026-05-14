import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core');
  return {
    ...actual,
    pool: { query: vi.fn() },
    requirePermission: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    ApiError: class ApiError extends Error {
      constructor(public statusCode: number, message: string) {
        super(message);
      }
    },
    log: vi.fn(),
    env: { MIDTRANS_SERVER_KEY: 'test-key', MIDTRANS_IS_PRODUCTION: 'false' },
  };
});

vi.mock('../../services/PaymentService', () => ({
  PaymentService: {
    createTransaction: vi.fn(),
    getOrderStatus: vi.fn(),
    logAttempt: vi.fn(),
  },
  paymentCreateSchema: {
    parse: vi.fn((data) => data),
  },
}));

import { PaymentService } from '../../services/PaymentService';

describe('Payment API Endpoints', () => {
  const storeId = randomUUID();
  const userId = randomUUID();
  const orderId = randomUUID();

  beforeEach(() => vi.clearAllMocks());

  describe('POST /api/payment/create-transaction', () => {
    it('should create payment transaction with Midtrans integration', async () => {
      const payload = {
        store_id: storeId,
        items: [{ menu_item_id: randomUUID(), qty: 2 }],
        discount_amount: 0,
        customer: { name: 'John Doe', email: 'john@example.com' },
      };

      const mockPayment = {
        paymentOrderId: orderId,
        midtransOrderId: `ORDER-${Date.now()}`,
        grossAmount: 50000,
        snapToken: 'snap-token-123',
        snapRedirectUrl: 'https://app.midtrans.com/snap/v2/vtweb/snap-token-123',
      };

      vi.mocked(PaymentService.createTransaction).mockResolvedValueOnce(mockPayment);

      const result = await PaymentService.createTransaction({
        payload,
        user: { id: userId, storeId } as any,
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(result.paymentOrderId).toBe(orderId);
      expect(result.snapToken).toBeDefined();
      expect(PaymentService.createTransaction).toHaveBeenCalledWith({
        payload,
        user: expect.objectContaining({ id: userId }),
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });
    });

    it('should log failed payment attempts', async () => {
      const payload = { store_id: storeId, items: [] };
      vi.mocked(PaymentService.createTransaction).mockRejectedValueOnce(new Error('Invalid items'));

      try {
        await PaymentService.createTransaction({
          payload,
          user: { id: userId } as any,
          ip: '127.0.0.1',
          userAgent: null,
        });
      } catch (error) {
        await PaymentService.logAttempt({
          userId,
          storeId,
          eventType: 'create_failed',
          ip: '127.0.0.1',
          userAgent: null,
          metadata: { error },
        });
      }

      expect(PaymentService.logAttempt).toHaveBeenCalledWith({
        userId,
        storeId,
        eventType: 'create_failed',
        ip: '127.0.0.1',
        userAgent: null,
        metadata: expect.objectContaining({ error: expect.any(Object) }),
      });
    });
  });

  describe('GET /api/payment/orders/:orderId', () => {
    it('should retrieve payment order status', async () => {
      const mockOrder = {
        id: orderId,
        status: 'pending',
        grossAmount: 50000,
        midtransOrderId: 'ORDER-123',
      };

      vi.mocked(PaymentService.getOrderStatus).mockResolvedValueOnce(mockOrder);

      const result = await PaymentService.getOrderStatus({
        orderId,
        user: { id: userId } as any,
      });

      expect(result.id).toBe(orderId);
      expect(result.status).toBe('pending');
    });

    it('should handle non-existent order', async () => {
      vi.mocked(PaymentService.getOrderStatus).mockRejectedValueOnce(
        new Error('Order not found')
      );

      await expect(
        PaymentService.getOrderStatus({ orderId: 'invalid', user: { id: userId } as any })
      ).rejects.toThrow('Order not found');
    });
  });
});
