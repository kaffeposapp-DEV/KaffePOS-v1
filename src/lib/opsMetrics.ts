import { trackOpsEventRequest } from '@/lib/backendApi';

type OpsEventName =
  | 'login'
  | 'checkout'
  | 'transaction_created'
  | 'upgrade_clicked'
  | 'gamification_used'
  | 'loyalty_used'
  | 'pdf_exported'
  | 'payment_started'
  | 'payment_completed'
  | 'feedback_submitted'
  | 'client_error'
  | 'printer_error'
  | 'sync_error';
type OpsEventStatus = 'success' | 'failure';

type TrackOpsEventPayload = {
  event_name: OpsEventName;
  status: OpsEventStatus;
  email?: string;
  store_id?: string;
  transaction_id?: string;
  error_message?: string;
  metadata?: Record<string, unknown>;
};

export async function trackOpsEvent(payload: TrackOpsEventPayload) {
  try {
    await trackOpsEventRequest(payload);
  } catch {
    // fire-and-forget: metrics collection must never block auth or checkout flows
  }
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
    return String((error as Record<string, unknown>).message);
  }
  return 'Unknown client error';
}

function sanitizeErrorMessage(message: string) {
  return message
    .replace(/\s+/g, ' ')
    .replace(/(token|password|secret|key)=\S+/gi, '$1=[redacted]')
    .slice(0, 240)
    .trim();
}

export function buildClientErrorPayload(
  error: unknown,
  context: { source: string; store_id?: string | undefined; metadata?: Record<string, unknown> },
): TrackOpsEventPayload {
  const payload: TrackOpsEventPayload = {
    event_name: 'client_error',
    status: 'failure',
    error_message: sanitizeErrorMessage(readErrorMessage(error)),
    metadata: {
      source: context.source,
      ...context.metadata,
    },
  };

  if (context.store_id) payload.store_id = context.store_id;
  return payload;
}

export async function trackClientError(
  error: unknown,
  context: { source: string; store_id?: string | undefined; metadata?: Record<string, unknown> },
) {
  await trackOpsEvent(buildClientErrorPayload(error, context));
}
