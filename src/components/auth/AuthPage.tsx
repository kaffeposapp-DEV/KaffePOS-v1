// src/components/auth/AuthPage.tsx — KaffePOS v9 GOOGLE OAUTH LOADING FIX
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Eye, EyeOff, Coffee, Mail, Lock, User,
  ChevronRight, AlertCircle, CheckCircle,
  ArrowLeft, WifiOff, RefreshCw, X,
} from 'lucide-react';

type Mode = 'login' | 'register' | 'forgot';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function AuthPage() {
  const { signIn, signUp, resetPassword, signInWithGoogle, isAuthenticated, resendVerification, emergencyConfirm } = useAuth();

  const [mode,       setMode]       = useState<Mode>('login');
  const [email,      setEmail]      = useState('');
  const [pass,       setPass]       = useState('');
  const [uname,      setUname]      = useState('');
  const [show,       setShow]       = useState(false);
  const [busy,       setBusy]       = useState(false);
  const [resending,  setResending]  = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [gBusy,      setGBusy]      = useState(false);
  const [gCancel,    setGCancel]    = useState(false); // tombol batal muncul setelah 8 detik
  const [err,        setErr]        = useState('');
  const [ok,         setOk]         = useState('');
  const [registered, setRegistered] = useState(false);
  const [showRescue, setShowRescue] = useState(false);

  const gCancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (gCancelTimer.current) clearTimeout(gCancelTimer.current);
    };
  }, []);

  // FIX UTAMA: Reset gBusy saat user berhasil login
  // onAuthStateChange di AuthContext update isAuthenticated → trigger ini
  useEffect(() => {
    if (isAuthenticated && gBusy) {
      setGBusy(false);
      setGCancel(false);
      if (gCancelTimer.current) clearTimeout(gCancelTimer.current);
    }
  }, [isAuthenticated, gBusy]);

  const switchMode = (m: Mode) => {
    setMode(m); setErr(''); setOk(''); setPass(''); setRegistered(false);
  };

  const submit = useCallback(async () => {
    setErr(''); setOk('');

    if (!email.trim())                       { setErr('Email tidak boleh kosong'); return; }
    if (!/\S+@\S+\.\S+/.test(email.trim())) { setErr('Format email tidak valid'); return; }
    if (mode !== 'forgot') {
      if (!pass)                             { setErr('Password tidak boleh kosong'); return; }
      if (mode === 'register') {
        if (!uname.trim())                   { setErr('Username tidak boleh kosong'); return; }
        if (pass.length < 8)                 { setErr('Password minimal 8 karakter'); return; }
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email.trim(), pass);
        if (error) { setErr(error); setBusy(false); return; }
        // onAuthStateChange SIGNED_IN akan handle navigate — setBusy akan hilang saat komponen unmount
      } else if (mode === 'register') {
        const result = await signUp(email.trim(), pass, uname.trim());
        setBusy(false);
        if (result.error) { setErr(result.error); return; }
        setRegistered(true);
        setOk(result.needsVerification
          ? 'Akun berhasil dibuat! Cek Gmail kamu untuk link verifikasi.'
          : 'Akun berhasil dibuat! Silakan login sekarang.');
      } else {
        const { error } = await resetPassword(email.trim());
        setBusy(false);
        if (error) setErr(error);
        else setOk('Link reset password dikirim ke Gmail kamu. Cek inbox dan folder Spam.');
      }
    } catch (e: any) {
      setErr(e?.message || 'Terjadi kesalahan. Coba lagi.');
      setBusy(false);
    }
  }, [mode, email, pass, uname, signIn, signUp, resetPassword]);
  const handleGoogle = useCallback(async () => {
    setGBusy(true); setGCancel(false); setErr('');
    if (gCancelTimer.current) clearTimeout(gCancelTimer.current);

    // Cancel button muncul setelah 8 detik (sebagai hint visual)
    gCancelTimer.current = setTimeout(() => {
      if (mounted.current && gBusy) setGCancel(true);
    }, 8_000);

    const { error } = await signInWithGoogle();

    if (error) {
      if (mounted.current) {
        setErr(error);
        setGBusy(false);
      }
    }
    // Jika tidak error: isAuthenticated akan flip dan useEffect reset gBusy
  }, [signInWithGoogle, gBusy]);


  const cancelGoogle = useCallback(() => {
    setGBusy(false);
    setGCancel(false);
    if (gCancelTimer.current) { clearTimeout(gCancelTimer.current); gCancelTimer.current = null; }
  }, []);

  const isNetworkErr = err.includes('internet') || err.includes('koneksi') || err.includes('jaringan');

  // ── Layar konfirmasi setelah register berhasil ───────────────
  if (registered) {
    return (
      <div
        className="min-h-screen bg-white flex flex-col"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex-1 flex flex-col justify-center px-6 max-w-sm mx-auto w-full py-8">
          {/* Header Konfirmasi — Premium Look */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-orange-100 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3">
              <Mail size={44} className="text-orange-600" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-2 font-poppins">Langkah Terakhir!</h2>
            <p className="text-slate-500 text-sm leading-relaxed px-2">
              Kami telah mengirimkan instruksi aktivasi akun ke email Anda. Silakan ikuti petunjuk di bawah ini.
            </p>
          </div>

          {/* Email Info Card */}
          <div className="bg-slate-900 rounded-3xl p-5 mb-8 relative overflow-hidden shadow-xl shadow-slate-200">
            {/* Sparkle decoration */}
            <div className="absolute -right-2 -top-2 opacity-20">
              <RefreshCw size={80} className="text-white animate-spin-slow" />
            </div>
            
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1 relative z-10">EMAIL TUJUAN</p>
            <p className="text-white font-bold text-lg truncate relative z-10">{email}</p>
            <div className="mt-4 flex items-center gap-2 text-amber-400 relative z-10">
              <CheckCircle size={14} />
              <p className="text-[11px] font-black uppercase tracking-wider">Sedang dikirim...</p>
            </div>
          </div>

          {/* Instruksi List — SaaS Style */}
          <div className="space-y-4 mb-8">
            {[
              { icon: <Mail size={16}/>, text: 'Buka Inbox Gmail / Email Anda' },
              { icon: <RefreshCw size={16}/>, text: 'Cek folder Spam jika tidak ada' },
              { icon: <ChevronRight size={16}/>, text: 'Klik link "Konfirmasi Email"' },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3 p-3.5 bg-white border border-slate-100 rounded-2xl shadow-sm">
                <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                  {step.icon}
                </div>
                <p className="text-sm font-bold text-slate-600">{step.text}</p>
              </div>
            ))}
          </div>

          {/* Action Button */}
          <div className="space-y-3">
            <button
              onClick={() => switchMode('login')}
              className="w-full py-4 bg-orange-500 text-white font-black text-base rounded-2xl active:scale-95 flex items-center justify-center gap-3 shadow-lg shadow-orange-200 transition-all hover:bg-orange-600"
            >
              Sudah Konfirmasi? Masuk
              <ChevronRight size={18} />
            </button>
            
            <button
              onClick={() => setRegistered(false)}
              className="w-full py-3 bg-white border border-slate-100 text-slate-400 font-bold text-sm rounded-xl active:scale-95 flex items-center justify-center gap-2"
            >
              <ArrowLeft size={14} /> Kembali
            </button>
          </div>

          <p className="text-center text-[10px] text-slate-300 font-bold uppercase tracking-widest mt-8">
            #AturCafemuTanpaAmpas
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-white flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex-1 flex flex-col justify-center px-6 max-w-sm mx-auto w-full py-8">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-200">
            <Coffee size={30} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">KaffePOS</h1>
          <p className="text-slate-400 text-sm mt-1">Atur Kafemu Tanpa Ampas ☕</p>
        </div>

        {/* Tab Masuk / Daftar */}
        {mode !== 'forgot' && (
          <div className="flex bg-slate-100 rounded-2xl p-1 mb-5">
            {(['login', 'register'] as Mode[]).map(m => (
              <button key={m} onClick={() => switchMode(m)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all
                  ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
                {m === 'login' ? 'Masuk' : 'Daftar'}
              </button>
            ))}
          </div>
        )}

        {/* Header Lupa Password */}
        {mode === 'forgot' && (
          <div className="mb-6">
            <button onClick={() => switchMode('login')}
              className="flex items-center gap-1.5 text-sm text-orange-500 font-bold mb-4">
              <ArrowLeft size={15} /> Kembali ke Login
            </button>
            <h2 className="text-xl font-black text-slate-900">Lupa Password?</h2>
            <p className="text-slate-400 text-sm mt-1">
              Masukkan email dan kami kirim link reset ke Gmail kamu
            </p>
          </div>
        )}



        {/* Error */}
        {err && (
          <div className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 mb-4 border
            ${isNetworkErr ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
            {isNetworkErr
              ? <WifiOff size={15} className="text-blue-500 shrink-0 mt-0.5" />
              : <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />}
            <div className="flex-1">
              <p className={`text-sm ${isNetworkErr ? 'text-blue-700' : 'text-red-600'}`}>{err}</p>
              {isNetworkErr && (
                <button onClick={submit}
                  className="flex items-center gap-1 text-xs text-blue-600 font-bold mt-1.5">
                  <RefreshCw size={11} /> Coba lagi
                </button>
              )}
            </div>
          </div>
        )}

        {/* Success (forgot password) */}
        {ok && mode === 'forgot' && (
          <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-xl px-3.5 py-3 mb-4">
            <CheckCircle size={15} className="text-green-500 shrink-0 mt-0.5" />
            <p className="text-green-700 text-sm font-medium leading-relaxed">{ok}</p>
          </div>
        )}

        {/* Fields + Submit — dibungkus dalam <form> untuk password manager & Enter key */}
        <form onSubmit={e => { e.preventDefault(); submit(); }} autoComplete="on">
          <div className="space-y-3">
            {mode === 'register' && (
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  name="username"
                  autoComplete="username"
                  value={uname} onChange={e => setUname(e.target.value)}
                  placeholder="Username (nama tampilan)"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-orange-400 focus:bg-white transition-all"
                  style={{ fontSize: 16 }} autoCapitalize="none" />
              </div>
            )}

            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="email" name="email"
                autoComplete={mode === 'register' ? 'email' : 'username'}
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-orange-400 focus:bg-white transition-all"
                style={{ fontSize: 16 }} autoCapitalize="none" inputMode="email" />
            </div>

            {mode !== 'forgot' && (
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type={show ? 'text' : 'password'}
                  name="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  placeholder="Password (min 8 karakter)"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl pl-11 pr-12 py-3.5 text-sm focus:outline-none focus:border-orange-400 focus:bg-white transition-all"
                  style={{ fontSize: 16 }} />
                <button type="button" onClick={() => setShow(s => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 p-0.5">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}
          </div>

          {mode === 'login' && (
            <button type="button" onClick={() => switchMode('forgot')}
              className="text-xs text-orange-500 font-bold mt-2.5 text-right w-full">
              Lupa password?
            </button>
          )}

          {/* Submit Button */}
          <button type="submit" disabled={busy}
            className="mt-5 w-full py-4 bg-orange-500 text-white font-black text-base rounded-2xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-orange-200">
            {busy
              ? <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {mode === 'login' ? 'Sedang masuk...' : mode === 'register' ? 'Mendaftar...' : 'Mengirim...'}
                </>
              : <>
                  {mode === 'login' ? 'Masuk ke KaffePOS'
                    : mode === 'register' ? 'Buat Akun Gratis'
                    : 'Kirim Link Reset'}
                  <ChevronRight size={18} />
                </>
            }
          </button>
        </form>

        {/* Info hint daftar */}
        {mode === 'register' && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-700 font-bold mb-1">📧 Setelah daftar cek Gmail</p>
            <p className="text-xs text-amber-600 leading-relaxed">
              Kami kirim link verifikasi ke Gmail. Klik link itu dulu sebelum bisa login.
              Cek juga folder <strong>Spam</strong> kalau tidak ada di inbox.
            </p>
          </div>
        )}

        {/* Info hint lupa password */}
        {mode === 'forgot' && !ok && (
          <p className="text-xs text-slate-400 text-center mt-4 leading-relaxed">
            Tidak ada email? Cek folder <strong>Spam</strong>. Email dari{' '}
            <span className="font-mono">noreply@mail.app.supabase.io</span>
          </p>
        )}
      </div>

      <div className="text-center py-4"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <p className="text-xs text-slate-300">KaffePOS · Made with ☕</p>
      </div>
    </div>
  );
}
