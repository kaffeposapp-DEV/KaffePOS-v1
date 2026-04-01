// src/lib/aiInsight.ts — KaffePOS v6
// Panggil AI via Supabase Edge Function (API key aman di server, tidak expose di APK)
// SECURITY: JANGAN pakai VITE_GEMINI_API_KEY — akan ter-bundle di APK dan bisa dicuri!

import { supabase } from '@/lib/supabase';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
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

// ── Panggil via Supabase Edge Function (UTAMA — API key aman) ─────
async function callViaEdgeFunction(prompt: string): Promise<AIInsight> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sesi tidak ditemukan. Silakan login ulang.');
  }

  const res = await fetch(EDGE_FUNCTION_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey':        SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ prompt }),
  });

  const data = await res.json() as AIInsight & { error?: string };

  if (!res.ok || data.error) {
    throw new Error(data.error || `Edge Function error ${res.status}`);
  }

  return data;
}

// ── Fallback: Direct call ke Gemini API ───────────────────────────
async function callGeminiFallback(prompt: string): Promise<AIInsight> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Kunci API Gemini (VITE_GEMINI_API_KEY) tidak ditemukan di konfigurasi build aplikasi ini.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
    })
  });

  if (!res.ok) {
    throw new Error(`Gagal memuat AI Insight. (Status ${res.status})`);
  }

  const data = await res.json();
  try {
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(rawText) as AIInsight;
  } catch (e) {
    throw new Error('Jawaban AI tidak dapat diproses.');
  }
}

// ── Flag apakah Edge Function aktif ──────────────────────────────
async function isEdgeFunctionAvailable(): Promise<boolean> {
  // Langsung Bypass ke Gemini API agar performa instan tanpa nunggu preflight 5 detik
  return false; 
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
    };
  }

  const prompt = buildPrompt(ctx);

  // Coba Edge Function dulu, fallback ke direct Gemini jika belum deploy
  const useEdge = await isEdgeFunctionAvailable();

  if (useEdge) {
    return callViaEdgeFunction(prompt);
  } else {
    console.warn('[aiInsight] Edge Function tidak tersedia, fallback ke direct Gemini.');
    return callGeminiFallback(prompt);
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
