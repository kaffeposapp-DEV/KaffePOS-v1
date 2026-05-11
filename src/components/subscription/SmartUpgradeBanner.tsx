import { ArrowRight, X } from 'lucide-react';
import { formatRupiah, getPlanPrice } from '@/lib/subscriptionPlans';

type Props = {
  used: number;
  limit: number;
  percent: number;
  role?: 'owner_admin' | 'cashier' | null;
  onUpgrade: () => void;
  onDismiss: () => void;
};

export default function SmartUpgradeBanner({ used, limit, percent, role, onUpgrade, onDismiss }: Props) {
  return (
    <div className="px-3 pt-2 flex-shrink-0">
      <div className="rounded-2xl border border-orange-100 bg-orange-50/95 px-4 py-3 text-orange-950 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Limit transaksi hampir penuh</p>
              <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 rounded-full p-1 text-orange-500 transition hover:bg-orange-100"
                aria-label="Tutup banner upgrade"
              >
                <X size={14} />
              </button>
            </div>
            <p className="mt-1 text-sm font-bold leading-relaxed text-orange-950">
              {used} dari {limit} transaksi gratis sudah terpakai bulan ini.
              {role === 'cashier' ? ' Minta Owner/Admin untuk upgrade agar kasir tetap bisa transaksi.' : ` Upgrade mulai ${formatRupiah(getPlanPrice('kopi_susu', 'monthly'))}/bulan untuk transaksi tanpa batas.`}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-orange-100">
              <div
                className="h-full rounded-full bg-orange-500 transition-all duration-700"
                style={{ width: `${Math.max(8, Math.min(100, percent))}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onUpgrade}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-xs font-black uppercase tracking-widest text-orange-700 ring-1 ring-orange-100 transition-all active:scale-95 hover:bg-orange-100"
          >
            {role === 'cashier' ? 'Beritahu Owner' : 'Lihat Paket'}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
