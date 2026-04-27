import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeKitchenEvents } from '@/lib/backendApi';
import { createSseResponse, installFetchMock } from '@/test/helpers/api';
import { makeKitchenRealtimeEvent } from '@/test/helpers/factories';
import { seedStoredAuthSession } from '@/test/helpers/browser';

describe('kitchen realtime integration scaffold', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('parses SSE kitchen events, ignores ping frames, and sends auth header', async () => {
    seedStoredAuthSession({ accessToken: 'token-sse' });
    const event = makeKitchenRealtimeEvent({
      id: 'event_sse_1',
      store_id: 'store_test',
    });
    const receivedEvents: string[] = [];
    const statuses: string[] = [];
    const { calls } = installFetchMock(() => createSseResponse([{ type: 'ping' }, event]));

    const unsubscribe = subscribeKitchenEvents({
      storeId: 'store_test',
      onEvent: (nextEvent) => receivedEvents.push(nextEvent.id),
      onStatus: (status) => statuses.push(status),
    });

    await vi.waitFor(() => {
      expect(receivedEvents).toEqual(['event_sse_1']);
    });
    unsubscribe();

    expect(calls[0].url).toBe('/api/kitchen/events?storeId=store_test');
    expect(calls[0].init.method).toBe('GET');
    expect(new Headers(calls[0].init.headers).get('Accept')).toBe('text/event-stream');
    expect(new Headers(calls[0].init.headers).get('Authorization')).toBe('Bearer token-sse');
    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');
  });
});

