 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react';
import { Plus, Archive, Trash2, X, AlertTriangle, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet';
import type { InventoryItem, InventoryItemUpdate, MenuItem } from '@/types';
import { getInventoryUsageMap } from '@/utils/receipt';

const fRp = (n: number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);

interface WarehouseForm {
  id: string;
  name: string;
  qty: string;
  cost: string;
  unit: string;
  minStock: string;
  type: 'new' | 'edit' | 'restock';
}

export default function WarehouseTab({ toast }: { toast:any }) {
  const { inventory, menu, transactions, saveInventoryItem, deleteInventoryItem } = useStore();
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState<WarehouseForm>({ id:'', name:'', qty:'', cost:'', unit:'gr', minStock:'5', type:'new' });
  const [search,       setSearch]       = useState('');
  const [saving,       setSaving]       = useState(false);
  const [expandedId,   setExpandedId]   = useState<string|null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{id:string;name:string}|null>(null);

  const filtered = useMemo(() =>
    inventory.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  , [inventory, search]);

  const lowStock = inventory.filter(i => i.stock <= i.min_stock);
  const usageMap = useMemo(() => {
    const rows = getInventoryUsageMap(inventory, menu, transactions);
    return new Map(rows.map((row) => [row.itemId, row]));
  }, [inventory, menu, transactions]);

  // Which menus use each inventory item
  const usedInMenu = useMemo(() => {
    const map: Record<string, string[]> = {};
    menu.forEach((m: MenuItem) => {
      (m.recipe||[]).forEach(r => {
        if (!map[r.matId]) map[r.matId] = [];
        if (!map[r.matId].includes(m.name)) map[r.matId].push(m.name);
      });
    });
    return map;
  }, [menu]);

  const openNew     = () => { setForm({ id:'', name:'', qty:'', cost:'', unit:'gr', minStock:'5', type:'new' }); setShowModal(true); };
  const openRestock = (item: InventoryItem) => { setForm({ id:item.id, name:item.name, qty:'', cost:'', unit:item.unit, minStock:String(item.min_stock||5), type:'restock' }); setShowModal(true); };
  const openEdit    = (item: InventoryItem) => { setForm({ id:item.id, name:item.name, qty:String(item.stock), cost:String(Math.round(item.cost_per_unit * item.stock)), unit:item.unit, minStock:String(item.min_stock||5), type:'edit' }); setShowModal(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.qty) { toast.showToast('Nama dan jumlah wajib diisi', 'warning'); return; }
    const qty = Number(form.qty);
    const cost = Number(form.cost || 0);
    const minStock = Number(form.minStock || 0);
    if (qty < 0 || cost < 0 || minStock < 0) {
      toast.showToast('Qty, biaya, dan stok minimum tidak boleh negatif', 'warning');
      return;
    }
    setSaving(true);
    try {
      await saveInventoryItem(form as unknown as InventoryItemUpdate);
      setShowModal(false);
      const msg = form.type==='new' ? '✅ Bahan ditambahkan!' : form.type==='edit' ? '✅ Bahan diperbarui!' : '✅ Stok diperbarui!';
      toast.showToast(msg, 'success');
    } catch (e:any) {
      toast.showToast('Gagal menyimpan: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const getStockMeta = (item: InventoryItem) => {
    const usage = usageMap.get(item.id);
    const healthPct = item.min_stock > 0 ? Math.min((item.stock / item.min_stock) * 100, 200) : 100;
    const fillPct = usage?.percent ?? 100;
    const isLow = item.stock <= item.min_stock;
    const barColor = isLow ? '#ef4444' : fillPct < 40 ? '#f97316' : '#10b981';
    return {
      used: usage?.used || 0,
      baseline: usage?.baseline || item.stock,
      fillPct,
      healthPct,
      barColor,
      label: isLow ? 'Stok menipis' : fillPct >= 70 ? 'Stok full' : 'Stok aman',
    };
  };

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
        <p className="text-[11px] text-slate-400 mb-3">
          Restock dari Gudang tercatat sebagai pembelian bahan baku dan tidak mengurangi saldo awal kasir.
        </p>

        {lowStock.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 mb-2 flex items-start gap-2">
            <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5"/>
            <div>
              <p className="text-red-600 text-xs font-black">{lowStock.length} bahan stok kritis!</p>
              <p className="text-red-400 text-xs">{lowStock.map(i=>i.name).join(', ')}</p>
            </div>
          </div>
        )}

        <div className="relative mb-3">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input 
            value={search} 
            onChange={e=>setSearch(e.target.value)} 
            placeholder="Cari bahan baku..."
            className="w-full h-12 bg-slate-100 rounded-2xl pl-11 pr-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all border border-transparent focus:border-orange-200"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <p className="text-3xl mb-2">📦</p><p className="text-sm">Belum ada bahan baku</p>
            <p className="text-xs text-slate-300 mt-1">Tambahkan bahan untuk pantau stok & resep menu</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(item => {
          const isLow = item.stock <= item.min_stock;
          const stockMeta = getStockMeta(item);
          const inMenus = usedInMenu[item.id] || [];
          const expanded = expandedId === item.id;

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
                    <div className="flex gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                      <span>Terpakai: {stockMeta.used.toLocaleString('id-ID')} {item.unit}</span>
                      <span>Total tercatat: {stockMeta.baseline.toLocaleString('id-ID')} {item.unit}</span>
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
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div className="h-2.5 rounded-full transition-all" style={{width:`${stockMeta.fillPct}%`, backgroundColor:stockMeta.barColor}}/>
                </div>
                <div className="flex justify-between text-[10px] mt-1">
                  <span className={isLow ? 'text-red-500 font-bold' : 'text-slate-300'}>{stockMeta.label}</span>
                  <span className="text-slate-400">{stockMeta.fillPct}% sisa dari total stok tercatat</span>
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
        )}
      </div>

      {showModal && (
        <div 
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="modal-content bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-xl text-slate-900 tracking-tight">
                {form.type==='new'?'Bahan Baru':form.type==='edit'?'Edit Bahan':'Restock Bahan'}
              </h3>
              <button 
                onClick={()=>setShowModal(false)} 
                className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 active:bg-slate-100"
              >
                <X size={20}/>
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              {form.type!=='restock' ? (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-slate-700 pl-0.5">Nama Bahan *</label>
                  <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                    placeholder="Biji Kopi Arabica"
                    className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all" />
                </div>
              ) : (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <p className="font-bold text-orange-700">{form.name}</p>
                  <p className="text-orange-500 text-xs">Menambah stok yang sudah ada tanpa memotong saldo buka kasir</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-slate-700 pl-0.5">
                    {form.type==='new'?'Stok Awal':form.type==='edit'?'Jumlah Stok':'Jumlah Restock'} *
                  </label>
                  <input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}
                    placeholder="0" step="0.1"
                    className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-slate-700 pl-0.5">Satuan</label>
                  <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}
                    className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all appearance-none">
                    {['gr','kg','ml','L','pcs','btl','bks','lbr','sachet'].map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-bold text-slate-700 pl-0.5">Total Biaya Beli (Rp)</label>
                <input type="number" value={form.cost} onChange={e=>setForm(f=>({...f,cost:e.target.value}))}
                  placeholder="0"
                  className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all" />
                <p className="text-[11px] text-slate-400 pl-0.5 font-medium">
                  {form.qty && form.cost
                    ? `HPP per ${form.unit}: ${fRp(parseInt(form.cost)/(parseFloat(form.qty)||1))}`
                    : 'Isi untuk hitung HPP/unit otomatis'}
                </p>
              </div>
              {form.type !== 'restock' && (
                <div className="space-y-1.5">
                  <label className="text-[13px] font-bold text-slate-700 pl-0.5">Stok Minimum (Peringatan)</label>
                  <input type="number" value={form.minStock} onChange={e=>setForm(f=>({...f,minStock:e.target.value}))}
                    placeholder="5"
                    className="w-full h-12 border border-slate-200 rounded-2xl px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white transition-all" />
                  <p className="text-[11px] text-slate-400 pl-0.5 font-medium">Notifikasi ⚠ muncul saat stok ≤ nilai ini</p>
                </div>
              )}
              <button 
                type="submit" 
                disabled={saving}
                className="w-full h-14 bg-slate-900 text-white font-black rounded-2xl active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10 transition-all"
              >
                {saving&&<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                {saving?'Menyimpan...':'Simpan Perubahan'}
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
