import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionCheckoutFlow from '@/components/settings/SubscriptionCheckoutFlow';
import { createSubscriptionPayment, getSubscriptionPaymentQuote } from '@/lib/backendApi';
import type { SubscriptionBillingQuote } from '@/lib/subscriptionBilling';

vi.mock('@/lib/backendApi', () => ({
  createSubscriptionPayment: vi.fn(),
  getSubscriptionPaymentQuote: vi.fn(),
}));

const quote: SubscriptionBillingQuote = {
  plan: 'signature',
  billingCycle: 'monthly',
  planName: 'Signature',
  subtotal: 99000,
  discount: 0,
  discountLabel: null,
  adminFee: 0,
  total: 99000,
  currency: 'IDR',
  selectedPaymentMethod: {
    id: 'bca_va',
    label: 'BCA Virtual Account',
    shortLabel: 'BCA VA',
    category: 'Virtual Account',
    description: 'Pembayaran lewat BCA.',
  },
  voucher: null,
  trustLabel: 'Pembayaran aman dan diproses melalui Midtrans.',
};

describe('SubscriptionCheckoutFlow interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSubscriptionPaymentQuote).mockResolvedValue({
      quote,
      paymentMethods: [],
      paymentConfig: {
        mode: 'midtrans_sandbox',
        provider: 'midtrans',
        midtransEnvironment: 'sandbox',
        onlinePaymentAvailable: true,
        manualActivationAvailable: true,
        commerciallyReady: false,
        message: 'Sandbox siap.',
        recommendedAction: 'Test checkout.',
      },
    });
    vi.mocked(createSubscriptionPayment).mockResolvedValue({
      reused: false,
      payment: { redirect_url: 'https://app.sandbox.midtrans.com/snap/v2/vtweb/test' },
      quote,
    });
  });

  it('loads a quote for the selected payment method before showing checkout details', async () => {
    const toast = { showToast: vi.fn() };
    render(
      <SubscriptionCheckoutFlow
        open
        plan="signature"
        billingCycle="monthly"
        onClose={vi.fn()}
        toast={toast}
      />,
    );

    fireEvent.click(screen.getByText('BCA VA').closest('button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: /Lanjutkan ke Checkout/i }));

    await waitFor(() => {
      expect(getSubscriptionPaymentQuote).toHaveBeenCalledWith({
        plan: 'signature',
        billingCycle: 'monthly',
        paymentMethod: 'bca_va',
      });
    });
    expect(await screen.findByText('Detail Checkout')).toBeInTheDocument();
    expect(screen.getByText('BCA Virtual Account')).toBeInTheDocument();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('surfaces unavailable payment config as a toast instead of getting stuck loading', async () => {
    vi.mocked(getSubscriptionPaymentQuote).mockResolvedValueOnce({
      quote,
      paymentMethods: [],
      paymentConfig: {
        mode: 'disabled',
        provider: 'midtrans',
        midtransEnvironment: 'sandbox',
        onlinePaymentAvailable: false,
        manualActivationAvailable: true,
        commerciallyReady: false,
        message: 'Pembayaran online sedang dinonaktifkan.',
        recommendedAction: 'Gunakan aktivasi manual.',
      },
    });
    const toast = { showToast: vi.fn() };

    render(
      <SubscriptionCheckoutFlow
        open
        plan="signature"
        billingCycle="monthly"
        onClose={vi.fn()}
        toast={toast}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lanjutkan ke Checkout/i }));

    await waitFor(() => {
      expect(toast.showToast).toHaveBeenCalledWith('Pembayaran online sedang dinonaktifkan.', 'error');
    });
    expect(screen.getByRole('button', { name: /Lanjutkan ke Checkout/i })).not.toBeDisabled();
    expect(screen.queryByText('Detail Checkout')).not.toBeInTheDocument();
  });
});

