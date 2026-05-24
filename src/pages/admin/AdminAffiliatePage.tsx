/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { money } from './adminMoney';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { adminGetAffiliateDetail, adminGetAffiliates, adminUpdateAffiliateStatus } from '@/lib/backendApi';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { fDate, fRp } from '@/utils/format';
import type { AdminAffiliateDetail, AdminAffiliateListItem, AffiliateStatus } from '@/types/affiliate';
import { AdminInput, AdminPageShell, AdminSelect, DetailModal, EmptyState, ErrorCard, Filters, LoadingCard, StatusBadge, SummaryCards } from './adminUi';

export default function AdminAffiliatePage() {
  const [items, setItems] = useState<AdminAffiliateListItem[]>([]);
  const [status, setStatus] = useState<AffiliateStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search, 300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminAffiliateDetail | null>(null);
  const [action, setAction] = useState<{ id: string; status: AffiliateStatus; note: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => { try { setLoading(true); setError(null); const data = await adminGetAffiliates({ status, search: dSearch, limit: 50 }); setItems(data.items || []); } catch (err) { setError(err instanceof Error ? err.message : 'Gagal memuat affiliate.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [status, dSearch]);

  const summary = useMemo(() => [
    { label: 'Total', value: items.length },
    { label: 'Pending', value: items.filter((i) => i.status === 'pending').length },
    { label: 'Aktif', value: items.filter((i) => i.status === 'active').length },
    { label: 'Suspended', value: items.filter((i) => i.status === 'suspended').length },
    { label: 'Revenue', value: items.reduce((s, i) => s + money(i.total_revenue ?? i.total_commission_earned_idr), 0), money: true },
    { label: 'Komisi', value: items.reduce((s, i) => s + money(i.total_commission ?? i.total_commission_earned_idr), 0), money: true },
  ], [items]);

  const openDetail = async (id: string) => { const data = await adminGetAffiliateDetail(id); setDetail(data); };
  const submitAction = async () => { if (!action) return; if (action.status === 'rejected' && !action.note.trim()) return; setSaving(true); try { await adminUpdateAffiliateStatus(action.id, action.status, action.note || undefined); trackAnalyticsEvent('admin_affiliate_status_updated'); setAction(null); await load(); } finally { setSaving(false); } };

  return <AdminPageShell title="Admin Affiliates" description="Kelola status affiliate, payout masked, dan performa partner.">
    <SummaryCards items={summary} />
    <Filters onRefresh={() => void load()}><AdminSelect aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value as AffiliateStatus | 'all')}><option value="all">Semua status</option><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="rejected">Rejected</option></AdminSelect><AdminInput aria-label="Cari affiliate" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari email/kode" /><button onClick={() => void load()} className="rounded-2xl bg-[#FF6A00] px-4 py-3 text-sm font-black text-white">Cari</button></Filters>
    {loading ? <LoadingCard /> : error ? <ErrorCard message={error} onRetry={() => void load()} /> : <section className="rounded-3xl border border-slate-100 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100 text-sm"><thead className="bg-slate-50/80 text-left text-xs font-black uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Affiliate</th><th className="px-5 py-3">Kode</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Rate</th><th className="px-5 py-3">Klik</th><th className="px-5 py-3">Daftar</th><th className="px-5 py-3">Paid</th><th className="px-5 py-3">Komisi</th><th className="px-5 py-3">Dibuat</th><th className="px-5 py-3">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{items.length === 0 ? <tr><td colSpan={10}><EmptyState label="Belum ada affiliate." /></td></tr> : items.map((item) => <tr key={item.id} className="hover:bg-orange-50/30"><td className="px-5 py-4"><p className="font-black text-slate-800">{item.user_name || 'Partner KaffePOS'}</p><p className="text-xs font-semibold text-slate-400">{item.user_email || '-'}</p></td><td className="px-5 py-4 font-mono text-slate-700">{item.affiliate_code}</td><td className="px-5 py-4"><StatusBadge status={item.status} /></td><td className="px-5 py-4">{item.commission_rate}%</td><td className="px-5 py-4">{item.total_clicks ?? 0}</td><td className="px-5 py-4">{item.total_registrations ?? 0}</td><td className="px-5 py-4">{item.total_paid_conversions ?? 0}</td><td className="px-5 py-4 font-black">{fRp(money(item.total_commission ?? item.total_commission_earned_idr))}</td><td className="px-5 py-4">{item.created_at ? fDate(item.created_at) : '-'}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button onClick={() => void openDetail(item.id)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Detail</button><button onClick={() => setAction({ id: item.id, status: 'active', note: '' })} className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">Aktifkan</button><button onClick={() => setAction({ id: item.id, status: 'suspended', note: '' })} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Suspend</button><button onClick={() => setAction({ id: item.id, status: 'rejected', note: '' })} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">Reject</button></div></td></tr>)}</tbody></table></div></section>}
    {detail && <DetailModal title="Detail Affiliate" onClose={() => setDetail(null)}><pre className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">{JSON.stringify(detail, null, 2)}</pre></DetailModal>}
    {action && <DetailModal title="Konfirmasi Status Affiliate" onClose={() => setAction(null)}><p className="text-sm font-bold text-slate-600">Ubah status menjadi <b>{action.status}</b>.</p><textarea value={action.note} onChange={(e) => setAction({ ...action, note: e.target.value })} placeholder={action.status === 'rejected' ? 'Catatan wajib untuk reject' : 'Catatan opsional'} className="mt-4 min-h-28 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-orange-300" /><button disabled={saving || (action.status === 'rejected' && !action.note.trim())} onClick={() => void submitAction()} className="mt-4 rounded-2xl bg-[#FF6A00] px-5 py-3 text-sm font-black text-white disabled:opacity-60">{saving ? 'Menyimpan...' : 'Konfirmasi'}</button></DetailModal>}
  </AdminPageShell>;
}
