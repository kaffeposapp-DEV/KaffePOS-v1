import { describe, it, expect, beforeEach } from 'vitest';
import { clearStoredAuthSession, getStoredAuthSession, isSessionExpired, saveStoredAuthSession } from '@/lib/authSession';

describe('Auth session storage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearStoredAuthSession();
  });

  it('menyimpan dan membaca session auth lokal', async () => {
    const session = {
      accessToken: 'token-123',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: { id: '123', email: 'test@example.com' },
    };

    await saveStoredAuthSession(session);
    const cached = await getStoredAuthSession();

    expect(cached).toEqual(session);
  });

  it('mengenali session yang sudah kedaluwarsa', async () => {
    const expiredSession = {
      accessToken: 'token-123',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      user: { id: '123', email: 'test@example.com' },
    };

    expect(isSessionExpired(expiredSession)).toBe(true);
  });
});
