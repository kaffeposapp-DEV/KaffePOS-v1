import type { ReactNode } from 'react';
import { CheckCircle2, Clock3, CreditCard, Gift, MousePointerClick, TrendingUp, Users } from 'lucide-react';
import { fRp } from '@/utils/format';
import type { ReferralStats } from '@/types/affiliate';

const statsConfig = [
  { key: 'total_clicks', label: 'Klik', icon: MousePointerClick, tone: 'text-slate-500 bg-slate-50 border-slate-100' },
  { key: 'total_registrations', label: 'Pendaftaran', icon: Users, tone: 'text-slate-500 bg-slate-50 border-slate-100' },
  { key: 'total_trial_started', label: 'Trial mulai', icon: TrendingUp, tone: 'text-orange-600 bg-orange-50 border-orange-100' },
  { key: 'total_paid', label: 'Berbayar', icon: CreditCard, tone: 'text-orange-600 bg-orange-50 border-orange-100' },
] as const;

export default function ReferralStatsCards({ data }: { data: ReferralStats }) {
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {statsConfig.map(({ key, label, icon: Icon, tone }) => (
        <div key={key} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border ${tone}`}>
            <Icon size={18} />
          </div>
          <p className="text-2xl font-black text-slate-900">{Number(data[key] ?? 0).toLocaleString('id-ID')}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{label}</p>
        </div>
      ))}

      <div className="rounded-3xl border border-orange-100 bg-white p-4 shadow-sm lg:col-span-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <RewardStat icon={<Clock3 size={18} />} label="Pending" value={fRp(data.total_reward_pending)} />
          <RewardStat icon={<CheckCircle2 size={18} />} label="Disetujui" value={fRp(data.total_reward_approved)} />
          <RewardStat icon={<Gift size={18} />} label="Dibayar" value={fRp(data.total_reward_paid)} />
        </div>
      </div>
    </section>
  );
}

function RewardStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-orange-50/70 px-4 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#FF6A00] shadow-sm">{icon}</div>
      <div>
        <p className="text-xs font-bold text-slate-500">Reward {label}</p>
        <p className="text-lg font-black text-slate-900">{value}</p>
      </div>
    </div>
  );
}
