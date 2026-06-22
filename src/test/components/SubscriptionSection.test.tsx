import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionSection from '@/components/settings/SubscriptionSection';
import { getSubscriptions } from '@/lib/backendApi';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user_1', email: 'owner@kaffepos.test' },
  }),
}));

vi.mock('@/lib/backendApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/backendApi')>();
  return {
    ...actual,
    getSubscriptions: vi.fn(),
  };
});

function renderSection() {
  return render(
    <MemoryRouter>
      <SubscriptionSection
        isPro={false}
        profile={{ email: 'owner@kaffepos.test' }}
        toast={{ showToast: vi.fn() }}
        onRefreshStatus={vi.fn().mockResolvedValue(undefined)}
      />
    </MemoryRouter>,
  );
}

describe('SubscriptionSection billing center', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSubscriptions).mockResolvedValue({
      currentSubscription: null,
      subscriptions: [],
      paymentHistory: [],
      pendingPayments: [],
      paymentConfig: {
        mode: 'doku_sandbox',
        provider: 'doku',
        dokuEnvironment: 'sandbox',
        onlinePaymentAvailable: true,
        manualActivationAvailable: true,
        commerciallyReady: false,
        message: 'Pembayaran tersedia.',
        recommendedAction: 'Lanjutkan.',
      },
    });
  });

  it('uses one clear billing center with product-oriented CTA copy', async () => {
    renderSection();

    expect(await screen.findByText('Billing dan Langganan')).toBeInTheDocument();
    expect(screen.getAllByText('Paket Aktif').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Langganan Sekarang/i })).toBeInTheDocument();
    expect(screen.queryByText(/Langganan Online/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Langganan Sekarang/i }));

    expect(await screen.findByText('Pilih Paket')).toBeInTheDocument();
  });

  it('shows pending payment as pending and never as active license', async () => {
    vi.mocked(getSubscriptions).mockResolvedValueOnce({
      currentSubscription: null,
      subscriptions: [],
      paymentHistory: [],
      pendingPayments: [
        {
          id: 'pay_1',
          plan: 'signature',
          billing_cycle: 'monthly',
          amount: 129000,
          redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/test',
          transaction_status: 'pending',
          expires_at: '2026-05-01T00:00:00.000Z',
          created_at: '2026-04-28T00:00:00.000Z',
        },
      ],
      paymentConfig: {
        mode: 'doku_sandbox',
        provider: 'doku',
        dokuEnvironment: 'sandbox',
        onlinePaymentAvailable: true,
        manualActivationAvailable: true,
        commerciallyReady: false,
        message: 'Pembayaran tersedia.',
        recommendedAction: 'Lanjutkan.',
      },
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getAllByText('Menunggu Pembayaran').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Lisensi belum aktif sampai pembayaran sukses.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lanjutkan Pembayaran/i })).toHaveAttribute(
      'href',
      'https://app.sandbox.midtrans.com/snap/v2/vtweb/test',
    );
  });
});
