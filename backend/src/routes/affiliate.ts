import { Router } from 'express';
import { z } from 'zod';
import {
  authenticate,
  requireAdmin,
  pool,
  withTransaction,
  parsePaginationQuery,
  buildPaginationMeta,
  ApiError,
} from '../core';
import { AffiliateService } from '../services/AffiliateService';
import { CommissionService } from '../services/CommissionService';
import { FraudGuardService } from '../services/FraudGuardService';
import { isAffiliateEnabled, isAdminCommissionEnabled } from '../lib/config/feature-flags';

const router = Router();
const uuidSchema = z.string().uuid();

const payoutSchema = z.object({
  payoutName: z.string().trim().min(2).max(120),
  payoutBankName: z.string().trim().min(2).max(120),
  payoutAccountNumber: z.string().trim().min(4).max(64).regex(/^[0-9\s.-]+$/),
  payoutAccountHolder: z.string().trim().min(2).max(120),
});

const applySchema = payoutSchema.extend({
  acceptedTerms: z.literal(true),
  termsVersion: z.string().trim().min(1).max(40),
});

const affiliateStatusSchema = z.enum(['pending', 'active', 'suspended', 'rejected']);
const adminAffiliateStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'rejected']),
  note: z.string().trim().max(500).optional().nullable(),
});
const commissionStatusSchema = z.enum(['pending', 'eligible', 'approved', 'rejected', 'paid', 'cancelled']);
const commissionTypeSchema = z.enum(['referral_credit', 'affiliate_cash']);
const approveSchema = z.object({ note: z.string().trim().max(500).optional().nullable() });
const rejectSchema = z.object({ note: z.string().trim().min(1).max(500) });
const markPaidSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
  payoutReference: z.string().trim().max(120).optional().nullable(),
});

function getRequestIp(req: Parameters<Parameters<typeof router.post>[1]>[0]) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0]?.trim() ?? null;
  return req.ip || req.socket.remoteAddress || null;
}

function readString(query: Record<string, unknown>, key: string) {
  const value = query[key];
  if (Array.isArray(value)) return typeof value[0] === 'string' && value[0].trim() ? value[0].trim() : undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readPagination(query: Record<string, unknown>) {
  const pageRaw = Number.parseInt(String(query.page ?? ''), 10);
  const { limit, offset } = parsePaginationQuery(query, { defaultLimit: 25, maxLimit: 100 });
  if (Number.isFinite(pageRaw) && pageRaw > 0) return { limit, offset: (pageRaw - 1) * limit };
  return { limit, offset };
}

router.get('/api/affiliate/me', authenticate, async (req, res, next) => {
  try {
    if (!isAffiliateEnabled()) throw new ApiError(404, 'Affiliate feature is disabled.');
    const dashboard = await new AffiliateService(pool).getDashboard(req.authUser!.id);
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

router.post('/api/affiliate/apply', authenticate, async (req, res, next) => {
  try {
    if (!isAffiliateEnabled()) throw new ApiError(404, 'Affiliate feature is disabled.');
    const payload = applySchema.parse(req.body);
    const affiliateProfile = await withTransaction(async (client) => new AffiliateService(client).apply({
      userId: req.authUser!.id,
      payoutName: payload.payoutName,
      payoutBankName: payload.payoutBankName,
      payoutAccountNumber: payload.payoutAccountNumber,
      payoutAccountHolder: payload.payoutAccountHolder,
      acceptedTerms: payload.acceptedTerms,
      termsVersion: payload.termsVersion,
      ip: getRequestIp(req),
    }));
    res.status(201).json({ affiliate_profile: affiliateProfile });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/affiliate/me/payout', authenticate, async (req, res, next) => {
  try {
    if (!isAffiliateEnabled()) throw new ApiError(404, 'Affiliate feature is disabled.');
    const payload = payoutSchema.parse(req.body);
    const affiliateProfile = await withTransaction(async (client) => new AffiliateService(client).updatePayout({
      userId: req.authUser!.id,
      payoutName: payload.payoutName,
      payoutBankName: payload.payoutBankName,
      payoutAccountNumber: payload.payoutAccountNumber,
      payoutAccountHolder: payload.payoutAccountHolder,
    }));
    res.json({ affiliate_profile: affiliateProfile });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/affiliates', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!isAdminCommissionEnabled()) throw new ApiError(404, 'Admin commission feature is disabled.');
    const status = readString(req.query, 'status');
    if (status) affiliateStatusSchema.parse(status);
    const { limit, offset } = readPagination(req.query);
    const items = await new AffiliateService(pool).listAdmin({
      status,
      search: readString(req.query, 'search'),
      sort: readString(req.query, 'sort') ?? 'newest',
      limit,
      offset,
    });
    res.json({ items, pagination: buildPaginationMeta({ limit, offset, returned: items.length }) });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/affiliates/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!isAdminCommissionEnabled()) throw new ApiError(404, 'Admin commission feature is disabled.');
    const id = uuidSchema.parse(req.params.id);
    const detail = await new AffiliateService(pool).getAdminDetail(id);
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

router.patch('/api/admin/affiliates/:id/status', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!isAdminCommissionEnabled()) throw new ApiError(404, 'Admin commission feature is disabled.');
    const id = uuidSchema.parse(req.params.id);
    const payload = adminAffiliateStatusSchema.parse(req.body);
    const result = await withTransaction(async (client) => new AffiliateService(client).updateStatus(id, payload.status, payload.note ?? null));
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/referrals', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!isAdminCommissionEnabled()) throw new ApiError(404, 'Admin commission feature is disabled.');
    const { limit, offset } = readPagination(req.query);
    const values: unknown[] = [];
    const where: string[] = [];
    const add = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    const status = readString(req.query, 'status');
    const referralType = readString(req.query, 'referral_type');
    if (status) where.push(`rr.status = ${add(status)}`);
    if (referralType) where.push(`rr.referral_type = ${add(referralType)}`);
    for (const key of ['referrer_user_id', 'referred_user_id'] as const) {
      const value = readString(req.query, key);
      if (value) where.push(`rr.${key} = ${add(uuidSchema.parse(value))}`);
    }
    const dateFrom = readString(req.query, 'date_from');
    const dateTo = readString(req.query, 'date_to');
    if (dateFrom) where.push(`rr.registered_at >= ${add(dateFrom)}::timestamptz`);
    if (dateTo) where.push(`rr.registered_at <= ${add(dateTo)}::timestamptz`);
    const search = readString(req.query, 'search');
    if (search) {
      const param = add(`%${search.toLowerCase()}%`);
      where.push(`(lower(rc.code) like ${param} or lower(coalesce(referrer.email, '')) like ${param} or lower(coalesce(referred.email, '')) like ${param})`);
    }
    values.push(limit, offset);
    const result = await pool.query(
      `
        select rr.id, rc.code as referral_code, rr.status, rr.referral_type, rr.registered_at, rr.trial_started_at, rr.first_payment_at, rr.eligible_at,
               json_build_object('id', referrer.id, 'email', referrer.email, 'name', coalesce(referrer.display_name, referrer.username)) as referrer_info,
               json_build_object('id', referred.id, 'email', referred.email, 'name', coalesce(referred.display_name, referred.username)) as referred_user_info
        from public.referral_registrations rr
        join public.referral_codes rc on rc.id = rr.referral_code_id
        left join public.profiles referrer on referrer.id = rr.referrer_user_id
        left join public.profiles referred on referred.id = rr.referred_user_id
        ${where.length ? `where ${where.join(' and ')}` : ''}
        order by rr.registered_at desc
        limit $${values.length - 1} offset $${values.length}
      `,
      values,
    );
    const items = result.rows.map((row) => ({
      ...row,
      referrer_info: { ...row.referrer_info, email: FraudGuardService.maskEmail(row.referrer_info?.email), name: FraudGuardService.maskName(row.referrer_info?.name) },
      referred_user_info: { ...row.referred_user_info, email: FraudGuardService.maskEmail(row.referred_user_info?.email), name: FraudGuardService.maskName(row.referred_user_info?.name) },
    }));
    res.json({ items, pagination: buildPaginationMeta({ limit, offset, returned: items.length }) });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/referrals/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!isAdminCommissionEnabled()) throw new ApiError(404, 'Admin commission feature is disabled.');
    const id = uuidSchema.parse(req.params.id);
    const result = await pool.query(
      `
        select rr.*, row_to_json(rc) as referral_code,
          (select json_build_object('total_clicks', count(*)) from public.referral_clicks clicks where clicks.referral_code_id = rr.referral_code_id) as click_summary,
          (select row_to_json(ct) from public.commission_transactions ct where ct.referral_registration_id = rr.id order by ct.created_at desc limit 1) as related_commission
        from public.referral_registrations rr
        join public.referral_codes rc on rc.id = rr.referral_code_id
        where rr.id = $1
        limit 1
      `,
      [id],
    );
    if (!result.rows[0]) throw new ApiError(404, 'Referral tidak ditemukan.');
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/commissions', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!isAdminCommissionEnabled()) throw new ApiError(404, 'Admin commission feature is disabled.');
    const { limit, offset } = readPagination(req.query);
    const status = readString(req.query, 'status');
    const type = readString(req.query, 'type');
    if (status) commissionStatusSchema.parse(status);
    if (type) commissionTypeSchema.parse(type);
    const items = await new CommissionService(pool).listAdmin({
      status,
      type,
      affiliateProfileId: readString(req.query, 'affiliate_profile_id'),
      referrerUserId: readString(req.query, 'referrer_user_id'),
      referredUserId: readString(req.query, 'referred_user_id'),
      dateFrom: readString(req.query, 'date_from'),
      dateTo: readString(req.query, 'date_to'),
      search: readString(req.query, 'search'),
      limit,
      offset,
    });
    res.json({ items, pagination: buildPaginationMeta({ limit, offset, returned: items.length }) });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/commissions/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!isAdminCommissionEnabled()) throw new ApiError(404, 'Admin commission feature is disabled.');
    const id = uuidSchema.parse(req.params.id);
    const detail = await new CommissionService(pool).getAdminDetail(id);
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

router.patch('/api/admin/commissions/:id/approve', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!isAdminCommissionEnabled()) throw new ApiError(404, 'Admin commission feature is disabled.');
    const id = uuidSchema.parse(req.params.id);
    const payload = approveSchema.parse(req.body);
    const commission = await withTransaction(async (client) => new CommissionService(client).approve(id, payload.note ?? null));
    res.json({ commission });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/admin/commissions/:id/reject', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!isAdminCommissionEnabled()) throw new ApiError(404, 'Admin commission feature is disabled.');
    const id = uuidSchema.parse(req.params.id);
    const payload = rejectSchema.parse(req.body);
    const commission = await withTransaction(async (client) => new CommissionService(client).reject(id, payload.note));
    res.json({ commission });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/admin/commissions/:id/mark-paid', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!isAdminCommissionEnabled()) throw new ApiError(404, 'Admin commission feature is disabled.');
    const id = uuidSchema.parse(req.params.id);
    const payload = markPaidSchema.parse(req.body);
    const commission = await withTransaction(async (client) => new CommissionService(client).markPaid(id, payload.note ?? null, payload.payoutReference ?? null));
    res.json({ commission });
  } catch (error) {
    next(error);
  }
});

export default router;
