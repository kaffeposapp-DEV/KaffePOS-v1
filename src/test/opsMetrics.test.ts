import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackOpsEventRequest } from '@/lib/backendApi';
import { buildClientErrorPayload, trackClientError } from '@/lib/opsMetrics';

vi.mock('@/lib/backendApi', () => ({
  trackOpsEventRequest: vi.fn().mockResolvedValue({ success: true }),
}));

describe('ops metrics error tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sanitizes runtime errors before sending client error telemetry', () => {
    const payload = buildClientErrorPayload(
      new Error('Failed to render\nstack line with token=secret-value and password=abc'),
      { source: 'global_error_boundary', metadata: { route: '/pos' } },
    );

    expect(payload).toMatchObject({
      event_name: 'client_error',
      status: 'failure',
      error_message: expect.stringContaining('Failed to render'),
      metadata: expect.objectContaining({ source: 'global_error_boundary', route: '/pos' }),
    });
    expect(payload.error_message).not.toContain('\n');
    expect(payload.error_message).not.toContain('secret-value');
    expect(payload.error_message?.length).toBeLessThanOrEqual(240);
  });

  it('sends client errors without blocking the app when telemetry fails', async () => {
    vi.mocked(trackOpsEventRequest).mockRejectedValueOnce(new Error('network down'));

    await expect(trackClientError(new Error('UI crashed'), { source: 'tab_error_boundary' })).resolves.toBeUndefined();

    expect(trackOpsEventRequest).toHaveBeenCalledWith(expect.objectContaining({
      event_name: 'client_error',
      status: 'failure',
    }));
  });
});
