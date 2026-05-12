import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, ChevronLeft, ChevronRight, CreditCard,
  Loader2, Percent, ShieldCheck, WalletCards, X,
  Lock, ArrowRight, Wallet
} from 'lucide-react';
import { createSubscriptionPayment, getSubscriptionPaymentQuote } from '@/lib/backendApi';
import { normalizeUserFacingError } from '@/lib/errorMessages';
import {
  type SubscriptionBillingQuote,
  type SubscriptionPaymentMethodId,
  groupSubscriptionPaymentMethods,
} from '@/lib/subscriptionBilling';
import {
  BILLING_CYCLE_LABELS,
  PAID_BILLING_CYCLES,
  type BillingCycle,
  formatRupiah,
  getPlanDefinition,
  getPlanPrice,
  getPlanSavingsPercent,
} from '@/lib/subscriptionPlans';
import { canStartOnlineBillingFlow, getOnlineBillingBlockedMessage } from '@/lib/offlinePolicy';
import { useModalBehavior } from '@/hooks/useModalBehavior';

type PaidPlan = 'kopi_susu' | 'signature';
type PaidCycle = Exclude<BillingCycle, 'free'>;

type Props = {
  open: boolean;
  plan: PaidPlan;
  billingCycle: PaidCycle;
  onClose: () => void;
  toast: { showToast: (message: string, type?: string) => void };
};

type FlowStep = 'plan' | 'method' | 'review';

const PAID_PLANS: PaidPlan[] = ['kopi_susu', 'signature'];
const PAID_CYCLES = PAID_BILLING_CYCLES;

function stepNumber(step: FlowStep) {
  if (step === 'plan') return 1;
  if (step === 'method') return 2;
  return 3;
}

function stepTitle(step: FlowStep) {
  if (step === 'plan') return 'Pilih Paket';
  if (step === 'method') return 'Pilih Pembayaran';
  return 'Review Checkout';
}

export default function SubscriptionCheckoutFlow({ open, plan, billingCycle, onClose, toast }: Props) {
  const [step, setStep] = useState<FlowStep>('plan');
  const [selectedPlan, setSelectedPlan] = useState<PaidPlan>(plan);
  const [selectedCycle, setSelectedCycle] = useState<PaidCycle>(billingCycle);
  const [selectedMethod, setSelectedMethod] = useState<SubscriptionPaymentMethodId>('qris');
  const [quote, setQuote] = useState<SubscriptionBillingQuote | null>(null);
  const [voucherInput, setVoucherInput] = useState('');
  const [showVoucherInput, setShowVoucherInput] = useState(false);
  const [appliedVoucher, setAppliedVoucher] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);

  const methods = useMemo(() => groupSubscriptionPaymentMethods(), []);
  const selectedPlanDef = getPlanDefinition(selectedPlan);
  const selectedPrice = getPlanPrice(selectedPlan, selectedCycle);

  const resetFlow = useCallback(() => {
    setStep('plan');
    setSelectedPlan(plan);
    setSelectedCycle(billingCycle);
    setSelectedMethod('qris');
    setQuote(null);
    setVoucherInput('');
    setShowVoucherInput(false);
    setAppliedVoucher(null);
    setLoadingQuote(false);
    setSubmitting(false);
  }, [billingCycle, plan]);

  useEffect(() => {
    if (open) resetFlow();
  }, [open, resetFlow]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const updateOnlineState = () => setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    updateOnlineState();
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, [open]);

  const loadQuote = async (voucherCode?: string | null) => {
    if (!canStartOnlineBillingFlow(isOnline)) {
      throw new Error(getOnlineBillingBlockedMessage());
    }
    setLoadingQuote(true);
    try {
      const resolvedVoucherCode = voucherCode === undefined ? appliedVoucher : voucherCode;
      const response = await getSubscriptionPaymentQuote({
        plan: selectedPlan,
        billingCycle: selectedCycle,
        paymentMethod: selectedMethod,
        ...(resolvedVoucherCode ? { voucherCode: resolvedVoucherCode } : {}),
      });
      if (response.paymentConfig && !response.paymentConfig.onlinePaymentAvailable) {
        throw new Error(response.paymentConfig.message);
      }
      setQuote(response.quote);
      return response.quote;
    } finally {
      setLoadingQuote(false);
    }
  };

  const goToReview = async () => {
    try {
      await loadQuote(appliedVoucher);
      setStep('review');
    } catch (error) {
      const message = normalizeUserFacingError(error, 'Checkout langganan belum bisa disiapkan. Coba lagi.');
      toast.showToast(message, 'error');
    }
  };

  const applyVoucher = async () => {
    try {
      const code = voucherInput.trim().toUpperCase();
      const nextQuote = await loadQuote(code || null);
      setAppliedVoucher(nextQuote.voucher?.code ?? null);
      if (nextQuote.voucher) setShowVoucherInput(false);
      toast.showToast(nextQuote.voucher ? `Voucher ${nextQuote.voucher.code} berhasil dipasang!` : 'Voucher dihapus.', nextQuote.voucher ? 'success' : 'info');
    } catch (error) {
      const message = normalizeUserFacingError(error, 'Voucher tidak valid atau belum bisa dipakai.');
      toast.showToast(message, 'error');
    }
  };

  const handlePay = async () => {
    if (!canStartOnlineBillingFlow(isOnline)) {
      toast.showToast(getOnlineBillingBlockedMessage(), 'warning');
      return;
    }
    setSubmitting(true);
    try {
      const result = await createSubscriptionPayment({
        plan: selectedPlan,
        billingCycle: selectedCycle,
        paymentMethod: selectedMethod,
        voucherCode: appliedVoucher,
      });

      if (!result.payment?.redirect_url) {
        throw new Error('Link pembayaran tidak tersedia.');
      }

      toast.showToast(result.reused ? 'Melanjutkan pembayaran Anda...' : 'Membuka gerbang pembayaran aman...', 'success');
      window.location.assign(result.payment.redirect_url);
    } catch (error) {
      const message = normalizeUserFacingError(error, 'Pembayaran belum bisa dimulai. Coba lagi.');
      toast.showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const closeFlow = useCallback(() => {
    resetFlow();
    onClose();
  }, [onClose, resetFlow]);

  const { panelRef, onBackdropClick, dialogProps } = useModalBehavior<HTMLDivElement>({
    open,
    onClose: closeFlow,
    disabled: submitting,
  });

  if (!open) return null;

  return (
    <div
      className="subscription-checkout-overlay fixed inset-0 z-[100] flex h-[100dvh] items-end justify-center bg-slate-950/60 p-0 backdrop-blur-md md:items-center md:p-4"
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        className="subscription-checkout-shell kaffe-responsive-surface flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[30px] bg-white shadow-[0_24px_100px_rgba(0,0,0,0.25)] md:max-h-[92dvh] md:max-w-[900px] md:rounded-[32px]"
        aria-labelledby="subscription-checkout-title"
        {...dialogProps}
      >
        {/* HEADER SECTION */}
        <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-4 sm:px-6 md:px-10 md:py-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[10px] font-black text-orange-800 ring-1 ring-orange-200">
                  {stepNumber(step)}
                </div>
                <h3 id="subscription-checkout-title" className="min-w-0 truncate text-lg font-black text-slate-800 sm:text-xl">{stepTitle(step)}</h3>
              </div>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                Langkah {stepNumber(step)} dari 3
              </p>
            </div>
            <button
              onClick={closeFlow}
              disabled={submitting}
              className="shrink-0 rounded-full p-2 text-slate-300 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
              aria-label="Tutup checkout langganan"
            >
              <X size={24} />
            </button>
          </div>

          <div className="mt-6 flex gap-2">
            {(['plan', 'method', 'review'] as FlowStep[]).map((item, index) => {
              const active = step === item;
              const done = stepNumber(step) > index + 1;
              return (
                <div
                  key={item}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${active || done ? 'bg-orange-500' : 'bg-slate-100'}`}
                />
              );
            })}
          </div>
          {!isOnline && (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">
              Pembayaran langganan butuh internet. Coba lagi setelah koneksi kembali.
            </div>
          )}
        </div>

        {/* CONTENT SECTION */}
        <div className="subscription-checkout-body min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-10 md:py-8 custom-scrollbar">
          {step === 'plan' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="kaffe-card-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
                {PAID_PLANS.map((item) => {
                  const planDef = getPlanDefinition(item);
                  const active = selectedPlan === item;
                  return (
                    <button
                      key={item}
                      onClick={() => {
                        setSelectedPlan(item);
                        setQuote(null);
                        setAppliedVoucher(null);
                      }}
                      aria-label={`Pilih paket ${planDef.name}`}
                      className={`relative flex flex-col rounded-[28px] border-2 p-5 text-left transition-all ${
                        active
                          ? 'border-orange-400 bg-orange-50/70 shadow-md shadow-orange-100'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{planDef.badge}</p>
                      <p className="mt-2 text-lg font-black text-slate-900">{planDef.name}</p>
                      <p className="mt-1 text-[11px] font-bold leading-relaxed text-slate-400 min-h-[44px]">
                        {planDef.description}
                      </p>
                      <div className="mt-6">
                        <p className="text-xl font-black text-slate-900">{formatRupiah(getPlanPrice(item, selectedCycle))}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{BILLING_CYCLE_LABELS[selectedCycle]}</p>
                      </div>
                      {active && (
                        <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-white">
                          <CheckCircle2 size={16} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-[28px] bg-slate-50 p-6 border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Pilih Durasi Langganan</p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PAID_CYCLES.map((cycle) => {
                    const active = selectedCycle === cycle;
                    const savings = getPlanSavingsPercent(selectedPlan, cycle);
                    return (
                      <button
                        key={cycle}
                        onClick={() => {
                          setSelectedCycle(cycle);
                          setQuote(null);
                          setAppliedVoucher(null);
                        }}
                        className={`min-w-0 rounded-2xl border-2 px-4 py-3 text-sm font-black transition-all ${
                          active
                            ? 'border-orange-400 bg-white text-orange-800 shadow-sm shadow-orange-100'
                            : 'border-transparent bg-slate-200/50 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        <span className="block">{BILLING_CYCLE_LABELS[cycle]}</span>
                        {savings > 0 ? (
                          <span className="mt-1 block text-[9px] font-black uppercase tracking-wider text-emerald-600">
                            {cycle === 'yearly' ? 'Hemat hingga 24%' : `Hemat ${savings}%`}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 'method' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex flex-col gap-3 rounded-[24px] border border-orange-100 bg-orange-50/70 p-5 text-slate-900 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Paket Pilihan</p>
                  <p className="mt-1 break-words text-base font-black sm:text-lg">{selectedPlanDef.name} · {BILLING_CYCLE_LABELS[selectedCycle]}</p>
                </div>
                <p className="shrink-0 text-xl font-black text-orange-800">{formatRupiah(selectedPrice)}</p>
              </div>

              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                    <Wallet size={18} />
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">QRIS (Otomatis & Cepat)</h4>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {methods.qris.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      className={`flex items-center justify-between rounded-[24px] border-2 p-5 transition-all ${
                        selectedMethod === method.id
                          ? 'border-orange-400 bg-orange-50/70 shadow-md shadow-orange-100'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-100 shadow-sm">
                          <WalletCards size={20} className="text-slate-400" />
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="text-sm font-black text-slate-800">{method.label}</p>
                          <p className="break-words text-[10px] font-bold uppercase text-slate-400">{method.description}</p>
                        </div>
                      </div>
                      {selectedMethod === method.id && <CheckCircle2 size={20} className="ml-3 shrink-0 text-orange-700" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                    <CreditCard size={18} />
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">Virtual Account</h4>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {methods.virtualAccount.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      className={`flex items-center justify-between rounded-[24px] border-2 p-5 transition-all ${
                        selectedMethod === method.id
                          ? 'border-orange-400 bg-orange-50/70 shadow-md shadow-orange-100'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-100 shadow-sm">
                          <CreditCard size={20} className="text-slate-400" />
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="text-sm font-black text-slate-800">{method.shortLabel}</p>
                          <p className="break-words text-[10px] font-bold uppercase text-slate-400">{method.description}</p>
                        </div>
                      </div>
                      {selectedMethod === method.id && <CheckCircle2 size={20} className="ml-3 shrink-0 text-orange-700" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'review' && quote && (
            <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
              <div className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-xl md:p-8">
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Ringkasan Pesanan</h4>

                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-500">Paket {quote.planName}</span>
                    <span className="font-black text-slate-800">{formatRupiah(quote.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-500">Durasi: {BILLING_CYCLE_LABELS[quote.billingCycle]}</span>
                    <span className="text-xs font-black text-slate-400">TERPILIH</span>
                  </div>
                  <div className="flex flex-col gap-2 rounded-2xl bg-slate-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-bold text-slate-500">Metode</span>
                    <span className="min-w-0 break-words font-black text-slate-800 sm:text-right">{quote.selectedPaymentMethod.label}</span>
                    <span className="shrink-0 text-xs font-black uppercase text-slate-400">MIDTRANS</span>
                  </div>

                  <div className="border-t border-slate-50 pt-4" />

                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-500">Diskon</span>
                    <span className={`font-black ${quote.discount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {quote.discount > 0 ? `- ${formatRupiah(quote.discount)}` : 'Rp 0'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-500">Biaya Layanan</span>
                    <span className="font-black text-slate-800">{quote.adminFee > 0 ? formatRupiah(quote.adminFee) : 'Gratis'}</span>
                  </div>

                  <div className="kaffe-checkout-highlight mt-6 rounded-[24px] p-6 text-white">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-base font-black">Total Pembayaran</span>
                      <span className="break-words text-2xl font-black sm:text-3xl">{formatRupiah(quote.total)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  {!showVoucherInput && !quote.voucher ? (
                    <button
                      onClick={() => setShowVoucherInput(true)}
                      className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-orange-700 transition-colors hover:text-orange-800"
                    >
                      <Percent size={14} />
                      Punya Kode Voucher
                    </button>
                  ) : (
                    <div className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-orange-50 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={voucherInput}
                          onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                          placeholder="KODE VOUCHER"
                          className="h-10 flex-1 rounded-xl border border-orange-100 bg-white px-4 text-xs font-black outline-none focus:ring-2 focus:ring-orange-200"
                        />
                        <button
                          onClick={() => void applyVoucher()}
                          disabled={loadingQuote}
                          className="h-10 rounded-xl bg-orange-700 px-5 text-xs font-black text-white hover:bg-orange-800 disabled:opacity-50"
                        >
                          {loadingQuote ? '...' : 'Pakai'}
                        </button>
                      </div>
                      {quote.voucher && (
                        <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="break-words text-[10px] font-black uppercase tracking-widest text-orange-800">✓ Voucher Aktif: {quote.voucher.code}</p>
                          <button
                            onClick={() => {
                              setVoucherInput('');
                              setAppliedVoucher(null);
                              setShowVoucherInput(false);
                              void loadQuote(null);
                            }}
                            className="text-[10px] font-black uppercase text-red-500 hover:underline"
                          >
                            Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-4 rounded-[28px] border border-orange-100 bg-orange-50/50 p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700 shadow-sm">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <p className="text-sm font-black text-orange-950 leading-tight">Keamanan Terjamin</p>
                  <p className="mt-1 text-[11px] font-medium leading-relaxed text-orange-900">
                    Lisensi aktif otomatis setelah pembayaran sukses. Seluruh data transaksi dienkripsi dengan standar keamanan tinggi.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="subscription-checkout-footer shrink-0 border-t border-slate-100 bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 md:px-10 md:py-5">
          {step === 'plan' && (
            <button
              onClick={() => setStep('method')}
              className="kaffe-gradient-cta group flex h-14 w-full items-center justify-center gap-3 rounded-2xl px-6 text-sm font-black transition-all active:scale-[0.98]"
            >
              Lanjut Pilih Pembayaran
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
          )}

          {step === 'method' && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => setStep('plan')}
                className="flex h-14 flex-1 items-center justify-center gap-3 rounded-2xl border-2 border-slate-100 bg-white px-6 text-sm font-bold text-slate-500 transition-all active:scale-[0.98] hover:bg-slate-50"
              >
                <ChevronLeft size={18} />
                Kembali
              </button>
              <button
                onClick={() => void goToReview()}
                disabled={loadingQuote || !isOnline}
                className="kaffe-gradient-cta group flex h-14 flex-[1.5] items-center justify-center gap-3 rounded-2xl px-6 text-sm font-black transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loadingQuote ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    Lanjut Review
                    <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </div>
          )}

          {step === 'review' && quote && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => setStep('method')}
                disabled={submitting}
                className="flex h-14 flex-1 items-center justify-center gap-3 rounded-2xl border-2 border-slate-100 bg-white px-6 text-sm font-bold text-slate-500 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <ChevronLeft size={18} />
                Ganti Metode
              </button>
              <button
                onClick={() => void handlePay()}
                disabled={submitting || !isOnline}
                className="kaffe-gradient-cta group flex h-14 flex-[2] items-center justify-center gap-3 rounded-2xl px-6 text-sm font-black transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <Lock size={18} />
                    Bayar Sekarang · {formatRupiah(quote.total)}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .subscription-checkout-shell {
          animation: subscription-modal-up 0.32s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes subscription-modal-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @media (min-width: 768px) {
          .subscription-checkout-shell {
            animation-name: subscription-modal-pop;
          }
          @keyframes subscription-modal-pop {
            from { opacity: 0; transform: translateY(18px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
