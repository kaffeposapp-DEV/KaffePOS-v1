import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

async function enforceRateLimit(
  adminClient: any,
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
    throw new Error('Terlalu banyak percobaan verifikasi. Tunggu beberapa menit lalu coba lagi.');
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json() as VerificationPayload;
    const { email, code } = payload;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCode = String(code || '').replace(/\D/g, '');
    const ip =
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

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await enforceRateLimit(adminClient, `verify-email:${cleanEmail}`, ip, 10, 10);
    await enforceRateLimit(adminClient, `verify-email-ip:${ip}`, ip, 30, 10);

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

    return new Response(JSON.stringify({
      ok: true,
      message: 'Email berhasil diverifikasi. Silakan masuk ke KaffePOS.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Verifikasi gagal.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
