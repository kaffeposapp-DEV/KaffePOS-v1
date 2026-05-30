/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Clock3, ExternalLink, History, RefreshCw, Shield, Sparkles, CreditCard, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getSubscriptions, type SubscriptionPaymentConfig } from '@/lib/backendApi';
import {
  BILLING_CYCLE_LABELS,
  INSTAGRAM_ADMIN_URL,
  type BillingCycle,
  formatDateId,
  formatRupiah,
  getPlanDefinition,
} from '@/lib/subscriptionPlans';
import { buildSubscriptionAccess, type SubscriptionAccess } from '@/lib/subscriptionAccess';
import { isAdminEmail } from '@/lib/admin';
import SubscriptionCheckoutFlow from './SubscriptionCheckoutFlow';
import PricingPage from '../subscription/PricingPage';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { trackOpsEvent } from '@/lib/opsMetrics';

interface SubscriptionSectionProps {
  isPro: boolean;
  profile: any;
  toast: any;
  onRefreshStatus: () => Promise<void>;
}

type SubscriptionRow = {
  id: string;
  plan: string;
  billing_cycle: string;
  status: string;
  activated_at: string;
  expires_at: string | null;
  payment_amount: number | null;
};

type PaymentHistoryRow = {
  id: string;
  plan: string;
  billing_cycle: string;
  amount: number;
  payment_method: string;
  paid_at: string;
  status: string;
  payment_note: string | null;
};

type PendingPaymentRow = {
  id: string;
  plan: string;
  billing_cycle: string;
  amount: number;
  redirect_url: string | null;
  transaction_status: string;
  expires_at: string | null;
  created_at: string;
};

type PaidPlan = 'kopi_susu' | 'signature';
type PaidCycle = Exclude<BillingCycle, 'free'>;

function isPaidPlan(plan: string | null | undefined): plan is PaidPlan {
  return plan === 'kopi_susu' || plan === 'signature';
}

function isPaidCycle(cycle: string | null | undefined): cycle is PaidCycle {
  return cycle === 'monthly' || cycle === 'quarterly' || cycle === 'semiannual' || cycle === 'yearly';
}

function getPaymentStatusLabel(status: string | null | undefined) {
  const normalized = status?.toLowerCase();
  if (normalized === 'settlement' || normalized === 'success') return 'Berhasil';
  if (normalized === 'pending' || normalized === 'capture') return 'Menunggu pembayaran';
  if (normalized === 'expire') return 'Kedaluwarsa';
  if (normalized === 'deny' || normalized === 'cancel' || normalized === 'failure') return 'Gagal';
  return status || '-';
}

export default function SubscriptionSection({ isPro, profile, toast, onRefreshStatus }: SubscriptionSectionProps) {
  const navigate = useNavigate();
  const auth = useAuth() as ReturnType<typeof useAuth> & { subscriptionAccess?: SubscriptionAccess };
  const { user } = auth;
  const subscriptionAccess = auth.subscriptionAccess ?? buildSubscriptionAccess(profile);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionRow | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryRow[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PendingPaymentRow[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<SubscriptionPaymentConfig | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlan>('signature');
  const [checkoutCycle, setCheckoutCycle] = useState<PaidCycle>('monthly');
  const [pricingCycle, setPricingCycle] = useState<PaidCycle>('yearly');
  const billingNoticeShown = useRef(false);

  const loadSubscriptionData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const response = await getSubscriptions();
      setCurrentSubscription(response.currentSubscription || null);
      setPaymentHistory(response.paymentHistory || []);
      setPendingPayments(response.pendingPayments || []);
      setPaymentConfig(response.paymentConfig || null);
    } catch {
      toast.showToast('Gagal memuat data lisensi.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscriptionData();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || billingNoticeShown.current || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const billing = params.get('billing');
    if (!billing) return;

    billingNoticeShown.current = true;
    if (billing === 'success' || billing === 'duitku-return') {
      toast.showToast('Menunggu konfirmasi pembayaran. Lisensi aktif setelah callback terverifikasi.', 'info');
      trackAnalyticsEvent('payment_returned', { source: 'subscription_return', payment_provider: params.get('provider') || 'duitku' });
      void trackOpsEvent({
        event_name: 'payment_started',
        status: 'success',
        metadata: { source: 'subscription_return', paymentProvider: params.get('provider') || 'duitku' },
      });
    }
    if (billing === 'pending') toast.showToast('Menunggu konfirmasi pembayaran.', 'info');
    if (billing === 'failed') toast.showToast('Pembayaran gagal atau dibatalkan.', 'warning');

    onRefreshStatus().catch(() => {});
    loadSubscriptionData().catch(() => {});
    params.delete('billing');
    const nextSearch = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const poll = setInterval(() => {
      loadSubscriptionData().catch(() => {});
    }, 30_000);
    return () => { clearInterval(poll); };
  }, [user?.id]);

  const expiryDate = currentSubscription?.expires_at ? new Date(currentSubscription.expires_at) : null;
  const daysRemaining = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000) : null;
  const isExpired = currentSubscription?.status === 'expired' || (!!expiryDate && expiryDate.getTime() <= Date.now());
  const isCancelled = currentSubscription?.status === 'cancelled';
  const hasLegacyPaidAccess = Boolean(isPro && !currentSubscription && isPaidPlan(profile?.pro_plan));
  const isActivePaid = Boolean(
    (currentSubscription && currentSubscription.status === 'active' && !isExpired && !isCancelled && isPaidPlan(currentSubscription.plan)) ||
    hasLegacyPaidAccess,
  );
  const isTrial = subscriptionAccess.isTrial || (currentSubscription?.plan === 'secangkir' && currentSubscription.status === 'active' && !isExpired);
  const activePlanId = currentSubscription && isActivePaid && isPaidPlan(currentSubscription.plan)
    ? currentSubscription.plan
    : hasLegacyPaidAccess && isPaidPlan(profile?.pro_plan)
      ? profile.pro_plan
      : 'secangkir';
  const activePlan = getPlanDefinition(activePlanId);
  const activeCycle = currentSubscription?.billing_cycle || (activePlan.isFree ? 'free' : 'monthly');
  const expiringSoon = (isActivePaid || isTrial) && daysRemaining !== null && daysRemaining <= 7;
  const paidHistory = useMemo(() => paymentHistory.filter((entry) => entry.amount > 0), [paymentHistory]);
  const activePendingPayment = useMemo(
    () => pendingPayments.find((entry) => ['pending', 'capture', 'unknown'].includes(entry.transaction_status)) || null,
    [pendingPayments],
  );
  const failedPayment = useMemo(
    () => pendingPayments.find((entry) => ['deny', 'cancel', 'cancelled', 'expire', 'expired', 'failure', 'failed'].includes(entry.transaction_status)) || null,
    [pendingPayments],
  );
  const onlinePaymentAvailable = paymentConfig?.onlinePaymentAvailable === true;
  const paymentModeMessage = paymentConfig?.message || 'Pembayaran online belum dibuka. Aktivasi sementara dibantu admin.';

  const primaryCta = isTrial ? 'Upgrade ke Signature' : isActivePaid ? 'Perpanjang Langganan' : isExpired || isCancelled ? 'Aktifkan Kembali' : 'Langganan Sekarang';

  const statusLabel = activePendingPayment
    ? 'Menunggu Pembayaran'
    : isTrial
      ? 'Trial Signature Aktif'
      : isActivePaid
      ? 'Langganan Aktif'
      : isExpired
        ? 'Masa Aktif Habis'
        : isCancelled
          ? 'Lisensi Dibatalkan'
          : 'Paket Gratis';

  const openCheckout = (plan?: PaidPlan, cycle?: PaidCycle) => {
    if (!onlinePaymentAvailable) {
      toast.showToast('Pembayaran online belum aktif. Admin akan membantu aktivasi lisensi.', 'info');
      window.open(INSTAGRAM_ADMIN_URL, '_blank', 'noopener,noreferrer');
      return;
    }

    const fallbackPlan = isPaidPlan(currentSubscription?.plan) ? currentSubscription.plan : 'signature';
    const fallbackCycle = isPaidCycle(currentSubscription?.billing_cycle) ? currentSubscription.billing_cycle : 'monthly';
    setCheckoutPlan(plan ?? fallbackPlan);
    setCheckoutCycle(cycle ?? fallbackCycle);
    setCheckoutOpen(true);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshStatus();
      await loadSubscriptionData();
      toast.showToast('Status lisensi berhasil diperbarui.', 'success');
    } catch {
      toast.showToast('Gagal sinkron status lisensi.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="kaffe-responsive-surface space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Billing dan Langganan</p>
        <h2 className="mt-1 text-xl font-black text-slate-900">Paket Aktif</h2>
      </div>

      {/* ── HERO STATUS CARD ── */}
      <div className="kaffe-subscription-card relative overflow-hidden rounded-[32px] p-6 md:p-8">
        <div className="relative flex min-w-0 flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                isActivePaid ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-orange-50 text-orange-700 ring-1 ring-orange-100'
              }`}>
                <div className={`h-1.5 w-1.5 rounded-full ${isActivePaid ? 'bg-emerald-500 animate-pulse' : 'bg-orange-500'}`} />
                {statusLabel}
              </span>
              {loading && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 ring-1 ring-slate-100">
                  <RefreshCw size={10} className="animate-spin" />
                  Sinkron
                </span>
              )}
              {activePendingPayment && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 ring-1 ring-amber-100">
                  <Clock3 size={10} />
                  Menunggu
                </span>
              )}
            </div>
            <h3 className="mt-4 break-words text-3xl font-black text-slate-900 md:text-4xl">
              {activePlan.name}
            </h3>
            <p className="mt-2 max-w-md text-sm font-medium text-slate-600 leading-relaxed">
              {isTrial ? 'Gratis 14 Hari • Full Akses Signature • Otomatis Rp49.000/bulan setelah trial berakhir' : activePlan.description}
            </p>
          </div>

          <div className="kaffe-subscription-detail-panel flex shrink-0 flex-col gap-2 rounded-3xl p-5 min-w-0 w-full lg:min-w-[240px] lg:w-auto">
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-slate-500">
                <Calendar size={14} />
                <span className="text-[11px] font-black uppercase tracking-wider">Masa Aktif</span>
              </div>
              <span className="min-w-0 break-words text-right text-[11px] font-black text-slate-900">{expiryDate ? formatDateId(expiryDate) : 'Selamanya'}</span>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-4 border-t border-orange-100/70 pt-2">
              <div className="flex items-center gap-2 text-slate-500">
                <CreditCard size={14} />
                <span className="text-[11px] font-black uppercase tracking-wider">Metode</span>
              </div>
              <span className="min-w-0 break-words text-right text-[11px] font-black text-slate-900">{BILLING_CYCLE_LABELS[(activeCycle as BillingCycle) || 'free']}</span>
            </div>
            {expiryDate && (
              <div className="mt-3 overflow-hidden rounded-full bg-orange-100 h-1.5">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${expiringSoon ? 'bg-orange-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.max(5, Math.min(100, (daysRemaining || 0) / 30 * 100))}%` }}
                />
              </div>
            )}
            {expiryDate && (
              <p className={`mt-1 text-center text-[10px] font-black uppercase tracking-widest ${expiringSoon ? 'text-orange-600' : 'text-slate-500'}`}>
                {isTrial ? `Trial tersisa ${daysRemaining} hari` : `${daysRemaining} Hari Tersisa`}
              </p>
            )}
          </div>
        </div>

        <div className="relative mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => openCheckout()}
            className="kaffe-gradient-cta group inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-black transition-all active:scale-95"
          >
            <Sparkles size={18} className="transition-transform group-hover:rotate-12" />
            {primaryCta}
          </button>
          <button
            onClick={handleRefresh}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-orange-100 bg-white px-6 text-sm font-black text-slate-800 shadow-sm transition-all active:scale-95 hover:border-orange-200 hover:text-orange-700"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Sinkron...' : 'Refresh Status'}
          </button>
        </div>
      </div>

      {/* ── ALERTS & NOTICES ── */}
      {(expiringSoon || activePendingPayment || failedPayment || !onlinePaymentAvailable) && (
        <div className="space-y-3">
          {activePendingPayment && (
            <div className="flex items-start gap-4 rounded-3xl border border-amber-100 bg-amber-50 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-200/50 text-amber-600">
                <Clock3 size={20} />
              </div>
          <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-amber-900">Pembayaran sedang diproses</p>
                <p className="mt-1 break-words text-xs font-medium text-amber-700 leading-relaxed">
                  Paket {getPlanDefinition(activePendingPayment.plan).name} ({BILLING_CYCLE_LABELS[(activePendingPayment.billing_cycle as BillingCycle) || 'monthly']}) sebesar {formatRupiah(activePendingPayment.amount)} belum terverifikasi.
                </p>
                <p className="mt-1 text-xs font-bold text-amber-800">Lisensi belum aktif sampai pembayaran sukses.</p>
                {activePendingPayment.redirect_url && (
                  <a
                    href={activePendingPayment.redirect_url}
                    className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-amber-700 px-4 text-xs font-black text-white shadow-sm transition-all active:scale-95"
                  >
                    Lanjutkan Pembayaran
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          )}

          {expiringSoon && (
            <div className="flex items-center gap-4 rounded-3xl border border-orange-100 bg-orange-50 p-5">
              <AlertCircle size={20} className="text-orange-500" />
              <p className="text-sm font-bold text-orange-800">
                {isTrial
                  ? <>Trial Signature tersisa <span className="font-black underline">{daysRemaining} hari</span>. Upgrade kapan saja untuk tetap memakai fitur premium setelah trial.</>
                  : <>Langganan akan habis dalam <span className="font-black underline">{daysRemaining} hari</span>. Perpanjang sekarang untuk menjaga operasional toko tetap lancar.</>}
              </p>
            </div>
          )}

          {!onlinePaymentAvailable && (
            <div className="rounded-3xl border border-orange-100 bg-orange-50 p-5">
              <p className="text-sm font-black text-orange-950">Info Pembayaran Online</p>
              <p className="mt-1 text-xs font-medium text-orange-900 leading-relaxed">{paymentModeMessage}</p>
            </div>
          )}
        </div>
      )}

      {/* ── PLAN COMPARISON / SELECTION ── */}
      <PricingPage
        selectedCycle={pricingCycle}
        onCycleChange={setPricingCycle}
        activePlanId={activePlan.id}
        isActivePaid={isActivePaid}
        isTrial={isTrial}
        trialDaysRemaining={subscriptionAccess.daysRemaining}
        onSelectPlan={(plan, cycle) => {
          if (plan === 'secangkir') {
            toast.showToast('Paket Secangkir aktif otomatis untuk akun gratis.', 'info');
            return;
          }
          if (!isPaidPlan(plan)) return;
          openCheckout(plan, cycle as PaidCycle);
        }}
        ctaLabel={(plan) => (plan === 'secangkir' ? 'Mulai Gratis' : `Pilih ${getPlanDefinition(plan).shortName}`)}
      />

      {/* ── FOOTER ACTIONS ── */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex h-14 flex-1 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 shadow-sm transition-all active:scale-95"
        >
          <History size={18} />
          {showHistory ? 'Tutup Riwayat' : 'Lihat Riwayat Pembayaran'}
        </button>
        {isAdminEmail(profile?.email) && (
          <button
            onClick={() => navigate('/admin')}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-6 text-xs font-bold text-slate-500 transition-all active:scale-95"
          >
            <Shield size={16} />
            Internal Admin
          </button>
        )}
      </div>

      {/* ── HISTORY LIST ── */}
      {showHistory && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <h4 className="text-lg font-black text-slate-800">Riwayat Transaksi</h4>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {paidHistory.length} Transaksi
            </span>
          </div>

          <div className="space-y-3">
            {paidHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                <History size={40} className="mb-3 opacity-20" />
                <p className="text-xs font-bold uppercase tracking-widest">Belum ada catatan pembayaran</p>
              </div>
            ) : (
              paidHistory.map((entry) => {
                const plan = getPlanDefinition(entry.plan);
                return (
                  <div key={entry.id} className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-50 bg-slate-50/50 p-4 transition-all hover:bg-white hover:border-slate-200 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm border border-slate-100">
                        <CreditCard size={18} className="text-slate-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-800 text-sm">{plan.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                          {formatDateId(entry.paid_at)} · {BILLING_CYCLE_LABELS[(entry.billing_cycle as BillingCycle) || 'monthly']}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="font-black text-slate-900 text-sm">{formatRupiah(entry.amount)}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">
                        {getPaymentStatusLabel(entry.status)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <SubscriptionCheckoutFlow
        open={checkoutOpen}
        plan={checkoutPlan}
        billingCycle={checkoutCycle}
        onClose={() => setCheckoutOpen(false)}
        toast={toast}
      />
    </div>
  );
}
