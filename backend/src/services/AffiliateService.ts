import type { Pool, PoolClient } from 'pg';
import { ApiError, env, log } from '../core';
import { FraudGuardService } from './FraudGuardService';
import { ReferralCodeService } from './ReferralCodeService';
import { CommissionService } from './CommissionService';

type Db = Pool | PoolClient;

type ApplyInput = {
  userId: string;
  payoutName: string;
  payoutBankName: string;
  payoutAccountNumber: string;
  payoutAccountHolder: string;
  acceptedTerms: boolean;
  termsVersion: string;
  ip: string | null;
};

type PayoutInput = Omit<ApplyInput, 'acceptedTerms' | 'termsVersion' | 'ip'>;

export class AffiliateService {
  constructor(private db: Db) {}


  async getReferralCodeByCode(code: string) {
    return new ReferralCodeService(this.db).findByCode(code);
  }

  async getAffiliateProfile(userId: string) {
    return this.getProfileByUserId(userId);
  }

  async getReferralRegistrationByReferredUser(referredUserId: string) {
    const result = await this.db.query(
      `select * from public.referral_registrations where referred_user_id = $1 limit 1`,
      [referredUserId],
    );
    return result.rows[0] ?? null;
  }

  async createReferralRegistration(referralCodeId: string, referredUserId: string, referrerUserId: string) {
    if (referredUserId === referrerUserId) throw new ApiError(400, 'Self-referral tidak diizinkan.');
    const existing = await this.getReferralRegistrationByReferredUser(referredUserId);
    if (existing) return null;
    const codeResult = await this.db.query(`select type from public.referral_codes where id = $1 limit 1`, [referralCodeId]);
    const referralType = codeResult.rows[0]?.type ?? 'customer_referral';
    const result = await this.db.query(
      `
        insert into public.referral_registrations (referral_code_id, referred_user_id, referrer_user_id, referral_type)
        values ($1, $2, $3, $4)
        returning *
      `,
      [referralCodeId, referredUserId, referrerUserId, referralType],
    );
    return result.rows[0] ?? null;
  }

  async markReferralFirstPayment(referredUserId: string, _orderId: string) {
    const result = await this.db.query(
      `
        update public.referral_registrations
        set first_payment_at = coalesce(first_payment_at, now()), status = case when status in ('registered', 'trial_started') then 'paid' else status end, updated_at = now()
        where referred_user_id = $1
        returning *
      `,
      [referredUserId],
    );
    return result.rows[0] ?? null;
  }

  async createCommission(
    affiliateUserId: string,
    referredUserId: string,
    referralRegistrationId: string,
    paymentOrderId: string,
    paymentAmountIdr: number,
    commissionRate: number,
  ) {
    const affiliateProfile = await this.getProfileByUserId(affiliateUserId);
    if (!affiliateProfile || affiliateProfile.status !== 'active') return null;
    const amount = Math.max(0, Math.floor(paymentAmountIdr * (commissionRate / 100)));
    const existing = await this.db.query(
      `select * from public.commission_transactions where referral_registration_id = $1 and type = 'affiliate_cash' limit 1`,
      [referralRegistrationId],
    );
    if (existing.rows[0]) return existing.rows[0];
    const result = await this.db.query(
      `
        insert into public.commission_transactions (
          referral_registration_id, affiliate_profile_id, referrer_user_id, referred_user_id, payment_id, type, amount, currency, rate, status, eligible_at, admin_note
        ) values ($1, $2, $3, $4, null, 'affiliate_cash', $5, 'IDR', $6, 'eligible', now(), $7)
        returning *
      `,
      [referralRegistrationId, affiliateProfile.id, affiliateUserId, referredUserId, amount, commissionRate, `Payment ref: ${paymentOrderId}`],
    );
    return result.rows[0] ?? null;
  }

  async updateAffiliateStats(_userId: string) {
    return;
  }

  async getProfileByUserId(userId: string) {
    const result = await this.db.query(
      `select * from public.affiliate_profiles where user_id = $1 limit 1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async getProfileById(id: string) {
    const result = await this.db.query(
      `select ap.*, p.email, p.display_name, p.username from public.affiliate_profiles ap left join public.profiles p on p.id = ap.user_id where ap.id = $1 limit 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async getDashboard(userId: string) {
    const profile = await this.getProfileByUserId(userId);
    if (!profile) throw new ApiError(404, 'Affiliate profile tidak ditemukan.');

    const codeService = new ReferralCodeService(this.db);
    const commissionService = new CommissionService(this.db);
    const referralCode = await codeService.findActiveByUser(userId, 'affiliate');
    const [clicks, registrations, paidConversions, commissions, history] = await Promise.all([
      this.db.query(`select count(*)::int as total from public.referral_clicks where referral_code_id = $1`, [referralCode?.id ?? null]),
      this.db.query(`select count(*)::int as total from public.referral_registrations where referrer_user_id = $1 and referral_type = 'affiliate'`, [userId]),
      this.db.query(`select count(*)::int as total from public.referral_registrations where referrer_user_id = $1 and referral_type = 'affiliate' and first_payment_at is not null`, [userId]),
      commissionService.getSummaryForUser(userId, 'affiliate_cash'),
      commissionService.getHistoryForUser(userId, 'affiliate_cash'),
    ]);

    return {
      affiliate_profile: this.serializeProfile(profile),
      affiliate_code: profile.affiliate_code,
      affiliate_link: `${env.API_BASE_URL.replace(/\/$/, '')}/api/ref/${encodeURIComponent(String(profile.affiliate_code))}`,
      commission_rate: Number(profile.commission_rate ?? 0),
      total_clicks: Number(clicks.rows[0]?.total ?? 0),
      total_registrations: Number(registrations.rows[0]?.total ?? 0),
      total_paid_conversions: Number(paidConversions.rows[0]?.total ?? 0),
      pending_commission: commissions.pending,
      eligible_commission: commissions.eligible,
      approved_commission: commissions.approved,
      paid_commission: commissions.paid,
      commission_history: history,
      payout_info: this.serializePayout(profile),
    };
  }

  async apply(input: ApplyInput) {
    if (!input.acceptedTerms) throw new ApiError(400, 'Syarat affiliate wajib disetujui.');
    const existing = await this.getProfileByUserId(input.userId);
    if (existing) throw new ApiError(409, 'Affiliate profile sudah ada.');

    const codeService = new ReferralCodeService(this.db);
    const referralCode = await codeService.getOrCreateForUser(input.userId, 'affiliate');
    const encryptedAccount = FraudGuardService.protectPayoutAccountNumber(input.payoutAccountNumber);

    const result = await this.db.query(
      `
        insert into public.affiliate_profiles (
          user_id, affiliate_code, status, payout_name, payout_bank_name, payout_account_number_encrypted,
          payout_account_holder, accepted_terms_at
        ) values ($1, $2, 'pending', $3, $4, $5, $6, now())
        returning *
      `,
      [input.userId, referralCode.code, input.payoutName, input.payoutBankName, encryptedAccount, input.payoutAccountHolder],
    );
    const profile = result.rows[0];

    await this.db.query(
      `
        insert into public.affiliate_terms_acceptances (user_id, affiliate_profile_id, terms_version, ip_hash)
        values ($1, $2, $3, $4)
      `,
      [input.userId, profile.id, input.termsVersion, FraudGuardService.hashIp(input.ip)],
    );

    log('info', 'affiliate_application_created', { affiliateProfileId: profile.id, userId: input.userId, termsVersion: input.termsVersion });
    return this.serializeProfile(profile, input.payoutAccountNumber);
  }

  async updatePayout(input: PayoutInput) {
    const existing = await this.getProfileByUserId(input.userId);
    if (!existing) throw new ApiError(404, 'Affiliate profile tidak ditemukan.');

    const result = await this.db.query(
      `
        update public.affiliate_profiles
        set payout_name = $2,
            payout_bank_name = $3,
            payout_account_number_encrypted = $4,
            payout_account_holder = $5,
            updated_at = now()
        where user_id = $1
        returning *
      `,
      [
        input.userId,
        input.payoutName,
        input.payoutBankName,
        FraudGuardService.protectPayoutAccountNumber(input.payoutAccountNumber),
        input.payoutAccountHolder,
      ],
    );
    log('info', 'affiliate_payout_updated', { affiliateProfileId: existing.id, userId: input.userId });
    return this.serializeProfile(result.rows[0], input.payoutAccountNumber);
  }

  async listAdmin(input: { status?: string; search?: string; limit: number; offset: number; sort: string }) {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (input.status) where.push(`ap.status = ${add(input.status)}`);
    if (input.search) {
      const param = add(`%${input.search.toLowerCase()}%`);
      where.push(`(lower(coalesce(ap.affiliate_code, '')) like ${param} or lower(coalesce(p.email, '')) like ${param} or lower(coalesce(p.display_name, p.username, '')) like ${param})`);
    }
    const orderBy = input.sort === 'oldest' ? 'ap.created_at asc' : input.sort === 'status' ? 'ap.status asc, ap.created_at desc' : 'ap.created_at desc';
    values.push(input.limit, input.offset);
    const result = await this.db.query(
      `
        select
          ap.*,
          p.email,
          p.display_name,
          p.username,
          (select count(*)::int from public.referral_registrations rr where rr.referrer_user_id = ap.user_id and rr.referral_type = 'affiliate' and rr.first_payment_at is not null) as total_conversions,
          (select coalesce(sum(ct.amount), 0)::numeric from public.commission_transactions ct where ct.affiliate_profile_id = ap.id and ct.status in ('eligible', 'approved', 'paid')) as total_commission
        from public.affiliate_profiles ap
        left join public.profiles p on p.id = ap.user_id
        ${where.length ? `where ${where.join(' and ')}` : ''}
        order by ${orderBy}
        limit $${values.length - 1} offset $${values.length}
      `,
      values,
    );
    return result.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      user_email: FraudGuardService.maskEmail(row.email),
      user_name: FraudGuardService.maskName(row.display_name ?? row.username),
      affiliate_code: row.affiliate_code,
      status: row.status,
      commission_rate: Number(row.commission_rate ?? 0),
      total_conversions: Number(row.total_conversions ?? 0),
      total_commission: Number(row.total_commission ?? 0),
      created_at: row.created_at,
    }));
  }

  async getAdminDetail(id: string) {
    const profile = await this.getProfileById(id);
    if (!profile) throw new ApiError(404, 'Affiliate profile tidak ditemukan.');
    const [registrations, commissions, terms, stats] = await Promise.all([
      this.db.query(`select * from public.referral_registrations where referrer_user_id = $1 order by registered_at desc limit 100`, [profile.user_id]),
      this.db.query(`select * from public.commission_transactions where affiliate_profile_id = $1 order by created_at desc limit 100`, [id]),
      this.db.query(`select id, terms_version, accepted_at from public.affiliate_terms_acceptances where affiliate_profile_id = $1 order by accepted_at desc`, [id]),
      this.db.query(
        `
          select
            (select count(*)::int from public.referral_clicks clicks join public.referral_codes rc on rc.id = clicks.referral_code_id where rc.user_id = $1 and rc.type = 'affiliate') as total_clicks,
            (select count(*)::int from public.referral_registrations rr where rr.referrer_user_id = $1 and rr.referral_type = 'affiliate') as total_registrations,
            (select count(*)::int from public.referral_registrations rr where rr.referrer_user_id = $1 and rr.referral_type = 'affiliate' and rr.first_payment_at is not null) as total_paid_conversions,
            (select coalesce(sum(ct.amount), 0)::numeric from public.commission_transactions ct where ct.affiliate_profile_id = $2 and ct.status in ('eligible', 'approved', 'paid')) as total_commission_earned
        `,
        [profile.user_id, id],
      ),
    ]);
    const statRow = stats.rows[0] ?? {};
    return {
      affiliate_profile: this.serializeProfile(profile),
      stats: {
        total_clicks: Number(statRow.total_clicks ?? 0),
        total_registrations: Number(statRow.total_registrations ?? 0),
        total_paid_conversions: Number(statRow.total_paid_conversions ?? 0),
        total_commission_earned: Number(statRow.total_commission_earned ?? 0),
      },
      referral_registrations: registrations.rows,
      commission_history: commissions.rows,
      payout_info: this.serializePayout(profile),
      terms_acceptance: terms.rows,
    };
  }

  async updateStatus(id: string, status: 'active' | 'suspended' | 'rejected', note: string | null) {
    const current = await this.getProfileById(id);
    if (!current) throw new ApiError(404, 'Affiliate profile tidak ditemukan.');
    const result = await this.db.query(
      `update public.affiliate_profiles set status = $2, updated_at = now() where id = $1 returning *`,
      [id, status],
    );
    log('info', 'affiliate_status_updated', { affiliateProfileId: id, userId: current.user_id ?? null, status });
    return { affiliate_profile: this.serializeProfile(result.rows[0]), note };
  }

  private serializeProfile(profile: Record<string, unknown>, accountNumber?: string | null) {
    const { payout_account_number_encrypted: _encrypted, email, display_name, username, ...safe } = profile;
    return {
      ...safe,
      user_email: FraudGuardService.maskEmail(email as string | null),
      user_name: FraudGuardService.maskName((display_name ?? username) as string | null),
      payout_info: this.serializePayout(profile, accountNumber),
    };
  }

  private serializePayout(profile: Record<string, unknown>, accountNumber?: string | null) {
    return {
      payout_name: profile.payout_name ?? null,
      payout_bank_name: profile.payout_bank_name ?? null,
      payout_account_holder: profile.payout_account_holder ?? null,
      payout_account_number_masked: FraudGuardService.maskAccountNumber(accountNumber ?? null),
    };
  }
}
