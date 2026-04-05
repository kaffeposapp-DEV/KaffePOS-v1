// supabase/functions/send-notification/index.ts
// KaffePOS Welcome Email — via Supabase Admin Auth (invite flow)
// Menggunakan service_role key untuk kirim email via Supabase SMTP yang sudah dikonfigurasi
// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotifPayload {
  type: 'welcome' | 'verification' | 'password_reset' | 'daily_sales';
  email: string;
  name?: string;
  otp?: string;
  link?: string;
  redirectTo?: string;
  salesSummary?: {
    totalIncome: string;
    totalOrders: number;
    topProduct: string;
    date: string;
  };
}

const BRAND_COLOR = '#C2622A';
const DARK_BG     = '#111827';
const LIGHT_BG    = '#F3F4F6';
const TEXT_DARK   = '#1F2937';
const TEXT_MUTED  = '#6B7280';
const LOGO_URL    = 'https://api.iconify.design/lucide/coffee.svg?color=%23FFFFFF&width=48&height=48';

function baseLayout(content: string, previewText: string = ''): string {
  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KaffePOS</title>
  <style>
    body { margin: 0; padding: 0; background-color: ${LIGHT_BG}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: ${TEXT_DARK}; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .header { background-color: ${DARK_BG}; padding: 40px 20px; text-align: center; }
    .logo { width: 48px; height: 48px; margin-bottom: 12px; }
    .header-title { color: #ffffff; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
    .content { padding: 40px; }
    .footer { background-color: ${DARK_BG}; padding: 32px 20px; text-align: center; color: #9CA3AF; font-size: 13px; }
    .footer a { color: #ffffff; text-decoration: none; font-weight: 600; }
    .btn { display: inline-block; background-color: ${BRAND_COLOR}; color: #ffffff !important; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 16px; margin: 24px 0; }
    .otp-box { background: ${LIGHT_BG}; border: 2px dashed ${BRAND_COLOR}; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
    .otp-code { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: ${BRAND_COLOR}; margin: 0; }
    .info-row { display: table; width: 100%; margin-bottom: 16px; border-collapse: collapse; }
    .info-icon-cell { vertical-align: top; width: 24px; padding-top: 4px; }
    .info-icon { width: 20px; height: 20px; display: block; }
    .info-text-cell { vertical-align: top; padding-left: 12px; font-size: 14px; color: ${TEXT_MUTED}; }
    @media (max-width: 600px) { .content { padding: 24px; } }
  </style>
</head>
<body>
  <div style="display: none; max-height: 0px; overflow: hidden;">${previewText}</div>
  <div class="container">
    <div class="header">
      <img src="${LOGO_URL}" alt="KaffePOS" class="logo">
      <h1 class="header-title">KaffePOS</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p style="margin: 0 0 12px;">© ${new Date().getFullYear()} KaffePOS. Atur Cafemu Tanpa Ampas.</p>
      <p style="margin: 0;">
        Follow kami di <a href="https://instagram.com/kaffepos" target="_blank">Instagram @kaffepos</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function getVerificationHtml(name: string, otp: string): string {
  return baseLayout(`
    <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Konfirmasi Email Akun Kamu</h2>
    <p>Halo <strong>${name}</strong>, terima kasih telah bergabung. Gunakan kode OTP di bawah ini untuk memverifikasi akun KaffePOS kamu:</p>
    
    <div class="otp-box">
      <p style="font-size: 12px; color: ${TEXT_MUTED}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Kode Verifikasi</p>
      <div class="otp-code">${otp}</div>
    </div>
    
    <p style="font-size: 14px; color: ${TEXT_MUTED};">Kode ini akan kadaluarsa dalam 10 menit. Jika kamu tidak meminta kode ini, silakan abaikan email ini.</p>
  `, `Kode verifikasi KaffePOS kamu: ${otp}`);
}

function getWelcomeHtml(name: string): string {
  return baseLayout(`
    <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Selamat Datang, ${name}! ☕</h2>
    <p>Akun KaffePOS kamu sudah aktif dan siap digunakan. Sekarang kamu bisa mengatur transaksi dan stok bahan dengan lebih profesional.</p>
    
    <div style="margin: 32px 0;">
      <table class="info-row"><tr>
        <td class="info-icon-cell"><img src="https://api.iconify.design/lucide/check-circle-2.svg?color=%23C2622A" class="info-icon"></td>
        <td class="info-text-cell"><strong>Manajemen Menu:</strong> Tambahkan produk dan kategori dengan mudah.</td>
      </tr></table>
      <table class="info-row"><tr>
        <td class="info-icon-cell"><img src="https://api.iconify.design/lucide/check-circle-2.svg?color=%23C2622A" class="info-icon"></td>
        <td class="info-text-cell"><strong>Laporan Real-time:</strong> Pantau penjualan kapan pun dan di mana pun.</td>
      </tr></table>
      <table class="info-row"><tr>
        <td class="info-icon-cell"><img src="https://api.iconify.design/lucide/check-circle-2.svg?color=%23C2622A" class="info-icon"></td>
        <td class="info-text-cell"><strong>AI Insight:</strong> Dapatkan saran pintar untuk kembangkan bisnismu.</td>
      </tr></table>
    </div>
    
    <div style="text-align: center;">
      <a href="https://kaffepos.app" class="btn">Masuk ke Dashboard</a>
    </div>
  `, 'Selamat datang di KaffePOS! Akun kamu sudah aktif.');
}

function getPasswordResetHtml(name: string, link: string): string {
  return baseLayout(`
    <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Reset Password Kamu</h2>
    <p>Halo ${name}, kami menerima permintaan untuk mereset password akun KaffePOS kamu. Klik tombol di bawah ini untuk melanjutkan:</p>
    
    <div style="text-align: center;">
      <a href="${link}" class="btn">Reset Password Sekarang</a>
    </div>
    
    <p style="font-size: 14px; color: ${TEXT_MUTED};">Jika tombol tidak berfungsi, salin dan tempel link berikut ke browser kamu:</p>
    <p style="font-size: 12px; word-break: break-all; color: ${BRAND_COLOR};">${link}</p>
    
    <p style="font-size: 14px; color: ${TEXT_MUTED}; margin-top: 32px;">Jika kamu tidak meminta reset password, silakan abaikan email ini. Password kamu tidak akan berubah.</p>
  `, 'Permintaan reset password akun KaffePOS kamu.');
}

function getDailySalesHtml(name: string, summary: any): string {
  return baseLayout(`
    <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Laporan Penjualan Harian</h2>
    <p>Halo <strong>${name}</strong>, berikut adalah ringkasan penjualan toko kamu hari ini:</p>
    <p style="color: ${TEXT_MUTED}; margin-bottom: 24px;">${summary.date}</p>
    
    <div style="background: ${LIGHT_BG}; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <p style="font-size: 14px; color: ${TEXT_MUTED}; margin: 0;">Total Pendapatan</p>
      <p style="font-size: 28px; font-weight: 800; color: ${BRAND_COLOR}; margin: 4px 0 16px;">${summary.totalIncome}</p>
      
      <div style="border-top: 1px solid #E5E7EB; margin: 16px 0; height: 1px;"></div>
      
      <table width="100%"><tr>
        <td width="50%">
          <p style="font-size: 13px; color: ${TEXT_MUTED}; margin: 0;">Total Pesanan</p>
          <p style="font-size: 16px; font-weight: 700; margin: 4px 0;">${summary.totalOrders}</p>
        </td>
        <td width="50%">
          <p style="font-size: 13px; color: ${TEXT_MUTED}; margin: 0;">Produk Terlaris</p>
          <p style="font-size: 16px; font-weight: 700; margin: 4px 0;">${summary.topProduct}</p>
        </td>
      </tr></table>
    </div>
    
    <div style="margin: 32px 0;">
      <table class="info-row"><tr>
        <td class="info-icon-cell"><img src="https://api.iconify.design/lucide/sparkles.svg?color=%23C2622A" class="info-icon"></td>
        <td class="info-text-cell"><strong>Saran Pintar:</strong> Penjualanmu hari ini cukup stabil. Pertimbangkan untuk memberi promo khusus pada jam-jam sibuk besok!</td>
      </tr></table>
    </div>
    
    <div style="text-align: center;">
      <a href="https://kaffepos.app" class="btn">Lihat Detail Laporan</a>
    </div>
  `, `Laporan penjualan harian: ${summary.totalIncome}`);
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

    if (!payload.email) {
      return new Response(JSON.stringify({ error: 'invalid payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const name    = payload.name || payload.email.split('@')[0];
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let html    = '';
    let subject = '';

    switch (payload.type) {
      case 'verification': {
        const otp = payload.otp || Math.floor(100000 + Math.random() * 900000).toString();
        html = getVerificationHtml(name, otp);
        subject = `Verifikasi Akun KaffePOS - ${otp}`;
        break;
      }
      case 'password_reset': {
        const link = payload.link || '#';
        html = getPasswordResetHtml(name, link);
        subject = `Reset Password KaffePOS`;
        break;
      }
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
        to: [payload.email],
        subject,
        html,
      }),
    });

    if (!res.ok) throw new Error(`Resend API failed: ${await res.text()}`);

    // Log to notifications table if user exists
    const user = await findUserByEmail(adminClient, payload.email);
    if (user) {
      await adminClient.from('notifications').insert({
        user_id: user.id,
        title: subject,
        message: payload.type === 'daily_sales' ? `Laporan penjualan harian telah dikirim ke email.` : `Email ${payload.type} telah dikirim.`,
        type: payload.type === 'daily_sales' ? 'transaction' : 'system',
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

