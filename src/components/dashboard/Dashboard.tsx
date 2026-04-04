/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react';
import { 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  Package, 
  ShoppingCart, 
  Wallet,
  AlertTriangle,
  Lightbulb,
  Clock,
  ArrowRight
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
  Pie
} from 'recharts';

interface TrendItem {
  label: string;
  value: number;
}

interface MenuRankingItem {
  label: string;
  value: number;
  sub: string;
  rev: number;
}

interface PaymentItem {
  label: string;
  value: number;
  color: string;
}

interface StockItem {
  label: string;
  stock: number;
  unit: string;
  min: number;
  pct: number;
}

interface DashboardData {
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  grossMargin: number;
  avgTrx: number;
  txCount: number;
  trendData: TrendItem[];
  menuRanking: MenuRankingItem[];
  paymentData: PaymentItem[];
  stockData: StockItem[];
  expensesByCategory: { label: string; value: number }[];
  expenseList:any[];
  cashRegister:any[];
  aiInsight: string;
  aiTips: string[];
}

const fRp = (n: number) => 
  new Intl.NumberFormat('id-ID', { 
    style: 'currency', 
    currency: 'IDR', 
    minimumFractionDigits: 0 
  }).format(n || 0);

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulated fetching
    setTimeout(() => {
      const MOCK_DATA = {
        totalRevenue: 25000000,
        totalCogs: 15000000,
        grossProfit: 10000000,
        totalExpenses: 3000000,
        netProfit: 7000000,
        grossMargin: 40,
        avgTrx: 50000,
        txCount: 500,
        trendData: [
          { label: "07:00", value: 1200000 },
          { label: "09:00", value: 1500000 },
          { label: "11:00", value: 1100000 },
          { label: "13:00", value: 1800000 },
          { label: "15:00", value: 2100000 },
          { label: "17:00", value: 2500000 }
        ],
        menuRanking: [
          { label: "Kopi Susu Gula Aren", value: 120, sub: "Rp 2.400.000", rev: 2400000 },
          { label: "Cafe Latte", value: 85, sub: "Rp 2.125.000", rev: 2125000 },
          { label: "Americano", value: 70, sub: "Rp 1.050.000", rev: 1050000 }
        ],
        paymentData: [
          { label: "Tunai", value: 15000000, color: "#f97316" },
          { label: "QRIS", "value": 8000000, color: "#10b981" },
          { label: "Transfer", "value": 2000000, color: "#3b82f6" }
        ],
        stockData: [
          { label: "Biji Kopi House Blend", stock: 5.5, unit: "kg", min: 2, pct: 275 },
          { label: "Susu UHT", stock: 12, unit: "L", min: 24, pct: 50 },
          { label: "Gula Aren Cair", stock: 1.2, unit: "L", min: 2, pct: 60 }
        ],
        expensesByCategory: [
          { label: "Bahan Baku", value: 2000000 },
          { label: "Listrik & Air", value: 500000 },
          { label: "Kebersihan", value: 500000 }
        ],
        expenseList: [
          { date: "2026-04-03T10:00:00Z", description: "Beli Susu UHT 12L", category: "Bahan Baku", cashier: "Admin", amount: 250000 }
        ],
        cashRegister: [
          { date: "2026-04-04T07:00:00Z", opened_by: "Joko", note: "Modal Awal", amount: 500000 }
        ],
        aiInsight: "Penjualan stabil dengan tren meningkat di akhir pekan. Stok Susu UHT berada di zona kritis, segera lakukan pemesanan.",
        aiTips: ["Restock Susu UHT hari ini", "Promosi Menu Americano di jam sepi"]
      };
      setData(MOCK_DATA);
      setLoading(false);
    }, 800);
  }, [], /* eslint-disable-next-line react-hooks/exhaustive-deps */ );

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 lg:pb-6 max-w-7xl mx-auto space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Dashboard Overview</h1>
          <p className="text-slate-500 font-medium">Ringkasan performa bisnis Anda hari ini.</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
          <button className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-lg shadow-slate-900/10">Hari Ini</button>
          <button className="px-4 py-2 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-50">7 Hari</button>
          <button className="px-4 py-2 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-50">30 Hari</button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Total Penjualan" 
          value={fRp(data.totalRevenue)} 
          sub="+12.5% vs kemarin" 
          icon={<TrendingUp className="text-orange-500" size={20} />}
          trend="up"
          color="orange"
        />
        <StatCard 
          label="Total Transaksi" 
          value={data.txCount.toString()} 
          sub="Rerata Rp 50.0k" 
          icon={<ShoppingCart className="text-blue-500" size={20} />}
          trend="up"
          color="blue"
        />
        <StatCard 
          label="Laba Bersih" 
          value={fRp(data.netProfit)} 
          sub={`${data.grossMargin}% Gross Margin`} 
          icon={<Wallet className="text-emerald-500" size={20} />}
          trend="up"
          color="emerald"
        />
        <StatCard 
          label="Biaya Operasional" 
          value={fRp(data.totalExpenses)} 
          sub="3 kategori aktif" 
          icon={<ArrowDownRight className="text-rose-500" size={20} />}
          trend="down"
          color="rose"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend Chart */}
        <div className="lg:col-span-2 bg-white rounded-[32px] p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp size={18} className="text-orange-500" />
              Tren Penjualan
            </h3>
            <span className="text-[10px] font-black bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full uppercase tracking-wider">Per Jam</span>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trendData}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={1} />
                    <stop offset="100%" stopColor="#fb923c" stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                  tickFormatter={(value) => `${value/1000}k`}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: '600' }}
                  formatter={(value: number) => [fRp(value), 'Penjualan']}
                />
                <Bar dataKey="value" fill="url(#barGradient)" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-[32px] p-6 border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Wallet size={18} className="text-emerald-500" />
            Metode Pembayaran
          </h3>
          <div className="h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.paymentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.paymentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</span>
              <span className="text-lg font-black text-slate-800">{fRp(data.totalRevenue)}</span>
            </div>
          </div>
          <div className="space-y-3 mt-6">
            {data.paymentData.map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }}></div>
                  <span className="text-xs font-semibold text-slate-600">{p.label}</span>
                </div>
                <span className="text-xs font-bold text-slate-800">{fRp(p.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="bg-white rounded-[32px] p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Package size={18} className="text-orange-500" />
              Produk Terlaris
            </h3>
            <button className="text-[10px] font-black text-orange-600 uppercase tracking-wider flex items-center gap-1 hover:underline">
              Lihat Semua <ArrowRight size={12} />
            </button>
          </div>
          <div className="space-y-4">
            {data.menuRanking.map((m, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 font-black text-xs">
                    #{i+1}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{m.label}</p>
                    <p className="text-[10px] font-medium text-slate-400">{m.value} terjual</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-800">{m.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock Alerts & AI Insights */}
        <div className="space-y-6">
          {/* Stock Alerts */}
          <div className="bg-white rounded-[32px] p-6 border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <AlertTriangle size={18} className="text-rose-500" />
              Peringatan Stok
            </h3>
            <div className="space-y-4">
              {data.stockData.filter(s => s.pct < 100).map((s, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-slate-700">{s.label}</span>
                    <span className="text-[10px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-lg uppercase">{s.stock} {s.unit}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${s.pct < 50 ? 'bg-rose-500' : 'bg-amber-500'}`} 
                      style={{ width: `${Math.min(s.pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Insight Card */}
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[32px] p-6 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                  <Lightbulb size={20} className="text-amber-300" />
                </div>
                <h3 className="font-bold">KaffeAI Insights</h3>
              </div>
              <p className="text-xs leading-relaxed text-indigo-100 mb-4 font-medium italic">
                "{data.aiInsight}"
              </p>
              <div className="space-y-2">
                {data.aiTips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-[10px] bg-white/10 p-2 rounded-xl border border-white/10">
                    <div className="mt-1 w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  trend: 'up' | 'down';
  color: 'orange' | 'blue' | 'emerald' | 'rose';
}

function StatCard({ label, value, sub, icon, trend, color }: StatCardProps) {
  const colorMap: Record<string, string> = {
    orange: 'bg-orange-50 text-orange-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
  };

  return (
    <div className="bg-white p-5 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl transition-transform group-hover:scale-110 ${colorMap[color]}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg ${trend === 'up' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {trend === 'up' ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
          {trend === 'up' ? '12%' : '5%'}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-black text-slate-800">{value}</p>
        <p className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-1">
          <Clock size={10} /> {sub}
        </p>
      </div>
    </div>
  );
}
