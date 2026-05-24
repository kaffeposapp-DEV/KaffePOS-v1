import { memo } from 'react';
import { Edit, Trash2, Plus, ClipboardCheck } from 'lucide-react';
import type { InventoryItem } from '@/types';

const fRp = (n: number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);

interface InventoryRowProps {
  item: InventoryItem;
  usedInMenus: string[];
  onEdit: (item: InventoryItem) => void;
  onRestock: (item: InventoryItem) => void;
  onOpname: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
}

export const InventoryRow = memo(function InventoryRow({
  item,
  usedInMenus,
  onEdit,
  onRestock,
  onOpname,
  onDelete,
}: InventoryRowProps) {
  const isLow = item.stock <= item.min_stock;
  const stockValue = item.stock * item.cost_per_unit;

  return (
    <div className={`kaffe-action-card group bg-white rounded-[24px] border p-4 transition-all duration-300 hover:shadow-premium hover:border-[#FF6A00]/20 ${isLow?'border-rose-200 bg-rose-50/30':'border-slate-100 shadow-soft'}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-black text-[15px] text-slate-900 truncate">{item.name}</h4>
            {isLow && <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Stok Menipis"/>}
          </div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{item.unit}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" aria-label="Edit item" onClick={()=>onEdit(item)} className="p-2 text-slate-400 hover:text-[#FF6A00] transition-colors rounded-lg"><Edit size={14}/></button>
          <button type="button" aria-label="Hapus item" onClick={()=>onDelete(item)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-lg"><Trash2 size={14}/></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Stok</p>
          <p className={`text-lg font-black ${isLow?'text-rose-600':'text-slate-900'}`}>{item.stock.toLocaleString('id-ID')}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Nilai</p>
          <p className="text-sm font-black text-slate-900">{fRp(stockValue)}</p>
        </div>
      </div>

      {usedInMenus.length > 0 && (
        <div className="mb-3 p-2 bg-blue-50/50 rounded-lg border border-blue-100">
          <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Digunakan di</p>
          <div className="flex flex-wrap gap-1">
            {usedInMenus.map((name,i)=>(
              <span key={i} className="text-[10px] font-bold text-blue-600 bg-white px-2 py-0.5 rounded-md">{name}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={()=>onRestock(item)} className="flex-1 h-9 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all">
          <Plus size={14}/> Restock
        </button>
        <button type="button" aria-label={`Opname ${item.name}`} onClick={()=>onOpname(item)} className="flex-1 h-9 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all">
          <ClipboardCheck size={14}/> Opname
        </button>
      </div>
    </div>
  );
});
