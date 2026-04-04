/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/pro/ProModal.tsx — KaffePOS v5 + Midtrans
// Snap.js popup langsung di dalam APK WebView
// Tidak perlu redirect keluar app
import { useState, useEffect, useCallback } from 'react';
import {
  X, Crown, Check, Zap, Shield,
  ChevronRight, Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, SUPABASE_ANON_KEY } from '@/lib/supabase';

// ── Konfigurasi Midtrans ─────────────────────────────────────────
// Ganti dengan Client Key kamu dari Midtrans Dashboard
// Sandbox: https://dashboard.sandbox.midtrans.com → Settings → Access Keys
// Production: https://dashboard.midtrans.com → Settings → Access Keys
const MIDTRANS_CLIENT_KEY = import.meta.env.VITE_MIDTRANS_CLIENT_KEY;
if (!MIDTRANS_CLIENT_KEY) {
  console.warn('Missing VITE_MIDTRANS_CLIENT_KEY in .env — Midtrans will not work');
}

const MIDTRANS_SNAP_URL = MIDTRANS_CLIENT_KEY.startsWith('SB-')
  ? 'https://app.sandbox.midtrans.com/snap/snap.js'  // Sandbox
  : 'https://app.midtrans.com/snap/snap.js';           // Production

// ── Supabase Edge Function URL untuk buat token Snap ────────────
// Deploy edge function dari file supabase-midtrans-function.ts
const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/midtrans-token`;

const fRp = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

const PLANS = [
  {
    id: 'monthly' as const,
    label:    'Bulanan',
    price:    49_000,
    period:   '/bulan',
    badge:    '',
    perMonth: null,
    desc:     'Bayar per bulan, bebas batal kapan saja',
  },
  {
    id: 'yearly' as const,
    label:    'Tahunan',
    price:    399_000,
    period:   '/tahun',
    badge:    'HEMAT 32%',
    perMonth: 33_250,
    desc:     'Bayar setahun, hemat lebih banyak',
  },
];

const FEATURES = [
  'Laporan PDF tidak terbatas',
  'Multi-device realtime sync',
  'Menu & inventaris unlimited',
  'Analitik lengkap + grafik',
  'Cetak struk Bluetooth',
  'Export Excel / CSV',
  'Saldo kasir & pengeluaran ops',
  'Dukungan teknis prioritas',
];

type PlanId = 'monthly' | 'yearly';
type Step   = 'plans' | 'processing' | 'success' | 'failed';

interface Props {
  onClose: () => void;
  toast:   { showToast: (m: string, t?: string) => void };
}

// ── Inject Midtrans Snap.js sekali saja ──────────────────────────
let snapLoaded = false;
function loadSnap(): Promise<void> {
  if (snapLoaded || (window as any).snap) { snapLoaded = true; return Promise.resolve(); }
  return new Promise((res, rej) => {
    const s  = document.createElement('script');
    s.src    = MIDTRANS_SNAP_URL;
    s.setAttribute('data-client-key', MIDTRANS_CLIENT_KEY);
    s.onload  = () => { snapLoaded = true; res(); };
    s.onerror = () => rej(new Error('Gagal memuat Midtrans'));
    document.head.appendChild(s);
  });
}

export default function ProModal({ onClose, toast }: Props) {
  const { user, profile, activatePro, refreshProfile } = useAuth();

  const [step,    setStep]    = useState<Step>('plans');
  const [plan,    setPlan]    = useState<PlanId>('yearly');
  const [busy,    setBusy]    = useState(false);
  const [errMsg,  setErrMsg]  = useState('');

  const sel = PLANS.find(p => p.id === plan)!;

  // Preload Snap.js saat modal mount
  useEffect(() => { loadSnap().catch(() => {}); }, [], /* eslint-disable-next-line react-hooks/exhaustive-deps */ );

  // ── Buat Snap Token via Supabase Edge Function ────────────────
  const getSnapToken = async (ordId: string, planId: PlanId, amount: number) => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
        'apikey':        SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        order_id:     ordId,
        amount,
        plan_id:      planId,
        customer_name:  profile?.display_name || profile?.username || 'User KaffePOS',
        customer_email: profile?.email || user?.email || '',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).message || 'Gagal membuat token pembayaran');
    }
    const data = await res.json();
    return data.token as string;
  };

  // ── Buka Snap popup ───────────────────────────────────────────
  const handlePay = useCallback(async () => {
    setBusy(true);
    setErrMsg('');
    const ordId = `PRO-${user?.id?.slice(0,8)}-${Date.now()}`;

    try {
      await loadSnap();

      const token = await getSnapToken(ordId, plan, sel.price);

      setBusy(false);

      // Snap popup — berjalan di dalam WebView Capacitor
      (window as any).snap.pay(token, {
        onSuccess: async (result:any) => {
          setStep('processing');
          try {
            // Catat order ke DB
            await supabase.from('pro_orders').upsert({
              user_id:        user?.id,
              email:          profile?.email || user?.email || '',
              order_id:       ordId,
              plan_id:        plan,
              amount:         sel.price,
              payment_method: result.payment_type || 'midtrans',
              payment_ref:    result.transaction_id || '',
              status:         'paid',
            }, { onConflict: 'order_id' });

            // Aktifkan Pro
            const { error } = await activatePro(plan, ordId);
            if (error) throw new Error(error);

            await refreshProfile();
            setStep('success');
          } catch (e:any) {
            setErrMsg(e.message);
            setStep('failed');
          }
        },
        onPending: (result:any) => {
          // Bayar via VA/transfer — catat sebagai pending
          supabase.from('pro_orders').upsert({
            user_id:        user?.id,
            email:          profile?.email || user?.email || '',
            order_id:       ordId,
            plan_id:        plan,
            amount:         sel.price,
            payment_method: result.payment_type || 'va',
            status:         'pending',
          }, { onConflict: 'order_id' }).then(() => {});
          toast.showToast('Pembayaran pending — selesaikan sesuai instruksi', 'warning');
          // Tetap di plan page, user bisa menutup
        },
        onError: (result:any) => {
          setErrMsg(result?.status_message || 'Pembayaran gagal');
          setStep('failed');
        },
        onClose: () => {
          // User tutup popup tanpa bayar — tidak apa-apa
          setBusy(false);
        },
      });
    } catch (e:any) {
      setBusy(false);
      setErrMsg(e.message || 'Terjadi kesalahan');
      setStep('failed');
    }
  }, [plan, sel.price, user?.id, profile]);

  // ── UI ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-3xl max-h-[93vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-400 rounded-xl flex items-center justify-center">
              <Crown size={15} className="text-white" />
            </div>
            <span className="font-black text-slate-900">KaffePOS Pro</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 active:scale-90">
            <X size={20} />
          </button>
        </div>

        {/* ── STEP: Plans ── */}
        {step === 'plans' && (
          <div className="p-5">
            {/* Headline */}
            <div className="text-center mb-5">
              <p className="text-slate-500 text-sm">Buka semua fitur premium</p>
            </div>

            {/* Plan cards */}
            <div className="space-y-3 mb-5">
              {PLANS.map(p => (
                <button key={p.id} onClick={() => setPlan(p.id)}
                  className={`w-full text-left rounded-2xl border-2 p-4 transition-all active:scale-[0.99]
                    ${plan === p.id
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-slate-900">{p.label}</span>
                        {p.badge && (
                          <span className="text-[10px] font-black bg-green-500 text-white px-2 py-0.5 rounded-full">
                            {p.badge}
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-black text-orange-500">{fRp(p.price)}</span>
                        <span className="text-xs text-slate-400">{p.period}</span>
                      </div>
                      {p.perMonth && (
                        <p className="text-xs text-slate-400 mt-0.5">= {fRp(p.perMonth)}/bulan</p>
                      )}
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5
                      ${plan === p.id ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`}>
                      {plan === p.id && <Check size={11} className="text-white" strokeWidth={3} />}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Features */}
            <div className="bg-slate-50 rounded-2xl p-4 mb-5">
              <p className="text-xs font-black text-slate-400 mb-3">SEMUA FITUR TERMASUK</p>
              <div className="grid grid-cols-2 gap-y-2 gap-x-3">
                {FEATURES.map((f, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <Check size={12} className="text-green-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                    <span className="text-xs text-slate-600">{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment info */}
            <div className="flex items-center gap-2 mb-4 bg-blue-50 rounded-xl p-3">
              <Shield size={14} className="text-blue-500 shrink-0" />
              <p className="text-xs text-blue-700">
                Pembayaran aman via <strong>Midtrans</strong> — GoPay, OVO, QRIS, VA Bank, Kartu Kredit
              </p>
            </div>

            {/* Error */}
            {errMsg && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <p className="text-xs text-red-600">{errMsg}</p>
              </div>
            )}

            {/* CTA */}
            <button onClick={handlePay} disabled={busy}
              className="w-full py-4 bg-orange-500 text-white font-black text-base rounded-2xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-orange-200">
              {busy
                ? <><Loader2 size={18} className="animate-spin" />Membuka Pembayaran...</>
                : <><Zap size={18} />Bayar {fRp(sel.price)} via Midtrans<ChevronRight size={16} /></>
              }
            </button>

            <p className="text-center text-xs text-slate-400 mt-3">
              Pembayaran diproses oleh Midtrans · Aman & terenkripsi
            </p>
          </div>
        )}

        {/* ── STEP: Processing ── */}
        {step === 'processing' && (
          <div className="p-10 flex flex-col items-center justify-center gap-4 min-h-[300px]">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
              <Loader2 size={30} className="text-orange-500 animate-spin" />
            </div>
            <p className="font-black text-slate-900">Mengaktifkan Pro...</p>
            <p className="text-sm text-slate-400 text-center">Sebentar ya, kami sedang memproses akunmu</p>
          </div>
        )}

        {/* ── STEP: Success ── */}
        {step === 'success' && (
          <div className="p-8 flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-4xl">🎉</span>
            </div>
            <div>
              <h3 className="font-black text-2xl text-slate-900 mb-1">Selamat!</h3>
              <p className="text-slate-500 text-sm">Kamu sekarang pengguna KaffePOS Pro</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 w-full">
              <div className="flex items-center gap-2 mb-2">
                <Crown size={16} className="text-amber-500" />
                <span className="font-black text-amber-700">
                  Pro {plan === 'yearly' ? 'Tahunan' : 'Bulanan'} Aktif
                </span>
              </div>
              <p className="text-xs text-amber-600">
                {plan === 'yearly'
                  ? 'Berlaku 1 tahun dari sekarang'
                  : 'Berlaku 1 bulan dari sekarang'}
              </p>
            </div>
            <div className="w-full space-y-2">
              {FEATURES.slice(0, 4).map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-green-50 rounded-xl px-3 py-2">
                  <Check size={13} className="text-green-500 shrink-0" strokeWidth={2.5} />
                  <span className="text-xs text-green-700 font-medium">{f}</span>
                </div>
              ))}
            </div>
            <button onClick={onClose}
              className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl active:scale-95 mt-2">
              Mulai Gunakan Pro 🚀
            </button>
          </div>
        )}

        {/* ── STEP: Failed ── */}
        {step === 'failed' && (
          <div className="p-8 flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-4xl">❌</div>
            <div>
              <h3 className="font-black text-xl text-slate-900 mb-1">Pembayaran Gagal</h3>
              <p className="text-slate-500 text-sm">{errMsg || 'Terjadi kesalahan saat memproses pembayaran'}</p>
            </div>
            <button onClick={() => { setStep('plans'); setErrMsg(''); }}
              className="w-full py-3.5 bg-orange-500 text-white font-black rounded-2xl active:scale-95">
              Coba Lagi
            </button>
            <button onClick={onClose} className="text-sm text-slate-400 font-medium">Tutup</button>
          </div>
        )}

      </div>
    </div>
  );
}
