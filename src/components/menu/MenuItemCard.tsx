import { memo } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import ProductPlaceholder from '@/components/ui/ProductPlaceholder';
import type { MenuItem } from '@/types';

const fRp = (n: number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);

interface MenuItemCardProps {
  item: MenuItem;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
  onToggleAvailable: (item: MenuItem) => void;
  getProductStatus: (item: MenuItem) => { label: string; className: string };
  getStockStatus: (item: MenuItem) => 'low' | 'ok' | null;
}

export const MenuItemCard = memo(function MenuItemCard({
  item,
  onEdit,
  onDelete,
  onToggleAvailable,
  getProductStatus,
  getStockStatus,
}: MenuItemCardProps) {
  const status = getProductStatus(item);
  const stockStatus = getStockStatus(item);

  return (
    <div className={`kaffe-action-card group bg-white rounded-[28px] border p-4 transition-all duration-300 hover:shadow-premium hover:border-[#FF6A00]/20 ${!item.is_available?'opacity-60 bg-slate-50/50':''}`}>
      <div className="flex gap-3">
        <div className="h-20 w-20 overflow-hidden rounded-[20px] border border-slate-100 bg-slate-50 shrink-0">
          {item.image_url
            ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
            : <ProductPlaceholder category={item.category} iconSize={24} />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <p className="font-bold text-slate-900 text-[16px] truncate leading-tight">{item.name}</p>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={`Edit ${item.name}`} onClick={()=>onEdit(item)} className="p-1.5 text-slate-400 hover:text-[#FF6A00] transition-colors"><Edit size={14}/></button>
              <button type="button" aria-label={`Hapus ${item.name}`} onClick={() => onDelete(item)} className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"><Trash2 size={14}/></button>
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
              onClick={()=>onToggleAvailable(item)}
              className={`w-10 h-6 rounded-full transition-all relative ${item.is_available ? 'bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]' : 'bg-slate-200'}`}
            >
              <div className={`h-[18px] w-[18px] bg-white rounded-full absolute top-[3px] transition-all duration-300 ${item.is_available ? 'left-[19px]' : 'left-[3px]'}`}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
