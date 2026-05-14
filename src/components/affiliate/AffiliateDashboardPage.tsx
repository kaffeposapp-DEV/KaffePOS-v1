import { RefreshCw, Handshake } from 'lucide-react';
import AffiliateApplyForm from './AffiliateApplyForm';
import AffiliateStatusCard from './AffiliateStatusCard';
import AffiliateLinkCard from './AffiliateLinkCard';
import AffiliateStatsCards from './AffiliateStatsCards';
import AffiliateCommissionTable from './AffiliateCommissionTable';
import AffiliatePayoutSettingsForm from './AffiliatePayoutSettingsForm';
import AffiliateRulesCard from './AffiliateRulesCard';
import { useAffiliateDashboard } from '@/hooks/useAffiliateDashboard';
import type { ToastType } from '@/types';

type ToastApi = { showToast: (message: string, type?: ToastType) => void };

export default function AffiliateDashboardPage({ toast }: { toast: ToastApi }) {
  const { data, loading, refreshing, submitting, updatingPayout, error, reload, apply, updatePayout } = useAffiliateDashboard();

  if (loading) {
    return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-6xl space-y-4"><div className="h-24 animate-pulse rounded-3xl bg-slate-100" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="h-32 animate-pulse rounded-3xl bg-slate-100" />)}</div><div className="h-72 animate-pulse rounded-3xl bg-slate-100" /></div></div>;
  }

  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-orange-100 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-orange-50 text-[#FF6A00]"><Handshake size={26} /></div>
          <h1 className="text-xl font-black text-slate-900">Affiliate belum bisa dimuat</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">{error}</p>
          <button type="button" onClick={() => void reload('initial')} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#FF6A00] px-5 py-3 text-sm font-black text-white transition hover:bg-orange-600"><RefreshCw size={16} /> Coba Lagi</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5 pb-6">
        <header className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.22em] text-orange-500">Affiliate Program</p><h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Affiliate Program</h1><p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">Dapatkan komisi dari setiap customer baru yang berlangganan KaffePOS melalui link affiliate kamu.</p></div>
            <button type="button" onClick={() => void reload('refresh')} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-black text-[#FF6A00] transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh</button>
          </div>
        </header>
        {error && <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{error}</div>}
        {!data ? (
          <>
            <AffiliateApplyForm submitting={submitting} onSubmit={apply} toast={toast} />
            <AffiliateRulesCard />
          </>
        ) : (
          <>
            <AffiliateStatusCard status={data.affiliate_profile.status} />
            <AffiliateLinkCard code={data.affiliate_code ?? data.affiliate_profile.affiliate_code ?? null} link={data.affiliate_link ?? null} toast={toast} />
            <AffiliateStatsCards data={data} />
            <AffiliateCommissionTable items={data.commission_history} />
            <AffiliatePayoutSettingsForm payoutInfo={data.payout_info ?? data.affiliate_profile.payout_info ?? null} updating={updatingPayout} onSubmit={updatePayout} toast={toast} />
            <AffiliateRulesCard />
          </>
        )}
      </div>
    </div>
  );
}
