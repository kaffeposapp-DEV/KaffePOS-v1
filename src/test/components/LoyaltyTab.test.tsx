import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoyaltyTab from '@/components/loyalty/LoyaltyTab';
import { useStore } from '@/hooks/useStore';
import { getLoyaltyCacheKey, type LoyaltyOverview } from '@/lib/loyalty';
import type { Profile } from '@/types';

const overview: LoyaltyOverview = {
  settings: {
    store_id: 'store_1',
    stamps_required: 8,
    points_per_rupiah: 0.01,
    minimum_transaction_amount: 0,
    is_active: true,
  },
  rewards: [
    {
      id: 'reward_1',
      store_id: 'store_1',
      name: 'Diskon Rp10.000',
      description: 'Potongan transaksi berikutnya.',
      type: 'discount_amount',
      reward_value: 10000,
      points_cost: 1000,
      stamps_cost: 0,
      is_active: true,
    },
  ],
  passports: [
    {
      id: 'passport_1',
      store_id: 'store_1',
      customer_name: 'Rina Agustina',
      customer_phone: '081234567890',
      tier: 'kopi_lover',
      total_stamps: 10,
      available_stamps: 6,
      total_points: 1500,
      available_points: 1200,
      lifetime_spend: 750000,
    },
  ],
};

describe('LoyaltyTab', () => {
  const toast = { showToast: vi.fn() };
  const ownerRoleProps = { role: 'owner_admin' as const };
  const profile: Profile = {
    id: 'owner_1',
    display_name: 'Owner',
    email: 'owner@example.com',
    role: 'owner_admin',
  };

  beforeEach(() => {
    toast.showToast.mockClear();
    localStorage.clear();
    localStorage.setItem(getLoyaltyCacheKey('store_1'), JSON.stringify(overview));
    useStore.setState({
      storeId: 'store_1',
      isOnline: false,
      syncStatus: 'offline',
      loading: false,
    });
  });

  it('renders cached Kopi Passport data in offline mode', async () => {
    render(<LoyaltyTab toast={toast} profile={profile} {...ownerRoleProps} />);

    expect(await screen.findByText('Loyalty pelanggan')).toBeInTheDocument();
    expect(screen.getAllByText('Rina Agustina').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Kopi Lover').length).toBeGreaterThan(0);
    expect(screen.getByText('Diskon Rp10.000')).toBeInTheDocument();
    expect(screen.getByText('Offline queue')).toBeInTheDocument();
  });

  it('shows owner-only loyalty settings', async () => {
    render(<LoyaltyTab toast={toast} profile={profile} {...ownerRoleProps} />);

    expect(await screen.findByText('Admin settings')).toBeInTheDocument();
    expect(screen.getByText('Reward builder')).toBeInTheDocument();
  });

  it('hides settings from cashier role while keeping passport tools visible', async () => {
    render(<LoyaltyTab toast={toast} profile={{ ...profile, role: 'cashier' }} role="cashier" />);

    expect(await screen.findByText('Cari pelanggan')).toBeInTheDocument();
    expect(screen.queryByText('Admin settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Reward builder')).not.toBeInTheDocument();
  });
});
