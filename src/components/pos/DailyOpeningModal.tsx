/* eslint-disable react-hooks/exhaustive-deps */
 
 
/* eslint-disable react-refresh/only-export-components */
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/pos/DailyOpeningModal.tsx
// Dialog saldo kasir harian — VERSI FIXED
// Fixes: (1) tunggu data cashRegister siap sebelum cek, (2) save non-blocking, (3) offline support

import { useState, useEffect, useRef } from 'react';
import { Wallet, ChevronRight, Coffee, WifiOff } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import type { ToastType } from '@/types';
import { useModalBehavior } from '@/hooks/useModalBehavior';

const fRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

// ── Util localStorage ─────────────────────────────────────────────
const LS_KEY         = 'kpos_last_opening_date';
const LS_OFFLINE_KEY = 'kpos_opening_offline_queue';

function getTodayStr(): string {
  return new Date().toDateString(); // "Sat Mar 28 2026"
}
function getLastOpeningDate(): string {
  try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; }
}
function setLastOpeningDate() {
  try { localStorage.setItem(LS_KEY, getTodayStr()); } catch { /* ignore */ }
}
function wasOpenedToday(cashRegister: { date: string }[]): boolean {
  return cashRegister.some(c => new Date(c.date).toDateString() === getTodayStr());
}

// ── Hook: cek apakah perlu tampil dialog ─────────────────────────-
// PENTING: Tunggu sampai cashRegister sudah di-load dari server (syncing = false)
// agar tidak false positive saat data belum ada
export function useNeedsOpeningCash(
  cashRegister: { date: string }[],
  syncing: boolean,           // true = masih loading data dari server
  ready: boolean,             // true = app sudah siap
): boolean {
  const [needs, setNeeds] = useState(false);
  const checkedRef = useRef(false);  // cek hanya sekali per session
  const timerRef   = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Jangan cek sebelum app ready DAN data secondary sudah selesai di-load
    // Tunggu syncing = false (data dari server sudah datang) ATAU sudah pernah dicek
    if (!ready) return;

    // Kalau LS sudah tandai hari ini → tidak perlu tampil
    if (getLastOpeningDate() === getTodayStr()) {
      setNeeds(false);
      return;
    }

    const check = () => {
      // Kalau data sudah ada di DB untuk hari ini → tidak perlu
      if (wasOpenedToday(cashRegister)) {
        setLastOpeningDate(); // sinkronkan LS
        setNeeds(false);
        return;
      }
      // Data belum ada → perlu tampil
      setNeeds(true);
    };

    if (!syncing) {
      // Data sudah selesai load dari server → cek sekarang
      if (!checkedRef.current) {
        checkedRef.current = true;
        check();
      }
    } else {
      // Masih syncing → tunggu max 3 detik, lalu cek pakai data yang ada
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        checkedRef.current = true;
        check();
      }, 3000);
    }

    return () => clearTimeout(timerRef.current);
  }, [ready, syncing, cashRegister.length]);  

  // Reset otomatis jam 00:00
  useEffect(() => {
    const now = new Date();
    const msToMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5).getTime() - now.getTime();
    const t = setTimeout(() => {
      try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
      checkedRef.current = false;
      setNeeds(true);
    }, msToMidnight);
    return () => clearTimeout(t);
  }, [],   );

  return needs;
}

// ── Komponen Dialog ───────────────────────────────────────────────
interface Props {
  cashierName: string;
  toast:       { showToast: (m: string, t?: ToastType) => void };
  onDone:      () => void;
}

const QUICK = [50_000, 100_000, 200_000, 300_000, 500_000, 1_000_000];

export default function DailyOpeningModal({ cashierName, toast, onDone }: Props) {
  const { saveCashRegister, isOnline } = useStore();
  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  const numVal = parseInt(amount.replace(/\D/g, '')) || 0;

  const handleSave = async () => {
    if (numVal <= 0) { toast.showToast('Masukkan jumlah saldo awal', 'warning'); return; }
    setSaving(true);

    if (!isOnline) {
      // ── OFFLINE: simpan ke antrian localStorage ──────────────
      try {
        const queue = JSON.parse(localStorage.getItem(LS_OFFLINE_KEY) || '[]');
        queue.push({
          amount: numVal,
          note: note.trim() || 'Saldo awal buka toko',
          opened_by: cashierName,
          date: new Date().toISOString(),
        });
        localStorage.setItem(LS_OFFLINE_KEY, JSON.stringify(queue));
      } catch { /* ignore */ }
      setLastOpeningDate();
      toast.showToast(`💾 Saldo ${fRp(numVal)} disimpan (offline, sync otomatis)`, 'success');
      setSaving(false);
      onDone();
      return;
    }

    try {
      await saveCashRegister({
        amount:     numVal,
        note:       note.trim() || 'Saldo awal buka toko',
        opened_by:  cashierName,
      });
      setLastOpeningDate();
      toast.showToast(`✅ Saldo awal ${fRp(numVal)} tercatat!`, 'success');
      onDone();
    } catch (e:any) {
      // Rollback LS jika gagal
      try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
      toast.showToast('⚠ Gagal simpan: ' + (e?.message || ''), 'warning');
    }
    setSaving(false);
  };

  const handleSkip = () => {
    setLastOpeningDate(); // jangan tanya lagi hari ini
    onDone();
  };

  const { panelRef, onBackdropClick, dialogProps } = useModalBehavior<HTMLDivElement>({
    open: true,
    onClose: handleSkip,
    disabled: saving,
  });

  return (
    <div className="kaffe-modal-overlay fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center" onClick={onBackdropClick}>
      <div
        ref={panelRef}
        className="kaffe-modal-panel bg-white w-full max-w-md overflow-y-auto rounded-t-[28px] shadow-2xl sm:rounded-[28px]"
        aria-labelledby="daily-opening-title"
        {...dialogProps}
        style={{ animation: 'slideUp 0.3s ease-out' }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

        {/* Header gradient */}
        <div className="bg-slate-900 px-6 pt-7 pb-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <Coffee size={80} strokeWidth={1} className="text-white" />
          </div>
          <div className="flex items-center gap-4 mb-3 relative z-10">
            <div className="w-12 h-12 bg-[#FF6A00]/20 rounded-2xl flex items-center justify-center border border-[#FF6A00]/30">
              <Coffee size={24} className="text-[#FF6A00]" />
            </div>
            <div>
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mb-1">Selamat Datang</p>
              <h3 id="daily-opening-title" className="font-display text-white font-extrabold text-xl leading-tight">Buka Toko Hari Ini</h3>
            </div>
            {!isOnline && (
              <div className="ml-auto flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/30 rounded-full px-2.5 py-1">
                <WifiOff size={12} className="text-rose-400" />
                <span className="text-rose-400 text-[10px] font-bold uppercase tracking-wider">Offline</span>
              </div>
            )}
          </div>
          <p className="text-slate-400 text-sm font-medium relative z-10">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 pt-5 pb-8 space-y-4" style={{ marginTop: -20 }}>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-premium p-5 space-y-4 relative z-20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-[#FF6A00]/10 flex items-center justify-center text-[#FF6A00]">
                <Wallet size={16} />
              </div>
              <p className="font-bold text-slate-800 text-[14px]">Saldo Awal Kasir</p>
            </div>

            {/* Input */}
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">Rp</span>
              <input
                type="number" inputMode="numeric"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
                className="w-full border-2 border-slate-50 bg-slate-50/50 rounded-2xl pl-12 pr-5 py-4 text-3xl font-extrabold text-slate-800 focus:outline-none focus:border-[#FF6A00]/30 focus:bg-white focus:ring-4 focus:ring-[#FF6A00]/5 text-right transition-all"
              />
            </div>
            {numVal > 0 && <p className="text-center text-[#FF6A00] font-extrabold text-sm">{fRp(numVal)}</p>}

            {/* Quick amounts */}
            <div className="grid grid-cols-3 gap-2">
              {QUICK.map(q => (
                <button type="button" key={q} onClick={() => setAmount(String(q))}
                  className={`py-3 rounded-xl text-[12px] font-bold border-2 transition-all active:scale-95
                    ${numVal === q ? 'border-[#FF6A00]/50 bg-[#FF6A00]/5 text-[#FF6A00]' : 'border-slate-50 bg-slate-50/50 text-slate-600 hover:border-slate-100 hover:bg-slate-50'}`}>
                  {fRp(q).replace('Rp', '').trim()}
                </button>
              ))}
            </div>

            {/* Catatan */}
            <input
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="Catatan (opsional)"
              className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:border-[#FF6A00]/30 focus:bg-white transition-all"
            />
          </div>

          {/* Tombol Simpan */}
          <button type="button" onClick={handleSave} disabled={saving || numVal <= 0}
            className="w-full py-5 bg-[#FF6A00] text-white font-bold text-[16px] rounded-2xl flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 transition-all shadow-premium hover:-translate-y-0.5">
            {saving
              ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><span>{isOnline ? 'Mulai Jualan Sekarang' : 'Simpan Saldo (Offline)'}</span><ChevronRight size={18} strokeWidth={3} /></>
            }
          </button>

          <button type="button" onClick={handleSkip}
            className="w-full py-2 text-slate-400 text-[13px] font-bold hover:text-slate-600 transition-colors uppercase tracking-widest">
            Lewati Saldo Awal
          </button>
        </div>
      </div>
    </div>
  );
}
