/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/auth/AuthPage.tsx — KaffePOS v9 GOOGLE OAUTH LOADING FIX
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Eye, EyeOff, Mail, Lock, User,
  ChevronRight, AlertCircle, CheckCircle,
  ArrowLeft, WifiOff, RefreshCw,
} from 'lucide-react';
import logo from '@/assets/logo-kaffepos.png';

type Mode = 'login' | 'register' | 'forgot';


export default function AuthPage() {
  const { signIn, signUp, resetPassword, isAuthenticated, resendVerification, emergencyConfirm } = useAuth();

  const [mode,       setMode]       = useState<Mode>('login');
  const [email,      setEmail]      = useState('');
  const [pass,       setPass]       = useState('');
  const [uname,      setUname]      = useState(''); // uname maps to "Nama Toko / Bisnis"
  const [show,       setShow]       = useState(false);
  const [busy,       setBusy]       = useState(false);
  const [resending,  setResending]  = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [gBusy,      setGBusy]      = useState(false);
  const [err,        setErr]        = useState('');
  const [ok,         setOk]         = useState('');
  const [registered, setRegistered] = useState(false);  // Real-time Validation Errors
  const [formErrors, setFormErrors] = useState<{ email?: string; pass?: string; uname?: string }>({});

  const gCancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    // Restore registration state if any
    const wasRegistered = localStorage.getItem('kaffepos_registered_email');
    if (wasRegistered) {
      setEmail(wasRegistered);
      setRegistered(true);
    }
    return () => {
      mounted.current = false;
      if (gCancelTimer.current) clearTimeout(gCancelTimer.current);
    };
  }, [], /* eslint-disable-next-line react-hooks/exhaustive-deps */ );

  // Autofocus email field on mode switch
  useEffect(() => {
    if (mode && !registered) {
      setTimeout(() => emailRef.current?.focus(), 100);
    }
  }, [mode, registered]);

  // Real-time validation effect
  useEffect(() => {
    if (mode === 'register') {
      const errors: { email?: string; pass?: string; uname?: string } = {};
      if (email && !/\S+@\S+\.\S+/.test(email.trim())) errors.email = 'Format email tidak valid';
      if (pass && pass.length < 8) errors.pass = 'Password minimal 8 karakter';
      setFormErrors(errors);
    } else {
      setFormErrors({});
    }
  }, [email, pass, mode]);

  useEffect(() => {
    if (isAuthenticated && gBusy) {
      setGBusy(false);
      if (gCancelTimer.current) clearTimeout(gCancelTimer.current);
    }
    if (isAuthenticated) {
      localStorage.removeItem('kaffepos_registered_email');
      sessionStorage.removeItem('kaffepos_registered_email');
    }
  }, [isAuthenticated, gBusy]);

  const switchMode = (m: Mode) => {
    setMode(m); setErr(''); setOk(''); setPass(''); setRegistered(false); setFormErrors({});
    localStorage.removeItem('kaffepos_registered_email');
    setTimeout(() => emailRef.current?.focus(), 50);
  };

  const isInvalid = mode === 'register' && (
    !email.trim() || 
    !/\S+@\S+\.\S+/.test(email.trim()) || 
    !pass || 
    pass.length < 8 || 
    !uname.trim()
  );

  const submit = useCallback(async () => {
    setErr(''); setOk(''); setFormErrors({});
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail)                       { setErr('Email tidak boleh kosong'); return; }
    if (!/\S+@\S+\.\S+/.test(trimmedEmail)) { setErr('Format email tidak valid'); return; }
    
    if (mode !== 'forgot') {
      if (!pass)                             { setErr('Password tidak boleh kosong'); return; }
      if (mode === 'register') {
        if (!uname.trim())                   { setErr('Nama Toko tidak boleh kosong'); return; }
        if (pass.length < 8)                 { setErr('Password minimal 8 karakter'); return; }
      }
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        const resp = await signIn(trimmedEmail, pass);
        if (resp.error) {
          const wasReg = localStorage.getItem('kaffepos_registered_email') === trimmedEmail;
          const isCredError = resp.error.toLowerCase().includes('password salah') || resp.error.toLowerCase().includes('credentials');
          
          if (isCredError) {
            // Jika ada info pendaftaran sebelumnya, beri peringatan keras tentang konfirmasi
            if (wasReg) {
              setErr('email_not_confirmed'); 
            } else {
              setErr('Email atau password salah. Jika Anda baru mendaftar, pastikan sudah klik link di Gmail (cek folder Spam).');
            }
          } else {
            setErr(resp.error);
          }
          setBusy(false);
          return;
        }
      } else if (mode === 'register') {
        const result = await signUp(trimmedEmail, pass, uname.trim());
        setBusy(false);
        if (result.error) { setErr(result.error); return; }
        setRegistered(true);
        localStorage.setItem('kaffepos_registered_email', trimmedEmail);
        setOk(result.needsVerification
          ? 'Akun berhasil dibuat! Cek Gmail kamu untuk link verifikasi.'
          : 'Akun berhasil dibuat! Silakan login sekarang.');
      } else {
        const { error } = await resetPassword(trimmedEmail);
        setBusy(false);
        if (error) setErr(error);
        else setOk('Link reset password dikirim ke Gmail kamu. Cek inbox dan folder Spam.');
      }
    } catch (e:any) {
      setErr(e?.message || 'Terjadi kesalahan. Coba lagi.');
      setBusy(false);
    }
  }, [mode, email, pass, uname, signIn, signUp, resetPassword]);

  const isNetworkErr = err.includes('internet') || err.includes('koneksi') || err.includes('jaringan');

  // ── Layar konfirmasi setelah register berhasil ───────────────
  if (registered) {
    return (
      <div
        className="min-h-screen bg-white flex flex-col"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
      <div className="flex-1 flex flex-col justify-center px-6 max-w-sm mx-auto w-full py-8 md:py-12">
          {/* Error Display inside Registered View */}
          {err && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 relative overflow-hidden">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-700 font-bold leading-relaxed">{err}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    id="btn-resend-alert"
                    onClick={async () => {
                      setResending(true);
                      const { error } = await resendVerification(email.trim());
                      if (error) {
                        setErr(error.includes('429') || error.toLowerCase().includes('rate') ? 'Tunggu 1 menit sebelum mengirim ulang email konfirmasi.' : error);
                        setOk('');
                      } else {
                        setErr('');
                        setOk('Email konfirmasi baru telah dikirim. Cek inbox/spam.');
                      }
                      setResending(false);
                    }}
                    disabled={resending}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-red-200 rounded-lg text-xs font-black uppercase tracking-wider text-red-600 active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={resending ? 'animate-spin' : ''} />
                    {resending ? 'Mengirim...' : 'Kirim Ulang'}
                  </button>
                  <button
                    onClick={() => window.open('https://wa.me/628123456789', '_blank')}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black uppercase tracking-wider text-slate-500 active:scale-95"
                  >
                    Hubungi Support
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Success/Status Display */}
          {ok && (
            <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-2xl px-4 py-4 mb-6 shadow-sm">
              <CheckCircle size={18} className="text-green-500 shrink-0 mt-0.5" />
              <p className="text-sm text-green-700 font-bold leading-relaxed">{ok}</p>
            </div>
          )}

          {/* Header Konfirmasi — Premium Look */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-orange-100 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3">
              <Mail size={44} className="text-orange-600" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-2 font-poppins" id="title-confirm-email">Konfirmasi Email</h2>
            <p className="text-slate-500 text-sm leading-relaxed px-2">
              Kami telah mengirimkan instruksi aktivasi akun ke email Anda. Silakan ikuti petunjuk di bawah ini untuk mengaktifkan KaffePOS.
            </p>
          </div>

          {/* Status Info Card */}
          <div className="bg-slate-900 rounded-3xl p-5 mb-8 relative overflow-hidden shadow-xl shadow-slate-200">
            <div className="absolute -right-2 -top-2 opacity-20"><RefreshCw size={80} className="text-white animate-spin-slow" /></div>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1 relative z-10">EMAIL TUJUAN</p>
            <p className="text-white font-bold text-lg truncate relative z-10">{email}</p>
            <div className="mt-4 flex items-center gap-2 text-amber-400 relative z-10">
              <RefreshCw size={14} className="animate-spin" />
              <p className="text-[11px] font-black uppercase tracking-wider">Mengecek status aktivasi secara otomatis...</p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              id="btn-confirm-login"
              onClick={async () => {
                setErr(''); setOk(''); setConfirming(true);
                try {
                  const { error } = await signIn(email.trim(), pass);
                  if (error) {
                    if (error === 'email_not_confirmed') {
                      setErr('Status: Belum diaktivasi. Jika Gmail belum masuk dalam 2 menit, hubungi Support di bawah.');
                    } else setErr(error);
                  }
                } catch (e:any) { setErr('Cek status gagal: ' + (e.message || 'Error')); }
                finally { setConfirming(false); }
              }}
              disabled={confirming}
              className="w-full py-4 bg-orange-500 text-white font-black text-base rounded-2xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-3 shadow-lg shadow-orange-200"
            >
              {confirming ? <RefreshCw size={20} className="animate-spin" /> : <>Masuk ke Dashboard <ChevronRight size={18} /></>}
            </button>
            
            <div className="bg-white border border-slate-100 rounded-3xl p-6 mt-4 shadow-sm text-center">
              <div className="flex items-center justify-center gap-2 mb-2 text-slate-800">
                 <Mail size={16} className="text-orange-500" />
                 <p className="text-sm font-black uppercase tracking-wider">Email Berita Buruk?</p>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Gmail terkadang memblokir link verifikasi otomatis jika sistem sedang sibuk. 
                Jika Anda tidak menemukan email di Inbox atau Spam:
              </p>
              
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  id="btn-resend-email"
                  onClick={async () => {
                    setResending(true); setErr(''); setOk('');
                    const { error } = await resendVerification(email.trim());
                    setResending(false);
                    if (error) setErr(error);
                    else setOk('Sistem mencoba mengirim ulang via jalur cadangan. Cek Inbox/Spam dalam 1-2 menit.');
                  }}
                  disabled={resending}
                  className="w-full py-4 bg-slate-100 text-slate-900 font-bold text-xs rounded-2xl active:scale-95 flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
                  KIRIM ULANG VERIFIKASI
                </button>

                <div className="h-px bg-slate-100 my-2" />

                <button
                   onClick={() => window.open('https://wa.me/6285186076224?text=Halo%20Admin,%20saya%20sudah%20daftar%20KaffePOS%20dengan%20email%20' + email + '%20tapi%20belum%20terima%20link.%20Tolong%20aktivasi%20manual.', '_blank')}
                   className="w-full py-4 bg-green-500 text-white font-black text-xs rounded-2xl active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-green-100"
                >
                   HUBUNGI ADMIN VIA WHATSAPP
                </button>
                
                <button
                   type="button"
                   onClick={() => {
                      if (window.confirm('Gunakan AKTIVASI DARURAT jika Anda benar-benar tidak bisa menunggu. Lanjutkan?')) {
                         document.getElementById('emergency-panel')?.classList.remove('hidden');
                      }
                   }}
                   className="text-[10px] text-slate-300 font-bold uppercase tracking-widest mt-4"
                >
                   Opsi Lanjutan & Aktivasi Instan
                </button>
                
                <div id="emergency-panel" className="hidden mt-4 p-4 bg-orange-50 border border-orange-200 rounded-2xl text-left">
                   <p className="text-[10px] text-orange-700 font-bold mb-3 uppercase flex items-center gap-1">
                      <AlertCircle size={10} /> Mode Darurat
                   </p>
                   <button
                    type="button"
                    onClick={async () => {
                      setConfirming(true); setErr('');
                      const { error } = await emergencyConfirm(email.trim());
                      setConfirming(false);
                      if (error) setErr(`Bypass error: ${error}`);
                      else setOk('AKTIVASI BERHASIL! Silakan klik Masuk.');
                    }}
                    disabled={confirming}
                    className="w-full py-3 bg-orange-600 text-white font-black text-[11px] rounded-xl active:scale-95"
                  >
                    AKTIVASI TANPA EMAIL (INSTAN)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Hubungi Support Tip */}
          <div className="mt-8 flex flex-col items-center gap-3">
             <div className="text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">Bantuan Aktivasi Cepat</p>
                <button
                   onClick={() => window.open('https://wa.me/6285186076224?text=Halo%20Admin,%20saya%20sudah%20daftar%20KaffePOS%20dengan%20email%20' + email + '%20tapi%20belum%20terima%20link.%20Tolong%20aktivasi%20manual.', '_blank')}
                   className="flex items-center gap-2 px-6 py-3.5 bg-green-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-100 active:scale-95 transition-all"
                >
                   <AlertCircle size={16} />
                   Hubungi Admin (WhatsApp)
                </button>
             </div>

             <button
              onClick={() => setRegistered(false)}
              className="mt-6 py-2 text-slate-300 font-bold text-xs active:scale-95 flex items-center justify-center gap-2"
             >
              <ArrowLeft size={14} /> Ganti Email Pendaftaran
             </button>
          </div>

          <p className="text-center text-[10px] text-slate-300 font-bold uppercase tracking-widest mt-12 mb-4">
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
          <div className="w-16 h-16 mx-auto mb-3 relative group">
            <img 
              src={logo} 
              alt="KaffePOS Logo" 
              className="w-full h-full object-contain rounded-2xl shadow-lg shadow-orange-200 transition-transform group-hover:scale-105"
            />
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
              <p className={`text-sm ${isNetworkErr ? 'text-blue-700' : 'text-red-600'}`}>
                {err === 'email_not_confirmed' 
                  ? 'Email belum dikonfirmasi. Cek Gmail kamu (termasuk folder Spam).' 
                  : err}
              </p>
              {isNetworkErr && (
                <button type="button" onClick={submit}
                  className="flex items-center gap-1 text-xs text-blue-600 font-bold mt-1.5">
                  <RefreshCw size={11} /> Coba lagi
                </button>
              )}
              {err === 'email_not_confirmed' && (
                <div className="flex flex-col gap-2 mt-2">
                  <button 
                    type="button" 
                    id="btn-resend-login"
                    disabled={resending}
                    onClick={async () => {
                      setResending(true);
                      const { error } = await resendVerification(email.trim());
                      setResending(false);
                      if (error) setErr(error.includes('429') || error.toLowerCase().includes('rate') ? 'Tunggu 1 menit sebelum mengirim ulang.' : error);
                      else {
                        setErr('');
                        setOk('Email konfirmasi telah dikirim ulang. Silakan cek inbox/spam.');
                      }
                    }}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={resending ? 'animate-spin' : ''} />
                    {resending ? 'Mengirim...' : 'Kirim Ulang Email Konfirmasi'}
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm('Aktivasi Darurat: Gunakan hanya untuk testing jika Anda tidak bisa akses email. Lanjutkan?')) return;
                      setBusy(true); // Ganti busy agar terlihat loading
                      const { error } = await emergencyConfirm(email.trim());
                      setBusy(false);
                      if (error) setErr(`Gagal aktivasi: ${error}`);
                      else {
                        setErr('');
                        setOk('Aktivasi Berhasil! Silakan klik Masuk ke KaffePOS lagi.');
                      }
                    }}
                    disabled={busy}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-black uppercase tracking-wider active:scale-95"
                  >
                    <AlertCircle size={12} />
                    Aktivasi Jalur Cepat (Tes)
                  </button>
                </div>
              )}
              {(err.includes('terkunci') || err.toLowerCase().includes('lockout')) && (
                <div className="mt-2.5 p-2 bg-red-100/50 rounded-lg border border-red-200">
                  <p className="text-[10px] font-black uppercase tracking-wider text-red-700 mb-1">🛡️ Langkah Keamanan</p>
                  <p className="text-[10px] text-red-600 leading-tight">
                    Sistem mendeteksi terlalu banyak percobaan. Kami mengunci akses sementara untuk melindungi akun Anda.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Success general */}
        {ok && mode !== 'forgot' && (
          <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-xl px-3.5 py-3 mb-4">
            <CheckCircle size={15} className="text-green-500 shrink-0 mt-0.5" />
            <p className="text-green-700 text-sm font-medium leading-relaxed">{ok}</p>
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
                  placeholder="Nama Toko / Bisnis"
                  className={`w-full bg-slate-50 border-2 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:bg-white transition-all
                    ${uname.trim() === '' && uname !== '' ? 'border-red-400' : 'border-slate-200 focus:border-orange-400'}`}
                  style={{ fontSize: 16 }} autoCapitalize="words" />
                {uname.trim() === '' && uname !== '' && mode === 'register' && (
                  <p className="text-[10px] text-red-500 font-bold mt-1 ml-4 uppercase tracking-wider">Nama Toko tidak boleh kosong</p>
                )}
              </div>
            )}

            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={emailRef}
                type="email" name="email"
                id="field-email"
                autoComplete={mode === 'register' ? 'email' : 'username'}
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                className={`w-full bg-slate-50 border-2 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:bg-white transition-all
                  ${formErrors.email ? 'border-red-400' : 'border-slate-200 focus:border-orange-400'}`}
                style={{ fontSize: 16 }} autoCapitalize="none" inputMode="email" />
              {formErrors.email && (
                <p className="text-[10px] text-red-500 font-bold mt-1 ml-4 uppercase tracking-wider">{formErrors.email}</p>
              )}
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
                  placeholder={mode === 'register' ? "Password (min 8 karakter)" : "Password"}
                  className={`w-full bg-slate-50 border-2 rounded-2xl pl-11 pr-12 py-3.5 text-sm focus:outline-none focus:bg-white transition-all
                    ${formErrors.pass ? 'border-red-400' : 'border-slate-200 focus:border-orange-400'}`}
                  style={{ fontSize: 16 }} />
                <button type="button" onClick={() => setShow(s => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 p-0.5">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                {formErrors.pass && (
                  <p className="text-[10px] text-red-500 font-bold mt-1 ml-4 uppercase tracking-wider">{formErrors.pass}</p>
                )}
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
          <button type="submit" disabled={busy || (mode === 'register' && isInvalid)}
            id="btn-auth-submit"
            className="mt-5 w-full py-4 bg-orange-500 text-white font-black text-base rounded-2xl active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none flex items-center justify-center gap-2 shadow-lg shadow-orange-200">
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

        {/* Support Link untuk login panel */}
        {mode === 'login' && (
          <div className="mt-6 flex flex-col items-center gap-3">
             <button
                type="button"
                onClick={() => {
                   const wasReg = localStorage.getItem('kaffepos_registered_email');
                   if (wasReg) {
                      setEmail(wasReg);
                      setRegistered(true);
                   } else {
                      // Jika tidak ada di storage, coba ingatkan user
                      setErr('Belum ada pendaftaran yang tercatat. Jika Anda sudah daftar tapi belum konfirmasi, cek Gmail Anda.');
                   }
                }}
                className="text-xs text-slate-400 font-bold flex items-center gap-1 hover:text-orange-500 transition-colors"
                id="link-check-confirmation"
             >
                Sudah Konfirmasi? Masuk
             </button>
          </div>
        )}

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
