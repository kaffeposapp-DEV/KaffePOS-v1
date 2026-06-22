import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../core/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('../core/errors', () => ({ log: vi.fn(), serializeError: (e: unknown) => ({ message: String(e) }) }));

import { pool } from '../core/db';
import { JobQueue } from './jobQueue';

const query = pool.query as unknown as Mock;
const flush = () => new Promise((r) => setTimeout(r, 0));
const sqlOf = (call: unknown[]) => String(call[0]);

describe('JobQueue (durable / Postgres-backed)', () => {
  beforeEach(() => query.mockReset());

  it('persists an enqueued job to background_jobs', async () => {
    query.mockResolvedValue({ rows: [] });
    const q = new JobQueue();
    const id = q.enqueue('email.welcome', { email: 'a@b.com' });
    expect(id).toMatch(/[0-9a-f-]{36}/);
    await flush();
    const insert = query.mock.calls.find((c) => /insert into public\.background_jobs/.test(sqlOf(c)));
    expect(insert).toBeTruthy();
    expect(insert![1][1]).toBe('email.welcome'); // name param
  });

  it('claims a job, runs the handler, and deletes it on success', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const q = new JobQueue();
    q.register('email.welcome', handler);
    query
      .mockResolvedValueOnce({}) // ensureSchema
      .mockResolvedValueOnce({ rows: [{ id: 'j1', name: 'email.welcome', payload: { email: 'a@b.com' }, attempts: 0, max_attempts: 3 }] }) // claim
      .mockResolvedValueOnce({}); // delete

    const processed = await (q as unknown as { processOne(): Promise<boolean> }).processOne();

    expect(processed).toBe(true);
    expect(handler).toHaveBeenCalledWith({ email: 'a@b.com' });
    expect(query.mock.calls.some((c) => /delete from public\.background_jobs/.test(sqlOf(c)))).toBe(true);
  });

  it('reschedules with incremented attempts when the handler throws (not yet at max)', async () => {
    const q = new JobQueue();
    q.register('email.welcome', vi.fn().mockRejectedValue(new Error('smtp down')));
    query
      .mockResolvedValueOnce({}) // ensureSchema
      .mockResolvedValueOnce({ rows: [{ id: 'j1', name: 'email.welcome', payload: {}, attempts: 0, max_attempts: 3 }] }) // claim
      .mockResolvedValueOnce({}); // retry update

    await (q as unknown as { processOne(): Promise<boolean> }).processOne();

    const retry = query.mock.calls.find((c) => /status = 'pending', attempts/.test(sqlOf(c)));
    expect(retry).toBeTruthy();
    expect(retry![1][1]).toBe(1); // attempts -> 1
  });

  it('dead-letters the job after the final attempt fails', async () => {
    const q = new JobQueue();
    q.register('email.welcome', vi.fn().mockRejectedValue(new Error('still down')));
    query
      .mockResolvedValueOnce({}) // ensureSchema
      .mockResolvedValueOnce({ rows: [{ id: 'j1', name: 'email.welcome', payload: {}, attempts: 2, max_attempts: 3 }] }) // claim (last attempt)
      .mockResolvedValueOnce({}); // fail update

    await (q as unknown as { processOne(): Promise<boolean> }).processOne();

    const dead = query.mock.calls.find((c) => /status = 'failed', attempts/.test(sqlOf(c)));
    expect(dead).toBeTruthy();
    expect(dead![1][1]).toBe(3); // attempts -> 3
  });

  it('marks a job failed when no handler is registered for its name', async () => {
    const q = new JobQueue();
    query
      .mockResolvedValueOnce({}) // ensureSchema
      .mockResolvedValueOnce({ rows: [{ id: 'j1', name: 'unknown.job', payload: {}, attempts: 0, max_attempts: 3 }] }) // claim
      .mockResolvedValueOnce({}); // fail update

    const processed = await (q as unknown as { processOne(): Promise<boolean> }).processOne();
    expect(processed).toBe(true);
    expect(query.mock.calls.some((c) => /last_error = 'missing handler'/.test(sqlOf(c)))).toBe(true);
  });
});
