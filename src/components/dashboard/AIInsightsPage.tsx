import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Brain,
  Clock3,
  Lock,
  Package,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getEnhancedAiInsights,
  type EnhancedAiInsightCard,
  type EnhancedAiInsightsResponse,
  type EnhancedAiInsightType,
} from '@/lib/backendApi';
import { normalizeUserFacingError } from '@/lib/errorMessages';
import { dispatchUpgradePrompt } from '@/lib/upgradePrompts';
import { dispatchCelebrationOnce, isCelebrationSoundEnabled } from '@/lib/celebration';

const fRp = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value || 0);

const TYPE_META: Record<EnhancedAiInsightType, { label: string; icon: typeof TrendingUp }> = {
  sales_trend: { label: 'Sales Trend', icon: TrendingUp },
  menu_optimization: { label: 'Menu Optimization', icon: BarChart3 },
  staff_performance: { label: 'Staff Performance', icon: Users },
  stock_waste: { label: 'Stock & Waste', icon: Package },
  peak_hour: { label: 'Peak Hour', icon: Clock3 },
};

type Props = {
  storeId: string | null;
  canUseAiInsight: boolean;
  hasBusinessData: boolean;
};

export function InsightCard({ insight }: { insight: EnhancedAiInsightCard }) {
  const meta = TYPE_META[insight.type] ?? TYPE_META.sales_trend;
  const Icon = meta.icon;

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-100 hover:shadow-[var(--brand-panel-shadow-hover)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6A00]">{meta.label}</p>
            <h4 className="mt-1 line-clamp-2 text-sm font-black leading-tight text-slate-900">{insight.title}</h4>
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-500 ring-1 ring-slate-100">
          {insight.confidence}%
        </div>
      </div>
      <p className="text-xs font-semibold leading-relaxed text-slate-500">{insight.description}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-orange-50 px-3 py-2 ring-1 ring-orange-100">
          <p className="text-[9px] font-black uppercase tracking-widest text-orange-600">{insight.metricLabel}</p>
          <p className="mt-1 truncate text-sm font-black text-slate-900">{insight.metricValue}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Impact</p>
          <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-tight text-slate-700">{insight.impact}</p>
        </div>
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="kaffe-panel rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
          <RefreshCw size={20} className="animate-spin" />
        </div>
        <div>
          <p className="text-sm font-black text-slate-900">Membaca pola outlet...</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">AI Insights sedang menyiapkan score, recommendations, dan chart.</p>
        </div>
      </div>
    </div>
  );
}

function LockedState({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <section className="kaffe-panel rounded-2xl p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
            <Lock size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-[#FF6A00]">AI Insights</p>
            <h3 className="mt-1 font-display text-xl font-extrabold text-slate-900">Upgrade to Signature to unlock full AI Insights</h3>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
              Buka Kopi Score, menu optimization, peak hour recommendations, staff performance, dan stock suggestions dalam satu dashboard premium.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onUpgrade}
          className="kaffe-gradient-button inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-xs font-black uppercase tracking-wider text-white transition-all active:scale-95"
        >
          <Sparkles size={16} />
          Lihat Signature
        </button>
      </div>
    </section>
  );
}

export default function AIInsightsPage({ storeId, canUseAiInsight, hasBusinessData }: Props) {
  const [data, setData] = useState<EnhancedAiInsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const openUpgrade = useCallback(() => {
    dispatchUpgradePrompt({
      trigger: 'ai_insight',
      promptKey: 'feature:ai_insight_dashboard',
      recommendedPlan: 'signature',
      title: 'AI Insights lengkap ada di paket Signature',
      description: 'Upgrade untuk membuka Kopi Score, rekomendasi operasional, peak hour, staff performance, menu optimization, dan stock suggestions.',
    });
  }, []);

  const loadInsights = useCallback(async (refresh = false) => {
    if (!storeId || !canUseAiInsight) return;
    setError('');
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await getEnhancedAiInsights(storeId, { refresh });
      setData(response);
    } catch (err) {
      setError(normalizeUserFacingError(err, 'AI Insights belum bisa dimuat. Coba refresh lagi.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canUseAiInsight, storeId]);

  useEffect(() => {
    if (!canUseAiInsight || !storeId || !hasBusinessData) return;
    void loadInsights(false);
  }, [canUseAiInsight, hasBusinessData, loadInsights, storeId]);

  const scoreColor = useMemo(() => {
    const score = data?.kopiScore.score ?? 0;
    if (score >= 85) return '#10b981';
    if (score >= 70) return '#FF6A00';
    if (score >= 55) return '#f59e0b';
    return '#ef4444';
  }, [data?.kopiScore.score]);

  useEffect(() => {
    if (!data?.kopiScore.score || !storeId) return;
    const score = data.kopiScore.score;
    const milestone = score >= 90 ? 90 : score >= 80 ? 80 : null;
    if (!milestone) return;
    const dayKey = new Date().toISOString().slice(0, 10);
    dispatchCelebrationOnce(`kopi-score:${storeId}:${milestone}:${dayKey}`, {
      kind: 'score',
      title: `Kopi Score ${milestone}+`,
      message: `${data.storeName} mencapai score ${score}. ${data.kopiScore.label}.`,
      sound: isCelebrationSoundEnabled(),
    });
  }, [data?.kopiScore.label, data?.kopiScore.score, data?.storeName, storeId]);

  if (!canUseAiInsight) {
    return <LockedState onUpgrade={openUpgrade} />;
  }

  if (!hasBusinessData) {
    return (
      <section className="kaffe-panel rounded-2xl p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
            <Brain size={21} />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900">AI Insights siap setelah ada data</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
              Lakukan beberapa transaksi dan isi stok/menu agar rekomendasi bisa lebih akurat.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (loading && !data) return <LoadingState />;

  return (
    <section className="kaffe-panel rounded-2xl p-5 md:p-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#FF6A00]">
            <Brain size={13} />
            AI Insights
          </div>
          <h2 className="font-display text-xl font-extrabold text-slate-900">Kopi Score & Recommendations</h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
            {data?.summary || 'Insight premium untuk trend sales, menu, staff, stock, dan peak hour.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadInsights(true)}
          disabled={!storeId || refreshing}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-orange-100 bg-white px-4 text-xs font-black uppercase tracking-wider text-[#FF6A00] shadow-sm transition-all active:scale-95 hover:bg-orange-50 disabled:opacity-60"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Refresh Insights
        </button>
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {error}
        </div>
      ) : null}

      {data ? (
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
            <div className="relative overflow-hidden rounded-2xl border border-orange-100 bg-orange-50/70 p-5">
              <div className="absolute -right-14 -top-14 h-36 w-36 rounded-full bg-white/60" />
              <div className="relative">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Overall Kopi Score</p>
                <div className="mt-5 flex items-center gap-5">
                  <div
                    className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full p-2 shadow-sm"
                    style={{ background: `conic-gradient(${scoreColor} ${data.kopiScore.score * 3.6}deg, #ffffff ${data.kopiScore.score * 3.6}deg)` }}
                  >
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-white">
                      <span className="font-display text-4xl font-extrabold leading-none text-slate-900">{data.kopiScore.score}</span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-black uppercase tracking-wider" style={{ color: scoreColor }}>{data.kopiScore.label}</span>
                    <p className="mt-2 text-xs font-semibold leading-relaxed text-orange-950">{data.kopiScore.explanation}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white ring-1 ring-orange-100">
                <div className="kaffe-progress-bar h-full rounded-full transition-all duration-700" style={{ width: `${data.kopiScore.score}%`, backgroundColor: scoreColor }} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.kopiScore.drivers.map((driver) => (
                  <span key={driver} className="rounded-full bg-white px-3 py-1 text-[10px] font-black text-orange-700 ring-1 ring-orange-100">
                    {driver}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Sales Trend</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.charts.salesTrend}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} />
                      <YAxis hide />
                      <Tooltip formatter={(value: number) => [fRp(value), 'Revenue']} />
                      <Line type="monotone" dataKey="value" stroke="#FF6A00" strokeWidth={3} dot={{ r: 3, fill: '#FF6A00' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Peak Hour</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.charts.peakHours}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 700 }} />
                      <YAxis hide />
                      <Tooltip formatter={(value: number) => [fRp(value), 'Revenue']} />
                      <Bar dataKey="revenue" fill="#FF6A00" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
                <Sparkles size={17} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Actionable Recommendations</p>
                <p className="text-[11px] font-semibold text-slate-500">Simple actions dengan estimated impact.</p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {data.recommendations.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-slate-900">{item.title}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${
                      item.priority === 'high' ? 'bg-orange-100 text-orange-700' : item.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {item.priority}
                    </span>
                  </div>
                  <p className="text-xs font-semibold leading-relaxed text-slate-600">{item.action}</p>
                  <p className="mt-3 text-[11px] font-black uppercase tracking-wider text-[#FF6A00]">{item.impact}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <span>{data.dataCoverage.transactions} transaksi</span>
            <span>•</span>
            <span>{data.dataCoverage.days} hari</span>
            <span>•</span>
            <span>{data.fromCache ? 'Cached 24h' : 'Fresh insight'}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <AlertTriangle size={28} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-black text-slate-800">Insight belum tersedia</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Klik refresh setelah transaksi, menu, dan stok sudah tersinkron.</p>
        </div>
      )}
    </section>
  );
}
