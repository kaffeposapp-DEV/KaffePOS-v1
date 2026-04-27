 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/menu/MenuTab.tsx
import { useState, useMemo, useRef } from 'react';
import { Plus, Edit, Trash2, X, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Link2, Image, Search } from 'lucide-react';
import ProductPlaceholder from '@/components/ui/ProductPlaceholder';
import { useStore } from '@/hooks/useStore';
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet';
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
  const [expandedId,   setExpandedId]   = useState<string|null>(null);
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
    setSaving(true);
    try {
      await saveMenuItem(form);
      setShowModal(false);
      toast.showToast(form.id ? '✅ Menu diperbarui!' : '✅ Menu ditambahkan!', 'success');
    }
    catch (err:any) { toast.showToast('Gagal: ' + err.message, 'error'); }
    finally { setSaving(false); }
  };

  const toggleAvailable = async (item: MenuItem) => {
    await saveMenuItem({ ...item, is_available: !item.is_available });
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-3 sm:px-4 pt-3 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-slate-800 text-lg">Kelola Menu</h2>
          <button onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold active:scale-95 shrink-0">
            <Plus size={13}/>Tambah
          </button>
        </div>
        <div className="relative mb-3">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input 
            value={search} 
            onChange={e=>setSearch(e.target.value)} 
            placeholder="Cari menu..."
            className="w-full h-12 bg-slate-100 rounded-2xl pl-11 pr-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all border border-transparent focus:border-orange-200"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 sm:-mx-4 sm:px-4">
          {cats.map(c=>(
            <button 
              key={c} 
              onClick={()=>setCat(c)}
              className={`shrink-0 px-5 py-2 rounded-xl text-[13px] font-bold transition-all border ${
                cat===c 
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                  : 'bg-slate-100 text-slate-500 border-transparent hover:border-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length===0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <p className="text-3xl mb-2">🍽️</p><p className="text-sm">Belum ada menu</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map(item => {
              const stockStatus = getStockStatus(item);
              const expanded = expandedId === item.id;
              return (
                <div key={item.id} className={`bg-white rounded-2xl border-2 overflow-hidden ${!item.is_available?'opacity-60':stockStatus==='low'?'border-red-200':'border-slate-100'}`}>
                  <div className="flex items-center gap-3 p-3">
                    {item.image_url
                      ? <img src={item.image_url} className="w-14 h-14 rounded-xl object-cover shrink-0 border border-slate-100"/>
                      : <div className="w-14 h-14 rounded-xl shrink-0 overflow-hidden border border-slate-100"><ProductPlaceholder category={item.category} iconSize={20} /></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800 truncate">{item.name}</p>
                      <p className="text-orange-500 font-bold text-sm">{fRp(item.price)}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{item.category}</span>
                        {item.recipe && item.recipe.length > 0 && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${stockStatus==='low'?'bg-red-50 text-red-500':'bg-green-50 text-green-600'}`}>
                            <Link2 size={10}/>{item.recipe.length} bahan {stockStatus==='low'?'⚠':'✓'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <button onClick={()=>toggleAvailable(item)} className="p-1">
                        {item.is_available?<ToggleRight size={22} className="text-green-500"/>:<ToggleLeft size={22} className="text-slate-300"/>}
                      </button>
                      <button onClick={()=>openEdit(item)} className="p-1.5 text-slate-400 hover:text-orange-500"><Edit size={14}/></button>
                      <button onClick={() => setDeleteTarget(item)} className="p-1.5 text-slate-300 hover:text-red-400"><Trash2 size={14}/></button>
                      {item.recipe && item.recipe.length > 0 && (
                        <button onClick={()=>setExpandedId(expanded?null:item.id)} className="p-1 text-slate-400">
                          {expanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
                        </button>
                      )}
                    </div>
                  </div>
                  {expanded && item.recipe && item.recipe.length > 0 && (
                    <div className="border-t border-slate-100 bg-slate-50 px-3 py-2.5">
                      <p className="text-[10px] font-black text-slate-400 mb-2">RESEP BAHAN BAKU</p>
                      <div className="space-y-1.5">
                        {(item.recipe || []).map((r,i)=>{
                          const mat = inventory.find(inv=>inv.id===r.matId);
                          const ok  = mat && mat.stock>=r.qty;
                          return (
                            <div key={i} className={`flex items-center justify-between text-xs rounded-lg px-2.5 py-1.5 ${ok?'bg-green-50':'bg-red-50'}`}>
                              <span className="font-bold text-slate-700">{mat?.name||'Tidak ditemukan'}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-slate-400">{r.qty} {mat?.unit||''}</span>
                                <span className={`font-bold ${ok?'text-green-600':'text-red-500'}`}>Stok:{mat?.stock??'?'} {ok?'✓':'⚠'}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
                    <p className="text-amber-700 text-xs font-bold">Belum ada bahan di Gudang</p>
                    <p className="text-amber-500 text-xs mt-0.5">Tambah bahan di tab Gudang terlebih dahulu</p>
                  </div>
                ):(form.recipe||[]).length===0?(
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-slate-400 text-xs">Belum ada resep — menu tanpa resep tidak mengurangi stok</p>
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
                <div className={`w-12 h-6.5 rounded-full transition-all relative shrink-0 ${form.is_available?'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]':'bg-slate-200'}`}>
                  <div className={`w-5.5 h-5.5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all duration-300 ${form.is_available?'left-[24px]':'left-0.5'}`}/>
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
