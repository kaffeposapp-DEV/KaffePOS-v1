/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { money } from './adminMoney';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { adminApproveCommission, adminGetCommissionDetail, adminGetCommissions, adminMarkCommissionPaid, adminRejectCommission } from '@/lib/backendApi';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { fDate, fRp } from '@/utils/format';
import type { AdminCommissionDetail, AdminCommissionListItem, CommissionStatus } from '@/types/affiliate';
import { AdminInput, AdminPageShell, AdminSelect, DetailModal, EmptyState, ErrorCard, Filters, LoadingCard, StatusBadge, SummaryCards } from './adminUi';

type Action = { id: string; type: 'approve' | 'reject' | 'paid'; note: string };

function getCommissionAmount(item: AdminCommissionListItem) {
  return money(item.amount ?? item.commission_amount_idr);
}

export default function AdminCommissionPage() {
  const [items, setItems] = useState<AdminCommissionListItem[]>([]);
  const [status, setStatus] = useState<CommissionStatus | 'all'>('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search, 300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminCommissionDetail | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async () => { try { setLoading(true); setError(null); const data = await adminGetCommissions({ status, type, search: dSearch, limit: 50 }); setItems(data.items || []); } catch (err) { setError(err instanceof Error ? err.message : 'Gagal memuat komisi.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [status, type, dSearch]);
  const summary = useMemo(() => [
    { label: 'Pending', value: sum('pending'), money: true }, { label: 'Eligible', value: sum('eligible'), money: true }, { label: 'Approved', value: sum('approved'), money: true }, { label: 'Paid', value: sum('paid'), money: true }, { label: 'Rejected', value: sum('rejected'), money: true }, { label: 'Total', value: items.reduce((s, i) => s + getCommissionAmount(i), 0), money: true },
  ], [items]);
  function sum(target: string) { return items.filter((i) => i.status === target).reduce((s, i) => s + getCommissionAmount(i), 0); }
  const openDetail = async (id: string) => { const data = await adminGetCommissionDetail(id); setDetail(data); };
  const submitAction = async () => { if (!action) return; if (action.type === 'reject' && !action.note.trim()) return; setSaving(true); try { if (action.type === 'approve') { await adminApproveCommission(action.id, action.note || undefined); trackAnalyticsEvent('admin_commission_approved'); } if (action.type === 'reject') { await adminRejectCommission(action.id, action.note); trackAnalyticsEvent('admin_commission_rejected'); } if (action.type === 'paid') { await adminMarkCommissionPaid(action.id, action.note || undefined); trackAnalyticsEvent('admin_commission_marked_paid'); } setAction(null); await load(); } finally { setSaving(false); } };
  return <AdminPageShell title="Admin Commissions" description="Review, approve, reject, dan tandai komisi affiliate/referral sebagai dibayar.">
    <SummaryCards items={summary} />
    <Filters onRefresh={() => void load()}><AdminSelect aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value as CommissionStatus | 'all')}><option value="all">Semua status</option><option value="pending">Pending</option><option value="eligible">Eligible</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option></AdminSelect><AdminSelect aria-label="Filter tipe" value={type} onChange={(e) => setType(e.target.value)}><option value="all">Semua tipe</option><option value="affiliate_cash">Affiliate cash</option><option value="referral_credit">Referral credit</option></AdminSelect><AdminInput aria-label="Cari komisi" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari komisi" /><button type="button" onClick={() => void load()} className="rounded-2xl bg-[#FF6A00] px-4 py-3 text-sm font-black text-white">Cari</button></Filters>
    {loading ? <LoadingCard /> : error ? <ErrorCard message={error} onRetry={() => void load()} /> : <section className="rounded-3xl border border-slate-100 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-100 text-sm"><thead className="bg-slate-50/80 text-left text-xs font-black uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">ID</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Referrer</th><th className="px-5 py-3">Referred</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Rate</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Eligible</th><th className="px-5 py-3">Approved</th><th className="px-5 py-3">Paid</th><th className="px-5 py-3">Aksi</th></tr></thead><tbody className="divide-y divide-slate-100">{items.length === 0 ? <tr><td colSpan={12}><EmptyState label="Belum ada komisi." /></td></tr> : items.map((item) => <tr key={item.id} className="hover:bg-orange-50/30"><td className="px-5 py-4 font-mono text-xs">{item.id.slice(0, 8)}</td><td className="px-5 py-4">{item.type || 'affiliate_cash'}</td><td className="px-5 py-4"><p className="font-black text-slate-800">{item.affiliate_name || item.referrer_name || '-'}</p><p className="text-xs text-slate-400">{item.affiliate_email || item.referrer_email || '-'}</p></td><td className="px-5 py-4"><p className="font-black text-slate-800">{item.referred_name || '-'}</p><p className="text-xs text-slate-400">{item.referred_email || '-'}</p></td><td className="px-5 py-4 font-mono text-xs">{item.payment_id || item.payment_order_id || '-'}</td><td className="px-5 py-4 font-black">{fRp(getCommissionAmount(item))}</td><td className="px-5 py-4">{item.rate ?? item.commission_rate ?? '-'}%</td><td className="px-5 py-4"><StatusBadge status={item.status} /></td><td className="px-5 py-4">{item.eligible_at ? fDate(item.eligible_at) : '-'}</td><td className="px-5 py-4">{item.approved_at ? fDate(item.approved_at) : '-'}</td><td className="px-5 py-4">{item.paid_at ? fDate(item.paid_at) : '-'}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void openDetail(item.id)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Detail</button>{(item.status === 'pending' || item.status === 'eligible') && <button type="button" onClick={() => setAction({ id: item.id, type: 'approve', note: '' })} className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">Approve</button>}{item.status !== 'paid' && <button type="button" onClick={() => setAction({ id: item.id, type: 'reject', note: '' })} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">Reject</button>}{item.status === 'approved' && <button type="button" onClick={() => setAction({ id: item.id, type: 'paid', note: '' })} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Paid</button>}</div></td></tr>)}</tbody></table></div></section>}
    {detail && <DetailModal title="Detail Komisi" onClose={() => setDetail(null)}><pre className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">{JSON.stringify(detail, null, 2)}</pre></DetailModal>}
    {action && <DetailModal title="Konfirmasi Aksi Komisi" onClose={() => setAction(null)}><p className="text-sm font-bold text-slate-600">Aksi: <b>{action.type}</b></p><textarea value={action.note} onChange={(e) => setAction({ ...action, note: e.target.value })} placeholder={action.type === 'reject' ? 'Catatan wajib untuk reject' : 'Catatan opsional'} className="mt-4 min-h-28 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-orange-300" /><button type="button" disabled={saving || (action.type === 'reject' && !action.note.trim())} onClick={() => void submitAction()} className="mt-4 rounded-2xl bg-[#FF6A00] px-5 py-3 text-sm font-black text-white disabled:opacity-60">{saving ? 'Memproses...' : 'Konfirmasi'}</button></DetailModal>}
  </AdminPageShell>;
}
