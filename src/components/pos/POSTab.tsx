/* eslint-disable react-hooks/exhaustive-deps */
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/pos/POSTab.tsx — KaffePOS v5
import { useState, useMemo, useCallback, useRef } from 'react';
import {
  ShoppingBag, Plus, Minus, X, ChevronRight,
  Search, Printer,
} from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import PrintActionSheet from '@/components/pos/PrintActionSheet';
import type { Profile, MenuItem, Transaction } from '@/types';

const fRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

interface Props {
  toast:   { showToast: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void };
  profile: Profile | null;
}

// ── Quick amount buttons ──────────────────────────────────────────
function quickAmounts(total: number): number[] {
  const rounded = Math.ceil(total / 10_000) * 10_000;
  return [...new Set([total, rounded, 50_000, 100_000].filter(v => v >= total))];
}

export default function POSTab({ toast, profile }: Props) {
  const {
    menu, inventory, cart, discount, transactions, isOnline,
    addToCart, updateQty, clearCart, setDiscount,
    saveTransaction, storeSettings,
  } = useStore();

  const [cat,        setCat]        = useState('All');
  const [search,     setSearch]     = useState('');
  const [dSearch,    setDSearch]    = useState('');
  const [showPay,    setShowPay]    = useState(false);
  const [method,     setMethod]     = useState<'Tunai'|'Transfer'|'QRIS'>('Tunai');
  const [cash,       setCash]       = useState('');
  const [showRcpt,   setShowRcpt]   = useState(false);
  const [lastTx,     setLastTx]     = useState<Transaction | null>(null);
  const [custName,   setCustName]   = useState('');   // ← Nama pelanggan
  const [showPrintSheet, setShowPrintSheet] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input
  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDSearch(val), 200);
  }, [],   );

  const cats = useMemo(() =>
    ['All', ...new Set(menu.map(m => m.category))],
    [menu]
  );

  const filtered = useMemo(() =>
    menu.filter(m =>
      m.is_available &&
      (cat === 'All' || m.category === cat) &&
      (!dSearch || m.name.toLowerCase().includes(dSearch.toLowerCase()))
    ),
    [menu, cat, dSearch]
  );

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.price * c.qty, 0), [cart]);
  const discAmt  = useMemo(() => {
    if (!discount) return 0;
    const rawDiscount = discount.endsWith('%')
      ? Math.round(subtotal * parseInt(discount) / 100)
      : parseInt(discount) || 0;
    return Math.min(Math.max(0, rawDiscount), subtotal);
  }, [subtotal, discount]);
  const taxPct = storeSettings?.tax_percent || 0;
  const taxableBase = Math.max(0, subtotal - discAmt);
  const taxAmt = Math.round(taxableBase * taxPct / 100);
  const total  = taxableBase + taxAmt;
  const paid   = method === 'Tunai' ? parseInt(cash) || 0 : total;
  const change = Math.max(0, paid - total);

  // ── Stock check — handles variants correctly ──────────────────
  const checkStock = useCallback((item: MenuItem): boolean => {
    if (!item.recipe?.length) return true;
    // Find how many of this item (base ID) are already in cart
    const inCartQty = cart
      .filter(c => c.id === item.id || c._baseId === item.id)
      .reduce((s, c) => s + c.qty, 0);
    return item.recipe.every(r => {
      const mat = inventory.find(i => i.id === r.matId);
      return mat && mat.stock >= r.qty * (inCartQty + 1);
    });
  }, [cart, inventory]);

  const handleAdd = useCallback((item: MenuItem) => {
    if (!checkStock(item)) {
      toast.showToast('Stok bahan tidak cukup', 'warning');
      return;
    }
    // If has variants, add base price
    if (item.variants?.length) {
      // Show variant picker — for now just add base
      addToCart(item);
    } else {
      addToCart(item);
    }
  }, [checkStock, addToCart, toast]);


  const handleCheckout = useCallback(async () => {
    if (!cart.length) return;
    if (!isOnline) {
      toast.showToast('Checkout offline dinonaktifkan agar stok tetap akurat di semua perangkat.', 'warning');
      return;
    }
    if (method === 'Tunai' && paid < total) {
      toast.showToast('Uang bayar kurang', 'warning');
      return;
    }
    const stockOk = cart.every((cartItem) => {
      const base = menu.find(m => m.id === (cartItem._baseId || cartItem.id));
      if (!base?.recipe?.length) return true;
      return base.recipe.every((recipeItem) => {
        const material = inventory.find(i => i.id === recipeItem.matId);
        return material && material.stock >= recipeItem.qty * cartItem.qty;
      });
    });
    if (!stockOk) {
      toast.showToast('Stok bahan berubah. Periksa ulang keranjang sebelum checkout.', 'warning');
      return;
    }

    const cogs = cart.reduce((s, c) => {
      const base = menu.find(m => m.id === (c._baseId || c.id));
      const rc = base?.recipe?.reduce((rs, r) => {
        const mat = inventory.find(i => i.id === r.matId);
        return rs + (mat?.cost_per_unit || 0) * r.qty;
      }, 0) || 0;
      return s + rc * c.qty;
    }, 0);

    const todayStr = new Date().toDateString();
    const todayTxs = transactions.filter(t => new Date(t.date).toDateString() === todayStr);
    const count = todayTxs.length;
    const group = Math.floor(count / 100);
    const letter = String.fromCharCode(65 + Math.min(group, 25)); // A-Z mask
    const num = (count % 100) + 1;
    const uniqueSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const orderId = `ORDER #${letter}${String(num).padStart(3, '0')}-${uniqueSuffix}`;

    const tx = {
      id: orderId,
      store_id: useStore.getState().storeId || 'temp',
      date:        new Date().toISOString(),
      items:       cart.map(c => ({
        name: c.name,
        qty: c.qty,
        price: c.price,
        subtotal: c.price * c.qty,
        menu_item_id: c._baseId || c.id,
      })),
      subtotal, discount: discAmt, discount_label: discount || null,
      tax: taxAmt, total, cogs: Math.round(cogs),
      paid, change, method,
      customer_name: custName.trim() || null,   // ← Simpan nama pelanggan
      cashier:     profile?.display_name || profile?.username || 'Kasir',
      note: null, is_void: false, void_reason: null, void_at: null, void_by: null,
      created_at:  new Date().toISOString(),
    };

    try {
      setCheckingOut(true);
      const savedTx = await saveTransaction(tx as unknown as Transaction);
      setLastTx(savedTx);
      clearCart();
      setCustName('');
      setShowPay(false);
      setShowRcpt(true);
      toast.showToast('Transaksi berhasil! ✅', 'success');
    } catch (e:any) {
      toast.showToast(e instanceof Error ? e.message : 'Checkout gagal diproses', 'warning');
    } finally {
      setCheckingOut(false);
    }
  }, [cart, isOnline, method, paid, total, discAmt, discount, taxAmt, subtotal, menu, inventory, profile, saveTransaction, clearCart, toast]);


  const lowStock = useMemo(() =>
    inventory.filter(i => i.stock <= i.min_stock),
    [inventory]
  );

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">
      {/* ── KIRI: GRID MENU ── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <div className="bg-white/95 backdrop-blur-xl border-b border-slate-200/60 px-5 pt-4 pb-3 z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-extrabold text-slate-800 text-xl tracking-tight">Katalog Menu</h2>
              {lowStock.length > 0 && (
                <p className="text-[10px] text-red-500 font-bold mt-0.5">⚠ {lowStock.length} bahan kritis</p>
              )}
            </div>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Cari menu kopi, snack..."
              className="w-full bg-slate-100/80 border border-slate-200/50 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all font-medium text-slate-700"
            />
          </div>
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-none">
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)}
                className={`shrink-0 px-4 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 ${cat===c?'bg-slate-800 text-white shadow-md shadow-slate-800/20':'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <ShoppingBag size={48} className="mb-4 opacity-20"/>
              <p className="text-sm font-medium">Belum ada menu di kategori ini.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-24 md:pb-4">
              {filtered.map(item => {
                const inCart = cart.find(c => c.id === item.id || c._baseId === item.id);
                const totalQty = cart.filter(c => c.id === item.id || c._baseId === item.id).reduce((s,c)=>s+c.qty,0);
                return (
                  <div key={item.id} onClick={() => handleAdd(item)}
                    className="group bg-white rounded-3xl overflow-hidden shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] active:scale-[0.97] flex flex-col relative"
                  >
                    {item.image_url ? (
                      <div className="relative pt-[70%] w-full overflow-hidden bg-slate-100">
                        <img src={item.image_url} alt={item.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" style={{ willChange: 'transform' }} />
                      </div>
                    ) : (
                      <div className="pt-[70%] w-full bg-gradient-to-br from-slate-100 to-slate-50 relative">
                        <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-50 grayscale transition-all group-hover:grayscale-0 group-hover:scale-110">☕</div>
                      </div>
                    )}
                    <div className="p-4 flex-1 flex flex-col">
                      <p className="font-extrabold text-slate-800 text-sm leading-snug mb-1">{item.name}</p>
                      <p className="text-orange-500 font-black text-sm mt-auto z-0">{fRp(item.price)}</p>
                    </div>

                    {inCart && (
                      <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-100 p-1 flex items-center gap-2 z-10" onClick={e => e.stopPropagation()}>
                        <button onClick={() => updateQty(item.id, totalQty - 1)} className="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors"><Minus size={14}/></button>
                        <span className="font-black text-sm text-slate-800 w-4 text-center">{totalQty}</span>
                        <button onClick={() => handleAdd(item)} className="w-7 h-7 rounded-xl bg-orange-500 text-white shadow-md shadow-orange-500/30 flex items-center justify-center transition-transform active:scale-90"><Plus size={14}/></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── MOBILE: BUTTON KERANJANG MENGAMBANG ── */}
        {cart.length > 0 && (
          <div className="md:hidden absolute bottom-4 left-4 right-4 z-20">
            <button onClick={() => setShowPay(true)} className="w-full bg-slate-900 text-white p-4 rounded-3xl flex items-center justify-between shadow-[0_10px_40px_rgb(0,0,0,0.3)] active:scale-[0.97] transition-all border border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black text-sm">{cart.length}</div>
                <span className="font-bold text-sm">Keranjang</span>
              </div>
              <div className="flex items-center gap-2 font-black text-lg">
                {fRp(total)} <ChevronRight size={18}/>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* ── KANAN: SIDEBAR CHECKOUT PERSISTEN (TABLET/DESKTOP) ── */}
      <div className="hidden md:flex flex-col w-[340px] lg:w-[420px] bg-white border-l border-slate-200/60 shadow-[-10px_0_30px_rgb(0,0,0,0.02)] z-20 relative">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="font-extrabold text-slate-800">Pesanan Hari Ini</h2>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-[10px] uppercase tracking-wider font-bold text-slate-400 hover:text-red-500 transition-colors">
              Kosongkan (X)
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center text-slate-400">
            <ShoppingBag size={56} className="mb-5 text-slate-200"/>
            <p className="font-extrabold text-slate-500">Keranjang Kosong</p>
            <p className="text-xs mt-1 leading-relaxed">Pilih menu dari katalog di sebelah kiri untuk ditambahkan ke struk pesanan.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.map(c => (
              <div key={c.id} className="flex gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-[0_2px_8px_rgb(0,0,0,0.02)] transition-all">
                <div className="flex-1 overflow-hidden">
                  <p className="font-bold text-slate-800 text-sm truncate">{c.name}</p>
                  <p className="text-slate-500 text-xs font-medium mt-0.5">{fRp(c.price)}</p>
                </div>
                <div className="flex flex-col items-end justify-between">
                  <p className="font-black text-slate-800 text-sm">{fRp(c.price * c.qty)}</p>
                  <div className="flex items-center gap-2 mt-2 bg-slate-50 rounded-xl border border-slate-200 p-0.5">
                    <button onClick={() => updateQty(c.id, c.qty - 1)} className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-white rounded-lg shadow-sm transition-colors"><Minus size={12}/></button>
                    <span className="font-bold text-xs w-4 text-center">{c.qty}</span>
                    <button onClick={() => updateQty(c.id, c.qty + 1)} className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-white rounded-lg shadow-sm transition-colors"><Plus size={12}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Panel Checkout Bawah */}
        {cart.length > 0 && (
          <div className="bg-white border-t border-slate-100 p-5 shadow-[0_-10px_40px_rgb(0,0,0,0.04)]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase block mb-1.5 ml-1">Pelanggan</label>
                  <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Nama / Meja..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all placeholder:font-normal"/>
                </div>
                <div>
                  <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase block mb-1.5 ml-1">Diskon</label>
                  <input value={discount || ''} onChange={e => setDiscount(e.target.value)} placeholder="10% / 5000" className="w-full bg-green-50/50 border border-green-200/50 rounded-xl px-4 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all text-green-700 placeholder:font-normal"/>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 space-y-2 border border-slate-100/60">
                <div className="flex justify-between text-xs text-slate-500 font-medium"><span>Subtotal</span><span>{fRp(subtotal)}</span></div>
                {discAmt>0 && <div className="flex justify-between text-xs text-green-600 font-bold"><span>Diskon Potongan</span><span>-{fRp(discAmt)}</span></div>}
                {taxAmt>0 && <div className="flex justify-between text-xs text-slate-500 font-medium"><span>Pajak Resto ({taxPct}%)</span><span>{fRp(taxAmt)}</span></div>}
                <div className="flex justify-between text-xl font-black text-slate-800 pt-2 border-t border-slate-200/50 mt-2"><span>Total Tagihan</span><span className="text-orange-500">{fRp(total)}</span></div>
              </div>

              <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                {(['Tunai','Transfer','QRIS'] as const).map(m => (
                  <button key={m} onClick={() => setMethod(m)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all duration-300 ${method===m?'bg-white text-slate-900 shadow-[0_2px_10px_rgb(0,0,0,0.06)]':'text-slate-500 hover:text-slate-700'}`}>
                    {m}
                  </button>
                ))}
              </div>

              {method === 'Tunai' && (
                <div className="animate-in slide-in-from-bottom-2 duration-300">
                  <input type="number" value={cash} onChange={e => setCash(e.target.value)} placeholder={fRp(total)} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3.5 text-xl font-black focus:outline-none focus:border-slate-800 transition-colors text-slate-800 mb-2"/>
                  <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                    {quickAmounts(total).map(amt => (
                      <button key={amt} onClick={() => setCash(String(amt))} className="shrink-0 px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 transition-colors">
                        {fRp(amt)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={handleCheckout} disabled={checkingOut || method === 'Tunai' && paid < total}
                className="w-full relative overflow-hidden bg-slate-900 text-white p-4 rounded-2xl font-black text-sm uppercase tracking-wider active:scale-[0.98] transition-all disabled:opacity-50 shadow-[0_8px_20px_rgb(15,23,42,0.2)] group">
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {checkingOut ? 'MEMPROSES...' : 'SELESAIKAN PEMBAYARAN'}
                  {method === 'Tunai' && paid >= total && paid > total && <span className="text-green-400 ml-1 bg-white/10 py-1 px-2.5 rounded-lg border border-white/5">Kembali: {fRp(change)}</span>}
                </span>
                <div className="absolute inset-0 block bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"/>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE: PAY MODAL (Hanya Tampil di HP) ── */}
      {showPay && (
        <div className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="bg-white w-full rounded-t-[32px] p-6 max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-xl text-slate-800">Pembayaran</h3>
              <button onClick={() => setShowPay(false)} className="p-2 bg-slate-100 rounded-full active:scale-90 text-slate-500"><X size={18}/></button>
            </div>
            
            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4 mb-5 space-y-2 text-sm">
              {cart.map(c => (
                <div key={c.id} className="flex justify-between">
                  <span className="text-slate-600 truncate flex-1 mr-2 font-medium">{c.name} <span className="font-bold text-slate-800 ml-1">x{c.qty}</span></span>
                  <span className="font-bold text-slate-800">{fRp(c.price * c.qty)}</span>
                </div>
              ))}
              <div className="border-t border-slate-200/60 pt-2 space-y-1.5 mt-2">
                <div className="flex justify-between text-slate-500 text-xs"><span>Subtotal</span><span>{fRp(subtotal)}</span></div>
                {discAmt>0 && <div className="flex justify-between text-green-600 font-bold text-xs"><span>Diskon</span><span>-{fRp(discAmt)}</span></div>}
                {taxAmt>0 && <div className="flex justify-between text-slate-500 text-xs"><span>Pajak {taxPct}%</span><span>{fRp(taxAmt)}</span></div>}
                <div className="flex justify-between font-black text-lg pt-2 border-t border-slate-200/60 mt-2"><span>Total</span><span className="text-orange-500">{fRp(total)}</span></div>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3">
               <div>
                  <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase block mb-1">Pelanggan (Opsional)</label>
                  <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Nama..." className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-slate-400"/>
               </div>
               <div>
                  <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase block mb-1">Diskon</label>
                  <input value={discount || ''} onChange={e => setDiscount(e.target.value)} placeholder="10% / 5000" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-slate-400 text-green-600 font-bold"/>
               </div>
            </div>

            <div className="flex gap-2 mb-5">
              {(['Tunai','Transfer','QRIS'] as const).map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`flex-1 py-3.5 rounded-2xl border-2 font-black text-xs transition-all ${method===m?'border-orange-500 bg-orange-500 text-white shadow-lg shadow-orange-500/30':'border-slate-200 text-slate-500 bg-white'}`}>
                  {m}
                </button>
              ))}
            </div>

            {method === 'Tunai' && (
              <div className="mb-5 animate-in fade-in slide-in-from-bottom-2">
                <label className="text-[10px] font-black tracking-wider text-slate-400 uppercase block mb-2">Uang Diterima</label>
                <input type="number" value={cash} onChange={e => setCash(e.target.value)} placeholder={String(total)} className="w-full border-2 border-slate-200 rounded-2xl px-4 py-4 text-2xl font-black focus:outline-none focus:border-orange-500 transition-colors" autoFocus inputMode="numeric"/>
                {paid >= total && paid > 0 && <p className="text-green-600 font-black mt-2 text-sm bg-green-50 px-3 py-2 rounded-xl inline-block">✅ Kembali: {fRp(change)}</p>}
                <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-none pb-1">
                  {quickAmounts(total).map(amt => (
                    <button key={amt} onClick={() => setCash(String(amt))} className="shrink-0 px-4 py-2.5 bg-slate-100 rounded-xl text-sm font-bold text-slate-700 active:scale-95">
                      {fRp(amt)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleCheckout} disabled={checkingOut || !cart.length || (method === 'Tunai' && paid < total)}
              className="w-full py-4 bg-slate-900 border border-slate-700 text-white font-black text-base rounded-2xl active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_8px_30px_rgb(15,23,42,0.3)]">
              {checkingOut ? 'MEMPROSES...' : 'BAYAR SEKARANG'}
            </button>
          </div>
        </div>
      )}

      {/* ── RECEIPT MODAL ── */}
      {showRcpt && lastTx && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[360px] rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 text-3xl shadow-[0_0_30px_rgb(34,197,94,0.2)]">✓</div>
              <h3 className="font-extrabold text-xl text-slate-800">Lunas!</h3>
              <p className="text-slate-400 text-xs font-medium mt-1">#{lastTx.id}</p>
            </div>

            {lastTx.customer_name && (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 mb-5 text-center">
                <p className="text-[10px] font-black text-slate-400 tracking-widest mb-1 uppercase">Pemesan</p>
                <p className="text-xl font-black text-slate-800">{lastTx.customer_name}</p>
              </div>
            )}

            <div className="bg-white border border-slate-200 border-dashed rounded-2xl p-4 mb-6 text-sm">
              {lastTx.items.map((i:any, idx: number) => (
                <div key={idx} className="flex justify-between mb-1.5 font-medium">
                  <span className="text-slate-600">{i.name} <span className="font-bold text-slate-800">x{i.qty}</span></span>
                  <span className="font-bold text-slate-800">{fRp(i.subtotal)}</span>
                </div>
              ))}
              <div className="border-t border-slate-200 border-dashed pt-3 mt-3">
                <div className="flex justify-between font-black text-lg"><span>Total Tagihan</span><span className="text-slate-800">{fRp(lastTx.total)}</span></div>
                {lastTx.method === 'Tunai' && (
                  <div className="flex justify-between text-green-600 font-bold mt-1"><span>Uang Kembali</span><span>{fRp(lastTx.change)}</span></div>
                )}
              </div>
            </div>

            <button onClick={() => setShowPrintSheet(true)} className="w-full py-3.5 mb-3 bg-white border-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-extrabold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all">
              <Printer size={16} strokeWidth={2.5}/> Cetak Struk Fisik
            </button>

            <button onClick={() => setShowRcpt(false)} className="w-full py-4 bg-orange-500 text-white font-black rounded-2xl active:scale-95 transition-all shadow-lg shadow-orange-500/20">
              Transaksi Baru
            </button>
          </div>
        </div>
      )}

      {/* Action Sheets */}
      <PrintActionSheet visible={showPrintSheet} onClose={() => setShowPrintSheet(false)} transaction={lastTx} storeSettings={storeSettings} toast={toast} />
    </div>
  );
}
