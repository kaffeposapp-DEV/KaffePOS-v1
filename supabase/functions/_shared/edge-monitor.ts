import { sendResendEmailWithRetry } from './resend.ts';

type EdgeEventInput = {
  functionName: string;
  status: 'success' | 'failure' | 'alert_sent';
  message: string;
  requestEmail?: string | null;
  requestIp?: string | null;
  metadata?: Record<string, unknown>;
};

function truncate(value: string, max = 1000) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export async function recordEdgeEvent(adminClient: any, input: EdgeEventInput) {
  if (!adminClient) return;

  const { error } = await adminClient.from('edge_function_events').insert({
    function_name: input.functionName,
    status: input.status,
    message: truncate(input.message || input.status),
    request_email: input.requestEmail || null,
    request_ip: input.requestIp || null,
    metadata: input.metadata || {},
  });

  if (error) {
    console.error('recordEdgeEvent error:', error);
  }
}

export async function maybeSendEdgeFailureAlert(params: {
  adminClient: any;
  functionName: string;
  requestIp?: string | null;
  resendApiKey?: string;
  alertEmail?: string;
  threshold?: number;
  windowMinutes?: number;
  cooldownMinutes?: number;
}) {
  const {
    adminClient,
    functionName,
    requestIp,
    resendApiKey,
    alertEmail,
    threshold = 5,
    windowMinutes = 15,
    cooldownMinutes = 30,
  } = params;

  if (!adminClient || !resendApiKey || !alertEmail) return false;

  const now = Date.now();
  const windowStart = new Date(now - windowMinutes * 60 * 1000).toISOString();
  const cooldownStart = new Date(now - cooldownMinutes * 60 * 1000).toISOString();

  const { count, error: countError } = await adminClient
    .from('edge_function_events')
    .select('id', { count: 'exact', head: true })
    .eq('function_name', functionName)
    .eq('status', 'failure')
    .gte('created_at', windowStart);

  if (countError) {
    console.error('maybeSendEdgeFailureAlert count error:', countError);
    return false;
  }

  if ((count || 0) < threshold) return false;

  const { data: recentAlert, error: recentAlertError } = await adminClient
    .from('edge_function_events')
    .select('id')
    .eq('function_name', functionName)
    .eq('status', 'alert_sent')
    .gte('created_at', cooldownStart)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentAlertError) {
    console.error('maybeSendEdgeFailureAlert recent alert error:', recentAlertError);
    return false;
  }

  if (recentAlert) return false;

  const subject = `[KaffePOS Alert] ${functionName} gagal ${count}x dalam ${windowMinutes} menit`;
  const html = `
<!DOCTYPE html>
<html lang="id">
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#0f172a;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;padding:24px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#b45309;">KaffePOS Edge Alert</p>
      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">${functionName} sedang bermasalah.</h1>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:#334155;">
        Dalam ${windowMinutes} menit terakhir ada <strong>${count}</strong> kegagalan pada edge function <strong>${functionName}</strong>.
      </p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#475569;">
        IP terakhir: <strong>${requestIp || '-'}</strong>
      </p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">
        Tindakan awal: cek log Supabase function, cek dashboard Resend, lalu tes flow terkait dari aplikasi.
      </p>
    </div>
  </body>
</html>
`;

  try {
    await sendResendEmailWithRetry({
      apiKey: resendApiKey,
      to: alertEmail,
      subject,
      html,
    });

    await recordEdgeEvent(adminClient, {
      functionName,
      status: 'alert_sent',
      message: `Alert email terkirim ke ${alertEmail}`,
      requestIp,
      metadata: {
        threshold,
        windowMinutes,
        failureCount: count,
      },
    });
    return true;
  } catch (error) {
    console.error('maybeSendEdgeFailureAlert send error:', error);
    return false;
  }
}
