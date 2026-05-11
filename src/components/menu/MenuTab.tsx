




/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/menu/MenuTab.tsx
import { useState, useMemo, useRef } from 'react';
import { Plus, Edit, Trash2, X, ChevronDown, Image, Search, ShoppingBag } from 'lucide-react';
import ProductPlaceholder from '@/components/ui/ProductPlaceholder';
import { useStore } from '@/hooks/useStore';
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet';
import { normalizeUserFacingError } from '@/lib/errorMessages';
import type { MenuItem } from '@/types';

const fRp = (n: number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);
const EMPTY: Partial<MenuItem> = { name:'', price:0, category:'Coffee', image_url:'', description:'', recipe:[], variants:[], is_available:true };
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export default function MenuTab({ toast }:any) {
  const { menu, inventory, saveMenuItem, deleteMenuItem } = useStore();
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState<Partial<MenuItem>>(EMPTY);
  const [cat,          setCat]          = useState('All');
  const [search,       setSearch]       = useState('');
  const [,             setSaving]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MenuItem|null>(null); // konfirmasi hapus
  const imgRef = useRef<HTMLInputElement>(null);

  const cats     = useMemo(() => ['All', ...new Set(menu.map(m => m.category))], [menu]);
  const filtered = useMemo(() => menu.filter(m => (cat==='All'||m.category===cat) && (!search||m.name.toLowerCase().includes(search.toLowerCase()))), [menu,cat,search]);

  const openNew  = () => { setForm({ ...EMPTY, recipe: [] }); setShowModal(true); };
  const openEdit = (item: MenuItem) => { setForm({ ...item, recipe: item.recipe ? [...item.recipe] : [] }); setShowModal(true); };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) { toast.showToast('Gunakan PNG, JPG, atau WEBP', 'warning'); return; }
    if (file.size > 1024*1024) { toast.showToast('Foto maks 1MB','warning'); return; }
    if (file.name.toLowerCase().endsWith('.svg')) { toast.showToast('Format SVG tidak didukung untuk keamanan', 'warning'); return; }
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, image_url: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.showToast('Nama menu wajib diisi','warning'); return; }
    if (!form.price || form.price <= 0) { toast.showToast('Harga harus lebih dari 0','warning'); return; }
    const incompleteRecipe = (form.recipe || []).some((line) => !line.matId || !line.qty || line.qty <= 0);
    if (incompleteRecipe) {
      toast.showToast('Lengkapi bahan resep atau hapus baris yang kosong.', 'warning');
      return;
    }
    setSaving(true);
    try {
      await saveMenuItem(form);
      setShowModal(false);
      toast.showToast(form.id ? '✅ Menu diperbarui!' : '✅ Menu ditambahkan!', 'success');
    }
    catch (err:any) { toast.showToast(normalizeUserFacingError(err, 'Menu belum bisa disimpan. Periksa kembali data menu.'), 'error'); }
    finally { setSaving(false); }
  };

  const toggleAvailable = async (item: MenuItem) => {
    try {
      await saveMenuItem({ ...item, is_available: !item.is_available });
    } catch (err) {
      toast.showToast(normalizeUserFacingError(err, 'Status menu belum bisa diubah. Coba lagi.'), 'error');
    }
  };

  const addRecipeLine = () => setForm(f => ({ ...f, recipe: [...(f.recipe||[]), { matId: '', qty: 0 }] }));
  const updateRecipeLine = (idx: number, key: 'matId'|'qty', val:any) => {
    setForm(f => { const r = [...(f.recipe||[])]; r[idx] = { ...r[idx], [key]: key==='qty'?parseFloat(val)||0:val }; return { ...f, recipe: r }; });
  };
  const removeRecipeLine = (idx: number) => setForm(f => ({ ...f, recipe: (f.recipe||[]).filter((_,i) => i!==idx) }));

  const getStockStatus = (item: MenuItem) => {
    if (!item.recipe?.length) return null;
    return item.recipe.some(r => { const m = inventory.find(i => i.id === r.matId); return !m || m.stock < r.qty; }) ? 'low' : 'ok';
  };

  const getProductStatus = (item: MenuItem) => {
    const stockStatus = getStockStatus(item);
    if (!item.is_available) {
      return { label: 'Habis', className: 'bg-rose-50 text-rose-600 border-rose-100' };
    }
    if (stockStatus === 'low') {
      return { label: 'Menipis', className: 'bg-amber-50 text-amber-700 border-amber-100' };
    }
    return { label: 'Aman', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  };

  return (
    <div className="kaffe-app-bg kaffe-responsive-surface flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white/95 border-b border-slate-200/70 px-4 pt-5 pb-4 z-10 backdrop-blur-xl sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-extrabold text-slate-900 tracking-tight">Produk</h2>
            <p className="text-slate-500 font-semibold text-[12px] mt-1">Manajemen produk, kategori, harga, dan resep.</p>
          </div>
          <button onClick={openNew}
            className="kaffe-gradient-button flex items-center justify-center gap-2 h-11 px-5 rounded-lg text-[13px] font-bold active:scale-95 transition-all shrink-0">
            <Plus size={16}/>Tambah Produk
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Cari nama menu..."
            className="w-full h-12 bg-white border border-slate-200/90 rounded-lg pl-12 pr-4 text-[15px] focus:outline-none focus:ring-4 focus:ring-[#FF6A00]/10 focus:border-[#FF6A00]/30 transition-all font-medium text-slate-700 placeholder:text-slate-400 shadow-sm"
          />
        </div>

        {/* Category Tabs */}
        <div className="kaffe-scroll-tabs kaffe-command-bar flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6">
          {cats.map(c=>(
            <button
              key={c}
              onClick={()=>setCat(c)}
              data-active={cat===c}
              className="kaffe-filter-chip shrink-0 rounded-lg px-4 py-2 text-[12px] font-bold transition-all hover:border-orange-200 hover:text-[#FF6A00]"
            >
              {c === 'All' ? 'Semua' : c}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5">
        {filtered.length===0 ? (
          <div className="kaffe-empty-state flex flex-col items-center justify-center h-48 rounded-3xl text-slate-400">
            <div className="w-16 h-16 bg-slate-100 rounded-[24px] flex items-center justify-center mb-4 text-slate-300">
               <ShoppingBag size={32} />
            </div>
            <p className="text-sm font-bold">Belum ada menu di kategori ini</p>
            <p className="mt-1 max-w-xs text-center text-xs font-semibold text-slate-400">
              Tambahkan produk pertama agar kasir bisa mulai transaksi dengan cepat.
            </p>
          </div>
        ) : (
          <>
            <div className="kaffe-card-grid kaffe-product-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
              {filtered.map(item => {
                const stockStatus = getStockStatus(item);
                const status = getProductStatus(item);
                return (
                  <div key={item.id} className={`kaffe-action-card group min-w-0 bg-white rounded-2xl border border-slate-200/80 p-4 transition-all duration-300 hover:shadow-premium hover:border-[#FF6A00]/20 ${!item.is_available ? 'opacity-70 bg-slate-50/50' : 'shadow-sm'}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-slate-100 bg-slate-50 relative group">
                        {item.image_url
                          ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500"/>
                          : <ProductPlaceholder category={item.category} iconSize={24} />
                        }
                        {!item.is_available && (
                          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Habis</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-bold text-slate-900 text-[16px] truncate leading-tight">{item.name}</p>
                          <div className="flex items-center gap-1">
                            <button type="button" aria-label={`Edit ${item.name}`} onClick={()=>openEdit(item)} className="p-1.5 text-slate-400 hover:text-[#FF6A00] transition-colors"><Edit size={14}/></button>
                            <button type="button" aria-label={`Hapus ${item.name}`} onClick={() => setDeleteTarget(item)} className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"><Trash2 size={14}/></button>
                          </div>
                        </div>

                        <p className="text-[#FF6A00] font-black text-[17px] mt-1 tracking-tight">{fRp(item.price)}</p>

                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md uppercase tracking-wider">{item.category}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${status.className}`}>{status.label}</span>
                            {item.recipe && item.recipe.length > 0 && (
                              <div className={`w-2 h-2 rounded-full ${stockStatus==='low'?'bg-rose-500 animate-pulse':'bg-emerald-500'}`} title={stockStatus==='low'?'Stok Menipis':'Stok Aman'} />
                            )}
                          </div>

                          <button
                            type="button"
                            aria-label={`${item.is_available ? 'Nonaktifkan' : 'Aktifkan'} ${item.name}`}
                            onClick={()=>toggleAvailable(item)}
                            className={`w-10 h-6 rounded-full transition-all relative ${item.is_available ? 'bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'bg-slate-200'}`}
                          >
                            <div className={`h-[18px] w-[18px] bg-white rounded-full absolute top-[3px] transition-all duration-300 ${item.is_available ? 'left-[19px]' : 'left-[3px]'}`}/>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="kaffe-table-surface hidden lg:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[12px] font-bold text-slate-500">
                    <th className="px-5 py-4">Produk</th>
                    <th className="px-5 py-4">Kategori</th>
                    <th className="px-5 py-4">Harga</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((item) => {
                    const status = getProductStatus(item);
                    return (
                      <tr key={item.id} className={!item.is_available ? 'bg-slate-50/50 opacity-75' : 'bg-white'}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-11 w-11 overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                              {item.image_url
                                ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                                : <ProductPlaceholder category={item.category} iconSize={18} />
                              }
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
                              <p className="mt-0.5 text-[11px] font-medium text-slate-500">{item.recipe?.length ? `${item.recipe.length} bahan resep` : 'Tanpa resep'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-600">{item.category}</td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-900">{fRp(item.price)}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-bold ${status.className}`}>{status.label}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              aria-label={`${item.is_available ? 'Nonaktifkan' : 'Aktifkan'} ${item.name}`}
                              onClick={()=>toggleAvailable(item)}
                              className={`w-11 h-7 rounded-full transition-all relative ${item.is_available ? 'bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.25)]' : 'bg-slate-200'}`}
                            >
                              <div className={`h-5 w-5 rounded-full bg-white shadow-sm absolute top-1 transition-all duration-300 ${item.is_available ? 'left-[20px]' : 'left-1'}`}/>
                            </button>
                            <button type="button" aria-label={`Edit ${item.name}`} onClick={()=>openEdit(item)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-orange-50 hover:text-[#FF6A00] transition-colors"><Edit size={15}/></button>
                            <button type="button" aria-label={`Hapus ${item.name}`} onClick={() => setDeleteTarget(item)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors"><Trash2 size={15}/></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="modal-content bg-white shadow-2xl">
            <div className="sticky top-0 bg-white/95 backdrop-blur-md px-6 pt-6 pb-4 border-b border-slate-100 z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-xl text-slate-900 tracking-tight">{form.id?'Edit Menu':'Menu Baru'}</h3>
                <button
                  onClick={()=>setShowModal(false)}
                  className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:bg-slate-100"
                >
                  <X size={20}/>
                </button>
              </div>
            </div>
            <form onSubmit={handleSave} className="px-5 pb-6 pt-4 space-y-4">

              {/* FOTO UPLOAD */}
              <div>
                <label className="text-xs font-bold text-slate-500 mb-2 block">FOTO MENU</label>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 overflow-hidden bg-slate-50 shrink-0 flex items-center justify-center">
                    {form.image_url
                      ? <img src={form.image_url} alt="" className="w-full h-full object-cover"/>
                      : <ProductPlaceholder {...(form.category ? { category: form.category } : {})} iconSize={24} />
                    }
                  </div>
                  <div className="flex-1 space-y-2">
                    <button type="button" onClick={()=>imgRef.current?.click()}
                      className="w-full py-2.5 border-2 border-orange-200 text-orange-600 font-bold rounded-xl text-sm flex items-center justify-center gap-2 active:scale-95">
                      <Image size={14}/>Upload Foto
                    </button>
                    {form.image_url&&(
                      <button type="button" onClick={()=>setForm(f=>({...f,image_url:''}))}
                        className="w-full py-2 border border-slate-200 text-slate-400 rounded-xl text-xs active:scale-95">
                        Hapus Foto
                      </button>
                    )}
                    <p className="text-[11px] text-slate-400">JPG/PNG maks 1MB</p>
                  </div>
                </div>
                <input ref={imgRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageUpload}/>
              </div>

              {/* NAMA & HARGA */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-slate-700 pl-0.5">NAMA MENU *</label>
                  <input
                    value={form.name||''}
                    onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                    placeholder="Contoh: Kopi Susu Aren"
                    className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-slate-700 pl-0.5">HARGA (Rp) *</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={form.price||''}
                      onChange={e=>setForm(f=>({...f,price:parseInt(e.target.value)||0}))}
                      placeholder="25000"
                      className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-bold text-slate-700 pl-0.5">KATEGORI</label>
                    <div className="relative">
                      <select
                        value={form.category||'Coffee'}
                        onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                        className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all appearance-none"
                      >
                        {['Coffee','Non-Coffee','Food','Snack','Other'].map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronDown size={18} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-slate-700 pl-0.5">DESKRIPSI (OPSIONAL)</label>
                <textarea
                  value={form.description||''}
                  onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                  rows={2}
                  placeholder="Kopi susu dengan gula aren asli..."
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all resize-none"
                />
              </div>

              {/* RESEP */}
              <div className="border-t border-slate-100 pt-5 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[13px] font-black text-slate-800">RESEP BAHAN BAKU</p>
                    <p className="text-[11px] text-slate-400 font-medium">Stok gudang otomatis berkurang saat terjual</p>
                  </div>
                  <button
                    type="button"
                    onClick={addRecipeLine}
                    className="flex items-center gap-1.5 px-4 py-2 bg-orange-50 text-orange-600 rounded-xl text-xs font-black active:scale-95 transition-colors border border-orange-100"
                  >
                    <Plus size={14}/>Tambah Bahan
                  </button>
                </div>
                {inventory.length===0?(
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <p className="text-amber-700 text-xs font-bold">Belum ada bahan di Gudang. Tambahkan stok dulu untuk membuat resep.</p>
                    <p className="text-amber-500 text-xs mt-0.5">Tambah bahan di tab Gudang terlebih dahulu</p>
                  </div>
                ):(form.recipe||[]).length===0?(
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-slate-400 text-xs">Belum ada resep. Menu tetap bisa dijual, tetapi stok tidak akan berkurang otomatis.</p>
                  </div>
                ):(
                  <div className="space-y-2.5">
                    {(form.recipe||[]).map((r,idx)=>(
                      <div key={idx} className="flex items-center gap-2.5 bg-white border border-slate-100 rounded-2xl p-2.5 shadow-sm">
                        <div className="flex-1 min-w-0 relative">
                          <select
                            value={r.matId}
                            onChange={e=>updateRecipeLine(idx,'matId',e.target.value)}
                            className="w-full h-11 border border-slate-100 rounded-xl px-3 text-xs focus:outline-none focus:border-orange-400 bg-slate-50 appearance-none font-bold text-slate-700"
                          >
                            <option value="">-- Pilih Bahan --</option>
                            {inventory.map(inv=><option key={inv.id} value={inv.id}>{inv.name} ({inv.stock} {inv.unit})</option>)}
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <ChevronDown size={14} />
                          </div>
                        </div>
                        <div className="w-24 relative shrink-0">
                          <input
                            type="number"
                            inputMode="decimal"
                            value={r.qty||''}
                            onChange={e=>updateRecipeLine(idx,'qty',e.target.value)}
                            placeholder="0.0"
                            step="0.1"
                            className="w-full h-11 border border-slate-100 rounded-xl px-3 text-xs focus:outline-none focus:border-orange-400 text-center font-black bg-slate-50"
                          />
                        </div>
                        <span className="text-[11px] font-black text-slate-400 w-8 shrink-0">
                          {inventory.find(i=>i.id===r.matId)?.unit||'unit'}
                        </span>
                        <button
                          type="button"
                          onClick={()=>removeRecipeLine(idx)}
                          className="w-9 h-9 flex items-center justify-center text-red-400 bg-red-50 rounded-xl active:scale-90 transition-all"
                        >
                          <X size={16}/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* TOGGLE AVAILABLE */}
              <div
                onClick={()=>setForm(f=>({...f,is_available:!f.is_available}))}
                className="flex items-center justify-between py-4 px-4 bg-slate-50 rounded-2xl cursor-pointer active:bg-slate-100 transition-colors mt-4"
              >
                <div>
                  <p className="text-sm font-black text-slate-800">Tersedia untuk dijual</p>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Tampil di halaman POS</p>
                </div>
                <div className={`h-[26px] w-12 rounded-full transition-all relative shrink-0 ${form.is_available?'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]':'bg-slate-200'}`}>
                  <div className={`h-[22px] w-[22px] bg-white rounded-full absolute top-0.5 shadow-sm transition-all duration-300 ${form.is_available?'left-[24px]':'left-0.5'}`}/>
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-14 bg-slate-900 text-white font-black rounded-2xl active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10 transition-all mt-6"
              >
                {form.id ? 'Perbarui Menu' : 'Simpan Menu Baru'}
              </button>

            </form>
          </div>
        </div>
      )}

      {/* Konfirmasi hapus menu */}
      <DeleteConfirmSheet
        visible={!!deleteTarget}
        title={`Hapus "${deleteTarget?.name}"?`}
        message="Menu ini akan dihapus permanen. Resep terkait juga akan hilang."
        onConfirm={() => deleteTarget && deleteMenuItem(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
