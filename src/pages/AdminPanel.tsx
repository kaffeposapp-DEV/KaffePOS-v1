import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CreditCard, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  activateAdminSubscription,
  cancelAdminSubscription,
  getAdminSubscriptionOverview,
} from '@/lib/backendApi';
import { ADMIN_EMAILS, isAdminEmail } from '@/lib/admin';
import { isAdminCommissionEnabled } from '@/lib/config/feature-flags';
import {
  BILLING_CYCLE_LABELS,
  ACTIVE_SUBSCRIPTION_PLAN_IDS,
  SUBSCRIPTION_PLANS,
  formatDateId,
  formatRupiah,
  getPlanDefinition,
  getPlanPrice,
} from '@/lib/subscriptionPlans';

type AdminSubscriptionRow = {
  id: string;
  user_id: string;
  plan: string;
  billing_cycle: string;
  activated_at: string;
  expires_at: string | null;
  status: string;
  payment_amount: number | null;
};

type AdminPaymentRow = {
  id: string;
  user_id: string;
  plan: string;
  billing_cycle: string;
  amount: number;
  payment_method: string;
  paid_at: string;
  status: string;
  payment_note: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  username: string | null;
};

const TABS = ['activate', 'subscriptions', 'history'] as const;
const ADMIN_PLAN_IDS = ACTIVE_SUBSCRIPTION_PLAN_IDS;

async function activateSubscriptionForAdmin(userId: string, plan: string, billingCycle: string, amount: number, note: string) {
  await activateAdminSubscription({
    userId,
    plan,
    billingCycle,
    paymentAmount: amount,
    paymentNote: note,
  });
}

export default function AdminPanel() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('activate');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRow[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<AdminPaymentRow[]>([]);
  const [filters, setFilters] = useState({ plan: 'all', status: 'all', expiry: 'all' });
  const [form, setForm] = useState({
    email: '',
    plan: 'kopi_susu',
    billingCycle: 'monthly',
    paymentAmount: getPlanPrice('kopi_susu', 'monthly'),
    paymentNote: '',
  });

  const refreshData = async () => {
    setLoading(true);
    try {
      const data = await getAdminSubscriptionOverview();
      setProfiles(data.profiles || []);
      setSubscriptions(data.subscriptions || []);
      setPaymentHistory(data.paymentHistory || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      refreshData().catch(() => {});
    }, 30_000);
    return () => { clearInterval(poll); };
  }, []);

  const profileMap = useMemo(() => {
    return new Map(profiles.map((entry) => [entry.id, entry]));
  }, [profiles]);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((row) => {
      if (filters.plan !== 'all' && row.plan !== filters.plan) return false;
      if (filters.status !== 'all' && row.status !== filters.status) return false;
      if (filters.expiry === 'expired') {
        return !!row.expires_at && new Date(row.expires_at).getTime() <= Date.now();
      }
      if (filters.expiry === '7days') {
        if (!row.expires_at) return false;
        const diff = Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / 86_400_000);
        return diff >= 0 && diff <= 7;
      }
      return true;
    });
  }, [filters, subscriptions]);

  const activeSubscribersCount = useMemo(() => {
    return subscriptions.filter((row) => row.status === 'active' && (!row.expires_at || new Date(row.expires_at) > new Date())).length;
  }, [subscriptions]);

  const totalRevenue = useMemo(() => {
    return paymentHistory
      .filter((row) => row.status === 'success')
      .reduce((sum, row) => sum + (row.amount || 0), 0);
  }, [paymentHistory]);

  if (!isAdminEmail(user?.email)) {
    if (!user) return <Navigate to="/login" replace />;
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-12">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-red-500">Akses Ditolak</p>
          <h1 className="mt-3 text-2xl font-black text-slate-900">Halaman ini khusus admin.</h1>
          <p className="mt-3 text-sm text-slate-500">
            Email kamu belum ada di whitelist admin. Tambahkan email di konfigurasi jika perlu akses internal.
          </p>
          <p className="mt-4 text-xs text-slate-400">Whitelist saat ini: {ADMIN_EMAILS.join(', ')}</p>
        </div>
      </div>
    );
  }


  const handleActivate = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const targetEmail = form.email.trim().toLowerCase();
      const targetProfile = profiles.find((entry) => entry.email?.toLowerCase() === targetEmail);
      if (!targetProfile?.id) throw new Error('Email user tidak ditemukan.');

      await activateSubscriptionForAdmin(
        targetProfile.id,
        form.plan,
        form.billingCycle,
        Number(form.paymentAmount),
        form.paymentNote,
      );

      setFeedback({ type: 'success', message: 'Langganan berhasil diaktifkan.' });
      await refreshData();
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Aktivasi gagal.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRenew = async (row: AdminSubscriptionRow) => {
    setSaving(true);
    setFeedback(null);
    try {
      await activateSubscriptionForAdmin(
        row.user_id,
        row.plan,
        row.billing_cycle,
        row.payment_amount || getPlanPrice(row.plan, row.billing_cycle),
        'Perpanjangan dari panel admin',
      );
      setFeedback({ type: 'success', message: 'Langganan berhasil diperpanjang.' });
      await refreshData();
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Perpanjangan gagal.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (row: AdminSubscriptionRow) => {
    setSaving(true);
    setFeedback(null);
    try {
      await cancelAdminSubscription(row.id);
      setFeedback({ type: 'success', message: 'Langganan dibatalkan.' });
      await refreshData();
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Pembatalan gagal.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Admin KaffePOS</p>
              <h1 className="mt-2 text-3xl font-black text-slate-900">Panel Langganan Internal</h1>
              <p className="mt-2 text-sm text-slate-500">Override internal untuk kasus khusus, pantau subscription aktif, dan cek riwayat pembayaran.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Subscriber Aktif</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{activeSubscribersCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Total Revenue</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{formatRupiah(totalRevenue)}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {isAdminCommissionEnabled() && (
              <>
                <Link to="/admin/affiliates" className="rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-orange-700">Affiliates</Link>
                <Link to="/admin/referrals" className="rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-orange-700">Referrals</Link>
                <Link to="/admin/commissions" className="rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-orange-700">Commissions</Link>
              </>
            )}
            {TABS.map((tab) => (
              <button type="button"
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-2 text-sm font-black ${activeTab === tab ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {tab === 'activate' ? 'Aktifkan Langganan' : tab === 'subscriptions' ? 'Active Subscriptions' : 'Payment History'}
              </button>
            ))}

            <button type="button"
              onClick={refreshData}
              className="ml-auto inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
            >
              <RefreshCw size={14} />
              Refresh
            </button>

            {import.meta.env.DEV && (
              <button type="button"
                onClick={() => {
                  setFeedback({
                    type: 'success',
                    message: 'Sandbox siap. Buka POS, buat order kecil, pilih QRIS, lalu selesaikan via Midtrans sandbox.',
                  });
                  window.open('/?tab=pos&paymentSandbox=1', '_blank', 'noopener,noreferrer');
                }}
                className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-black text-orange-600"
              >
                <CreditCard size={14} />
                Test Payment Sandbox
              </button>
            )}
          </div>
        </div>

        {feedback && (
          <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${feedback.type === 'success' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-red-200 bg-red-50 text-red-700'}`}>
            {feedback.message}
          </div>
        )}

        {activeTab === 'activate' && (
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Email User</label>
                <input
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="user@kaffepos.com"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Paket</label>
                <select
                  value={form.plan}
                  onChange={(event) => {
                    const plan = event.target.value;
                    setForm((current) => ({
                      ...current,
                      plan,
                      paymentAmount: getPlanPrice(plan, current.billingCycle),
                    }));
                  }}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-900"
                >
                  {ADMIN_PLAN_IDS.map((planId) => (
                    <option key={planId} value={planId}>{SUBSCRIPTION_PLANS[planId].name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Billing Cycle</label>
                <select
                  value={form.billingCycle}
                  onChange={(event) => {
                    const billingCycle = event.target.value;
                    setForm((current) => ({
                      ...current,
                      billingCycle,
                      paymentAmount: getPlanPrice(current.plan, billingCycle),
                    }));
                  }}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-900"
                >
                  {Object.entries(BILLING_CYCLE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Nominal Transfer</label>
                <input
                  type="number"
                  value={form.paymentAmount}
                  onChange={(event) => setForm((current) => ({ ...current, paymentAmount: Number(event.target.value) }))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-900"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Catatan</label>
              <textarea
                value={form.paymentNote}
                onChange={(event) => setForm((current) => ({ ...current, paymentNote: event.target.value }))}
                placeholder="Nama pengirim, bank, catatan konfirmasi, dll"
                className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <button type="button"
              onClick={handleActivate}
              disabled={saving}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Aktifkan Langganan
            </button>
          </div>
        )}

        {activeTab === 'subscriptions' && (
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-3 md:grid-cols-3">
              <select value={filters.plan} onChange={(event) => setFilters((current) => ({ ...current, plan: event.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <option value="all">Semua paket</option>
                {ADMIN_PLAN_IDS.map((planId) => <option key={planId} value={planId}>{SUBSCRIPTION_PLANS[planId].name}</option>)}
              </select>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <option value="all">Semua status</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select value={filters.expiry} onChange={(event) => setFilters((current) => ({ ...current, expiry: event.target.value }))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <option value="all">Semua expiry</option>
                <option value="7days">Habis ≤ 7 hari</option>
                <option value="expired">Sudah expired</option>
              </select>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400">
                    <th className="px-3 py-3 font-black">Email</th>
                    <th className="px-3 py-3 font-black">Plan</th>
                    <th className="px-3 py-3 font-black">Billing</th>
                    <th className="px-3 py-3 font-black">Started</th>
                    <th className="px-3 py-3 font-black">Expires</th>
                    <th className="px-3 py-3 font-black">Status</th>
                    <th className="px-3 py-3 font-black">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscriptions.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-slate-700">{profileMap.get(row.user_id)?.email || '-'}</td>
                      <td className="px-3 py-3 font-bold text-slate-800">{getPlanDefinition(row.plan).name}</td>
                      <td className="px-3 py-3 text-slate-600">{BILLING_CYCLE_LABELS[(row.billing_cycle as keyof typeof BILLING_CYCLE_LABELS) || 'monthly']}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDateId(row.activated_at)}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDateId(row.expires_at)}</td>
                      <td className="px-3 py-3 text-slate-600">{row.status}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleRenew(row)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Perpanjang</button>
                          <button type="button" onClick={() => handleCancel(row)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600">Batalkan</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400">
                    <th className="px-3 py-3 font-black">Email</th>
                    <th className="px-3 py-3 font-black">Plan</th>
                    <th className="px-3 py-3 font-black">Amount</th>
                    <th className="px-3 py-3 font-black">Method</th>
                    <th className="px-3 py-3 font-black">Paid At</th>
                    <th className="px-3 py-3 font-black">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50">
                      <td className="px-3 py-3 text-slate-700">{profileMap.get(row.user_id)?.email || '-'}</td>
                      <td className="px-3 py-3 font-bold text-slate-800">{getPlanDefinition(row.plan).name}</td>
                      <td className="px-3 py-3 text-slate-700">{formatRupiah(row.amount)}</td>
                      <td className="px-3 py-3 text-slate-600">{row.payment_method}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDateId(row.paid_at)}</td>
                      <td className="px-3 py-3 text-slate-600">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            Memuat data admin...
          </div>
        )}
      </div>
    </div>
  );
}
