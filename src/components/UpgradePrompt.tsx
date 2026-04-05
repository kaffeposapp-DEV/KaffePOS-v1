import { MessageCircle } from 'lucide-react';
import { INSTAGRAM_ADMIN_URL, formatRupiah, getPlanDefinition, getPlanPrice } from '@/lib/subscriptionPlans';

interface UpgradePromptProps {
  recommendedPlan?: string;
  billingCycle?: string;
  title?: string;
  description?: string;
}

export default function UpgradePrompt({
  recommendedPlan = 'signature',
  billingCycle = 'monthly',
  title = 'Mau unlock fitur ini?',
  description = 'Tinggal chat admin kami. Aktivasi dilakukan maksimal 1x24 jam setelah transfer dikonfirmasi.',
}: UpgradePromptProps) {
  const plan = getPlanDefinition(recommendedPlan);
  const amount = getPlanPrice(plan.id, billingCycle);

  return (
    <div className="rounded-3xl border border-orange-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_100%)] p-5 shadow-sm">
      <p className="text-lg font-black text-slate-900">{title} 😊</p>
      <p className="mt-2 text-sm text-slate-600">{description}</p>

      <div className="mt-4 rounded-2xl border border-orange-100 bg-white px-4 py-3">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Rekomendasi Paket</p>
        <p className="mt-1 text-lg font-black text-slate-900">{plan.name}</p>
        <p className="text-sm text-orange-600">{formatRupiah(amount)}</p>
        <p className="mt-1 text-xs text-slate-500">Aktif dalam 1x24 jam setelah transfer dikonfirmasi.</p>
      </div>

      <a
        href={INSTAGRAM_ADMIN_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white"
      >
        <MessageCircle size={16} />
        Chat Admin untuk Upgrade
      </a>
    </div>
  );
}
