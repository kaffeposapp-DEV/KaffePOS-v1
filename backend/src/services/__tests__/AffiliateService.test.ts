import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core');
  return { ...actual, log: vi.fn() };
});

vi.mock('../ReferralCodeService', () => ({
  ReferralCodeService: vi.fn().mockImplementation(function () { return {
    getOrCreateForUser: vi.fn(async () => ({ code: 'AFF123' })),
  }; }),
}));

import { AffiliateService } from '../AffiliateService';

describe('AffiliateService', () => {
  let db: { query: ReturnType<typeof vi.fn> };
  const userId = randomUUID();

  beforeEach(() => {
    db = { query: vi.fn() };
    vi.clearAllMocks();
  });

  it('should create affiliate application', async () => {
    const application = { id: randomUUID(), user_id: userId, status: 'pending', commission_rate: 20 };
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [application] });

    const service = new AffiliateService(db as any);
    const result = await service.apply({
      userId,
      acceptedTerms: true,
      payoutName: 'Affiliate User',
      payoutBankName: 'BCA',
      payoutAccountNumber: '1234567890',
      payoutAccountHolder: 'Affiliate User',
      termsVersion: '2026-05',
      ip: '127.0.0.1',
    } as any);

    expect(result.status).toBe('pending');
    expect(result.user_id).toBe(userId);
  });

  it('should prevent duplicate active application', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: randomUUID(), user_id: userId, status: 'pending' }] });
    const service = new AffiliateService(db as any);

    await expect(service.apply({ userId, acceptedTerms: true, payoutName: 'Duplicate' } as any)).rejects.toThrow();
  });

  it('should approve affiliate profile', async () => {
    const profileId = randomUUID();
    const service = new AffiliateService(db as any);
    db.query.mockResolvedValueOnce({ rows: [{ id: profileId, user_id: userId, status: 'pending', commission_rate: 20 }] });
    db.query.mockResolvedValueOnce({ rows: [{ id: profileId, user_id: userId, status: 'active', commission_rate: 25 }] });

    const result = await service.updateStatus(profileId, 'active', 'approved');

    expect(result.affiliate_profile.status).toBe('active');
  });

  it('should list affiliates with pagination', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: randomUUID(), status: 'active' }, { id: randomUUID(), status: 'pending' }] });

    const service = new AffiliateService(db as any);
    const result = await service.listAdmin({ limit: 10, offset: 0, sort: 'newest' } as any);

    expect(result).toHaveLength(2);
  });
});
