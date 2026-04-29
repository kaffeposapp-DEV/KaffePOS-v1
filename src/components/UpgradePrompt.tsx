import { ArrowRight, MessageCircle, Sparkles } from 'lucide-react';
import { INSTAGRAM_ADMIN_URL, formatRupiah, getPlanDefinition, getPlanPrice } from '@/lib/subscriptionPlans';

interface UpgradePromptProps {
  recommendedPlan?: string;
  billingCycle?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function UpgradePrompt({
  recommendedPlan = 'signature',
  billingCycle = 'monthly',
  title = 'Buka Fitur Premium?',
  description = 'Tingkatkan paket untuk membuka fitur ini. Pembayaran diproses secara instan dan status lisensi akan sinkron ke seluruh perangkat Anda.',
  actionLabel = 'Pilih Paket & Upgrade',
  onAction,
}: UpgradePromptProps) {
  const plan = getPlanDefinition(recommendedPlan);
  const amount = getPlanPrice(plan.id, billingCycle);

  const openSubscription = () => {
    if (onAction) {
      onAction();
      return;
    }
    window.dispatchEvent(new CustomEvent('kaffepos-open-tab', { detail: { tab: 'settings' } }));
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-orange-100 bg-white p-6 shadow-xl md:p-8">
      {/* Decorative background */}
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-orange-50 blur-2xl" />

      <div className="relative z-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 mb-4">
          <Sparkles size={24} />
        </div>

        <h3 className="text-xl font-black text-slate-900 md:text-2xl">{title}</h3>
        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{description}</p>

        <div className="mt-6 flex flex-col gap-4 rounded-3xl bg-slate-50 p-5 border border-slate-100 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Rekomendasi Terbaik</p>
            <p className="mt-1 text-lg font-black text-slate-900">{plan.name}</p>
          </div>
          <div className="text-right sm:text-right">
            <p className="text-xl font-black text-orange-600">{formatRupiah(amount)}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Per Bulan</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            onClick={openSubscription}
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 text-sm font-black text-white shadow-lg transition-all active:scale-95 hover:bg-slate-800"
          >
            {actionLabel}
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </button>
          <a
            href={INSTAGRAM_ADMIN_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-slate-100 bg-white px-6 text-sm font-bold text-slate-600 transition-all active:scale-95 hover:bg-slate-50"
          >
            <MessageCircle size={18} />
            Hubungi Admin
          </a>
        </div>
      </div>
    </div>
  );
}
