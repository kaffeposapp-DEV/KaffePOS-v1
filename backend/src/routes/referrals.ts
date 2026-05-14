import { Router } from 'express';
import { z } from 'zod';
import {
  authenticate,
  createRateLimiter,
  getRateLimitIp,
  pool,
  withTransaction,
  ApiError,
} from '../core';
import { isReferralEnabled } from '../lib/config/feature-flags';
import { ReferralCodeService } from '../services/ReferralCodeService';
import { ReferralTrackingService } from '../services/ReferralTrackingService';

const router = Router();

const referralCodeSchema = z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/).transform((value) => value.toUpperCase());
const registerAttributionSchema = z.object({ referralCode: referralCodeSchema });

const publicReferralRateLimiter = createRateLimiter({
  name: 'public-referral',
  max: 120,
  windowMs: 15 * 60 * 1000,
  key: (req) => getRateLimitIp(req),
  message: 'Terlalu banyak request referral. Coba lagi nanti.',
});

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getRequestIp(req: Parameters<Parameters<typeof router.get>[1]>[0]) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0]?.trim() ?? null;
  return req.ip || req.socket.remoteAddress || null;
}

router.get('/api/ref/:code', publicReferralRateLimiter, async (req, res, next) => {
  try {
    if (!isReferralEnabled()) {
      res.status(200).json({ valid: false, feature_disabled: true, code: req.params.code ?? null, type: null, discount: null });
      return;
    }
    const code = referralCodeSchema.parse(req.params.code);
    const codeService = new ReferralCodeService(pool);
    const trackingService = new ReferralTrackingService(pool);
    const referralCode = await codeService.findByCode(code);

    if (!referralCode || referralCode.is_active !== true) {
      res.status(200).json({ valid: false, code, type: null, discount: null });
      return;
    }

    await trackingService.trackClick({
      referralCodeId: referralCode.id as string,
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'] ?? null,
      landingPage: firstQueryValue(req.query.landing_page) ?? firstQueryValue(req.query.landingPage),
      utmSource: firstQueryValue(req.query.utm_source),
      utmMedium: firstQueryValue(req.query.utm_medium),
      utmCampaign: firstQueryValue(req.query.utm_campaign),
    });

    res.json({
      valid: true,
      code: referralCode.code,
      type: referralCode.type,
      discount: referralCode.type === 'customer_referral'
        ? { type: 'percentage', value: 20, description: '20% off first month' }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/referrals/me', authenticate, async (req, res, next) => {
  try {
    if (!isReferralEnabled()) throw new ApiError(404, 'Referral feature is disabled.');
    const dashboard = await new ReferralTrackingService(pool).getUserReferralDashboard(req.authUser!.id);
    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

router.post('/api/referrals/generate', authenticate, async (req, res, next) => {
  try {
    if (!isReferralEnabled()) throw new ApiError(404, 'Referral feature is disabled.');
    const codeService = new ReferralCodeService(pool);
    const referralCode = await codeService.getOrCreateForUser(req.authUser!.id, 'customer_referral');
    res.status(200).json({ code: referralCode.code, referral_link: codeService.buildReferralLink(String(referralCode.code)) });
  } catch (error) {
    next(error);
  }
});

router.post('/api/referrals/register-attribution', authenticate, async (req, res, next) => {
  try {
    if (!isReferralEnabled()) throw new ApiError(404, 'Referral feature is disabled.');
    const payload = registerAttributionSchema.parse(req.body);
    const result = await withTransaction(async (client) => new ReferralTrackingService(client).registerAttribution({
      referralCode: payload.referralCode,
      referredUserId: req.authUser!.id,
    }));
    res.status(result.created ? 201 : 200).json({ ok: true, created: result.created, referral_registration: result.registration });
  } catch (error) {
    next(error);
  }
});

export default router;
