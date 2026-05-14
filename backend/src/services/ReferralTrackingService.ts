import type { Pool, PoolClient } from 'pg';
import { ApiError, log } from '../core';
import { ReferralCodeService } from './ReferralCodeService';
import { FraudGuardService } from './FraudGuardService';

type Db = Pool | PoolClient;

type TrackClickInput = {
  referralCodeId: string;
  ip: string | null;
  userAgent?: string | null;
  landingPage?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

export class ReferralTrackingService {
  constructor(private db: Db) {}

  async trackClick(input: TrackClickInput) {
    const result = await this.db.query(
      `
        insert into public.referral_clicks (
          referral_code_id, ip_hash, user_agent, landing_page, utm_source, utm_medium, utm_campaign
        ) values ($1, $2, $3, $4, $5, $6, $7)
        returning id, referral_code_id, clicked_at
      `,
      [
        input.referralCodeId,
        FraudGuardService.hashIp(input.ip),
        input.userAgent ?? null,
        input.landingPage ?? null,
        input.utmSource ?? null,
        input.utmMedium ?? null,
        input.utmCampaign ?? null,
      ],
    );
    const row = result.rows[0];
    log('info', 'referral_click_tracked', { referralCodeId: input.referralCodeId, referralClickId: row?.id ?? null });
    return row;
  }

  async registerAttribution(input: { referralCode: string; referredUserId: string }) {
    const codeService = new ReferralCodeService(this.db);
    const referralCode = await codeService.findByCode(input.referralCode);
    if (!referralCode || referralCode.is_active !== true) {
      throw new ApiError(400, 'Kode referral tidak valid.');
    }

    if (referralCode.user_id === input.referredUserId) {
      throw new ApiError(400, 'Self-referral tidak diizinkan.');
    }

    const existing = await this.db.query(
      `select id, status from public.referral_registrations where referred_user_id = $1 limit 1`,
      [input.referredUserId],
    );
    if (existing.rows[0]) {
      log('info', 'referral_registration_existing', { referralRegistrationId: existing.rows[0].id, referredUserId: input.referredUserId });
      return { registration: existing.rows[0], created: false };
    }

    const result = await this.db.query(
      `
        insert into public.referral_registrations (
          referral_code_id, referrer_user_id, referred_user_id, referral_type
        ) values ($1, $2, $3, $4)
        returning *
      `,
      [referralCode.id, referralCode.user_id, input.referredUserId, referralCode.type],
    );
    log('info', 'referral_registration_created', { referralRegistrationId: result.rows[0]?.id ?? null, referralCodeId: referralCode.id, referrerUserId: referralCode.user_id, referredUserId: input.referredUserId, referralType: referralCode.type });
    return { registration: result.rows[0], created: true };
  }

  async getUserReferralDashboard(userId: string) {
    const codeService = new ReferralCodeService(this.db);
    const referralCode = await codeService.findActiveByUser(userId, 'customer_referral');
    const codeId = referralCode?.id ?? null;

    const [clicks, registrations, commissions, history] = await Promise.all([
      this.db.query(
        `select count(*)::int as total from public.referral_clicks where referral_code_id = $1`,
        [codeId],
      ),
      this.db.query(
        `
          select
            count(*)::int as total_registrations,
            count(*) filter (where trial_started_at is not null)::int as total_trial_started,
            count(*) filter (where first_payment_at is not null or status in ('paid', 'eligible', 'rewarded'))::int as total_paid
          from public.referral_registrations
          where referrer_user_id = $1 and referral_type = 'customer_referral'
        `,
        [userId],
      ),
      this.db.query(
        `
          select
            coalesce(sum(amount) filter (where status in ('pending', 'eligible')), 0)::numeric as pending,
            coalesce(sum(amount) filter (where status = 'approved'), 0)::numeric as approved,
            coalesce(sum(amount) filter (where status = 'paid'), 0)::numeric as paid
          from public.commission_transactions
          where referrer_user_id = $1 and type = 'referral_credit'
        `,
        [userId],
      ),
      this.db.query(
        `
          select
            rr.id,
            rr.status,
            rr.registered_at,
            rr.trial_started_at,
            rr.first_payment_at,
            rr.eligible_at,
            p.email as referred_email,
            p.display_name as referred_name
          from public.referral_registrations rr
          left join public.profiles p on p.id = rr.referred_user_id
          where rr.referrer_user_id = $1 and rr.referral_type = 'customer_referral'
          order by rr.registered_at desc
          limit 50
        `,
        [userId],
      ),
    ]);

    const registrationStats = registrations.rows[0] ?? {};
    const commissionStats = commissions.rows[0] ?? {};
    return {
      referral_code: referralCode,
      referral_link: referralCode ? codeService.buildReferralLink(String(referralCode.code)) : null,
      total_clicks: Number(clicks.rows[0]?.total ?? 0),
      total_registrations: Number(registrationStats.total_registrations ?? 0),
      total_trial_started: Number(registrationStats.total_trial_started ?? 0),
      total_paid: Number(registrationStats.total_paid ?? 0),
      total_reward_pending: Number(commissionStats.pending ?? 0),
      total_reward_approved: Number(commissionStats.approved ?? 0),
      total_reward_paid: Number(commissionStats.paid ?? 0),
      referral_history: history.rows.map((row) => ({
        id: row.id,
        status: row.status,
        registered_at: row.registered_at,
        trial_started_at: row.trial_started_at,
        first_payment_at: row.first_payment_at,
        eligible_at: row.eligible_at,
        referred_user: {
          email: FraudGuardService.maskEmail(row.referred_email),
          name: FraudGuardService.maskName(row.referred_name),
        },
      })),
    };
  }
}
