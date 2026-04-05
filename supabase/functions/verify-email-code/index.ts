import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, code } = await req.json();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCode = String(code || '').replace(/\D/g, '');

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

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: otpRow, error: otpError } = await adminClient
      .from('email_verification_codes')
      .select('id, code, expires_at, consumed_at')
      .eq('email', cleanEmail)
      .eq('purpose', 'signup')
      .eq('code', cleanCode)
      .is('consumed_at', null)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError) throw otpError;

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
      metadata: { channel: 'email', method: 'otp', type: 'verification' }
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
