import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const DEFAULT_PASSWORD_RESET_URL = 'https://kaffepos.my.id/reset-password';
const ALLOWED_WEB_REDIRECT_ORIGINS = new Set([
  'https://kaffepos.my.id',
  'https://www.kaffepos.my.id',
  'https://kaffepos.app',
  'https://www.kaffepos.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const ALLOWED_NATIVE_REDIRECT_PREFIXES = [
  'id.kaffeepos.app://',
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AuthEmailAction = 'signup' | 'resend_signup' | 'password_reset';

type AuthEmailPayload = {
  action: AuthEmailAction;
  email: string;
  password?: string;
  username?: string;
  displayName?: string;
  redirectTo?: string;
};

function isValidEmail(email: string) {
  return /\S+@\S+\.\S+/.test(email);
}

function isStrongPassword(password: string) {
  return password.length >= 10 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}

function normalizeUsername(value: string) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (base.length >= 3) return base.slice(0, 30);
  return '';
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function sanitizeRedirectTo(rawValue?: string) {
  const candidate = String(rawValue || '').trim();
  if (!candidate) return DEFAULT_PASSWORD_RESET_URL;

  if (ALLOWED_NATIVE_REDIRECT_PREFIXES.some((prefix) => candidate.startsWith(prefix))) {
    return candidate;
  }

  try {
    const parsed = new URL(candidate);
    if (ALLOWED_WEB_REDIRECT_ORIGINS.has(parsed.origin)) {
      return candidate;
    }
  } catch {
    // Ignore invalid URLs and fall back to the trusted default.
  }

  return DEFAULT_PASSWORD_RESET_URL;
}

function buildPreview(html: string) {
  return `
<!DOCTYPE html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KaffePOS</title>
  </head>
  <body style="margin:0;padding:0;background:#f4efe8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;">
    <div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid #eadfce;">
      <div style="padding:24px 28px;background:#17171b;color:#fff;">
        <div style="font-size:13px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#d59a4b;">KaffePOS</div>
        <div style="margin-top:10px;font-size:28px;font-weight:800;line-height:1.2;">Sistem kasir yang tetap sinkron di web dan APK.</div>
      </div>
      <div style="padding:28px;">${html}</div>
      <div style="padding:20px 28px;border-top:1px solid #eadfce;font-size:12px;line-height:1.7;color:#6b7280;">
        Email ini dikirim otomatis dari KaffePOS via Resend untuk alur autentikasi akun Anda.
      </div>
    </div>
  </body>
</html>
`;
}

function signupEmailHtml(name: string, otp: string) {
  return buildPreview(`
    <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#b66a1f;">Verifikasi Akun</p>
    <h1 style="margin:0 0 12px;font-size:30px;line-height:1.2;color:#111827;">Masukkan kode ini untuk mengaktifkan akunmu.</h1>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151;">Halo <strong>${name}</strong>, akun KaffePOS kamu sudah dibuat di database Supabase dan tinggal satu langkah lagi untuk aktif penuh.</p>
    <div style="margin:24px 0;padding:20px;border:1px solid #eadfce;background:#faf6ef;text-align:center;">
      <div style="font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#9a6b33;">Kode Verifikasi</div>
      <div style="margin-top:10px;font-size:34px;font-weight:800;letter-spacing:0.32em;color:#17171b;">${otp}</div>
    </div>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#6b7280;">Kode berlaku selama 30 menit. Jika kamu tidak merasa mendaftar, abaikan email ini dengan aman.</p>
  `);
}

function passwordResetHtml(name: string, actionLink: string) {
  return buildPreview(`
    <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#b66a1f;">Reset Password</p>
    <h1 style="margin:0 0 12px;font-size:30px;line-height:1.2;color:#111827;">Atur ulang password akunmu.</h1>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#374151;">Halo <strong>${name}</strong>, kami menerima permintaan untuk mengganti password akun KaffePOS kamu.</p>
    <div style="margin:24px 0;">
      <a href="${actionLink}" style="display:inline-block;padding:14px 22px;background:#b66a1f;color:#fff;text-decoration:none;font-weight:800;">Buka Halaman Reset Password</a>
    </div>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#6b7280;">Kalau tombol tidak terbuka, salin link ini ke browser:</p>
    <p style="margin:0;font-size:13px;line-height:1.8;color:#b66a1f;word-break:break-all;">${actionLink}</p>
  `);
}

async function findUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
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

function generateOtp() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

async function storeSignupOtp(adminClient: ReturnType<typeof createClient>, email: string, code: string) {
  await adminClient
    .from('email_verification_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('email', email)
    .eq('purpose', 'signup')
    .is('consumed_at', null);

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const hashedCode = await sha256Hex(code);
  const { error } = await adminClient.from('email_verification_codes').insert({
    email,
    purpose: 'signup',
    code: hashedCode,
    expires_at: expiresAt,
  });
  if (error) throw error;
}

async function ensureProfileRecord(
  adminClient: ReturnType<typeof createClient>,
  params: {
    userId: string;
    email: string;
    normalizedUsername: string;
    displayName: string;
  },
) {
  const { error } = await adminClient.from('profiles').upsert({
    id: params.userId,
    email: params.email,
    username: params.normalizedUsername,
    display_name: params.displayName,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function insertEmailNotification(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  message: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await adminClient.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type: 'success',
    metadata,
  });
  if (error) throw error;
}

async function sendResendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'KaffePOS <noreply@kaffepos.my.id>',
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend API failed: ${await response.text()}`);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json() as AuthEmailPayload;
    const cleanEmail = String(payload.email || '').trim().toLowerCase();
    const cleanUsername = String(payload.username || '').trim();
    const displayName = String(payload.displayName || cleanUsername || cleanEmail.split('@')[0]).trim();
    const redirectTo = sanitizeRedirectTo(payload.redirectTo);
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';

    if (!payload.action || !['signup', 'resend_signup', 'password_reset'].includes(payload.action)) {
      return new Response(JSON.stringify({ error: 'Aksi auth email tidak valid.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isValidEmail(cleanEmail)) {
      return new Response(JSON.stringify({ error: 'Format email tidak valid.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (payload.action === 'signup') {
      await enforceRateLimit(adminClient, `auth:signup:${cleanEmail}`, ip, 5, 30);
      await enforceRateLimit(adminClient, `auth:signup-ip:${ip}`, ip, 20, 30);

      if (!cleanUsername || cleanUsername.length < 3) {
        return new Response(JSON.stringify({ error: 'Nama toko / username minimal 3 karakter.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const password = String(payload.password || '');
      if (!isStrongPassword(password)) {
        return new Response(JSON.stringify({ error: 'Password minimal 10 karakter dan wajib mengandung huruf besar, huruf kecil, serta angka.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const normalizedUsername = normalizeUsername(cleanUsername);
      if (!normalizedUsername) {
        return new Response(JSON.stringify({ error: 'Nama toko / username tidak valid.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let user = await findUserByEmail(adminClient, cleanEmail);
      const { data: existingProfile } = await adminClient
        .from('profiles')
        .select('id,email')
        .eq('username', normalizedUsername)
        .maybeSingle();

      if (existingProfile && existingProfile.email?.toLowerCase() !== cleanEmail && existingProfile.id !== user?.id) {
        return new Response(JSON.stringify({ error: 'Nama toko / username sudah digunakan. Pakai nama lain ya.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let message = 'Akun berhasil dibuat. Kode verifikasi sudah dikirim ke email bisnis kamu.';

      if (user?.email_confirmed_at) {
        return new Response(JSON.stringify({ error: 'Email sudah terdaftar. Silakan login.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!user) {
        const { data, error } = await adminClient.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: false,
          user_metadata: {
            username: normalizedUsername,
            display_name: displayName,
          },
        });

        if (error || !data.user) {
          return new Response(JSON.stringify({ error: error?.message || 'Pendaftaran gagal diproses.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        user = data.user;
        await ensureProfileRecord(adminClient, {
          userId: user.id,
          email: cleanEmail,
          normalizedUsername,
          displayName,
        });
      } else {
        message = 'Akun dengan email ini sudah ada tetapi belum aktif. Kode verifikasi baru sudah kami kirim.';
        const { error: updateUserError } = await adminClient.auth.admin.updateUserById(user.id, {
          password,
          user_metadata: {
            ...(user.user_metadata ?? {}),
            username: normalizedUsername,
            display_name: displayName,
          },
        });
        if (updateUserError) throw updateUserError;

        await ensureProfileRecord(adminClient, {
          userId: user.id,
          email: cleanEmail,
          normalizedUsername,
          displayName,
        });
      }

      const otp = generateOtp();
      await storeSignupOtp(adminClient, cleanEmail, otp);
      await sendResendEmail(
        cleanEmail,
        'Kode verifikasi akun KaffePOS',
        signupEmailHtml(displayName || cleanEmail.split('@')[0], otp),
      );

      await insertEmailNotification(
        adminClient,
        user.id,
        'Kode verifikasi dikirim',
        'Kode verifikasi akun KaffePOS telah dikirim ke email bisnis.',
        { channel: 'email', provider: 'resend', type: 'verification' },
      );

      return new Response(JSON.stringify({
        ok: true,
        needsVerification: true,
        message,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (payload.action === 'resend_signup') {
      await enforceRateLimit(adminClient, `auth:resend:${cleanEmail}`, ip, 5, 30);
      await enforceRateLimit(adminClient, `auth:resend-ip:${ip}`, ip, 20, 30);
      const user = await findUserByEmail(adminClient, cleanEmail);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Akun tidak ditemukan untuk email ini.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (user.email_confirmed_at) {
        return new Response(JSON.stringify({ error: 'Email ini sudah diverifikasi. Silakan login.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const otp = generateOtp();
      await storeSignupOtp(adminClient, cleanEmail, otp);
      const name = user.user_metadata?.display_name || user.user_metadata?.username || cleanEmail.split('@')[0];

      await sendResendEmail(
        cleanEmail,
        'Kode verifikasi baru KaffePOS',
        signupEmailHtml(String(name), otp),
      );
      await insertEmailNotification(
        adminClient,
        user.id,
        'Kode verifikasi baru dikirim',
        'Kode verifikasi terbaru telah dikirim ulang ke email bisnis.',
        { channel: 'email', provider: 'resend', type: 'verification_resend' },
      );

      return new Response(JSON.stringify({
        ok: true,
        needsVerification: true,
        message: 'Kode verifikasi baru sudah dikirim ke email bisnis kamu.',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await enforceRateLimit(adminClient, `auth:password-reset:${cleanEmail}`, ip, 5, 30);
    await enforceRateLimit(adminClient, `auth:password-reset-ip:${ip}`, ip, 20, 30);
    const user = await findUserByEmail(adminClient, cleanEmail);

    if (!user) {
      return new Response(JSON.stringify({
        ok: true,
        message: 'Jika email terdaftar, link reset password akan dikirim ke inbox.',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: cleanEmail,
      options: { redirectTo },
    });

    if (error || !data.properties?.action_link) {
      return new Response(JSON.stringify({ error: error?.message || 'Gagal membuat link reset password.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const name = user.user_metadata?.display_name || user.user_metadata?.username || cleanEmail.split('@')[0];
    await sendResendEmail(
      cleanEmail,
      'Reset password akun KaffePOS',
      passwordResetHtml(String(name), data.properties.action_link),
    );

    await insertEmailNotification(
      adminClient,
      user.id,
      'Email reset password dikirim',
      'Link reset password telah dikirim ke email bisnis.',
      { channel: 'email', provider: 'resend', type: 'password_reset' },
    );

    return new Response(JSON.stringify({
      ok: true,
      message: 'Link reset password telah dikirim ke inbox email bisnis kamu.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('auth-email error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Auth email gagal diproses.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
