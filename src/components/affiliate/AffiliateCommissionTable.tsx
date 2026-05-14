import { CalendarDays, Inbox } from 'lucide-react';
import { fDate, fRp } from '@/utils/format';
import type { CommissionTransaction } from '@/types/affiliate';

function statusBadge(status: string) {
  if (status === 'paid') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'approved' || status === 'eligible') return 'bg-orange-50 text-orange-700 border-orange-100';
  if (status === 'rejected' || status === 'cancelled') return 'bg-rose-50 text-rose-700 border-rose-100';
  return 'bg-slate-50 text-slate-600 border-slate-100';
}
function statusLabel(status: string) {
  const labels: Record<string, string> = { pending: 'Pending', eligible: 'Eligible', approved: 'Disetujui', rejected: 'Ditolak', paid: 'Dibayar', cancelled: 'Dibatalkan' };
  return labels[status] ?? status;
}
function typeLabel(type?: string) {
  return type === 'referral_credit' ? 'Referral Credit' : 'Affiliate Cash';
}
function amount(item: CommissionTransaction) {
  return Number(item.amount ?? item.commission_amount_idr ?? 0);
}

export default function AffiliateCommissionTable({ items }: { items: CommissionTransaction[] }) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-black text-slate-900">Riwayat Komisi</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">Customer ditampilkan secara aman dengan masking.</p>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-orange-50 text-[#FF6A00]"><Inbox size={26} /></div>
          <p className="text-base font-black text-slate-900">Belum ada komisi</p>
          <p className="mt-1 max-w-sm text-sm font-medium text-slate-500">Bagikan link affiliate untuk mulai mendapatkan komisi.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/80 text-left text-xs font-black uppercase tracking-wider text-slate-400">
              <tr><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Tanggal Bayar</th><th className="px-5 py-3">Tipe</th><th className="px-5 py-3">Komisi</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Eligible</th><th className="px-5 py-3">Dibayar</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-orange-50/30">
                  <td className="px-5 py-4"><p className="font-black text-slate-800">{item.referred_user?.name || item.referred_name || 'Customer KaffePOS'}</p><p className="text-xs font-semibold text-slate-400">{item.referred_user?.email || item.referred_email || 'Email disamarkan'}</p></td>
                  <td className="px-5 py-4 text-slate-600"><span className="inline-flex items-center gap-1 font-semibold"><CalendarDays size={14} />{item.first_payment_at || item.created_at ? fDate(item.first_payment_at ?? item.created_at) : '-'}</span></td>
                  <td className="px-5 py-4 text-slate-600">{typeLabel(item.type)}</td>
                  <td className="px-5 py-4 font-black text-slate-900">{fRp(amount(item))}</td>
                  <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusBadge(item.status)}`}>{statusLabel(item.status)}</span></td>
                  <td className="px-5 py-4 text-slate-600">{item.eligible_at ? fDate(item.eligible_at) : '-'}</td>
                  <td className="px-5 py-4 text-slate-600">{item.paid_at ? fDate(item.paid_at) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
