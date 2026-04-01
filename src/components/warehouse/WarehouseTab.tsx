// src/components/warehouse/WarehouseTab.tsx
import React, { useState, useMemo } from 'react';
import { Plus, Archive, Trash2, X, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet';

const fRp = (n: number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);

export default function WarehouseTab({ toast }: any) {
  const { inventory, menu, saveInventoryItem, deleteInventoryItem } = useStore();
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState({ id:'', name:'', qty:'', cost:'', unit:'gr', minStock:'5', type:'new' });
  const [search,       setSearch]       = useState('');
  const [saving,       setSaving]       = useState(false);
  const [expandedId,   setExpandedId]   = useState<string|null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{id:string;name:string}|null>(null);

  const filtered = useMemo(() =>
    inventory.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  , [inventory, search]);

  const lowStock = inventory.filter(i => i.stock <= i.min_stock);

  // Which menus use each inventory item
  const usedInMenu = useMemo(() => {
    const map: Record<string, string[]> = {};
    menu.forEach(m => {
      (m.recipe||[]).forEach(r => {
        if (!map[r.matId]) map[r.matId] = [];
        if (!map[r.matId].includes(m.name)) map[r.matId].push(m.name);
      });
    });
    return map;
  }, [menu]);

  const openNew     = () => { setForm({ id:'', name:'', qty:'', cost:'', unit:'gr', minStock:'5', type:'new' }); setShowModal(true); };
  const openRestock = (item: any) => { setForm({ id:item.id, name:item.name, qty:'', cost:'', unit:item.unit, minStock:String(item.min_stock||5), type:'restock' }); setShowModal(true); };
  const openEdit    = (item: any) => { setForm({ id:item.id, name:item.name, qty:String(item.stock), cost:String(Math.round(item.cost_per_unit * item.stock)), unit:item.unit, minStock:String(item.min_stock||5), type:'edit' }); setShowModal(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.qty) { toast.showToast('Nama dan jumlah wajib diisi', 'warning'); return; }
    setSaving(true);
    setShowModal(false); // tutup modal langsung
    try {
      await saveInventoryItem(form);
      const msg = form.type==='new' ? '✅ Bahan ditambahkan!' : form.type==='edit' ? '✅ Bahan diperbarui!' : '✅ Stok diperbarui!';
      toast.showToast(msg, 'success');
    } catch (e: any) {
      toast.showToast('Gagal menyimpan: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const getStockPct = (item: any) => item.min_stock > 0 ? Math.min((item.stock / item.min_stock) * 100, 200) : 100;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="bg-white border-b border-slate-100 px-4 pt-3 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-slate-800 text-lg">Gudang Bahan</h2>
          <div className="flex gap-2">
            <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold active:scale-95">
              <Plus size={13}/>Bahan Baru
            </button>
            <button onClick={()=>{setForm({id:'',name:'',qty:'',cost:'',unit:'gr',minStock:'5',type:'restock'});setShowModal(true);}}
              className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold active:scale-95">
              <Archive size={13}/>Restock
            </button>
          </div>
        </div>

        {lowStock.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 mb-2 flex items-start gap-2">
            <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5"/>
            <div>
              <p className="text-red-600 text-xs font-black">{lowStock.length} bahan stok kritis!</p>
              <p className="text-red-400 text-xs">{lowStock.map(i=>i.name).join(', ')}</p>
            </div>
          </div>
        )}

        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari bahan baku..."
          className="w-full bg-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none" style={{fontSize:16}}/>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <p className="text-3xl mb-2">📦</p><p className="text-sm">Belum ada bahan baku</p>
            <p className="text-xs text-slate-300 mt-1">Tambahkan bahan untuk pantau stok & resep menu</p>
          </div>
        ) : filtered.map(item => {
          const isLow = item.stock <= item.min_stock;
          const pct   = getStockPct(item);
          const inMenus = usedInMenu[item.id] || [];
          const expanded = expandedId === item.id;
          const barColor = isLow ? '#ef4444' : pct < 150 ? '#f97316' : '#10b981';

          return (
            <div key={item.id} className={`bg-white rounded-2xl border-2 overflow-hidden ${isLow?'border-red-200':'border-slate-100'}`}>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-slate-800">{item.name}</p>
                      {isLow && <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">⚠ Kritis</span>}
                      {inMenus.length>0 && (
                        <button onClick={()=>setExpandedId(expanded?null:item.id)}
                          className="text-xs font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                          {inMenus.length} menu {expanded?<ChevronUp size={10}/>:<ChevronDown size={10}/>}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xl font-black ${isLow?'text-red-500':'text-slate-800'}`}>
                        {item.stock.toLocaleString('id-ID')} <span className="text-sm font-bold text-slate-400">{item.unit}</span>
                      </span>
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-slate-400">
                      <span>Min: {item.min_stock} {item.unit}</span>
                      <span>HPP: {fRp(item.cost_per_unit)}/{item.unit}</span>
                      <span>Nilai: {fRp(item.stock * item.cost_per_unit)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 ml-2 shrink-0">
                    <button onClick={()=>openRestock(item)} className="px-3 py-1.5 bg-orange-100 text-orange-600 rounded-lg text-xs font-bold active:scale-95">Restock</button>
                    <button onClick={()=>openEdit(item)} className="px-2 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold active:scale-95">Edit</button>
                    <button onClick={() => setDeleteTarget({ id: item.id, name: item.name })}
                      className="p-1.5 text-slate-300 hover:text-red-400 active:scale-95"><Trash2 size={14}/></button>
                  </div>
                </div>

                {/* Stock bar */}
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all" style={{width:`${Math.min(pct/2,100)}%`, backgroundColor:barColor}}/>
                </div>
                <div className="flex justify-between text-[10px] text-slate-300 mt-0.5">
                  <span>0</span><span>Min: {item.min_stock}</span>
                </div>
              </div>

              {/* Menu yang menggunakan bahan ini */}
              {expanded && inMenus.length>0 && (
                <div className="border-t border-slate-100 bg-blue-50 px-4 py-3">
                  <p className="text-xs font-black text-blue-400 mb-2">DIGUNAKAN DI MENU</p>
                  <div className="flex flex-wrap gap-2">
                    {inMenus.map((name,i)=>(
                      <span key={i} className="text-xs font-bold bg-white text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                        {name}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-blue-400 mt-2">Stok berkurang otomatis saat menu ini terjual di POS</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg">
                {form.type==='new'?'Bahan Baru':form.type==='edit'?'Edit Bahan':'Restock Bahan'}
              </h3>
              <button onClick={()=>setShowModal(false)} className="text-slate-400"><X size={20}/></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              {form.type!=='restock' ? (
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Nama Bahan *</label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                    placeholder="Biji Kopi Arabica"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400" style={{fontSize:16}}/>
                </div>
              ) : (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="font-bold text-orange-700">{form.name}</p>
                  <p className="text-orange-500 text-xs">Menambah stok yang sudah ada</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">
                    {form.type==='new'?'Stok Awal':form.type==='edit'?'Jumlah Stok':'Jumlah Restock'} *
                  </label>
                  <input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}
                    placeholder="0" step="0.1"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400" style={{fontSize:16}}/>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Satuan</label>
                  <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400 bg-white">
                    {['gr','kg','ml','L','pcs','btl','bks','lbr','sachet'].map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Total Biaya Beli (Rp)</label>
                <input type="number" value={form.cost} onChange={e=>setForm(f=>({...f,cost:e.target.value}))}
                  placeholder="0"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400" style={{fontSize:16}}/>
                <p className="text-xs text-slate-400 mt-1">
                  {form.qty && form.cost
                    ? `HPP per ${form.unit}: ${fRp(parseInt(form.cost)/(parseFloat(form.qty)||1))}`
                    : 'Isi untuk hitung HPP/unit otomatis'}
                </p>
              </div>
              {form.type !== 'restock' && (
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Stok Minimum (Peringatan)</label>
                  <input type="number" value={form.minStock} onChange={e=>setForm(f=>({...f,minStock:e.target.value}))}
                    placeholder="5"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400" style={{fontSize:16}}/>
                  <p className="text-xs text-slate-400 mt-1">Notifikasi ⚠ muncul saat stok ≤ nilai ini</p>
                </div>
              )}
              <button type="submit" disabled={saving}
                className="w-full py-3.5 bg-orange-500 text-white font-black rounded-2xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving&&<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>}
                {saving?'Menyimpan...':'Simpan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Konfirmasi hapus bahan baku */}
      <DeleteConfirmSheet
        visible={!!deleteTarget}
        title={`Hapus "${deleteTarget?.name}"?`}
        message="Bahan baku ini akan dihapus permanen. Resep menu yang menggunakan bahan ini akan terpengaruh."
        onConfirm={() => deleteTarget && deleteInventoryItem(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
