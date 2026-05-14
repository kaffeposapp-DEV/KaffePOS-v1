/**
 * Misc routes: AI insights, ops events, local storage import, notifications.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  pool,
  withTransaction,
  ApiError,
  requirePermission,
  env,
  opsEventSchema,
  aiInsightRequestSchema,
  aiInsightResponseSchema,
  localStorageImportSchema,
  mapGeminiError,
  getAiLimitWindow,
  parseGeminiText,
  pickDefined,
  buildUpdateClause,
  insertNotification,
  adminEmails,
  sendFeedbackThankYouEmail,
  log,
  serializeError,
} from '../core';
import type { PoolClient } from '../core/db';

const router = Router();

type InsightType = 'sales_trend' | 'menu_optimization' | 'staff_performance' | 'stock_waste' | 'peak_hour';

const notificationCategorySchema = z.enum(['gamification', 'challenges', 'business_alert', 'stock', 'system']).optional();
const markNotificationsReadSchema = z.object({
  ids: z.array(z.string().uuid()).max(100).optional(),
  storeId: z.string().uuid().optional(),
});
const pushSubscriptionSchema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  channel: z.enum(['web_push', 'capacitor_android']),
  endpoint: z.string().trim().min(8).max(2000),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  platform: z.string().trim().max(80).optional().nullable(),
});
const betaFeedbackSchema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  category: z.enum(['Bug', 'Saran', 'Fitur Baru', 'Lainnya']).optional().default('Lainnya'),
  description: z.string().trim().max(2400).optional().default(''),
  screenshot_data: z.string().trim().max(750_000).optional().nullable(),
  liked: z.string().trim().max(1200).optional().default(''),
  improve: z.string().trim().max(1200).optional().default(''),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
}).refine((value) => value.description.length > 0 || value.liked.length > 0 || value.improve.length > 0, {
  message: 'Feedback tidak boleh kosong.',
});

async function assertStoreOwned(client: Pick<PoolClient, 'query'>, storeId: string, userId: string) {
  const result = await client.query(
    `select id from public.stores where id = $1 and owner_id = $2 limit 1`,
    [storeId, userId],
  );
  if (!result.rows[0]) {
    throw new ApiError(404, 'Store tidak ditemukan atau bukan milik Anda.');
  }
}

async function assertNotificationStoreAccess(client: Pick<PoolClient, 'query'>, storeId: string, userId: string) {
  const result = await client.query(
    `
      select s.id
      from public.stores s
      where s.id = $1
        and (
          s.owner_id = $2
          or exists (
            select 1
            from public.cashier_outlet_assignments a
            join public.profiles p on p.id = a.cashier_id
            where a.store_id = s.id
              and a.cashier_id = $2
              and a.status = 'active'
              and p.role = 'cashier'
              and p.account_status = 'active'
          )
        )
      limit 1
    `,
    [storeId, userId],
  );
  if (!result.rows[0]) {
    throw new ApiError(404, 'Store tidak ditemukan atau bukan akses Anda.');
  }
}

async function countRowsForStore(client: PoolClient, table: string, storeId: string) {
  const result = await client.query(`select count(*)::int as count from public.${table} where store_id = $1`, [storeId]);
  return result.rows[0]?.count ?? 0;
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return 0;
}

function isSignaturePlan(profile: Record<string, unknown> | null | undefined) {
  if (!profile) return false;
  const expiresAt = profile.pro_expires_at ?? profile.tier_expires_at ?? null;
  const expired = expiresAt ? new Date(String(expiresAt)).getTime() <= Date.now() : false;
  if (expired || (profile.tier !== 'pro' && profile.is_pro !== true)) return false;
  return profile.pro_plan === 'signature' || profile.pro_plan === 'secangkir' || profile.pro_plan === 'founder';
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function formatHourRange(hour: number) {
  const end = Math.min(hour + 2, 24);
  return `${String(hour).padStart(2, '0')}:00-${String(end).padStart(2, '0')}:00`;
}

function extractItems(row: Record<string, unknown>): Array<Record<string, unknown>> {
  const items = row.items;
  if (Array.isArray(items)) return items as Array<Record<string, unknown>>;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function pctChange(current: number, previous: number) {
  if (previous <= 0 && current > 0) return 100;
  if (previous <= 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

function buildEnhancedAiInsights(input: {
  storeId: string;
  storeName: string;
  transactions: Record<string, unknown>[];
  inventory: Record<string, unknown>[];
  menu: Record<string, unknown>[];
}) {
  const now = new Date();
  const today = startOfDay(now);
  const last14Start = new Date(today);
  last14Start.setDate(last14Start.getDate() - 13);
  const previous14Start = new Date(last14Start);
  previous14Start.setDate(previous14Start.getDate() - 14);

  const transactions = input.transactions
    .filter((row) => row.is_void !== true)
    .map((row) => ({
      ...row,
      total: toNumber(row.total),
      subtotal: toNumber(row.subtotal),
      discount: toNumber(row.discount),
      dateValue: new Date(String(row.date ?? row.created_at ?? new Date().toISOString())),
      itemsValue: extractItems(row),
      cashierName: String(row.cashier || 'Kasir'),
    }));

  const recent = transactions.filter((row) => row.dateValue >= last14Start);
  const previous = transactions.filter((row) => row.dateValue >= previous14Start && row.dateValue < last14Start);
  const recentRevenue = recent.reduce((sum, row) => sum + row.total, 0);
  const previousRevenue = previous.reduce((sum, row) => sum + row.total, 0);
  const revenueTrendPct = pctChange(recentRevenue, previousRevenue);
  const avgTicket = recent.length > 0 ? Math.round(recentRevenue / recent.length) : 0;

  const trendMap = new Map<string, number>();
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    trendMap.set(date.toISOString().slice(0, 10), 0);
  }
  recent.forEach((row) => {
    const key = row.dateValue.toISOString().slice(0, 10);
    if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + row.total);
  });
  const salesTrend = [...trendMap.entries()].map(([date, value]) => ({
    label: new Date(date).toLocaleDateString('id-ID', { weekday: 'short' }).slice(0, 3),
    value,
  }));

  const menuMap = new Map<string, { qty: number; revenue: number }>();
  recent.forEach((row) => {
    row.itemsValue.forEach((item) => {
      const name = String(item.name || item.menu_name || 'Menu');
      const current = menuMap.get(name) ?? { qty: 0, revenue: 0 };
      menuMap.set(name, {
        qty: current.qty + toNumber(item.qty),
        revenue: current.revenue + toNumber(item.subtotal || toNumber(item.price) * toNumber(item.qty)),
      });
    });
  });
  const menuPerformance = [...menuMap.entries()]
    .map(([label, data]) => ({ label, qty: data.qty, revenue: data.revenue }))
    .sort((a, b) => b.revenue - a.revenue);
  const bestMenu = menuPerformance[0] ?? null;
  const slowMenu = menuPerformance.length > 2 ? menuPerformance[menuPerformance.length - 1] : null;

  const hourMap = new Map<number, { transactions: number; revenue: number }>();
  recent.forEach((row) => {
    const hour = Math.floor(row.dateValue.getHours() / 2) * 2;
    const current = hourMap.get(hour) ?? { transactions: 0, revenue: 0 };
    hourMap.set(hour, { transactions: current.transactions + 1, revenue: current.revenue + row.total });
  });
  const peakHours = [...hourMap.entries()]
    .map(([hour, data]) => ({ label: formatHourRange(hour), hour, ...data }))
    .sort((a, b) => b.revenue - a.revenue);
  const bestHour = peakHours[0] ?? null;

  const staffMap = new Map<string, { transactions: number; revenue: number; multiItem: number; items: number }>();
  recent.forEach((row) => {
    const qty = row.itemsValue.reduce((sum, item) => sum + toNumber(item.qty), 0);
    const current = staffMap.get(row.cashierName) ?? { transactions: 0, revenue: 0, multiItem: 0, items: 0 };
    staffMap.set(row.cashierName, {
      transactions: current.transactions + 1,
      revenue: current.revenue + row.total,
      multiItem: current.multiItem + (qty > 1 ? 1 : 0),
      items: current.items + qty,
    });
  });
  const staffPerformance = [...staffMap.entries()]
    .map(([label, data]) => ({
      label,
      transactions: data.transactions,
      revenue: data.revenue,
      upsellRate: data.transactions > 0 ? Math.round((data.multiItem / data.transactions) * 100) : 0,
      avgItems: data.transactions > 0 ? Number((data.items / data.transactions).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.upsellRate - a.upsellRate || b.revenue - a.revenue);
  const bestStaff = staffPerformance[0] ?? null;

  const lowStock = input.inventory
    .filter((item) => toNumber(item.stock) <= toNumber(item.min_stock))
    .map((item) => ({
      label: String(item.name || 'Stok'),
      stock: toNumber(item.stock),
      minStock: toNumber(item.min_stock),
      unit: String(item.unit || ''),
      risk: toNumber(item.min_stock) > 0 ? Math.round((toNumber(item.stock) / toNumber(item.min_stock)) * 100) : 0,
    }))
    .sort((a, b) => a.risk - b.risk)
    .slice(0, 5);

  const insights: Array<{
    id: string;
    type: InsightType;
    title: string;
    description: string;
    impact: string;
    confidence: number;
    metricLabel: string;
    metricValue: string;
  }> = [];

  insights.push({
    id: 'sales-trend',
    type: 'sales_trend',
    title: revenueTrendPct >= 0 ? 'Sales trend naik' : 'Sales trend perlu dijaga',
    description: revenueTrendPct >= 0
      ? `Revenue 14 hari terakhir naik ${revenueTrendPct}% dibanding periode sebelumnya. Pertahankan promo dan jam ramai yang sudah bekerja.`
      : `Revenue 14 hari terakhir turun ${Math.abs(revenueTrendPct)}%. Fokuskan promo ke menu terlaris dan jam paling ramai.`,
    impact: revenueTrendPct >= 0 ? 'Potensi menjaga momentum +8-12% revenue' : 'Potensi recovery +10-15% revenue',
    confidence: recent.length >= 20 ? 86 : 68,
    metricLabel: '14 hari',
    metricValue: `${revenueTrendPct >= 0 ? '+' : ''}${revenueTrendPct}%`,
  });

  if (bestMenu) {
    insights.push({
      id: 'menu-optimization',
      type: 'menu_optimization',
      title: `${bestMenu.label} jadi menu anchor`,
      description: `${bestMenu.label} menyumbang ${new Intl.NumberFormat('id-ID').format(bestMenu.qty)} item terjual. Letakkan di tombol atas dan jadikan bundling dengan modifier bernilai tinggi.`,
      impact: 'Estimated impact +12-18% revenue',
      confidence: bestMenu.qty >= 10 ? 88 : 70,
      metricLabel: 'Revenue menu',
      metricValue: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(bestMenu.revenue),
    });
  }

  if (bestHour) {
    insights.push({
      id: 'peak-hour',
      type: 'peak_hour',
      title: `Peak hour ${bestHour.label}`,
      description: `Jam terbaik outlet ada di ${bestHour.label}. Tambahkan promo ringan atau highlight add-on pada window ini saat traffic sedang hangat.`,
      impact: 'Potential lift +7-14% pada jam ramai',
      confidence: bestHour.transactions >= 8 ? 84 : 66,
      metricLabel: 'Transaksi',
      metricValue: `${bestHour.transactions}`,
    });
  }

  if (bestStaff && staffPerformance.length > 1) {
    insights.push({
      id: 'staff-performance',
      type: 'staff_performance',
      title: `${bestStaff.label} paling kuat upsell`,
      description: `${bestStaff.label} punya upsell rate ${bestStaff.upsellRate}%. Jadikan trainer singkat untuk script add-on dan rekomendasi menu di kasir.`,
      impact: 'Potential +5-10% average ticket',
      confidence: bestStaff.transactions >= 8 ? 82 : 64,
      metricLabel: 'Upsell rate',
      metricValue: `${bestStaff.upsellRate}%`,
    });
  }

  if (lowStock.length > 0) {
    insights.push({
      id: 'stock-waste',
      type: 'stock_waste',
      title: `${lowStock[0].label} perlu restock`,
      description: `${lowStock[0].label} sudah di bawah minimum. Prioritaskan restock bahan menu terlaris agar tidak kehilangan sales saat peak hour.`,
      impact: 'Mengurangi risiko lost sales hari ini',
      confidence: 90,
      metricLabel: 'Sisa stok',
      metricValue: `${lowStock[0].stock} ${lowStock[0].unit}`.trim(),
    });
  }

  const recommendations = [
    bestMenu ? {
      id: 'move-top-menu',
      type: 'menu_optimization' as InsightType,
      priority: 'high',
      title: `Move ${bestMenu.label} to top button`,
      action: `Pindahkan ${bestMenu.label} ke tombol paling atas dan pasangkan dengan add-on paling relevan.`,
      impact: 'Potential +18% revenue',
    } : null,
    bestHour ? {
      id: 'peak-promo',
      type: 'peak_hour' as InsightType,
      priority: 'high',
      title: `Promo ringan di ${bestHour.label}`,
      action: `Buat promo add-on atau bundle kecil pada ${bestHour.label}, bukan diskon besar sepanjang hari.`,
      impact: 'Potential +7-14% revenue saat peak hour',
    } : null,
    bestStaff && staffPerformance.length > 1 ? {
      id: 'staff-trainer',
      type: 'staff_performance' as InsightType,
      priority: 'medium',
      title: `${bestStaff.label} sebagai trainer upsell`,
      action: `Minta ${bestStaff.label} share script rekomendasi add-on ke staff lain selama briefing 10 menit.`,
      impact: 'Potential +5-10% average ticket',
    } : null,
    lowStock.length > 0 ? {
      id: 'stock-restock',
      type: 'stock_waste' as InsightType,
      priority: 'high',
      title: `Restock ${lowStock[0].label}`,
      action: `Restock ${lowStock[0].label} sebelum peak hour agar menu utama tidak kosong.`,
      impact: 'Mengurangi lost sales dan void akibat stok kosong',
    } : null,
    slowMenu ? {
      id: 'slow-menu',
      type: 'menu_optimization' as InsightType,
      priority: 'low',
      title: `Review ${slowMenu.label}`,
      action: `Uji foto, nama, atau posisi ${slowMenu.label}. Jika tetap rendah, pertimbangkan seasonal menu.`,
      impact: 'Kurangi menu clutter dan waste bahan',
    } : null,
  ].filter(Boolean).slice(0, 5);

  const stockPenalty = Math.min(20, lowStock.length * 4);
  const trendScore = Math.max(-12, Math.min(15, Math.round(revenueTrendPct / 3)));
  const dataScore = recent.length >= 30 ? 10 : recent.length >= 10 ? 5 : -5;
  const staffScore = bestStaff && bestStaff.upsellRate >= 40 ? 5 : 0;
  const kopiScore = Math.max(30, Math.min(98, 70 + trendScore + dataScore + staffScore - stockPenalty));

  return {
    storeId: input.storeId,
    storeName: input.storeName,
    generatedAt: now.toISOString(),
    cachedUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    fromCache: false,
    kopiScore: {
      score: kopiScore,
      label: kopiScore >= 85 ? 'Excellent' : kopiScore >= 72 ? 'Healthy' : kopiScore >= 60 ? 'Needs Focus' : 'At Risk',
      explanation: `${input.storeName} punya score ${kopiScore}/100 berdasarkan sales trend, menu mix, staff upsell, peak hour, dan risiko stok.`,
      drivers: [
        `Sales trend ${revenueTrendPct >= 0 ? '+' : ''}${revenueTrendPct}%`,
        `${recent.length} transaksi dianalisis`,
        lowStock.length > 0 ? `${lowStock.length} stok perlu perhatian` : 'Stok utama aman',
      ],
    },
    summary: recent.length === 0
      ? 'Belum cukup transaksi untuk analisis penuh. Mulai dari transaksi hari ini, lalu refresh insight setelah data masuk.'
      : `AI Insights membaca ${recent.length} transaksi terakhir. Fokus utama: ${bestMenu?.label || 'menu mix'}, ${bestHour?.label || 'peak hour'}, dan ${lowStock[0]?.label || 'stock health'}.`,
    insights: insights.slice(0, 5),
    recommendations,
    charts: {
      salesTrend,
      peakHours: peakHours.slice(0, 6).map(({ label, transactions: count, revenue }) => ({ label, transactions: count, revenue })),
      menuPerformance: menuPerformance.slice(0, 6),
      staffPerformance: staffPerformance.slice(0, 6),
    },
    dataCoverage: {
      transactions: recent.length,
      days: 14,
      menuItems: input.menu.length,
      inventoryItems: input.inventory.length,
    },
  };
}

router.post('/api/ops/events', async (req, res, next) => {
  try {
    const payload = opsEventSchema.parse(req.body);

    if (payload.store_id) {
      await withTransaction(async (client) => {
        await assertStoreOwned(client, payload.store_id!, req.authUser!.id);
      });
    }

    await pool.query(
      `
        insert into public.ops_event_logs (
          event_name,
          status,
          actor_user_id,
          actor_email,
          store_id,
          transaction_id,
          source,
          error_message,
          metadata,
          ip_address,
          user_agent
        ) values (
          $1, $2, $3, $4, $5, $6, 'app', $7, $8::jsonb, $9, $10
        )
      `,
      [
        payload.event_name,
        payload.status,
        req.authUser!.id,
        payload.email ?? req.authUser!.email ?? null,
        payload.store_id ?? null,
        payload.transaction_id ?? null,
        payload.error_message ?? null,
        JSON.stringify(payload.metadata ?? {}),
        req.ip,
        req.get('user-agent') ?? null,
      ],
    );

    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/api/ai-insight', requirePermission('can_view_reports'), async (req, res, next) => {
  try {
    if (!env.GEMINI_API_KEY) {
      throw new ApiError(502, 'GEMINI_API_KEY belum dikonfigurasi di backend.');
    }

    const payload = aiInsightRequestSchema.parse(req.body);
    const now = new Date();

    const profileResult = await pool.query(
      `
        select is_pro, tier
        from public.profiles
        where id = $1
        limit 1
      `,
      [req.authUser!.id],
    );

    const profile = profileResult.rows[0];
    const isPro = profile?.is_pro === true || profile?.tier === 'pro';
    const limitWindow = getAiLimitWindow(isPro, now);
    const usageResult = await pool.query(
      `
        select count(*)::int as usage_count
        from public.ai_insight_logs
        where user_id = $1
          and created_at >= $2::timestamptz
      `,
      [req.authUser!.id, limitWindow.startsAt],
    );

    const usageCount = usageResult.rows[0]?.usage_count ?? 0;
    if (usageCount >= limitWindow.limitMax) {
      throw new ApiError(
        429,
        `Batas analisis AI tercapai (${limitWindow.limitLabel}). ${limitWindow.resetMessage}`,
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`;

    let geminiResponse: globalThis.Response;
    try {
      geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: payload.prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 600,
            responseMimeType: 'application/json',
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('abort')) {
        throw new ApiError(502, 'Layanan AI timeout. Sistem akan memakai analisis cadangan.');
      }

      throw new ApiError(502, 'Layanan AI sedang tidak tersedia. Sistem akan memakai analisis cadangan.');
    } finally {
      clearTimeout(timeoutId);
    }

    if (!geminiResponse.ok) {
      const errorPayload = (await geminiResponse.json().catch(() => ({}))) as { error?: { message?: string } };
      const message = errorPayload.error?.message ?? `Gemini error ${geminiResponse.status}`;
      throw new ApiError(502, mapGeminiError(geminiResponse.status, message));
    }

    const geminiPayload = await geminiResponse.json();
    let insight;
    try {
      insight = parseGeminiText(geminiPayload);
    } catch {
      throw new ApiError(502, 'Respons AI tidak valid. Coba lagi.');
    }

    await pool.query(
      `
        insert into public.ai_insight_logs (user_id, created_at)
        values ($1, $2)
      `,
      [req.authUser!.id, now.toISOString()],
    );

    res.json(insight);
  } catch (error) {
    next(error);
  }
});

router.get('/api/ai-insights', requirePermission('can_view_reports'), async (req, res, next) => {
  try {
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : '';
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    if (!storeId) {
      throw new ApiError(400, 'storeId wajib diisi.');
    }

    await assertStoreOwned(pool, storeId, req.authUser!.id);

    const profileResult = await pool.query(
      `
        select tier, tier_expires_at, is_pro, pro_plan, pro_expires_at
        from public.profiles
        where id = $1
        limit 1
      `,
      [req.authUser!.id],
    );

    if (!isSignaturePlan(profileResult.rows[0])) {
      throw new ApiError(403, 'AI Insights lengkap tersedia mulai paket Signature.');
    }

    if (!forceRefresh) {
      const cacheResult = await pool.query(
        `
          select payload, generated_at, expires_at
          from public.ai_insights_cache
          where store_id = $1
            and expires_at > now()
          limit 1
        `,
        [storeId],
      );
      const cached = cacheResult.rows[0];
      if (cached?.payload) {
        res.json({
          ...(cached.payload as Record<string, unknown>),
          fromCache: true,
          generatedAt: cached.generated_at,
          cachedUntil: cached.expires_at,
        });
        return;
      }
    }

    const [storeResult, transactionsResult, inventoryResult, menuResult] = await Promise.all([
      pool.query(
        `select id, store_name from public.stores where id = $1 and owner_id = $2 limit 1`,
        [storeId, req.authUser!.id],
      ),
      pool.query(
        `
          select id, date, items, subtotal, discount, total, cashier, is_void, created_at
          from public.transactions
          where store_id = $1
            and coalesce(is_void, false) = false
            and date >= now() - interval '60 days'
          order by date desc
          limit 1200
        `,
        [storeId],
      ),
      pool.query(
        `
          select id, name, stock, unit, min_stock, cost_per_unit, is_active
          from public.inventory
          where store_id = $1
            and coalesce(is_active, true) = true
          order by name asc
        `,
        [storeId],
      ),
      pool.query(
        `
          select id, name, price, category, is_available
          from public.menu_items
          where store_id = $1
          order by sort_order asc, name asc
        `,
        [storeId],
      ),
    ]);

    const insight = buildEnhancedAiInsights({
      storeId,
      storeName: storeResult.rows[0]?.store_name ?? 'KaffePOS',
      transactions: transactionsResult.rows,
      inventory: inventoryResult.rows,
      menu: menuResult.rows,
    });

    await pool.query(
      `
        insert into public.ai_insights_cache (
          store_id,
          generated_by,
          payload,
          generated_at,
          expires_at,
          updated_at
        ) values ($1, $2, $3::jsonb, now(), now() + interval '24 hours', now())
        on conflict (store_id) do update
        set
          generated_by = excluded.generated_by,
          payload = excluded.payload,
          generated_at = excluded.generated_at,
          expires_at = excluded.expires_at,
          updated_at = now()
      `,
      [storeId, req.authUser!.id, JSON.stringify(insight)],
    );

    res.json(insight);
  } catch (error) {
    next(error);
  }
});

router.post('/api/import/local-storage', requirePermission('can_manage_settings'), async (req, res, next) => {
  try {
    const payload = localStorageImportSchema.parse(req.body);

    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);

      const summary = {
        success: true,
        migrated: [] as string[],
        errors: [] as string[],
        skipped: [] as string[],
      };

      if (payload.store_settings) {
        const storeFields = pickDefined(payload.store_settings, [
          'store_name',
          'address',
          'whatsapp',
          'tax_percent',
          'receipt_header',
          'receipt_footer',
          'logo_url',
          'logo_base64',
          'logo_position',
          'logo_size',
          'show_logo_on_receipt',
          'currency',
          'tagline',
          'email',
          'website',
          'paper_width',
          'receipt_font_size',
          'receipt_show_address',
          'receipt_show_whatsapp',
          'receipt_show_tax',
          'receipt_show_cashier',
          'receipt_show_trx_id',
          'receipt_divider',
          'receipt_custom_line1',
          'receipt_custom_line2',
          'timezone',
        ]);
        if (Object.keys(storeFields).length > 0) {
          const { clause, values } = buildUpdateClause(storeFields);
          await client.query(
            `
              update public.stores
              set ${clause}, updated_at = now()
              where id = $${values.length + 1}
            `,
            [...values, payload.store_id],
          );
          summary.migrated.push('store_settings');
        }
      }

      if (payload.menu_items.length > 0) {
        const existing = await countRowsForStore(client, 'menu_items', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('menu_items (destination not empty)');
        } else {
          for (const item of payload.menu_items) {
            await client.query(
              `
                insert into public.menu_items (
                  store_id, name, price, category, image_url, description, is_available, sort_order, recipe, variants
                ) values (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb
                )
              `,
              [
                payload.store_id,
                String(item.name || 'Unknown'),
                Math.max(0, Number(item.price || 0)),
                String(item.category || 'Coffee'),
                String(item.image_url || ''),
                String(item.description || ''),
                item.is_available ?? true,
                Number(item.sort_order || 0),
                JSON.stringify(Array.isArray(item.recipe) ? item.recipe : []),
                JSON.stringify(Array.isArray(item.variants) ? item.variants : []),
              ],
            );
          }
          summary.migrated.push(`menu_items (${payload.menu_items.length})`);
        }
      } else {
        summary.skipped.push('menu_items (empty)');
      }

      if (payload.inventory_items.length > 0) {
        const existing = await countRowsForStore(client, 'inventory', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('inventory (destination not empty)');
        } else {
          for (const item of payload.inventory_items) {
            await client.query(
              `
                insert into public.inventory (
                  store_id, name, stock, unit, min_stock, cost_per_unit
                ) values (
                  $1, $2, $3, $4, $5, $6
                )
              `,
              [
                payload.store_id,
                String(item.name || 'Unknown'),
                Number(item.stock || 0),
                String(item.unit || 'pcs'),
                Number(item.min_stock || 5),
                Number(item.cost_per_unit || 0),
              ],
            );
          }
          summary.migrated.push(`inventory (${payload.inventory_items.length})`);
        }
      } else {
        summary.skipped.push('inventory (empty)');
      }

      if (payload.transactions.length > 0) {
        const existing = await countRowsForStore(client, 'transactions', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('transactions (destination not empty)');
        } else {
          for (const trx of payload.transactions) {
            await client.query(
              `
                insert into public.transactions (
                  id, store_id, date, items, subtotal, discount, discount_label, tax, total, cogs, paid, change,
                  method, cashier, note, is_void, void_reason, void_at, void_by
                ) values (
                  $1, $2, $3::timestamptz, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::timestamptz, $19
                )
                on conflict (id) do nothing
              `,
              [
                String(trx.id),
                payload.store_id,
                String(trx.date || new Date().toISOString()),
                JSON.stringify(Array.isArray(trx.items) ? trx.items : []),
                Number(trx.subtotal || 0),
                Number(trx.discount || 0),
                trx.discount_label ?? null,
                Number(trx.tax || 0),
                Number(trx.total || 0),
                Number(trx.cogs || 0),
                Number(trx.paid || 0),
                Number(trx.change || 0),
                String(trx.method || 'Tunai'),
                String(trx.cashier || ''),
                trx.note ?? null,
                Boolean(trx.is_void),
                trx.void_reason ?? null,
                trx.void_at ?? null,
                trx.void_by ?? null,
              ],
            );
          }
          summary.migrated.push(`transactions (${payload.transactions.length})`);
        }
      } else {
        summary.skipped.push('transactions (empty)');
      }

      if (payload.expenses.length > 0) {
        const existing = await countRowsForStore(client, 'expenses', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('expenses (destination not empty)');
        } else {
          for (const expense of payload.expenses) {
            await client.query(
              `
                insert into public.expenses (
                  store_id, date, description, amount, category, cashier, source
                ) values (
                  $1, $2::timestamptz, $3, $4, $5, $6, $7
                )
              `,
              [
                payload.store_id,
                String(expense.date || new Date().toISOString()),
                String(expense.description || ''),
                Number(expense.amount || 0),
                String(expense.category || 'Operasional'),
                expense.cashier ?? null,
                String(expense.source || 'cashier'),
              ],
            );
          }
          summary.migrated.push(`expenses (${payload.expenses.length})`);
        }
      } else {
        summary.skipped.push('expenses (empty)');
      }

      if (payload.cash_flow.length > 0) {
        const existing = await countRowsForStore(client, 'cash_flow', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('cash_flow (destination not empty)');
        } else {
          for (const entry of payload.cash_flow) {
            await client.query(
              `
                insert into public.cash_flow (
                  store_id, date, type, amount, description, cashier
                ) values (
                  $1, $2::timestamptz, $3, $4, $5, $6
                )
              `,
              [
                payload.store_id,
                String(entry.date || new Date().toISOString()),
                String(entry.type === 'in' ? 'in' : 'out'),
                Number(entry.amount || 0),
                entry.description ?? null,
                entry.cashier ?? null,
              ],
            );
          }
          summary.migrated.push(`cash_flow (${payload.cash_flow.length})`);
        }
      } else {
        summary.skipped.push('cash_flow (empty)');
      }

      if (payload.store_accounts.length > 0) {
        const existing = await countRowsForStore(client, 'store_accounts', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('store_accounts (destination not empty)');
        } else {
          for (const account of payload.store_accounts) {
            await client.query(
              `
                insert into public.store_accounts (
                  store_id, username, password_hash, role, is_active
                ) values (
                  $1, $2, $3, $4, $5
                )
                on conflict (store_id, username) do update
                set
                  password_hash = excluded.password_hash,
                  role = excluded.role,
                  is_active = excluded.is_active
              `,
              [
                payload.store_id,
                String(account.username || 'kasir'),
                String(account.password_hash || ''),
                String(account.role === 'owner' ? 'owner' : 'kasir'),
                account.is_active ?? true,
              ],
            );
          }
          summary.migrated.push(`store_accounts (${payload.store_accounts.length})`);
        }
      }

      return summary;
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/api/notifications', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
    const category = notificationCategorySchema.parse(req.query.category || undefined);
    const storeId = typeof req.query.storeId === 'string' && z.string().uuid().safeParse(req.query.storeId).success
      ? req.query.storeId
      : null;
    const filters = ['user_id = $1'];
    const values: unknown[] = [req.authUser!.id];

    if (storeId) {
      await withTransaction(async (client) => {
        await assertNotificationStoreAccess(client, storeId, req.authUser!.id);
      });
      values.push(storeId);
      filters.push(`store_id = $${values.length}`);
    }

    if (category) {
      values.push(category);
      filters.push(`coalesce(metadata->>'category', type) = $${values.length}`);
    }

    const whereSql = filters.join(' and ');
    const [items, unreadCount] = await Promise.all([
      pool.query(
        `
          select id, user_id, store_id, title, message, type, is_read, metadata, created_at
          from public.notifications
          where ${whereSql}
          order by created_at desc
          limit $${values.length + 1}
        `,
        [...values, limit],
      ),
      pool.query(
        `
          select count(*)::int as unread_count
          from public.notifications
          where user_id = $1
            and is_read = false
        `,
        [req.authUser!.id],
      ),
    ]);

    res.json({
      items: items.rows,
      unreadCount: unreadCount.rows[0]?.unread_count ?? 0,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/notifications/mark-read', async (req, res, next) => {
  try {
    const payload = markNotificationsReadSchema.parse(req.body ?? {});
    const result = await withTransaction(async (client) => {
      if (payload.storeId) {
        await assertNotificationStoreAccess(client, payload.storeId, req.authUser!.id);
      }

      if (payload.ids && payload.ids.length > 0) {
        const update = await client.query(
          `
            update public.notifications
            set is_read = true
            where user_id = $1
              and id = any($2::uuid[])
              ${payload.storeId ? 'and store_id = $3' : ''}
          `,
          payload.storeId ? [req.authUser!.id, payload.ids, payload.storeId] : [req.authUser!.id, payload.ids],
        );
        return update.rowCount ?? 0;
      }

      const update = await client.query(
        `
          update public.notifications
          set is_read = true
          where user_id = $1
            and is_read = false
            ${payload.storeId ? 'and store_id = $2' : ''}
        `,
        payload.storeId ? [req.authUser!.id, payload.storeId] : [req.authUser!.id],
      );
      return update.rowCount ?? 0;
    });

    res.json({ updated: result });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/notifications/read-all', async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        update public.notifications
        set is_read = true
        where user_id = $1
          and is_read = false
      `,
      [req.authUser!.id],
    );

    res.json({ updated: result.rowCount ?? 0 });
  } catch (error) {
    next(error);
  }
});

router.post('/api/notifications/push-subscription', async (req, res, next) => {
  try {
    const payload = pushSubscriptionSchema.parse(req.body ?? {});
    if (payload.store_id) {
      await withTransaction(async (client) => {
        await assertNotificationStoreAccess(client, payload.store_id!, req.authUser!.id);
      });
    }

    const result = await pool.query(
      `
        insert into public.notification_push_subscriptions (
          user_id, store_id, channel, endpoint, payload, platform, is_active, updated_at
        ) values ($1, $2, $3, $4, $5::jsonb, $6, true, now())
        on conflict (user_id, channel, endpoint) do update
        set
          store_id = excluded.store_id,
          payload = excluded.payload,
          platform = excluded.platform,
          is_active = true,
          updated_at = now()
        returning id, channel, endpoint, platform, is_active, updated_at
      `,
      [
        req.authUser!.id,
        payload.store_id ?? null,
        payload.channel,
        payload.endpoint,
        JSON.stringify(payload.payload),
        payload.platform ?? null,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post('/api/beta-feedback', async (req, res, next) => {
  try {
    const payload = betaFeedbackSchema.parse(req.body ?? {});
    if (payload.store_id) {
      await withTransaction(async (client) => {
        await assertNotificationStoreAccess(client, payload.store_id!, req.authUser!.id);
      });
    }

    const result = await pool.query(
      `
        insert into public.beta_feedback (
          user_id, store_id, rating, category, description, screenshot_data, liked, improve, metadata
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
        )
        returning id, user_id, store_id, rating, category, description, liked, improve, metadata, created_at, (screenshot_data is not null) as has_screenshot
      `,
      [
        req.authUser!.id,
        payload.store_id ?? null,
        payload.rating ?? null,
        payload.category,
        payload.description,
        payload.screenshot_data ?? null,
        payload.liked,
        payload.improve,
        JSON.stringify(payload.metadata),
      ],
    );

    const feedback = result.rows[0];
    await withTransaction(async (client) => {
      const recipients = new Set<string>();
      if (payload.store_id) {
        const ownerResult = await client.query(
          `select owner_id from public.stores where id = $1 limit 1`,
          [payload.store_id],
        );
        if (ownerResult.rows[0]?.owner_id) recipients.add(String(ownerResult.rows[0].owner_id));
      }
      if (adminEmails.size > 0) {
        const adminResult = await client.query(
          `select id from public.profiles where lower(email) = any($1::text[])`,
          [[...adminEmails]],
        );
        adminResult.rows.forEach((row) => recipients.add(String(row.id)));
      }
      if (recipients.size === 0) recipients.add(req.authUser!.id);

      await Promise.all([...recipients].map((userId) => insertNotification(
        client,
        userId,
        'Feedback Closed Beta masuk',
        `${payload.category}: ${payload.description || payload.improve || payload.liked}`.slice(0, 180),
        payload.category === 'Bug' ? 'warning' : 'business_alert',
        {
          category: 'beta_feedback',
          feedbackId: feedback.id,
          rating: payload.rating ?? null,
          hasScreenshot: Boolean(payload.screenshot_data),
        },
        payload.store_id ?? null,
      )));
    });

    if (req.authUser?.email) {
      sendFeedbackThankYouEmail(req.authUser.email, payload.category)
        .catch((error) => log('warn', 'feedback.thank_you_email_failed', {
          userId: req.authUser?.id,
          feedbackId: feedback.id,
          error: serializeError(error),
        }));
    }

    res.status(201).json(feedback);
  } catch (error) {
    next(error);
  }
});

export default router;
