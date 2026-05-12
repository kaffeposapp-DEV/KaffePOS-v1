import { Router } from 'express';
import { z } from 'zod';
import {
  ApiError,
  paymentCreateRateLimiter,
  requirePermission,
  serializeError,
} from '../core';
import { PaymentService, paymentCreateSchema } from '../services/PaymentService';

const router = Router();

function getRequestIp(req: Parameters<Parameters<typeof router.post>[1]>[0]) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || null;
}

async function createTransaction(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1], next: Parameters<Parameters<typeof router.post>[1]>[2]) {
  const ip = getRequestIp(req);
  const userAgent = req.headers['user-agent'] ?? null;
  let payload: z.infer<typeof paymentCreateSchema> | null = null;

  try {
    const parsedPayload = paymentCreateSchema.parse(req.body);
    payload = parsedPayload;
    const payment = await PaymentService.createTransaction({
      payload: parsedPayload,
      user: req.authUser!,
      ip,
      userAgent,
    });
    res.status(201).json(payment);
  } catch (error) {
    if (payload) {
      await PaymentService.logAttempt({
        userId: req.authUser?.id ?? null,
        storeId: payload.store_id,
        eventType: 'create_failed',
        ip,
        userAgent,
        metadata: { error: serializeError(error) },
      });
    } else if (error instanceof z.ZodError) {
      next(new ApiError(400, 'Payload pembayaran tidak valid.'));
      return;
    }
    next(error);
  }
}

router.post('/api/payment/create-transaction', requirePermission('can_use_pos'), paymentCreateRateLimiter, createTransaction);
router.post('/api/payment/create', requirePermission('can_use_pos'), paymentCreateRateLimiter, createTransaction);
router.get('/api/payment/orders/:orderId', requirePermission('can_use_pos'), async (req, res, next) => {
  try {
    const orderId = z.string().trim().min(1).parse(req.params.orderId);
    const order = await PaymentService.getOrderStatus({ orderId, user: req.authUser! });
    res.json(order);
  } catch (error) {
    next(error);
  }
});

export default router;
