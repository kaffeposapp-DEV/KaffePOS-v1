import { beforeEach, describe, expect, it } from 'vitest';
import { enforceRateLimit } from '../supabase/functions/_shared/rate-limit.ts';

type RateLimitRow = {
  id: string;
  rate_key: string;
  hits: number;
  last_ip: string;
  window_started_at: string;
  updated_at: string;
};

class FakeRateLimitClient {
  rows: RateLimitRow[] = [];
  private nextId = 1;

  from(table: string) {
    if (table !== 'edge_rate_limits') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return new FakeRateLimitQuery(this);
  }

  insertRow(payload: Omit<RateLimitRow, 'id'>) {
    this.rows.push({ id: `row_${this.nextId++}`, ...payload });
  }
}

class FakeRateLimitQuery {
  private filters: Record<string, string> = {};
  private gteField: string | null = null;
  private gteValue: string | null = null;
  private updatePayload: Partial<RateLimitRow> | null = null;

  constructor(private readonly client: FakeRateLimitClient) {}

  select() {
    return this;
  }

  eq(field: string, value: string) {
    if (this.updatePayload) {
      const row = this.client.rows.find((item) => item.id === value);
      if (!row) return Promise.resolve({ error: null });
      Object.assign(row, this.updatePayload);
      return Promise.resolve({ error: null });
    }

    this.filters[field] = value;
    return this;
  }

  gte(field: string, value: string) {
    this.gteField = field;
    this.gteValue = value;
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  maybeSingle() {
    const row = this.client.rows
      .filter((item) => Object.entries(this.filters).every(([field, value]) => `${item[field as keyof RateLimitRow]}` === value))
      .filter((item) => {
        if (!this.gteField || !this.gteValue) return true;
        return `${item[this.gteField as keyof RateLimitRow]}` >= this.gteValue;
      })
      .sort((a, b) => b.window_started_at.localeCompare(a.window_started_at))[0] ?? null;

    return Promise.resolve({ data: row ? { id: row.id, hits: row.hits } : null, error: null });
  }

  insert(payload: Omit<RateLimitRow, 'id'>) {
    this.client.insertRow(payload);
    return Promise.resolve({ error: null });
  }

  update(payload: Partial<RateLimitRow>) {
    this.updatePayload = payload;
    return this;
  }
}

describe('edge rate limit helper', () => {
  let client: FakeRateLimitClient;

  beforeEach(() => {
    client = new FakeRateLimitClient();
  });

  it('membuat row baru saat key belum pernah dipakai', async () => {
    const now = new Date('2026-04-19T07:00:00.000Z');

    await enforceRateLimit(client, 'auth-email:test@example.com', '127.0.0.1', 5, 10, now);

    expect(client.rows).toHaveLength(1);
    expect(client.rows[0]).toMatchObject({
      rate_key: 'auth-email:test@example.com',
      hits: 1,
      last_ip: '127.0.0.1',
    });
  });

  it('menaikkan hits saat masih di bawah limit', async () => {
    client.insertRow({
      rate_key: 'verify-email:test@example.com',
      hits: 2,
      last_ip: '127.0.0.1',
      window_started_at: '2026-04-19T06:55:00.000Z',
      updated_at: '2026-04-19T06:55:00.000Z',
    });

    await enforceRateLimit(client, 'verify-email:test@example.com', '127.0.0.1', 5, 10, new Date('2026-04-19T07:00:00.000Z'));

    expect(client.rows[0].hits).toBe(3);
  });

  it('melempar error saat limit tercapai', async () => {
    client.insertRow({
      rate_key: 'send-notification:test@example.com',
      hits: 3,
      last_ip: '127.0.0.1',
      window_started_at: '2026-04-19T06:58:00.000Z',
      updated_at: '2026-04-19T06:58:00.000Z',
    });

    await expect(
      enforceRateLimit(client, 'send-notification:test@example.com', '127.0.0.1', 3, 10, new Date('2026-04-19T07:00:00.000Z')),
    ).rejects.toThrow('Terlalu banyak permintaan');
  });

  it('membuat window baru bila record lama sudah lewat masa aktif', async () => {
    client.insertRow({
      rate_key: 'auth-email:test@example.com',
      hits: 4,
      last_ip: '127.0.0.1',
      window_started_at: '2026-04-19T06:30:00.000Z',
      updated_at: '2026-04-19T06:30:00.000Z',
    });

    await enforceRateLimit(client, 'auth-email:test@example.com', '127.0.0.1', 5, 10, new Date('2026-04-19T07:00:00.000Z'));

    expect(client.rows).toHaveLength(2);
    expect(client.rows[1].hits).toBe(1);
  });
});
