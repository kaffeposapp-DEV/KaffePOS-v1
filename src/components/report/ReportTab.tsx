




/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/report/ReportTab.tsx — v5 + Gemini AI Insight
import { useState, useMemo, useCallback } from 'react';
import { Download, TrendingUp, ShoppingBag, DollarSign, CreditCard, Wallet, Receipt, Sparkles, RefreshCw, ChevronDown, ChevronUp, Scale, Mail } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import { useAuth } from '@/contexts/AuthContext';
import { generateProfessionalPDF, type ReportData } from '@/utils/pdfReport';
import { getAIInsightCached, type InsightContext, type AIInsight } from '@/lib/aiInsight';
import KasDailyPanel from './KasDailyPanel';
import ExpenseModal from '@/components/pos/ExpenseModal';
import CashRegisterModal from '@/components/pos/CashRegisterModal';
import UpgradePrompt from '@/components/UpgradePrompt';
import type { SubscriptionAccess } from '@/lib/subscriptionAccess';


const fRp  = (n: number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n||0);
const fNum = (n: number) => new Intl.NumberFormat('id-ID').format(n||0);
type Period = 'harian'|'mingguan'|'bulanan'|'semua';
const COLORS = ['#FF6A00','#3b82f6','#10b981','#8b5cf6','#ef4444','#ec4899','#f59e0b','#06b6d4'];
const getExpenseSource = (expense: { source?: string; category?: string }) =>
  expense.source || (expense.category === 'Bahan Baku' ? 'inventory' : 'cashier');

function LineChart({ data, color='#f97316' }: { data:{label:string;value:number}[]; color?:string }) {
  if (data.length<2) return <div className="h-20 flex items-center justify-center text-slate-300 text-xs">Butuh lebih banyak data</div>;
  const max=Math.max(...data.map(d=>d.value),1);
  const W=280,H=68,P=8;
  const pts=data.map((d,i)=>({x:P+(i/(data.length-1))*(W-P*2),y:H-P-(d.value/max)*(H-P*2)}));
  const path=pts.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ');
  const area=`${path} L ${pts[pts.length-1].x} ${H} L ${pts[0].x} ${H} Z`;
  const gid = `lg${color.replace('#','')}`;
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
        <path d={area} fill={`url(#${gid})`}/><path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3" fill={color} stroke="white" strokeWidth="1.5"/>)}
      </svg>
      <div className="flex justify-between mt-1">{data.map((d,i)=><span key={i} className="text-[9px] text-slate-400">{d.label}</span>)}</div>
    </div>
  );
}

function BarChart({ data, color='#f97316' }: { data:{label:string;value:number}[]; color?:string }) {
  const max=Math.max(...data.map(d=>d.value),1);
  return (
    <div className="flex items-end gap-0.5 h-20">
      {data.map((d,i)=>(
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t" style={{height:`${Math.max((d.value/max)*72,d.value>0?3:0)}px`,backgroundColor:color}}/>
          <span className="text-[8px] text-slate-400 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data }: { data:{label:string;value:number;color:string}[] }) {
  const total=data.reduce((s,d)=>s+d.value,0);
  if (!total) return <div className="h-32 flex items-center justify-center text-slate-300 text-xs">Belum ada data</div>;
  const r=38,cx=50,cy=50,circ=2*Math.PI*r; let off=0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg width="110" height="110" viewBox="0 0 100 100" className="shrink-0">
        {data.map((d,i)=>{const pct=d.value/total,dash=pct*circ,gap=circ-dash,rot=off*360-90;off+=pct;return <circle key={i} r={r} cx={cx} cy={cy} fill="none" stroke={d.color} strokeWidth="20" strokeDasharray={`${dash} ${gap}`} transform={`rotate(${rot} ${cx} ${cy})`}/>;}) }
        <circle r="22" cx="50" cy="50" fill="white"/>
        <text x="50" y="47" textAnchor="middle" fontSize="8" fill="#94a3b8">Total</text>
        <text x="50" y="58" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#1e293b">{fNum(total)}</text>
      </svg>
      <div className="space-y-2 flex-1 min-w-0 w-full">
        {data.map((d,i)=>(
          <div key={i} className="flex items-center gap-2 min-w-0">
            <div className="w-3 h-3 rounded-full shrink-0" style={{backgroundColor:d.color}}/>
            <span className="text-xs text-slate-600 flex-1 truncate min-w-0">{d.label}</span>
            <div className="text-right shrink-0"><span className="text-xs font-black text-slate-800">{fNum(d.value)}</span><span className="text-[10px] text-slate-400 ml-1">{Math.round(d.value/total*100)}%</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HBar({ items, max }: { items:{label:string;value:number;sub?:string}[]; max:number; color?:string }) {
  return (
    <div className="space-y-3">
      {items.map((item,i)=>(
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0 flex-1"><span className="text-xs font-black text-orange-500 w-5 shrink-0">{i+1}</span><span className="text-xs font-bold text-slate-700 truncate">{item.label}</span></div>
            <div className="text-right shrink-0 ml-2"><span className="text-xs font-black text-slate-800">{fNum(item.value)}</span>{item.sub&&<span className="text-[10px] text-slate-400 ml-1">{item.sub}</span>}</div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2"><div className="h-2 rounded-full" style={{width:`${(item.value/max)*100}%`,backgroundColor:COLORS[i%COLORS.length]}}/></div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, icon, color='orange' }: { label:string; value:string; sub?:string; icon:React.ReactNode; color?:string }) {
  const cls: Record<string, string> = {
    orange:'bg-orange-50 text-[#FF6A00] border-orange-100',
    green:'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue:'bg-blue-50 text-blue-600 border-blue-100',
    red:'bg-rose-50 text-rose-600 border-rose-100'
  };
  return (
    <div className="bg-white rounded-[28px] border border-slate-100 p-5 shadow-soft hover:shadow-premium transition-all group">
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-4 border transition-transform group-hover:scale-110 ${cls[color] || cls.orange}`}>{icon}</div>
      <p className="font-black text-[18px] text-slate-800 leading-tight italic tracking-tighter">{value}</p>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{label}</p>
      {sub&&<p className="text-[10px] text-slate-500 font-bold mt-1.5 opacity-80">{sub}</p>}
    </div>
  );
}

export default function ReportTab({ toast, subscriptionAccess }: { toast:any; subscriptionAccess: SubscriptionAccess }) {
  const { transactions, expenses, inventory, storeSettings, cashRegister = [] } = useStore();
  const { user, profile } = useAuth();
  const [period, setPeriod]     = useState<Period>('harian');
  const [activeChart, setChart] = useState<'trend'|'menu'|'payment'|'stock'>('trend');
  const [downloading, setDl]    = useState(false);

  // ── AI Insight state ──────────────────────────────────────────
  const [aiData,    setAiData]    = useState<AIInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState('');
  const [aiOpen,    setAiOpen]    = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showCashRegisterModal, setShowCashRegisterModal] = useState(false);
  const canExportReports = subscriptionAccess.features.report_export;
  const canUseAdvancedPeriods = subscriptionAccess.features.report_advanced_periods;
  const canUseAiInsight = subscriptionAccess.features.ai_insight;

  const filtered = useMemo(()=>{
    const now=new Date();
    return transactions.filter((t:any)=>{
      if(t.is_void)return false;const d=new Date(t.date);
      if(period==='harian')return d.toDateString()===now.toDateString();
      if(period==='mingguan'){const w=new Date(now);w.setDate(w.getDate()-7);return d>=w;}
      if(period==='bulanan')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
      return true;
    });
  },[transactions,period]);

  const filteredExp = useMemo(()=>{
    const now=new Date();
    return expenses.filter((e:any)=>{
      const d=new Date(e.date);
      if(period==='harian')return d.toDateString()===now.toDateString();
      if(period==='mingguan'){const w=new Date(now);w.setDate(w.getDate()-7);return d>=w;}
      if(period==='bulanan')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
      return true;
    });
  },[expenses,period]);

  const totalRevenue  = filtered.reduce((s:number,t:any)=>s+t.total,0);
  const totalCogs     = filtered.reduce((s:number,t:any)=>s+(t.cogs||0),0);
  const totalExpenses = filteredExp.reduce((s:number,e:any)=>s+e.amount,0);
  const grossProfit   = totalRevenue-totalCogs;
  const netProfit     = grossProfit-totalExpenses;
  const avgTrx        = filtered.length>0?Math.round(totalRevenue/filtered.length):0;
  const grossMargin   = totalRevenue>0?Math.round((grossProfit/totalRevenue)*100):0;
  const totalStockVal = inventory.reduce((s:number,i:any)=>s+i.stock*i.cost_per_unit,0);
  const lowStockCount = inventory.filter((i:any)=>i.stock<=i.min_stock).length;

  const filteredCR = useMemo(()=>{
    const now=new Date();
    return (cashRegister||[]).filter((c:any)=>{
      const d=new Date(c.date);
      if(period==='harian') return d.toDateString()===now.toDateString();
      if(period==='mingguan'){const w=new Date(now);w.setDate(w.getDate()-7);return d>=w;}
      if(period==='bulanan') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
      return true;
    });
  },[cashRegister,period]);

  const filteredExpOps = useMemo(
    () => filteredExp.filter((e:any) => getExpenseSource(e) === 'cashier' && e.category !== 'Bahan Baku'),
    [filteredExp]
  );
  const totalCashRegister = filteredCR.reduce((s:number,c:any)=>s+c.amount,0);
  const totalExpOps       = filteredExpOps.reduce((s:number,e:any)=>s+e.amount,0);
  const todayCashRegisterEntry = useMemo(() => {
    const today = new Date().toDateString();
    return [...cashRegister]
      .filter((entry:any) => new Date(entry.date).toDateString() === today)
      .sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null;
  }, [cashRegister]);

  // ── Kalkulasi Kas Operasional ────────────────────────────────
  const kasSelisih     = totalCashRegister - totalExpOps;          // sisa saldo kasir
  // const kasFromSales   = kasSelisih < 0 ? Math.abs(kasSelisih) : 0; // porsi ambil dari penjualan
  // const kasNetAkhir    = totalCashRegister + totalRevenue - totalExpOps; // total posisi kas akhir

  const trendData = useMemo(()=>{
    const days=period==='harian'?8:period==='mingguan'?7:14;
    return Array.from({length:days},(_,i)=>{
      const d=new Date();d.setDate(d.getDate()-(days-1-i));
      const label=period==='bulanan'?`${d.getDate()}`:d.toLocaleDateString('id-ID',{weekday:'short'}).slice(0,3);
      const value=transactions.filter((t:any)=>!t.is_void&&new Date(t.date).toDateString()===d.toDateString()).reduce((s:number,t:any)=>s+t.total,0);
      return {label,value};
    });
  },[transactions,period]);

  const menuRanking = useMemo(()=>{
    const m:any={};
    filtered.forEach((t:any)=>t.items.forEach((item:any)=>{if(!m[item.name])m[item.name]={qty:0,rev:0};m[item.name].qty+=item.qty;m[item.name].rev+=item.subtotal;}));
    return Object.entries(m).map(([name,v]:any)=>({label:name,value:v.qty,sub:fRp(v.rev),rev:v.rev})).sort((a:any,b:any)=>b.value-a.value).slice(0,8);
  },[filtered]);

  const menuPieData = useMemo(()=>{
    if(!menuRanking.length)return [];
    const top6=menuRanking.slice(0,6);
    const others=menuRanking.slice(6).reduce((s:number,m:any)=>s+m.value,0);
    const result=top6.map((m:any,i:number)=>({label:m.label,value:m.value,color:COLORS[i]}));
    if(others>0)result.push({label:'Lainnya',value:others,color:'#94a3b8'});
    return result;
  },[menuRanking]);

  const paymentData = useMemo(()=>{
    const m:any={};
    filtered.forEach((t:any)=>{m[t.method]=(m[t.method]||0)+t.total;});
    return Object.entries(m).map(([label,value],i)=>({label,value:value as number,color:COLORS[i%COLORS.length]}));
  },[filtered]);

  const stockData = useMemo(()=>
    inventory.map((i:any)=>({label:i.name,stock:i.stock,unit:i.unit,min:i.min_stock,pct:i.min_stock>0?Math.round((i.stock/i.min_stock)*100):999}))
      .sort((a:any,b:any)=>a.pct-b.pct).slice(0,10)
  ,[inventory]);

  // ── AI Insight fetch ──────────────────────────────────────────
  const fetchAI = useCallback(async (force = false) => {
    if (!canUseAiInsight) {
      setAiOpen(false);
      toast.showToast('AI Insight tersedia mulai paket Signature.', 'info');
      return;
    }
    setAiLoading(true); setAiError('');
    if (force) setAiData(null);
    try {
      const topMenus = menuRanking.slice(0,5).map((m:any) => ({
        name:    m.label,
        qty:     m.value,
        revenue: m.rev || 0,
      }));
      const lowStockItems = inventory
        .filter((i:any) => i.stock <= i.min_stock)
        .slice(0,5)
        .map((i:any) => ({ name: i.name, stock: i.stock, unit: i.unit, min: i.min_stock }));
      const paymentMix = (['Tunai','Transfer','QRIS'] as const).map(m => ({
        method: m,
        pct:    filtered.length > 0
          ? Math.round(filtered.filter((t:any) => t.method === m).length / filtered.length * 100)
          : 0,
      }));

      const ctx: InsightContext = {
        period:       period === 'harian' ? 'Hari Ini' : period === 'mingguan' ? 'Minggu Ini' : period === 'bulanan' ? 'Bulan Ini' : 'Semua Waktu',
        storeName:    storeSettings?.store_name || 'Kafe Saya',
        totalRevenue, totalCogs, netProfit, grossMargin,
        txCount:      filtered.length,
        avgTrx,       topMenus, lowStockItems,
        totalExpenses,
        trendData:    trendData.slice(-7),
        paymentMix,
      };
      const result = await getAIInsightCached(ctx);
      setAiData(result);
      setAiOpen(true);
    } catch (e:any) {
      setAiError(e.message || 'Gagal mendapatkan insight AI');
    } finally { setAiLoading(false); }
  }, [avgTrx, canUseAiInsight, filtered, grossMargin, inventory, menuRanking, netProfit, period, storeSettings, toast, totalCogs, totalExpenses, totalRevenue, trendData]);

  const handleOpenLicense = useCallback(() => {
    window.dispatchEvent(new CustomEvent('kaffepos-open-tab', { detail: { tab: 'settings' } }));
  }, []);

  const buildReportPayload = useCallback((): ReportData => {
    const periodLabel = period === 'harian' ? 'Hari Ini' : period === 'mingguan' ? '7 Hari Terakhir' : period === 'bulanan' ? 'Bulan Ini' : 'Semua Waktu';
    const nowStr      = new Date().toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const payload: ReportData = {
      storeName:     storeSettings?.store_name || 'KaffePOS',
      tagline:       (storeSettings as any)?.tagline,
      address:       (storeSettings as any)?.address,
      phone:         (storeSettings as any)?.phone,
      logoData:      (storeSettings as any)?.logo_url || (storeSettings as any)?.logo_base64,
      period:        period,
      periodLabel,
      nowStr,

      totalRevenue,
      totalCogs,
      grossProfit,
      totalExpenses,
      netProfit,
      grossMargin,
      avgTrx,
      txCount:       filtered.length,

      trendData,
      menuRanking,
      paymentData,
      stockData,

      expensesByCategory: (() => {
        const m:any = {};
        filteredExp.forEach((e:any) => { m[e.category] = (m[e.category] || 0) + e.amount; });
        return Object.entries(m).map(([l, v]) => ({ label: l, value: v as number })).sort((a,b) => b.value - a.value);
      })(),
      expenseList: filteredExp,
      cashRegister: filteredCR,
      aiInsight: aiData?.summary ?? null,
    };

    if (aiData) {
      payload.aiTips = [
        aiData.bestMenu,
        aiData.stockAlert,
        aiData.prediction,
        ...(aiData.tips || []),
      ].filter(Boolean);
    }

    return payload;
  }, [
    period,
    storeSettings,
    totalRevenue,
    totalCogs,
    grossProfit,
    totalExpenses,
    netProfit,
    grossMargin,
    avgTrx,
    filtered.length,
    trendData,
    menuRanking,
    paymentData,
    stockData,
    filteredExp,
    filteredCR,
    aiData,
  ]);

  const handleDownload = async () => {
    if (!canExportReports) {
      toast.showToast('Export PDF tersedia mulai paket Kopi Susu.', 'info');
      return;
    }
    setDl(true);
    try {
      await generateProfessionalPDF(buildReportPayload());
      toast.showToast('Laporan PDF berhasil diunduh!', 'success');
    } catch (e:any) {
      toast.showToast(`Gagal membuat PDF: ${e?.message || 'Error'}`, 'error');
      console.error(e);
    } finally {
      setDl(false);
    }
  };

  const PERIODS=[{id:'harian',l:'Hari Ini', requiresAdvanced:false},{id:'mingguan',l:'7 Hari', requiresAdvanced:true},{id:'bulanan',l:'Bulan Ini', requiresAdvanced:true},{id:'semua',l:'Semua', requiresAdvanced:false}] as const;
  const hasAnyReportData = filtered.length > 0 || filteredExp.length > 0 || filteredCR.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white lg:bg-slate-50/50">
      <div className="bg-white border-b border-slate-100 px-6 pt-6 pb-4 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-black text-xl text-slate-800 italic uppercase tracking-tighter">Laporan & Analitik</h2>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Performa Bisnis Realtime</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCashRegisterModal(true)}
              title="Edit saldo kasir"
              className="flex items-center justify-center w-10 h-10 bg-white border border-slate-100 text-slate-400 rounded-2xl active:scale-95 transition-all hover:bg-orange-50 hover:text-[#FF6A00] shadow-sm"
            >
              <Wallet size={18} />
            </button>
            <button
              onClick={() => setShowExpenseModal(true)}
              title="Catat pengeluaran"
              className="flex items-center justify-center w-10 h-10 bg-white border border-slate-100 text-slate-400 rounded-2xl active:scale-95 transition-all hover:bg-orange-50 hover:text-[#FF6A00] shadow-sm"
            >
              <Receipt size={18} />
            </button>
            <button onClick={handleDownload} disabled={downloading}
              className={`flex items-center gap-2 h-10 px-5 rounded-2xl text-[12px] font-black uppercase italic tracking-widest active:scale-95 disabled:opacity-50 transition-all shadow-premium ${canExportReports ? 'bg-[#FF6A00] text-white' : 'bg-slate-100 text-slate-400'}`}>
              {downloading?<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>:<Download size={16}/>}
              {downloading?'Proses...':canExportReports?'Ekspor PDF':'Premium'}
            </button>
          </div>
        </div>
        <div className="flex gap-6 overflow-x-auto no-scrollbar -mx-6 px-6 border-b border-slate-50">
          {PERIODS.map((p) => {
            const locked = p.requiresAdvanced && !canUseAdvancedPeriods;
            const active = period === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (locked) {
                    toast.showToast('Laporan mingguan dan bulanan tersedia mulai paket Kopi Susu.', 'info');
                    return;
                  }
                  setPeriod(p.id as Period);
                }}
                className={`shrink-0 pb-3 text-[13px] font-black uppercase tracking-widest transition-all relative ${
                  active
                    ? 'text-[#FF6A00]'
                    : 'text-slate-400 hover:text-slate-600'
                } ${locked ? 'opacity-30' : ''}`}
              >
                {p.l}
                {active && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF6A00] rounded-full animate-in fade-in" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {!hasAnyReportData && (
          <div className="bg-white rounded-[32px] border border-dashed border-slate-200 p-10 text-center shadow-soft">
            <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center mx-auto mb-6 text-slate-200">
               <Receipt size={40} />
            </div>
            <p className="font-display text-lg font-extrabold text-slate-800 mb-2 uppercase tracking-tight italic">Belum ada data laporan</p>
            <p className="text-[13px] text-slate-400 max-w-md mx-auto font-medium leading-relaxed">
              Mulai transaksi, buka kas harian, atau catat pengeluaran agar laporan ini terisi otomatis secara realtime.
            </p>
          </div>
        )}
        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
          <StatCard label="Pendapatan" value={fRp(totalRevenue)} sub={`${filtered.length} transaksi`} icon={<DollarSign size={20}/>} color="orange"/>
          <StatCard label="Laba Bersih" value={fRp(netProfit)} sub={`Margin ${grossMargin}%`} icon={<TrendingUp size={20}/>} color={netProfit>=0?'green':'red'}/>

        {/* ── AI Insight Card ── */}
        <div className="col-span-2 md:col-span-4 lg:col-span-2 bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-2xl overflow-hidden">
          {/* Header tombol */}
          <button
            onClick={() => aiData ? setAiOpen(o => !o) : fetchAI()}
            disabled={aiLoading}
            className="w-full flex items-center justify-between px-4 py-3 active:bg-violet-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-violet-500 rounded-lg flex items-center justify-center">
                <Sparkles size={13} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-violet-900">AI Insight</p>
                <p className="text-[10px] text-violet-500">
                  {aiData
                    ? aiData.source === 'local'
                      ? 'Analisis pintar lokal'
                      : 'Dianalisis oleh Gemini'
                    : canUseAiInsight
                    ? 'Signature · analisis AI siap dipakai'
                    : 'Buka di paket Signature'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {aiData && (
                <button
                  onClick={e => { e.stopPropagation(); fetchAI(true); }}
                  className="p-1 text-violet-400 active:scale-90"
                  disabled={aiLoading}
                  title="Refresh analisis"
                >
                  <RefreshCw size={13} className={aiLoading ? 'animate-spin' : ''} />
                </button>
              )}
              {aiLoading
                ? <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                : aiData
                ? (aiOpen ? <ChevronUp size={15} className="text-violet-400" /> : <ChevronDown size={15} className="text-violet-400" />)
                : <span className="text-[11px] font-black text-violet-600 bg-violet-100 px-2.5 py-1 rounded-lg">{canUseAiInsight ? 'Analisis' : 'Locked'}</span>
              }
            </div>
          </button>

          {!canUseAiInsight && (
            <div className="px-4 pb-4">
              <UpgradePrompt
                recommendedPlan="signature"
                billingCycle="monthly"
                title="AI Insight ada di paket Signature"
                description="Upgrade saat kamu butuh analisis menu terlaris, prediksi stok, dan rekomendasi operasional yang lebih tajam."
                onAction={handleOpenLicense}
              />
            </div>
          )}

          {/* Error */}
          {aiError && (
            <div className="px-4 pb-3">
              <div className="bg-red-50 rounded-xl px-3 py-2.5 space-y-1">
                <p className="text-xs text-red-600 font-bold">⚠️ {aiError}</p>
                {aiError.includes('Kuota') || aiError.includes('quota') || aiError.includes('billing') ? (
                  <p className="text-[10px] text-red-400">
                    Layanan AI sedang tidak tersedia. Coba lagi beberapa saat lagi atau hubungi admin internal.
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {/* Hasil AI */}
          {aiData && aiOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-violet-100 pt-3">

              {/* Ringkasan */}
              <div>
                <p className="text-[10px] font-black text-violet-400 uppercase tracking-wider mb-1">📊 Ringkasan</p>
                <p className="text-xs text-slate-700 leading-relaxed">{aiData.summary}</p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {/* Menu terbaik */}
                <div className="bg-white rounded-xl p-3">
                  <p className="text-[10px] font-black text-orange-400 uppercase tracking-wider mb-1">🏆 Rekomendasi Menu</p>
                  <p className="text-xs text-slate-700">{aiData.bestMenu}</p>
                </div>

                {/* Stok alert */}
                <div className="bg-white rounded-xl p-3">
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-wider mb-1">📦 Status Stok</p>
                  <p className="text-xs text-slate-700">{aiData.stockAlert}</p>
                </div>

                {/* Prediksi */}
                <div className="bg-white rounded-xl p-3">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-wider mb-1">🔮 Prediksi</p>
                  <p className="text-xs text-slate-700">{aiData.prediction}</p>
                </div>
              </div>

              {/* Tips */}
              {aiData.tips?.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-green-500 uppercase tracking-wider mb-2">💡 Tips Aksi</p>
                  <div className="space-y-1.5">
                    {aiData.tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2 bg-white rounded-xl px-3 py-2">
                        <span className="text-[10px] font-black text-violet-400 mt-0.5">{i + 1}</span>
                        <p className="text-xs text-slate-700">{tip}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-violet-50/50 mt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    const to = user?.email || (profile as any)?.email || '';
                    const subject = encodeURIComponent(`Insight Bisnis KaffePOS - ${period}`);
                    const body = encodeURIComponent(
                      `Halo,\nBerikut adalah hasil analisis AI bisnis Anda:\n\n` +
                      `📊 Ringkasan: ${aiData.summary}\n\n` +
                      `⭐ Menu Terbaik: ${aiData.bestMenu}\n\n` +
                      `📦 Status Stok: ${aiData.stockAlert}\n\n` +
                      `🔮 Prediksi: ${aiData.prediction}\n\n` +
                      `Tips Aksi:\n- ${aiData.tips.join('\n- ')}\n\n` +
                      `-- Dikirim OTOMATIS oleh KaffePOS AI`
                    );
                    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
                  }}
                  className="w-full bg-violet-100 hover:bg-violet-200 text-violet-700 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition"
                >
                  <Mail size={14}/> Kirim Copy ke Email Saya
                </button>
                <p className="text-[9px] text-violet-300 text-center uppercase tracking-wider mt-1">
                  {aiData.source === 'local'
                    ? 'Analisis cadangan lokal · Hanya sebagai referensi'
                    : 'Dianalisis oleh Google Gemini · Hanya sebagai referensi'}
                </p>
              </div>
            </div>
          )}
        </div>
          <StatCard label="Total HPP" value={fRp(totalCogs)} sub={`Pengeluaran: ${fRp(totalExpenses)}`} icon={<CreditCard size={20}/>} color="red"/>
          <StatCard label="Avg Transaksi" value={fRp(avgTrx)} sub={`Laba Kotor: ${fRp(grossProfit)}`} icon={<ShoppingBag size={20}/>} color="blue"/>
          <StatCard label="Saldo Kasir" value={fRp(totalCashRegister)} sub={`${filteredCR.length}× buka kasir`} icon={<Wallet size={20}/>} color="orange"/>
          <StatCard label="Pengeluaran Ops" value={fRp(totalExpOps)} sub="Di luar bahan baku" icon={<Receipt size={20}/>} color="red"/>
        </div>

        {lowStockCount>0&&<div className="bg-rose-50 border border-rose-100 rounded-3xl p-4 flex items-center gap-4 shadow-soft"><div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-display font-extrabold shadow-premium shrink-0">!</div><div><p className="font-bold text-rose-800 text-sm">{lowStockCount} bahan kritis</p><p className="text-rose-500 text-[11px] font-bold uppercase tracking-widest mt-0.5">Restock di tab Gudang</p></div></div>}

        {/* Charts */}
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-soft overflow-hidden">
          <div className="px-6 pt-6 pb-2">
            <div className="grid grid-cols-4 gap-2">
              {[{id:'trend',l:'Tren',e:'📈'},{id:'menu',l:'Produk',e:'🥧'},{id:'payment',l:'Bayar',e:'💳'},{id:'stock',l:'Stok',e:'📦'}].map(c=>(
                <button key={c.id} onClick={()=>setChart(c.id as any)} className={`flex flex-col items-center py-3 rounded-[20px] text-[11px] font-bold transition-all gap-1.5 border ${activeChart===c.id?'bg-slate-900 text-white border-slate-900 shadow-premium':'bg-slate-50 text-slate-500 border-slate-100 hover:border-slate-200'}`}>
                  <span>{c.e}</span><span>{c.l}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="px-6 pb-6 pt-4">
            {activeChart==='trend'&&(
              <div className="space-y-6">
                <div><p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">Tren Pendapatan</p><LineChart data={trendData} color="#FF6A00"/></div>
                <div><p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">Aktivitas Mingguan</p><BarChart data={trendData.slice(-7)} color="#3b82f6"/></div>
              </div>
            )}
            {activeChart==='menu'&&(
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-slate-400 mb-3">🥧 Proporsi Penjualan Produk</p>
                  {menuPieData.length===0?<p className="text-center text-slate-300 text-sm py-8">Belum ada data</p>:<DonutChart data={menuPieData}/>}
                </div>
                {menuRanking.length>0&&<div>
                  <p className="text-xs font-bold text-slate-400 mb-3">🏆 Ranking Terjual</p>
                  <HBar items={menuRanking} max={menuRanking[0]?.value||1}/>
                </div>}
              </div>
            )}
            {activeChart==='payment'&&(
              <div>
                <p className="text-xs font-bold text-slate-400 mb-3">Metode Pembayaran</p>
                {paymentData.length===0?<p className="text-center text-slate-300 text-sm py-8">Belum ada data</p>
                  :<div className="space-y-3"><DonutChart data={paymentData}/>
                    <div className="space-y-2">{paymentData.map((p,i)=>(
                      <div key={i} className="flex justify-between items-center bg-slate-50 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor:p.color}}/><span className="text-sm font-bold text-slate-700">{p.label}</span></div>
                        <div className="text-right"><p className="text-sm font-black text-slate-800">{fRp(p.value)}</p><p className="text-xs text-slate-400">{totalRevenue>0?Math.round(p.value/totalRevenue*100):0}%</p></div>
                      </div>
                    ))}</div>
                  </div>}
              </div>
            )}
            {activeChart==='stock'&&(
              <div>
                <div className="flex justify-between mb-3"><p className="text-xs font-bold text-slate-400">Status Stok Bahan</p><span className="text-xs font-bold text-slate-600">{fRp(totalStockVal)}</span></div>
                {stockData.length===0?<p className="text-center text-slate-300 text-sm py-8">Belum ada inventaris</p>
                  :<div className="space-y-2.5">{stockData.map((item:any,i:number)=>{
                    const pct=Math.min(item.pct,100),color=item.pct<=50?'#ef4444':item.pct<=100?'#f97316':'#10b981';
                    return(<div key={i}><div className="flex justify-between mb-1"><span className="text-xs font-bold text-slate-700 truncate max-w-[55%]">{item.label}</span><span className="text-xs font-bold shrink-0 ml-2" style={{color}}>{item.stock} {item.unit}{item.pct<=100?' ⚠':''}</span></div><div className="w-full bg-slate-100 rounded-full h-2"><div className="h-2 rounded-full" style={{width:`${pct}%`,backgroundColor:color}}/></div></div>);
                  })}</div>}
              </div>
            )}
          </div>
        </div>

        {/* P&L */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-black text-slate-400 mb-3">LABA RUGI</p>
          <div className="space-y-0">
            {[
              {l:'Pendapatan Kotor',v:totalRevenue,color:'text-slate-700',bold:false},
              {l:'(-) HPP',v:-totalCogs,color:'text-red-500',bold:false},
              {l:'Laba Kotor',v:grossProfit,color:grossProfit>=0?'text-green-600':'text-red-500',bold:true,sep:true},
              {l:'(-) Pengeluaran',v:-totalExpenses,color:'text-red-500',bold:false},
              {l:'LABA BERSIH',v:netProfit,color:netProfit>=0?'text-green-600':'text-red-500',bold:true,sep:true},
            ].map((row,i)=>(
              <div key={i} className={`flex justify-between py-2 ${(row as any).sep?'border-t border-slate-100 mt-1':''}`}>
                <span className={`text-sm ${row.bold?'font-black text-slate-800':'text-slate-500'}`}>{row.l}</span>
                <span className={`text-sm font-black ${row.color}`}>{row.v<0?`-${fRp(Math.abs(row.v))}`:fRp(row.v)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[{l:'Avg Trx',v:fRp(avgTrx)},{l:'Margin',v:`${grossMargin}%`},{l:'Jumlah Trx',v:`${filtered.length}`},{l:'Nilai Stok',v:fRp(totalStockVal)}].map((s,i)=>(
              <div key={i} className="bg-slate-50 rounded-xl p-2.5 text-center">
                <p className="text-[11px] text-slate-400">{s.l}</p>
                <p className="font-black text-sm text-slate-800">{s.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Saldo Kasir ──────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-slate-50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-orange-100 rounded-lg flex items-center justify-center">
                <Wallet size={14} className="text-orange-500"/>
              </div>
              <p className="text-sm font-black text-slate-800">Saldo Kasir Awal</p>
            </div>
            <p className="text-orange-500 font-black text-sm">{fRp(totalCashRegister)}</p>
          </div>
          {filteredCR.length===0
            ? <p className="px-4 py-3 text-xs text-slate-400 italic">Belum ada saldo kasir untuk periode ini</p>
            : <div className="divide-y divide-slate-50">
                {filteredCR.map((c:any,i:number)=>(
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{c.opened_by||'Kasir'}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(c.date).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                        {c.note?` · ${c.note}`:''}
                      </p>
                    </div>
                    <p className="text-sm font-black text-orange-500">{fRp(c.amount)}</p>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* ── Kas Operasional Harian ─────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-slate-50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-slate-800 rounded-lg flex items-center justify-center">
                <Scale size={14} className="text-orange-400"/>
              </div>
              <div>
                <p className="text-sm font-black text-slate-800">Kas Operasional</p>
                <p className="text-[10px] text-slate-400">Saldo kasir vs pengeluaran · selisih & sumber dana</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-xs font-black ${kasSelisih >= 0 ? 'text-green-600' : 'text-amber-500'}`}>
                {kasSelisih >= 0 ? 'Surplus ' : 'Defisit '}{fRp(Math.abs(kasSelisih))}
              </p>
            </div>
          </div>
          <div className="p-3">
            <KasDailyPanel
              cashRegister={cashRegister}
              expenses={expenses}
              transactions={transactions}
              period={period}
            />
          </div>
        </div>

        {/* ── Pengeluaran Operasional ───────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-slate-50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center">
                <Receipt size={14} className="text-red-500"/>
              </div>
              <p className="text-sm font-black text-slate-800">Pengeluaran Operasional</p>
            </div>
            <p className="text-red-500 font-black text-sm">{fRp(totalExpOps)}</p>
          </div>
          {filteredExpOps.length===0
            ? <p className="px-4 py-3 text-xs text-slate-400 italic">Belum ada pengeluaran untuk periode ini</p>
            : <div className="divide-y divide-slate-50">
                {filteredExpOps.slice(0,10).map((e:any,i:number)=>(
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{e.description}</p>
                      <p className="text-[10px] text-slate-400">
                        {e.category} · {new Date(e.date).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                      </p>
                    </div>
                    <p className="text-sm font-black text-red-500">-{fRp(e.amount)}</p>
                  </div>
                ))}
                {filteredExpOps.length>10&&<p className="px-4 py-2 text-xs text-slate-400 text-center">+{filteredExpOps.length-10} lainnya</p>}
              </div>
          }
        </div>

        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 flex items-center gap-3">
          <span className="text-xl shrink-0">📄</span>
          <div><p className="font-bold text-orange-700 text-sm">PDF lengkap dengan semua chart</p><p className="text-orange-400 text-xs">{filtered.length} transaksi + pie chart + inventaris</p></div>
        </div>
      </div>
      {showExpenseModal && (
        <ExpenseModal
          onClose={() => setShowExpenseModal(false)}
          cashierName={profile?.display_name || profile?.username || 'Kasir'}
          toast={toast}
        />
      )}
      {showCashRegisterModal && (
        <CashRegisterModal
          onClose={() => setShowCashRegisterModal(false)}
          cashierName={profile?.display_name || profile?.username || user?.email || 'Kasir'}
          toast={toast}
          existingEntry={todayCashRegisterEntry}
        />
      )}
    </div>
  );
}
