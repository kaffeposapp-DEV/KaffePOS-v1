import type { Pool, PoolClient } from 'pg';
import { ApiError, log } from '../core';
import { FraudGuardService } from './FraudGuardService';

type Db = Pool | PoolClient;

export type CreateCommissionFromPaymentInput = {
  userId: string;
  paymentId: string;
  grossAmount: number;
  paidAt: string;
  orderId: string;
};

export type CancelCommissionForPaymentInput = {
  userId: string;
  paymentId: string;
  status: string;
  orderId: string;
};

type ListFilters = {
  status?: string;
  type?: string;
  affiliateProfileId?: string;
  referrerUserId?: string;
  referredUserId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit: number;
  offset: number;
};

function profileJson(alias: string) {
  return `json_build_object('id', ${alias}.id, 'email', ${alias}.email, 'email_masked', null, 'name', coalesce(${alias}.display_name, ${alias}.username))`;
}

export class CommissionService {
  constructor(private db: Db) {}


  async createFromPayment(input: CreateCommissionFromPaymentInput) {
    const paidAtDate = new Date(input.paidAt);
    const eligibleAt = new Date(paidAtDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const referralResult = await this.db.query(
      `
        select *
        from public.referral_registrations
        where referred_user_id = $1
        limit 1
        for update
      `,
      [input.userId],
    );
    const referral = referralResult.rows[0];
    if (!referral) return { created: false, reason: 'no_referral_registration' as const };
    if (referral.referrer_user_id === input.userId) return { created: false, reason: 'self_referral' as const };
    if (['rejected', 'cancelled'].includes(String(referral.status))) return { created: false, reason: 'referral_not_payable' as const };

    const existingForPayment = await this.db.query(
      `
        select *
        from public.commission_transactions
        where referral_registration_id = $1
          and payment_id = $2
        limit 1
      `,
      [referral.id, input.paymentId],
    );
    if (existingForPayment.rows[0]) {
      log('info', 'payment_webhook_duplicate_ignored', { referralRegistrationId: referral.id, paymentId: input.paymentId, commissionId: existingForPayment.rows[0].id });
      return { created: false, reason: 'commission_exists' as const, commission: existingForPayment.rows[0] };
    }

    if (referral.first_payment_at) {
      return { created: false, reason: 'not_first_payment' as const };
    }

    await this.db.query(
      `
        update public.referral_registrations
        set first_payment_at = coalesce(first_payment_at, $2::timestamptz),
            eligible_at = coalesce(eligible_at, $3::timestamptz),
            status = case when status in ('registered', 'trial_started') then 'paid' else status end,
            updated_at = now()
        where id = $1
      `,
      [referral.id, input.paidAt, eligibleAt],
    );

    let affiliateProfileId: string | null = null;
    let commissionType: 'referral_credit' | 'affiliate_cash' = 'referral_credit';
    let amount = 150000;
    let rate: number | null = null;

    if (referral.referral_type === 'affiliate') {
      const affiliateResult = await this.db.query(
        `
          select id, status, commission_rate
          from public.affiliate_profiles
          where user_id = $1
          limit 1
          for update
        `,
        [referral.referrer_user_id],
      );
      const affiliate = affiliateResult.rows[0];
      if (!affiliate || affiliate.status !== 'active') {
        return { created: false, reason: 'affiliate_not_active' as const };
      }
      affiliateProfileId = affiliate.id;
      commissionType = 'affiliate_cash';
      rate = Number(affiliate.commission_rate ?? 20);
      amount = Math.max(0, Math.floor(input.grossAmount * (rate / 100)));
    }

    const inserted = await this.db.query(
      `
        insert into public.commission_transactions (
          referral_registration_id,
          affiliate_profile_id,
          referrer_user_id,
          referred_user_id,
          payment_id,
          type,
          amount,
          currency,
          rate,
          status,
          eligible_at,
          admin_note
        ) values (
          $1, $2, $3, $4, $5, $6, $7, 'IDR', $8, 'pending', $9::timestamptz, $10
        )
        on conflict do nothing
        returning *
      `,
      [
        referral.id,
        affiliateProfileId,
        referral.referrer_user_id,
        input.userId,
        input.paymentId,
        commissionType,
        amount,
        rate,
        eligibleAt,
        `Created from verified gateway payment ${input.orderId}`,
      ],
    );

    if (inserted.rows[0]) {
      log('info', 'commission_created', { commissionId: inserted.rows[0].id, referralRegistrationId: referral.id, paymentId: input.paymentId, type: commissionType, amount, status: inserted.rows[0].status });
      return { created: true, reason: 'created' as const, commission: inserted.rows[0] };
    }

    const existing = await this.db.query(
      `
        select *
        from public.commission_transactions
        where referral_registration_id = $1
          and type = $2
          and (payment_id = $3 or ($3::uuid is null and payment_id is null))
        limit 1
      `,
      [referral.id, commissionType, input.paymentId],
    );
    log('info', 'payment_webhook_duplicate_ignored', { referralRegistrationId: referral.id, paymentId: input.paymentId, commissionId: existing.rows[0]?.id ?? null });
    return { created: false, reason: 'commission_exists' as const, commission: existing.rows[0] ?? null };
  }

  async cancelForPayment(input: CancelCommissionForPaymentInput) {
    const result = await this.db.query(
      `
        update public.commission_transactions
        set status = 'cancelled',
            admin_note = concat_ws('\n', admin_note, $3),
            updated_at = now()
        where referred_user_id = $1
          and payment_id = $2
          and status in ('pending', 'eligible', 'approved')
        returning *
      `,
      [input.userId, input.paymentId, `Cancelled from gateway status ${input.status} for ${input.orderId}`],
    );

    const manualReview = await this.db.query(
      `
        update public.commission_transactions
        set admin_note = concat_ws('\n', admin_note, $3),
            updated_at = now()
        where referred_user_id = $1
          and payment_id = $2
          and status = 'paid'
        returning *
      `,
      [input.userId, input.paymentId, `Manual review required: paid commission received gateway status ${input.status} for ${input.orderId}`],
    );

    if (result.rows.length > 0) {
      await this.db.query(
        `
          update public.referral_registrations
          set status = case when status in ('registered', 'trial_started', 'paid', 'eligible') then 'cancelled' else status end,
              updated_at = now()
          where referred_user_id = $1
            and id in (select referral_registration_id from public.commission_transactions where payment_id = $2)
        `,
        [input.userId, input.paymentId],
      );
    }

    if (result.rows.length > 0) log('info', 'commission_cancelled', { paymentId: input.paymentId, orderId: input.orderId, count: result.rows.length, status: input.status });
    return { cancelled: result.rows, manualReview: manualReview.rows };
  }


  async getSummaryForUser(userId: string, type: 'affiliate_cash' | 'referral_credit') {
    const result = await this.db.query(
      `
        select
          coalesce(sum(amount) filter (where status = 'pending'), 0)::numeric as pending,
          coalesce(sum(amount) filter (where status = 'eligible'), 0)::numeric as eligible,
          coalesce(sum(amount) filter (where status = 'approved'), 0)::numeric as approved,
          coalesce(sum(amount) filter (where status = 'paid'), 0)::numeric as paid
        from public.commission_transactions
        where referrer_user_id = $1 and type = $2
      `,
      [userId, type],
    );
    const row = result.rows[0] ?? {};
    return {
      pending: Number(row.pending ?? 0),
      eligible: Number(row.eligible ?? 0),
      approved: Number(row.approved ?? 0),
      paid: Number(row.paid ?? 0),
    };
  }

  async getHistoryForUser(userId: string, type: 'affiliate_cash' | 'referral_credit') {
    const result = await this.db.query(
      `
        select id, referral_registration_id, type, amount, currency, rate, status, eligible_at, approved_at, rejected_at, paid_at, created_at
        from public.commission_transactions
        where referrer_user_id = $1 and type = $2
        order by created_at desc
        limit 50
      `,
      [userId, type],
    );
    return result.rows;
  }

  async listAdmin(filters: ListFilters) {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (filters.status) where.push(`ct.status = ${add(filters.status)}`);
    if (filters.type) where.push(`ct.type = ${add(filters.type)}`);
    if (filters.affiliateProfileId) where.push(`ct.affiliate_profile_id = ${add(filters.affiliateProfileId)}`);
    if (filters.referrerUserId) where.push(`ct.referrer_user_id = ${add(filters.referrerUserId)}`);
    if (filters.referredUserId) where.push(`ct.referred_user_id = ${add(filters.referredUserId)}`);
    if (filters.dateFrom) where.push(`ct.created_at >= ${add(filters.dateFrom)}::timestamptz`);
    if (filters.dateTo) where.push(`ct.created_at <= ${add(filters.dateTo)}::timestamptz`);
    if (filters.search) {
      const term = `%${filters.search.toLowerCase()}%`;
      const param = add(term);
      where.push(`(lower(coalesce(rp.email, '')) like ${param} or lower(coalesce(ap.affiliate_code, '')) like ${param})`);
    }

    values.push(filters.limit, filters.offset);
    const result = await this.db.query(
      `
        select
          ct.*,
          ${profileJson('rp')} as referrer_info,
          ${profileJson('referred')} as referred_user_info,
          case when ap.id is null then null else json_build_object('id', ap.id, 'affiliate_code', ap.affiliate_code, 'status', ap.status) end as affiliate_info
        from public.commission_transactions ct
        left join public.profiles rp on rp.id = ct.referrer_user_id
        left join public.profiles referred on referred.id = ct.referred_user_id
        left join public.affiliate_profiles ap on ap.id = ct.affiliate_profile_id
        ${where.length ? `where ${where.join(' and ')}` : ''}
        order by ct.created_at desc
        limit $${values.length - 1} offset $${values.length}
      `,
      values,
    );
    return result.rows.map((row) => this.maskCommissionRow(row));
  }

  async getAdminDetail(id: string) {
    const result = await this.db.query(
      `
        select
          ct.*,
          row_to_json(rr) as referral_registration,
          case when ap.id is null then null else json_build_object('id', ap.id, 'affiliate_code', ap.affiliate_code, 'status', ap.status, 'commission_rate', ap.commission_rate) end as affiliate_profile
        from public.commission_transactions ct
        left join public.referral_registrations rr on rr.id = ct.referral_registration_id
        left join public.affiliate_profiles ap on ap.id = ct.affiliate_profile_id
        where ct.id = $1
        limit 1
      `,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new ApiError(404, 'Komisi tidak ditemukan.');
    return {
      ...row,
      timeline: {
        created_at: row.created_at,
        eligible_at: row.eligible_at,
        approved_at: row.approved_at,
        rejected_at: row.rejected_at,
        paid_at: row.paid_at,
      },
    };
  }

  async approve(id: string, note: string | null) {
    const current = await this.getForUpdate(id);
    if (!['pending', 'eligible'].includes(String(current.status))) {
      throw new ApiError(400, 'Hanya komisi pending atau eligible yang bisa disetujui.');
    }
    const result = await this.db.query(
      `update public.commission_transactions set status = 'approved', approved_at = now(), admin_note = coalesce($2, admin_note), updated_at = now() where id = $1 returning *`,
      [id, note],
    );
    log('info', 'commission_approved', { commissionId: id, previousStatus: current.status, status: result.rows[0]?.status ?? 'approved' });
    return result.rows[0];
  }

  async reject(id: string, note: string) {
    const current = await this.getForUpdate(id);
    if (current.status === 'paid') throw new ApiError(400, 'Komisi yang sudah dibayar tidak bisa ditolak.');
    const result = await this.db.query(
      `update public.commission_transactions set status = 'rejected', rejected_at = now(), admin_note = $2, updated_at = now() where id = $1 returning *`,
      [id, note],
    );
    log('info', 'commission_rejected', { commissionId: id, previousStatus: current.status, status: result.rows[0]?.status ?? 'rejected' });
    return result.rows[0];
  }

  async markPaid(id: string, note: string | null, payoutReference: string | null) {
    const current = await this.getForUpdate(id);
    if (current.status !== 'approved') throw new ApiError(400, 'Hanya komisi approved yang bisa ditandai paid.');
    const result = await this.db.query(
      `
        update public.commission_transactions
        set status = 'paid', paid_at = now(), admin_note = coalesce($2, admin_note), updated_at = now()
        where id = $1
        returning *, $3::text as payout_reference
      `,
      [id, note, payoutReference],
    );
    log('info', 'commission_paid', { commissionId: id, previousStatus: current.status, status: result.rows[0]?.status ?? 'paid', payoutReference: payoutReference ? 'provided' : 'not_provided' });
    return result.rows[0];
  }

  private async getForUpdate(id: string) {
    const result = await this.db.query(`select * from public.commission_transactions where id = $1 limit 1 for update`, [id]);
    const row = result.rows[0];
    if (!row) throw new ApiError(404, 'Komisi tidak ditemukan.');
    return row;
  }

  private maskCommissionRow(row: Record<string, unknown>) {
    const referrer = row.referrer_info as { email?: string | null; name?: string | null } | null;
    const referred = row.referred_user_info as { email?: string | null; name?: string | null } | null;
    return {
      ...row,
      referrer_info: referrer ? { ...referrer, email: FraudGuardService.maskEmail(referrer.email), name: FraudGuardService.maskName(referrer.name) } : null,
      referred_user_info: referred ? { ...referred, email: FraudGuardService.maskEmail(referred.email), name: FraudGuardService.maskName(referred.name) } : null,
    };
  }
}
