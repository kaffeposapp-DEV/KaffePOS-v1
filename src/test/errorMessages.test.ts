import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/backendApi';
import { normalizeUserFacingError } from '@/lib/errorMessages';

describe('normalizeUserFacingError', () => {
  it('keeps email verification sentinel for auth flow handling', () => {
    expect(normalizeUserFacingError(new ApiError('email_not_confirmed', 403))).toBe('email_not_confirmed');
  });

  it('keeps actionable login account messages instead of session-expired copy', () => {
    expect(normalizeUserFacingError(new ApiError('Akun belum punya password aktif. Gunakan menu lupa password.', 401)))
      .toBe('Akun belum punya password aktif. Gunakan menu lupa password.');
  });
});
