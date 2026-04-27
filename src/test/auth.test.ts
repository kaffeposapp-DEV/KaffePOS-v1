import { describe, it, expect, beforeEach } from 'vitest';
import { clearStoredAuthSession, ensureStoredAuthSessionShape, getStoredAuthSession, isSessionExpired, saveStoredAuthSession } from '@/lib/authSession';

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

    expect(cached).toMatchObject(session);
  });

  it('mengenali session yang sudah kedaluwarsa', async () => {
    const expiredSession = {
      accessToken: 'token-123',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      user: { id: '123', email: 'test@example.com' },
    };

    expect(isSessionExpired(expiredSession)).toBe(true);
  });

  it('membersihkan session cache yang korup tanpa me-reset storage lain', async () => {
    localStorage.setItem('kaffepos_auth_session', '{"broken":true}');
    localStorage.setItem('kpos_app_theme', 'custom');

    const result = await ensureStoredAuthSessionShape();

    expect(result).toBe('cleared');
    expect(await getStoredAuthSession()).toBeNull();
    expect(localStorage.getItem('kpos_app_theme')).toBe('custom');
  });
});
