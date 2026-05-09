import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { getStoredAuthSession } from '@/lib/authSession';

const backendMocks = vi.hoisted(() => ({
  loginRequest: vi.fn(),
  getAuthSession: vi.fn(),
  getProfileMe: vi.fn(),
  logoutRequest: vi.fn(),
}));

vi.mock('@/lib/backendApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/backendApi')>('@/lib/backendApi');
  return {
    ...actual,
    loginRequest: backendMocks.loginRequest,
    getAuthSession: backendMocks.getAuthSession,
    getProfileMe: backendMocks.getProfileMe,
    logoutRequest: backendMocks.logoutRequest,
  };
});

function LoginProbe() {
  const auth = useAuth();
  return (
    <div>
      <output data-testid="auth-state">{auth.isAuthenticated ? auth.role : 'guest'}</output>
      <output data-testid="profile-name">{auth.profile?.display_name ?? '-'}</output>
      <button type="button" onClick={() => void auth.signIn('OWNER@KAFFEPOS.TEST', 'password-benar')}>
        fresh login
      </button>
    </div>
  );
}

describe('AuthProvider fresh login flow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    backendMocks.getAuthSession.mockRejectedValue(new Error('no cached session'));
    backendMocks.getProfileMe.mockRejectedValue(new Error('not needed for profile override'));
    backendMocks.logoutRequest.mockResolvedValue({ success: true });
  });

  it('submits normalized credentials, stores session token, applies role profile, and authenticates without relying on restore', async () => {
    backendMocks.loginRequest.mockResolvedValue({
      accessToken: 'fresh-token',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      user: {
        id: 'user-owner',
        email: 'owner@kaffepos.test',
        user_metadata: { role: 'owner' },
      },
      profile: {
        id: 'user-owner',
        email: 'owner@kaffepos.test',
        display_name: 'Owner Kaffe',
        role: 'owner',
        permissions: ['can_manage_billing'],
      },
    });

    render(
      <AuthProvider>
        <LoginProbe />
      </AuthProvider>,
    );

    await screen.findByText('fresh login');
    fireEvent.click(screen.getByRole('button', { name: /fresh login/i }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('owner');
      expect(screen.getByTestId('profile-name')).toHaveTextContent('Owner Kaffe');
    });

    expect(backendMocks.loginRequest).toHaveBeenCalledWith({
      email: 'owner@kaffepos.test',
      password: 'password-benar',
    });
    await expect(getStoredAuthSession()).resolves.toMatchObject({
      accessToken: 'fresh-token',
      user: { id: 'user-owner', email: 'owner@kaffepos.test' },
    });
  });
});
