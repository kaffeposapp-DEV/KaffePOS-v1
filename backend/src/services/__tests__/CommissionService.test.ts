import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core');
  return { ...actual, log: vi.fn() };
});

import { CommissionService } from '../CommissionService';

describe('CommissionService', () => {
  let db: { query: ReturnType<typeof vi.fn> };
  const referrerUserId = randomUUID();
  const referredUserId = randomUUID();
  const referralRegistrationId = randomUUID();
  const paymentId = randomUUID();

  beforeEach(() => {
    db = { query: vi.fn() };
    vi.clearAllMocks();
  });

  it('should create customer referral credit from first paid subscription', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: referralRegistrationId, referrer_user_id: referrerUserId, referred_user_id: referredUserId, referral_type: 'customer_referral', status: 'registered', first_payment_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: randomUUID(), amount: 150000, type: 'referral_credit', status: 'pending' }] });

    const service = new CommissionService(db as any);
    const result = await service.createFromPayment({
      userId: referredUserId,
      paymentId,
      grossAmount: 99000,
      paidAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      orderId: 'ORDER-1',
    });

    expect(result.created).toBe(true);
    expect(result.commission.amount).toBe(150000);
    expect(result.commission.type).toBe('referral_credit');
  });

  it('should calculate affiliate cash commission by commission rate', async () => {
    const affiliateProfileId = randomUUID();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: referralRegistrationId, referrer_user_id: referrerUserId, referred_user_id: referredUserId, referral_type: 'affiliate', status: 'registered', first_payment_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: affiliateProfileId, status: 'active', commission_rate: 20 }] })
      .mockResolvedValueOnce({ rows: [{ id: randomUUID(), amount: 19800, type: 'affiliate_cash', rate: 20, status: 'pending' }] });

    const service = new CommissionService(db as any);
    const result = await service.createFromPayment({
      userId: referredUserId,
      paymentId,
      grossAmount: 99000,
      paidAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      orderId: 'ORDER-2',
    });

    expect(result.created).toBe(true);
    expect(result.commission.amount).toBe(19800);
    expect(result.commission.type).toBe('affiliate_cash');
  });

  it('should skip duplicate commission for same payment', async () => {
    const existingCommission = { id: randomUUID(), payment_id: paymentId };
    db.query
      .mockResolvedValueOnce({ rows: [{ id: referralRegistrationId, referrer_user_id: referrerUserId, referred_user_id: referredUserId, referral_type: 'customer_referral', status: 'paid', first_payment_at: null }] })
      .mockResolvedValueOnce({ rows: [existingCommission] });

    const service = new CommissionService(db as any);
    const result = await service.createFromPayment({
      userId: referredUserId,
      paymentId,
      grossAmount: 99000,
      paidAt: new Date().toISOString(),
      orderId: 'ORDER-DUP',
    });

    expect(result.created).toBe(false);
    expect(result.reason).toBe('commission_exists');
  });

  it('should reject self-referral commission', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: referralRegistrationId, referrer_user_id: referredUserId, referred_user_id: referredUserId, referral_type: 'customer_referral', status: 'registered' }] });

    const service = new CommissionService(db as any);
    const result = await service.createFromPayment({
      userId: referredUserId,
      paymentId,
      grossAmount: 99000,
      paidAt: new Date().toISOString(),
      orderId: 'ORDER-SELF',
    });

    expect(result.created).toBe(false);
    expect(result.reason).toBe('self_referral');
  });
});
