import { trackOpsEventRequest } from '@/lib/backendApi';

type OpsEventName = 'login' | 'checkout';
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
