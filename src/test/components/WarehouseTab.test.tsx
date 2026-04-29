import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WarehouseTab from '@/components/warehouse/WarehouseTab';
import { useStore } from '@/hooks/useStore';

describe('WarehouseTab as Stok center', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({
      storeId: 'store-1',
      inventory: [
        {
          id: 'ingredient-1',
          store_id: 'store-1',
          name: 'Mika Frozen',
          stock: 20,
          unit: 'pcs',
          base_unit: 'pcs',
          min_stock: 5,
          cost_per_unit: 800,
          is_active: true,
        },
      ],
      unitConversions: [
        {
          id: 'conversion-1',
          store_id: 'store-1',
          ingredient_id: 'ingredient-1',
          from_unit: 'mika',
          to_unit: 'pcs',
          ratio: 15,
          is_active: true,
        },
      ],
      menu: [
        {
          id: 'product-1',
          store_id: 'store-1',
          name: 'Mika Goreng',
          price: 12000,
          category: 'Snack',
          is_available: true,
          recipe: [{ matId: 'ingredient-1', qty: 4, unit_reference: 'pcs' }],
        },
      ],
      transactions: [],
      expenses: [],
      cashFlow: [],
      cashRegister: [],
    });
  });

  it('keeps stock features under one Stok navigation surface', () => {
    render(<WarehouseTab toast={{ showToast: vi.fn() }} />);

    expect(screen.getByRole('heading', { name: 'Stok' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ringkasan Stok/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bahan Baku/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Konversi Satuan/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resep \/ Porsi/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /HPP & Margin/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Impor Bulk/i })).toBeInTheDocument();
  });

  it('shows HPP and margin from recipe data without leaving Stok', () => {
    render(<WarehouseTab toast={{ showToast: vi.fn() }} />);

    fireEvent.click(screen.getByRole('button', { name: /HPP & Margin/i }));

    expect(screen.getByText('Mika Goreng')).toBeInTheDocument();
    expect(screen.getByText((text) => text.replace(/\s/g, '') === 'Rp3.200')).toBeInTheDocument();
    expect(screen.getByText((text) => text.replace(/\s/g, '') === '73.33%')).toBeInTheDocument();
  });

  it('shows a clear recipe error instead of leaking generic backend wording', async () => {
    const toast = { showToast: vi.fn() };
    useStore.setState({
      saveMenuItem: vi.fn().mockRejectedValue(new Error('Terjadi kesalahan di backend.')),
    });

    render(<WarehouseTab toast={toast} />);

    fireEvent.click(screen.getByRole('button', { name: /Resep \/ Porsi/i }));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'product-1' } });
    fireEvent.change(selects[1], { target: { value: 'ingredient-1' } });
    fireEvent.change(screen.getByPlaceholderText('Qty / porsi'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan Resep/i }));

    await waitFor(() => {
      expect(toast.showToast).toHaveBeenCalledWith(
        'Resep belum bisa disimpan. Periksa kembali produk, bahan baku, dan jumlah per porsi.',
        'error',
      );
    });
  });
});
