import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, CreditCard, Sparkles, X } from 'lucide-react';
import type { UserRole } from '@/lib/accessControl';
import { logUpgradePromptEvent } from '@/lib/backendApi';
import {
  type BillingCycle,
  type SubscriptionPlanId,
  BILLING_CYCLE_LABELS,
  PAID_BILLING_CYCLES,
  formatRupiah,
  getMonthlyEquivalent,
  getPlanDefinition,
  getPlanPrice,
  getPlanSavingsPercent,
} from '@/lib/subscriptionPlans';
import {
  buildPromptEventPayload,
  markUpgradePromptDismissed,
  markUpgradePromptViewed,
} from '@/lib/upgradePrompts';
import SubscriptionCheckoutFlow from '@/components/settings/SubscriptionCheckoutFlow';
import type { ToastType } from '@/types';
import Modal from '@/components/ui/Modal';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { trackOpsEvent } from '@/lib/opsMetrics';

type PaidPlan = 'kopi_susu' | 'signature';
type PaidCycle = Exclude<BillingCycle, 'free'>;

type Props = {
  open: boolean;
  onClose: () => void;
  role?: UserRole | null | undefined;
  currentPlan?: SubscriptionPlanId | undefined;
  recommendedPlan?: PaidPlan | undefined;
  trigger?: string | undefined;
  promptKey?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  storeId?: string | null | undefined;
  toast: { showToast: (message: string, type?: ToastType) => void };
  metadata?: Record<string, unknown> | undefined;
};

const COMPARISON_ROWS = [
  { label: 'Transaksi tanpa batas', secangkir: true, kopi_susu: true, signature: true },
  { label: 'Export laporan PDF', secangkir: true, kopi_susu: true, signature: true },
  { label: 'Periode laporan lanjutan', secangkir: true, kopi_susu: true, signature: true },
  { label: 'Kopi Passport Loyalty', secangkir: true, kopi_susu: true, signature: true },
  { label: 'Notification Center', secangkir: true, kopi_susu: false, signature: true },
  { label: 'AI Insight', secangkir: true, kopi_susu: false, signature: true },
  { label: 'Multi kasir', secangkir: true, kopi_susu: false, signature: true },
  { label: 'Printer thermal', secangkir: true, kopi_susu: false, signature: true },
] as const;

function Capability({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-orange-700">
      <Check size={14} strokeWidth={3} />
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-300">-</span>
  );
}

export default function UpgradeModal({
  open,
  onClose,
  role,
  currentPlan = 'secangkir',
  recommendedPlan = 'signature',
  trigger = 'manual',
  promptKey,
  title = 'Upgrade untuk membuka fitur ini',
  description = 'Paket Signature memberi akses ke fitur premium untuk operasional yang lebih rapi, termasuk AI Insight, multi kasir, laporan lanjutan, dan printer thermal.',
  storeId,
  toast,
  metadata,
}: Props) {
  const [billingCycle, setBillingCycle] = useState<PaidCycle>('yearly');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const resolvedPromptKey = promptKey || trigger || 'manual';
  const current = getPlanDefinition(currentPlan);
  const recommended = getPlanDefinition(recommendedPlan);
  const isOwner = role !== 'cashier';
  const price = getPlanPrice(recommendedPlan, billingCycle);
  const monthlyEquivalent = getMonthlyEquivalent(recommendedPlan, billingCycle);

  const viewPayload = useMemo(() => buildPromptEventPayload('view', {
    promptKey: resolvedPromptKey,
    trigger,
    recommendedPlan,
    currentPlan,
    storeId: storeId ?? null,
    metadata: metadata ?? {},
  }), [currentPlan, metadata, recommendedPlan, resolvedPromptKey, storeId, trigger]);

  useEffect(() => {
    if (!open) return;
    markUpgradePromptViewed(storeId, resolvedPromptKey);
    void logUpgradePromptEvent(viewPayload).catch(() => {});
  }, [open, resolvedPromptKey, storeId, viewPayload]);

  const close = useCallback(() => {
    markUpgradePromptDismissed(storeId, resolvedPromptKey);
    void logUpgradePromptEvent(buildPromptEventPayload('dismiss', {
      promptKey: resolvedPromptKey,
      trigger,
      recommendedPlan,
      currentPlan,
      storeId: storeId ?? null,
      metadata: metadata ?? {},
    })).catch(() => {});
    onClose();
  }, [currentPlan, metadata, onClose, recommendedPlan, resolvedPromptKey, storeId, trigger]);

  if (!open) return null;

  const handlePrimaryAction = () => {
    trackAnalyticsEvent('upgrade_clicked', { trigger, recommended_plan: recommendedPlan, billing_cycle: billingCycle });
    void trackOpsEvent({
      event_name: 'upgrade_clicked',
      status: 'success',
      ...(storeId ? { store_id: storeId } : {}),
      metadata: { trigger, recommendedPlan, billingCycle, currentPlan },
    });
    void logUpgradePromptEvent(buildPromptEventPayload('click', {
      promptKey: resolvedPromptKey,
      trigger,
      recommendedPlan,
      currentPlan,
      storeId: storeId ?? null,
      metadata: { ...metadata, billingCycle },
    })).catch(() => {});

    if (!isOwner) {
      toast.showToast('Minta Owner/Admin untuk upgrade paket KaffePOS.', 'info');
      return;
    }

    setCheckoutOpen(true);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        labelledBy="upgrade-modal-title"
        overlayClassName="z-[90] h-[100dvh] bg-slate-950/50 p-0 md:p-4"
        panelClassName="kaffe-responsive-surface flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[30px] md:max-h-[92dvh] md:max-w-[880px] md:rounded-[32px]"
      >
          <div className="shrink-0 border-b border-slate-100 bg-white px-5 py-4 sm:px-6 md:px-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-700 ring-1 ring-orange-100">
                  <Sparkles size={12} />
                  Upgrade Plan
                </div>
                <h3 id="upgrade-modal-title" className="break-words text-xl font-black text-slate-900 sm:text-2xl">{title}</h3>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">{description}</p>
              </div>
              <button type="button"
                onClick={close}
                className="shrink-0 rounded-full p-2 text-slate-300 transition-colors hover:bg-slate-50 hover:text-slate-900"
                aria-label="Tutup upgrade"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 md:px-8">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[28px] border border-slate-100 bg-slate-50/70 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Paket Saat Ini</p>
                <h4 className="mt-2 text-2xl font-black text-slate-900">{current.name}</h4>
                <p className="mt-2 min-h-[44px] text-xs font-medium leading-relaxed text-slate-500">{current.description}</p>
                <div className="mt-5 rounded-2xl border border-slate-100 bg-white px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</p>
                  <p className="mt-1 text-sm font-black text-slate-800">{current.isFree ? 'Gratis' : 'Aktif'}</p>
                </div>
              </div>

              <div className="relative rounded-[28px] border-2 border-orange-200 bg-orange-50/60 p-5 shadow-sm shadow-orange-100">
                <div className="absolute right-5 top-5 rounded-full bg-orange-600 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white">
                  Paling Populer
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-700">Rekomendasi</p>
                <h4 className="mt-2 text-2xl font-black text-slate-900">{recommended.name}</h4>
                <p className="mt-2 min-h-[44px] text-xs font-medium leading-relaxed text-slate-600">{recommended.description}</p>

                <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-white p-1.5 ring-1 ring-orange-100 sm:grid-cols-4">
                  {PAID_BILLING_CYCLES.map((cycle) => (
                    <button type="button"
                      key={cycle}
                      onClick={() => setBillingCycle(cycle)}
                      className={`h-10 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        billingCycle === cycle
                          ? 'bg-orange-600 text-white shadow-sm'
                          : 'text-slate-500 hover:bg-orange-50 hover:text-orange-700'
                      }`}
                    >
                      {BILLING_CYCLE_LABELS[cycle]}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-black text-slate-900">{formatRupiah(price)}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {`${formatRupiah(monthlyEquivalent)} / bulan`}
                    </p>
                  </div>
                  {getPlanSavingsPercent(recommendedPlan, billingCycle) > 0 && (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 ring-1 ring-emerald-100">
                      {billingCycle === 'yearly' ? 'Hemat hingga 24%' : `Hemat ${getPlanSavingsPercent(recommendedPlan, billingCycle)}%`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-[28px] border border-slate-100 bg-white">
              <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr] border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Fitur</span>
                <span className="text-center">Trial</span>
                <span className="text-center">Kopi Susu</span>
                <span className="text-center text-orange-700">Signature</span>
              </div>
              {COMPARISON_ROWS.map((row) => (
                <div key={row.label} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr] items-center border-b border-slate-50 px-4 py-3 last:border-b-0">
                  <span className="min-w-0 break-words text-xs font-bold text-slate-700">{row.label}</span>
                  <span className="text-center"><Capability enabled={row.secangkir} /></span>
                  <span className="text-center"><Capability enabled={row.kopi_susu} /></span>
                  <span className="text-center"><Capability enabled={row.signature} /></span>
                </div>
              ))}
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 md:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button"
                onClick={close}
                className="h-12 rounded-2xl border-2 border-slate-100 bg-white px-5 text-sm font-bold text-slate-500 transition-all active:scale-[0.98] hover:bg-slate-50"
              >
                Nanti Saja
              </button>
              <button type="button"
                onClick={handlePrimaryAction}
                className="kaffe-gradient-cta group flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-black transition-all active:scale-[0.98]"
              >
                {isOwner ? (
                  <>
                    <CreditCard size={17} />
                    Lanjut Checkout
                  </>
                ) : (
                  'Minta Owner/Admin Upgrade'
                )}
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
      </Modal>

      {isOwner && (
        <SubscriptionCheckoutFlow
          open={checkoutOpen}
          plan={recommendedPlan}
          billingCycle={billingCycle}
          onClose={() => setCheckoutOpen(false)}
          toast={{ showToast: (message, type) => toast.showToast(message, type as ToastType) }}
        />
      )}
    </>
  );
}
