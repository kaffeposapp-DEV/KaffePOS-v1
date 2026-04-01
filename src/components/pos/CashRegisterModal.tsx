// src/components/pos/CashRegisterModal.tsx
import React, { useState } from 'react';
import { X, Wallet } from 'lucide-react';
import { useStore } from '@/hooks/useStore';

const fRp = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

interface Props {
  onClose: () => void;
  cashierName: string;
  toast: { showToast: (m: string, t?: any) => void };
}

export default function CashRegisterModal({ onClose, cashierName, toast }: Props) {
  const { saveCashRegister, cashRegister } = useStore();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const todayTotal = cashRegister
    .filter(c => new Date(c.date).toDateString() === new Date().toDateString())
    .reduce((s, c) => s + c.amount, 0);

  const handleSave = () => {
    const amt = parseInt(amount.replace(/\D/g, '')) || 0;
    if (amt <= 0) { toast.showToast('Masukkan jumlah saldo', 'warning'); return; }
    toast.showToast('Saldo kasir disimpan!', 'success');
    onClose();
    saveCashRegister({ amount: amt, note: note.trim() || undefined, opened_by: cashierName })
      .catch((e: any) => toast.showToast('⚠ Gagal simpan: ' + (e?.message || ''), 'warning'));
  };

  const quickAmounts = [50000, 100000, 200000, 500000];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
              <Wallet size={18} className="text-orange-500" />
            </div>
            <div>
              <h3 className="font-black text-slate-800">Saldo Awal Kasir</h3>
              <p className="text-xs text-slate-400">Uang tunai saat buka kasir</p>
            </div>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>

        {todayTotal > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 mb-4">
            <p className="text-xs text-orange-600 font-bold">Saldo hari ini sudah diisi</p>
            <p className="text-orange-700 font-black text-lg">{fRp(todayTotal)}</p>
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs font-bold text-slate-500 mb-2 block">Jumlah Saldo Awal</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            className="w-full border-2 border-slate-200 rounded-2xl px-4 py-3 text-2xl font-black focus:outline-none focus:border-orange-400 text-center"
            style={{ fontSize: 24 }}
            autoFocus
          />
          {amount && <p className="text-center text-orange-500 font-bold mt-1 text-sm">{fRp(parseInt(amount) || 0)}</p>}
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {quickAmounts.map(amt => (
            <button key={amt} onClick={() => setAmount(String(amt))}
              className="px-3 py-1.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-600 active:scale-95">
              {fRp(amt)}
            </button>
          ))}
        </div>

        <div className="mb-5">
          <label className="text-xs font-bold text-slate-500 mb-1 block">Catatan (opsional)</label>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="cth: modal buka toko pagi"
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
            style={{ fontSize: 16 }}
          />
        </div>

        <button onClick={handleSave}
          className="w-full py-4 bg-orange-500 text-white font-black text-base rounded-2xl active:scale-95 flex items-center justify-center gap-2">
          Simpan Saldo Kasir
        </button>
      </div>
    </div>
  );
}
