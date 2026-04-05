/* eslint-disable react-hooks/exhaustive-deps */
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/auth/AuthPage.tsx — KaffePOS v9 GOOGLE OAUTH LOADING FIX
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, Mail, Lock, User,
  ChevronRight, AlertCircle, CheckCircle,
  ArrowLeft, WifiOff, RefreshCw,
  ExternalLink
} from 'lucide-react';
import logo from '@/assets/logo-kaffepos.png';

type Mode = 'login' | 'register' | 'forgot' | 'reset';


export default function AuthPage() {
  const { signIn, signUp, resetPassword, updatePassword, resendVerification, isAuthenticated, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mode,       setMode]       = useState<Mode>('login');
  const [email,      setEmail]      = useState('');
  const [pass,       setPass]       = useState('');
  const [confirmPass,setConfirmPass]= useState('');
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
  const [resendCooldown, setResendCooldown] = useState(0);
  const gCancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    const queryMode = new URLSearchParams(location.search).get('mode');
    const needsPasswordReset = localStorage.getItem('kaffepos_password_reset_required') === '1';
    if (queryMode === 'reset' || needsPasswordReset) {
      setMode('reset');
    }
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
  }, [location.search],   );

  // Autofocus email field on mode switch
  useEffect(() => {
    if (mode && !registered) {
      setTimeout(() => emailRef.current?.focus(), 100);
    }
  }, [mode, registered]);

  // Resend cooldown timer
  useEffect(() => {
    let timer: any;
    if (resendCooldown > 0) {
      timer = setInterval(() => setResendCooldown(c => c - 1), 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [resendCooldown]);

  // Real-time validation effect
  useEffect(() => {
    if (mode === 'register' || mode === 'reset') {
      const errors: { email?: string; pass?: string; uname?: string } = {};
      if (mode === 'register' && email && !/\S+@\S+\.\S+/.test(email.trim())) errors.email = 'Format email tidak valid';
      if (pass && (pass.length < 10 || !/[A-Z]/.test(pass) || !/[a-z]/.test(pass) || !/\d/.test(pass))) {
        errors.pass = 'Password minimal 10 karakter, wajib ada huruf besar, huruf kecil, dan angka';
      }
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
    setMode(m); setErr(''); setOk(''); setPass(''); setConfirmPass(''); setRegistered(false); setFormErrors({});
    localStorage.removeItem('kaffepos_registered_email');
    if (m !== 'reset') localStorage.removeItem('kaffepos_password_reset_required');
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

    if (mode !== 'reset') {
      if (!trimmedEmail)                       { setErr('Email tidak boleh kosong'); return; }
      if (!/\S+@\S+\.\S+/.test(trimmedEmail)) { setErr('Format email tidak valid'); return; }
    }
    
    if (mode === 'reset') {
      if (!pass)              { setErr('Password baru tidak boleh kosong'); return; }
      if (pass.length < 10 || !/[A-Z]/.test(pass) || !/[a-z]/.test(pass) || !/\d/.test(pass)) {
        setErr('Password baru minimal 10 karakter dan wajib mengandung huruf besar, huruf kecil, serta angka');
        return;
      }
      if (pass !== confirmPass) { setErr('Konfirmasi password baru tidak cocok'); return; }
    } else if (mode !== 'forgot') {
      if (!pass)                             { setErr('Password tidak boleh kosong'); return; }
      if (mode === 'register') {
        if (!uname.trim())                   { setErr('Nama Toko tidak boleh kosong'); return; }
        if (pass.length < 10 || !/[A-Z]/.test(pass) || !/[a-z]/.test(pass) || !/\d/.test(pass)) {
          setErr('Password minimal 10 karakter dan wajib mengandung huruf besar, huruf kecil, serta angka');
          return;
        }
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
        setBusy(false);
      } else if (mode === 'register') {
        const result = await signUp(trimmedEmail, pass, uname.trim());
        setBusy(false);
        if (result.error) {
          setErr(result.error || 'Pendaftaran gagal'); 
          return; 
        }
        if (result.needsVerification) {
          setRegistered(true);
          localStorage.setItem('kaffepos_registered_email', trimmedEmail);
          setOk('Akun berhasil dibuat! Link verifikasi sudah dikirim ke email kamu.');
        }
      } else if (mode === 'forgot') {
        const { error } = await resetPassword(trimmedEmail);
        setBusy(false);
        if (error) setErr(error);
        else setOk('Link reset password dikirim ke Gmail kamu. Cek inbox dan folder Spam.');
      } else {
        const result = await updatePassword(pass);
        setBusy(false);
        if (result.error) {
          setErr(result.error);
          return;
        }
        setOk('Password baru berhasil disimpan. Sekarang silakan login dengan password baru Anda.');
        localStorage.removeItem('kaffepos_password_reset_required');
        await signOut();
        navigate('/auth?mode=login', { replace: true });
      }
    } catch (e:any) {
      setErr(e?.message || 'Terjadi kesalahan. Coba lagi.');
      setBusy(false);
    }
  }, [mode, email, pass, confirmPass, uname, signIn, signUp, resetPassword, updatePassword, signOut, navigate]);

  const isNetworkErr = err.includes('internet') || err.includes('koneksi') || err.includes('jaringan');

  // ── Layar konfirmasi setelah register berhasil ───────────────
  if (registered) {
    return (
      <div
        className="min-h-screen bg-slate-50 flex flex-col overflow-y-auto"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
      <div
        className="flex-1 flex flex-col justify-start md:justify-center px-6 max-w-sm mx-auto w-full py-8 md:py-12"
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom, 16px))' }}
      >
          {/* Header Konfirmasi — Premium Look */}
          <div className="text-center mb-10">
            <div className="w-24 h-24 bg-orange-100 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 relative">
              <div className="absolute inset-0 bg-orange-200 rounded-[2.5rem] rotate-6 opacity-30 animate-pulse"></div>
              <Mail size={56} className="text-orange-600 relative z-10" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-3 font-poppins" id="title-confirm-email">Cek Inbox Kamu</h2>
              <p className="text-slate-500 text-sm leading-relaxed px-4">
              Link verifikasi akun sudah dikirim ke <span className="font-bold text-slate-900">{email}</span>. Buka emailnya lalu klik tombol verifikasi sebelum masuk ke aplikasi.
            </p>
          </div>

          {/* Action Cards */}
          <div className="space-y-4 mb-8">
            <button
              onClick={() => {
                // Specific Intent for Gmail on Android, fallback to web
                window.open('googlegmail://', '_blank');
                setTimeout(() => {
                  window.open('https://mail.google.com', '_blank');
                }, 500);
              }}
              className="w-full group bg-white border-2 border-orange-100 p-5 rounded-3xl flex items-center gap-4 active:scale-95 transition-all shadow-sm hover:border-orange-200"
            >
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center shrink-0">
                <Mail className="text-red-500" size={24} />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-black text-slate-900">Buka Gmail</p>
                <p className="text-[11px] text-slate-400 font-medium italic">Klik link verifikasi dari email KaffePOS</p>
              </div>
              <ExternalLink size={18} className="text-slate-300 group-hover:text-orange-400" />
            </button>

            <div className="bg-white border-2 border-orange-100 rounded-3xl p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
                Langkah Verifikasi
              </p>
              <p className="text-sm text-slate-600 leading-relaxed">
                1. Buka email verifikasi dari KaffePOS.
              </p>
              <p className="text-sm text-slate-600 leading-relaxed">
                2. Klik link verifikasinya sampai browser atau aplikasi terbuka.
              </p>
              <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                Jika email belum masuk, gunakan tombol kirim ulang. Demi keamanan, jalur aktivasi darurat untuk testing sudah dinonaktifkan.
              </p>
            </div>

            {/* Status Display inside Registered View */}
            {err && (
              <div className="bg-red-50 border border-red-100 rounded-3xl p-5 mb-4">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-red-500 shrink-0" />
                  <p className="text-sm text-red-700 font-bold leading-relaxed">{err}</p>
                </div>
              </div>
            )}

            {ok && (
              <div className="bg-green-50 border border-green-100 rounded-3xl p-5 mb-4">
                <div className="flex items-start gap-3">
                  <CheckCircle size={20} className="text-green-500 shrink-0" />
                  <p className="text-sm text-green-700 font-bold leading-relaxed">{ok}</p>
                </div>
              </div>
            )}
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
                      setErr('Status: Akun belum diaktivasi. Pastikan Anda sudah klik link di Gmail.');
                    } else setErr(error);
                  }
                } catch (e:any) { setErr('Cek status gagal: ' + (e.message || 'Error')); }
                finally { setConfirming(false); }
              }}
              disabled={confirming}
              className="w-full py-4 bg-orange-500 text-white font-black text-base rounded-2xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-3 shadow-xl shadow-orange-100"
            >
              {confirming ? <RefreshCw size={20} className="animate-spin" /> : <>Cek Status Verifikasi <ChevronRight size={18} /></>}
            </button>

            <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  type="button"
                  id="btn-resend-email"
                  onClick={async () => {
                    if (resendCooldown > 0) return;
                    setResending(true); setErr(''); setOk('');
                    const result = await resendVerification(email.trim());
                    setResending(false);
                    if (result.error) {
                      setErr(result.error || 'Gagal mengirim ulang email.');
                    } else {
                      setOk('Email verifikasi baru sudah dikirim. Cek inbox/spam lalu klik link verifikasinya.');
                      setResendCooldown(60);
                    }
                  }}
                  disabled={resending || resendCooldown > 0}
                  className="py-3.5 bg-white border-2 border-slate-100 text-slate-600 font-black text-[11px] uppercase tracking-wider rounded-2xl active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
                  {resendCooldown > 0 ? `Kirim Ulang (${resendCooldown}s)` : 'Kirim Ulang'}
                </button>

                <button
                   onClick={() => window.open('https://instagram.com/kaffepos', '_blank')}
                   className="py-3.5 bg-white border-2 border-pink-100 text-pink-600 font-black text-[11px] uppercase tracking-wider rounded-2xl active:scale-95 flex items-center justify-center gap-2"
                >
                   Instagram
                </button>
            </div>

            <button
              onClick={() => {
                setRegistered(false);
                localStorage.removeItem('kaffepos_registered_email');
              }}
              className="w-full py-4 text-slate-400 font-bold text-xs active:scale-95 flex items-center justify-center gap-2"
            >
              <ArrowLeft size={14} /> Ganti Email Pendaftaran
            </button>
          </div>

          <div className="mt-12 p-5 bg-white rounded-3xl border border-slate-100 italic">
            <p className="text-[10px] text-slate-400 text-center leading-relaxed">
              *Jika email tidak ada di Inbox, coba cek folder <strong>SPAM</strong> atau <strong>PROMOSI</strong>. Jika ada beberapa email, gunakan link verifikasi terbaru.
            </p>
          </div>
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
        {mode !== 'forgot' && mode !== 'reset' && (
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

        {mode === 'reset' && (
          <div className="mb-6">
            <h2 className="text-xl font-black text-slate-900">Atur Password Baru</h2>
            <p className="text-slate-400 text-sm mt-1">
              Demi keamanan, buat password baru dulu sebelum masuk ke aplikasi.
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
                    disabled={resending || resendCooldown > 0}
                    onClick={async () => {
                      setResending(true);
                      const result = await resendVerification(email.trim());
                      setResending(false);
                      if (result.error) {
                        setErr(result.error || 'Gagal mengirim ulang');
                      } else {
                        setErr('');
                        setOk('Email konfirmasi telah dikirim ulang. Silakan cek inbox/spam.');
                        setResendCooldown(60);
                      }
                    }}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={resending ? 'animate-spin' : ''} />
                    {resending ? 'Mengirim...' : resendCooldown > 0 ? `Tunggu ${resendCooldown}s` : 'Kirim Ulang Email Konfirmasi'}
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

            {mode !== 'reset' && (
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
            )}

            {mode !== 'forgot' && (
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type={show ? 'text' : 'password'}
                  name="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  placeholder={mode === 'register' ? "Password (min 10, A-Z, a-z, 0-9)" : "Password"}
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

            {mode === 'reset' && (
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type={show ? 'text' : 'password'}
                  name="confirm-password"
                  autoComplete="new-password"
                  value={confirmPass}
                  onChange={e => setConfirmPass(e.target.value)}
                  placeholder="Ulangi password baru"
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl pl-11 pr-12 py-3.5 text-sm focus:outline-none focus:bg-white transition-all focus:border-orange-400"
                  style={{ fontSize: 16 }}
                />
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
          <button type="submit" disabled={busy || (mode === 'register' && isInvalid)}
            id="btn-auth-submit"
            className="mt-5 w-full py-4 bg-orange-500 text-white font-black text-base rounded-2xl active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none flex items-center justify-center gap-2 shadow-lg shadow-orange-200">
            {busy
              ? <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {mode === 'login' ? 'Sedang masuk...' : mode === 'register' ? 'Mendaftar...' : mode === 'reset' ? 'Menyimpan password...' : 'Mengirim...'}
                </>
              : <>
                  {mode === 'login' ? 'Masuk ke KaffePOS'
                    : mode === 'register' ? 'Buat Akun Gratis'
                    : mode === 'reset' ? 'Simpan Password Baru'
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

        {mode === 'reset' && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs text-blue-700 font-bold mb-1">Keamanan Akun</p>
            <p className="text-xs text-blue-600 leading-relaxed">
              Anda belum bisa masuk ke aplikasi sebelum password baru berhasil disimpan.
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
