interface CashRegisterEntry { id: string; date: string; amount: number; note?: string|null; opened_by: string; }
interface ExpenseEntry      { id: string; date: string; amount: number; description: string; category: string; cashier?: string; source?: string; }
interface TransactionEntry  { id: string; date: string; total: number; is_void?: boolean; }

function getExpenseSource(expense: { source?: string; category?: string }) {
  return expense.source || (expense.category === 'Bahan Baku' ? 'inventory' : 'cashier');
}

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

export function buildKasPDFData(
  cashRegister: CashRegisterEntry[],
  expenses:     ExpenseEntry[],
  transactions: TransactionEntry[],
  period:       string
) {
  return groupByDay(cashRegister, expenses, transactions, period);
}
