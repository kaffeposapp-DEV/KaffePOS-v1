import { describe, expect, it } from 'vitest';
import {
  getAuthModeFromLocation,
  getAuthPathForMode,
  hasAuthCallbackParams,
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

  it('detects callback params from search and hash fragments', () => {
    expect(hasAuthCallbackParams(new URL('https://kaffepos.my.id/auth/callback?code=abc123'))).toBe(true);
    expect(hasAuthCallbackParams(new URL('https://kaffepos.my.id/auth/callback#access_token=token'))).toBe(true);
    expect(hasAuthCallbackParams(new URL('https://kaffepos.my.id/login'))).toBe(false);
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
});
