import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthPage from '@/components/auth/AuthPage';
import LandingPage from '@/pages/LandingPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  auth: {
    isAuthenticated: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    resendVerification: vi.fn(),
    verifyEmailCode: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

describe('KaffePOS reference experience', () => {
  beforeEach(() => {
    mocks.navigate.mockClear();
    window.history.pushState({}, '', '/');
  });

  it('renders the reference landing flow for desktop and mobile web', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <LandingPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Sistem Kasir Modern Untuk Bisnis Anda/i })).toBeInTheDocument();
    expect(screen.getByTestId('reference-device-showcase')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Fitur Lengkap untuk Bisnis Anda/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Pantau Bisnis Anda dalam Sekejap/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Siap Meningkatkan Efisiensi Bisnis Anda/i })).toBeInTheDocument();
  });

  it('renders a mobile-first auth surface for web mobile and APK login', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('reference-auth-shell')).toBeInTheDocument();
    expect(screen.getByTestId('reference-auth-mobile-brand')).not.toHaveClass('bg-kaffe-500');
    expect(screen.getByRole('heading', { name: /Aplikasi Kasir Modern Untuk Bisnis Anda/i })).toBeInTheDocument();
    expect(screen.getByText(/Mudah digunakan/i)).toBeInTheDocument();
    const previewStage = screen.getByTestId('auth-preview-stage');
    expect(within(previewStage).getAllByTestId('auth-preview-card')).toHaveLength(3);
    expect(within(previewStage).getAllByTestId('auth-preview-card-icon')).toHaveLength(3);
    expect(within(previewStage).getByText(/Dashboard live/i)).toBeInTheDocument();
    expect(within(previewStage).getByText(/Brand outlet/i)).toBeInTheDocument();
    expect(within(previewStage).getByText(/Lisensi sinkron/i)).toBeInTheDocument();
    expect(screen.getByTestId('auth-mobile-preview-strip')).toBeInTheDocument();
    expect(screen.getAllByText(/Sinkronisasi outlet/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Masuk$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Masuk dengan Google/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/atau masuk dengan/i)).not.toBeInTheDocument();
  });

  it('exposes register validation messages to assistive technology', async () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <AuthPage />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText(/Nama Bisnis/i), { target: { value: 'ab' } });
    fireEvent.change(screen.getByLabelText(/Email atau No. HP/i), { target: { value: 'email-salah' } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'lemah' } });

    await waitFor(() => {
      expect(screen.getByText(/Nama toko minimal 3 karakter/i)).toHaveAttribute('role', 'alert');
      expect(screen.getByText(/Format email tidak valid/i)).toHaveAttribute('role', 'alert');
      expect(screen.getByText(/Password min 10 huruf/i)).toHaveAttribute('role', 'alert');
    });

    expect(screen.getByLabelText(/Nama Bisnis/i)).toHaveAttribute('aria-describedby', 'auth-uname-error');
    expect(screen.getByLabelText(/Email atau No. HP/i)).toHaveAttribute('aria-describedby', 'auth-email-error');
    expect(screen.getByLabelText(/^Password$/i)).toHaveAttribute('aria-describedby', 'auth-pass-error');
  });

  it('lets users return from OTP verification to the registration form', async () => {
    mocks.auth.signUp.mockResolvedValueOnce({ error: null });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <AuthPage />
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText(/Nama Bisnis/i), { target: { value: 'Kopi Senja' } });
    fireEvent.change(screen.getByLabelText(/Email atau No. HP/i), { target: { value: 'owner@kaffepos.test' } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Daftar Gratis/i }));

    expect(await screen.findByRole('heading', { name: /Verifikasi/i })).toBeInTheDocument();
    const backButton = screen.getByRole('button', { name: /Kembali ke form daftar/i });
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);

    expect(await screen.findByRole('heading', { name: /Buat Akun Gratis/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nama Bisnis/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email atau No. HP/i)).toHaveValue('owner@kaffepos.test');
    expect(screen.getByLabelText(/^Password$/i)).toHaveValue('');
  });
});
