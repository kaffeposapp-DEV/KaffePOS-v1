 
 
 
 
 
 
// src/lib/aiInsight.ts — KaffePOS v6
// Panggil AI via Supabase Edge Function (API key aman di server, tidak expose di APK)
// SECURITY: JANGAN pakai VITE_GEMINI_API_KEY — akan ter-bundle di APK dan bisa dicuri!

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-insight`;

// ── Tipe data untuk konteks analisis ─────────────────────────────
export interface InsightContext {
  period:        string;
  storeName:     string;
  totalRevenue:  number;
  totalCogs:     number;
  netProfit:     number;
  grossMargin:   number;
  txCount:       number;
  avgTrx:        number;
  topMenus:      { name: string; qty: number; revenue: number }[];
  lowStockItems: { name: string; stock: number; unit: string; min: number }[];
  totalExpenses: number;
  trendData:     { label: string; value: number }[];
  paymentMix:    { method: string; pct: number }[];
}

export interface AIInsight {
  summary:    string;
  bestMenu:   string;
  stockAlert: string;
  prediction: string;
  tips:       string[];
  source?:    'gemini' | 'local';
}

// ── Format currency singkat ───────────────────────────────────────
const fRpShort = (n: number): string => {
  if (n >= 1_000_000) return `Rp${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000)     return `Rp${(n / 1_000).toFixed(0)}rb`;
  return `Rp${n}`;
};

// ── Build prompt dari konteks ─────────────────────────────────────
function buildPrompt(ctx: InsightContext): string {
  const topMenuStr = ctx.topMenus
    .slice(0, 5)
    .map(m => `${m.name}(${m.qty}x,${fRpShort(m.revenue)})`)
    .join(', ');

  const lowStockStr = ctx.lowStockItems.length > 0
    ? ctx.lowStockItems.map(i => `${i.name}:${i.stock}${i.unit}(min${i.min})`).join(', ')
    : 'tidak ada';

  const trendStr = ctx.trendData
    .slice(-7)
    .map(t => `${t.label}:${fRpShort(t.value)}`)
    .join(', ');

  const payStr = ctx.paymentMix
    .map(p => `${p.method}:${p.pct}%`)
    .join(', ');

  return `Kamu adalah analis bisnis kafe profesional. Analisis data POS berikut dan berikan insight dalam bahasa Indonesia yang singkat, padat, dan actionable.

DATA KAFE "${ctx.storeName}" — Periode: ${ctx.period}:
- Revenue: ${fRpShort(ctx.totalRevenue)} | HPP: ${fRpShort(ctx.totalCogs)} | Laba: ${fRpShort(ctx.netProfit)} | Margin: ${ctx.grossMargin}%
- Jumlah transaksi: ${ctx.txCount} | Rata-rata transaksi: ${fRpShort(ctx.avgTrx)}
- Pengeluaran ops: ${fRpShort(ctx.totalExpenses)}
- Menu terlaris: ${topMenuStr}
- Stok kritis: ${lowStockStr}
- Tren harian (terbaru): ${trendStr}
- Metode bayar: ${payStr}

Balas HANYA dalam format JSON ini (tanpa markdown, tanpa komentar):
{
  "summary": "Ringkasan performa bisnis 2-3 kalimat. Sebut angka spesifik.",
  "bestMenu": "1 kalimat rekomendasi menu yang harus difokuskan/dioptimalkan.",
  "stockAlert": "1 kalimat tentang stok yang perlu diperhatikan. Jika aman, tulis 'Stok semua bahan dalam kondisi aman.'",
  "prediction": "1 kalimat prediksi pendapatan ${ctx.period === 'Hari Ini' ? 'besok' : ctx.period === 'Minggu Ini' ? 'minggu depan' : 'bulan depan'} berdasarkan tren. Sebutkan estimasi angka.",
  "tips": ["tip actionable 1 maksimal 15 kata", "tip actionable 2 maksimal 15 kata", "tip actionable 3 maksimal 15 kata"]
}`;
}

function createLocalInsight(ctx: InsightContext): AIInsight {
  const bestMenu = ctx.topMenus[0];
  const lowStock = ctx.lowStockItems[0];
  const recentTrend = ctx.trendData.slice(-3);
  const trendAvg = recentTrend.length > 0
    ? Math.round(recentTrend.reduce((sum, item) => sum + item.value, 0) / recentTrend.length)
    : ctx.totalRevenue;
  const nextPeriodLabel = ctx.period === 'Hari Ini'
    ? 'besok'
    : ctx.period === 'Minggu Ini'
    ? 'minggu depan'
    : 'periode berikutnya';

  const summaryParts = [
    `Pendapatan ${ctx.period.toLowerCase()} mencapai ${fRpShort(ctx.totalRevenue)} dari ${ctx.txCount} transaksi, dengan rata-rata ${fRpShort(ctx.avgTrx)} per transaksi.`,
    ctx.netProfit >= 0
      ? `Laba bersih saat ini ${fRpShort(ctx.netProfit)} dengan margin kotor ${ctx.grossMargin}%.`
      : `Posisi laba bersih masih minus ${fRpShort(Math.abs(ctx.netProfit))}; pengeluaran perlu ditekan agar margin membaik.`,
  ];

  const tips = [
    bestMenu
      ? `Dorong penjualan ${bestMenu.name} saat jam ramai.`
      : 'Evaluasi menu yang paling sering dibeli pelanggan.',
    ctx.totalExpenses > ctx.totalRevenue * 0.3
      ? 'Tekan pengeluaran operasional yang tidak mendesak.'
      : 'Jaga ritme operasional agar biaya tetap efisien.',
    lowStock
      ? `Restock ${lowStock.name} sebelum stok habis.`
      : 'Pertahankan stok aman untuk menu paling laku.',
  ];

  return {
    summary: summaryParts.join(' '),
    bestMenu: bestMenu
      ? `${bestMenu.name} adalah menu terkuat saat ini; prioritaskan stok, promosi, dan upselling menu ini.`
      : 'Belum ada menu dominan; cek produk dengan margin terbaik untuk diprioritaskan.',
    stockAlert: lowStock
      ? `${lowStock.name} tinggal ${lowStock.stock} ${lowStock.unit}, mendekati batas minimum ${lowStock.min} ${lowStock.unit}.`
      : 'Stok semua bahan dalam kondisi aman.',
    prediction: `Jika tren saat ini konsisten, pendapatan ${nextPeriodLabel} berpotensi di kisaran ${fRpShort(Math.max(trendAvg, 0))}.`,
    tips,
    source: 'local',
  };
}

function shouldUseLocalFallback(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    'quota',
    'billing',
    'resource exhausted',
    'rate limit',
    '429',
    'timeout',
    'network',
    'failed to fetch',
    'respons ai tidak valid',
  ].some(keyword => normalized.includes(keyword));
}

// ── Panggil via Supabase Edge Function (UTAMA — API key aman) ─────
async function callViaEdgeFunction(prompt: string): Promise<AIInsight> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sesi tidak ditemukan. Silakan login ulang.');
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch(EDGE_FUNCTION_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':        SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Permintaan AI timeout. Menjalankan analisis cadangan.');
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }

  const data = await res.json() as AIInsight & { error?: string };

  if (!res.ok || data.error) {
    throw new Error(data.error || `Edge Function error ${res.status}`);
  }

  return { ...data, source: 'gemini' };
}

// ── Main: getAIInsight dengan auto-fallback ───────────────────────
export async function getAIInsight(ctx: InsightContext): Promise<AIInsight> {
  if (ctx.txCount === 0) {
    return {
      summary:    'Belum ada transaksi pada periode ini untuk dianalisis.',
      bestMenu:   'Tambahkan menu dan mulai transaksi untuk mendapat rekomendasi.',
      stockAlert: 'Pastikan semua bahan baku tersedia sebelum buka.',
      prediction: 'Belum cukup data untuk prediksi.',
      tips: [
        'Mulai catat transaksi setiap hari',
        'Lengkapi resep menu untuk tracking HPP',
        'Aktifkan notifikasi stok kritis',
      ],
      source: 'local',
    };
  }

  const prompt = buildPrompt(ctx);
  try {
    return await callViaEdgeFunction(prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (shouldUseLocalFallback(message)) {
      return createLocalInsight(ctx);
    }
    throw error;
  }
}

// ── Cache 10 menit ────────────────────────────────────────────────
const cache = new Map<string, { data: AIInsight; ts: number }>();
const CACHE_MS = 10 * 60 * 1000;

export async function getAIInsightCached(ctx: InsightContext): Promise<AIInsight> {
  const key = `${ctx.storeName}_${ctx.period}_${ctx.txCount}_${Math.round(ctx.totalRevenue / 1000)}`;
  const hit  = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.data;

  const data = await getAIInsight(ctx);
  cache.set(key, { data, ts: Date.now() });
  return data;
}
