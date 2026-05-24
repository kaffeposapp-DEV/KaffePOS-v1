import { memo } from 'react';
import { Printer } from 'lucide-react';
import type { Transaction } from '@/types';

const fRp = (n: number) =>
  new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);
const fDt = (d: string) =>
  new Date(d).toLocaleString('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

interface TransactionCardProps {
  transaction: Transaction;
  onDetail: (tx: Transaction) => void;
  onPrint: (tx: Transaction) => void;
}

export const TransactionCard = memo(function TransactionCard({
  transaction: tx,
  onDetail,
  onPrint,
}: TransactionCardProps) {
  return (
    <div
      onClick={() => onDetail(tx)}
      className={`kaffe-action-card group min-w-0 bg-white rounded-[28px] border p-5 cursor-pointer transition-all duration-300 hover:shadow-premium hover:border-[#FF6A00]/20 active:scale-[0.98]
        ${tx.is_void?'border-rose-100 bg-rose-50/10 opacity-70':'border-slate-100 shadow-soft'}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black text-slate-300 truncate uppercase tracking-widest">{tx.id}</span>
            {tx.is_void && <span className="text-[9px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md uppercase tracking-wider">Void</span>}
          </div>
          <p className="text-[15px] font-bold text-slate-800 truncate mb-1 group-hover:text-[#FF6A00] transition-colors">
            {tx.items.map((item) => `${item.name} x${item.qty}`).join(', ')}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>{fDt(tx.date)}</span>
            <div className="w-1 h-1 rounded-full bg-slate-100" />
            <span>{tx.method}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3 ml-4 shrink-0">
          <p className={`font-black text-lg tracking-tighter italic ${tx.is_void?'text-rose-300 line-through':'text-slate-900'}`}>
            {fRp(tx.total).replace('Rp', '').trim()}
          </p>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onPrint(tx); }}
            className="p-2 text-slate-300 hover:text-[#FF6A00] transition-colors bg-slate-50 rounded-xl"
            aria-label="Cetak struk"
          >
            <Printer size={16}/>
          </button>
        </div>
      </div>
    </div>
  );
});
