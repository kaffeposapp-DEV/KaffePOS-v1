import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core');
  return { ...actual, log: vi.fn() };
});

vi.mock('../ReferralCodeService', () => ({
  ReferralCodeService: vi.fn().mockImplementation(function () { return {
    findByCode: vi.fn(async (code: string) => ({ id: randomUUID(), code, user_id: 'referrer-user', type: 'customer_referral', is_active: true })),
    findActiveByUser: vi.fn(async () => ({ id: randomUUID(), code: 'REF123', type: 'customer_referral', is_active: true })),
    buildReferralLink: vi.fn((code: string) => `https://kaffepos.app/register?ref=${code}`),
  }; }),
}));

import { ReferralTrackingService } from '../ReferralTrackingService';

describe('ReferralTrackingService', () => {
  let db: { query: ReturnType<typeof vi.fn> };
  const referredUserId = randomUUID();

  beforeEach(() => {
    db = { query: vi.fn() };
    vi.clearAllMocks();
  });

  it('should track referral click with attribution metadata', async () => {
    const clickId = randomUUID();
    db.query.mockResolvedValueOnce({ rows: [{ id: clickId, referral_code_id: 'code-1', ip_hash: 'hash', user_agent_hash: 'ua-hash' }] });

    const service = new ReferralTrackingService(db as any);
    const result = await service.trackClick({
      referralCodeId: 'code-1',
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      landingPath: '/register',
      utmSource: 'instagram',
      utmCampaign: 'may-2026',
    } as any);

    expect(result.id).toBe(clickId);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('insert into public.referral_clicks'), expect.any(Array));
  });

  it('should register referral attribution', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: randomUUID(), referred_user_id: referredUserId, referrer_user_id: 'referrer-user', status: 'registered' }] });

    const service = new ReferralTrackingService(db as any);
    const result = await service.registerAttribution({ referralCode: 'REF123', referredUserId });

    expect(result.created).toBe(true);
    expect(result.registration.referred_user_id).toBe(referredUserId);
  });

  it('should reject self-referral attribution', async () => {
    const service = new ReferralTrackingService(db as any);
    await expect(service.registerAttribution({ referralCode: 'REF123', referredUserId: 'referrer-user' })).rejects.toThrow('Self-referral');
  });

  it('should return existing registration instead of duplicating', async () => {
    const existing = { id: randomUUID(), status: 'registered' };
    db.query.mockResolvedValueOnce({ rows: [existing] });

    const service = new ReferralTrackingService(db as any);
    const result = await service.registerAttribution({ referralCode: 'REF123', referredUserId });

    expect(result.created).toBe(false);
    expect(result.registration).toBe(existing);
  });

  it('should build referral dashboard metrics', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 12 }] })
      .mockResolvedValueOnce({ rows: [{ total_registrations: 4, total_trial_started: 3, total_paid: 2 }] })
      .mockResolvedValueOnce({ rows: [{ pending: 150000, approved: 300000, paid: 150000 }] })
      .mockResolvedValueOnce({ rows: [] });

    const service = new ReferralTrackingService(db as any);
    const dashboard = await service.getUserReferralDashboard('referrer-user');

    expect(dashboard.total_clicks).toBe(12);
    expect(dashboard.total_registrations).toBe(4);
    expect(dashboard.total_reward_pending).toBe(150000);
    expect(dashboard.referral_link).toContain('REF123');
  });
});
