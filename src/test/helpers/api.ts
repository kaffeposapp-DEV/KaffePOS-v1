import { vi, type Mock } from 'vitest';

export type FetchCall = {
  url: string;
  init: RequestInit;
};

export function createJsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function createSseResponse(events: unknown[]) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    },
  );
}

export function installFetchMock(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const call = { url, init };
    calls.push(call);
    return handler(call);
  }) as Mock<typeof fetch>;

  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    fetchMock,
  };
}

export function getRequestHeader(call: FetchCall, name: string) {
  return new Headers(call.init.headers).get(name);
}

export function getJsonRequestBody(call: FetchCall) {
  const body = call.init.body;
  if (typeof body !== 'string') {
    throw new Error('Expected JSON string request body.');
  }
  return JSON.parse(body) as Record<string, unknown>;
}

