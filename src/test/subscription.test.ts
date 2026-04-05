/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscriptionManager } from '@/services/SubscriptionManager';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user_123' } }, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ 
        data: { tier: 'pro', is_pro: true, pro_plan: 'kopi_susu', pro_expires_at: new Date(Date.now() + 86400000).toISOString() }, 
        error: null 
      }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
    })),
  },
}));

describe('Subscription Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    subscriptionManager.clearCache();
  });

  it('incrementTransaction secangkir -> blocked setelah 50', async () => {
    // Mock free profile
    (supabase.from as any).mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ 
        data: { tier: 'basic', is_pro: false, pro_plan: 'secangkir' }, 
        error: null 
      }),
    }));

    // Reset tx count
    localStorage.setItem('kaffepos_tx_month', JSON.stringify({ count: 50, month: new Date().toISOString().substring(0, 7) }));

    const res = await subscriptionManager.checkTransactionAllowed();
    expect(res.allowed).toBe(false);
  });

  it('isPro() return benar sesuai plan', async () => {
    // Force set cached status for pro
    (supabase.from as any).mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ 
        data: { 
          tier: 'pro', 
          is_pro: true, 
          pro_plan: 'kopi_susu',
          pro_expires_at: new Date(Date.now() + 86400000).toISOString()
        }, 
        error: null 
      }),
    }));

    const status = await subscriptionManager.getStatus(true);
    expect(status.plan).toBe('kopi_susu');
    expect(subscriptionManager.isPro()).toBe(true);
  });
});
