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
  type: 'welcome' | 'verification';
  email: string;
  name?: string;
  redirectTo?: string;
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

function verificationEmailHtml(name: string, link: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:20px;background-color:#F9FAFB;font-family:sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background-color:#ffffff;border:1px solid #E5E7EB;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:40px;text-align:center;">
      <div style="display:inline-block;padding:12px;background:#FEF3C7;border-radius:12px;margin-bottom:20px;">
        <img src="https://api.iconify.design/lucide/mail.svg?color=%23D97706&width=32&height=32" width="32" height="32" alt=""/>
      </div>
      <h1 style="font-size:20px;font-weight:800;margin-bottom:10px;">Konfirmasi Email Anda</h1>
      <p style="color:#4B5563;font-size:15px;line-height:1.5;">Halo ${name}, terima kasih telah mendaftar di KaffePOS. Klik tombol di bawah untuk memverifikasi akun Anda.</p>
      <div style="margin:30px 0;">
        <a href="${link}" style="background:#111827;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">Konfirmasi Sekarang</a>
      </div>
      <p style="color:#9CA3AF;font-size:12px;">Jika Anda tidak merasa mendaftar, abaikan email ini.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function welcomeEmailHtml(name: string): string {
  // ... (keep original welcomeEmailHtml code)
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Selamat Datang di KaffePOS</title>
</head>
<body style="margin:0;padding:0;background-color:#F9FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;line-height:1.6;">
  <!-- Main Container -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9FAFB;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <tr>
          <td style="padding:48px 40px 24px;text-align:center;">
            <!-- Logo area -->
            <div style="display:inline-block;padding:12px;background:#FEF3C7;border-radius:12px;margin-bottom:24px;">
              <img src="https://api.iconify.design/lucide/coffee.svg?color=%23D97706&width=32&height=32" width="32" height="32" alt="KaffePOS" style="display:block;border:0;"/>
            </div>
            
            <h1 style="margin:0;color:#111827;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Selamat datang di KaffePOS</h1>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding:0 40px 32px;">
            <p style="margin:0 0 20px;font-size:16px;color:#374151;">Halo ${name},</p>
            <p style="margin:0 0 24px;font-size:16px;color:#4B5563;">
              Terima kasih telah bergabung dengan KaffePOS. Kami sangat senang bisa menjadi bagian dari perjalanan kedai kopi Anda menuju manajemen yang lebih modern dan tanpa ampas.
            </p>

            <!-- Features Box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F9FAFB;border-radius:8px;margin-bottom:32px;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 16px;color:#111827;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Hal selanjutnya untuk Anda:</p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;color:#4B5563;">
                    <tr><td style="padding:6px 0;width:24px;"><span style="color:#10B981;">✓</span></td><td style="padding:4px 0;">Masuk dan lengkapi menu cafe Anda</td></tr>
                    <tr><td style="padding:6px 0;width:24px;"><span style="color:#10B981;">✓</span></td><td style="padding:4px 0;">Mulai catat transaksi dengan mudah</td></tr>
                    <tr><td style="padding:6px 0;width:24px;"><span style="color:#10B981;">✓</span></td><td style="padding:4px 0;">Cek ringkasan penjualan & AI insight</td></tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td align="center">
                  <a href="https://kaffepos.app" style="display:inline-block;background-color:#111827;color:#ffffff;font-weight:500;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:8px;transition:background-color 0.2s;">
                    Buka Dashboard
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:15px;color:#4B5563;">
              Jika Anda memerlukan bantuan atau memiliki pertanyaan, jangan ragu untuk membalas email ini.
            </p>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E5E7EB;"></div></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;text-align:center;">
            <p style="margin:0 0 8px;font-size:14px;font-weight:500;color:#111827;">KaffePOS</p>
            <p style="margin:0;font-size:13px;color:#6B7280;">#AturCafemuTanpaAmpas</p>
          </td>
        </tr>

      </table>
      
      <!-- Safe Sender request -->
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td style="padding:24px 20px;text-align:center;">
             <p style="margin:0;font-size:12px;color:#9CA3AF;">© ${new Date().getFullYear()} KaffePOS. Hak Cipta Dilindungi.</p>
          </td>
        </tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;
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

    if (payload.type === 'verification') {
      const existingUser = await findUserByEmail(adminClient, payload.email);
      // Signup link requires a password. For an already-created unverified user,
      // a magic link is the safest custom-email fallback and still proves inbox ownership.
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: existingUser ? 'magiclink' : 'signup',
        email: payload.email,
        ...(existingUser ? {} : { password: crypto.randomUUID() + 'Aa1!' }),
        options: { redirectTo: payload.redirectTo || 'kaffepos://auth/callback' }
      });
      if (linkErr) throw new Error(`Link generation failed: ${linkErr.message}`);
      
      html = verificationEmailHtml(name, linkData.properties.action_link);
      subject = `Konfirmasi Pendaftaran KaffePOS - ${name} ☕`;
    } else {
      html = welcomeEmailHtml(name);
      subject = `Selamat datang di KaffePOS, ${name}! ☕`;
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
        title: payload.type === 'verification' ? 'Email Konfirmasi Dikirim' : 'Selamat Datang!',
        message: payload.type === 'verification' 
          ? 'Link verifikasi telah dikirim ke email Anda. Periksa folder Inbox/Spam.'
          : `Akun Anda telah aktif. Selamat berjualan, ${name}!`,
        type: 'welcome',
        metadata: { channel: 'email', provider: 'resend', type: payload.type }
      });
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      type: payload.type, 
      link_generated: !!html,
      message: payload.type === 'verification' ? 'Email konfirmasi sedang dikirim...' : 'Selamat datang!'
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('send-notification error:', e);
    return new Response(JSON.stringify({ 
      error: String(e?.message ?? e),
      details: e?.stack || 'No stack'
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
