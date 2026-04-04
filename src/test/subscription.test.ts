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
        data: { tier: 'pro', is_pro: true, pro_plan: 'monthly', pro_expires_at: new Date(Date.now() + 86400000).toISOString() }, 
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

  it('validateLicenseKey format salah -> error', async () => {
    const res = await subscriptionManager.validateAndActivateLicense('');
    expect(res.success).toBe(false);
    expect(res.message).toBe('Kode lisensi minimal 10 karakter');
  });

  it('validateLicenseKey valid -> aktivasi berhasil', async () => {
    // Mock valid license check
    (supabase.from as any).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ 
        data: { key: 'VALID_KEY_123', is_used: false, plan: 'monthly' }, 
        error: null 
      }),
    })).mockImplementationOnce(() => ({ // mock profile update
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

    const res = await subscriptionManager.validateAndActivateLicense('VALID_KEY_123');
    expect(res.success).toBe(true);
  });

  it('incrementTransaction freemium -> blocked setelah 50', async () => {
    // Mock freemium profile
    (supabase.from as any).mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ 
        data: { tier: 'freemium', is_pro: false }, 
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
          pro_plan: 'monthly',
          pro_expires_at: new Date(Date.now() + 86400000).toISOString()
        }, 
        error: null 
      }),
    }));

    const status = await subscriptionManager.getStatus(true);
    expect(status.plan).toBe('monthly');
    expect(subscriptionManager.isPro()).toBe(true);
  });
});
