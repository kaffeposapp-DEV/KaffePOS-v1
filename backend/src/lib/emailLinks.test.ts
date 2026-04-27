import { describe, expect, it } from 'vitest';
import { buildPasswordResetLink } from './emailLinks';

describe('backend email link helpers', () => {
  it('builds reset-password links with the frontend route and required params', () => {
    const link = buildPasswordResetLink({
      webBaseUrl: 'https://kaffepos.my.id/',
      email: 'owner+test@kaffepos.my.id',
      token: 'reset token/123',
    });
    const url = new URL(link);

    expect(url.origin).toBe('https://kaffepos.my.id');
    expect(url.pathname).toBe('/reset-password');
    expect(url.searchParams.get('mode')).toBe('reset');
    expect(url.searchParams.get('email')).toBe('owner+test@kaffepos.my.id');
    expect(url.searchParams.get('token')).toBe('reset token/123');
  });
});

