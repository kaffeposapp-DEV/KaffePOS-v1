import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, CreditCard, Loader2, Percent, ShieldCheck, WalletCards, X } from 'lucide-react';
import { createSubscriptionPayment, getSubscriptionPaymentQuote, type SubscriptionPaymentConfig } from '@/lib/backendApi';
import { type SubscriptionBillingQuote, type SubscriptionPaymentMethodId, groupSubscriptionPaymentMethods } from '@/lib/subscriptionBilling';
import { BILLING_CYCLE_LABELS, formatRupiah, getPlanDefinition } from '@/lib/subscriptionPlans';

type Props = {
  open: boolean;
  plan: 'kopi_susu' | 'signature' | 'founder';
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  onClose: () => void;
  toast: { showToast: (message: string, type?: string) => void };
};

type FlowStep = 'method' | 'checkout';

export default function SubscriptionCheckoutFlow({ open, plan, billingCycle, onClose, toast }: Props) {
  const [step, setStep] = useState<FlowStep>('method');
  const [selectedMethod, setSelectedMethod] = useState<SubscriptionPaymentMethodId>('qris');
  const [quote, setQuote] = useState<SubscriptionBillingQuote | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<SubscriptionPaymentConfig | null>(null);
  const [voucherInput, setVoucherInput] = useState('');
  const [showVoucherInput, setShowVoucherInput] = useState(false);
  const [appliedVoucher, setAppliedVoucher] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const methods = useMemo(() => groupSubscriptionPaymentMethods(), []);
  const planDef = getPlanDefinition(plan);

  const loadQuote = async (voucherCode?: string | null) => {
    setLoadingQuote(true);
    try {
      const resolvedVoucherCode = voucherCode === undefined ? appliedVoucher : voucherCode;
      const response = await getSubscriptionPaymentQuote({
        plan,
        billingCycle,
        paymentMethod: selectedMethod,
        ...(resolvedVoucherCode ? { voucherCode: resolvedVoucherCode } : {}),
      });
      setPaymentConfig(response.paymentConfig ?? null);
      if (response.paymentConfig && !response.paymentConfig.onlinePaymentAvailable) {
        throw new Error(response.paymentConfig.message);
      }
      setQuote(response.quote);
      return response.quote as SubscriptionBillingQuote;
    } finally {
      setLoadingQuote(false);
    }
  };

  const handleConfirmMethod = async () => {
    try {
      await loadQuote(appliedVoucher);
      setStep('checkout');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyiapkan checkout.';
      toast.showToast(message, 'error');
    }
  };

  const handleApplyVoucher = async () => {
    try {
      const code = voucherInput.trim().toUpperCase();
      const nextQuote = await loadQuote(code || null);
      setAppliedVoucher(nextQuote.voucher?.code ?? null);
      if (nextQuote.voucher) setShowVoucherInput(false);
      toast.showToast(nextQuote.voucher ? `Voucher ${nextQuote.voucher.code} diterapkan.` : 'Voucher dihapus.', nextQuote.voucher ? 'success' : 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voucher tidak bisa dipakai.';
      toast.showToast(message, 'error');
    }
  };

  const handlePay = async () => {
    setSubmitting(true);
    try {
      const result = await createSubscriptionPayment({
        plan,
        billingCycle,
        paymentMethod: selectedMethod,
        voucherCode: appliedVoucher,
      });

      if (!result.payment?.redirect_url) {
        throw new Error('Link pembayaran tidak tersedia.');
      }

      toast.showToast(result.reused ? 'Melanjutkan checkout yang masih aktif.' : 'Mengarahkan ke pembayaran aman...', 'success');
      window.location.assign(result.payment.redirect_url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memulai transaksi langganan.';
      toast.showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const closeFlow = useCallback(() => {
    setStep('method');
    setQuote(null);
    setPaymentConfig(null);
    setVoucherInput('');
    setShowVoucherInput(false);
    setAppliedVoucher(null);
    setSelectedMethod('qris');
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    
    // Mencegah background body ikut terscroll ketika modal terbuka
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        closeFlow();
      }
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
      className="modal-overlay md:items-center md:[&>.modal-content]:rounded-[24px] md:[&>.modal-content]:m-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          closeFlow();
        }
      }}
    >
      <div className="modal-content bg-white shadow-[0_24px_90px_rgba(15,23,42,0.22)]">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-[20px] border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Langganan</p>
            <h3 className="text-xl font-black text-slate-900">{step === 'method' ? 'Pilih Metode Pembayaran' : 'Detail Checkout'}</h3>
          </div>
          <button onClick={closeFlow} className="rounded-2xl border border-slate-200 p-2 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-5">
          {step === 'method' && (
            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-900">{planDef.name}</p>
                <p className="mt-1 text-sm text-slate-500">{BILLING_CYCLE_LABELS[billingCycle]} · {formatRupiah(planDef.prices[billingCycle] ?? 0)}</p>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <WalletCards size={18} className="text-kaffe-600" />
                  <p className="text-sm font-black text-slate-700">QRIS</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {methods.qris.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      className={`rounded-2xl border-2 p-4 text-left transition ${selectedMethod === method.id ? 'border-kaffe-600 bg-kaffe-50 shadow-sm' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">{method.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{method.description}</p>
                        </div>
                        {selectedMethod === method.id && <CheckCircle2 size={18} className="text-kaffe-600 shrink-0" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <CreditCard size={18} className="text-kaffe-600" />
                  <p className="text-sm font-black text-slate-700">Virtual Account</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {methods.virtualAccount.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      className={`rounded-2xl border-2 p-4 text-left transition ${selectedMethod === method.id ? 'border-kaffe-600 bg-kaffe-50 shadow-sm' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">{method.shortLabel}</p>
                          <p className="mt-1 text-xs text-slate-500">{method.description}</p>
                        </div>
                        {selectedMethod === method.id && <CheckCircle2 size={18} className="text-kaffe-600 shrink-0" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => void handleConfirmMethod()}
                disabled={loadingQuote}
                className="w-full h-12 rounded-2xl bg-kaffe-600 px-4 text-[15px] font-black text-white shadow-sm flex items-center justify-center gap-2"
              >
                {loadingQuote ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Menyiapkan checkout...
                  </>
                ) : 'Konfirmasi Metode'}
              </button>
            </div>
          )}

          {step === 'checkout' && quote && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-900">{quote.planName}</p>
                <p className="mt-1 text-sm text-slate-500">{BILLING_CYCLE_LABELS[quote.billingCycle]} · {quote.selectedPaymentMethod.label}</p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Detail Pembayaran</p>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-bold text-slate-900">{formatRupiah(quote.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Discount</span>
                    <span className={`font-bold ${quote.discount > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>- {formatRupiah(quote.discount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Biaya admin</span>
                    <span className="font-bold text-slate-900">{quote.adminFee > 0 ? formatRupiah(quote.adminFee) : 'Ditanggung KaffePOS'}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                    <span className="text-base font-black text-slate-900">Total</span>
                    <span className="text-xl font-black text-slate-900">{formatRupiah(quote.total)}</span>
                  </div>
                </div>

                {(!showVoucherInput && !quote.voucher) ? (
                  <button
                    onClick={() => setShowVoucherInput(true)}
                    className="mt-4 w-full h-12 rounded-2xl border border-emerald-500 bg-white px-4 text-[15px] font-bold text-emerald-600 flex items-center justify-center gap-2"
                  >
                    <Percent size={18} />
                    Tambah Voucher
                  </button>
                ) : (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex gap-2">
                      <input
                        value={voucherInput}
                        onChange={(event) => setVoucherInput(event.target.value.toUpperCase())}
                        placeholder="Masukkan kode voucher"
                        className="flex-1 h-12 rounded-xl border border-emerald-200 bg-white px-4 text-[16px] text-slate-700 outline-none"
                      />
                      <button
                        onClick={() => void handleApplyVoucher()}
                        className="rounded-xl h-12 bg-emerald-600 px-4 font-black text-white flex items-center justify-center"
                      >
                        <CheckCircle2 size={18} />
                      </button>
                    </div>
                    {quote.voucher && (
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-xs font-bold text-emerald-700">
                          Voucher aktif: {quote.voucher.code}
                        </p>
                        <button
                          onClick={() => {
                            setVoucherInput('');
                            setAppliedVoucher(null);
                            setShowVoucherInput(false);
                            void loadQuote(null);
                          }}
                          className="text-xs text-red-500 font-bold"
                        >
                          Hapus
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-500 bg-white">
                  <div className="p-4 flex items-center justify-between border-b border-emerald-100 bg-white">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-6 flex items-center justify-center border border-slate-200 rounded">
                        <span className="text-[10px] font-black text-slate-400">{quote.selectedPaymentMethod.id.toUpperCase()}</span>
                      </div>
                      <p className="text-sm font-bold text-emerald-600">{quote.selectedPaymentMethod.label}</p>
                    </div>
                    <ChevronRight size={18} className="text-emerald-600" />
                  </div>
                  <div className="bg-emerald-50/50 p-4 flex items-start gap-3">
                    <ShieldCheck size={24} className="mt-0.5 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-sm font-black text-slate-800">Pembayaran Aman</p>
                      <p className="text-xs text-slate-500">
                        {paymentConfig?.mode === 'midtrans_sandbox'
                          ? 'Mode sandbox hanya untuk QA internal, bukan transaksi komersial.'
                          : quote.trustLabel}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-xs text-slate-600">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                    <span>Saya menyetujui <span className="text-emerald-600 font-bold">Syarat Penggunaan</span> KaffePOS.</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                    <span>Saya memahami status langganan akan aktif setelah pembayaran berhasil dikonfirmasi.</span>
                  </label>
                </div>

                <button
                  onClick={() => void handlePay()}
                  disabled={submitting}
                  className="mt-5 w-full rounded-2xl bg-emerald-500 px-4 py-4 text-sm font-black text-white shadow-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Membuka pembayaran aman...
                    </>
                  ) : `Bayar Sekarang - ${formatRupiah(quote.total)}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
