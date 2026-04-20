import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { maybeSendEdgeFailureAlert, recordEdgeEvent } from '../_shared/edge-monitor.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const EDGE_ALERT_EMAIL = Deno.env.get('EDGE_ALERT_EMAIL') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_EVENT_NAMES = new Set(['login', 'checkout']);
const ALLOWED_STATUS = new Set(['success', 'failure']);

type Payload = {
  event_name?: string;
  status?: string;
  email?: string;
  store_id?: string;
  transaction_id?: string;
  error_message?: string;
  metadata?: Record<string, unknown>;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json() as Payload;
    const eventName = String(body.event_name || '').trim();
    const status = String(body.status || '').trim();
    const email = String(body.email || '').trim().toLowerCase() || null;
    const storeId = String(body.store_id || '').trim() || null;
    const transactionId = String(body.transaction_id || '').trim() || null;
    const errorMessage = String(body.error_message || '').trim() || null;
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

    if (!ALLOWED_EVENT_NAMES.has(eventName) || !ALLOWED_STATUS.has(status)) {
      return new Response(JSON.stringify({ error: 'Event tidak valid.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    let actorUserId: string | null = null;
    let actorEmail: string | null = email;

    if (authHeader.startsWith('Bearer ') && SUPABASE_ANON) {
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await authClient.auth.getUser();
      actorUserId = data.user?.id ?? null;
      actorEmail = data.user?.email?.trim().toLowerCase() ?? actorEmail;
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      null;
    const userAgent = req.headers.get('user-agent');

    const { error } = await adminClient.from('ops_event_logs').insert({
      event_name: eventName,
      status,
      actor_user_id: actorUserId,
      actor_email: actorEmail,
      store_id: storeId,
      transaction_id: transactionId,
      error_message: errorMessage,
      metadata,
      ip_address: ip,
      user_agent: userAgent,
      source: 'app',
    });

    if (error) throw error;

    await recordEdgeEvent(adminClient, {
      functionName: 'track-ops-event',
      status: 'success',
      message: `${eventName}:${status}`,
      requestEmail: actorEmail,
      requestIp: ip,
      metadata: {
        store_id: storeId,
        transaction_id: transactionId,
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      null;
    const message = error instanceof Error ? error.message : 'Track ops event gagal';

    await recordEdgeEvent(adminClient, {
      functionName: 'track-ops-event',
      status: 'failure',
      message,
      requestIp: ip,
      metadata: { edge_alert_email: EDGE_ALERT_EMAIL ? 'configured' : 'missing' },
    });
    await maybeSendEdgeFailureAlert(adminClient, {
      functionName: 'track-ops-event',
      threshold: 5,
      windowMinutes: 30,
      alertEmail: EDGE_ALERT_EMAIL,
      alertSubject: 'KaffePOS ops event tracker failure',
      alertText: `track-ops-event failure: ${message}`,
    });

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
