import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_EMAILS = ['kaffeposapp@gmail.com'];

type ActivateSubscriptionPayload = {
  userId: string;
  plan: 'secangkir' | 'kopi_susu' | 'signature' | 'founder';
  billingCycle: 'free' | 'monthly' | 'quarterly' | 'yearly';
  paymentAmount: number;
  paymentNote?: string;
};

const PLAN_FEATURES: Record<ActivateSubscriptionPayload['plan'], string[]> = {
  secangkir: [
    'POS kasir untuk transaksi harian',
    'Manajemen menu dan kategori',
    'Riwayat transaksi dasar',
    'Laporan harian',
  ],
  kopi_susu: [
    'Semua fitur Secangkir',
    'Export PDF dan Excel',
    'Laporan mingguan dan bulanan',
    'Support prioritas via Instagram',
  ],
  signature: [
    'Semua fitur Kopi Susu',
    'Thermal printer Bluetooth & USB',
    'AI Insight penjualan',
    'Multi kasir / multi pengguna',
  ],
  founder: [
    'Semua fitur Signature',
    'Pendampingan setup prioritas',
    'Support admin lebih cepat',
    'Cocok untuk outlet dengan traffic tinggi',
  ],
};

function formatDateId(value: string | Date | null) {
  if (!value) return 'Tidak ada batas waktu';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function calculateExpiryDate(billingCycle: ActivateSubscriptionPayload['billingCycle']) {
  if (billingCycle === 'free') return null;
  const expiresAt = new Date();
  const days = billingCycle === 'monthly' ? 30 : billingCycle === 'quarterly' ? 90 : 365;
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

async function getRequesterEmail(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  return user?.email?.toLowerCase() || null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const url = Deno.env.get('SUPABASE_URL')!;
    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '');
    const requesterEmail = await getRequesterEmail(req);
    const isServiceRoleCall = bearer === serviceKey;
    const isAllowedAdmin = requesterEmail ? ADMIN_EMAILS.includes(requesterEmail) : false;

    if (!isServiceRoleCall && !isAllowedAdmin) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: ActivateSubscriptionPayload = await req.json();
    if (!payload.userId || !payload.plan || !payload.billingCycle) {
      return new Response(JSON.stringify({ error: 'Input aktivasi belum lengkap.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (payload.paymentAmount < 0) {
      return new Response(JSON.stringify({ error: 'Nominal pembayaran tidak valid.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date();
    const expiresAt = calculateExpiryDate(payload.billingCycle);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, username, display_name')
      .eq('id', payload.userId)
      .single();
    if (profileError || !profile) throw profileError || new Error('User tidak ditemukan.');

    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('owner_id', payload.userId)
      .maybeSingle();

    const { data: activeRow } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', payload.userId)
      .eq('status', 'active')
      .order('activated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeRow?.id) {
      await supabaseAdmin
        .from('subscriptions')
        .update({ status: expiresAt && expiresAt <= now ? 'expired' : 'cancelled', updated_at: now.toISOString() })
        .eq('id', activeRow.id);
    }

    const subscriptionPayload = {
      user_id: payload.userId,
      store_id: store?.id ?? null,
      tier: payload.plan === 'secangkir' ? 'basic' : 'pro',
      period: payload.billingCycle === 'free' ? 'free' : payload.billingCycle,
      plan: payload.plan,
      billing_cycle: payload.billingCycle,
      status: 'active',
      activated_at: now.toISOString(),
      expires_at: expiresAt?.toISOString() ?? null,
      amount_paid: payload.paymentAmount,
      payment_amount: payload.paymentAmount,
      payment_method: payload.plan === 'secangkir' ? 'free' : 'manual_transfer',
      payment_note: payload.paymentNote || null,
      payment_ref: payload.plan === 'secangkir' ? 'FREE-AUTO' : `MANUAL-${now.getTime()}`,
      updated_at: now.toISOString(),
    };

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .insert(subscriptionPayload)
      .select()
      .single();
    if (subscriptionError) throw subscriptionError;

    const { error: paymentError } = await supabaseAdmin
      .from('payment_history')
      .insert({
        user_id: payload.userId,
        subscription_id: subscription.id,
        plan: payload.plan,
        billing_cycle: payload.billingCycle,
        amount: payload.paymentAmount,
        payment_method: payload.plan === 'secangkir' ? 'free' : 'manual_transfer',
        payment_note: payload.paymentNote || null,
        payment_ref: subscription.payment_ref,
        status: 'success',
        paid_at: now.toISOString(),
      });
    if (paymentError) throw paymentError;

    if (profile.email && payload.plan !== 'secangkir') {
      await supabaseAdmin.functions.invoke('send-notification', {
        body: {
          type: 'subscription_activated',
          email: profile.email,
          name: profile.display_name || profile.username || profile.email.split('@')[0],
          plan: payload.plan,
          billingCycle: payload.billingCycle,
          expiresAt: formatDateId(expiresAt),
          features: PLAN_FEATURES[payload.plan],
          subject: 'Langganan KaffePOS kamu sudah aktif! ☕',
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      subscriptionId: subscription.id,
      expires_at: expiresAt?.toISOString() ?? null,
      message: 'Langganan berhasil diaktifkan.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('activate-subscription error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Terjadi kesalahan saat aktivasi.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
