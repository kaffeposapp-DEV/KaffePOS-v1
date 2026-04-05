 
 
 
/* eslint-disable react-refresh/only-export-components */
 
 
// src/components/report/KasDailyPanel.tsx
// Panel Kas Harian: Saldo Kasir Awal → Pengeluaran → Selisih
// Menampilkan detail akuntansi per hari dengan status sumber dana

import { useMemo, useState } from 'react';
import { Wallet, Scale, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

const fRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

interface CashRegisterEntry { id: string; date: string; amount: number; note?: string|null; opened_by: string; }
interface ExpenseEntry      { id: string; date: string; amount: number; description: string; category: string; cashier?: string; }
interface TransactionEntry  { id: string; date: string; total: number; is_void?: boolean; }

interface Props {
  cashRegister:  CashRegisterEntry[];
  expenses:      ExpenseEntry[];
  transactions:  TransactionEntry[];
  period:        string;
}

function getExpenseSource(expense: { source?: string; category?: string }) {
  return expense.source || (expense.category === 'Bahan Baku' ? 'inventory' : 'cashier');
}

/** Kelompokkan transaksi+expense+kasir per hari */
function groupByDay(cashRegister: CashRegisterEntry[], expenses: ExpenseEntry[], transactions: TransactionEntry[], period: string) {
  const now = new Date();

  function inPeriod(dateStr: string) {
    const d = new Date(dateStr);
    if (period === 'harian')   return d.toDateString() === now.toDateString();
    if (period === 'mingguan') { const w = new Date(now); w.setDate(w.getDate() - 7); return d >= w; }
    if (period === 'bulanan')  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return true;
  }

  const dayMap = new Map<string, {
    dateStr: string;
    label:   string;
    opens:   CashRegisterEntry[];
    exps:    ExpenseEntry[];
    revenue: number;
  }>();

  // Kumpulkan semua tanggal relevan
  const allDates = new Set<string>();
  cashRegister.filter(c => inPeriod(c.date)).forEach(c => allDates.add(new Date(c.date).toDateString()));
  expenses
    .filter(e => inPeriod(e.date) && getExpenseSource(e) === 'cashier')
    .forEach(e => allDates.add(new Date(e.date).toDateString()));

  allDates.forEach(ds => {
    const d = new Date(ds);
    const label = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
    dayMap.set(ds, { dateStr: ds, label, opens: [], exps: [], revenue: 0 });
  });

  cashRegister.filter(c => inPeriod(c.date)).forEach(c => {
    const ds = new Date(c.date).toDateString();
    if (dayMap.has(ds)) dayMap.get(ds)!.opens.push(c);
  });

  expenses.filter(e => inPeriod(e.date) && getExpenseSource(e) === 'cashier').forEach(e => {
    const ds = new Date(e.date).toDateString();
    if (dayMap.has(ds)) dayMap.get(ds)!.exps.push(e);
  });

  transactions.filter(t => !t.is_void && inPeriod(t.date)).forEach(t => {
    const ds = new Date(t.date).toDateString();
    if (dayMap.has(ds)) dayMap.get(ds)!.revenue += t.total;
  });

  return Array.from(dayMap.values())
    .sort((a, b) => new Date(b.dateStr).getTime() - new Date(a.dateStr).getTime());
}

interface DayRowProps {
  day: ReturnType<typeof groupByDay>[0];
  defaultOpen?: boolean;
}

function DayRow({ day, defaultOpen = false }: DayRowProps) {
  const [open, setOpen] = useState(defaultOpen);

  const saldoAwal   = day.opens.reduce((s, c) => s + c.amount, 0);
  const totalExp    = day.exps.reduce((s, e) => s + e.amount, 0);
  const selisih     = saldoAwal - totalExp;       // sisa saldo kasir setelah pengeluaran
  const fromSales   = selisih < 0 ? Math.abs(selisih) : 0;  // porsi ambil dari pendapatan
  const netKas      = saldoAwal + day.revenue - totalExp;    // posisi kas akhir hari

  // Status
  const status = totalExp === 0
    ? 'aman'
    : selisih >= 0
    ? 'aman'
    : 'ambil-penjualan';

  return (
    <div className="border border-slate-100 rounded-2xl overflow-hidden">
      {/* Header baris hari */}
      <button className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 active:bg-slate-100 transition-colors"
        onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status === 'aman' ? 'bg-green-400' : 'bg-orange-400'}`} />
          <div className="text-left">
            <p className="text-sm font-black text-slate-800">{day.label}</p>
            <p className="text-[10px] text-slate-400">
              {saldoAwal > 0 ? `Kasir: ${fRp(saldoAwal)}` : 'Tanpa saldo awal'} · {day.exps.length} pengeluaran
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className={`text-sm font-black ${selisih >= 0 ? 'text-green-600' : 'text-orange-500'}`}>
              {selisih >= 0 ? '+' : ''}{fRp(selisih)}
            </p>
            <p className="text-[10px] text-slate-400">selisih</p>
          </div>
          {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>

      {/* Detail expand */}
      {open && (
        <div className="px-4 pb-3 pt-2 space-y-3 bg-white">
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-2 mt-1">
            <div className="bg-orange-50 rounded-xl p-2">
              <p className="text-[9px] text-orange-500 font-bold">💰 Saldo Awal</p>
              <p className="text-xs font-black text-orange-700 mt-0.5">{fRp(saldoAwal)}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-2">
              <p className="text-[9px] text-red-500 font-bold">💸 Pengeluaran</p>
              <p className="text-xs font-black text-red-700 mt-0.5">-{fRp(totalExp)}</p>
            </div>
            <div className={`rounded-xl p-2 ${selisih >= 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
              <p className={`text-[9px] font-bold ${selisih >= 0 ? 'text-green-500' : 'text-amber-500'}`}>
                {selisih >= 0 ? '✅ Sisa Kasir' : '⚠ Defisit'}
              </p>
              <p className={`text-xs font-black mt-0.5 ${selisih >= 0 ? 'text-green-700' : 'text-amber-700'}`}>
                {fRp(Math.abs(selisih))}
              </p>
            </div>
          </div>

          {/* Ambil dari penjualan notice */}
          {fromSales > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-black text-amber-700">Diambil dari saldo penjualan</p>
                <p className="text-[10px] text-amber-600">
                  Saldo kasir tidak cukup — {fRp(fromSales)} diambil dari pendapatan hari ini ({fRp(day.revenue)})
                </p>
              </div>
            </div>
          )}

          {/* Kas awal detail */}
          {day.opens.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-400 font-bold mb-1">SALDO KASIR AWAL</p>
              {day.opens.map((c, i) => (
                <div key={i} className="flex justify-between py-1">
                  <div>
                    <p className="text-xs text-slate-700">{c.opened_by}</p>
                    {c.note && <p className="text-[10px] text-slate-400">{c.note}</p>}
                  </div>
                  <p className="text-xs font-black text-orange-500">{fRp(c.amount)}</p>
                </div>
              ))}
            </div>
          )}

          {/* Pengeluaran detail */}
          {day.exps.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-400 font-bold mb-1">DETAIL PENGELUARAN</p>
              <div className="space-y-1">
                {day.exps.map((e, i) => (
                  <div key={i} className="flex justify-between items-start py-1 border-b border-slate-50 last:border-0">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="text-xs font-bold text-slate-700 truncate">{e.description}</p>
                      <p className="text-[10px] text-slate-400">
                        {e.category} · {new Date(e.date).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        {e.cashier ? ` · ${e.cashier}` : ''}
                        {e.amount > saldoAwal && saldoAwal > 0
                          ? <span className="text-amber-500 ml-1">· dari penjualan</span>
                          : ''}
                      </p>
                    </div>
                    <p className="text-xs font-black text-red-500 flex-shrink-0">-{fRp(e.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Posisi kas akhir hari */}
          <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-slate-500 font-bold">KAS AKHIR HARI</p>
              <p className="text-[10px] text-slate-400">Saldo + Penjualan - Pengeluaran</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-black ${netKas >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {fRp(netKas)}
              </p>
              <p className="text-[10px] text-slate-400">{`${fRp(saldoAwal)} + ${fRp(day.revenue)} - ${fRp(totalExp)}`}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function KasDailyPanel({ cashRegister, expenses, transactions, period }: Props) {
  const days = useMemo(
    () => groupByDay(cashRegister, expenses, transactions, period),
    [cashRegister, expenses, transactions, period]
  );

  const totalSaldoAwal = days.reduce((s, d) => s + d.opens.reduce((a, c) => a + c.amount, 0), 0);
  const totalExp       = days.reduce((s, d) => s + d.exps.reduce((a, e) => a + e.amount, 0), 0);
  const totalSelisih   = totalSaldoAwal - totalExp;
  const totalFromSales = totalSelisih < 0 ? Math.abs(totalSelisih) : 0;

  if (days.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
        <Wallet size={24} className="text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-400">Belum ada data kas untuk periode ini</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary card */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 text-white">
        <div className="flex items-center gap-2 mb-3">
          <Scale size={16} className="text-orange-400" />
          <p className="font-black text-sm">Ringkasan Kas Operasional</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-white/60 text-[10px] font-bold">💰 Total Saldo Awal</p>
            <p className="text-orange-400 font-black text-base">{fRp(totalSaldoAwal)}</p>
          </div>
          <div>
            <p className="text-white/60 text-[10px] font-bold">💸 Total Pengeluaran</p>
            <p className="text-red-400 font-black text-base">-{fRp(totalExp)}</p>
          </div>
          <div>
            <p className="text-white/60 text-[10px] font-bold">{totalSelisih >= 0 ? '✅ Sisa Saldo Kasir' : '⚠ Total Defisit'}</p>
            <p className={`font-black text-base ${totalSelisih >= 0 ? 'text-green-400' : 'text-amber-400'}`}>
              {fRp(Math.abs(totalSelisih))}
            </p>
          </div>
          <div>
            <p className="text-white/60 text-[10px] font-bold">🔄 Dari Penjualan</p>
            <p className="text-blue-400 font-black text-base">{fRp(totalFromSales)}</p>
          </div>
        </div>
        {totalFromSales > 0 && (
          <div className="mt-3 bg-amber-500/20 rounded-xl p-2 flex items-center gap-2">
            <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
            <p className="text-amber-300 text-[10px]">
              {fRp(totalFromSales)} pengeluaran diambil dari saldo penjualan karena saldo kasir tidak mencukupi
            </p>
          </div>
        )}
      </div>

      {/* Detail per hari */}
      <div className="space-y-2">
        {days.map((day, i) => (
          <DayRow key={day.dateStr} day={day} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}

// ── Export helper untuk PDF ───────────────────────────────────────
export function buildKasPDFData(
  cashRegister: CashRegisterEntry[],
  expenses:     ExpenseEntry[],
  transactions: TransactionEntry[],
  period:       string
) {
  return groupByDay(cashRegister, expenses, transactions, period);
}
