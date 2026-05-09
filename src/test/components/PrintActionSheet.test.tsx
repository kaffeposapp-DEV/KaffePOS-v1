import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PrintActionSheet from '@/components/pos/PrintActionSheet';

vi.mock('@/hooks/usePrinter', () => ({
  usePrinter: () => ({
    btConnected: false,
    btReconnecting: false,
    btName: '',
    usbConnected: false,
    usbName: '',
    connectClassic: vi.fn(),
    connectUsb: vi.fn(),
  }),
}));

vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: vi.fn(), getUri: vi.fn() },
  Directory: { Cache: 'CACHE' },
}));

describe('PrintActionSheet', () => {
  it('shows a receipt preview before thermal print actions', () => {
    render(
      <PrintActionSheet
        visible
        onClose={vi.fn()}
        toast={{ showToast: vi.fn() }}
        storeSettings={{ store_name: 'Kedai Test', paper_width: '58mm' }}
        transaction={{
          id: 'ORDER #A001',
          date: '2026-04-30T01:00:00.000Z',
          items: [{ name: 'Kopi Susu', qty: 2, price: 15000, subtotal: 30000 }],
          subtotal: 30000,
          discount: 0,
          tax: 0,
          total: 30000,
          paid: 50000,
          change: 20000,
          method: 'Tunai',
        }}
      />,
    );

    expect(screen.getByLabelText('Preview struk')).toBeInTheDocument();
    expect(screen.getByText('Kedai Test')).toBeInTheDocument();
    expect(screen.getByText('ORDER #A001')).toBeInTheDocument();
    expect(screen.getByText(/Kopi Susu/)).toBeInTheDocument();
    expect(screen.getAllByText('Rp 30.000').length).toBeGreaterThan(0);
  });
});
