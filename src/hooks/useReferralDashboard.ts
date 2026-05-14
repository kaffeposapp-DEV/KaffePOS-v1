import { useCallback, useEffect, useState } from 'react';
import { generateReferralCode, getReferralStats } from '@/lib/backendApi';
import type { ReferralStats } from '@/types/affiliate';

export function useReferralDashboard() {
  const [data, setData] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    try {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      const response = await getReferralStats();
      setData(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat data referral.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const generate = useCallback(async () => {
    try {
      setGenerating(true);
      setError(null);
      await generateReferralCode();
      await load('refresh');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat kode referral.';
      setError(message);
      return false;
    } finally {
      setGenerating(false);
    }
  }, [load]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  return { data, loading, refreshing, generating, error, reload: load, generate };
}
