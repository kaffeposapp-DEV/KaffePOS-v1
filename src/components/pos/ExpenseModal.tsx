 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/pos/ExpenseModal.tsx
// Catat pengeluaran operasional mendadak — sumber: saldo kasir awal hari ini
import { useState, useMemo } from 'react';
import { X, Receipt, Wallet, AlertCircle } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import { useModalBehavior } from '@/hooks/useModalBehavior';

const fRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

const CATEGORIES = ['Operasional', 'Gaji', 'Utilitas', 'Peralatan', 'Lain-lain'];

const QUICK_AMOUNTS = [5_000, 10_000, 20_000, 50_000, 100_000, 200_000];

interface Props {
  onClose: () => void;
  cashierName: string;
  toast: { showToast: (m: string, t?:any) => void };
}

function getExpenseSource(expense: { source?: string; category?: string }) {
  return expense.source || (expense.category === 'Bahan Baku' ? 'inventory' : 'cashier');
}

export default function ExpenseModal({ onClose, cashierName, toast }: Props) {
  const { saveExpense, expenses, cashRegister } = useStore();
  const [amount, setAmount]       = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory]   = useState('Operasional');
  const [saving, setSaving]       = useState(false);

  const numVal = parseInt(amount.replace(/\D/g, '')) || 0;

  // Saldo kasir awal hari ini
  const todayStr = new Date().toDateString();
  const todayCash = useMemo(() =>
    cashRegister.find(c => new Date(c.date).toDateString() === todayStr),
    [cashRegister, todayStr]
  );

  // Pengeluaran hari ini
  const todayExpenses = useMemo(() =>
    expenses.filter(e =>
      new Date(e.date).toDateString() === todayStr &&
      getExpenseSource(e) === 'cashier'
    ),
    [expenses, todayStr]
  );
  const todayTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);

  // Saldo kasir sisa (saldo awal - pengeluaran hari ini)
  const kasirAwal = todayCash?.amount || 0;
  const kasirSisa = kasirAwal - todayTotal;
  const isOverBudget = numVal > 0 && numVal > kasirSisa && kasirAwal > 0;
  const { panelRef, onBackdropClick, dialogProps } = useModalBehavior<HTMLDivElement>({
    open: true,
    onClose,
    disabled: saving,
  });

  const handleSave = () => {
    if (numVal <= 0) { toast.showToast('Masukkan jumlah pengeluaran', 'warning'); return; }
    if (!description.trim()) { toast.showToast('Masukkan keterangan pengeluaran', 'warning'); return; }

    setSaving(true);
    saveExpense({ amount: numVal, description: description.trim(), category, cashier: cashierName })
      .then(() => {
        toast.showToast(`💸 ${fRp(numVal)} dicatat sebagai pengeluaran`, 'success');
        onClose();
      })
      .catch((e:any) => toast.showToast('⚠ Gagal simpan: ' + (e?.message || ''), 'warning'))
      .finally(() => setSaving(false));
  };

  return (
    <div className="kaffe-modal-overlay fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center" onClick={onBackdropClick}>
      <div
        ref={panelRef}
        className="kaffe-modal-panel bg-white w-full max-w-md overflow-y-auto rounded-t-[28px] sm:rounded-[28px]"
        aria-labelledby="expense-modal-title"
        {...dialogProps}
        style={{ animation: 'slideUp 0.25s ease-out' }}>

        {/* Header */}
        <div className="bg-gradient-to-br from-red-500 to-rose-600 px-5 pt-5 pb-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                <Receipt size={20} className="text-white" />
              </div>
              <div>
                <p className="text-white/80 text-xs font-bold">Pengeluaran Operasional</p>
                <h3 id="expense-modal-title" className="text-white font-black text-base leading-tight">Catat Pengeluaran Kasir</h3>
              </div>
            </div>
            <button type="button" onClick={onClose}
              className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center active:scale-90">
              <X size={18} className="text-white" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4" style={{ marginTop: -8 }}>

          {/* Info saldo kasir */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={14} className="text-orange-500" />
              <p className="text-xs font-black text-slate-500">SUMBER DANA KASIR HARI INI</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-orange-50 rounded-xl p-2.5">
                <p className="text-[10px] text-orange-400 font-bold mb-1">Saldo Awal</p>
                <p className={`font-black text-sm ${kasirAwal > 0 ? 'text-orange-600' : 'text-slate-300'}`}>
                  {kasirAwal > 0 ? fRp(kasirAwal) : '—'}
                </p>
              </div>
              <div className="bg-red-50 rounded-xl p-2.5">
                <p className="text-[10px] text-red-400 font-bold mb-1">Dipakai</p>
                <p className={`font-black text-sm ${todayTotal > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                  {todayTotal > 0 ? fRp(todayTotal) : '—'}
                </p>
              </div>
              <div className={`rounded-xl p-2.5 ${kasirSisa < 0 ? 'bg-red-100' : 'bg-green-50'}`}>
                <p className={`text-[10px] font-bold mb-1 ${kasirSisa < 0 ? 'text-red-500' : 'text-green-500'}`}>Sisa</p>
                <p className={`font-black text-sm ${kasirAwal > 0 ? (kasirSisa < 0 ? 'text-red-600' : 'text-green-600') : 'text-slate-300'}`}>
                  {kasirAwal > 0 ? fRp(Math.max(0, kasirSisa)) : '—'}
                </p>
              </div>
            </div>
            {!todayCash && (
              <p className="text-[10px] text-slate-400 mt-2 text-center">
                💡 Belum ada saldo awal hari ini — pengeluaran tetap bisa dicatat
              </p>
            )}
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              Restock bahan baku dari nav Gudang tidak dihitung ke saldo kasir.
            </p>
          </div>

          {/* Riwayat singkat hari ini */}
          {todayExpenses.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-3">
              <p className="text-xs text-red-600 font-black mb-2">📋 Pengeluaran Hari Ini</p>
              <div className="space-y-1">
                {todayExpenses.slice(0, 4).map((e, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <p className="text-xs text-red-500 truncate flex-1 mr-2">• {e.description}</p>
                    <p className="text-xs text-red-600 font-bold shrink-0">{fRp(e.amount)}</p>
                  </div>
                ))}
                {todayExpenses.length > 4 && (
                  <p className="text-xs text-red-400 text-center">+{todayExpenses.length - 4} lainnya</p>
                )}
              </div>
              <div className="border-t border-red-200 mt-2 pt-2 flex justify-between">
                <p className="text-xs text-red-600 font-black">Total</p>
                <p className="text-xs text-red-700 font-black">{fRp(todayTotal)}</p>
              </div>
            </div>
          )}

          {/* Form input */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
            {/* Keterangan */}
            <div>
              <label className="text-xs font-black text-slate-500 mb-1.5 block">KETERANGAN *</label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="cth: beli gas, es batu, plastik..."
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400 transition-colors"
                style={{ fontSize: 16 }}
                autoFocus
              />
            </div>

            {/* Kategori */}
            <div>
              <label className="text-xs font-black text-slate-500 mb-1.5 block">KATEGORI</label>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map(cat => (
                  <button type="button" key={cat} onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                      category === cat
                        ? 'bg-red-500 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Jumlah */}
            <div>
              <label className="text-xs font-black text-slate-500 mb-1.5 block">JUMLAH *</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Rp</span>
                <input
                  type="number" inputMode="numeric"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  className={`w-full border-2 rounded-2xl pl-10 pr-4 py-3.5 text-2xl font-black text-right focus:outline-none transition-colors ${
                    isOverBudget
                      ? 'border-red-400 bg-red-50 text-red-600'
                      : 'border-slate-200 text-slate-800 focus:border-red-400'
                  }`}
                />
              </div>
              {numVal > 0 && (
                <p className={`text-center font-bold text-sm mt-1 ${isOverBudget ? 'text-red-500' : 'text-slate-500'}`}>
                  {fRp(numVal)}
                </p>
              )}

              {/* Quick amounts */}
              <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                {QUICK_AMOUNTS.map(q => (
                  <button type="button" key={q} onClick={() => setAmount(String(q))}
                    className={`py-2 rounded-xl text-xs font-black border-2 transition-all active:scale-95 ${
                      numVal === q
                        ? 'border-red-400 bg-red-50 text-red-600'
                        : 'border-slate-100 bg-slate-50 text-slate-600'
                    }`}>
                    {fRp(q)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Warning jika melebihi saldo */}
          {isOverBudget && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-amber-700 text-xs font-medium">
                Jumlah melebihi sisa saldo kasir ({fRp(kasirSisa)}). Tetap bisa dicatat.
              </p>
            </div>
          )}

          {/* Tombol simpan */}
          <button type="button" onClick={handleSave} disabled={saving || numVal <= 0 || !description.trim()}
            className="w-full py-4 bg-orange-500 text-white font-black rounded-2xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm text-base">
            {saving
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <div className="flex items-center gap-2"><div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center"><div className="w-2 h-2 bg-white rounded-full" /></div>Simpan Pengeluaran</div>}
          </button>

          <div style={{ height: 'env(safe-area-inset-bottom, 16px)' }} />
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
