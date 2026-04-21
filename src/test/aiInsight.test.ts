 
 
 
 
 
 
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/backendApi', () => ({
  requestAiInsight: vi.fn(),
}));

import { requestAiInsight } from '@/lib/backendApi';
import { getAIInsight, type InsightContext } from '@/lib/aiInsight';

const baseContext: InsightContext = {
  period: 'Bulan Ini',
  storeName: 'KaffePOS Test',
  totalRevenue: 2_500_000,
  totalCogs: 1_000_000,
  netProfit: 900_000,
  grossMargin: 60,
  txCount: 40,
  avgTrx: 62_500,
  topMenus: [
    { name: 'Cappuccino', qty: 20, revenue: 800_000 },
    { name: 'Latte', qty: 12, revenue: 500_000 },
  ],
  lowStockItems: [
    { name: 'Susu', stock: 1, unit: 'liter', min: 3 },
  ],
  totalExpenses: 600_000,
  trendData: [
    { label: 'Sen', value: 300_000 },
    { label: 'Sel', value: 350_000 },
    { label: 'Rab', value: 400_000 },
  ],
  paymentMix: [
    { method: 'Tunai', pct: 30 },
    { method: 'QRIS', pct: 70 },
  ],
};

describe('AI Insight fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mengembalikan fallback lokal saat billing/quota Gemini gagal', async () => {
    vi.mocked(requestAiInsight).mockRejectedValue(new Error('Billing Gemini belum aktif. Sistem akan memakai analisis cadangan.'));

    const result = await getAIInsight(baseContext);

    expect(result.source).toBe('local');
    expect(result.summary).toContain('Pendapatan');
    expect(result.bestMenu).toContain('Cappuccino');
    expect(result.stockAlert).toContain('Susu');
  });

  it('menandai hasil Gemini saat request berhasil', async () => {
    vi.mocked(requestAiInsight).mockResolvedValue({
      summary: 'Ringkasan dari Gemini',
      bestMenu: 'Fokus ke Cappuccino',
      stockAlert: 'Stok aman',
      prediction: 'Pendapatan naik',
      tips: ['Tip 1', 'Tip 2', 'Tip 3'],
    });

    const result = await getAIInsight(baseContext);

    expect(result.source).toBe('gemini');
    expect(result.summary).toBe('Ringkasan dari Gemini');
  });
});
