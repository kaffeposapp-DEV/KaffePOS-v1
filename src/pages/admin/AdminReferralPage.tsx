/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { adminGetReferralDetail, adminGetReferrals } from '@/lib/backendApi';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { fDate } from '@/utils/format';
import type { AdminReferralDetail, AdminReferralListItem } from '@/types/affiliate';
import { AdminInput, AdminPageShell, AdminSelect, DetailModal, EmptyState, ErrorCard, Filters, LoadingCard, StatusBadge, SummaryCards } from './adminUi';

export default function AdminReferralPage() {
  const [items, setItems] = useState<AdminReferralListItem[]>([]);
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search, 300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminReferralDetail | null>(null);
  const load = async () => { try { setLoading(true); setError(null); const data = await adminGetReferrals({ status, referral_type: type, search: dSearch, limit: 50 }); setItems(data.items || []); } catch (err) { setError(err instanceof Error ? err.message : 'Gagal memuat referral.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [status, type, dSearch]);
  const summary = useMemo(() => [
    { label: 'Total', value: items.length }, { label: 'Registered', value: items.filter((i) => i.status === 'registered').length }, { label: 'Trial', value: items.filter((i) => i.status === 'trial_started').length }, { label: 'Paid', value: items.filter((i) => i.status === 'paid').length }, { label: 'Eligible', value: items.filter((i) => i.status === 'eligible').length }, { label: 'Rejected/Cancel', value: items.filter((i) => i.status === 'rejected' || i.status === 'cancelled').length },
  ], [items]);
  const openDetail = async (id: string) => { const data = await adminGetReferralDetail(id); setDetail(data); trackAnalyticsEvent('admin_referral_detail_viewed'); };
  return <AdminPageShell title="Admin Referrals" description="Pantau attribution, status referral, payment, dan komisi terkait.">
    <SummaryCards items={summary} />
    <Filters onRefresh={() => void load()}><AdminSelect aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Semua status</option><option value="registered">Registered</option><option value="trial_started">Trial</option><option value="paid">Paid</option><option value="eligible">Eligible</option><option value="rewarded">Rewarded</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></AdminSelect><AdminSelect aria-label="Filter tipe" value={type} onChange={(e) => setType(e.target.value)}><option value="all">Semua tipe</option><option value="customer_referral">Customer referral</option><option value="affiliate">Affiliate</option></AdminSelect><AdminInput aria-label="Cari referral" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari referral" /><button onClick={() => void load()} className="rounded-2xl bg-[#FF6A00] px-4 py-3 text-sm font-black text-white">Cari</button></Filters>
    {loading ? <LoadingCard /> : error ? <ErrorCard message={error} onRetry={() => void load()} /> : <section className="rounded-3xl border border-slate-100 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100 text-sm"><thead className="bg-slate-50/80 text-left text-xs font-black uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Kode</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Referrer</th><th className="px-5 py-3">Referred</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Daftar</th><th className="px-5 py-3">Trial</th><th className="px-5 py-3">Bayar</th><th className="px-5 py-3">Eligible</th><th className="px-5 py-3">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{items.length === 0 ? <tr><td colSpan={10}><EmptyState label="Belum ada referral." /></td></tr> : items.map((item) => <tr key={item.id} className="hover:bg-orange-50/30"><td className="px-5 py-4 font-mono text-slate-700">{item.referral_code || item.referral_code_id}</td><td className="px-5 py-4">{item.referral_type || '-'}</td><td className="px-5 py-4"><p className="font-black text-slate-800">{item.referrer_name || '-'}</p><p className="text-xs text-slate-400">{item.referrer_email || '-'}</p></td><td className="px-5 py-4"><p className="font-black text-slate-800">{item.referred_name || '-'}</p><p className="text-xs text-slate-400">{item.referred_email || '-'}</p></td><td className="px-5 py-4"><StatusBadge status={item.status || '-'} /></td><td className="px-5 py-4">{item.registered_at ? fDate(item.registered_at) : '-'}</td><td className="px-5 py-4">{item.trial_started_at ? fDate(item.trial_started_at) : '-'}</td><td className="px-5 py-4">{item.first_payment_at ? fDate(item.first_payment_at) : '-'}</td><td className="px-5 py-4">{item.eligible_at ? fDate(item.eligible_at) : '-'}</td><td className="px-5 py-4"><button onClick={() => void openDetail(item.id)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Detail</button></td></tr>)}</tbody></table></div></section>}
    {detail && <DetailModal title="Detail Referral" onClose={() => setDetail(null)}><pre className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">{JSON.stringify(detail, null, 2)}</pre></DetailModal>}
  </AdminPageShell>;
}
