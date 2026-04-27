import { ArrowRight, MessageCircle } from 'lucide-react';
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
  title = 'Mau unlock fitur ini?',
  description = 'Upgrade bisa langsung lewat halaman langganan akunmu. Pembayaran diproses otomatis dan status akan sinkron ke Web dan APK.',
  actionLabel = 'Buka Pengaturan Langganan',
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
    <div className="rounded-3xl border border-orange-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_100%)] p-5 shadow-sm">
      <p className="text-lg font-black text-slate-900">{title} 😊</p>
      <p className="mt-2 text-sm text-slate-600">{description}</p>

      <div className="mt-4 rounded-2xl border border-orange-100 bg-white px-4 py-3">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Rekomendasi Paket</p>
        <p className="mt-1 text-lg font-black text-slate-900">{plan.name}</p>
        <p className="text-sm text-orange-600">{formatRupiah(amount)}</p>
        <p className="mt-1 text-xs text-slate-500">Aktif otomatis setelah pembayaran terkonfirmasi.</p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          onClick={openSubscription}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white"
        >
          {actionLabel}
          <ArrowRight size={16} />
        </button>
        <a
          href={INSTAGRAM_ADMIN_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
        >
          <MessageCircle size={16} />
          Butuh Bantuan Admin
        </a>
      </div>
    </div>
  );
}
