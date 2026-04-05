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

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-end sm:items-center justify-center backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        style={{ animation: 'slideUp 0.3s ease-out' }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

        {/* Header gradient */}
        <div className="bg-gradient-to-br from-orange-500 to-amber-500 px-5 pt-6 pb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <Coffee size={24} className="text-white" />
            </div>
            <div>
              <p className="text-white/80 text-xs font-bold">Selamat Datang ☀️</p>
              <h3 className="text-white font-black text-lg leading-tight">Buka Toko Hari Ini</h3>
            </div>
            {!isOnline && (
              <div className="ml-auto flex items-center gap-1 bg-white/20 rounded-full px-2 py-1">
                <WifiOff size={11} className="text-white" />
                <span className="text-white text-[10px] font-bold">Offline</span>
              </div>
            )}
          </div>
          <p className="text-white/80 text-sm">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Body */}
        <div className="px-5 pt-4 pb-6 space-y-3" style={{ marginTop: -16 }}>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Wallet size={15} className="text-orange-500" />
              <p className="font-black text-slate-800 text-sm">Saldo Awal Kasir</p>
              <span className="ml-auto text-[10px] bg-orange-100 text-orange-600 font-bold px-2 py-0.5 rounded-full">
                Hari ini
              </span>
            </div>

            {/* Input */}
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">Rp</span>
              <input
                type="number" inputMode="numeric"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                autoFocus
                className="w-full border-2 border-slate-200 rounded-2xl pl-10 pr-4 py-3.5 text-2xl font-black text-slate-800 focus:outline-none focus:border-orange-400 text-right"
              />
            </div>
            {numVal > 0 && <p className="text-center text-orange-500 font-bold text-sm -mt-1">{fRp(numVal)}</p>}

            {/* Quick amounts */}
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK.map(q => (
                <button key={q} onClick={() => setAmount(String(q))}
                  className={`py-2 rounded-xl text-xs font-black border-2 transition-all active:scale-95
                    ${numVal === q ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
                  {fRp(q)}
                </button>
              ))}
            </div>

            {/* Catatan */}
            <input
              value={note} onChange={e => setNote(e.target.value)}
              placeholder="Catatan (opsional)"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-300"
            />
          </div>

          {/* Tombol Simpan */}
          <button onClick={handleSave} disabled={saving || numVal <= 0}
            className="w-full py-4 bg-orange-500 text-white font-black text-base rounded-2xl flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-orange-200">
            {saving
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><span>{isOnline ? 'Mulai Jualan' : 'Simpan (Offline)'}</span><ChevronRight size={18} /></>
            }
          </button>

          <button onClick={handleSkip}
            className="w-full py-2 text-slate-400 text-sm font-bold active:text-slate-600 transition-colors">
            Lewati (tanpa saldo awal)
          </button>
        </div>
      </div>
    </div>
  );
}
