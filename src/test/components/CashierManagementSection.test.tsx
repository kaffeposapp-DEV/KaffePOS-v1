import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CashierManagementSection from '@/components/settings/CashierManagementSection';
import { createCashier, getCashiers, getStores, updateCashier } from '@/lib/backendApi';

vi.mock('@/lib/backendApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/backendApi')>();
  return {
    ...actual,
    createCashier: vi.fn(),
    getCashiers: vi.fn(),
    getStores: vi.fn(),
    updateCashier: vi.fn(),
  };
});

describe('CashierManagementSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStores).mockResolvedValue({
      items: [
        { id: '11111111-1111-4111-8111-111111111111', owner_id: 'owner_1', store_name: 'Outlet Utama' },
      ],
    });
    vi.mocked(getCashiers).mockResolvedValue({
      items: [
        {
          id: 'cashier_1',
          display_name: 'Raka Kasir',
          email: 'raka@kaffepos.test',
          username: 'raka',
          role: 'cashier',
          status: 'active',
          store_id: '11111111-1111-4111-8111-111111111111',
          store_name: 'Outlet Utama',
        },
      ],
    });
    vi.mocked(createCashier).mockResolvedValue({
      cashier: {
        id: 'cashier_2',
        display_name: 'Sinta Kasir',
        email: 'sinta@kaffepos.test',
        username: 'sinta',
        role: 'cashier',
        status: 'active',
        store_id: '11111111-1111-4111-8111-111111111111',
        store_name: 'Outlet Utama',
      },
    });
    vi.mocked(updateCashier).mockResolvedValue({
      cashier: {
        id: 'cashier_1',
        display_name: 'Raka Kasir',
        email: 'raka@kaffepos.test',
        username: 'raka',
        role: 'cashier',
        status: 'inactive',
        store_id: '11111111-1111-4111-8111-111111111111',
        store_name: 'Outlet Utama',
      },
    });
  });

  it('lists cashier accounts with outlet assignment and status', async () => {
    render(<CashierManagementSection toast={{ showToast: vi.fn() }} />);

    expect(await screen.findByText('Raka Kasir')).toBeInTheDocument();
    expect(screen.getByText('Outlet Utama')).toBeInTheDocument();
    expect(screen.getByText('Aktif')).toBeInTheDocument();
  });

  it('creates a cashier with owner-selected outlet and refreshes the list', async () => {
    const toast = { showToast: vi.fn() };
    render(<CashierManagementSection toast={toast} />);

    fireEvent.click(await screen.findByRole('button', { name: /Tambah Kasir/i }));
    fireEvent.change(screen.getByLabelText('Nama kasir'), { target: { value: 'Sinta Kasir' } });
    fireEvent.change(screen.getByLabelText('Email login'), { target: { value: 'sinta@kaffepos.test' } });
    fireEvent.change(screen.getByLabelText('Password awal'), { target: { value: 'password-awal' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan Kasir/i }));

    await waitFor(() => {
      expect(createCashier).toHaveBeenCalledWith({
        displayName: 'Sinta Kasir',
        email: 'sinta@kaffepos.test',
        password: 'password-awal',
        storeId: '11111111-1111-4111-8111-111111111111',
        status: 'active',
      });
    });
    expect(toast.showToast).toHaveBeenCalledWith('Akun kasir berhasil dibuat.', 'success');
    expect(getCashiers).toHaveBeenCalledTimes(2);
  });

  it('lets owner/admin deactivate a cashier without exposing extra roles', async () => {
    const toast = { showToast: vi.fn() };
    render(<CashierManagementSection toast={toast} />);

    fireEvent.click(await screen.findByRole('button', { name: /Nonaktifkan Raka Kasir/i }));

    await waitFor(() => {
      expect(updateCashier).toHaveBeenCalledWith('cashier_1', { status: 'inactive' });
    });
    expect(screen.queryByText(/waiter|supervisor|kitchen/i)).not.toBeInTheDocument();
  });
});

