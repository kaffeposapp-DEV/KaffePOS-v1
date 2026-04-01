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
  const { signIn, signUp, resetPassword, signInWithGoogle, isAuthenticated } = useAuth();

  const [mode,       setMode]       = useState<Mode>('login');
  const [email,      setEmail]      = useState('');
  const [pass,       setPass]       = useState('');
  const [uname,      setUname]      = useState('');
  const [show,       setShow]       = useState(false);
  const [busy,       setBusy]       = useState(false);
  const [gBusy,      setGBusy]      = useState(false);
  const [gCancel,    setGCancel]    = useState(false); // tombol batal muncul setelah 8 detik
  const [err,        setErr]        = useState('');
  const [ok,         setOk]         = useState('');
  const [registered, setRegistered] = useState(false);

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

    // Hard timeout 15 detik — jika auth tidak selesai, reset otomatis
    const safetyTimer = setTimeout(() => {
      if (mounted.current) {
        setGBusy(false);
        setGCancel(false);
        setErr('Login Google timeout. Periksa koneksi dan coba lagi.');
      }
    }, 15_000);

    const { error } = await signInWithGoogle();

    clearTimeout(safetyTimer);

    if (error) {
      setErr(error);
      setGBusy(false);
    }
    // Jika tidak error: isAuthenticated akan flip dan useEffect di atas reset gBusy

    // Cancel button muncul setelah 8 detik (sebagai hint visual)
    gCancelTimer.current = setTimeout(() => {
      if (mounted.current && gBusy) setGCancel(true);
    }, 8_000);
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
          {/* Icon sukses */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={44} className="text-green-500" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Akun Berhasil Dibuat!</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Hampir selesai — satu langkah lagi.
            </p>
          </div>

          {/* Instruksi */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
            <p className="text-amber-800 font-bold text-sm mb-3">📧 Cek Gmail kamu sekarang:</p>
            <ol className="text-amber-700 text-sm leading-relaxed space-y-2.5 list-none">
              <li className="flex gap-2">
                <span className="font-bold text-amber-500 shrink-0">1.</span>
                Buka Gmail di HP atau browser
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-amber-500 shrink-0">2.</span>
                Cari email dari <span className="font-mono font-bold">noreply@mail.app.supabase.io</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-amber-500 shrink-0">3.</span>
                Kalau tidak ada, cek folder <strong>Spam / Junk</strong>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-amber-500 shrink-0">4.</span>
                Klik tombol <strong>"Confirm your email"</strong>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-amber-500 shrink-0">5.</span>
                Kembali ke sini dan login
              </li>
            </ol>
          </div>

          {/* Email info */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-6">
            <p className="text-xs text-slate-500 text-center">
              Email verifikasi dikirim ke
            </p>
            <p className="text-sm font-bold text-slate-800 text-center mt-0.5">{email}</p>
          </div>

          {/* Tombol ke Login */}
          <button
            onClick={() => switchMode('login')}
            className="w-full py-4 bg-orange-500 text-white font-black text-base rounded-2xl active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-orange-200"
          >
            Sudah verifikasi? Masuk sekarang
            <ChevronRight size={18} />
          </button>

          <button
            onClick={() => setRegistered(false)}
            className="mt-3 text-sm text-slate-400 text-center w-full py-2"
          >
            Daftar dengan email lain
          </button>
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

        {/* Google Button */}
        {mode !== 'forgot' && (
          <>
            <button onClick={handleGoogle} disabled={gBusy}
              className="w-full flex items-center justify-center gap-2.5 py-3.5
                bg-white border-2 border-slate-200 rounded-2xl font-bold text-sm
                text-slate-700 active:scale-95 disabled:opacity-70 shadow-sm mb-3">
              {gBusy
                ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                : <GoogleIcon />}
              {gBusy
                ? 'Memproses login Google...'
                : `${mode === 'login' ? 'Masuk' : 'Daftar'} dengan Google`}
            </button>

            {/* Info saat Google browser terbuka */}
            {gBusy && (
              <div className="rounded-xl px-3.5 py-3 mb-3 bg-amber-50 border border-amber-200">
                <p className="text-amber-800 text-xs text-center font-semibold">
                  Selesaikan login di browser, lalu kembali ke app
                </p>
                <p className="text-amber-600 text-xs text-center mt-1">
                  App akan otomatis masuk setelah akun dipilih
                </p>
                {gCancel && (
                  <button
                    onClick={cancelGoogle}
                    className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 font-bold py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <X size={12} /> Batal
                  </button>
                )}
              </div>
            )}

            {/* Info hint Google sebelum klik */}
            {!gBusy && (
              <p className="text-xs text-slate-400 text-center mb-3">
                Pilih akun Google — masuk instan tanpa keluar app
              </p>
            )}

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">atau dengan email</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          </>
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
