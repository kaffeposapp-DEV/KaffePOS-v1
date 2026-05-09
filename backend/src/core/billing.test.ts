import { describe, expect, it } from 'vitest';
import { activatePaidSubscription } from './billing';
import type { PoolClient } from './db';

type QueryResult = { rows: Record<string, unknown>[] };

class BillingClientStub {
  readonly profile = {
    id: 'user-1',
    email: 'owner@kaffepos.test',
    username: 'owner',
    display_name: 'Owner',
  };
  readonly store = { id: 'store-1' };
  readonly sessions = new Map<string, Record<string, unknown>>();
  readonly subscriptions: Record<string, unknown>[] = [];
  readonly paymentHistory: Record<string, unknown>[] = [];
  readonly notifications: Record<string, unknown>[] = [];
  cancelledActiveSubscriptions = 0;

  constructor() {
    this.sessions.set('session-1', {
      id: 'session-1',
      user_id: 'user-1',
      subscription_id: null,
    });
  }

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalizedSql.includes('from public.profiles') && normalizedSql.includes('where id = $1')) {
      return { rows: params[0] === this.profile.id ? [this.profile] : [] };
    }

    if (normalizedSql.includes('from public.subscription_payment_sessions ps join public.subscriptions s')) {
      const session = this.sessions.get(String(params[0]));
      const subscription = this.subscriptions.find((row) => row.id === session?.subscription_id);
      return { rows: subscription ? [subscription] : [] };
    }

    if (normalizedSql.includes('from public.subscriptions s') && normalizedSql.includes('and s.payment_ref = $2')) {
      return {
        rows: this.subscriptions.filter(
          (row) => row.user_id === params[0] && row.payment_ref === params[1],
        ).slice(0, 1),
      };
    }

    if (normalizedSql.includes('from public.stores')) {
      return { rows: [this.store] };
    }

    if (normalizedSql.startsWith('update public.subscriptions')) {
      this.cancelledActiveSubscriptions += this.subscriptions.filter(
        (row) => row.user_id === params[0] && row.status === 'active',
      ).length;
      for (const row of this.subscriptions) {
        if (row.user_id === params[0] && row.status === 'active') {
          row.status = 'cancelled';
        }
      }
      return { rows: [] };
    }

    if (normalizedSql.startsWith('insert into public.subscriptions')) {
      const subscription = {
        id: `subscription-${this.subscriptions.length + 1}`,
        user_id: params[0],
        store_id: params[1],
        tier: params[2],
        period: params[3],
        plan: params[4],
        billing_cycle: params[5],
        status: 'active',
        activated_at: params[6],
        expires_at: params[7],
        payment_amount: params[9],
        payment_method: params[10],
        payment_note: params[11],
        payment_ref: params[12],
        created_at: params[6],
        updated_at: params[6],
      };
      this.subscriptions.push(subscription);
      return { rows: [subscription] };
    }

    if (normalizedSql.includes('from public.payment_history')) {
      return {
        rows: this.paymentHistory.filter(
          (row) => row.user_id === params[0] && row.payment_ref === params[1],
        ).slice(0, 1),
      };
    }

    if (normalizedSql.startsWith('insert into public.payment_history')) {
      this.paymentHistory.push({
        id: `payment-${this.paymentHistory.length + 1}`,
        user_id: params[0],
        subscription_id: params[1],
        plan: params[2],
        billing_cycle: params[3],
        amount: params[4],
        payment_method: params[5],
        payment_note: params[6],
        payment_ref: params[7],
        status: 'success',
        paid_at: params[8],
      });
      return { rows: [] };
    }

    if (normalizedSql.startsWith('update public.subscription_payment_sessions')) {
      const session = this.sessions.get(String(params[0]));
      if (session) {
        session.subscription_id = params[1];
        session.transaction_status = 'settlement';
        session.paid_at ??= params[2];
        session.settled_at ??= params[2];
      }
      return { rows: [] };
    }

    if (normalizedSql.includes('from public.subscriptions') && normalizedSql.includes('order by activated_at')) {
      return { rows: this.subscriptions.slice(-1) };
    }

    if (normalizedSql.startsWith('update public.profiles')) {
      return { rows: [] };
    }

    if (normalizedSql.startsWith('insert into public.notifications')) {
      this.notifications.push({
        user_id: params[0],
        title: params[1],
        message: params[2],
        type: params[3],
        metadata: params[4],
      });
      return { rows: [] };
    }

    throw new Error(`Unexpected query: ${normalizedSql}`);
  }
}

function createPayload(overrides: Partial<Parameters<typeof activatePaidSubscription>[1]> = {}) {
  return {
    userId: 'user-1',
    plan: 'kopi_susu' as const,
    billingCycle: 'monthly' as const,
    paymentAmount: 99000,
    paymentMethod: 'qris',
    paymentRef: 'SUB-KOPI-SUSU-MONTHLY-user-1-1',
    paymentNote: 'Midtrans qris (sandbox)',
    paidAt: '2026-05-09T10:00:00.000Z',
    sessionId: 'session-1',
    ...overrides,
  };
}

describe('activatePaidSubscription idempotency', () => {
  it('does not duplicate subscriptions or payment history for duplicate payment_ref activation', async () => {
    const client = new BillingClientStub();

    await activatePaidSubscription(client as unknown as PoolClient, createPayload());
    await activatePaidSubscription(client as unknown as PoolClient, createPayload());

    expect(client.subscriptions).toHaveLength(1);
    expect(client.paymentHistory).toHaveLength(1);
    expect(client.sessions.get('session-1')?.subscription_id).toBe('subscription-1');
  });

  it('does not create another subscription or payment history when session already has a subscription', async () => {
    const client = new BillingClientStub();

    await activatePaidSubscription(client as unknown as PoolClient, createPayload());
    await activatePaidSubscription(client as unknown as PoolClient, createPayload({
      paymentRef: 'SUB-KOPI-SUSU-MONTHLY-user-1-duplicate-delivery',
    }));

    expect(client.subscriptions).toHaveLength(1);
    expect(client.paymentHistory).toHaveLength(1);
    expect(client.paymentHistory[0].payment_ref).toBe('SUB-KOPI-SUSU-MONTHLY-user-1-1');
    expect(client.sessions.get('session-1')?.subscription_id).toBe('subscription-1');
  });
});
