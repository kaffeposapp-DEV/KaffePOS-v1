import { useCallback, useEffect, useState } from 'react';
import { applyForAffiliate, getAffiliateDashboard, updateAffiliatePayoutDetails } from '@/lib/backendApi';
import type { AffiliateApplyInput, AffiliateDashboardData, AffiliatePayoutInput } from '@/types/affiliate';

function isMissingProfileError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
  return message.includes('tidak ditemukan') || message.includes('not found') || message.includes('404');
}

export function useAffiliateDashboard() {
  const [data, setData] = useState<AffiliateDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingPayout, setUpdatingPayout] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    try {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      const response = await getAffiliateDashboard();
      setData(response);
    } catch (err) {
      if (isMissingProfileError(err)) {
        setData(null);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Gagal memuat dashboard affiliate.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const apply = useCallback(async (payload: AffiliateApplyInput) => {
    try {
      setSubmitting(true);
      setError(null);
      await applyForAffiliate(payload);
      await load('refresh');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim pengajuan affiliate.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [load]);

  const updatePayout = useCallback(async (payload: AffiliatePayoutInput) => {
    try {
      setUpdatingPayout(true);
      setError(null);
      await updateAffiliatePayoutDetails(payload);
      await load('refresh');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan payout.');
      return false;
    } finally {
      setUpdatingPayout(false);
    }
  }, [load]);

  useEffect(() => {
    void load('initial');
  }, [load]);

  return { data, loading, refreshing, submitting, updatingPayout, error, reload: load, apply, updatePayout };
}
