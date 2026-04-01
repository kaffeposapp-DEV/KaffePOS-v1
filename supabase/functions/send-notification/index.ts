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
  type: 'welcome';
  email: string;
  name?: string;
}

function welcomeEmailHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Selamat Datang di KaffePOS</title>
</head>
<body style="margin:0;padding:0;background:#FEF3C7;font-family:'Inter',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF3C7;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 10px 40px rgba(111,78,55,0.12);">
        
        <!-- Premium Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6F4E37 0%,#92400E 100%);padding:48px 32px 40px;text-align:center;">
            <!-- Logo Container -->
            <table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 24px;">
              <tr>
                <td align="center" valign="middle" style="width:76px;height:76px;background:#F59E0B;border-radius:22px;box-shadow:0 8px 16px rgba(245,158,11,0.35);">
                  <img src="https://api.iconify.design/lucide/coffee.svg?color=white&width=40&height=40" width="40" height="40" alt="KaffePOS" style="display:block;margin:0 auto;border:0;"/>
                </td>
              </tr>
            </table>
            
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.5px;">KaffePOS</h1>
            <p style="margin:8px 0 0;color:#FDE68A;font-size:14px;font-weight:500;letter-spacing:0.5px;">Atur Cafemu Tanpa Ampas</p>
          </td>
        </tr>

        <!-- Body Content -->
        <tr>
          <td style="padding:40px 32px 0;">
            <h2 style="margin:0 0 10px;color:#1C1917;font-size:24px;font-weight:800;letter-spacing:-0.2px;">Selamat datang, ${name}! 🎉</h2>
            <p style="margin:0 0 28px;color:#44403C;font-size:15px;line-height:1.7;">
              Terima kasih telah bergabung dengan <strong>KaffePOS</strong> — platform kasir pintar yang dirancang khusus untuk cafe dan kedai kopi Indonesia.
            </p>

            <!-- Feature Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#FEF3C7;border:1.5px solid #FDE68A;border-radius:16px;margin-bottom:32px;">
              <tr>
                <td style="padding:24px;">
                  <p style="margin:0 0 16px;color:#92400E;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;">Yang bisa kamu lakukan sekarang:</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr><td style="padding:6px 0;color:#78350F;font-size:14px;"><strong style="color:#F59E0B;font-size:16px;margin-right:6px;">✓</strong> Tambah menu &amp; kelola produk cafe</td></tr>
                    <tr><td style="padding:6px 0;color:#78350F;font-size:14px;"><strong style="color:#F59E0B;font-size:16px;margin-right:6px;">✓</strong> Catat transaksi dengan cepat &amp; mudah</td></tr>
                    <tr><td style="padding:6px 0;color:#78350F;font-size:14px;"><strong style="color:#F59E0B;font-size:16px;margin-right:6px;">✓</strong> Laporan penjualan harian otomatis</td></tr>
                    <tr><td style="padding:6px 0;color:#78350F;font-size:14px;"><strong style="color:#F59E0B;font-size:16px;margin-right:6px;">✓</strong> Print struk ke printer Bluetooth</td></tr>
                    <tr><td style="padding:6px 0;color:#78350F;font-size:14px;"><strong style="color:#F59E0B;font-size:16px;margin-right:6px;">✓</strong> AI Insight untuk analisis bisnis cafe</td></tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Primary Action -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td align="center">
                  <a href="https://kaffepos.app" style="display:inline-block;background:linear-gradient(135deg,#F59E0B 0%,#D97706 100%);color:#ffffff;font-weight:800;font-size:16px;text-decoration:none;padding:18px 48px;border-radius:14px;box-shadow:0 8px 24px rgba(245,158,11,0.3);letter-spacing:0.3px;">
                    Mulai Gunakan KaffePOS &rarr;
                  </a>
                </td>
              </tr>
            </table>

            <!-- Info Box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;margin-bottom:32px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;color:#64748B;font-size:13px;line-height:1.6;">
                    Kamu saat ini menggunakan <strong style="color:#1C1917;">KaffePOS Gratis</strong>. Upgrade ke <strong style="color:#6F4E37;">Pro</strong> mulai <strong>Rp 39.000/bulan</strong> untuk transaksi tak terbatas &amp; fitur premium.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 32px;"><div style="height:1px;background:#F1F5F9;"></div></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:28px 32px 36px;text-align:center;">
            <p style="margin:0 0 6px;color:#94A3B8;font-size:13px;font-weight:500;">Ada pertanyaan?</p>
            <p style="margin:0 0 24px;"><a href="mailto:kaffeposapp@gmail.com" style="color:#6F4E37;font-size:14px;font-weight:700;text-decoration:none;">kaffeposapp@gmail.com</a></p>
            <p style="margin:0;color:#CBD5E1;font-size:12px;font-weight:500;">&copy; 2025 KaffePOS &middot; <em style="color:#94A3B8;">#AturCafemuTanpaAmpas</em></p>
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

    if (payload.type !== 'welcome' || !payload.email) {
      return new Response(JSON.stringify({ error: 'invalid payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const name    = payload.name || payload.email.split('@')[0];
    const html    = welcomeEmailHtml(name);
    const subject = `Selamat datang di KaffePOS, ${name}! ☕`;

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userList, error: listErr } = await adminClient.auth.admin.listUsers();
    if (listErr) throw new Error(`listUsers error: ${listErr.message}`);

    const user = userList?.users?.find((u: any) => u.email === payload.email);

    if (!user) {
      const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(payload.email, {
        data: { display_name: name },
        redirectTo: 'https://kaffepos.app',
      });
      if (inviteErr) throw new Error(`invite error: ${inviteErr.message}`);
    } else {
      console.log(`Welcome email skipped — user ${payload.email} already exists`);
    }

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'KaffePOS <onboarding@resend.dev>',
          to: [payload.email === 'kaffeposapp@gmail.com' ? payload.email : 'kaffeposapp@gmail.com'],
          subject,
          html,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true, method: 'supabase-admin' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('send-notification error:', e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
