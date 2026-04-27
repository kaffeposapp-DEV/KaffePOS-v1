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
      <div className="modal-content bg-white shadow-[0_24px_90px_rgba(15,23,42,0.22)] md:max-w-[880px] md:rounded-[28px] md:flex md:flex-row md:max-h-[85vh] overflow-hidden">
        {/* Left Pane: Order Summary (Desktop Only) */}
        <div className="hidden md:flex md:w-[320px] bg-slate-50 border-r border-slate-100 flex-col p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Ringkasan Pesanan</p>

          <div className="mt-8 flex-1">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-kaffe-600 flex items-center justify-center shrink-0 shadow-lg shadow-kaffe-600/20">
                <ShieldCheck className="text-white" size={20} />
              </div>
              <div>
                <p className="font-bold text-slate-900">{planDef.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{BILLING_CYCLE_LABELS[billingCycle]}</p>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              {planDef.features.slice(0, 4).map((f) => (
                <div key={f} className="flex items-center gap-2 text-xs text-slate-600">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between text-sm text-slate-500 mb-1">
              <span>Subtotal</span>
              <span>{formatRupiah(planDef.prices[billingCycle] ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm font-bold text-slate-900">Total</span>
              <span className="text-xl font-black text-kaffe-600">
                {step === 'checkout' && quote ? formatRupiah(quote.total) : formatRupiah(planDef.prices[billingCycle] ?? 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Pane: Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/80 backdrop-blur-md px-6 py-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-kaffe-600">Langkah {step === 'method' ? '1' : '2'} dari 2</p>
              <h3 className="text-lg font-bold text-slate-900">{step === 'method' ? 'Pilih Metode Pembayaran' : 'Detail Checkout'}</h3>
            </div>
            <button
              onClick={closeFlow}
              className="rounded-full hover:bg-slate-100 p-2 text-slate-400 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-8">
          {step === 'method' && (
            <div className="space-y-8">
              {/* Mobile Only Summary */}
              <div className="md:hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-900">{planDef.name}</p>
                <p className="mt-1 text-sm text-slate-500">{BILLING_CYCLE_LABELS[billingCycle]} · {formatRupiah(planDef.prices[billingCycle] ?? 0)}</p>
              </div>

              <div>
                <div className="mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-kaffe-50 flex items-center justify-center text-kaffe-600">
                    <WalletCards size={16} />
                  </div>
                  <p className="text-sm font-bold text-slate-900">QRIS</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {methods.qris.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      className={`group relative rounded-xl border p-4 text-left transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-kaffe-600 focus-visible:ring-offset-2 ${
                        selectedMethod === method.id
                          ? 'border-kaffe-600 bg-kaffe-50/30 ring-1 ring-kaffe-600'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-900">{method.label}</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 line-clamp-2">{method.description}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          selectedMethod === method.id ? 'border-kaffe-600 bg-kaffe-600' : 'border-slate-200 group-hover:border-slate-300'
                        }`}>
                          {selectedMethod === method.id && <CheckCircle2 size={12} className="text-white" />}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-kaffe-50 flex items-center justify-center text-kaffe-600">
                    <CreditCard size={16} />
                  </div>
                  <p className="text-sm font-bold text-slate-900">Virtual Account</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {methods.virtualAccount.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      className={`group relative rounded-xl border p-4 text-left transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-kaffe-600 focus-visible:ring-offset-2 ${
                        selectedMethod === method.id
                          ? 'border-kaffe-600 bg-kaffe-50/30 ring-1 ring-kaffe-600'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-900">{method.shortLabel}</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 line-clamp-2">{method.description}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          selectedMethod === method.id ? 'border-kaffe-600 bg-kaffe-600' : 'border-slate-200 group-hover:border-slate-300'
                        }`}>
                          {selectedMethod === method.id && <CheckCircle2 size={12} className="text-white" />}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-col gap-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <ShieldCheck size={18} className="text-slate-400 mt-0.5" />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Data Anda aman dan terenkripsi. Dengan melanjutkan, Anda menyetujui Syarat Layanan KaffePOS.
                  </p>
                </div>
                <button
                  onClick={() => void handleConfirmMethod()}
                  disabled={loadingQuote}
                  className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 px-4 text-sm font-bold text-white shadow-lg shadow-slate-900/10 transition-all flex items-center justify-center gap-2"
                >
                  {loadingQuote ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Menyiapkan...
                    </>
                  ) : (
                    <>
                      Lanjutkan ke Checkout
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
          {step === 'checkout' && quote && (
            <div className="space-y-6">
              {/* Mobile Only Summary */}
              <div className="md:hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-bold text-slate-900">{quote.planName}</p>
                <p className="mt-1 text-sm text-slate-500">{BILLING_CYCLE_LABELS[quote.billingCycle]} · {quote.selectedPaymentMethod.label}</p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Rincian Pembayaran</p>
                <div className="mt-5 space-y-4 text-sm">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Harga Paket</span>
                    <span className="font-bold text-slate-900">{formatRupiah(quote.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Diskon</span>
                    <span className={`font-bold ${quote.discount > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {quote.discount > 0 ? `- ${formatRupiah(quote.discount)}` : 'Rp 0'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Biaya Layanan</span>
                    <span className="font-bold text-slate-900">{quote.adminFee > 0 ? formatRupiah(quote.adminFee) : 'Gratis'}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                    <span className="text-base font-bold text-slate-900">Total Tagihan</span>
                    <span className="text-2xl font-black text-kaffe-600">{formatRupiah(quote.total)}</span>
                  </div>
                </div>

                {(!showVoucherInput && !quote.voucher) ? (
                  <button
                    onClick={() => setShowVoucherInput(true)}
                    className="mt-6 w-full h-11 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Percent size={14} />
                    Gunakan Kode Voucher?
                  </button>
                ) : (
                  <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/30 p-3">
                    <div className="flex gap-2">
                      <input
                        value={voucherInput}
                        onChange={(event) => setVoucherInput(event.target.value.toUpperCase())}
                        placeholder="KODE VOUCHER"
                        className="flex-1 h-11 rounded-lg border border-emerald-100 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:ring-1 focus:ring-emerald-400"
                      />
                      <button
                        onClick={() => void handleApplyVoucher()}
                        className="rounded-lg h-11 bg-emerald-600 px-4 font-bold text-white flex items-center justify-center hover:bg-emerald-700 transition-colors"
                      >
                        Pakai
                      </button>
                    </div>
                    {quote.voucher && (
                      <div className="mt-3 flex items-center justify-between px-1">
                        <p className="text-[11px] font-bold text-emerald-700">
                          PROMO: {quote.voucher.code} TERPASANG
                        </p>
                        <button
                          onClick={() => {
                            setVoucherInput('');
                            setAppliedVoucher(null);
                            setShowVoucherInput(false);
                            void loadQuote(null);
                          }}
                          className="text-[11px] text-red-500 font-bold hover:underline"
                        >
                          Hapus
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                      <CreditCard size={20} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Metode Terpilih</p>
                      <p className="text-sm font-bold text-slate-900">{quote.selectedPaymentMethod.label}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setStep('method')}
                    className="text-xs font-bold text-kaffe-600 hover:underline"
                  >
                    Ubah
                  </button>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl bg-white border border-emerald-100">
                  <ShieldCheck size={20} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">Pembayaran Terenkripsi</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      {paymentConfig?.mode === 'midtrans_sandbox'
                        ? 'Sandbox Mode: Hanya untuk testing internal.'
                        : quote.trustLabel || 'Transaksi Anda dilindungi dengan enkripsi SSL 256-bit.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-3 px-1">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input type="checkbox" defaultChecked className="mt-1 w-4 h-4 rounded border-slate-300 text-kaffe-600 focus:ring-kaffe-500" />
                    <span className="text-[11px] text-slate-500 leading-normal group-hover:text-slate-700 transition-colors">
                      Saya menyetujui <span className="text-kaffe-600 font-bold underline">Syarat Penggunaan</span> dan <span className="text-kaffe-600 font-bold underline">Kebijakan Privasi</span> KaffePOS.
                    </span>
                  </label>
                </div>

                <button
                  onClick={() => void handlePay()}
                  disabled={submitting}
                  className="w-full h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 px-4 text-base font-bold text-white shadow-lg shadow-emerald-600/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      Bayar Sekarang · {formatRupiah(quote.total)}
                    </>
                  )}
                </button>
                <p className="text-center text-[10px] text-slate-400">
                  Aktivasi otomatis segera setelah pembayaran dikonfirmasi.
                </p>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
