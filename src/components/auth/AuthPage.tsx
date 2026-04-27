/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Mail,
  RefreshCw,
  Shield,
  ShieldCheck,
  Store,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthMode, getAuthModeFromLocation, getAuthPathForMode } from '@/utils/authFlow';
import { getPasswordResetParams } from '@/utils/authFlow';
import LOGO_WEB from '@/assets/logo-kaffeposweb.svg';
import LOGO_ICON from '@/assets/logo-kaffeposappicon.svg';

const brandHighlights = [
  {
    title: 'Operasional tetap cepat',
    copy: 'Masuk dari web untuk backoffice, lalu lanjutkan transaksi dari APK tanpa pindah data.',
    icon: Zap,
  },
  {
    title: 'Laporan lebih mudah dibaca',
    copy: 'Riwayat penjualan, stok, dan ringkasan bisnis tetap satu jalur dengan akun yang sama.',
    icon: BarChart3,
  },
  {
    title: 'Akun bisnis tetap aman',
    copy: 'Verifikasi email, reset password, dan akses pengguna berjalan pada domain yang sama.',
    icon: ShieldCheck,
  },
  {
    title: 'Akses akun lebih terjaga',
    copy: 'Verifikasi email, reset password, dan pembatasan akses berjalan pada jalur akun yang sama.',
    icon: Shield,
  },
];

const statsData = [
  { label: 'Active Cafes', value: '1,000+' },
  { label: 'Transactions', value: '2M+' },
  { label: 'Uptime', value: '99.9%' },
];

export default function AuthPage() {
  const { signIn, signUp, resetPassword, updatePassword, resendVerification, verifyEmailCode, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isNative = Capacitor.isNativePlatform();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [uname, setUname] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [registered, setRegistered] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [formErrors, setFormErrors] = useState<{ email?: string; pass?: string; uname?: string }>({});
  const [resendCooldown, setResendCooldown] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const resetParams = useMemo(() => {
    if (mode !== 'reset' || typeof window === 'undefined') {
      return { email: null, token: null };
    }

    return getPasswordResetParams(new URL(window.location.href));
  }, [mode]);
  const invalidResetLink = mode === 'reset' && (!resetParams.email || !resetParams.token);

  useEffect(() => {
    const resolvedMode = getAuthModeFromLocation(location.pathname, location.search);
    const params = new URLSearchParams(location.search);
    const verified = params.get('verified') === '1';
    const registeredEmail = localStorage.getItem('kaffepos_registered_email');

    setMode(resolvedMode);

    if (verified) {
      setRegistered(false);
      setErr('');
      setOk('Email berhasil diverifikasi. Sekarang kamu bisa masuk ke KaffePOS.');
      localStorage.removeItem('kaffepos_registered_email');
      return;
    }

    if (resolvedMode === 'register' && registeredEmail) {
      setEmail(registeredEmail);
      setRegistered(true);
      return;
    }

    if (resolvedMode !== 'register') {
      setRegistered(false);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!registered && mode !== 'reset') {
      const timer = setTimeout(() => emailRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [mode, registered]);

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.removeItem('kaffepos_registered_email');
      sessionStorage.removeItem('kaffepos_registered_email');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (resendCooldown > 0) {
      timer = setInterval(() => setResendCooldown((current) => current - 1), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [resendCooldown]);

  useEffect(() => {
    if (mode === 'register' || mode === 'reset') {
      const errors: { email?: string; pass?: string; uname?: string } = {};
      if (mode === 'register' && email && !/\S+@\S+\.\S+/.test(email.trim())) {
        errors.email = 'Format email tidak valid';
      }
      if (mode === 'register' && uname && uname.trim().length < 3) {
        errors.uname = 'Nama toko minimal 3 karakter';
      }
      if (pass && (pass.length < 10 || !/[A-Z]/.test(pass) || !/[a-z]/.test(pass) || !/\d/.test(pass))) {
        errors.pass = 'Password min 10 huruf, kombinasi besar, kecil & angka';
      }
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
  }, [email, pass, uname, mode]);

  const switchMode = useCallback((nextMode: AuthMode) => {
    setErr('');
    setOk('');
    setPass('');
    setConfirmPass('');
    setShow(false);
    setVerificationCode('');
    setResendCooldown(0);
    setFormErrors({});
    setRegistered(false);

    if (nextMode !== 'register') {
      localStorage.removeItem('kaffepos_registered_email');
    }

    navigate(getAuthPathForMode(nextMode), { replace: true });
  }, [navigate]);

  const handleResendVerification = useCallback(async () => {
    if (resendCooldown > 0 || !email.trim()) return;

    setResending(true);
    setErr('');
    setOk('');
    const result = await resendVerification(email.trim());
    setResending(false);

    if (result.error) {
      setErr(result.error || 'Gagal mengirim ulang email verifikasi.');
      return;
    }

    setOk('Kode verifikasi baru sudah dikirim lewat email.');
    setResendCooldown(60);
  }, [email, resendCooldown, resendVerification]);

  const handleVerificationCheck = useCallback(async () => {
    if (verificationCode.replace(/\D/g, '').length !== 6) {
      setErr('Masukkan kode verifikasi 6 digit dari email terlebih dahulu.');
      return;
    }

    setErr('');
    setOk('');
    setConfirming(true);

    try {
      const result = await verifyEmailCode(email.trim(), verificationCode);
      if (result.error) {
        setErr(result.error);
        return;
      }

      setOk('Akun berhasil diverifikasi. Tunggu sebentar...');
      setTimeout(() => {
        setRegistered(false);
        setVerificationCode('');
        switchMode('login');
      }, 1500);
    } catch (e: any) {
      setErr(e.message || 'Terjadi kesalahan sistem.');
    } finally {
      setConfirming(false);
    }
  }, [email, verificationCode, verifyEmailCode, switchMode]);

  const submit = async () => {
    setErr('');
    setOk('');

    if (mode === 'forgot' && !email) {
      setErr('Alamat email wajib diisi.');
      return;
    }
    if (mode === 'reset' && invalidResetLink) {
      setErr('Tautan reset password tidak valid atau sudah kedaluwarsa. Minta tautan baru untuk melanjutkan.');
      return;
    }
    if (mode === 'reset' && (!pass || !confirmPass)) {
      setErr('Password baru dan konfirmasi wajib diisi.');
      return;
    }
    if ((mode === 'login' || mode === 'register') && (!email || !pass)) {
      setErr('Email dan password wajib diisi.');
      return;
    }

    setBusy(true);

    try {
      if (mode === 'login') {
        const result = await signIn(email, pass);
        if (result.error) {
          if (result.error === 'email_not_confirmed') {
            setErr('email_not_confirmed');
          } else {
            setErr(result.error);
          }
        }
      } else if (mode === 'register') {
        if (!uname) {
          setErr('Nama toko wajib diisi.');
          setBusy(false);
          return;
        }

        const result = await signUp(email, pass, uname);

        if (result.error) {
          setErr(result.error);
        } else {
          setRegistered(true);
          localStorage.setItem('kaffepos_registered_email', email);
        }
      } else if (mode === 'forgot') {
        const result = await resetPassword(email);
        if (result.error) {
          setErr(result.error);
        } else {
          setOk(`Tautan reset password berhasil dikirim ke ${email}`);
          setEmail('');
        }
      } else if (mode === 'reset') {
        if (pass !== confirmPass) {
          setErr('Password baru dan konfirmasi tidak cocok.');
          setBusy(false);
          return;
        }
        const result = await updatePassword(pass);
        if (result.error) {
          setErr(result.error);
        } else {
          setOk('Password berhasil diperbarui. Silakan kembali ke form masuk.');
          setPass('');
          setConfirmPass('');
          setTimeout(() => switchMode('login'), 3000);
        }
      }
    } catch (e: any) {
      setErr(e.message || 'Terjadi kesalahan tidak terduga.');
    } finally {
      setBusy(false);
    }
  };

  const openInbox = async () => {
    const domain = email.split('@')[1];
    if (domain) {
      const targetUrl = domain.includes('gmail')
        ? 'https://mail.google.com/mail/u/0/#search/KaffePOS'
        : domain.includes('yahoo')
          ? 'https://mail.yahoo.com'
          : domain.includes('outlook') || domain.includes('hotmail')
            ? 'https://outlook.live.com'
            : `https://${domain}`;

      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: targetUrl });
        return;
      }
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };


  const duplicateRegistrationErr = err.includes('sudah terdaftar');
  const isInvalid = mode === 'register' && Object.keys(formErrors).length > 0;

  const authTitle = mode === 'login'
    ? 'Masuk'
    : mode === 'register'
      ? 'Buat Akun Gratis'
      : mode === 'forgot'
        ? 'Lupa Password'
        : 'Update Password';

  const authDescription = mode === 'login'
    ? 'Lanjutkan operasional kafe Anda dengan akses backoffice yang mudah dan aman.'
    : mode === 'register'
      ? 'Bergabunglah dengan ratusan pengusaha kafe lainnya dalam ekosistem KaffePOS.'
      : mode === 'forgot'
        ? 'Tautan reset sandi akan segera dikirim ke alamat email terdaftar Anda.'
        : invalidResetLink
          ? 'Tautan reset sudah tidak bisa dipakai. Minta tautan baru untuk melanjutkan dengan aman.'
          : `Atur password baru untuk ${resetParams.email}.`;

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-200 selection:bg-[#d8823b]/30 font-sans relative">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04] hidden lg:block"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      
      <div className="mx-auto min-h-screen w-full max-w-[1280px] lg:grid lg:grid-cols-2 relative z-10">
        
        {/* Left Side - Marketing Matching Welcome Page Tone */}
        <section className="relative hidden lg:flex flex-col justify-between px-10 xl:px-16 py-16 animate-in" style={{ animationDuration: '0.6s' }}>
          
          <div className="max-w-xl">
            <div
              className="flex items-center gap-3 mb-12 group cursor-pointer"
              onClick={() => navigate(isNative ? '/login' : '/welcome')}
            >
              <div className="h-10 md:h-12 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                <img
                  src={LOGO_WEB}
                  alt="KaffePOS"
                  className="h-full w-auto object-contain"
                  loading="eager"
                />
              </div>
            </div>

            <h1 className="text-[56px] font-bold leading-[1.1] text-white tracking-tight mb-6">
              Take Control of Your <br />
              <span className="text-kaffe-500">Kafe Finances</span>
            </h1>
            <p className="text-[17px] text-slate-300 leading-relaxed font-normal mb-14 max-w-[520px]">
              Join thousands of cafes who have transformed their business with our intuitive tracking and POS tools.
            </p>

            <div className="grid grid-cols-2 gap-5">
              {brandHighlights.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div key={idx} className="group flex flex-col items-start gap-4 rounded-[20px] bg-slate-900/30 border border-slate-800/50 p-6 backdrop-blur-sm transition-all duration-300 hover:bg-slate-800/40 hover:border-slate-700/60 hover:-translate-y-1 shadow-sm hover:shadow-xl">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-950/80 border border-slate-800 text-kaffe-500 transition-colors duration-300 group-hover:border-kaffe-500">
                      <Icon size={18} strokeWidth={2} aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-bold text-white mb-2">{item.title}</h3>
                      <p className="text-[12px] text-slate-400 leading-relaxed">{item.copy}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats Footer */}
          <div className="flex items-center gap-12 pt-8 border-t border-slate-800/40">
            {statsData.map((stat, i) => (
              <div key={i}>
                <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-[12px] text-slate-500 font-medium uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Right Side - Auth Forms (Flat dark aesthetic) */}
        <section className="relative flex min-h-screen items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
          <div className="w-full max-w-[420px] sm:max-w-[460px] lg:max-w-[420px] animate-in" style={{ animationDuration: '0.5s' }}>
             
            {/* Mobile Title */}
            <div className="mb-10 text-center lg:hidden animate-in slide-up">
              <div className="inline-flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-kaffe-500 flex items-center justify-center shadow-lg overflow-hidden">
                  <img src={LOGO_ICON} alt="KaffePOS" className="w-full h-full object-cover" />
                </div>
              </div>
              <p className="text-[14px] text-slate-400 px-4">Bergabung ke dalam ekosistem KaffePOS</p>
            </div>

            <div className="rounded-[16px] bg-[#111827] border border-slate-800/80 p-5 sm:p-10 shadow-xl relative transition-all duration-500 hover:border-slate-700/80">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">
                  {registered ? 'Verifikasi OTP' : authTitle}
                </h2>
                <p className="text-[14px] text-slate-400 leading-relaxed">
                  {registered
                    ? `6-digit kode OTP terkirim ke ${email}`
                    : authDescription}
                </p>
              </div>

              {!registered && mode !== 'forgot' && mode !== 'reset' && (
                <div className="mb-8 flex overflow-hidden rounded-lg bg-[#1f2937] p-1 border border-slate-800">
                  {(['login', 'register'] as AuthMode[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => switchMode(value)}
                      className={`flex-1 rounded-md py-2.5 text-[13px] font-bold focus-visible:ring-2 focus-visible:ring-kaffe-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800 outline-none transition-all ${
                        mode === value
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {value === 'login' ? 'Masuk' : 'Buat Akun'}
                    </button>
                  ))}
                </div>
              )}

              {!registered && mode === 'forgot' && (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  aria-label="Kembali ke halaman login"
                  className="mb-6 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-[12px] font-bold text-slate-300 transition hover:bg-slate-700 hover:text-white focus-visible:ring-2 focus-visible:ring-kaffe-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827] outline-none"
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  Kembali ke login
                </button>
              )}

              {!registered && mode === 'reset' && invalidResetLink && (
                <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <p className="text-[13px] leading-relaxed text-amber-100">
                    Link reset ini sudah tidak berlaku. Minta tautan baru agar proses ganti password tetap aman.
                  </p>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-2 text-[12px] font-bold text-amber-100 transition hover:bg-amber-500/30 focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827] outline-none"
                  >
                    Minta tautan baru
                  </button>
                </div>
              )}

              {(err || ok) && (
                <div className="mb-6">
                  {err && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-3 shake" role="alert" aria-live="assertive">
                      <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
                      <div className="flex-1 space-y-2">
                        <p className="text-[13px] leading-relaxed text-red-200">
                          {err === 'email_not_confirmed'
                            ? 'Email belum terkonfirmasi. Silakan periksa inbox OTP.'
                            : err}
                        </p>
                        {(err === 'email_not_confirmed' || duplicateRegistrationErr) && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={resending || resendCooldown > 0}
                              onClick={handleResendVerification}
                              className="rounded bg-red-500/20 px-2 py-1 text-[11px] font-bold text-red-300 hover:bg-red-500/30 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827] outline-none"
                            >
                              {resending ? '...' : (resendCooldown > 0 ? `Tunggu ${resendCooldown}s` : 'Kirim Ulang OTP')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {ok && (
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 animate-in slide-up" role="status" aria-live="polite">
                      <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" />
                      <p className="text-[13px] leading-relaxed text-emerald-200">{ok}</p>
                    </div>
                  )}
                </div>
              )}

              {registered ? (
                <div className="space-y-6 animate-in slide-up">
                  <div className="space-y-3 pb-2 pt-2">
                    <div className="relative flex justify-center gap-3 mx-auto w-full max-w-[340px]">
                      {[0, 1, 2, 3, 4, 5].map((idx) => {
                        const val = verificationCode[idx] || '';
                        const isActive = verificationCode.length === idx || (verificationCode.length === 6 && idx === 5);
                        return (
                          <div
                            key={idx}
                            className={`flex h-12 w-12 sm:h-14 sm:w-12 items-center justify-center rounded-lg border text-[22px] font-bold transition-all duration-300 ${
                              isActive
                                ? 'border-kaffe-500 bg-slate-900 ring-2 ring-kaffe-500/20 text-white'
                                : val
                                  ? 'border-slate-700 bg-slate-800/80 text-white shadow-inner'
                                  : 'border-slate-800 bg-slate-900/50 text-slate-500'
                            }`}
                          >
                            {val || (isActive ? <span className="h-5 w-[2px] animate-pulse bg-kaffe-500 rounded-full" /> : '')}
                          </div>
                        );
                      })}
                      <input
                        id="auth-otp"
                        type="text"
                        inputMode="numeric"
                        aria-label="Kode verifikasi OTP 6 digit"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        autoFocus
                        className="absolute inset-0 w-full h-full opacity-0 cursor-text z-20"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={confirming || verificationCode.length !== 6}
                    onClick={handleVerificationCheck}
                    className="w-full flex items-center justify-center gap-2 rounded-lg py-3.5 mt-2 text-[14px] font-bold text-slate-950 transition-all hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-kaffe-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827] outline-none shadow-[0_0_15px_rgba(216,130,59,0.15)] bg-kaffe-500"
                  >
                    {confirming ? <RefreshCw size={18} className="animate-spin" aria-hidden="true" /> : 'Selesaikan Verifikasi'}
                  </button>

                  <div className="flex items-center justify-between gap-3 pt-5 border-t border-slate-800/60 mt-4">
                    <button
                      type="button"
                      onClick={openInbox}
                      aria-label="Buka inbox email di tab baru"
                      className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2.5 text-[12px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition focus-visible:ring-2 focus-visible:ring-kaffe-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827] outline-none"
                    >
                      Buka Inbox <ExternalLink size={14} aria-hidden="true" className="opacity-70" />
                    </button>
                    <button
                      type="button"
                      disabled={resending || resendCooldown > 0}
                      onClick={handleResendVerification}
                      className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2.5 text-[12px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-kaffe-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827] outline-none"
                    >
                      <RefreshCw size={13} className={`${resending ? 'animate-spin' : ''} opacity-70`} aria-hidden="true" />
                      {resendCooldown > 0 ? `Tunggu ${resendCooldown}s` : 'Kirim Ulang'}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4 animate-in slide-up">
                  {mode === 'register' && (
                    <div className="space-y-2">
                      <label htmlFor="auth-uname" className="text-[13px] font-medium text-slate-400 pl-0.5">Nama Bisnis</label>
                      <div className="relative">
                        <Store size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                        <input
                          id="auth-uname"
                          ref={mode === 'register' ? emailRef : undefined}
                          type="text"
                          value={uname}
                          onChange={(e) => setUname(e.target.value)}
                          aria-invalid={!!formErrors.uname}
                          className={`w-full h-12 rounded-lg bg-slate-900 border pl-11 pr-4 text-[16px] text-white placeholder-slate-500 outline-none transition focus-visible:ring-2 focus-visible:ring-kaffe-500 focus-visible:ring-offset-0 focus:bg-slate-950 ${
                            formErrors.uname ? 'border-red-500/50' : 'border-slate-800 focus:border-kaffe-500'
                          }`}
                          placeholder="Kopi Senja"
                        />
                      </div>
                    </div>
                  )}

                  {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
                    <div className="space-y-2">
                      <label htmlFor="auth-email" className="text-[13px] font-medium text-slate-400 pl-0.5">Alamat Email</label>
                      <div className="relative">
                        <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                        <input
                          id="auth-email"
                          ref={mode === 'login' || mode === 'forgot' ? emailRef : undefined}
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          aria-invalid={!!formErrors.email}
                          className={`w-full h-12 rounded-lg bg-slate-900 border pl-11 pr-4 text-[16px] text-white placeholder-slate-500 outline-none transition focus-visible:ring-2 focus-visible:ring-kaffe-500 focus-visible:ring-offset-0 focus:bg-slate-950 ${
                            formErrors.email ? 'border-red-500/50' : 'border-slate-800 focus:border-kaffe-500'
                          }`}
                          placeholder="admin@bisnis.com"
                        />
                      </div>
                    </div>
                  )}

                  {(mode === 'login' || mode === 'register' || mode === 'reset') && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between pl-0.5">
                        <label htmlFor="auth-pass" className="text-[13px] font-medium text-slate-400">Kata Sandi</label>
                        {mode === 'login' && (
                          <button
                            type="button"
                            onClick={() => switchMode('forgot')}
                            className="text-[13px] font-medium text-kaffe-500 hover:text-kaffe-400 transition outline-none rounded-sm px-1 py-1 -mr-1"
                          >
                            Lupa sandi?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                        <input
                          id="auth-pass"
                          ref={mode === 'reset' ? emailRef : undefined}
                          type={show ? 'text' : 'password'}
                          value={pass}
                          onChange={(e) => setPass(e.target.value)}
                          aria-invalid={!!formErrors.pass}
                          className={`w-full h-12 rounded-lg bg-slate-900 border pl-11 pr-11 text-[16px] text-white placeholder-slate-500 outline-none transition focus-visible:ring-2 focus-visible:ring-kaffe-500 focus-visible:ring-offset-0 focus:bg-slate-950 ${
                            formErrors.pass ? 'border-red-500/50' : 'border-slate-800 focus:border-kaffe-500'
                          }`}
                          placeholder="••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShow(!show)}
                          aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 w-10 h-10 flex items-center justify-center hover:text-slate-200 transition outline-none rounded-md"
                        >
                          {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {mode === 'reset' && (
                    <div className="space-y-2 pt-1">
                      <label htmlFor="auth-confirm" className="text-[13px] font-medium text-slate-400 pl-0.5">Konfirmasi Sandi Baru</label>
                      <div className="relative">
                        <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                        <input
                          id="auth-confirm"
                          type={show ? 'text' : 'password'}
                          value={confirmPass}
                          onChange={(e) => setConfirmPass(e.target.value)}
                          className="w-full h-12 rounded-lg bg-slate-900 border border-slate-800 pl-11 pr-10 text-[16px] text-white placeholder-slate-500 outline-none transition focus-visible:ring-2 focus-visible:ring-kaffe-500 focus-visible:ring-offset-0 focus:bg-slate-950"
                          placeholder="••••••••••"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={busy || isInvalid || invalidResetLink}
                    className="w-full mt-6 flex items-center justify-center gap-2 rounded-lg h-12 text-[15px] font-bold text-slate-950 transition-all hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827] outline-none bg-kaffe-500"
                  >
                    {busy ? (
                      <RefreshCw size={18} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <>
                        {mode === 'login' ? 'Masuk Sekarang' : mode === 'register' ? 'Buat Akun Gratis' : mode === 'forgot' ? 'Kirim Tautan Reset' : 'Simpan Sandi Baru'}
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Branding Footer */}
              {!registered && (
                <div className="mt-8 pt-6 border-t border-slate-800/50 text-center space-y-4">
                  <p className="text-[11px] text-slate-500 leading-relaxed max-w-[280px] mx-auto">
                    Dengan masuk ke KaffePOS, kamu menyetujui{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/terms')}
                      className="text-slate-400 hover:text-white underline decoration-slate-600 underline-offset-2"
                    >
                      Terms of Service
                    </button>
                    {' '}dan{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/privacy')}
                      className="text-slate-400 hover:text-white underline decoration-slate-600 underline-offset-2"
                    >
                      Privacy Policy
                    </button>
                  </p>
                  <div className="flex items-center justify-center gap-2 text-emerald-500/60">
                    <Shield size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Koneksi Aman & Verifikasi OTP</span>
                  </div>
                </div>
              )}

            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
