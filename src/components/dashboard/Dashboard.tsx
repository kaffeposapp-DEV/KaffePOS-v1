/* eslint-disable react-hooks/exhaustive-deps */




/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from 'react';
import {
  TrendingUp,
  Package,
  ShoppingCart,
  Wallet,
  AlertTriangle,
  Clock3,
  RefreshCw,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { useStore } from '@/hooks/useStore';
import { useAuth } from '@/contexts/AuthContext';
import { getInventoryUsageMap } from '@/utils/receipt';
import { getOnboardingChecklist } from '@/lib/onboarding';
import type { Tab } from '@/types';
import AIInsightsPage from './AIInsightsPage';

const fRp = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n || 0);

type RangeKey = 'today' | 'week' | 'month';

const COLORS = ['#FF6A00', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#eab308'];

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function DashboardCard({
  title,
  value,
  sub,
  icon,
  color,
}: {
  title: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="kaffe-metric-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--brand-panel-shadow-hover)]">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center border"
          style={{ backgroundColor: `${color}10`, borderColor: `${color}20`, color }}
        >
          {icon}
        </div>
        <p className="text-[11px] font-semibold text-slate-400">{title}</p>
      </div>
      <p className="font-display text-xl font-extrabold text-slate-900 leading-tight">{value}</p>
      <div className="mt-2 flex items-center gap-2">
         <span className="text-[11px] text-slate-500 font-semibold">{sub}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { subscriptionAccess } = useAuth();
  const {
    storeId,
    transactions,
    expenses,
    inventory,
    unitConversions,
    menu,
    cashRegister,
    storeSettings,
    loading,
    syncing,
    isOnline,
    loadAll,
  } = useStore();
  const [range, setRange] = useState<RangeKey>('today');
  const [refreshing, setRefreshing] = useState(false);
  const [showBetaBadge, setShowBetaBadge] = useState(() => {
    try {
      return localStorage.getItem('kpos_dashboard_beta_badge_dismissed') !== '1';
    } catch {
      return true;
    }
  });

  const now = new Date();
  const startToday = startOfDay(now);
  const startWeek = startOfWeek(now);
  const startMonth = startOfMonth(now);

  const nonVoidTransactions = useMemo(
    () => transactions.filter((t: any) => !t.is_void),
    [transactions]
  );

  const salesToday = useMemo(
    () =>
      nonVoidTransactions
        .filter((t: any) => isSameDay(new Date(t.date), now))
        .reduce((sum: number, t: any) => sum + (t.total || 0), 0),
    [nonVoidTransactions]
  );

  const salesWeek = useMemo(
    () =>
      nonVoidTransactions
        .filter((t: any) => new Date(t.date) >= startWeek)
        .reduce((sum: number, t: any) => sum + (t.total || 0), 0),
    [nonVoidTransactions]
  );

  const salesMonth = useMemo(
    () =>
      nonVoidTransactions
        .filter((t: any) => new Date(t.date) >= startMonth)
        .reduce((sum: number, t: any) => sum + (t.total || 0), 0),
    [nonVoidTransactions]
  );

  const rangeStart = range === 'today' ? startToday : range === 'week' ? startWeek : startMonth;

  const filteredTransactions = useMemo(
    () => nonVoidTransactions.filter((t: any) => new Date(t.date) >= rangeStart),
    [nonVoidTransactions, rangeStart]
  );

  const filteredExpenses = useMemo(
    () => expenses.filter((e: any) => new Date(e.date) >= rangeStart),
    [expenses, rangeStart]
  );

  const topProducts = useMemo(() => {
    const buckets = new Map<string, { qty: number; revenue: number }>();
    filteredTransactions.forEach((trx: any) => {
      (trx.items || []).forEach((item: any) => {
        const prev = buckets.get(item.name) || { qty: 0, revenue: 0 };
        buckets.set(item.name, {
          qty: prev.qty + (item.qty || 0),
          revenue: prev.revenue + (item.subtotal || 0),
        });
      });
    });
    return [...buckets.entries()]
      .map(([label, data]) => ({ label, value: data.qty, revenue: data.revenue }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [filteredTransactions]);

  const paymentData = useMemo(() => {
    const buckets = new Map<string, number>();
    filteredTransactions.forEach((trx: any) => {
      buckets.set(trx.method, (buckets.get(trx.method) || 0) + (trx.total || 0));
    });
    return [...buckets.entries()].map(([label, value], index) => ({
      label,
      value,
      color: COLORS[index % COLORS.length],
    }));
  }, [filteredTransactions]);

  const trendData = useMemo(() => {
    if (range === 'today') {
      return Array.from({ length: 8 }, (_, index) => {
        const hour = 7 + index * 2;
        const nextHour = hour + 2;
        const value = filteredTransactions
          .filter((trx: any) => {
            const d = new Date(trx.date);
            return isSameDay(d, now) && d.getHours() >= hour && d.getHours() < nextHour;
          })
          .reduce((sum: number, trx: any) => sum + (trx.total || 0), 0);
        return { label: `${String(hour).padStart(2, '0')}:00`, value };
      });
    }

    const days = range === 'week' ? 7 : Math.min(14, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
    return Array.from({ length: days }, (_, index) => {
      const dayDate = new Date(rangeStart);
      dayDate.setDate(dayDate.getDate() + index);
      const value = filteredTransactions
        .filter((trx: any) => isSameDay(new Date(trx.date), dayDate))
        .reduce((sum: number, trx: any) => sum + (trx.total || 0), 0);
      return {
        label: range === 'month'
          ? `${dayDate.getDate()}`
          : dayDate.toLocaleDateString('id-ID', { weekday: 'short' }).slice(0, 3),
        value,
      };
    });
  }, [filteredTransactions, now, range, rangeStart]);

  const lowStockItems = useMemo(
    () =>
      inventory
        .filter((item: any) => item.stock <= item.min_stock)
        .sort((a: any, b: any) => (a.stock / Math.max(a.min_stock, 1)) - (b.stock / Math.max(b.min_stock, 1)))
        .slice(0, 5),
    [inventory]
  );

  const onboarding = useMemo(
    () => getOnboardingChecklist({ storeSettings, menu, inventory, transactions }),
    [storeSettings, menu, inventory, transactions],
  );

  const stockUsageRows = useMemo(
    () => getInventoryUsageMap(inventory, menu, transactions, unitConversions),
    [inventory, menu, transactions, unitConversions]
  );

  const stockUsageMap = useMemo(
    () => new Map(stockUsageRows.map((row) => [row.itemId, row])),
    [stockUsageRows]
  );

  const activeCashier = useMemo(() => {
    const todayRegister = cashRegister
      .filter((entry: any) => isSameDay(new Date(entry.date), now))
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return todayRegister[0] || null;
  }, [cashRegister]);

  const totalRangeRevenue = filteredTransactions.reduce((sum: number, trx: any) => sum + (trx.total || 0), 0);
  const totalRangeExpenses = filteredExpenses.reduce((sum: number, exp: any) => sum + (exp.amount || 0), 0);
  const avgTransaction = filteredTransactions.length > 0 ? totalRangeRevenue / filteredTransactions.length : 0;
  const hasAnyBusinessData =
    nonVoidTransactions.length > 0 || expenses.length > 0 || inventory.length > 0 || cashRegister.length > 0;

  const handleRefresh = async () => {
    if (!storeId || refreshing) return;
    setRefreshing(true);
    try {
      await loadAll(storeId);
    } finally {
      setRefreshing(false);
    }
  };

  const openTab = (targetTab: Tab) => {
    window.dispatchEvent(new CustomEvent('kaffepos-open-tab', { detail: { tab: targetTab } }));
  };

  if (loading && transactions.length === 0 && inventory.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 text-slate-400">
        <div className="w-10 h-10 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
        <p className="text-sm font-semibold">Memuat dashboard toko...</p>
      </div>
    );
  }

  return (
    <div className="kaffe-app-bg kaffe-responsive-surface flex-1 min-h-0 overflow-y-auto">
      <div className="min-w-0 p-4 md:p-6 pb-6 lg:pb-6 max-w-7xl mx-auto space-y-5">
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-extrabold text-slate-900">Dashboard</h1>
                {showBetaBadge ? (
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-orange-100 bg-orange-50 px-3 text-[10px] font-black uppercase tracking-wider text-[#FF6A00]">
                    Closed Beta
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          localStorage.setItem('kpos_dashboard_beta_badge_dismissed', '1');
                        } catch {
                          /* ignore */
                        }
                        setShowBetaBadge(false);
                      }}
                      className="ml-0.5 flex h-5 min-h-0 w-5 min-w-0 items-center justify-center rounded-full text-orange-700 hover:bg-orange-100"
                      aria-label="Sembunyikan badge beta"
                      title="Sembunyikan badge beta"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ) : null}
              </div>
              <p className="text-slate-500 font-semibold text-[12px] mt-1 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                {storeSettings?.store_name || 'KaffePOS'} · {isOnline ? 'Terhubung Cloud' : 'Offline Mode'}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={!storeId || refreshing || syncing}
              className="w-10 h-10 shrink-0 rounded-lg bg-white border border-slate-200/80 shadow-sm text-slate-500 flex items-center justify-center disabled:opacity-50 active:scale-95 transition-all hover:bg-orange-50 hover:text-[#FF6A00]"
            >
              <RefreshCw size={20} className={refreshing || syncing ? 'animate-spin text-[#FF6A00]' : ''} />
            </button>
          </div>

          <div className="kaffe-scroll-tabs flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {[
              { id: 'today', label: 'Hari Ini' },
              { id: 'week', label: '7 Hari' },
              { id: 'month', label: '30 Hari' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setRange(item.id as RangeKey)}
                className={`shrink-0 px-5 py-2.5 rounded-lg text-[13px] font-bold transition-all border ${
                  range === item.id
                    ? 'bg-[#FF6A00] text-white border-[#FF6A00] shadow-[0_12px_26px_rgba(255,106,0,0.16)]'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {!hasAnyBusinessData && (
          <div className="bg-white border border-dashed border-slate-200 rounded-lg p-10 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-50 rounded-lg flex items-center justify-center mx-auto mb-6 text-slate-200">
               <Package size={40} />
            </div>
            <p className="font-display text-lg font-extrabold text-slate-800 mb-2">Dashboard masih kosong</p>
            <p className="text-[13px] text-slate-400 max-w-md mx-auto font-medium leading-relaxed">
              Mulai dengan input menu dan lakukan transaksi pertama agar overview ini terisi otomatis secara realtime.
            </p>
          </div>
        )}

        {!onboarding.complete && (
          <div className="kaffe-panel rounded-2xl p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">Checklist onboarding</p>
                <h2 className="mt-1 font-display text-xl font-extrabold text-slate-900">
                  {onboarding.completedCount}/{onboarding.totalCount} langkah siap dipakai
                </h2>
                <p className="mt-1 text-[13px] font-semibold text-slate-500">
                  Selesaikan setup inti agar toko siap transaksi, stok, dan laporan.
                </p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 md:w-44">
                <div className="h-full rounded-full bg-[#FF6A00]" style={{ width: `${onboarding.progressPercent}%` }} />
              </div>
            </div>
            <div className="kaffe-card-grid mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {onboarding.steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => openTab(step.targetTab)}
                  className={`rounded-xl border p-4 text-left transition-all active:scale-[0.98] ${
                    step.done
                      ? 'border-emerald-100 bg-emerald-50'
                      : 'border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/40'
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className={`text-xs font-black ${step.done ? 'text-emerald-700' : 'text-slate-800'}`}>{step.title}</span>
                    {step.done ? <CheckCircle2 size={18} className="text-emerald-600" /> : <span className="h-4 w-4 rounded-full border-2 border-slate-200" />}
                  </div>
                  <p className="min-h-[34px] text-[11px] font-semibold leading-relaxed text-slate-500">{step.description}</p>
                  <p className={`mt-3 text-[10px] font-black uppercase tracking-wider ${step.done ? 'text-emerald-700' : 'text-[#FF6A00]'}`}>
                    {step.done ? 'Selesai' : step.ctaLabel}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {lowStockItems.length > 0 && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 md:flex md:items-center md:justify-between md:gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-rose-500">
                <AlertTriangle size={20} />
              </div>
              <div>
                <p className="text-sm font-black text-rose-700">Stok kritis perlu dicek</p>
                <p className="mt-1 text-xs font-semibold text-rose-600">
                  {lowStockItems.slice(0, 3).map((item) => `${item.name} ${item.stock} ${item.unit}`).join(' · ')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openTab('warehouse')}
              className="mt-4 w-full rounded-xl bg-rose-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white active:scale-95 md:mt-0 md:w-auto"
            >
              Buka Stok
            </button>
          </div>
        )}

        <div className="kaffe-card-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <DashboardCard
            title="Penjualan Hari Ini"
            value={fRp(salesToday)}
            sub={`${nonVoidTransactions.filter((t: any) => isSameDay(new Date(t.date), now)).length} transaksi`}
            icon={<TrendingUp size={22} />}
            color="#FF6A00"
          />
          <DashboardCard
            title="Penjualan Minggu Ini"
            value={fRp(salesWeek)}
            sub="Live dari transaksi toko"
            icon={<ShoppingCart size={20} />}
            color="#3b82f6"
          />
          <DashboardCard
            title="Penjualan Bulan Ini"
            value={fRp(salesMonth)}
            sub={`${fRp(avgTransaction)} rata-rata transaksi`}
            icon={<Wallet size={20} />}
            color="#10b981"
          />
          <DashboardCard
            title="Kasir Aktif"
            value={activeCashier?.opened_by || 'Belum buka kas'}
            sub={activeCashier ? `Modal ${fRp(activeCashier.amount || 0)}` : 'Belum ada sesi hari ini'}
            icon={<Clock3 size={20} />}
            color="#8b5cf6"
          />
        </div>

        <AIInsightsPage
          storeId={storeId}
          canUseAiInsight={subscriptionAccess.features.ai_insight}
          hasBusinessData={hasAnyBusinessData}
        />

        <div className="kaffe-card-grid grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="kaffe-panel xl:col-span-2 rounded-2xl p-5 md:p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-display text-lg font-extrabold text-slate-800 flex items-center gap-2">
                  <TrendingUp size={20} className="text-[#FF6A00]" />
                  Grafik Penjualan
                </h3>
                <p className="text-[11px] font-semibold text-slate-400 mt-1">Live data transaksi cloud</p>
              </div>
              {syncing && <RefreshCw size={18} className="text-[#FF6A00] animate-spin" />}
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                    tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                  />
                  <Tooltip formatter={(value: number) => [fRp(value), 'Penjualan']} />
                  <Line type="monotone" dataKey="value" stroke="#FF6A00" strokeWidth={3} dot={{ r: 3, fill: '#FF6A00' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="kaffe-panel rounded-2xl p-5 md:p-6">
            <h3 className="font-display text-lg font-extrabold text-slate-800 mb-6 flex items-center gap-2">
              <Wallet size={20} className="text-emerald-500" />
              Metode Bayar
            </h3>
            {paymentData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-slate-400">
                Belum ada transaksi untuk periode ini
              </div>
            ) : (
              <>
                <div className="h-[210px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {paymentData.map((entry, index) => (
                          <Cell key={`${entry.label}-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [fRp(value), 'Nominal']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</span>
                    <span className="text-lg font-black text-slate-800">{fRp(totalRangeRevenue)}</span>
                  </div>
                </div>
                <div className="space-y-3 mt-4">
                  {paymentData.map((p) => (
                    <div key={p.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="text-xs font-semibold text-slate-600">{p.label}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-800">{fRp(p.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="kaffe-card-grid grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="kaffe-panel rounded-2xl p-5 md:p-6">
            <h3 className="font-display text-lg font-extrabold text-slate-800 mb-6 flex items-center gap-2">
              <Package size={20} className="text-[#FF6A00]" />
              Terlaris
            </h3>
            {topProducts.length === 0 ? (
              <p className="text-sm text-slate-400">Belum ada produk terjual pada periode ini.</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, index) => (
                  <div key={product.label} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 font-black text-xs shrink-0">
                        #{index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{product.label}</p>
                        <p className="text-[11px] text-slate-400">{product.value} item terjual</p>
                      </div>
                    </div>
                    <p className="text-sm font-black text-slate-800 shrink-0 ml-3">{fRp(product.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="kaffe-panel rounded-2xl p-5 md:p-6">
            <h3 className="font-display text-lg font-extrabold text-slate-800 mb-6 flex items-center gap-2">
              <AlertTriangle size={20} className="text-rose-500" />
              Peringatan Stok
            </h3>
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-slate-400">Semua stok utama masih aman.</p>
            ) : (
              <div className="space-y-4">
                {lowStockItems.map((item) => {
                  const usage = stockUsageMap.get(item.id);
                  const pct = usage?.percent ?? (item.min_stock > 0 ? Math.min(100, Math.round((item.stock / item.min_stock) * 100)) : 100);
                  return (
                    <div key={item.id} className="space-y-2">
                      <div className="flex justify-between items-end gap-3">
                        <span className="text-xs font-bold text-slate-700">{item.name}</span>
                        <span className="text-[10px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-lg uppercase">
                          {item.stock} {item.unit}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct < 50 ? 'bg-rose-500' : 'bg-amber-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Terpakai {Math.round(usage?.used || 0).toLocaleString('id-ID')} {item.unit} dari total tercatat {Math.round(usage?.baseline || item.stock).toLocaleString('id-ID')} {item.unit}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="kaffe-panel rounded-2xl p-5 md:p-6">
            <h3 className="font-display text-lg font-extrabold text-slate-800 mb-6 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-500" />
              Operasional
            </h3>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-[11px] font-black text-blue-500 uppercase tracking-wider">Revenue Periode</p>
                <p className="text-xl font-black text-slate-800 mt-1">{fRp(totalRangeRevenue)}</p>
              </div>
              <div className="p-4 rounded-lg bg-rose-50 border border-rose-100">
                <p className="text-[11px] font-black text-rose-500 uppercase tracking-wider">Pengeluaran Operasional</p>
                <p className="text-xl font-black text-slate-800 mt-1">{fRp(totalRangeExpenses)}</p>
              </div>
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100">
                <p className="text-[11px] font-black text-emerald-600 uppercase tracking-wider">Nilai Stok Gudang</p>
                <p className="text-xl font-black text-slate-800 mt-1">
                  {fRp(inventory.reduce((sum: number, item: any) => sum + (item.stock || 0) * (item.cost_per_unit || 0), 0))}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
