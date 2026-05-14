import type { AffiliateStatus } from '@/types/affiliate';

const statusCopy: Record<AffiliateStatus, { label: string; message: string; className: string }> = {
  pending: { label: 'Menunggu', message: 'Pengajuan affiliate sedang ditinjau.', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  active: { label: 'Aktif', message: 'Akun affiliate kamu aktif.', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  suspended: { label: 'Ditangguhkan', message: 'Akun affiliate kamu sementara dinonaktifkan.', className: 'bg-rose-50 text-rose-700 border-rose-100' },
  rejected: { label: 'Ditolak', message: 'Pengajuan affiliate belum disetujui.', className: 'bg-slate-50 text-slate-600 border-slate-100' },
};

export default function AffiliateStatusCard({ status }: { status: AffiliateStatus }) {
  const info = statusCopy[status] ?? statusCopy.pending;
  return (
    <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-500">Status Affiliate</p>
          <h2 className="mt-2 text-xl font-black text-slate-900">{info.message}</h2>
        </div>
        <span className={`inline-flex w-fit rounded-full border px-4 py-2 text-sm font-black ${info.className}`}>{info.label}</span>
      </div>
    </section>
  );
}
