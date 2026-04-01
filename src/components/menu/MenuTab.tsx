// src/components/menu/MenuTab.tsx
import React, { useState, useMemo, useRef } from 'react';
import { Plus, Edit, Trash2, X, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Link2, Image } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet';
import type { MenuItem } from '@/types';

const fRp = (n: number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);
const EMPTY: Partial<MenuItem> = { name:'', price:0, category:'Coffee', image_url:'', description:'', recipe:[], variants:[], is_available:true };

export default function MenuTab({ toast }: any) {
  const { menu, inventory, saveMenuItem, deleteMenuItem } = useStore();
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState<Partial<MenuItem>>(EMPTY);
  const [cat,          setCat]          = useState('All');
  const [search,       setSearch]       = useState('');
  const [saving,       setSaving]       = useState(false);
  const [expandedId,   setExpandedId]   = useState<string|null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuItem|null>(null); // konfirmasi hapus
  const imgRef = useRef<HTMLInputElement>(null);

  const cats     = useMemo(() => ['All', ...new Set(menu.map(m => m.category))], [menu]);
  const filtered = useMemo(() => menu.filter(m => (cat==='All'||m.category===cat) && (!search||m.name.toLowerCase().includes(search.toLowerCase()))), [menu,cat,search]);

  const openNew  = () => { setForm({ ...EMPTY, recipe: [] }); setShowModal(true); };
  const openEdit = (item: MenuItem) => { setForm({ ...item, recipe: item.recipe ? [...item.recipe] : [] }); setShowModal(true); };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 1024*1024) { toast.showToast('Foto maks 1MB','warning'); return; }
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, image_url: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.showToast('Nama menu wajib diisi','warning'); return; }
    if (!form.price || form.price <= 0) { toast.showToast('Harga harus lebih dari 0','warning'); return; }
    setSaving(true);
    setShowModal(false);
    toast.showToast(form.id ? '✅ Menu diperbarui!' : '✅ Menu ditambahkan!', 'success');
    try { await saveMenuItem(form); }
    catch (err: any) { toast.showToast('Gagal: ' + err.message, 'error'); }
    finally { setSaving(false); }
  };

  const toggleAvailable = async (item: MenuItem) => {
    await saveMenuItem({ ...item, is_available: !item.is_available });
  };

  const addRecipeLine = () => setForm(f => ({ ...f, recipe: [...(f.recipe||[]), { matId: '', qty: 0 }] }));
  const updateRecipeLine = (idx: number, key: 'matId'|'qty', val: any) => {
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
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari menu..."
          className="w-full bg-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none mb-2" style={{fontSize:16}}/>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {cats.map(c=>(
            <button key={c} onClick={()=>setCat(c)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${cat===c?'bg-orange-500 text-white':'bg-slate-100 text-slate-500'}`}>
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
                      : <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center shrink-0 text-2xl border border-orange-100">☕</div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-800 truncate">{item.name}</p>
                      <p className="text-orange-500 font-bold text-sm">{fRp(item.price)}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{item.category}</span>
                        {item.recipe?.length>0 && (
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
                      {item.recipe?.length>0 && (
                        <button onClick={()=>setExpandedId(expanded?null:item.id)} className="p-1 text-slate-400">
                          {expanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
                        </button>
                      )}
                    </div>
                  </div>
                  {expanded && item.recipe?.length>0 && (
                    <div className="border-t border-slate-100 bg-slate-50 px-3 py-2.5">
                      <p className="text-[10px] font-black text-slate-400 mb-2">RESEP BAHAN BAKU</p>
                      <div className="space-y-1.5">
                        {item.recipe.map((r,i)=>{
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white rounded-t-3xl px-5 pt-5 pb-3 border-b border-slate-100 z-10">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-lg">{form.id?'Edit Menu':'Menu Baru'}</h3>
                <button onClick={()=>setShowModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><X size={16}/></button>
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
                      : <div className="text-center"><div className="text-2xl">☕</div><p className="text-[10px] text-slate-300 mt-0.5">Kosong</p></div>
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
                <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload}/>
              </div>

              {/* NAMA & HARGA */}
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Nama Menu *</label>
                <input value={form.name||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  placeholder="Kopi Susu Gula Aren"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400" style={{fontSize:16}}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Harga (Rp) *</label>
                  <input type="number" inputMode="numeric" value={form.price||''}
                    onChange={e=>setForm(f=>({...f,price:parseInt(e.target.value)||0}))}
                    placeholder="25000"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400" style={{fontSize:16}}/>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Kategori</label>
                  <input value={form.category||'Coffee'} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                    placeholder="Coffee"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400" style={{fontSize:16}}/>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Deskripsi (opsional)</label>
                <textarea value={form.description||''} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                  rows={2} placeholder="Kopi susu dengan gula aren asli..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400 resize-none" style={{fontSize:16}}/>
              </div>

              {/* RESEP */}
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-black text-slate-700">RESEP BAHAN BAKU</p>
                    <p className="text-[11px] text-slate-400">Stok gudang otomatis berkurang saat terjual</p>
                  </div>
                  <button type="button" onClick={addRecipeLine}
                    className="flex items-center gap-1 px-3 py-1.5 bg-orange-100 text-orange-600 rounded-lg text-xs font-bold active:scale-95">
                    <Plus size={11}/>Tambah
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
                  <div className="space-y-2">
                    {(form.recipe||[]).map((r,idx)=>(
                      <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2">
                        <select value={r.matId} onChange={e=>updateRecipeLine(idx,'matId',e.target.value)}
                          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-orange-400 bg-white">
                          <option value="">-- Pilih Bahan --</option>
                          {inventory.map(inv=><option key={inv.id} value={inv.id}>{inv.name} ({inv.stock} {inv.unit})</option>)}
                        </select>
                        <input type="number" inputMode="decimal" value={r.qty||''} onChange={e=>updateRecipeLine(idx,'qty',e.target.value)}
                          placeholder="Qty" step="0.1"
                          className="w-16 border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-orange-400 text-center shrink-0" style={{fontSize:14}}/>
                        <span className="text-xs text-slate-400 w-7 shrink-0 text-center">
                          {inventory.find(i=>i.id===r.matId)?.unit||''}
                        </span>
                        <button type="button" onClick={()=>removeRecipeLine(idx)} className="text-red-400 p-1 shrink-0"><X size={13}/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* TOGGLE AVAILABLE */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-bold text-slate-700">Tersedia untuk dijual</p>
                  <p className="text-xs text-slate-400">Tampil di tab POS</p>
                </div>
                <button type="button" onClick={()=>setForm(f=>({...f,is_available:!f.is_available}))}>
                  {form.is_available?<ToggleRight size={28} className="text-green-500"/>:<ToggleLeft size={28} className="text-slate-300"/>}
                </button>
              </div>

              <button type="submit"
                className="w-full py-3.5 bg-orange-500 text-white font-black rounded-2xl active:scale-95 flex items-center justify-center gap-2 text-base">
                Simpan Menu
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
