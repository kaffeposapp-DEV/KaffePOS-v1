




/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/history/HistoryTab.tsx — KaffePOS v4 — PrintActionSheet
import { useState, useMemo, useCallback, useRef } from 'react';
import { X, Ban, Search, Printer, ChevronDown } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import PrintActionSheet from '@/components/pos/PrintActionSheet';
import { normalizeUserFacingError } from '@/lib/errorMessages';
import type { SubscriptionAccess } from '@/lib/subscriptionAccess';

const fRp = (n: number) =>
  new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);
const fDt = (d: string) =>
  new Date(d).toLocaleString('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

const PAGE_SIZE = 30;

type Period = 'today' | '7d' | '30d' | 'all';

export default function HistoryTab({
  toast,
  subscriptionAccess,
}: {
  toast: { showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void };
  subscriptionAccess: SubscriptionAccess;
}) {
  const { transactions, voidTransaction, storeSettings } = useStore();

  const [search,   setSearch]   = useState('');
  const [dSearch,  setDSearch]  = useState('');
  const [detail,   setDetail]   = useState<any>(null);
  const [voidR,    setVoidR]    = useState('');
  const [showVoid, setShowVoid] = useState<any>(null);
  const [voiding,  setVoiding]  = useState(false);
  const [period,   setPeriod]   = useState<Period>('all');
  const [page,     setPage]     = useState(1);
  const [showPrintSheet, setShowPrintSheet] = useState(false);
  const [printTx, setPrintTx] = useState<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDSearch(val); setPage(1); }, 250);
  }, [],   );

  // ── Period filter ────────────────────────────────────────────
  const periodCutoff = useMemo((): number | null => {
    const now = new Date();
    if (period === 'today') {
      const d = new Date(now); d.setHours(0,0,0,0); return d.getTime();
    }
    if (period === '7d')  { const d = new Date(now); d.setDate(d.getDate()-7);  return d.getTime(); }
    if (period === '30d') { const d = new Date(now); d.setDate(d.getDate()-30); return d.getTime(); }
    return null;
  }, [period]);

  const filtered = useMemo(() => {
    const q = dSearch.toLowerCase();
    return [...transactions]
      .filter(t => {
      const txTime = new Date(t.date).getTime();
      if (periodCutoff && Number.isFinite(txTime) && txTime < periodCutoff) return false;
      if (!q) return true;
      return (
        t.id.toLowerCase().includes(q) ||
        (t.cashier || '').toLowerCase().includes(q) ||
        t.items.some(i => i.name.toLowerCase().includes(q)) ||
        t.method.toLowerCase().includes(q)
      );
    })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, dSearch, periodCutoff]);

  const pageCount  = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);
  const totalRev   = useMemo(() => filtered.filter(t => !t.is_void).reduce((s,t) => s+t.total, 0), [filtered]);
  const totalVoid  = useMemo(() => filtered.filter(t => t.is_void).length, [filtered]);
  const totalCount = useMemo(() => filtered.filter(t => !t.is_void).length, [filtered]);

  const handleVoid = useCallback(async () => {
    if (!voidR.trim()) { toast.showToast('Masukkan alasan void','warning'); return; }
    setVoiding(true);
    try {
      await voidTransaction(showVoid.id, voidR, 'owner');
      toast.showToast('Transaksi di-void','success');
      setShowVoid(null); setVoidR('');
      if (detail?.id === showVoid.id) setDetail(null);
    } catch(e:any) {
      toast.showToast(normalizeUserFacingError(e, 'Transaksi belum bisa di-void. Coba lagi.'),'error');
    } finally { setVoiding(false); }
  }, [voidR, showVoid, detail, voidTransaction, toast]);

  // Buka PrintActionSheet
  const handlePrint = useCallback((tx:any) => {
    setPrintTx(tx);
    setShowPrintSheet(true);
  }, [],   );

  const PERIODS: { id: Period; label: string }[] = [
    { id: 'today', label: 'Hari Ini' },
    { id: '7d',    label: '7 Hari' },
    { id: '30d',   label: '30 Hari' },
    { id: 'all',   label: 'Semua' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white lg:bg-slate-50/50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 pt-6 pb-4 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-black text-xl text-slate-800 italic uppercase tracking-tighter">Riwayat Transaksi</h2>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">
              {totalCount} SUKSES {totalVoid > 0 && <span className="text-rose-400 ml-1">· {totalVoid} VOID</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="font-black text-2xl text-[#FF6A00] tracking-tighter italic">{fRp(totalRev)}</p>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-1">Total Pendapatan</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"/>
          <input
            value={search}
            onChange={e=>handleSearch(e.target.value)}
            placeholder="Cari ID, menu, atau kasir..."
            className="w-full h-12 bg-slate-50/50 border border-slate-100 rounded-2xl pl-12 pr-4 text-[15px] focus:outline-none focus:ring-4 focus:ring-[#FF6A00]/5 focus:border-[#FF6A00]/20 transition-all font-bold text-slate-700 placeholder:text-slate-300 shadow-sm"
          />
        </div>

        {/* Period filter */}
        <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-6 px-6 border-b border-slate-50">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => { setPeriod(p.id); setPage(1); }}
              className={`shrink-0 pb-3 text-[13px] font-black uppercase tracking-widest transition-all relative ${
                period===p.id
                  ? 'text-[#FF6A00]'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {p.label}
              {period===p.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF6A00] rounded-full animate-in fade-in" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-slate-300">
            <Search size={40} className="mb-3 opacity-20" />
            <p className="text-[12px] font-black uppercase tracking-[0.2em]">Data Tidak Ditemukan</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paginated.map(tx => (
              <div key={tx.id} onClick={() => setDetail(tx)}
                className={`group bg-white rounded-[28px] border p-5 cursor-pointer transition-all duration-300 hover:shadow-premium hover:border-[#FF6A00]/20 active:scale-[0.98]
                  ${tx.is_void?'border-rose-100 bg-rose-50/10 opacity-70':'border-slate-100 shadow-soft'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-black text-slate-300 truncate uppercase tracking-widest">{tx.id}</span>
                      {tx.is_void && <span className="text-[9px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md uppercase tracking-wider">Void</span>}
                    </div>
                    <p className="text-[15px] font-bold text-slate-800 truncate mb-1 group-hover:text-[#FF6A00] transition-colors">
                      {tx.items.map(i=>`${i.name} x${i.qty}`).join(', ')}
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
                      onClick={e => { e.stopPropagation(); handlePrint(tx); }}
                      className="p-2 text-slate-300 hover:text-[#FF6A00] transition-colors bg-slate-50 rounded-xl">
                      <Printer size={16}/>
                    </button>
                  </div>
                </div>
              </div>
            ))}
            </div>

            {/* Load more */}
            {page < pageCount && (
              <button onClick={() => setPage(p => p + 1)}
                className="w-full py-3 border-2 border-slate-200 rounded-2xl text-sm font-bold text-slate-500 flex items-center justify-center gap-2 active:scale-95">
                <ChevronDown size={16}/> Muat Lebih Banyak ({filtered.length - paginated.length} lagi)
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Detail Modal ── */}
      {detail && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="bg-white w-full max-w-[480px] rounded-t-[32px] md:rounded-[40px] p-8 max-h-[95vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom-20 duration-500">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="font-black text-2xl text-slate-800 italic uppercase tracking-tighter">Detail Pesanan 🧾</h3>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">ID: {detail.id}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-3 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"><X size={24}/></button>
            </div>

            <div className="bg-slate-50 rounded-[32px] p-6 mb-8 border border-slate-100">
              <div className="space-y-4 mb-6">
                {detail.items.map((i:any, idx: number) => (
                  <div key={idx} className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 text-[15px]">{i.name}</p>
                      <p className="text-slate-400 text-[12px] font-bold uppercase tracking-wider">x{i.qty} · {fRp(i.price)}</p>
                    </div>
                    <span className="font-black text-slate-800 text-[15px] italic">{fRp(i.subtotal)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200/60 border-dashed pt-4 space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest"><span>Subtotal</span><span>{fRp(detail.subtotal)}</span></div>
                {detail.discount > 0 && <div className="flex justify-between text-xs font-black text-rose-500 uppercase tracking-widest"><span>Diskon</span><span>-{fRp(detail.discount)}</span></div>}
                {detail.tax > 0 && <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest"><span>Pajak</span><span>{fRp(detail.tax)}</span></div>}
                <div className="flex justify-between items-center pt-3 border-t border-slate-200/60 mt-2">
                  <span className="text-[16px] font-black text-slate-900 uppercase italic tracking-tighter">Total Akhir</span>
                  <span className="text-2xl font-black text-[#FF6A00] italic tracking-tighter">{fRp(detail.total)}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
               <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Metode</p>
                  <p className="text-[14px] font-black text-slate-700">{detail.method}</p>
               </div>
               <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Kasir</p>
                  <p className="text-[14px] font-black text-slate-700">{detail.cashier}</p>
               </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handlePrint(detail)}
                className="w-full py-5 bg-white border-2 border-slate-100 text-slate-700 font-black text-[15px] uppercase italic tracking-wider rounded-[24px] flex items-center justify-center gap-3 active:scale-95 transition-all hover:border-[#FF6A00]/30 hover:bg-orange-50/30">
                <Printer size={20}/> Cetak Struk
              </button>

              {!detail.is_void ? (
                <button onClick={() => setShowVoid(detail)}
                  className="w-full py-5 text-rose-400 font-black text-[15px] uppercase italic tracking-wider rounded-[24px] flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-rose-50">
                  <Ban size={20}/> Void Transaksi
                </button>
              ) : (
                <div className="bg-rose-50 rounded-[24px] p-6 text-center border border-rose-100">
                  <p className="text-rose-500 font-black text-sm uppercase tracking-widest">Transaksi Telah Di-Void</p>
                  {detail.void_reason && <p className="text-rose-400 text-xs font-bold mt-2 italic">&quot;{detail.void_reason}&quot;</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Void Confirm Modal ── */}
      {showVoid && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm">
            <h3 className="font-black text-lg text-red-600 mb-1">Void Transaksi?</h3>
            <p className="text-slate-500 text-sm mb-4">{fRp(showVoid.total)} · {showVoid.id}</p>
            <label className="text-xs font-bold text-slate-500 mb-1 block">Alasan Void *</label>
            <input value={voidR} onChange={e=>setVoidR(e.target.value)}
              placeholder="Contoh: Salah input, customer cancel..."
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400 mb-4"
              style={{fontSize:16}} autoFocus
              onKeyDown={e=>e.key==='Enter'&&handleVoid()}/>
            <div className="flex gap-2">
              <button onClick={() => { setShowVoid(null); setVoidR(''); }}
                className="flex-1 py-3 border border-slate-200 rounded-2xl font-bold text-slate-600 active:scale-95">
                Batal
              </button>
              <button onClick={handleVoid} disabled={voiding}
                className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-black disabled:opacity-50 flex items-center justify-center gap-1.5 active:scale-95">
                {voiding && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>}
                {voiding ? 'Voiding...' : 'Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PrintActionSheet */}
      <PrintActionSheet
        visible={showPrintSheet}
        onClose={() => setShowPrintSheet(false)}
        transaction={printTx}
        storeSettings={storeSettings}
        allowThermalPrint={subscriptionAccess.features.thermal_print}
        toast={toast}
      />
    </div>
  );
}
