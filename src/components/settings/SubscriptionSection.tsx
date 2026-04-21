/* eslint-disable react-hooks/exhaustive-deps */
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronRight, ExternalLink, History, Instagram, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { createSubscriptionPayment, getSubscriptions } from '@/lib/backendApi';
import {
  BILLING_CYCLE_LABELS,
  INSTAGRAM_ADMIN_URL,
  RENEWAL_URL,
  formatDateId,
  formatRupiah,
  getPlanDefinition,
  getPlanPrice,
} from '@/lib/subscriptionPlans';
import { isAdminEmail } from '@/lib/admin';

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

const DEFAULT_SELECTIONS = [
  { plan: 'secangkir', billingCycle: 'free' },
  { plan: 'kopi_susu', billingCycle: 'monthly' },
  { plan: 'signature', billingCycle: 'quarterly' },
  { plan: 'founder', billingCycle: 'yearly' },
];

export default function SubscriptionSection({ isPro, profile, toast, onRefreshStatus }: SubscriptionSectionProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionRow | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryRow[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PendingPaymentRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('signature');
  const [selectedCycle, setSelectedCycle] = useState('quarterly');

  const loadSubscriptionData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const response = await getSubscriptions();
      setCurrentSubscription(response.currentSubscription || null);
      setPaymentHistory(response.paymentHistory || []);
      setPendingPayments(response.pendingPayments || []);
    } catch {
      toast.showToast('Gagal memuat data langganan.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscriptionData();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const poll = setInterval(() => {
      loadSubscriptionData().catch(() => {});
    }, 30_000);
    return () => { clearInterval(poll); };
  }, [user?.id]);

  const resolvedPlan = getPlanDefinition(currentSubscription?.plan || profile?.pro_plan || 'secangkir');
  const resolvedCycle = currentSubscription?.billing_cycle || (resolvedPlan.isFree ? 'free' : 'monthly');
  const expiryDate = currentSubscription?.expires_at ? new Date(currentSubscription.expires_at) : null;
  const daysRemaining = expiryDate ? Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000) : null;
  const isExpired = currentSubscription?.status === 'expired' || (!!expiryDate && expiryDate.getTime() <= Date.now());
  const expiringSoon = !isExpired && daysRemaining !== null && daysRemaining <= 7;
  const paidHistory = useMemo(() => paymentHistory.filter((entry) => entry.amount > 0), [paymentHistory]);
  const activePendingPayment = useMemo(
    () => pendingPayments.find((entry) => ['pending', 'capture'].includes(entry.transaction_status)) || null,
    [pendingPayments],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshStatus();
      await loadSubscriptionData();
      toast.showToast('Data langganan berhasil diperbarui.', 'success');
    } catch {
      toast.showToast('Gagal memperbarui data langganan.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const goToConfirmation = (plan: string, billingCycle: string) => {
    navigate(`/plan-confirmation?plan=${plan}&billingCycle=${billingCycle}`);
  };

  const handlePayOnline = async () => {
    if (selectedPlan === 'secangkir') {
      toast.showToast('Paket gratis tidak membutuhkan pembayaran.', 'info');
      return;
    }

    setPaying(true);
    try {
      const result = await createSubscriptionPayment({
        plan: selectedPlan as 'kopi_susu' | 'signature' | 'founder',
        billingCycle: selectedCycle as 'monthly' | 'quarterly' | 'yearly',
      });

      if (!result.payment?.redirect_url) {
        throw new Error('Link pembayaran Midtrans tidak tersedia.');
      }

      toast.showToast(result.reused ? 'Melanjutkan pembayaran yang masih pending.' : 'Mengarahkan ke Midtrans...', 'success');
      window.location.assign(result.payment.redirect_url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal membuat pembayaran Midtrans.';
      toast.showToast(message, 'error');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="p-5" style={{ background: resolvedPlan.gradient }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Langganan Saat Ini</p>
              <h3 className="mt-2 text-2xl font-black text-white">{resolvedPlan.name}</h3>
              <p className="mt-1 text-sm text-white/80">
                {BILLING_CYCLE_LABELS[(resolvedCycle as keyof typeof BILLING_CYCLE_LABELS) || 'monthly']} · {currentSubscription?.status === 'cancelled' ? 'Dibatalkan' : isExpired ? 'Expired' : 'Aktif'}
              </p>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="rounded-2xl border border-white/20 bg-white/15 px-4 py-2 text-xs font-black text-white backdrop-blur disabled:opacity-60"
            >
              {refreshing ? 'Memuat...' : 'Refresh'}
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/15 p-4 backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Status Paket</p>
              <p className="mt-2 text-sm font-bold text-white">
                {resolvedPlan.isFree ? 'Gratis aktif otomatis' : isPro ? 'Paket berbayar aktif' : 'Belum aktif'}
              </p>
              <p className="mt-1 text-xs text-white/75">{resolvedPlan.description}</p>
            </div>
            <div className="rounded-2xl bg-white/15 p-4 backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Tanggal Berakhir</p>
              <p className="mt-2 text-sm font-bold text-white">{expiryDate ? formatDateId(expiryDate) : 'Tidak ada batas waktu'}</p>
              <p className="mt-1 text-xs text-white/75">
                {expiryDate ? `${Math.max(daysRemaining || 0, 0)} hari tersisa` : 'Paket gratis selalu aktif'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-5">
          {expiringSoon && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-700">
              Langganan kamu hampir habis!
            </div>
          )}

          {isExpired && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              Langganan habis. Chat @kaffepos untuk perpanjang.
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href={INSTAGRAM_ADMIN_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white"
            >
              <Instagram size={16} />
              Perpanjang / Upgrade
            </a>
            <button
              onClick={() => setShowHistory((value) => !value)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
            >
              <History size={16} />
              Lihat Riwayat Pembayaran
            </button>
          </div>

          {activePendingPayment && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              <p className="font-black">Ada pembayaran yang masih pending.</p>
              <p className="mt-1">
                Paket {getPlanDefinition(activePendingPayment.plan).name} · {BILLING_CYCLE_LABELS[(activePendingPayment.billing_cycle as keyof typeof BILLING_CYCLE_LABELS) || 'monthly']} · {formatRupiah(activePendingPayment.amount)}
              </p>
              {activePendingPayment.expires_at && (
                <p className="mt-1 text-xs text-amber-700">Berlaku sampai {formatDateId(activePendingPayment.expires_at)}</p>
              )}
              {activePendingPayment.redirect_url && (
                <a
                  href={activePendingPayment.redirect_url}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white"
                >
                  Lanjutkan Pembayaran
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          )}

          {isAdminEmail(profile?.email) && (
            <button
              onClick={() => navigate('/admin')}
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-400"
            >
              <Shield size={14} />
              Buka panel admin internal
            </button>
          )}
        </div>
      </div>

      {showHistory && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Riwayat Pembayaran</p>
              <p className="mt-1 text-sm text-slate-500">Daftar pembayaran yang sudah tercatat di akunmu.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
              {paidHistory.length} transaksi
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {paidHistory.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
                Belum ada pembayaran yang tercatat.
              </div>
            )}

            {paidHistory.map((entry) => {
              const plan = getPlanDefinition(entry.plan);
              return (
                <div key={entry.id} className="rounded-2xl border border-slate-100 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-800">{plan.name}</p>
                      <p className="text-xs text-slate-500">
                        {BILLING_CYCLE_LABELS[(entry.billing_cycle as keyof typeof BILLING_CYCLE_LABELS) || 'monthly']} · {formatDateId(entry.paid_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900">{formatRupiah(entry.amount)}</p>
                      <p className="text-xs uppercase tracking-[0.15em] text-emerald-600">{entry.status}</p>
                    </div>
                  </div>
                  {entry.payment_note && (
                    <p className="mt-2 text-xs text-slate-500">{entry.payment_note}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Pilih Paket</p>
            <p className="mt-1 text-sm text-slate-500">Semua paket berbayar diaktifkan manual oleh admin setelah pembayaran terkonfirmasi.</p>
          </div>
          {loading && <span className="text-xs font-bold text-slate-400">Memuat...</span>}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {DEFAULT_SELECTIONS.map(({ plan, billingCycle }) => {
            const planDef = getPlanDefinition(plan);
            const active = selectedPlan === plan && selectedCycle === billingCycle;
            return (
              <button
                key={`${plan}-${billingCycle}`}
                onClick={() => {
                  setSelectedPlan(plan);
                  setSelectedCycle(billingCycle);
                }}
                className={`rounded-3xl border p-4 text-left transition ${active ? 'border-slate-900 shadow-sm' : 'border-slate-200'}`}
              >
                <div className="rounded-2xl p-4" style={{ background: planDef.gradient }}>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">{planDef.badge}</p>
                  <p className="mt-2 text-xl font-black text-white">{planDef.name}</p>
                  <p className="mt-1 text-sm text-white/80">{formatRupiah(getPlanPrice(plan, billingCycle))}</p>
                  <p className="mt-1 text-xs text-white/70">{BILLING_CYCLE_LABELS[billingCycle as keyof typeof BILLING_CYCLE_LABELS]}</p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-700">{planDef.description}</p>
                  {active && <Check size={16} className="text-emerald-500" />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Mau upgrade lebih cepat? Kamu bisa bayar otomatis via Midtrans untuk paket berbayar. Kalau butuh bantuan manual, admin tetap siap bantu.
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => { void handlePayOnline(); }}
            disabled={paying || selectedPlan === 'secangkir'}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {paying ? 'Membuat pembayaran...' : 'Bayar via Midtrans'}
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => goToConfirmation(selectedPlan, selectedCycle)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white"
          >
            Lihat Konfirmasi Paket
            <ChevronRight size={16} />
          </button>
          <a
            href={INSTAGRAM_ADMIN_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
          >
            <ExternalLink size={16} />
            Chat Admin untuk Upgrade
          </a>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Cara Berlangganan</p>
          <div className="mt-3 space-y-2">
            {[
              'Pilih paket yang paling cocok untuk kebutuhan tokomu.',
              'Klik Bayar via Midtrans untuk membuka halaman pembayaran otomatis.',
              'Selesaikan pembayaran dengan metode yang tersedia, termasuk QRIS bila aktif di akun Midtrans.',
              'Setelah settlement, status langganan akan sinkron otomatis ke akun Web dan APK.',
            ].map((step, index) => (
              <div key={step} className="flex items-start gap-3 text-sm text-slate-600">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-black text-white">
                  {index + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>

        {!resolvedPlan.isFree && (
          <a
            href={RENEWAL_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-slate-400"
          >
            <AlertTriangle size={14} />
            Halaman perpanjang cepat: {RENEWAL_URL}
          </a>
        )}
      </div>
    </div>
  );
}
