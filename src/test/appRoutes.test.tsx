import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { AuthProvider } from '@/contexts/AuthContext';

const capacitorListener = { remove: vi.fn() };

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(() => Promise.resolve(capacitorListener)),
    exitApp: vi.fn(),
  },
}));

vi.mock('@capacitor/network', () => ({
  Network: {
    addListener: vi.fn(() => Promise.resolve(capacitorListener)),
    getStatus: vi.fn(() => Promise.resolve({ connected: true })),
  },
}));

vi.mock('@/utils/bluetoothPrinter', () => ({
  autoConnectOnResume: vi.fn(() => Promise.resolve()),
}));

function renderAppAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('App route integration', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders the welcome route through the real AuthProvider boundary', async () => {
    renderAppAt('/welcome');

    expect(await screen.findByRole('heading', { name: /Sistem Kasir Modern Untuk Bisnis Anda/i })).toBeInTheDocument();
    expect(screen.getByTestId('reference-device-showcase')).toBeInTheDocument();
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('useAuth must be used inside AuthProvider');
  });

  it('renders the login route through the real AuthProvider boundary without Google sign-in', async () => {
    renderAppAt('/login');

    await waitFor(() => {
      expect(screen.getByTestId('reference-auth-shell')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Masuk$/i })).toBeInTheDocument();
    expect(screen.queryByText(/Google/i)).not.toBeInTheDocument();
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('useAuth must be used inside AuthProvider');
  });
});
