import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '@/components/dashboard/Dashboard';
import { useStore } from '@/hooks/useStore';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  PieChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Cell: () => <div />,
}));

describe('Dashboard readiness surfaces', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({
      storeId: 'store_1',
      storeSettings: { id: 'store_1', owner_id: 'owner_1', store_name: 'Kedai Test' },
      menu: [],
      inventory: [
        {
          id: 'inv_1',
          store_id: 'store_1',
          name: 'Susu',
          stock: 1,
          unit: 'liter',
          min_stock: 2,
          cost_per_unit: 10000,
          is_active: true,
        },
      ],
      unitConversions: [],
      transactions: [],
      expenses: [],
      cashFlow: [],
      cashRegister: [],
      loading: false,
      syncing: false,
      isOnline: true,
      loadAll: vi.fn(),
    });
  });

  it('shows actionable onboarding and low-stock CTAs under Dashboard', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<Dashboard />);

    expect(screen.getByText('Checklist onboarding')).toBeInTheDocument();
    expect(screen.getByText('2/4 langkah siap dipakai')).toBeInTheDocument();
    expect(screen.getByText('Stok kritis perlu dicek')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Buka Stok/i }));

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'kaffepos-open-tab',
    }));
  });
});
