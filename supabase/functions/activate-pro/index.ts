// supabase/functions/activate-pro/index.ts
// Edge Function: Activate PRO subscription when license key is entered
// Deploy: supabase functions deploy activate-pro

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActivateRequest {
  license_key: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role (bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get calling user
    const authHeader = req.headers.get('Authorization')!;
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { license_key }: ActivateRequest = await req.json();
    if (!license_key?.trim()) {
      return new Response(JSON.stringify({ error: 'License key required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanKey = license_key.trim().toUpperCase();

    // ── 1. Validate license key ──────────────────────────────────
    const { data: licKey, error: licError } = await supabaseAdmin
      .from('license_keys')
      .select('*')
      .eq('key', cleanKey)
      .eq('is_used', false)
      .single();

    if (licError || !licKey) {
      return new Response(
        JSON.stringify({ error: 'Kunci lisensi tidak valid atau sudah digunakan' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check key hasn't expired
    if (licKey.expires_at && new Date(licKey.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Kunci lisensi sudah kadaluarsa' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── 2. Calculate expiry ──────────────────────────────────────
    const now = new Date();
    let expiresAt: Date | null = null;

    if (licKey.period === 'monthly') {
      expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }
    // lifetime → expiresAt stays null

    // ── 3. Mark key as used ──────────────────────────────────────
    await supabaseAdmin
      .from('license_keys')
      .update({
        is_used: true,
        used_by: user.id,
        used_at: now.toISOString(),
      })
      .eq('id', licKey.id);

    // ── 4. Upgrade profile tier ──────────────────────────────────
    await supabaseAdmin
      .from('profiles')
      .update({
        tier: licKey.tier,
        tier_expires_at: expiresAt?.toISOString() ?? null,
      })
      .eq('id', user.id);

    // ── 5. Create subscription record ────────────────────────────
    const storeResult = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    await supabaseAdmin
      .from('subscriptions')
      .insert({
        user_id: user.id,
        store_id: storeResult.data?.id ?? null,
        tier: licKey.tier,
        period: licKey.period,
        status: 'active',
        activated_at: now.toISOString(),
        expires_at: expiresAt?.toISOString() ?? null,
        payment_ref: cleanKey,
      });

    // ── 6. Send email notification ───────────────────────────────
    const profileResult = await supabaseAdmin
      .from('profiles')
      .select('username, email')
      .eq('id', user.id)
      .single();

    if (profileResult.data?.email) {
      await supabaseAdmin.functions.invoke('send-notification', {
        body: {
          to: profileResult.data.email,
          subject: `🎉 KaffePOS ${licKey.tier.toUpperCase()} Aktif!`,
          html: `
            <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
              <div style="background:#f97316;padding:24px;border-radius:12px 12px 0 0">
                <h1 style="color:white;margin:0">☕ KaffePOS</h1>
              </div>
              <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px">
                <h2>Selamat, ${profileResult.data.username}! 🎉</h2>
                <p>Akun Anda telah diupgrade ke <strong>${licKey.tier.toUpperCase()}</strong>.</p>
                <div style="background:#f1f5f9;padding:16px;border-radius:8px;margin:16px 0">
                  <p style="margin:0"><strong>Paket:</strong> ${licKey.tier.toUpperCase()} ${licKey.period === 'lifetime' ? 'Lifetime' : 'Bulanan'}</p>
                  <p style="margin:8px 0 0"><strong>Aktif sejak:</strong> ${now.toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'})}</p>
                  ${expiresAt ? `<p style="margin:8px 0 0"><strong>Berlaku hingga:</strong> ${expiresAt.toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'})}</p>` : '<p style="margin:8px 0 0"><strong>Berlaku:</strong> Selamanya ✨</p>'}
                </div>
                <a href="https://kaffepos.app" style="display:inline-block;background:#f97316;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Buka KaffePOS →</a>
              </div>
            </div>
          `,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        tier: licKey.tier,
        period: licKey.period,
        expires_at: expiresAt?.toISOString() ?? null,
        message: `Berhasil! Akun diupgrade ke ${licKey.tier.toUpperCase()}`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('activate-pro error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
