import { CalendarDays, Inbox } from 'lucide-react';
import { fDate } from '@/utils/format';
import type { ReferralHistoryItem } from '@/types/affiliate';

function formatOptionalDate(value?: string | null) {
  if (!value) return '-';
  return fDate(value);
}

function statusBadge(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'rewarded' || normalized === 'paid') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (normalized === 'eligible') return 'bg-orange-50 text-orange-700 border-orange-100';
  if (normalized === 'rejected' || normalized === 'cancelled') return 'bg-rose-50 text-rose-700 border-rose-100';
  return 'bg-slate-50 text-slate-600 border-slate-100';
}

function paymentLabel(item: ReferralHistoryItem) {
  if (item.first_payment_at) return 'Sudah bayar';
  if (item.status === 'rejected' || item.status === 'cancelled') return 'Tidak aktif';
  return 'Belum bayar';
}

function rewardLabel(item: ReferralHistoryItem) {
  if (item.status === 'rewarded') return 'Dibayar';
  if (item.status === 'eligible') return 'Eligible';
  if (item.status === 'rejected') return 'Ditolak';
  if (item.status === 'cancelled') return 'Dibatalkan';
  return 'Menunggu';
}

export default function ReferralHistoryTable({ items }: { items: ReferralHistoryItem[] }) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-black text-slate-900">Riwayat Referral</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">Data teman ditampilkan secara aman dengan masking.</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-orange-50 text-[#FF6A00]">
            <Inbox size={26} />
          </div>
          <p className="text-base font-black text-slate-900">Belum ada referral</p>
          <p className="mt-1 max-w-sm text-sm font-medium text-slate-500">Bagikan link referral kamu untuk mulai mengajak teman memakai KaffePOS.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/80 text-left text-xs font-black uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Teman</th>
                <th className="px-5 py-3">Terdaftar</th>
                <th className="px-5 py-3">Trial</th>
                <th className="px-5 py-3">Pembayaran</th>
                <th className="px-5 py-3">Reward</th>
                <th className="px-5 py-3">Eligible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-orange-50/30">
                  <td className="px-5 py-4">
                    <p className="font-black text-slate-800">{item.referred_user?.name || 'Pengguna KaffePOS'}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-400">{item.referred_user?.email || 'Email disamarkan'}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    <span className="inline-flex items-center gap-1 font-semibold"><CalendarDays size={14} />{formatOptionalDate(item.registered_at)}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{item.trial_started_at ? 'Mulai' : '-'}</td>
                  <td className="px-5 py-4 text-slate-600">{paymentLabel(item)}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusBadge(item.status)}`}>{rewardLabel(item)}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{formatOptionalDate(item.eligible_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
