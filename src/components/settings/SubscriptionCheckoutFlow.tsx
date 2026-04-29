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
  type BillingCycle,
  type SubscriptionPlanId,
  formatRupiah,
  getPlanDefinition,
  getPlanPrice,
} from '@/lib/subscriptionPlans';
import { canStartOnlineBillingFlow, getOnlineBillingBlockedMessage } from '@/lib/offlinePolicy';

type PaidPlan = Exclude<SubscriptionPlanId, 'secangkir'>;
type PaidCycle = Exclude<BillingCycle, 'free'>;

type Props = {
  open: boolean;
  plan: PaidPlan;
  billingCycle: PaidCycle;
  onClose: () => void;
  toast: { showToast: (message: string, type?: string) => void };
};

type FlowStep = 'plan' | 'method' | 'review';

const PAID_PLANS: PaidPlan[] = ['kopi_susu', 'signature', 'founder'];
const PAID_CYCLES: PaidCycle[] = ['monthly', 'quarterly', 'yearly'];

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

  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) closeFlow();
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [closeFlow, open, submitting]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay md:items-center md:[&>.modal-content]:m-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) closeFlow();
      }}
    >
      <div className="modal-content flex max-h-[100vh] w-full flex-col overflow-hidden bg-white shadow-[0_24px_100px_rgba(0,0,0,0.25)] md:max-h-[90vh] md:max-w-[850px] md:rounded-[32px]">
        {/* HEADER SECTION */}
        <div className="shrink-0 border-b border-slate-100 bg-white px-6 py-5 md:px-10">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">
                  {stepNumber(step)}
                </div>
                <h3 className="text-xl font-black text-slate-800">{stepTitle(step)}</h3>
              </div>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                Langkah {stepNumber(step)} dari 3
              </p>
            </div>
            <button
              onClick={closeFlow}
              disabled={submitting}
              className="rounded-full p-2 text-slate-300 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
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
                  className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${active || done ? 'bg-slate-900' : 'bg-slate-100'}`}
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
        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-10 md:py-10 custom-scrollbar">
          {step === 'plan' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid gap-4 md:grid-cols-3">
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
                      className={`relative flex flex-col rounded-[28px] border-2 p-5 text-left transition-all ${
                        active
                          ? 'border-slate-900 bg-slate-50 shadow-md'
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
                        <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white">
                          <CheckCircle2 size={16} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-[28px] bg-slate-50 p-6 border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Pilih Durasi Langganan</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PAID_CYCLES.map((cycle) => {
                    const active = selectedCycle === cycle;
                    return (
                      <button
                        key={cycle}
                        onClick={() => {
                          setSelectedCycle(cycle);
                          setQuote(null);
                          setAppliedVoucher(null);
                        }}
                        className={`flex-1 rounded-2xl border-2 px-5 py-3 text-sm font-black transition-all ${
                          active
                            ? 'border-slate-900 bg-white text-slate-900 shadow-sm'
                            : 'border-transparent bg-slate-200/50 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {BILLING_CYCLE_LABELS[cycle]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 'method' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex items-center justify-between rounded-[24px] bg-slate-900 p-5 text-white shadow-lg">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Paket Pilihan</p>
                  <p className="mt-1 text-lg font-black">{selectedPlanDef.name} · {BILLING_CYCLE_LABELS[selectedCycle]}</p>
                </div>
                <p className="text-xl font-black text-orange-400">{formatRupiah(selectedPrice)}</p>
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
                          ? 'border-slate-900 bg-slate-50 shadow-md'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-100 shadow-sm">
                          <WalletCards size={20} className="text-slate-400" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800">{method.label}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{method.description}</p>
                        </div>
                      </div>
                      {selectedMethod === method.id && <CheckCircle2 size={20} className="text-emerald-600" />}
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
                          ? 'border-slate-900 bg-slate-50 shadow-md'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-100 shadow-sm">
                          <CreditCard size={20} className="text-slate-400" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800">{method.shortLabel}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{method.description}</p>
                        </div>
                      </div>
                      {selectedMethod === method.id && <CheckCircle2 size={20} className="text-emerald-600" />}
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
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-500">Metode</span>
                    <span className="font-black text-slate-800">{quote.selectedPaymentMethod.label}</span>
                    <span className="text-xs font-black text-slate-400 uppercase">MIDTRANS</span>
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

                  <div className="rounded-[24px] bg-slate-900 p-6 text-white shadow-lg mt-6">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-black">Total Pembayaran</span>
                      <span className="text-3xl font-black text-orange-400">{formatRupiah(quote.total)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  {!showVoucherInput && !quote.voucher ? (
                    <button
                      onClick={() => setShowVoucherInput(true)}
                      className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      <Percent size={14} />
                      Punya Kode Voucher
                    </button>
                  ) : (
                    <div className="flex flex-col gap-3 rounded-2xl bg-emerald-50 p-4 border border-emerald-100">
                      <div className="flex gap-2">
                        <input
                          value={voucherInput}
                          onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                          placeholder="KODE VOUCHER"
                          className="h-10 flex-1 rounded-xl border border-emerald-100 bg-white px-4 text-xs font-black outline-none focus:ring-2 focus:ring-emerald-200"
                        />
                        <button
                          onClick={() => void applyVoucher()}
                          disabled={loadingQuote}
                          className="h-10 rounded-xl bg-emerald-600 px-5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {loadingQuote ? '...' : 'Pakai'}
                        </button>
                      </div>
                      {quote.voucher && (
                        <div className="flex items-center justify-between px-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">✓ Voucher Aktif: {quote.voucher.code}</p>
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

              <div className="flex items-start gap-4 rounded-[28px] border border-blue-100 bg-blue-50/50 p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 shadow-sm">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <p className="text-sm font-black text-blue-900 leading-tight">Keamanan Terjamin</p>
                  <p className="mt-1 text-[11px] font-medium leading-relaxed text-blue-700">
                    Lisensi aktif otomatis setelah pembayaran sukses. Seluruh data transaksi dienkripsi dengan standar keamanan tinggi.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-6 md:px-10">
          {step === 'plan' && (
            <button
              onClick={() => setStep('method')}
              className="group flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 px-6 text-sm font-black text-white shadow-xl transition-all active:scale-[0.98] hover:bg-slate-800"
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
                className="group flex h-14 flex-[1.5] items-center justify-center gap-3 rounded-2xl bg-slate-900 px-6 text-sm font-black text-white shadow-xl transition-all active:scale-[0.98] disabled:opacity-50"
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
                className="group flex h-14 flex-[2] items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-6 text-sm font-black text-white shadow-xl shadow-emerald-600/20 transition-all active:scale-[0.98] hover:bg-emerald-700 disabled:opacity-50"
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
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(8px);
          display: flex;
          justify-content: center;
          align-items: flex-end;
          z-index: 100;
        }
        .modal-content {
          animation: modal-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes modal-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
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
