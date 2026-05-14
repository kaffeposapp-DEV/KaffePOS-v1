import { describe, expect, it } from 'vitest';
import { CommissionService } from './CommissionService';

type QueryCall = { sql: string; values?: unknown[] };

class FakeDb {
  calls: QueryCall[] = [];
  private responses: Array<{ rows: Record<string, unknown>[] }>;

  constructor(responses: Array<{ rows: Record<string, unknown>[] }>) {
    this.responses = responses;
  }

  async query(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values });
    return this.responses.shift() ?? { rows: [] };
  }
}

const baseReferral = {
  id: 'referral-1',
  referral_code_id: 'code-1',
  referrer_user_id: 'referrer-1',
  referred_user_id: 'paid-user-1',
  referral_type: 'customer_referral',
  status: 'registered',
  first_payment_at: null,
};

const payment = {
  userId: 'paid-user-1',
  paymentId: '11111111-1111-1111-1111-111111111111',
  grossAmount: 100000,
  paidAt: '2026-05-14T00:00:00.000Z',
  orderId: 'ORDER-1',
};

describe('CommissionService payment sync', () => {
  it('creates referral credit once for verified first payment', async () => {
    const db = new FakeDb([
      { rows: [baseReferral] },
      { rows: [] },
      { rows: [] },
      { rows: [{ id: 'commission-1', type: 'referral_credit', amount: 150000, status: 'pending' }] },
    ]);

    const result = await new CommissionService(db as never).createFromPayment(payment);

    expect(result.created).toBe(true);
    expect(db.calls.some((call) => call.sql.includes('insert into public.commission_transactions'))).toBe(true);
    const insertCall = db.calls.find((call) => call.sql.includes('insert into public.commission_transactions'));
    expect(insertCall?.values).toContain('referral_credit');
    expect(insertCall?.values).toContain(150000);
  });

  it('does not duplicate commission on repeated webhook', async () => {
    const db = new FakeDb([
      { rows: [baseReferral] },
      { rows: [{ id: 'commission-1', type: 'referral_credit' }] },
    ]);

    const result = await new CommissionService(db as never).createFromPayment(payment);

    expect(result.created).toBe(false);
    expect(result.reason).toBe('commission_exists');
    expect(db.calls.some((call) => call.sql.includes('insert into public.commission_transactions'))).toBe(false);
  });

  it('uses active affiliate commission rate', async () => {
    const db = new FakeDb([
      { rows: [{ ...baseReferral, referral_type: 'affiliate' }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ id: 'affiliate-1', status: 'active', commission_rate: '20.00' }] },
      { rows: [{ id: 'commission-1', type: 'affiliate_cash', amount: 20000, status: 'pending' }] },
    ]);

    const result = await new CommissionService(db as never).createFromPayment(payment);

    expect(result.created).toBe(true);
    const insertCall = db.calls.find((call) => call.sql.includes('insert into public.commission_transactions'));
    expect(insertCall?.values).toContain('affiliate_cash');
    expect(insertCall?.values).toContain(20000);
    expect(insertCall?.values).toContain(20);
  });

  it('does not create commission for inactive affiliate', async () => {
    const db = new FakeDb([
      { rows: [{ ...baseReferral, referral_type: 'affiliate' }] },
      { rows: [] },
      { rows: [] },
      { rows: [{ id: 'affiliate-1', status: 'suspended', commission_rate: '20.00' }] },
    ]);

    const result = await new CommissionService(db as never).createFromPayment(payment);

    expect(result.created).toBe(false);
    expect(result.reason).toBe('affiliate_not_active');
    expect(db.calls.some((call) => call.sql.includes('insert into public.commission_transactions'))).toBe(false);
  });

  it('no-ops when user has no referral registration', async () => {
    const db = new FakeDb([{ rows: [] }]);

    const result = await new CommissionService(db as never).createFromPayment(payment);

    expect(result.created).toBe(false);
    expect(result.reason).toBe('no_referral_registration');
  });

  it('never creates commission for self-referral', async () => {
    const db = new FakeDb([{ rows: [{ ...baseReferral, referrer_user_id: payment.userId }] }]);

    const result = await new CommissionService(db as never).createFromPayment(payment);

    expect(result.created).toBe(false);
    expect(result.reason).toBe('self_referral');
  });

  it('cancels pending commission on failed payment sync', async () => {
    const db = new FakeDb([
      { rows: [{ id: 'commission-1', status: 'cancelled' }] },
      { rows: [] },
      { rows: [] },
    ]);

    const result = await new CommissionService(db as never).cancelForPayment({
      userId: payment.userId,
      paymentId: payment.paymentId,
      status: 'expire',
      orderId: payment.orderId,
    });

    expect(result.cancelled).toHaveLength(1);
    expect(db.calls[0]?.sql).toContain("status = 'cancelled'");
  });
});
