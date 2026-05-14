import { RefreshCw, UsersRound } from 'lucide-react';
import ReferralCodeCard from './ReferralCodeCard';
import ReferralStatsCards from './ReferralStatsCards';
import ReferralHistoryTable from './ReferralHistoryTable';
import ReferralRulesCard from './ReferralRulesCard';
import { useReferralDashboard } from '@/hooks/useReferralDashboard';
import type { ToastType } from '@/types';

type ToastApi = { showToast: (message: string, type?: ToastType) => void };

export default function ReferralDashboardPage({ toast }: { toast: ToastApi }) {
  const { data, loading, refreshing, generating, error, reload, generate } = useReferralDashboard();

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-24 animate-pulse rounded-3xl bg-slate-100" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-32 animate-pulse rounded-3xl bg-slate-100" />)}
          </div>
          <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-orange-100 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-orange-50 text-[#FF6A00]">
            <UsersRound size={26} />
          </div>
          <h1 className="text-xl font-black text-slate-900">Referral belum bisa dimuat</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">{error}</p>
          <button
            type="button"
            onClick={() => void reload('initial')}
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#FF6A00] px-5 py-3 text-sm font-black text-white transition hover:bg-orange-600"
          >
            <RefreshCw size={16} /> Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const safeData = data ?? {
    referral_code: null,
    referral_link: null,
    total_clicks: 0,
    total_registrations: 0,
    total_trial_started: 0,
    total_paid: 0,
    total_reward_pending: 0,
    total_reward_approved: 0,
    total_reward_paid: 0,
    referral_history: [],
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5 pb-6">
        <header className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-500">Referral Program</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Referral Program</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
                Bagikan link referral kamu dan dapatkan reward saat temanmu mulai berlangganan KaffePOS.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void reload('refresh')}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-black text-[#FF6A00] transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            {error}
          </div>
        )}

        <ReferralCodeCard
          referralCode={safeData.referral_code}
          referralLink={safeData.referral_link}
          generating={generating}
          onGenerate={generate}
          toast={toast}
        />
        <ReferralStatsCards data={safeData} />
        <ReferralHistoryTable items={safeData.referral_history} />
        <ReferralRulesCard />
      </div>
    </div>
  );
}
