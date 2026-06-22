import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionCheckoutFlow from '@/components/settings/SubscriptionCheckoutFlow';
import { startPayment, getSubscriptionPaymentQuote } from '@/lib/backendApi';
import type { SubscriptionBillingQuote } from '@/lib/subscriptionBilling';

vi.mock('@/lib/backendApi', () => ({
  startPayment: vi.fn(),
  getSubscriptionPaymentQuote: vi.fn(),
}));

const quote: SubscriptionBillingQuote = {
  plan: 'signature',
  billingCycle: 'quarterly',
  planName: 'Signature',
  subtotal: 349000,
  discount: 0,
  discountLabel: null,
  adminFee: 0,
  total: 349000,
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
        mode: 'doku_sandbox',
        provider: 'doku',
        dokuEnvironment: 'sandbox',
        onlinePaymentAvailable: true,
        manualActivationAvailable: true,
        commerciallyReady: false,
        message: 'Sandbox siap.',
        recommendedAction: 'Test checkout.',
      },
    });
    vi.mocked(startPayment).mockResolvedValue({
      success: true,
      data: {
        paymentId: 'payment-1',
        provider: 'duitku',
        merchantOrderId: 'DUITKU-SUB-1',
        paymentUrl: 'https://sandbox.duitku.com/payment/test',
        status: 'pending',
      },
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

  it('uses subscription-specific modal classes so checkout layout is not squeezed by generic app modals', () => {
    render(
      <SubscriptionCheckoutFlow
        open
        plan="signature"
        billingCycle="monthly"
        onClose={vi.fn()}
        toast={{ showToast: vi.fn() }}
      />,
    );

    expect(document.querySelector('.subscription-checkout-overlay')).toBeInTheDocument();
    expect(document.querySelector('.subscription-checkout-shell')).toBeInTheDocument();
    expect(document.querySelector('.subscription-checkout-body')).toBeInTheDocument();
    expect(document.querySelector('.subscription-checkout-footer')).toBeInTheDocument();
    expect(document.querySelector('.modal-overlay')).not.toBeInTheDocument();
    expect(document.querySelector('.modal-content')).not.toBeInTheDocument();
  });

  it('closes checkout from X, backdrop, and Escape', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <SubscriptionCheckoutFlow
        open
        plan="signature"
        billingCycle="monthly"
        onClose={onClose}
        toast={{ showToast: vi.fn() }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tutup checkout langganan/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <SubscriptionCheckoutFlow
        open
        plan="signature"
        billingCycle="monthly"
        onClose={onClose}
        toast={{ showToast: vi.fn() }}
      />,
    );
    fireEvent.click(document.querySelector('.subscription-checkout-overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <SubscriptionCheckoutFlow
        open
        plan="signature"
        billingCycle="monthly"
        onClose={onClose}
        toast={{ showToast: vi.fn() }}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('returns to previous checkout step from Kembali button', () => {
    render(
      <SubscriptionCheckoutFlow
        open
        plan="signature"
        billingCycle="monthly"
        onClose={vi.fn()}
        toast={{ showToast: vi.fn() }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lanjut Pilih Pembayaran/i }));
    expect(screen.getByText('Pilih Pembayaran')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Kembali/i }));

    expect(screen.getByText('Pilih Paket')).toBeInTheDocument();
  });

  it('surfaces unavailable payment config as a toast instead of getting stuck loading', async () => {
    vi.mocked(getSubscriptionPaymentQuote).mockResolvedValueOnce({
      quote,
      paymentMethods: [],
      paymentConfig: {
        mode: 'disabled',
        provider: 'doku',
        dokuEnvironment: 'sandbox',
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
      .mockResolvedValueOnce({ quote, paymentMethods: [], paymentConfig: { mode: 'doku_sandbox', provider: 'doku', dokuEnvironment: 'sandbox', onlinePaymentAvailable: true, manualActivationAvailable: true, commerciallyReady: false, message: 'Sandbox siap.', recommendedAction: 'Test checkout.' } })
      .mockResolvedValueOnce({ quote: discountedQuote, paymentMethods: [], paymentConfig: { mode: 'doku_sandbox', provider: 'doku', dokuEnvironment: 'sandbox', onlinePaymentAvailable: true, manualActivationAvailable: true, commerciallyReady: false, message: 'Sandbox siap.', recommendedAction: 'Test checkout.' } });

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
      expect(startPayment).toHaveBeenCalledWith({
        plan: 'signature',
        billingCycle: 'quarterly',
        paymentMethod: 'bca_va',
        voucherCode: 'SIGNATURE10',
      });
    });
    expect(assign).toHaveBeenCalledWith('https://sandbox.duitku.com/payment/test');
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
    expect(startPayment).not.toHaveBeenCalled();
  });
});
