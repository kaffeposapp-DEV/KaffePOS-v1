import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/env', () => ({
  env: {
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM_EMAIL: 'KaffePOS <no-reply@kaffepos.my.id>',
    WEB_BASE_URL: 'https://kaffepos.my.id',
  },
}));
vi.mock('../../core/errors', () => ({ log: vi.fn() }));

import { EmailService } from './EmailService';

function stubFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string }) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response('{"id":"email_1"}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return calls;
}

describe('EmailService', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('escapes a user-supplied store name in the signup OTP email (no HTML injection)', async () => {
    const calls = stubFetch();
    const result = await EmailService.sendSignupOtp({
      to: 'owner@example.com',
      code: '123456',
      storeName: '<script>alert(1)</script>',
      ttlMinutes: 10,
    });

    expect(result).toEqual({ delivered: true, skipped: false });
    const body = calls[0].body as { html: string; from: string; to: string[]; tags: { name: string; value: string }[] };
    expect(body.html).not.toContain('<script>alert(1)</script>');
    expect(body.html).toContain('&lt;script&gt;');
    expect(body.html).toContain('123456');
    expect(body.from).toBe('KaffePOS <no-reply@kaffepos.my.id>');
    expect(body.to).toEqual(['owner@example.com']);
    expect(body.tags).toContainEqual({ name: 'category', value: 'signup_otp' });
  });

  it('escapes the lockout timestamp and tags the account-lockout email', async () => {
    const calls = stubFetch();
    await EmailService.sendAccountLockout({ to: 'owner@example.com', lockedUntil: new Date('2026-06-22T10:00:00Z') });
    const body = calls[0].body as { html: string; tags: { name: string; value: string }[] };
    expect(body.html).toContain('2026-06-22T10:00:00.000Z');
    expect(body.tags).toContainEqual({ name: 'category', value: 'account_lockout' });
  });

  it('includes a plain-text alternative for every email', async () => {
    const calls = stubFetch();
    await EmailService.sendWelcome({ to: 'owner@example.com', storeName: 'Kopi Senja' });
    const body = calls[0].body as { text: string; html: string };
    expect(body.text).toBeTruthy();
    expect(body.html).toContain('Kopi Senja');
  });
});
