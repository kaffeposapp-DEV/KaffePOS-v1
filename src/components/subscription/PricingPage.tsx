import { Check, ShieldCheck, Sparkles, Users, Zap } from 'lucide-react';
import {
  BILLING_CYCLE_LABELS,
  PAID_BILLING_CYCLES,
  SUBSCRIPTION_PLANS,
  type BillingCycle,
  type SubscriptionPlanId,
  formatRupiah,
  getMonthlyEquivalent,
  getPlanPrice,
  getPlanSavingsPercent,
} from '@/lib/subscriptionPlans';

type PaidCycle = Exclude<BillingCycle, 'free'>;

type PricingPageProps = {
  selectedCycle: PaidCycle;
  onCycleChange: (cycle: PaidCycle) => void;
  onSelectPlan: (plan: SubscriptionPlanId, cycle: BillingCycle) => void;
  activePlanId?: SubscriptionPlanId;
  isActivePaid?: boolean;
  className?: string;
  ctaLabel?: (plan: SubscriptionPlanId) => string;
};

const PRICING_ORDER: SubscriptionPlanId[] = ['secangkir', 'kopi_susu', 'signature', 'founder'];

const COMPARISON_ROWS: Array<{
  feature: string;
  secangkir: string;
  kopi_susu: string;
  signature: string;
  founder: string;
}> = [
  { feature: 'POS Dasar', secangkir: '100 transaksi/bulan', kopi_susu: 'Unlimited', signature: 'Unlimited', founder: 'Unlimited' },
  { feature: 'Inventory + Resep', secangkir: 'Dasar', kopi_susu: '✓', signature: '✓', founder: '✓' },
  { feature: 'Kitchen Display', secangkir: '✓', kopi_susu: '✓', signature: '✓', founder: '✓' },
  { feature: 'Printer Thermal', secangkir: '-', kopi_susu: '✓', signature: '✓', founder: '✓' },
  { feature: 'Gamification', secangkir: 'Ringkasan', kopi_susu: 'Basic', signature: 'Full Kopi Score', founder: 'Full + multi outlet' },
  { feature: 'Kopi Passport Loyalty', secangkir: '-', kopi_susu: 'Dasar', signature: 'Lengkap', founder: 'Lengkap multi outlet' },
  { feature: 'AI Insights', secangkir: '-', kopi_susu: '-', signature: '✓', founder: '✓' },
  { feature: 'Notification Center', secangkir: '-', kopi_susu: '-', signature: '✓', founder: '✓' },
  { feature: 'Multi Outlet', secangkir: '-', kopi_susu: '-', signature: '-', founder: '✓' },
  { feature: 'Support', secangkir: 'Komunitas', kopi_susu: 'Standar', signature: 'Prioritas', founder: 'Dedicated' },
];

function SavingsBadge({ plan, cycle }: { plan: SubscriptionPlanId; cycle: BillingCycle }) {
  if (plan === 'secangkir' || cycle === 'free' || cycle === 'monthly') return null;
  const savings = getPlanSavingsPercent(plan, cycle);
  if (savings <= 0) return null;
  return (
    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700 ring-1 ring-emerald-100">
      {cycle === 'yearly' ? 'Hemat hingga 24%' : `Hemat ${savings}%`}
    </span>
  );
}

export default function PricingPage({
  selectedCycle,
  onCycleChange,
  onSelectPlan,
  activePlanId = 'secangkir',
  isActivePaid = false,
  className = '',
  ctaLabel,
}: PricingPageProps) {
  return (
    <section className={`kaffe-responsive-surface rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-8 ${className}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#FF6A00]">
            <Sparkles size={13} />
            Ribuan cafe sudah pakai
          </div>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
            Kasir Cafe yang Fun, Lengkap, dan Terjangkau
          </h2>
          <p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500 md:text-base">
            Dari Rp49.000/bulan saja. Punya fitur gamifikasi, loyalty pelanggan, dan AI Insights yang bikin bisnis kopi kamu lebih mudah dan menyenangkan.
          </p>
        </div>

        <div className="min-w-0">
          <div className="kaffe-command-bar grid grid-cols-4 gap-1 rounded-2xl bg-slate-50 p-1 ring-1 ring-slate-100">
            {PAID_BILLING_CYCLES.map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => onCycleChange(cycle)}
                className={`h-11 rounded-xl px-3 text-[10px] font-black uppercase tracking-wider transition-all sm:text-xs ${
                  selectedCycle === cycle
                    ? 'bg-[#FF6A00] text-white shadow-sm'
                    : 'text-slate-500 hover:bg-orange-50 hover:text-orange-700'
                }`}
              >
                {BILLING_CYCLE_LABELS[cycle]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-right text-xs font-bold text-slate-400">Paket 12 bulan hemat hingga 24%</p>
        </div>
      </div>

      <div className="kaffe-card-grid mt-8 grid grid-cols-1 gap-4 lg:grid-cols-4">
        {PRICING_ORDER.map((planId) => {
          const plan = SUBSCRIPTION_PLANS[planId];
          const cycle: BillingCycle = plan.isFree ? 'free' : selectedCycle;
          const price = getPlanPrice(planId, cycle);
          const isRecommended = planId === 'signature';
          const isCurrent = activePlanId === planId && (planId === 'secangkir' ? !isActivePaid : isActivePaid);
          const buttonLabel = ctaLabel?.(planId) ?? (planId === 'secangkir' ? 'Mulai Gratis' : 'Upgrade Sekarang');

          return (
            <article
              key={planId}
              className={`relative flex min-w-0 flex-col rounded-[28px] border-2 p-5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--brand-panel-shadow-hover)] ${
                isRecommended
                  ? 'border-orange-200 bg-orange-50/50'
                  : isCurrent
                    ? 'border-orange-200 bg-orange-50/40'
                    : 'border-slate-100 bg-white'
              }`}
            >
              {isRecommended ? (
                <div className="kaffe-gradient-cta absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest">
                  Paling Populer
                </div>
              ) : null}

              <div className="mb-4 flex items-start justify-between gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${
                  isRecommended ? 'border-orange-100 bg-white text-[#FF6A00]' : 'border-slate-100 bg-slate-50 text-[#FF6A00]'
                }`}>
                  {planId === 'founder' ? <ShieldCheck size={21} /> : planId === 'secangkir' ? <Zap size={21} /> : <Sparkles size={21} />}
                </div>
                <span className="rounded-full border border-orange-100 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-orange-700">
                  {plan.badge}
                </span>
              </div>

              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{plan.audience}</p>
              <h3 className="font-display mt-1 text-xl font-extrabold text-slate-900">{plan.name}</h3>
              <p className="mt-3 min-h-[88px] text-xs font-semibold leading-relaxed text-slate-500">
                {plan.description}
              </p>

              <div className="mt-5">
                <p className="font-display text-3xl font-extrabold text-slate-900">{formatRupiah(price)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {plan.isFree ? 'Selamanya' : `${formatRupiah(getMonthlyEquivalent(planId, cycle))}/bulan`}
                  </p>
                  <SavingsBadge plan={planId} cycle={cycle} />
                </div>
              </div>

              <div className="mt-5 flex-1 space-y-2.5">
                {plan.features.slice(0, 6).map((feature) => (
                  <div key={feature} className="flex min-w-0 items-start gap-2">
                    <Check size={14} className="mt-0.5 shrink-0 text-[#FF6A00]" />
                    <span className="min-w-0 text-[11px] font-bold leading-relaxed text-slate-500">{feature}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onSelectPlan(planId, cycle)}
                className={`mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-xs font-black uppercase tracking-wider transition-all active:scale-95 ${
                  isCurrent
                    ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                    : planId === 'secangkir'
                      ? 'border border-orange-100 bg-white text-[#FF6A00] hover:bg-orange-50'
                      : 'kaffe-gradient-button text-white'
                }`}
              >
                {isCurrent ? 'Sedang Aktif' : buttonLabel}
              </button>
            </article>
          );
        })}
      </div>

      <div className="mt-8 rounded-[28px] border border-slate-100 bg-slate-50/70 p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6A00]">Perbandingan Fitur</p>
            <h3 className="font-display mt-1 text-xl font-extrabold text-slate-900">Pilih paket sesuai tahap cafe kamu</h3>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-100 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-orange-700">
            <Users size={13} />
            Mobile-first & siap APK
          </div>
        </div>

        <div className="kaffe-command-bar overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 overflow-hidden rounded-2xl bg-white text-left text-xs">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                <th className="border-b border-slate-100 px-4 py-3">Fitur</th>
                {PRICING_ORDER.map((planId) => (
                  <th key={planId} className="border-b border-slate-100 px-4 py-3 text-center">
                    {SUBSCRIPTION_PLANS[planId].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.feature} className="border-b border-slate-100">
                  <td className="border-b border-slate-100 px-4 py-3 font-black text-slate-800">{row.feature}</td>
                  {PRICING_ORDER.map((planId) => {
                    const value = row[planId];
                    const included = value === '✓';
                    return (
                      <td key={planId} className={`border-b border-slate-100 px-4 py-3 text-center font-bold ${included ? 'text-[#FF6A00]' : value === '-' ? 'text-slate-300' : 'text-slate-500'}`}>
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
