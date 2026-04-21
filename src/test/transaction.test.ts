/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '@/hooks/useStore';
import { checkoutTransaction } from '@/lib/backendApi';

vi.mock('@/lib/opsMetrics', () => ({
  trackOpsEvent: vi.fn(),
}));

vi.mock('@/lib/backendApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/backendApi')>();
  return {
    ...actual,
    getStores: vi.fn().mockResolvedValue({
      items: [{ id: 'store_123', store_name: 'Test Store' }],
    }),
    getMenuItems: vi.fn().mockResolvedValue({
      items: [],
    }),
    getInventory: vi.fn().mockResolvedValue({
      items: [],
    }),
    getTransactions: vi.fn().mockResolvedValue({
      items: [],
    }),
    getExpenses: vi.fn().mockResolvedValue({
      items: [],
    }),
    getCashFlow: vi.fn().mockResolvedValue({
      items: [],
    }),
    getCashRegister: vi.fn().mockResolvedValue({
      items: [],
    }),
    checkoutTransaction: vi.fn().mockResolvedValue({
      id: 'tx_123',
      store_id: 'store_123',
      items: [],
      subtotal: 10000,
      discount: 0,
      tax: 0,
      total: 10000,
      cogs: 0,
      paid: 10000,
      change: 0,
      method: 'Tunai',
      is_void: false,
      date: new Date().toISOString(),
    }),
  };
});

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

  it('transaksi checkout terkirim ke backend API', async () => {
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
    expect(checkoutTransaction).toHaveBeenCalledWith(expect.objectContaining({
      store_id: 'store_123',
      total: 10000,
    }));
  });
});
