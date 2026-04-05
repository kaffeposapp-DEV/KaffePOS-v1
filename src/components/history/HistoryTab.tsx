 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/history/HistoryTab.tsx — KaffePOS v4 — PrintActionSheet
import { useState, useMemo, useCallback, useRef } from 'react';
import { X, Ban, Search, Printer, ChevronDown } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import PrintActionSheet from '@/components/pos/PrintActionSheet';

const fRp = (n: number) =>
  new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);
const fDt = (d: string) =>
  new Date(d).toLocaleString('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

const PAGE_SIZE = 30;

type Period = 'today' | '7d' | '30d' | 'all';

export default function HistoryTab({ toast }:any) {
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
      toast.showToast(e.message,'error');
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
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-3 pb-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-black text-slate-800 text-lg">Riwayat</h2>
          <div className="text-right">
            <p className="font-black text-orange-500 text-sm">{fRp(totalRev)}</p>
            <p className="text-xs text-slate-400">{totalCount} trx{totalVoid > 0 ? ` · ${totalVoid} void` : ''}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e=>handleSearch(e.target.value)}
            placeholder="Cari ID, menu, kasir..."
            className="w-full bg-slate-100 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none"
            style={{fontSize:16}}/>
        </div>

        {/* Period filter */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => { setPeriod(p.id); setPage(1); }}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                ${period===p.id?'bg-orange-500 text-white':'bg-slate-100 text-slate-500'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <p className="text-sm">Belum ada transaksi pada periode ini</p>
          </div>
        ) : (
          <>
            {paginated.map(tx => (
              <div key={tx.id} onClick={() => setDetail(tx)}
                className={`bg-white rounded-2xl border p-3.5 cursor-pointer active:scale-[0.99] transition-transform
                  ${tx.is_void?'border-red-100 opacity-60':'border-slate-100'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-400 truncate">{tx.id}</span>
                      {tx.is_void && <span className="text-[10px] font-black text-red-500 bg-red-50 px-2 py-0.5 rounded-full shrink-0">VOID</span>}
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {tx.items.map(i=>`${i.name} x${i.qty}`).join(', ')}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {fDt(tx.date)} · {tx.method} · {tx.cashier}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <button
                    onClick={e => { e.stopPropagation(); handlePrint(tx); }}
                    className="p-1.5 text-slate-400 active:text-orange-500 active:scale-90">
                    <Printer size={15}/>
                  </button>
                    <p className={`font-black text-base ${tx.is_void?'text-red-400 line-through':'text-slate-800'}`}>
                      {fRp(tx.total)}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Load more */}
            {page < pageCount && (
              <button onClick={() => setPage(p => p + 1)}
                className="w-full py-3 border-2 border-slate-200 rounded-2xl text-sm font-bold text-slate-500 flex items-center justify-center gap-2 active:scale-95">
                <ChevronDown size={16}/> Muat Lebih Banyak ({filtered.length - paginated.length} lagi)
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Detail Modal ── */}
      {detail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-black text-lg">Detail Transaksi</h3>
                <p className="text-slate-400 text-xs">{detail.id}</p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1 active:scale-90"><X size={20}/></button>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 mb-4 text-sm space-y-1.5">
              {detail.items.map((i:any, idx: number) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-slate-600">{i.name} x{i.qty}</span>
                  <span className="font-bold">{fRp(i.subtotal)}</span>
                </div>
              ))}
              <div className="border-t pt-1.5 space-y-1">
                <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{fRp(detail.subtotal)}</span></div>
                {detail.discount > 0 && <div className="flex justify-between text-green-600 font-bold"><span>Diskon</span><span>-{fRp(detail.discount)}</span></div>}
                {detail.tax > 0 && <div className="flex justify-between text-slate-400"><span>Pajak</span><span>{fRp(detail.tax)}</span></div>}
                <div className="flex justify-between font-black text-base border-t pt-1"><span>Total</span><span className="text-orange-500">{fRp(detail.total)}</span></div>
                <div className="flex justify-between text-xs text-slate-400"><span>Metode</span><span className="font-bold">{detail.method}</span></div>
                <div className="flex justify-between text-xs text-slate-400"><span>Kasir</span><span>{detail.cashier}</span></div>
                <div className="flex justify-between text-xs text-slate-400"><span>Waktu</span><span>{fDt(detail.date)}</span></div>
              </div>
            </div>

            {/* Printer status bar */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3 text-xs font-bold bg-slate-50 text-slate-500">
              <Printer size={12}/>
              <span>Pilih metode cetak saat klik tombol di bawah</span>
            </div>

            <button
              onClick={() => handlePrint(detail)}
              className="w-full py-3 mb-2.5 border-2 border-orange-200 text-orange-600 font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95">
              <Printer size={16}/> Cetak Ulang Struk
            </button>

            {!detail.is_void ? (
              <button onClick={() => setShowVoid(detail)}
                className="w-full py-3 border-2 border-red-200 text-red-500 font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95">
                <Ban size={16}/> Void Transaksi
              </button>
            ) : (
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-red-500 font-bold text-sm">Transaksi sudah di-void</p>
                {detail.void_reason && <p className="text-red-400 text-xs mt-1">&quot;{detail.void_reason}&quot;</p>}
              </div>
            )}
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
        toast={toast}
      />
    </div>
  );
}
