import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendResendEmailWithRetry } from '../_shared/resend.ts';
import { maybeSendEdgeFailureAlert, recordEdgeEvent } from '../_shared/edge-monitor.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EDGE_ALERT_EMAIL = Deno.env.get('EDGE_ALERT_EMAIL') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type VerificationPayload = {
  email?: string;
  code?: string;
};

async function findUserByEmail(adminClient: any, email: string) {
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((entry: any) => entry.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeUsername(value: string) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (base.length >= 3) return base.slice(0, 30);
  return '';
}

async function ensureProfileRecord(adminClient: any, user: any, email: string) {
  const displayName = String(
    user.user_metadata?.display_name ||
    user.user_metadata?.username ||
    email.split('@')[0],
  ).trim();
  const normalizedUsername = normalizeUsername(
    String(user.user_metadata?.username || displayName || email.split('@')[0]),
  ) || normalizeUsername(email.split('@')[0]) || `user_${user.id.slice(0, 8)}`;

  const { error } = await adminClient.from('profiles').upsert({
    id: user.id,
    email,
    username: normalizedUsername,
    display_name: displayName,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  if (error) throw error;
}

function getWelcomeHtml(name: string) {
  return `
<!DOCTYPE html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Selamat datang di KaffePOS</title>
  </head>
  <body style="margin:0;padding:0;background:#f4efe8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;">
    <div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid #eadfce;">
      <div style="padding:24px 28px;background:#17171b;color:#fff;">
        <div style="font-size:13px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#d59a4b;">KaffePOS</div>
        <div style="margin-top:10px;font-size:28px;font-weight:800;line-height:1.2;">Akunmu sudah aktif.</div>
      </div>
      <div style="padding:28px;">
        <p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:#374151;">Halo <strong>${name}</strong>, verifikasi email berhasil dan akun KaffePOS kamu sudah siap dipakai.</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#6b7280;">Sekarang kamu bisa login dari web maupun APK dan data akan tetap sinkron dengan database Supabase.</p>
        <a href="https://kaffepos.my.id/login" style="display:inline-block;padding:14px 22px;background:#b66a1f;color:#fff;text-decoration:none;font-weight:800;">Masuk ke KaffePOS</a>
      </div>
    </div>
  </body>
</html>
`;
}

async function sendResendEmail(to: string, subject: string, html: string) {
  await sendResendEmailWithRetry({
    apiKey: RESEND_API_KEY,
    to,
    subject,
    html,
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let adminClient: any = null;
  let cleanEmail = '';
  let ip = 'unknown';

  try {
    const payload = await req.json() as VerificationPayload;
    const { email, code } = payload;
    cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCode = String(code || '').replace(/\D/g, '');
    ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';

    if (!cleanEmail || !cleanCode) {
      return new Response(JSON.stringify({ error: 'Email dan kode verifikasi wajib diisi.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (cleanCode.length !== 6) {
      return new Response(JSON.stringify({ error: 'Kode verifikasi harus 6 digit.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await enforceRateLimit(
      adminClient,
      `verify-email:${cleanEmail}`,
      ip,
      10,
      10,
      new Date(),
      'Terlalu banyak percobaan verifikasi. Tunggu beberapa menit lalu coba lagi.',
    );
    await enforceRateLimit(
      adminClient,
      `verify-email-ip:${ip}`,
      ip,
      30,
      10,
      new Date(),
      'Terlalu banyak percobaan verifikasi. Tunggu beberapa menit lalu coba lagi.',
    );

    const hashedCode = await sha256Hex(cleanCode);
    const candidateCodes = Array.from(new Set([hashedCode, cleanCode]));

    const { data: otpRows, error: otpError } = await adminClient
      .from('email_verification_codes')
      .select('id, code, expires_at, consumed_at')
      .eq('email', cleanEmail)
      .eq('purpose', 'signup')
      .in('code', candidateCodes)
      .is('consumed_at', null)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(2);

    if (otpError) throw otpError;

    const otpRow = otpRows?.[0] ?? null;

    if (!otpRow) {
      const { data: activeCode } = await adminClient
        .from('email_verification_codes')
        .select('id')
        .eq('email', cleanEmail)
        .eq('purpose', 'signup')
        .is('consumed_at', null)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return new Response(JSON.stringify({
        error: activeCode
          ? 'Kode verifikasi salah. Gunakan kode 6 digit terbaru dari email Anda.'
          : 'Kode verifikasi tidak ditemukan atau sudah kedaluwarsa. Kirim ulang kode lalu coba lagi.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const user = await findUserByEmail(adminClient, cleanEmail);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Akun tidak ditemukan untuk email ini.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: confirmError } = await adminClient.auth.admin.updateUserById(
      user.id,
      { email_confirm: true }
    );
    if (confirmError) throw confirmError;
    await ensureProfileRecord(adminClient, user, cleanEmail);

    const now = new Date().toISOString();
    await adminClient
      .from('email_verification_codes')
      .update({ consumed_at: now })
      .eq('email', cleanEmail)
      .eq('purpose', 'signup')
      .is('consumed_at', null);

    await adminClient.from('notifications').insert({
      user_id: user.id,
      title: 'Email berhasil diverifikasi',
      message: 'Akun KaffePOS berhasil diaktifkan melalui kode verifikasi.',
      type: 'success',
      metadata: { channel: 'email', method: 'otp', type: 'verification' },
    });

    const name = user.user_metadata?.display_name || user.user_metadata?.username || cleanEmail.split('@')[0];
    try {
      await sendResendEmail(
        cleanEmail,
        'Selamat datang di KaffePOS',
        getWelcomeHtml(String(name)),
      );
      await adminClient.from('notifications').insert({
        user_id: user.id,
        title: 'Email welcome dikirim',
        message: 'Email welcome berhasil dikirim setelah verifikasi akun.',
        type: 'success',
        metadata: { channel: 'email', provider: 'resend', type: 'welcome' },
      });
    } catch (emailError) {
      console.error('welcome-email error:', emailError);
    }
    await recordEdgeEvent(adminClient, {
      functionName: 'verify-email-code',
      status: 'success',
      message: `Verifikasi email sukses untuk ${cleanEmail}`,
      requestEmail: cleanEmail,
      requestIp: ip,
    });

    return new Response(JSON.stringify({
      ok: true,
      message: 'Email berhasil diverifikasi. Silakan masuk ke KaffePOS.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    if (!adminClient && SUPABASE_URL && SUPABASE_SERVICE) {
      adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    if (adminClient) {
      await recordEdgeEvent(adminClient, {
        functionName: 'verify-email-code',
        status: 'failure',
        message: String(e?.message || e || 'Verifikasi gagal.'),
        requestEmail: cleanEmail || null,
        requestIp: ip,
      });
      await maybeSendEdgeFailureAlert({
        adminClient,
        functionName: 'verify-email-code',
        requestIp: ip,
        resendApiKey: RESEND_API_KEY,
        alertEmail: EDGE_ALERT_EMAIL,
      });
    }
    return new Response(JSON.stringify({ error: e?.message || 'Verifikasi gagal.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
