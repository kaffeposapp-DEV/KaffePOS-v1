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
  billingCycle: 'quarterly',
  planName: 'Signature',
  subtotal: 269000,
  discount: 0,
  discountLabel: null,
  adminFee: 0,
  total: 269000,
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
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
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

  it('guides users from package selection to payment method and review checkout', async () => {
    const toast = { showToast: vi.fn() };
    render(
      <SubscriptionCheckoutFlow
        open
        plan="kopi_susu"
        billingCycle="monthly"
        onClose={vi.fn()}
        toast={toast}
      />,
    );

    expect(screen.getByText('Pilih Paket')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Signature/i }));
    fireEvent.click(screen.getByRole('button', { name: /3 Bulan/i }));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut Pilih Pembayaran/i }));

    expect(screen.getByText('Pilih Pembayaran')).toBeInTheDocument();
    fireEvent.click(screen.getByText('BCA VA').closest('button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: /Lanjut Review/i }));

    await waitFor(() => {
      expect(getSubscriptionPaymentQuote).toHaveBeenCalledWith({
        plan: 'signature',
        billingCycle: 'quarterly',
        paymentMethod: 'bca_va',
      });
    });
    expect(await screen.findByText('Review Checkout')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /Lanjut Pilih Pembayaran/i }));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut Review/i }));

    await waitFor(() => {
      expect(toast.showToast).toHaveBeenCalledWith('Pembayaran online sedang dinonaktifkan.', 'error');
    });
    expect(screen.getByRole('button', { name: /Lanjut Review/i })).not.toBeDisabled();
    expect(screen.queryByText('Review Checkout')).not.toBeInTheDocument();
  });

  it('applies voucher and creates payment with the reviewed package and payment method', async () => {
    const discountedQuote: SubscriptionBillingQuote = {
      ...quote,
      discount: 26900,
      total: 242100,
      voucher: {
        code: 'SIGNATURE10',
        amount: 26900,
        description: 'Diskon Signature',
      },
    };
    vi.mocked(getSubscriptionPaymentQuote)
      .mockResolvedValueOnce({ quote, paymentMethods: [], paymentConfig: { mode: 'midtrans_sandbox', provider: 'midtrans', midtransEnvironment: 'sandbox', onlinePaymentAvailable: true, manualActivationAvailable: true, commerciallyReady: false, message: 'Sandbox siap.', recommendedAction: 'Test checkout.' } })
      .mockResolvedValueOnce({ quote: discountedQuote, paymentMethods: [], paymentConfig: { mode: 'midtrans_sandbox', provider: 'midtrans', midtransEnvironment: 'sandbox', onlinePaymentAvailable: true, manualActivationAvailable: true, commerciallyReady: false, message: 'Sandbox siap.', recommendedAction: 'Test checkout.' } });

    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true,
    });

    render(
      <SubscriptionCheckoutFlow
        open
        plan="signature"
        billingCycle="quarterly"
        onClose={vi.fn()}
        toast={{ showToast: vi.fn() }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lanjut Pilih Pembayaran/i }));
    fireEvent.click(screen.getByText('BCA VA').closest('button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: /Lanjut Review/i }));

    expect(await screen.findByText('Review Checkout')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Punya Kode Voucher/i }));
    fireEvent.change(screen.getByPlaceholderText('KODE VOUCHER'), { target: { value: 'signature10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pakai' }));

    await waitFor(() => {
      expect(getSubscriptionPaymentQuote).toHaveBeenLastCalledWith({
        plan: 'signature',
        billingCycle: 'quarterly',
        paymentMethod: 'bca_va',
        voucherCode: 'SIGNATURE10',
      });
    });
    fireEvent.click(await screen.findByRole('button', { name: /Bayar Sekarang/i }));

    await waitFor(() => {
      expect(createSubscriptionPayment).toHaveBeenCalledWith({
        plan: 'signature',
        billingCycle: 'quarterly',
        paymentMethod: 'bca_va',
        voucherCode: 'SIGNATURE10',
      });
    });
    expect(assign).toHaveBeenCalledWith('https://app.sandbox.midtrans.com/snap/v2/vtweb/test');
  });

  it('blocks subscription checkout while offline instead of creating a false Midtrans success', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
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

    expect(screen.getByText('Pembayaran langganan butuh internet. Coba lagi setelah koneksi kembali.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lanjut Pilih Pembayaran/i }));
    expect(screen.getByRole('button', { name: /Lanjut Review/i })).toBeDisabled();
    expect(getSubscriptionPaymentQuote).not.toHaveBeenCalled();
    expect(createSubscriptionPayment).not.toHaveBeenCalled();
  });
});
