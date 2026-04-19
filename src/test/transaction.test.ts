/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/hooks/useStore';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn((fn: string) => {
      if (fn === 'process_checkout') {
        return Promise.resolve({ data: { id: 'tx_123', store_id: 'store_123', items: [], subtotal: 10000, discount: 0, tax: 0, total: 10000, cogs: 0, paid: 10000, change: 0, method: 'Tunai', is_void: false, date: new Date().toISOString() }, error: null });
      }
      if (fn === 'void_transaction_secure') {
        return Promise.resolve({ data: { id: 'tx_123', store_id: 'store_123', is_void: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
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
    localStorage.clear();
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

  it('menyimpan draft POS ke cache lokal saat keranjang berubah', () => {
    const item = { id: 'item_1', name: 'Coffee', price: 10000, category: 'Coffee' };
    useStore.getState().addToCart(item as any);
    useStore.getState().updateQty('item_1', 2);
    useStore.getState().setDiscount('10%');

    expect(JSON.parse(localStorage.getItem('kpos_cart_store_123') || '[]')).toEqual([
      expect.objectContaining({ id: 'item_1', qty: 2 }),
    ]);
    expect(localStorage.getItem('kpos_discount_store_123')).toBe('10%');

    useStore.getState().clearCart();

    expect(localStorage.getItem('kpos_cart_store_123')).toBeNull();
    expect(localStorage.getItem('kpos_discount_store_123')).toBeNull();
  });

  it('transaksi tersimpan ke Supabase', async () => {
    const tx = {
      items: [{ name: 'Coffee', qty: 1, price: 10000, subtotal: 10000, menu_item_id: 'item_1' }],
      subtotal: 10000,
      discount: 0,
      tax: 0,
      cogs: 0,
      paid: 10000,
      change: 0,
      method: 'Tunai',
      is_void: false,
      total: 10000,
      date: new Date().toISOString()
    };

    await useStore.getState().saveTransaction(tx as any);
    expect(supabase.rpc).toHaveBeenCalledWith('process_checkout', expect.any(Object));
  });
});
