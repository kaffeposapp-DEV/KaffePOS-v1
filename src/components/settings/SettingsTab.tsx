// src/components/settings/SettingsTab.tsx — KaffePOS v5
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Key, LogOut, Printer, Image, Save, Eye, EyeOff, CheckCircle2, RotateCcw, Bluetooth, BluetoothOff, AlertCircle, Wifi, RefreshCw, Bell, ChevronRight } from 'lucide-react';
import SubscriptionSection from './SubscriptionSection';
import { useAuth } from '@/contexts/AuthContext';
import { useStore } from '@/hooks/useStore';
import { usePrinter } from '@/hooks/usePrinter';
import { printReceiptBrowser, testPrintMP58 } from '@/utils/thermalPrinter';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import NotificationCenter from './NotificationCenter';

const SAFE_COLS = [
  'store_name','address','whatsapp','tax_percent','receipt_header','receipt_footer',
  'logo_url','logo_base64','logo_position','logo_size','show_logo_on_receipt','currency',
  'tagline','email','website','paper_width','receipt_font_size',
  'receipt_show_address','receipt_show_whatsapp','receipt_show_tax',
  'receipt_show_cashier','receipt_show_trx_id','receipt_divider',
  'receipt_custom_line1','receipt_custom_line2',
];

// KEY sama dengan useStore.ts agar tidak konflik
const LS_KEY = 'kaffepos_store_settings';
function saveToLS(data: any) { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {} }
function loadFromLS(): any { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }

const Inp = ({ label, value, onChange, placeholder, note }: any) => (
  <div>
    <label className="text-xs font-bold text-slate-500 mb-1 block">{label}</label>
    <input value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400 bg-white" style={{fontSize:16}}/>
    {note&&<p className="text-xs text-slate-400 mt-1">{note}</p>}
  </div>
);

const Toggle = ({ label, value, onChange, note }: any) => (
  <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
    <div className="flex-1 min-w-0 pr-3"><p className="text-sm font-bold text-slate-700">{label}</p>{note&&<p className="text-xs text-slate-400">{note}</p>}</div>
    <button onClick={()=>onChange(!value)} className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${value?'bg-orange-500':'bg-slate-200'}`}>
      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-all duration-200 ${value?'left-[26px]':'left-0.5'}`}/>
    </button>
  </div>
);

const Sel = ({ label, value, onChange, options }: any) => (
  <div>
    <label className="text-xs font-bold text-slate-500 mb-1 block">{label}</label>
    <select value={value||''} onChange={e=>onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400 bg-white">
      {options.map((o:any)=><option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  </div>
);

function ReceiptPreview({ s }: { s: any }) {
  const dc = s.receipt_divider==='star'?'*':s.receipt_divider==='equal'?'=':s.receipt_divider==='dot'?'·':'-';
  const W  = s.paper_width==='80mm' ? 300 : 210;
  const fs = s.receipt_font_size==='large' ? 12 : s.receipt_font_size==='small' ? 9 : 10.5;
  const fRp = (n:number) => 'Rp'+new Intl.NumberFormat('id-ID').format(n||0);
  const div = dc.repeat(Math.floor(W/7));
  const tax = Math.round(68000*(s.tax_percent||0)/100);
  return (
    <div className="flex justify-center overflow-x-auto pb-2">
      <div style={{width:W,fontFamily:"'Courier New',monospace",fontSize:fs,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 8px',lineHeight:1.6,color:'#1e293b',minWidth:W}}>
        {s.show_logo_on_receipt&&s.logo_url&&<div style={{textAlign:s.logo_position||'center',marginBottom:4}}><img src={s.logo_url} alt="" style={{height:s.logo_size||40,display:'inline-block',objectFit:'contain'}}/></div>}
        <div style={{textAlign:'center',fontWeight:'bold',fontSize:fs+3}}>{s.store_name||'Nama Toko'}</div>
        {s.tagline&&<div style={{textAlign:'center',fontSize:fs-0.5,color:'#64748b'}}>{s.tagline}</div>}
        {s.receipt_show_address&&s.address&&<div style={{textAlign:'center',fontSize:fs-1,color:'#64748b'}}>{s.address}</div>}
        {s.receipt_show_whatsapp&&s.whatsapp&&<div style={{textAlign:'center',fontSize:fs-1,color:'#64748b'}}>WA: {s.whatsapp}</div>}
        {s.receipt_header&&<div style={{textAlign:'center',fontSize:fs-0.5}}>{s.receipt_header}</div>}
        <div style={{color:'#94a3b8',margin:'4px 0'}}>{div}</div>
        {s.receipt_show_trx_id&&<div style={{fontSize:fs-1,color:'#64748b'}}>No: TRX-20250301-001</div>}
        <div style={{fontSize:fs-1,color:'#64748b'}}>Tgl: {new Date().toLocaleString('id-ID',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
        {s.receipt_show_cashier&&<div style={{fontSize:fs-1,color:'#64748b'}}>Kasir: @kasir1</div>}
        <div style={{color:'#94a3b8',margin:'4px 0'}}>{div}</div>
        {[{n:'Kopi Susu',q:2,p:25000},{n:'Teh Tarik',q:1,p:18000}].map((i,idx)=>(
          <div key={idx}><div style={{fontWeight:'bold'}}>{i.n}</div><div style={{display:'flex',justifyContent:'space-between',paddingLeft:8}}><span>{i.q}x {fRp(i.p)}</span><span>{fRp(i.q*i.p)}</span></div></div>
        ))}
        <div style={{color:'#94a3b8',margin:'4px 0'}}>{div}</div>
        {s.receipt_show_tax&&tax>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:fs-0.5}}><span>Pajak {s.tax_percent}%</span><span>{fRp(tax)}</span></div>}
        <div style={{display:'flex',justifyContent:'space-between',fontWeight:'bold',fontSize:fs+1}}><span>TOTAL</span><span>{fRp(68000+tax)}</span></div>
        <div style={{color:'#94a3b8',margin:'4px 0'}}>{div}</div>
        <div style={{display:'flex',justifyContent:'space-between'}}><span>Bayar (Tunai)</span><span>{fRp(70000)}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',fontWeight:'bold'}}><span>Kembali</span><span>{fRp(70000-68000-tax)}</span></div>
        <div style={{color:'#94a3b8',margin:'4px 0'}}>{div}</div>
        <div style={{textAlign:'center',fontWeight:'bold'}}>{s.receipt_footer||'Terima kasih!'}</div>
        {s.receipt_custom_line1&&<div style={{textAlign:'center',fontSize:fs-0.5,color:'#64748b'}}>{s.receipt_custom_line1}</div>}
        {s.receipt_custom_line2&&<div style={{textAlign:'center',fontSize:fs-0.5,color:'#64748b'}}>{s.receipt_custom_line2}</div>}
        <div style={{textAlign:'center',fontSize:fs-2,color:'#cbd5e1',marginTop:4}}>** {s.paper_width||'58mm'} **</div>
      </div>
    </div>
  );
}

const DEFAULTS: any = {
  logo_position:'center', logo_size:40, show_logo_on_receipt:true,
  paper_width:'58mm', receipt_font_size:'medium',
  receipt_show_address:true, receipt_show_whatsapp:true,
  receipt_show_tax:true, receipt_show_cashier:true,
  receipt_show_trx_id:true, receipt_divider:'dash',
  tax_percent:0, currency:'IDR',
};

type Section = 'brand'|'receipt'|'printer'|'license';

export default function SettingsTab({ toast, isPro, profile }: any) {
  const { signOut, activatePro, refreshProfile } = useAuth();
  const { storeSettings, saveStoreSettings, storeId } = useStore();
  const printer = usePrinter();
  const [section, setSection]     = useState<Section>('brand');
  const [form, setForm]           = useState<any>({ ...DEFAULTS, ...(loadFromLS()||{}) });
  const [previewOpen, setPrev]    = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveErr, setSaveErr]     = useState('');
  const [saved, setSaved]         = useState(false);
  const [licKey, setLicKey]       = useState('');
  const [licLoading, setLL]       = useState(false);
  const [kasirName, setKasirName] = useState(profile?.display_name || profile?.username || '');
  const [savingKasir, setSavingKasir] = useState(false);
  const [kasirSaved, setKasirSaved]   = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [notifsOpen, setNotifsOpen]   = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const timer   = useRef<any>(null);

  useEffect(() => {
    if (storeSettings) {
      const merged = { ...DEFAULTS, ...storeSettings };
      setForm(merged);
      saveToLS(merged);
    }
  }, [storeSettings]);

  useEffect(() => {
    setKasirName(profile?.display_name || profile?.username || '');
    // Fetch unread notifications
    if (profile?.id) {
      supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('is_read', false)
        .then(({ count }) => { if (count !== null) setUnreadNotifs(count); });
    }
  }, [profile]);

  const triggerSave = useCallback((newForm: any) => {
    saveToLS(newForm);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => doSave(newForm), 1000);
  }, [storeId]);

  const doSave = async (data: any) => {
    setSaving(true); setSaveErr('');
    try {
      const payload: any = {};
      SAFE_COLS.forEach(k => { if (data[k] !== undefined) payload[k] = data[k]; });
      if (payload.logo_base64 && payload.logo_base64.length > 80000) delete payload.logo_base64;
      await saveStoreSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      // FIX: toast eksplisit saat pengaturan berhasil disimpan
      toast.showToast('✅ Pengaturan berhasil disimpan!', 'success');
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('column') || msg.includes('schema') || msg.includes('Store belum dimuat') || !storeId) {
        // Data sudah tersimpan di localStorage, anggap berhasil
        setSaved(true);
        setTimeout(() => { setSaved(false); setSaveErr(''); }, 3000);
        toast.showToast('✅ Pengaturan disimpan (mode offline)', 'success');
      } else {
        setSaveErr(msg || 'Gagal menyimpan. Coba lagi.');
        toast.showToast('Gagal menyimpan: ' + (msg || 'Error tidak diketahui'), 'error');
      }
    } finally { setSaving(false); }
  };

  const update = (key: string, val: any) => {
    const nf = { ...form, [key]: val };
    setForm(nf); triggerSave(nf);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 500*1024) { toast.showToast('Logo maks 500KB','warning'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const b64 = ev.target?.result as string;
      const nf = { ...form, logo_base64: b64, logo_url: b64 };
      setForm(nf); triggerSave(nf);
      toast.showToast('Logo berhasil diupload','success');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveNow = () => {
    if (timer.current) clearTimeout(timer.current);
    doSave(form);
  };

  const handleSaveKasir = async () => {
    if (!kasirName.trim()) return;
    setSavingKasir(true);
    try {
      // FIX: update display_name di profiles, BUKAN store_name
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Belum login');
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: kasirName.trim(), username: kasirName.trim() })
        .eq('id', user.id);
      if (error) throw error;
      setKasirSaved(true); setTimeout(() => setKasirSaved(false), 2500);
      toast.showToast('Nama kasir disimpan!', 'success');
    } catch (e: any) { toast.showToast(e.message || 'Gagal simpan nama kasir', 'error'); }
    finally { setSavingKasir(false); }
  };

  const handleActivateLicense = async () => {
    if (!licKey.trim()) { toast.showToast('Masukkan license key','warning'); return; }
    setLL(true);
    try {
      const result = await activatePro('monthly', licKey.trim().toUpperCase());
      if (result.error) toast.showToast(result.error, 'error');
      else { toast.showToast('PRO berhasil diaktifkan!','success'); setLicKey(''); }
    } catch (e:any) { toast.showToast(e?.message||'Gagal aktivasi','error'); }
    finally { setLL(false); }
  };

  const handleTestPrint = async () => {
    try {
      if (printer.btConnected) {
        await testPrintMP58();
        toast.showToast('✅ Test print berhasil! Cek printer.', 'success');
      } else {
        printReceiptBrowser({
          storeName: form.store_name || 'KaffePOS',
          footer: form.receipt_footer || 'Terima kasih!',
          paperWidth: (form.paper_width || '58mm') as '58mm'|'80mm',
          transaction: {
            id: 'TEST-' + Date.now().toString().slice(-6),
            date: new Date().toISOString(),
            cashier: 'Admin',
            method: 'Tunai',
            items: [{ name: 'Kopi Susu', qty: 1, price: 25000, subtotal: 25000 }],
            subtotal: 25000, discount: 0, tax: 0, total: 25000, paid: 25000, change: 0,
          },
        });
        toast.showToast('🖨️ Test print dibuka di browser', 'success');
      }
    } catch (e: any) {
      toast.showToast(e?.message || 'Gagal test print', 'error');
    }
  };

  const NAV = [{id:'brand',l:'Brand',icon:'🏪'},{id:'receipt',l:'Struk',icon:'🧾'},{id:'printer',l:'Printer',icon:'🖨️'},{id:'license',l:'Lisensi',icon:'🔑'}];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-3 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-slate-800 text-lg">Pengaturan</h2>
          <div className="flex items-center gap-2">
            {saving&&<div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"/>}
            {saved&&!saving&&<div className="flex items-center gap-1 text-green-500 text-xs font-bold"><CheckCircle2 size={13}/>Tersimpan</div>}
            <button onClick={handleSaveNow} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold active:scale-95 disabled:opacity-50 shadow-sm">
              <Save size={13}/>{saving?'Menyimpan...':'Simpan'}
            </button>
          </div>
        </div>
        {saveErr&&<div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2"><AlertCircle size={14} className="text-amber-500 shrink-0"/><p className="text-xs text-amber-700">{saveErr}</p></div>}
        <div className="flex gap-1.5">
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setSection(n.id as Section)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${section===n.id?'bg-slate-900 text-white':'bg-slate-100 text-slate-500'}`}>
              <span className="block text-base leading-tight">{n.icon}</span><span>{n.l}</span>
            </button>
          ))}
        </div>
      </div>

      {/* NOTIFIKASI SECTION (SAAS STYLE) */}
      <div className="px-3 pt-3">
        <button onClick={() => setNotifsOpen(true)}
          className="w-full bg-white rounded-2xl border border-slate-100 p-4 flex items-center justify-between active:scale-[0.98] transition-all overflow-hidden relative group">
          
          {/* Decorative background circle */}
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-50 rounded-full group-hover:scale-125 transition-transform duration-500 opacity-50" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center">
              <div className="relative">
                <Bell size={24} className="text-orange-600" />
                {unreadNotifs > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full animate-pulse" />}
              </div>
            </div>
            <div className="text-left">
              <p className="font-extrabold text-slate-800 text-sm">Notifikasi & Kabar</p>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                {unreadNotifs > 0 ? `${unreadNotifs} Pesan Belum Dibaca` : 'Cek update & informasi'}
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-300 relative z-10" />
        </button>
      </div>

      <NotificationCenter isOpen={notifsOpen} onClose={() => { setNotifsOpen(false); setUnreadNotifs(0); }} />

      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* ── BRAND ── */}
        {section==='brand'&&<>
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-xs font-black text-slate-400 mb-3">LOGO TOKO</p>
            <div className="flex items-center gap-4 mb-3">
              <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50 shrink-0">
                {form.logo_url?<img src={form.logo_url} alt="logo" className="w-full h-full object-contain"/>:<div className="text-center"><div className="text-3xl">☕</div><p className="text-[10px] text-slate-400 mt-1">Belum ada</p></div>}
              </div>
              <div className="flex-1 space-y-2">
                <button onClick={()=>logoRef.current?.click()}
                  className="w-full py-2.5 border-2 border-orange-200 text-orange-600 font-bold rounded-xl text-sm flex items-center justify-center gap-2 active:scale-95">
                  <Image size={15}/>Upload Logo
                </button>
                {form.logo_url&&<button onClick={()=>{const nf={...form,logo_url:'',logo_base64:''};setForm(nf);triggerSave(nf);}}
                  className="w-full py-2 border border-slate-200 text-slate-500 rounded-xl text-xs flex items-center justify-center gap-1 active:scale-95">
                  <RotateCcw size={11}/>Hapus Logo
                </button>}
                <p className="text-xs text-slate-400">PNG/JPG maks 500KB</p>
              </div>
            </div>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload}/>
            <Inp label="URL Logo (alternatif)" value={form.logo_url?.startsWith('data:')?'':form.logo_url} onChange={(v:string)=>update('logo_url',v)} placeholder="https://..."/>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <p className="text-xs font-black text-slate-400">IDENTITAS BRAND</p>
            <Inp label="Nama Brand / Toko *" value={form.store_name} onChange={(v:string)=>update('store_name',v)} placeholder="KaffePOS Coffee"/>
            <Inp label="Tagline" value={form.tagline} onChange={(v:string)=>update('tagline',v)} placeholder="Kopi Terbaik di Kota"/>
            <Inp label="Alamat" value={form.address} onChange={(v:string)=>update('address',v)} placeholder="Jl. Kopi No. 1"/>
            <Inp label="WhatsApp / Telepon" value={form.whatsapp} onChange={(v:string)=>update('whatsapp',v)} placeholder="08xxxxxxxxxx"/>
            <Inp label="Email" value={form.email} onChange={(v:string)=>update('email',v)} placeholder="toko@email.com"/>
            <Inp label="Website" value={form.website} onChange={(v:string)=>update('website',v)} placeholder="www.tokoku.com"/>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <p className="text-xs font-black text-slate-400">KEUANGAN</p>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-2 block">Pajak / PPN: <span className="text-orange-500">{form.tax_percent||0}%</span></label>
              <input type="range" min="0" max="20" value={form.tax_percent||0} onChange={e=>update('tax_percent',parseInt(e.target.value))} className="w-full accent-orange-500 h-2"/>
              <div className="flex justify-between text-xs text-slate-400 mt-1"><span>0%</span><span>20%</span></div>
            </div>
            <Sel label="Mata Uang" value={form.currency||'IDR'} onChange={(v:string)=>update('currency',v)}
              options={[{v:'IDR',l:'IDR — Rupiah'},{v:'USD',l:'USD — Dollar'},{v:'MYR',l:'MYR — Ringgit'},{v:'SGD',l:'SGD — Singapura'}]}/>
          </div>
        </>}

        {/* ── STRUK ── */}
        {section==='receipt'&&<>
          <button onClick={()=>setPrev(!previewOpen)}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-bold text-sm ${previewOpen?'border-orange-400 bg-orange-50 text-orange-600':'border-slate-200 text-slate-600'}`}>
            {previewOpen?<EyeOff size={15}/>:<Eye size={15}/>}
            {previewOpen?'Tutup Preview':'Preview Struk (Realtime)'}
          </button>
          {previewOpen&&<div className="bg-white rounded-2xl border border-slate-100 p-4">
            <ReceiptPreview s={form}/>
            <button onClick={handleTestPrint} className="mt-3 w-full py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl text-sm flex items-center justify-center gap-2 active:scale-95">🖨️ Test Cetak</button>
          </div>}

          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
            <p className="text-xs font-black text-slate-400">UKURAN & FONT</p>
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2">Ukuran Kertas</p>
              <div className="flex gap-2">
                {[{v:'58mm',l:'58mm (Standar)'},{v:'80mm',l:'80mm (Lebar)'}].map(o=>(
                  <button key={o.v} onClick={()=>update('paper_width',o.v)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold ${form.paper_width===o.v?'border-orange-500 bg-orange-50 text-orange-600':'border-slate-200 text-slate-500'}`}>{o.l}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2">Ukuran Font</p>
              <div className="flex gap-2">
                {[{v:'small',l:'Kecil'},{v:'medium',l:'Sedang'},{v:'large',l:'Besar'}].map(o=>(
                  <button key={o.v} onClick={()=>update('receipt_font_size',o.v)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold ${form.receipt_font_size===o.v?'border-orange-500 bg-orange-50 text-orange-600':'border-slate-200 text-slate-500'}`}>{o.l}</button>
                ))}
              </div>
            </div>
            <Sel label="Garis Pemisah" value={form.receipt_divider||'dash'} onChange={(v:string)=>update('receipt_divider',v)}
              options={[{v:'dash',l:'Garis --------'},{v:'equal',l:'Sama ========'},{v:'star',l:'Bintang ********'},{v:'dot',l:'Titik ········'}]}/>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <p className="text-xs font-black text-slate-400">LOGO DI STRUK</p>
            <Toggle label="Tampilkan Logo" value={form.show_logo_on_receipt} onChange={(v:boolean)=>update('show_logo_on_receipt',v)}/>
            {form.show_logo_on_receipt&&<>
              <div>
                <p className="text-xs font-bold text-slate-600 mb-2">Posisi Logo</p>
                <div className="flex gap-2">
                  {[{v:'left',l:'⬅ Kiri'},{v:'center',l:'Tengah'},{v:'right',l:'Kanan ➡'}].map(o=>(
                    <button key={o.v} onClick={()=>update('logo_position',o.v)}
                      className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold ${form.logo_position===o.v?'border-orange-500 bg-orange-50 text-orange-600':'border-slate-200 text-slate-500'}`}>{o.l}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600 mb-1">Ukuran Logo: <span className="text-orange-500">{form.logo_size||40}px</span></p>
                <input type="range" min="20" max="80" value={form.logo_size||40} onChange={e=>update('logo_size',parseInt(e.target.value))} className="w-full accent-orange-500"/>
              </div>
            </>}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <p className="text-xs font-black text-slate-400">TEKS STRUK</p>
            <Inp label="Teks Header" value={form.receipt_header} onChange={(v:string)=>update('receipt_header',v)} placeholder="Selamat datang!"/>
            <Inp label="Teks Footer" value={form.receipt_footer} onChange={(v:string)=>update('receipt_footer',v)} placeholder="Terima kasih!"/>
            <Inp label="Baris Custom 1" value={form.receipt_custom_line1} onChange={(v:string)=>update('receipt_custom_line1',v)} placeholder="Follow IG: @namatoko"/>
            <Inp label="Baris Custom 2" value={form.receipt_custom_line2} onChange={(v:string)=>update('receipt_custom_line2',v)} placeholder="Rating kami di Google Maps!"/>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-xs font-black text-slate-400 mb-1">ELEMEN STRUK</p>
            <Toggle label="Tampilkan Alamat" value={form.receipt_show_address} onChange={(v:boolean)=>update('receipt_show_address',v)}/>
            <Toggle label="Tampilkan WhatsApp" value={form.receipt_show_whatsapp} onChange={(v:boolean)=>update('receipt_show_whatsapp',v)}/>
            <Toggle label="Tampilkan ID Transaksi" value={form.receipt_show_trx_id} onChange={(v:boolean)=>update('receipt_show_trx_id',v)}/>
            <Toggle label="Tampilkan Nama Kasir" value={form.receipt_show_cashier} onChange={(v:boolean)=>update('receipt_show_cashier',v)}/>
            <Toggle label="Tampilkan Pajak" value={form.receipt_show_tax} onChange={(v:boolean)=>update('receipt_show_tax',v)} note="Hanya tampil jika pajak > 0%"/>
          </div>
        </>}

        {/* ── PRINTER ── */}
        {section==='printer'&&<>
          {/* Status Card */}
          <div className={`rounded-2xl p-4 border-2 ${
            printer.reconnecting ? 'bg-yellow-50 border-yellow-300' :
            printer.connected    ? 'bg-green-50 border-green-300' :
                                   'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                printer.reconnecting ? 'bg-yellow-100' :
                printer.connected    ? 'bg-green-100' : 'bg-slate-100'
              }`}>
                {printer.reconnecting
                  ? <div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"/>
                  : printer.connected
                    ? <Bluetooth size={20} className="text-green-600"/>
                    : <BluetoothOff size={20} className="text-slate-400"/>}
              </div>
              <div className="flex-1">
                <p className={`font-black text-sm ${
                  printer.reconnecting ? 'text-yellow-700' :
                  printer.connected    ? 'text-green-700' : 'text-slate-500'
                }`}>
                  {printer.reconnecting ? 'Menghubungkan ulang...' :
                   printer.connected    ? printer.printerName || 'Bluetooth Printer' :
                                         'Tidak terhubung'}
                </p>
                <p className={`text-xs font-bold ${
                  printer.reconnecting ? 'text-yellow-500' :
                  printer.connected    ? 'text-green-500' : 'text-slate-400'
                }`}>
                  {printer.reconnecting ? '🟡 Sedang menghubungkan ulang...' :
                   printer.connected    ? '🟢 Terhubung' : '🔴 Belum terhubung'}
                </p>
              </div>
              {printer.connected && <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"/>}
            </div>

            {/* Tombol aksi */}
            <div className="mt-3 flex gap-2">
              {printer.btConnected ? (
                <button onClick={() => { printer.disconnectBt(); toast.showToast('Printer diputus', 'info'); }}
                  className="flex-1 py-2.5 border-2 border-red-200 text-red-500 font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 text-sm">
                  <BluetoothOff size={14}/>Putuskan
                </button>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      // Pakai native Classic BT SPP — tidak perlu Web BLE picker
                      const n = await printer.connectClassic();
                      toast.showToast('✅ Terhubung: ' + n, 'success');
                    } catch (e: any) {
                      toast.showToast(e?.message || 'Gagal terhubung', 'error');
                    }
                  }}
                  disabled={printer.btReconnecting}
                  className="flex-1 py-2.5 bg-slate-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40 text-sm">
                  {printer.btReconnecting
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                    : <Bluetooth size={14}/>}
                  {printer.btReconnecting ? 'Menghubungkan...' : 'Hubungkan Printer'}
                </button>
              )}
              {printer.btConnected && (
                <button onClick={handleTestPrint}
                  className="px-4 py-2.5 border-2 border-orange-200 text-orange-600 font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95 text-sm">
                  <Printer size={14}/>Test
                </button>
              )}
            </div>
          </div>

          {/* Web BT tidak tersedia */}
          {!printer.btSupported && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-amber-700 font-bold text-xs mb-1">⚠ Web Bluetooth tidak tersedia</p>
              <p className="text-amber-600 text-xs">Gunakan Chrome Android, atau aktifkan di chrome://flags → #enable-web-bluetooth → Enabled.</p>
            </div>
          )}

          {/* Info: auto-reconnect aktif */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3">
            <p className="text-blue-700 text-xs font-bold mb-1">ℹ️ Cara menghubungkan RPPO2N / MP-58 Pro</p>
            <p className="text-blue-600 text-xs">1. Pair printer di Android: Settings → Bluetooth → Scan → pilih printer (PIN: 0000)</p>
            <p className="text-blue-600 text-xs">2. Kembali ke app → klik "Hubungkan Printer"</p>
            <p className="text-blue-600 text-xs">3. App otomatis connect via Bluetooth Classic (SPP)</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center"><Wifi size={16} className="text-orange-500"/></div>
              <div><p className="font-bold text-slate-800 text-sm">Cetak via Browser</p><p className="text-xs text-green-600 font-bold">Tersedia semua perangkat</p></div>
            </div>
            <p className="text-xs text-slate-500 mb-3">Printer WiFi, USB, atau simpan PDF. Otomatis digunakan jika Bluetooth tidak tersedia.</p>
            <button onClick={handleTestPrint}
              className="w-full py-2.5 border-2 border-orange-200 text-orange-600 font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 text-sm">
              🖨️ Test Cetak Browser
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <p className="font-bold text-blue-700 text-sm mb-2">Printer yang Didukung</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {['VSC MP-58 Pro (BLE)','Xprinter XP-58/80','GOOJPRT PT-110','Rongta RPP300','HOIN HOP-H58','Semua ESC/POS BLE'].map((p,i)=>(
                <p key={i} className="text-xs text-blue-600">• {p}</p>
              ))}
            </div>
          </div>

          {/* Tips khusus MP-58 Pro */}
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
            <p className="font-bold text-orange-700 text-sm mb-2">💡 Tips MP-58 Pro (BLE)</p>
            <div className="space-y-1.5">
              {[
                'Tekan tombol power hingga lampu berkedip (mode pairing)',
                'Pastikan Bluetooth HP sudah ON',
                'Klik "Hubungkan Printer" → pilih "MP-58" dari daftar',
                'Kalau tidak muncul → restart printer, scroll daftar',
                'Gunakan Chrome Android (bukan Firefox/Opera)',
                'Kalau gagal connect → aktifkan chrome://flags → #enable-web-bluetooth',
              ].map((tip, i) => (
                <p key={i} className="text-xs text-orange-700">{'▸'} {tip}</p>
              ))}
            </div>
          </div>
        </>
      }

        {/* ── LISENSI ── */}
        {section==='license' && (
          <>
            <SubscriptionSection
              isPro={isPro}
              profile={profile}
              toast={toast}
              onActivateLicense={async (key) => {
                const result = await activatePro('monthly', key);
                return result;
              }}
              onRefreshStatus={refreshProfile}
            />

            {/* NAMA KASIR */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
              <p className="text-xs font-black text-slate-400">NAMA KASIR</p>
              <p className="text-xs text-slate-400">Nama ini akan muncul di setiap struk sebagai identitas kasir</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input value={kasirName} onChange={e => setKasirName(e.target.value)} placeholder="Nama Kasir"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400" style={{fontSize:16}}/>
                </div>
                <button onClick={handleSaveKasir} disabled={savingKasir||!kasirName.trim()}
                  className="px-4 py-3 bg-orange-500 text-white font-bold rounded-xl active:scale-95 disabled:opacity-50 flex items-center gap-1.5 text-sm shrink-0">
                  {savingKasir?<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>:kasirSaved?<CheckCircle2 size={16}/>:<Save size={15}/>}
                  {kasirSaved?'Tersimpan':'Simpan'}
                </button>
              </div>
            </div>

            {/* INFO AKUN */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <p className="text-xs font-black text-slate-400 mb-3">INFO AKUN</p>
              <div className="space-y-3 mb-4">
                <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                  <span className="text-sm text-slate-500">Username</span>
                  <span className="text-sm font-bold text-slate-800">@{profile?.username||'-'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-slate-50">
                  <span className="text-sm text-slate-500">Email</span>
                  <span className="text-sm font-bold text-slate-800 truncate max-w-[180px]">{profile?.email||'-'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-sm text-slate-500">Tier Aktif</span>
                  <span className={`text-sm font-black px-2 py-0.5 rounded-lg ${isPro?'bg-orange-100 text-orange-600':'bg-slate-100 text-slate-600'}`}>
                    {isPro?'⭐ PRO':'BASIC'}
                  </span>
                </div>
              </div>
              <button onClick={()=>{if(confirm('Keluar dari akun?'))signOut();}}
                className="w-full py-3 border-2 border-red-200 text-red-500 font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95">
                <LogOut size={16}/>Keluar dari Akun
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
