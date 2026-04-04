/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/hooks/useStore';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'tx_123' }, error: null }) }) }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    getChannels: vi.fn(() => []),
    removeChannel: vi.fn(),
    removeAllChannels: vi.fn(),
  },
}));

describe('Transaction Flow (useStore)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.getState().clearCart();
    useStore.setState({ 
      storeId: 'store_123',
      menu: [
        { id: 'item_1', name: 'Coffee', price: 10000, category: 'Coffee', recipe: [], variants: [], store_id: 'store_123', is_available: true }
      ]
    });
  });

  it('tambah item ke keranjang', () => {
    const item = { id: 'item_1', name: 'Coffee', price: 10000, category: 'Coffee' };
    useStore.getState().addToCart(item as any);
    
    const cart = useStore.getState().cart;
    expect(cart).toHaveLength(1);
    expect(cart[0].id).toBe('item_1');
    expect(cart[0].qty).toBe(1);
  });

  it('ubah qty item', () => {
    const item = { id: 'item_1', name: 'Coffee', price: 10000, category: 'Coffee' };
    useStore.getState().addToCart(item as any);
    useStore.getState().updateQty('item_1', 3);
    
    const cart = useStore.getState().cart;
    expect(cart[0].qty).toBe(3);
  });

  it('hapus item dari keranjang', () => {
    const item = { id: 'item_1', name: 'Coffee', price: 10000, category: 'Coffee' };
    useStore.getState().addToCart(item as any);
    useStore.getState().removeFromCart('item_1');
    
    expect(useStore.getState().cart).toHaveLength(0);
  });

  it('kalkulasi total dengan diskon', () => {
    const item = { id: 'item_1', name: 'Coffee', price: 10000, category: 'Coffee' };
    useStore.getState().addToCart(item as any);
    useStore.getState().setDiscount('50%');
    
    const cart = useStore.getState().cart;
    const discount = useStore.getState().discount;
    
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const discAmount = discount.endsWith('%') 
      ? (subtotal * parseFloat(discount)) / 100 
      : parseFloat(discount) || 0;
    const total = subtotal - discAmount;
    
    expect(subtotal).toBe(10000);
    expect(total).toBe(5000);
  });

  it('transaksi tersimpan ke Supabase', async () => {
    const tx = {
      items: [{ name: 'Coffee', qty: 1, price: 10000 }],
      total: 10000,
      payment_method: 'cash',
      date: new Date().toISOString()
    };

    await useStore.getState().saveTransaction(tx as any);
    expect(supabase.from).toHaveBeenCalledWith('transactions');
  });
});
