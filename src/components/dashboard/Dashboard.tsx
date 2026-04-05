/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
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
} from 'lucide-react';
import {
  BarChart,
  Bar,
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

const fRp = (n: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n || 0);

type RangeKey = 'today' | 'week' | 'month';

const COLORS = ['#f97316', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#eab308'];

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
    <div className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {icon}
        </div>
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
      <p className="text-2xl font-black text-slate-800 leading-tight">{value}</p>
      <p className="text-[11px] text-slate-500 font-semibold mt-1">{sub}</p>
    </div>
  );
}

export default function Dashboard() {
  const {
    transactions,
    expenses,
    inventory,
    cashRegister,
    storeSettings,
    loading,
    syncing,
    isOnline,
  } = useStore();
  const [range, setRange] = useState<RangeKey>('today');

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

  const activeCashier = useMemo(() => {
    const todayRegister = cashRegister
      .filter((entry: any) => isSameDay(new Date(entry.date), now))
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return todayRegister[0] || null;
  }, [cashRegister]);

  const totalRangeRevenue = filteredTransactions.reduce((sum: number, trx: any) => sum + (trx.total || 0), 0);
  const totalRangeExpenses = filteredExpenses.reduce((sum: number, exp: any) => sum + (exp.amount || 0), 0);
  const avgTransaction = filteredTransactions.length > 0 ? totalRangeRevenue / filteredTransactions.length : 0;

  if (loading && transactions.length === 0 && inventory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <div className="w-10 h-10 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
        <p className="text-sm font-semibold">Memuat dashboard toko...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 lg:pb-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">Dashboard Overview</h1>
          <p className="text-slate-500 font-medium text-sm md:text-base">
            {storeSettings?.store_name || 'KaffePOS'} · {isOnline ? 'Online' : 'Offline'} {syncing ? '· Syncing...' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
          {[
            { id: 'today', label: 'Hari Ini' },
            { id: 'week', label: '7 Hari' },
            { id: 'month', label: '30 Hari' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setRange(item.id as RangeKey)}
              className={`px-4 py-2 rounded-xl text-xs font-bold ${
                range === item.id ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardCard
          title="Penjualan Hari Ini"
          value={fRp(salesToday)}
          sub={`${nonVoidTransactions.filter((t: any) => isSameDay(new Date(t.date), now)).length} transaksi`}
          icon={<TrendingUp size={20} />}
          color="#f97316"
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-[28px] p-5 md:p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp size={18} className="text-orange-500" />
                Revenue Chart
              </h3>
              <p className="text-xs text-slate-400 mt-1">Update mengikuti perubahan transaksi toko secara realtime</p>
            </div>
            {syncing && <RefreshCw size={16} className="text-orange-500 animate-spin" />}
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
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
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {trendData.map((entry, index) => (
                    <Cell key={`${entry.label}-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-[28px] p-5 md:p-6 border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2">
            <Wallet size={18} className="text-emerald-500" />
            Metode Pembayaran
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white rounded-[28px] p-5 md:p-6 border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2">
            <Package size={18} className="text-orange-500" />
            Produk Terlaris
          </h3>
          {topProducts.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada produk terjual pada periode ini.</p>
          ) : (
            <div className="space-y-3">
              {topProducts.map((product, index) => (
                <div key={product.label} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 font-black text-xs shrink-0">
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

        <div className="bg-white rounded-[28px] p-5 md:p-6 border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2">
            <AlertTriangle size={18} className="text-rose-500" />
            Peringatan Stok
          </h3>
          {lowStockItems.length === 0 ? (
            <p className="text-sm text-slate-400">Semua stok utama masih aman.</p>
          ) : (
            <div className="space-y-4">
              {lowStockItems.map((item) => {
                const pct = item.min_stock > 0 ? Math.min(100, Math.round((item.stock / item.min_stock) * 100)) : 100;
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
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-[28px] p-5 md:p-6 border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2">
            <TrendingUp size={18} className="text-blue-500" />
            Ringkasan Operasional
          </h3>
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
              <p className="text-[11px] font-black text-blue-500 uppercase tracking-wider">Revenue Periode</p>
              <p className="text-xl font-black text-slate-800 mt-1">{fRp(totalRangeRevenue)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100">
              <p className="text-[11px] font-black text-rose-500 uppercase tracking-wider">Pengeluaran Operasional</p>
              <p className="text-xl font-black text-slate-800 mt-1">{fRp(totalRangeExpenses)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
              <p className="text-[11px] font-black text-emerald-600 uppercase tracking-wider">Nilai Stok Gudang</p>
              <p className="text-xl font-black text-slate-800 mt-1">
                {fRp(inventory.reduce((sum: number, item: any) => sum + (item.stock || 0) * (item.cost_per_unit || 0), 0))}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
