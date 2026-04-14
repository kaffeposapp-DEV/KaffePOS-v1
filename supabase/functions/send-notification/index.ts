// supabase/functions/send-notification/index.ts
// KaffePOS Welcome Email — via Supabase Admin Auth (invite flow)
// Menggunakan service_role key untuk kirim email via Supabase SMTP yang sudah dikonfigurasi
// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const INTERNAL_SECRET   = Deno.env.get('NOTIFICATION_INTERNAL_SECRET') ?? '';
const ADMIN_EMAILS      = (Deno.env.get('ADMIN_EMAILS') ?? 'kaffeposapp@gmail.com')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotifPayload {
  type:
    | 'welcome'
    | 'verification'
    | 'password_reset'
    | 'daily_sales'
    | 'subscription_activated'
    | 'subscription_expiry_reminder'
    | 'login_alert'
    | 'password_changed';
  email: string;
  name?: string;
  otp?: string;
  link?: string;
  subject?: string;
  redirectTo?: string;
  plan?: string;
  billingCycle?: string;
  expiresAt?: string | null;
  features?: string[];
  reminderKind?: '7_days' | '3_days' | 'expiry_day' | '3_days_after';
  salesSummary?: {
    totalIncome: string;
    totalOrders: number;
    topProduct: string;
    date: string;
  };
}

const ALLOWED_TYPES = new Set<NotifPayload['type']>([
  'welcome',
  'verification',
  'password_reset',
  'daily_sales',
  'subscription_activated',
  'subscription_expiry_reminder',
  'login_alert',
  'password_changed',
]);

const BRAND_COLOR = '#C2622A';
const LIGHT_BG    = '#F3F4F6';
const TEXT_DARK   = '#1F2937';
const TEXT_MUTED  = '#6B7280';
const BRAND_DARK  = '#5A2A17';
const BRAND_GOLD  = '#F0C676';
const BRAND_CREAM = '#FBF7F2';

const INTERNAL_ONLY_TYPES = new Set<NotifPayload['type']>([
  'daily_sales',
  'subscription_activated',
  'subscription_expiry_reminder',
]);

type RequestContext = {
  authEmail: string | null;
  isAdmin: boolean;
  isInternal: boolean;
  ip: string;
};

async function getRequestContext(req: Request): Promise<RequestContext> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const internalHeader = req.headers.get('x-notification-secret') ?? '';
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown';

  let authEmail: string | null = null;
  if (authHeader.startsWith('Bearer ') && SUPABASE_ANON) {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await authClient.auth.getUser();
    authEmail = data.user?.email?.trim().toLowerCase() ?? null;
  }

  return {
    authEmail,
    isAdmin: !!authEmail && ADMIN_EMAILS.includes(authEmail),
    isInternal: !!INTERNAL_SECRET && internalHeader === INTERNAL_SECRET,
    ip,
  };
}

async function enforceRateLimit(
  adminClient: ReturnType<typeof createClient>,
  key: string,
  ip: string,
  maxHits: number,
  windowMinutes: number,
) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000).toISOString();

  const { data: existing, error: fetchError } = await adminClient
    .from('edge_rate_limits')
    .select('id,hits')
    .eq('rate_key', key)
    .gte('window_started_at', windowStart)
    .order('window_started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (!existing) {
    const { error } = await adminClient.from('edge_rate_limits').insert({
      rate_key: key,
      hits: 1,
      last_ip: ip,
      window_started_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    if (error) throw error;
    return;
  }

  if ((existing.hits ?? 0) >= maxHits) {
    throw new Error('Terlalu banyak permintaan. Tunggu beberapa menit lalu coba lagi.');
  }

  const { error } = await adminClient
    .from('edge_rate_limits')
    .update({
      hits: (existing.hits ?? 0) + 1,
      last_ip: ip,
      updated_at: now.toISOString(),
    })
    .eq('id', existing.id);
  if (error) throw error;
}

function baseLayout(content: string, previewText: string = ''): string {
  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KaffePOS</title>
  <style>
    body { margin: 0; padding: 0; background-color: #EFE6DA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: ${TEXT_DARK}; line-height: 1.65; }
    .shell { padding: 28px 14px; }
    .container { max-width: 620px; margin: 0 auto; background: ${BRAND_CREAM}; border-radius: 30px; overflow: hidden; box-shadow: 0 18px 42px rgba(90,42,23,0.12); }
    .hero { padding: 18px 30px 0; background: ${BRAND_CREAM}; }
    .dots { text-align: right; margin-bottom: 18px; }
    .dot { display: inline-block; width: 14px; height: 14px; border-radius: 999px; margin-left: 8px; }
    .header { padding: 24px 34px 26px; text-align: left; background: linear-gradient(90deg, ${BRAND_DARK} 0%, ${BRAND_COLOR} 58%, #F1A534 100%); }
    .wordmark { color: #FFFFFF; font-size: 42px; line-height: 1; font-weight: 800; letter-spacing: -1.6px; margin: 0; text-transform: lowercase; }
    .brand-subtitle { color: #FFFFFF; font-size: 14px; margin: 10px 0 0; }
    .content { padding: 38px 40px 42px; background: #FFFDF9; }
    .section-label { color: #9A6B33; font-size: 11px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px; }
    h2 { font-size: 33px; line-height: 1.12; font-weight: 800; letter-spacing: -1px; margin: 0 0 14px; color: #221814; }
    p { margin: 0 0 16px; font-size: 18px; color: #46362E; }
    .lede { font-size: 19px; color: #241A14; }
    .footer { background-color: ${BRAND_CREAM}; padding: 24px 20px 28px; text-align: center; color: ${TEXT_MUTED}; font-size: 13px; }
    .footer a { color: ${BRAND_DARK}; text-decoration: none; font-weight: 700; }
    .btn { display: inline-block; background: linear-gradient(90deg, #A84F23 0%, #F0A331 100%); color: #ffffff !important; padding: 16px 32px; border-radius: 18px; text-decoration: none; font-weight: 800; font-size: 16px; letter-spacing: 0.01em; margin: 18px 0 8px; }
    .otp-box { background: #F7EFE5; border: 1px solid #E8D7C4; border-radius: 22px; padding: 22px; text-align: center; margin: 28px 0; }
    .otp-code { font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #4A2310; margin: 0; }
    .feature-list { margin: 28px 0; padding: 0; list-style: none; }
    .feature-item { margin-bottom: 18px; font-size: 17px; color: #5D4B3F; }
    .feature-badge { display: inline-block; width: 24px; color: ${BRAND_GOLD}; font-weight: 700; vertical-align: top; }
    .feature-copy { display: inline-block; width: calc(100% - 30px); vertical-align: top; }
    .summary-card { background: #F7F1EA; border: 1px solid #E8DED1; border-radius: 20px; padding: 24px; margin-bottom: 24px; }
    .divider { border-top: 1px solid #DED2C4; margin: 18px 0; height: 1px; }
    .helper-card { font-size: 15px; color: #5D4B3F; background: #F8F1E8; border: 1px solid #E8DED1; border-radius: 16px; padding: 16px 18px; margin: 28px 0; }
    .micro { font-size: 13px; color: #7B6B60; }
    .stats-table td { vertical-align: top; }
    @media (max-width: 600px) { .shell { padding: 16px 10px; } .hero { padding: 14px 20px 0; } .header { padding: 22px 24px 24px; } .content { padding: 28px 24px 32px; } .wordmark { font-size: 36px; } h2 { font-size: 28px; } p, .lede { font-size: 17px; } }
  </style>
</head>
<body>
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${previewText}</div>
  <div class="shell">
    <div class="container">
      <div class="hero">
        <div class="dots">
          <span class="dot" style="background:${BRAND_DARK};"></span>
          <span class="dot" style="background:#DB8B2E;"></span>
          <span class="dot" style="background:#F4DEAD;"></span>
        </div>
      </div>
      <div class="header">
        <p class="wordmark">kaffe</p>
        <p class="brand-subtitle">Warm systems for modern coffee retail.</p>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p style="margin: 0 0 10px;">© ${new Date().getFullYear()} KaffePOS. Atur cafemu tanpa ampas.</p>
        <p style="margin: 0; font-size: 13px;">Follow kami di <a href="https://instagram.com/kaffepos" target="_blank">Instagram @kaffepos</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function getVerificationHtml(name: string, otp: string): string {
  return baseLayout(`
    <p class="section-label">Pendaftaran</p>
    <h2>Verifikasi akun baru Anda.</h2>
    <p class="lede">Halo <strong>${name}</strong>, satu langkah lagi dan akun KaffePOS Anda siap digunakan.</p>
    <p>Masukkan kode OTP berikut untuk menyelesaikan proses pendaftaran.</p>
    
    <div class="otp-box">
      <p class="micro" style="text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 10px;">Kode Verifikasi</p>
      <div class="otp-code">${otp}</div>
    </div>
    
    <div class="helper-card">Kode ini berlaku selama 30 menit. Jika kamu tidak merasa mendaftar, email ini bisa diabaikan dengan aman.</div>
  `, `Kode verifikasi KaffePOS kamu: ${otp}`);
}

function getWelcomeHtml(name: string): string {
  return baseLayout(`
    <p class="section-label">Welcome</p>
    <h2>Akun Anda sudah aktif.</h2>
    <p class="lede">Halo <strong>${name}</strong>, sekarang Anda sudah bisa masuk dan mulai menjalankan operasional toko dengan lebih rapi.</p>
    <p>KaffePOS dirancang untuk membantu transaksi harian, laporan, dan pengelolaan menu tetap terasa ringan dipakai setiap hari.</p>
    
    <ul class="feature-list">
      <li class="feature-item"><span class="feature-badge">01</span><span class="feature-copy"><strong>Manajemen menu yang tertata.</strong> Tambahkan produk dan kategori dengan cepat.</span></li>
      <li class="feature-item"><span class="feature-badge">02</span><span class="feature-copy"><strong>Laporan yang mudah dibaca.</strong> Pantau penjualan kapan pun dibutuhkan.</span></li>
      <li class="feature-item"><span class="feature-badge">03</span><span class="feature-copy"><strong>Insight yang relevan.</strong> Gunakan saran untuk mengambil keputusan operasional.</span></li>
    </ul>
    
    <div style="text-align: center;">
      <a href="https://kaffepos.app" class="btn">Masuk ke Dashboard</a>
    </div>
  `, 'Selamat datang di KaffePOS! Akun kamu sudah aktif.');
}

function getPasswordResetHtml(name: string, link: string): string {
  return baseLayout(`
    <p class="section-label">Security</p>
    <h2>Atur ulang kata sandi Anda.</h2>
    <p class="lede">Halo <strong>${name}</strong>, kami menerima permintaan untuk mengatur ulang kata sandi akun KaffePOS Anda.</p>
    <p>Untuk melanjutkan, gunakan tombol berikut. Tautan ini akan membawa Anda ke halaman penggantian password.</p>
    
    <div style="text-align: center;">
      <a href="${link}" class="btn">Atur Ulang Password</a>
    </div>
    
    <p class="micro" style="margin-bottom: 6px;">Jika tombol tidak terbuka, salin link berikut ke browser:</p>
    <p style="font-size: 13px; word-break: break-all; color: ${BRAND_COLOR}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">${link}</p>
    
    <div class="helper-card">Jika Anda tidak meminta penggantian password, abaikan email ini. Kata sandi akun tidak akan berubah.</div>
  `, 'Permintaan reset password akun KaffePOS kamu.');
}

function getLoginAlertHtml(name: string): string {
  const timestamp = new Date().toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  return baseLayout(`
    <p class="section-label">Security</p>
    <h2>Login baru berhasil.</h2>
    <p class="lede">Halo <strong>${name}</strong>, akun KaffePOS Anda baru saja dipakai masuk.</p>
    <div class="summary-card">
      <p class="micro" style="margin: 0;">Waktu login</p>
      <p style="font-size: 24px; font-weight: 800; color: #241A14; margin: 6px 0 0;">${timestamp}</p>
    </div>
    <div class="helper-card">Kalau ini bukan Anda, segera ganti password akun dan cek akses perangkat yang masih aktif.</div>
  `, 'Login baru terdeteksi pada akun KaffePOS kamu.');
}

function getPasswordChangedHtml(name: string): string {
  const timestamp = new Date().toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  return baseLayout(`
    <p class="section-label">Security</p>
    <h2>Password akun berhasil diperbarui.</h2>
    <p class="lede">Halo <strong>${name}</strong>, password akun KaffePOS Anda sudah berhasil diganti.</p>
    <div class="summary-card">
      <p class="micro" style="margin: 0;">Waktu perubahan</p>
      <p style="font-size: 24px; font-weight: 800; color: #241A14; margin: 6px 0 0;">${timestamp}</p>
    </div>
    <div class="helper-card">Kalau perubahan ini bukan dari Anda, segera lakukan reset password lagi dan hubungi admin.</div>
  `, 'Password akun KaffePOS kamu baru saja diganti.');
}

function getDailySalesHtml(name: string, summary: any): string {
  return baseLayout(`
    <p class="section-label">Daily Report</p>
    <h2>Laporan penjualan harian.</h2>
    <p class="lede">Halo <strong>${name}</strong>, berikut ringkasan performa toko Anda untuk hari ini.</p>
    <p class="micro" style="margin-bottom: 24px;">${summary.date}</p>
    
      <div class="summary-card">
        <p class="micro" style="margin: 0;">Total Pendapatan</p>
        <p style="font-size: 34px; font-weight: 700; color: #241A14; margin: 6px 0 16px;">${summary.totalIncome}</p>
      
        <div class="divider"></div>
      
      <table width="100%" class="stats-table" cellspacing="0" cellpadding="0"><tr>
        <td width="50%" style="padding-right: 10px;">
          <p class="micro" style="margin: 0;">Total Pesanan</p>
          <p style="font-size: 18px; font-weight: 700; margin: 4px 0; color: #241A14;">${summary.totalOrders}</p>
        </td>
        <td width="50%" style="padding-left: 10px;">
          <p class="micro" style="margin: 0;">Produk Terlaris</p>
          <p style="font-size: 18px; font-weight: 700; margin: 4px 0; color: #241A14;">${summary.topProduct}</p>
        </td>
      </tr></table>
    </div>
    
    <div class="helper-card"><strong style="color: ${TEXT_DARK};">Catatan:</strong> Penjualan hari ini cukup stabil. Pertimbangkan promo singkat pada jam sibuk untuk mendorong repeat order besok.</div>
    
    <div style="text-align: center;">
      <a href="https://kaffepos.app" class="btn">Lihat Detail Laporan</a>
    </div>
  `, `Laporan penjualan harian: ${summary.totalIncome}`);
}

function getSubscriptionActivatedHtml(
  name: string,
  plan: string,
  billingCycle: string,
  expiresAt: string | null,
  features: string[],
): string {
  return baseLayout(`
    <p class="section-label">Langganan Aktif</p>
    <h2>Langganan KaffePOS kamu sudah aktif! ☕</h2>
    <p class="lede">Halo <strong>${name}</strong>! Langganan <strong>${plan}</strong> kamu sudah aktif.</p>
    <p>Periode aktif: <strong>${billingCycle}</strong>.</p>

    <div class="summary-card">
      <p class="micro" style="margin: 0;">Aktif hingga</p>
      <p style="font-size: 26px; font-weight: 800; color: #241A14; margin: 6px 0 0;">
        ${expiresAt || 'Tidak ada batas waktu'}
      </p>
    </div>

    <ul class="feature-list">
      ${features.map((feature, index) => `
        <li class="feature-item">
          <span class="feature-badge">${String(index + 1).padStart(2, '0')}</span>
          <span class="feature-copy">${feature}</span>
        </li>
      `).join('')}
    </ul>

    <div style="text-align: center;">
      <a href="https://kaffepos.app" class="btn">Buka KaffePOS</a>
    </div>

    <div class="helper-card">Ada pertanyaan? DM kami di Instagram @kaffepos</div>
  `, `Langganan ${plan} KaffePOS kamu sudah aktif.`);
}

function getSubscriptionReminderCopy(kind: NotifPayload['reminderKind']) {
  switch (kind) {
    case '7_days':
      return {
        heading: 'Langganan kamu akan segera habis.',
        body: 'akan berakhir dalam 7 hari.',
      };
    case '3_days':
      return {
        heading: 'Tinggal 3 hari lagi sebelum langganan habis.',
        body: 'akan berakhir dalam 3 hari.',
      };
    case 'expiry_day':
      return {
        heading: 'Langganan kamu habis hari ini.',
        body: 'habis hari ini.',
      };
    case '3_days_after':
      return {
        heading: 'Langganan kamu sudah habis.',
        body: 'sudah habis sejak 3 hari lalu.',
      };
    default:
      return {
        heading: 'Pengingat langganan KaffePOS',
        body: 'akan segera berakhir.',
      };
  }
}

function getSubscriptionExpiryReminderHtml(
  name: string,
  plan: string,
  expiresAt: string | null,
  reminderKind: NotifPayload['reminderKind'],
): string {
  const copy = getSubscriptionReminderCopy(reminderKind);
  return baseLayout(`
    <p class="section-label">Pengingat Langganan</p>
    <h2>${copy.heading}</h2>
    <p class="lede">Halo <strong>${name}</strong>, langganan <strong>${plan}</strong> kamu ${copy.body}</p>
    <p>${expiresAt ? `Tanggal penting: <strong>${expiresAt}</strong>.` : ''}</p>

    <div style="text-align: center;">
      <a href="https://kaffepos.my.id/perpanjang" class="btn">Perpanjang Langganan</a>
    </div>

    <div class="helper-card">Chat admin @kaffepos untuk perpanjang langganan kamu.</div>
  `, `Pengingat langganan ${plan} KaffePOS.`);
}

async function findUserByEmail(adminClient: any, email: string) {
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: NotifPayload = await req.json();

    if (!payload.email || typeof payload.email !== 'string') {
      return new Response(JSON.stringify({ error: 'invalid payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!ALLOWED_TYPES.has(payload.type)) {
      return new Response(JSON.stringify({ error: 'notification type tidak valid' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const name    = payload.name || payload.email.split('@')[0];
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const requestContext = await getRequestContext(req);
    const normalizedEmail = payload.email.trim().toLowerCase();

    if (payload.type === 'verification' || payload.type === 'password_reset') {
      return new Response(JSON.stringify({
        error: 'Flow ini dipindahkan ke Supabase Auth. Endpoint service-role publik dinonaktifkan.',
      }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (INTERNAL_ONLY_TYPES.has(payload.type) && !requestContext.isInternal && !requestContext.isAdmin) {
      return new Response(JSON.stringify({ error: 'Akses ditolak.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (
      (payload.type === 'welcome' || payload.type === 'login_alert' || payload.type === 'password_changed') &&
      !requestContext.isInternal
    ) {
      if (!requestContext.authEmail || requestContext.authEmail !== normalizedEmail) {
        return new Response(JSON.stringify({ error: 'Akses ditolak.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const rateKey = `${payload.type}:${normalizedEmail}`;
      const maxHits = payload.type === 'login_alert' ? 20 : 5;
      await enforceRateLimit(adminClient, rateKey, requestContext.ip, maxHits, 60);
    }

    let html    = '';
    let subject = '';

    switch (payload.type) {
      case 'daily_sales': {
        const summary = payload.salesSummary || {
          totalIncome: 'Rp 0',
          totalOrders: 0,
          topProduct: '-',
          date: new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })
        };
        html = getDailySalesHtml(name, summary);
        subject = `Laporan Penjualan Harian - ${summary.date}`;
        break;
      }
      case 'subscription_activated': {
        const plan = payload.plan || 'KaffePOS';
        const billingCycle = payload.billingCycle || 'Manual';
        html = getSubscriptionActivatedHtml(
          name,
          plan,
          billingCycle,
          payload.expiresAt || null,
          payload.features || [],
        );
        subject = payload.subject || 'Langganan KaffePOS kamu sudah aktif! ☕';
        break;
      }
      case 'subscription_expiry_reminder': {
        const plan = payload.plan || 'KaffePOS';
        html = getSubscriptionExpiryReminderHtml(
          name,
          plan,
          payload.expiresAt || null,
          payload.reminderKind,
        );
        subject = payload.subject || 'Pengingat langganan KaffePOS';
        break;
      }
      case 'login_alert':
        html = getLoginAlertHtml(name);
        subject = payload.subject || 'Login baru ke akun KaffePOS';
        break;
      case 'password_changed':
        html = getPasswordChangedHtml(name);
        subject = payload.subject || 'Password akun KaffePOS berhasil diubah';
        break;
      case 'welcome':
      default:
        html = getWelcomeHtml(name);
        subject = `Selamat datang di KaffePOS, ${name}! ☕`;
        break;
    }

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
    if (!RESEND_KEY) throw new Error('RESEND_API_KEY missing');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'KaffePOS <noreply@kaffepos.my.id>',
        to: [normalizedEmail],
        subject,
        html,
      }),
    });

    if (!res.ok) throw new Error(`Resend API failed: ${await res.text()}`);

    // Log to notifications table if user exists
    const user = await findUserByEmail(adminClient, normalizedEmail);
    if (user) {
      await adminClient.from('notifications').insert({
        user_id: user.id,
        title: subject,
        message: payload.type === 'daily_sales' ? `Laporan penjualan harian telah dikirim ke email.` : `Email ${payload.type} telah dikirim.`,
        type: payload.type === 'welcome' ? 'welcome' : 'success',
        metadata: { channel: 'email', provider: 'resend', type: payload.type }
      });
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      type: payload.type, 
      message: `Email ${payload.type} berhasil dikirim!`
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('send-notification error:', e);
    return new Response(JSON.stringify({ 
      error: String(e?.message ?? e),
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
