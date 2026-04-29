 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo } from 'react';
import { Plus, Archive, X, AlertTriangle, ChevronDown, ChevronUp, Search } from 'lucide-react';
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
    <div className="flex-1 flex flex-col overflow-hidden bg-white lg:bg-slate-50/50">
      <div className="bg-white border-b border-slate-100 px-6 pt-6 pb-4 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-black text-xl text-slate-800 italic uppercase tracking-tighter">Gudang Bahan</h2>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Manajemen Stok & HPP</p>
          </div>
          <div className="flex gap-2">
            <button onClick={openNew} className="flex items-center gap-2 h-10 px-4 bg-slate-100 text-slate-600 rounded-2xl text-[12px] font-black uppercase tracking-widest active:scale-95 transition-all">
              <Plus size={16}/>Baru
            </button>
            <button onClick={()=>{setForm({id:'',name:'',qty:'',cost:'',unit:'gr',minStock:'5',type:'restock'});setShowModal(true);}}
              className="flex items-center gap-2 h-10 px-4 bg-[#FF6A00] text-white rounded-2xl text-[12px] font-black uppercase italic tracking-widest active:scale-95 transition-all shadow-premium">
              <Archive size={16}/>Restock
            </button>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mb-4 font-bold uppercase tracking-widest leading-relaxed">
          Restock tercatat sebagai pembelian bahan baku dan tidak mengurangi saldo awal kasir.
        </p>

        {lowStock.length > 0 && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 mb-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5"/>
            <div>
              <p className="text-rose-600 text-[11px] font-black uppercase tracking-widest">{lowStock.length} BAHAN STOK KRITIS!</p>
              <p className="text-rose-400 text-xs font-bold mt-0.5 italic">{lowStock.map(i=>i.name).join(', ')}</p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-2">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"/>
          <input 
            value={search} 
            onChange={e=>setSearch(e.target.value)} 
            placeholder="Cari bahan baku..."
            className="w-full h-12 bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-4 text-[15px] focus:outline-none focus:ring-4 focus:ring-[#FF6A00]/5 focus:border-[#FF6A00]/20 transition-all font-bold text-slate-700 placeholder:text-slate-300 shadow-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-slate-300">
             <Archive size={48} className="mb-4 opacity-10" />
             <p className="text-[12px] font-black uppercase tracking-[0.2em]">Stok Kosong</p>
          </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map(item => {
          const isLow = item.stock <= item.min_stock;
          const stockMeta = getStockMeta(item);
          const inMenus = usedInMenu[item.id] || [];
          const expanded = expandedId === item.id;

          return (
            <div key={item.id} className={`group bg-white rounded-[32px] border-2 transition-all duration-300 hover:shadow-premium hover:border-[#FF6A00]/20 ${isLow?'border-rose-100 bg-rose-50/10 shadow-soft':'border-slate-50 shadow-soft'}`}>
              <div className="p-6">
                <div className="flex items-start justify-between mb-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <p className="font-bold text-slate-800 text-[16px] group-hover:text-[#FF6A00] transition-colors">{item.name}</p>
                      {isLow && <span className="text-[9px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md uppercase tracking-widest">Kritis</span>}
                      {inMenus.length>0 && (
                        <button onClick={()=>setExpandedId(expanded?null:item.id)}
                          className="text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md flex items-center gap-1.5 uppercase tracking-widest">
                          {inMenus.length} resep {expanded?<ChevronUp size={12}/>:<ChevronDown size={12}/>}
                        </button>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className={`font-black text-3xl tracking-tighter italic ${isLow?'text-rose-500':'text-slate-900'}`}>
                        {item.stock.toLocaleString('id-ID')}
                      </span>
                      <span className="text-[11px] font-black text-slate-300 uppercase tracking-widest">{item.unit}</span>
                    </div>
                    <div className="flex flex-col gap-1 mt-4">
                       <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.05em]">
                         <span>HPP: {fRp(item.cost_per_unit)}/{item.unit}</span>
                         <div className="w-1 h-1 rounded-full bg-slate-100" />
                         <span>Aset: {fRp(item.stock * item.cost_per_unit)}</span>
                       </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 ml-4 shrink-0">
                    <button onClick={()=>openRestock(item)} className="p-2.5 bg-orange-50 text-[#FF6A00] rounded-2xl hover:bg-orange-100 transition-colors border border-orange-100"><Archive size={18}/></button>
                    <button onClick={()=>openEdit(item)} className="p-2.5 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 transition-colors border border-slate-100"><Plus size={18} className="rotate-45"/></button>
                  </div>
                </div>

                {/* Stock bar */}
                <div className="w-full bg-slate-50 rounded-full h-3 overflow-hidden border border-slate-100/50">
                  <div className="h-3 rounded-full transition-all" style={{width:`${stockMeta.fillPct}%`, backgroundColor:stockMeta.barColor}}/>
                </div>
                <div className="flex justify-between text-[10px] mt-2 font-bold uppercase tracking-widest">
                  <span className={isLow ? 'text-rose-500' : 'text-slate-300'}>{stockMeta.label}</span>
                  <span className="text-slate-300">{stockMeta.fillPct}% sisa stok</span>
                </div>
              </div>

              {/* Menu yang menggunakan bahan ini */}
              {expanded && inMenus.length>0 && (
                <div className="border-t border-slate-50 bg-blue-50/30 px-6 py-4">
                  <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-3">DIGUNAKAN DI MENU</p>
                  <div className="flex flex-wrap gap-2">
                    {inMenus.map((name,i)=>(
                      <span key={i} className="text-[11px] font-black bg-white text-blue-600 border border-blue-100 px-3 py-1 rounded-xl shadow-sm">
                        {name}
                      </span>
                    ))}
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
                className="w-full h-14 bg-[#FF6A00] text-white font-black rounded-2xl active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 shadow-premium transition-all italic uppercase tracking-wider"
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
