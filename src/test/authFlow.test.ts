import { describe, expect, it } from 'vitest';
import {
  getAuthModeFromLocation,
  getAuthPathForMode,
  getPasswordResetParams,
  isExistingSignupAttempt,
  normalizeSignupErrorMessage,
} from '@/utils/authFlow';

describe('authFlow helpers', () => {
  it('maps pretty auth routes to the correct mode', () => {
    expect(getAuthModeFromLocation('/register', '')).toBe('register');
    expect(getAuthModeFromLocation('/forgot-password', '')).toBe('forgot');
    expect(getAuthModeFromLocation('/auth', '?mode=reset')).toBe('reset');
    expect(getAuthPathForMode('login')).toBe('/login');
  });

  it('reads password reset params from the URL', () => {
    expect(
      getPasswordResetParams(new URL('https://kaffepos.my.id/reset-password?email=test@example.com&token=abc123'))
    ).toEqual({
      email: 'test@example.com',
      token: 'abc123',
    });
    expect(getPasswordResetParams(new URL('https://kaffepos.my.id/login'))).toEqual({
      email: null,
      token: null,
    });
  });

  it('recognizes obfuscated duplicate signup responses', () => {
    expect(
      isExistingSignupAttempt({
        session: null,
        user: { identities: [] },
      })
    ).toBe(true);

    expect(
      isExistingSignupAttempt({
        session: null,
        user: { identities: [{}] },
      })
    ).toBe(false);
  });

  it('normalizes duplicate and server signup errors for the UI', () => {
    expect(normalizeSignupErrorMessage({ message: 'User already registered', status: 400 })).toContain('Email sudah terdaftar');
    expect(normalizeSignupErrorMessage({ message: 'Database error saving new user', status: 500 })).toContain('Server pendaftaran sedang bermasalah');
  });

  it('normalizes raw fetch failures without exposing Failed to fetch', () => {
    expect(normalizeSignupErrorMessage({ message: 'Failed to fetch' })).toBe(
      'Tidak bisa terhubung ke server. Pastikan internet aktif atau coba lagi beberapa saat.',
    );
    expect(normalizeSignupErrorMessage({ message: 'net::ERR_INTERNET_DISCONNECTED' })).toBe(
      'Perangkat sedang offline. Sambungkan internet lalu coba lagi.',
    );
  });
});
