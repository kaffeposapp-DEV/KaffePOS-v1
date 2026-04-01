// src/components/settings/SubscriptionSection.tsx
import React, { useState } from 'react';
import { Check, X, Crown, Zap, Key, ChevronRight, Lock, Sparkles, MessageCircle, RefreshCw } from 'lucide-react';

const WA_ADMIN = '6285186076224'; // 0851-8607-6224

interface SubscriptionSectionProps {
  isPro:   boolean;
  profile: any;
  toast:   any;
  onActivateLicense:  (key: string) => Promise<{ error: string | null }>;
  onRefreshStatus:    () => Promise<void>;
}

const FEATURE_COMPARISON = [
  { label: 'POS Kasir',                basic: true,  pro: true  },
  { label: 'Manajemen menu',           basic: true,  pro: true  },
  { label: 'Riwayat transaksi',        basic: true,  pro: true  },
  { label: 'Gudang & stok bahan',      basic: true,  pro: true  },
  { label: 'Laporan harian',           basic: true,  pro: true  },
  { label: 'Cetak via browser/WiFi',   basic: true,  pro: true  },
  { label: 'Thermal printer BT & USB', basic: false, pro: true  },
  { label: 'Export PDF & Excel',       basic: false, pro: true  },
  { label: 'Laporan mingguan/bulanan', basic: false, pro: true  },
  { label: 'Multi kasir / pengguna',   basic: false, pro: true  },
  { label: 'AI Insight penjualan',     basic: false, pro: true  },
  { label: 'Logo & branding struk',    basic: false, pro: true  },
  { label: 'Backup data otomatis',     basic: false, pro: true  },
  { label: 'Prioritas support WA',     basic: false, pro: true  },
];

const PLANS = [
  {
    id:       'monthly',
    name:     'Bulanan',
    price:    'Rp 49.000',
    per:      '/bulan',
    badge:    '',
    gradient: 'linear-gradient(135deg,#475569,#1e293b)',
  },
  {
    id:       'yearly',
    name:     'Tahunan',
    price:    'Rp 399.000',
    per:      '/tahun',
    badge:    'HEMAT 32%',
    gradient: 'linear-gradient(135deg,#f97316,#f59e0b)',
  },
  {
    id:       'lifetime',
    name:     'Seumur Hidup',
    price:    'Rp 899.000',
    per:      'sekali bayar',
    badge:    'TERBAIK',
    gradient: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
  },
];

export default function SubscriptionSection({ isPro, profile, toast, onActivateLicense, onRefreshStatus }: SubscriptionSectionProps) {
  const [licKey,       setLicKey]       = useState('');
  const [licLoading,   setLicLoading]   = useState(false);
  const [showLicForm,  setShowLicForm]  = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const [refreshing,   setRefreshing]   = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshStatus();
      toast.showToast('Status berhasil diperbarui!', 'success');
    } catch {
      toast.showToast('Gagal cek status', 'error');
    } finally { setRefreshing(false); }
  };

  const openWA = (planName: string, planPrice: string) => {
    const msg =
      `Halo admin KaffePOS! 👋\n\nSaya ingin upgrade ke PRO.\n\n` +
      `📦 Paket: *${planName}* (${planPrice})\n` +
      `👤 Akun: ${profile?.email || profile?.username || '-'}\n\n` +
      `Mohon info cara pembayaran & aktivasi lisensinya. Terima kasih!`;
    window.open(`https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(msg)}`, '_system');
  };

  const handleActivate = async () => {
    const key = licKey.trim().toUpperCase();
    if (!key) { toast.showToast('Masukkan kode lisensi', 'warning'); return; }
    setLicLoading(true);
    try {
      const result = await onActivateLicense(key);
      if (result.error) {
        toast.showToast(result.error, 'error');
      } else {
        toast.showToast('🎉 PRO berhasil diaktifkan! Selamat!', 'success');
        setLicKey('');
        setShowLicForm(false);
      }
    } catch (e: any) {
      toast.showToast(e?.message || 'Gagal aktivasi', 'error');
    } finally { setLicLoading(false); }
  };

  // ── Helper: hitung info plan ─────────────────────────────────
  const getPlanInfo = () => {
    const plan = profile?.pro_plan || 'lifetime';
    const exp  = profile?.pro_expires_at ? new Date(profile.pro_expires_at) : null;
    const now  = new Date();
    const planLabel = plan === 'monthly' ? 'Bulanan' : plan === 'yearly' ? 'Tahunan' : 'Seumur Hidup';
    const planEmoji = plan === 'monthly' ? '📅' : plan === 'yearly' ? '📆' : '♾️';

    if (plan === 'lifetime' || !exp) {
      return { planLabel, planEmoji, daysLeft: null, isExpired: false, expDate: null };
    }
    const daysLeft   = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isExpired  = daysLeft <= 0;
    const expDate    = exp.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    return { planLabel, planEmoji, daysLeft, isExpired, expDate };
  };

  // ── PRO AKTIF ────────────────────────────────────────────────
  if (isPro) {
    const { planLabel, planEmoji, daysLeft, isExpired, expDate } = getPlanInfo();
    return (
      <div className="space-y-4">
        {/* Status card PRO */}
        <div className="rounded-3xl overflow-hidden"
          style={{ background: isExpired
            ? 'linear-gradient(135deg,#64748b,#475569)'
            : 'linear-gradient(135deg,#f97316 0%,#f59e0b 50%,#eab308 100%)' }}>
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Crown size={26} className="text-white" />
                </div>
                <div>
                  <p className="text-white font-black text-xl">KaffePOS PRO</p>
                  <p className="text-white/80 text-xs">
                    {planEmoji} Paket {planLabel} {isExpired ? '— Expired' : '✅'}
                  </p>
                </div>
              </div>
              {/* Tombol refresh */}
              <button onClick={handleRefresh} disabled={refreshing}
                className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center active:scale-95">
                <RefreshCw size={15} className={`text-white ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Info expiry */}
            {daysLeft !== null ? (
              <div className="bg-white/20 rounded-2xl px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-white/80 text-xs font-bold">
                    {isExpired ? '⚠ Berakhir pada' : 'Aktif hingga'}
                  </span>
                  <span className="text-white font-black text-sm">{expDate}</span>
                </div>
                {!isExpired && (
                  <>
                    {/* Progress bar sisa waktu */}
                    <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                      {(() => {
                        const total = profile?.pro_plan === 'monthly' ? 30 : 365;
                        const pct   = Math.max(5, Math.min(100, (daysLeft / total) * 100));
                        return <div className="h-full bg-white rounded-full" style={{ width: `${pct}%` }} />;
                      })()}
                    </div>
                    <p className="text-white/70 text-[11px] text-center">
                      {daysLeft} hari lagi tersisa
                    </p>
                  </>
                )}
                {isExpired && (
                  <p className="text-white/80 text-xs text-center">
                    Hubungi admin untuk perpanjang
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-white/20 rounded-2xl px-4 py-2.5 flex items-center justify-center gap-2">
                <span className="text-white font-black text-sm">♾️ Aktif Selamanya</span>
              </div>
            )}
          </div>
        </div>

        {/* Fitur aktif */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-black text-slate-400 mb-3">FITUR AKTIF</p>
          <div className="grid grid-cols-1 gap-2">
            {FEATURE_COMPARISON.filter(f => f.pro).map((f, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                  <Check size={11} className="text-green-600" strokeWidth={3} />
                </div>
                <span className="text-sm text-slate-700">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Perpanjang / kode baru */}
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <p className="text-orange-700 text-xs font-bold mb-1">
            {isExpired ? '⏰ Langganan expired — perpanjang sekarang' : '🔑 Perpanjang atau punya kode baru?'}
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => openWA('Perpanjang PRO', '-')}
              className="flex-1 py-2.5 bg-green-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 active:scale-95">
              <MessageCircle size={13} />WhatsApp Admin
            </button>
            <button
              onClick={() => setShowLicForm(!showLicForm)}
              className="flex-1 py-2.5 border-2 border-orange-300 text-orange-600 text-xs font-bold rounded-xl active:scale-95">
              Input Kode Lisensi
            </button>
          </div>
          {showLicForm && (
            <div className="mt-3 space-y-2">
              <input value={licKey} onChange={e => setLicKey(e.target.value.toUpperCase())}
                placeholder="KAFFE-PRO-XXXX-XXXX"
                className="w-full border border-orange-200 rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none bg-white"
                style={{ fontSize: 14 }} />
              <button onClick={handleActivate} disabled={licLoading || !licKey}
                className="w-full py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                {licLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {licLoading ? 'Mengaktifkan...' : 'Aktifkan Kode'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── BASIC (belum PRO) ────────────────────────────────────────
  const selected = PLANS.find(p => p.id === selectedPlan)!;

  return (
    <div className="space-y-4">
      {/* Status BASIC */}
      <div className="bg-slate-100 border-2 border-slate-200 rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 rounded-xl flex items-center justify-center shrink-0">
              <Zap size={18} className="text-slate-500" />
            </div>
            <div>
              <p className="font-black text-slate-700">Tier BASIC — Gratis</p>
              <p className="text-slate-400 text-xs">Upgrade untuk fitur lengkap</p>
            </div>
          </div>
          {/* Tombol cek status — untuk user yang sudah bayar */}
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 active:scale-95 disabled:opacity-50 shrink-0">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Cek...' : 'Cek Status'}
          </button>
        </div>
        {/* Hint */}
        <p className="text-[10px] text-slate-400 mt-2.5 pl-1">
          💡 Sudah bayar? Tap "Cek Status" — PRO akan aktif seketika
        </p>
      </div>

      {/* Banner PRO */}
      <div className="rounded-3xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#1e293b 0%,#334155 100%)' }}>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-amber-400" />
            <p className="text-amber-400 text-[11px] font-black tracking-wider">UPGRADE KE PRO</p>
          </div>
          <p className="text-white font-black text-xl leading-tight mb-1">
            Buka Semua Fitur<br/>Tanpa Batasan
          </p>
          <p className="text-slate-400 text-xs">
            Thermal printer BT/USB · Laporan lengkap · Multi kasir
          </p>
        </div>
      </div>

      {/* Perbandingan fitur */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-100">
          <div className="p-3"><p className="text-[11px] font-black text-slate-400">FITUR</p></div>
          <div className="p-3 border-x border-slate-100 text-center"><p className="text-[11px] font-black text-slate-500">BASIC</p></div>
          <div className="p-3 text-center"><p className="text-[11px] font-black text-orange-500">PRO ⭐</p></div>
        </div>
        {FEATURE_COMPARISON.map((f, i) => (
          <div key={i} className={`grid grid-cols-3 border-b border-slate-50 last:border-0 ${!f.basic ? 'bg-orange-50/20' : ''}`}>
            <div className="p-3 flex items-center">
              <p className="text-[11px] text-slate-600 font-medium leading-tight">{f.label}</p>
            </div>
            <div className="p-3 border-x border-slate-100 flex items-center justify-center">
              {f.basic
                ? <Check size={13} className="text-green-500" strokeWidth={3} />
                : <X size={13} className="text-slate-200" strokeWidth={3} />}
            </div>
            <div className="p-3 flex items-center justify-center">
              <Check size={13} className="text-orange-500" strokeWidth={3} />
            </div>
          </div>
        ))}
      </div>

      {/* Pilih paket — scroll horizontal */}
      <div>
        <p className="text-[11px] font-black text-slate-400 mb-2.5">PILIH PAKET</p>
        <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {PLANS.map(plan => (
            <button key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`shrink-0 w-38 rounded-2xl overflow-hidden transition-all active:scale-95 ${
                selectedPlan === plan.id
                  ? 'ring-2 ring-orange-400 ring-offset-2 shadow-lg'
                  : 'opacity-75'
              }`}
              style={{ width: 148 }}>
              <div style={{ background: plan.gradient }} className="p-4">
                {plan.badge && (
                  <span className="text-[10px] font-black bg-white/25 text-white px-2 py-0.5 rounded-full mb-2 inline-block">
                    {plan.badge}
                  </span>
                )}
                <p className="text-white font-black text-lg leading-tight">{plan.price}</p>
                <p className="text-white/70 text-[10px]">{plan.per}</p>
              </div>
              <div className="bg-white p-3 flex items-center justify-between">
                <p className="font-black text-slate-700 text-sm">{plan.name}</p>
                <div className={`w-4 h-4 rounded-full flex items-center justify-center border-2 ${
                  selectedPlan === plan.id ? 'bg-orange-500 border-orange-500' : 'border-slate-200'
                }`}>
                  {selectedPlan === plan.id && <Check size={9} className="text-white" strokeWidth={3} />}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Tombol upgrade via WA */}
      <button
        onClick={() => openWA(selected.name, selected.price)}
        className="w-full py-4 rounded-2xl font-black text-white text-base active:scale-95 flex items-center justify-center gap-2.5 shadow-lg"
        style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
        <MessageCircle size={20} />
        Chat Admin — Upgrade {selected.name} {selected.price}
      </button>

      <div className="flex items-center gap-2 justify-center">
        <div className="flex-1 h-px bg-slate-100" />
        <p className="text-xs text-slate-400 px-2">atau punya kode lisensi?</p>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* Aktivasi kode lisensi */}
      <div className="bg-white rounded-2xl border border-slate-100">
        <button onClick={() => setShowLicForm(!showLicForm)}
          className="w-full flex items-center justify-between p-4">
          <div className="flex items-center gap-2.5">
            <Key size={15} className="text-slate-400" />
            <p className="text-sm font-bold text-slate-600">Input kode lisensi dari admin</p>
          </div>
          <ChevronRight size={15} className={`text-slate-300 transition-transform ${showLicForm ? 'rotate-90' : ''}`} />
        </button>

        {showLicForm && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-400">
              Masukkan kode yang kamu terima dari admin setelah pembayaran dikonfirmasi
            </p>
            <input value={licKey} onChange={e => setLicKey(e.target.value.toUpperCase())}
              placeholder="KAFFE-PRO-XXXX-XXXX"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono tracking-widest focus:outline-none focus:border-orange-400"
              style={{ fontSize: 14 }} />
            <button onClick={handleActivate} disabled={licLoading || !licKey}
              className="w-full py-3.5 bg-slate-900 text-white font-black rounded-2xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
              {licLoading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Lock size={15} />}
              {licLoading ? 'Mengaktifkan...' : 'Aktifkan Lisensi'}
            </button>
            <p className="text-center text-[10px] text-slate-300">
              Kode diterima setelah admin konfirmasi pembayaran
            </p>
          </div>
        )}
      </div>

      {/* Info cara bayar */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-blue-700 text-xs font-black mb-2">📋 Cara Upgrade ke PRO</p>
        {[
          'Tap tombol "Chat Admin" di atas',
          'Admin konfirmasi & info rekening/QRIS',
          'Transfer sesuai paket yang dipilih',
          'Kirim bukti transfer ke admin via WA',
          'Admin kirim kode lisensi dalam maks. 1 jam',
          'Input kode di form "Aktifkan Lisensi"',
          'PRO langsung aktif! 🎉',
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-2 mb-1">
            <span className="text-blue-400 font-black text-[10px] mt-0.5 shrink-0">{i + 1}.</span>
            <p className="text-blue-600 text-xs">{step}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
