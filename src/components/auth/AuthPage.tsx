/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Inbox,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  Store,
  User,
  WifiOff,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthMode, getAuthModeFromLocation, getAuthPathForMode } from '@/utils/authFlow';
import logo from '@/assets/logo-kaffepos.png';

const EMAIL_SENDER = 'noreply@kaffepos.my.id';

const brandHighlights = [
  {
    title: 'Operasional tetap sinkron',
    copy: 'Data akun, kas, stok, dan riwayat transaksi tetap terhubung antara web dan APK.',
    icon: Store,
  },
  {
    title: 'Laporan cepat dibaca',
    copy: 'Ringkasan harian, penjualan, dan cashflow tampil dari sumber data yang sama.',
    icon: BarChart3,
  },
  {
    title: 'Keamanan verifikasi berlapis',
    copy: 'Registrasi, reset password, dan resend email memakai alur auth Supabase yang konsisten.',
    icon: ShieldCheck,
  },
];

const brandStats = [
  { label: 'Akun bisnis', value: '1 akun' },
  { label: 'Data toko', value: 'Terisolasi' },
  { label: 'Sinkronisasi', value: 'Realtime' },
];

export default function AuthPage() {
  const { signIn, signUp, resetPassword, updatePassword, resendVerification, verifyEmailCode, isAuthenticated, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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

  useEffect(() => {
    const requiresPasswordReset = localStorage.getItem('kaffepos_password_reset_required') === '1';
    const resolvedMode = requiresPasswordReset ? 'reset' : getAuthModeFromLocation(location.pathname, location.search);
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
        errors.pass = 'Password minimal 10 karakter, wajib ada huruf besar, huruf kecil, dan angka';
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
    if (nextMode !== 'reset') {
      localStorage.removeItem('kaffepos_password_reset_required');
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

    setOk('Kode verifikasi baru sudah dikirim lewat email. Cek inbox atau folder spam lalu masukkan 6 digit kodenya.');
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

      localStorage.removeItem('kaffepos_registered_email');
      localStorage.removeItem('kaffepos_pending_verification');
      setVerificationCode('');
      setRegistered(false);
      setOk('Email berhasil diverifikasi. Silakan login dengan akun yang baru dibuat.');
      navigate('/login?verified=1', { replace: true });
    } catch (error: any) {
      setErr(error?.message || 'Gagal memverifikasi kode.');
    } finally {
      setConfirming(false);
    }
  }, [email, navigate, verificationCode, verifyEmailCode]);

  const openInbox = useCallback(() => {
    window.open('https://mail.google.com/mail/u/0/#inbox', '_blank', 'noopener,noreferrer');
  }, []);

  const submit = useCallback(async () => {
    setErr('');
    setOk('');
    setFormErrors({});

    const trimmedEmail = email.trim().toLowerCase();

    if (mode !== 'reset') {
      if (!trimmedEmail) {
        setErr('Email tidak boleh kosong');
        return;
      }
      if (!/\S+@\S+\.\S+/.test(trimmedEmail)) {
        setErr('Format email tidak valid');
        return;
      }
    }

    if (mode === 'reset') {
      if (!pass) {
        setErr('Password baru tidak boleh kosong');
        return;
      }
      if (pass.length < 10 || !/[A-Z]/.test(pass) || !/[a-z]/.test(pass) || !/\d/.test(pass)) {
        setErr('Password baru minimal 10 karakter dan wajib mengandung huruf besar, huruf kecil, serta angka');
        return;
      }
      if (pass !== confirmPass) {
        setErr('Konfirmasi password baru tidak cocok');
        return;
      }
    } else if (mode !== 'forgot') {
      if (!pass) {
        setErr('Password tidak boleh kosong');
        return;
      }

      if (mode === 'register') {
        if (!uname.trim()) {
          setErr('Nama toko tidak boleh kosong');
          return;
        }
        if (uname.trim().length < 3) {
          setErr('Nama toko minimal 3 karakter');
          return;
        }
        if (pass.length < 10 || !/[A-Z]/.test(pass) || !/[a-z]/.test(pass) || !/\d/.test(pass)) {
          setErr('Password minimal 10 karakter dan wajib mengandung huruf besar, huruf kecil, serta angka');
          return;
        }
      }
    }

    setBusy(true);

    try {
      if (mode === 'login') {
        const result = await signIn(trimmedEmail, pass);
        if (result.error) {
          const wasRegistered = localStorage.getItem('kaffepos_registered_email') === trimmedEmail;
          const lowerError = result.error.toLowerCase();
          const isCredError = lowerError.includes('password salah') || lowerError.includes('credentials');

          if (isCredError) {
            if (wasRegistered) {
              setErr('email_not_confirmed');
            } else {
              setErr('Email atau password salah. Jika baru mendaftar, pastikan link verifikasinya sudah dibuka.');
            }
          } else {
            setErr(result.error);
          }
          return;
        }
        return;
      }

      if (mode === 'register') {
        const result = await signUp(trimmedEmail, pass, uname.trim());
        if (result.error) {
          setErr(result.error || 'Pendaftaran gagal.');
          return;
        }

        if (result.needsVerification) {
          localStorage.setItem('kaffepos_registered_email', trimmedEmail);
          setRegistered(true);
          setOk(result.message || 'Akun berhasil dibuat. Kode verifikasi sudah dikirim ke inbox email bisnis kamu.');
        }
        return;
      }

      if (mode === 'forgot') {
        const result = await resetPassword(trimmedEmail);
        if (result.error) {
          setErr(result.error);
          return;
        }

        setOk('Link reset password sudah dikirim. Cek inbox dan folder spam dari email bisnis kamu.');
        return;
      }

      const result = await updatePassword(pass);
      if (result.error) {
        setErr(result.error);
        return;
      }

      setOk('Password baru berhasil disimpan. Silakan login ulang dengan password baru.');
      localStorage.removeItem('kaffepos_password_reset_required');
      await signOut();
      navigate('/login', { replace: true });
    } catch (error: any) {
      setErr(error?.message || 'Terjadi kesalahan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }, [mode, email, pass, confirmPass, uname, signIn, signUp, resetPassword, updatePassword, signOut, navigate]);

  const isNetworkErr = err.toLowerCase().includes('internet') || err.toLowerCase().includes('koneksi') || err.toLowerCase().includes('jaringan');
  const duplicateRegistrationErr = mode === 'register' && err.toLowerCase().includes('email sudah terdaftar');
  const isInvalid = mode === 'register' && (
    !email.trim() ||
    !/\S+@\S+\.\S+/.test(email.trim()) ||
    !pass ||
    pass.length < 10 ||
    !uname.trim()
  );

  const authTitle = mode === 'login'
    ? 'Masuk ke backoffice'
    : mode === 'register'
      ? 'Buat akun bisnis'
      : mode === 'forgot'
        ? 'Reset password'
        : 'Atur password baru';

  const authDescription = mode === 'login'
    ? 'Gunakan akun KaffePOS yang sama untuk mengakses web dan aplikasi tanpa mencampur data toko.'
    : mode === 'register'
      ? 'Registrasi langsung membuat alur verifikasi email dan profil bisnis yang siap sinkron ke Supabase.'
      : mode === 'forgot'
        ? 'Kami kirim link reset ke inbox email bisnis yang terhubung dengan akun KaffePOS.'
        : 'Demi keamanan, simpan password baru dulu sebelum masuk ke aplikasi.';

  return (
    <div className="scroll-y min-h-full bg-[#f3f1ec] text-slate-950">
      <div className="mx-auto min-h-full w-full max-w-[1360px] lg:grid lg:grid-cols-[minmax(0,1.06fr)_minmax(440px,520px)]">
        <section className="relative hidden overflow-hidden bg-[#17171b] px-10 py-10 text-white lg:flex">
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.24) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.24) 1px, transparent 1px)',
              backgroundSize: '34px 34px',
            }}
          />
          <div className="relative flex min-h-full w-full flex-col justify-between">
            <div>
              <div className="mb-10 flex items-center gap-3">
                <img src={logo} alt="KaffePOS" className="h-12 w-12 rounded-[8px] bg-white/10 p-2" />
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.22em] text-[#d59a4b]">KaffePOS</p>
                  <p className="text-sm text-white/70">Backoffice untuk operasional harian</p>
                </div>
              </div>

              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d59a4b]">Web dan APK dalam satu alur</p>
              <h1 className="mt-4 max-w-xl text-5xl font-black leading-tight text-white">
                Kas, stok, laporan, dan login pelanggan bisnis tetap rapi dari satu sumber data.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/72">
                Registrasi akun baru memicu verifikasi email bisnis, pembuatan profil pengguna di Supabase,
                dan jalur sinkronisasi yang sama untuk web maupun aplikasi.
              </p>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {brandStats.map((item) => (
                  <div key={item.label} className="border border-white/10 bg-white/5 px-4 py-4">
                    <p className="text-2xl font-black text-white">{item.value}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">{item.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                {brandHighlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="border border-white/10 bg-white/5 px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center bg-white/10 text-[#d59a4b]">
                          <Icon size={18} />
                        </div>
                        <p className="text-sm font-black text-white">{item.title}</p>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/68">{item.copy}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-white/10 pt-6 text-sm leading-6 text-white/62">
              Email bisnis terkirim dari <span className="font-semibold text-white">{EMAIL_SENDER}</span> dan jalur auth
              tetap memakai callback yang sama di web maupun APK.
            </div>
          </div>
        </section>

        <section className="flex min-h-full items-stretch">
          <div className="w-full px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <div className="mx-auto mb-4 max-w-[520px] border border-black/10 bg-[#17171b] px-5 py-5 text-white lg:hidden">
              <div className="flex items-center gap-3">
                <img src={logo} alt="KaffePOS" className="h-12 w-12 rounded-[8px] bg-white/10 p-2" />
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-[#d59a4b]">KaffePOS</p>
                  <p className="text-sm text-white/72">Backoffice sinkron untuk web dan APK</p>
                </div>
              </div>
            </div>

            <div className="mx-auto flex min-h-full max-w-[520px] flex-col justify-center">
              <div className="border border-black/10 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                        {registered ? 'Verifikasi email' : 'Akses bisnis'}
                      </p>
                      <h1 className="mt-2 text-[28px] font-black leading-tight text-slate-950">
                        {registered ? 'Cek inbox pendaftaran' : authTitle}
                      </h1>
                    </div>
                    <img src={logo} alt="KaffePOS" className="hidden h-12 w-12 rounded-[8px] border border-slate-200 p-2 sm:block" />
                  </div>
                  <p className="mt-3 max-w-[44ch] text-sm leading-6 text-slate-600">
                    {registered
                      ? `Kode verifikasi akun sudah dikirim ke ${email}. Buka inbox lalu gunakan email terbaru dari ${EMAIL_SENDER}.`
                      : authDescription}
                  </p>
                </div>

                <div className="px-5 py-5 sm:px-6">
                  {!registered && mode !== 'forgot' && mode !== 'reset' && (
                    <div className="mb-5 grid grid-cols-2 gap-2 border border-slate-200 bg-slate-50 p-1">
                      {(['login', 'register'] as AuthMode[]).map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => switchMode(value)}
                          className={`px-3 py-2.5 text-sm font-black transition ${
                            mode === value ? 'bg-white text-slate-950 shadow-[0_8px_24px_rgba(15,23,42,0.08)]' : 'text-slate-500'
                          }`}
                        >
                          {value === 'login' ? 'Masuk' : 'Daftar'}
                        </button>
                      ))}
                    </div>
                  )}

                  {!registered && mode === 'forgot' && (
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="mb-5 flex items-center gap-2 text-sm font-bold text-[#b66a1f]"
                    >
                      <ArrowLeft size={15} />
                      Kembali ke login
                    </button>
                  )}

                  {(err || ok) && (
                    <div className="mb-4 space-y-3">
                      {err && (
                        <div className={`border px-4 py-3 ${isNetworkErr ? 'border-blue-200 bg-blue-50' : 'border-red-200 bg-red-50'}`}>
                          <div className="flex items-start gap-3">
                            {isNetworkErr ? (
                              <WifiOff size={16} className="mt-0.5 shrink-0 text-blue-600" />
                            ) : (
                              <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
                            )}
                            <div className="flex-1 space-y-3">
                              <p className={`text-sm leading-6 ${isNetworkErr ? 'text-blue-800' : 'text-red-700'}`}>
                                {err === 'email_not_confirmed'
                                  ? 'Email belum dikonfirmasi. Cek inbox, spam, atau promosi lalu buka link verifikasinya.'
                                  : err}
                              </p>

                              {(err === 'email_not_confirmed' || duplicateRegistrationErr) && (
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <button
                                    type="button"
                                    disabled={resending || resendCooldown > 0}
                                    onClick={handleResendVerification}
                                    className="inline-flex items-center justify-center gap-2 border border-red-600 bg-red-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white disabled:opacity-50"
                                  >
                                    <RefreshCw size={13} className={resending ? 'animate-spin' : ''} />
                                    {resendCooldown > 0 ? `Tunggu ${resendCooldown}s` : 'Kirim ulang verifikasi'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => switchMode('login')}
                                    className="inline-flex items-center justify-center gap-2 border border-red-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-red-700"
                                  >
                                    Masuk sekarang
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {ok && (
                        <div className="border border-emerald-200 bg-emerald-50 px-4 py-3">
                          <div className="flex items-start gap-3">
                            <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                            <p className="text-sm leading-6 text-emerald-800">{ok}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {registered ? (
                    <div className="space-y-5">
                      <div className="border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <Inbox size={18} className="mt-0.5 shrink-0 text-[#b66a1f]" />
                          <div>
                            <p className="text-sm font-black text-slate-900">Langkah verifikasi email</p>
                            <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                              <li>1. Buka inbox email bisnis yang dipakai saat registrasi.</li>
                              <li>2. Cari email terbaru dari <span className="font-semibold text-slate-900">{EMAIL_SENDER}</span>.</li>
                              <li>3. Masukkan kode 6 digitnya di bawah ini untuk mengaktifkan akun.</li>
                            </ol>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="block text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                          Kode verifikasi email
                        </label>
                        <div className="relative">
                          <KeyRound size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={verificationCode}
                            onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="Masukkan 6 digit kode"
                            className="w-full border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-4 text-sm font-black tracking-[0.35em] text-slate-900 outline-none transition focus:border-[#b66a1f] focus:bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={openInbox}
                          className="inline-flex items-center justify-center gap-2 border border-slate-900 bg-slate-900 px-4 py-3 text-sm font-black text-white"
                        >
                          Buka inbox
                          <ExternalLink size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={confirming}
                          onClick={handleVerificationCheck}
                          className="inline-flex items-center justify-center gap-2 border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-900 disabled:opacity-50"
                        >
                          {confirming ? <RefreshCw size={15} className="animate-spin" /> : 'Verifikasi kode'}
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={resending || resendCooldown > 0}
                          onClick={handleResendVerification}
                          className="inline-flex items-center justify-center gap-2 border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-700 disabled:opacity-50"
                        >
                          <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
                          {resendCooldown > 0 ? `Kirim ulang ${resendCooldown}s` : 'Kirim ulang email'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            localStorage.removeItem('kaffepos_registered_email');
                            setRegistered(false);
                            setOk('');
                            setErr('');
                            setEmail('');
                            switchMode('register');
                          }}
                          className="inline-flex items-center justify-center gap-2 border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-700"
                        >
                          Ganti email
                        </button>
                      </div>

                      <p className="text-xs leading-6 text-slate-500">
                        Jika email belum terlihat di inbox, cek folder spam atau promosi. Gunakan email verifikasi paling baru
                        agar status akun di Supabase tetap sinkron.
                      </p>
                    </div>
                  ) : (
                    <>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          submit();
                        }}
                        autoComplete="on"
                      >
                        <div className="space-y-3">
                          {mode === 'register' && (
                            <div>
                              <div className="relative">
                                <User size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                  name="username"
                                  autoComplete="organization"
                                  value={uname}
                                  onChange={(event) => setUname(event.target.value)}
                                  placeholder="Nama toko / bisnis"
                                  className={`w-full border bg-slate-50 py-3.5 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:bg-white ${
                                    formErrors.uname ? 'border-red-300' : 'border-slate-200 focus:border-[#b66a1f]'
                                  }`}
                                />
                              </div>
                              {formErrors.uname && <p className="mt-1 text-xs font-semibold text-red-600">{formErrors.uname}</p>}
                            </div>
                          )}

                          {mode !== 'reset' && (
                            <div>
                              <div className="relative">
                                <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                  ref={emailRef}
                                  type="email"
                                  name="email"
                                  id="field-email"
                                  autoComplete="email"
                                  value={email}
                                  onChange={(event) => setEmail(event.target.value)}
                                  placeholder="Email bisnis"
                                  className={`w-full border bg-slate-50 py-3.5 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:bg-white ${
                                    formErrors.email ? 'border-red-300' : 'border-slate-200 focus:border-[#b66a1f]'
                                  }`}
                                />
                              </div>
                              {formErrors.email && <p className="mt-1 text-xs font-semibold text-red-600">{formErrors.email}</p>}
                            </div>
                          )}

                          {mode !== 'forgot' && (
                            <div>
                              <div className="relative">
                                <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                  type={show ? 'text' : 'password'}
                                  name="password"
                                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                                  value={pass}
                                  onChange={(event) => setPass(event.target.value)}
                                  placeholder={mode === 'register' ? 'Password minimal 10 karakter' : 'Password'}
                                  className={`w-full border bg-slate-50 py-3.5 pl-11 pr-12 text-sm text-slate-900 outline-none transition focus:bg-white ${
                                    formErrors.pass ? 'border-red-300' : 'border-slate-200 focus:border-[#b66a1f]'
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShow((current) => !current)}
                                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                                >
                                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              </div>
                              {formErrors.pass && <p className="mt-1 text-xs font-semibold text-red-600">{formErrors.pass}</p>}
                            </div>
                          )}

                          {mode === 'reset' && (
                            <div className="relative">
                              <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type={show ? 'text' : 'password'}
                                name="confirm-password"
                                autoComplete="new-password"
                                value={confirmPass}
                                onChange={(event) => setConfirmPass(event.target.value)}
                                placeholder="Ulangi password baru"
                                className="w-full border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-12 text-sm text-slate-900 outline-none transition focus:border-[#b66a1f] focus:bg-white"
                              />
                            </div>
                          )}
                        </div>

                        {mode === 'login' && (
                          <button
                            type="button"
                            onClick={() => switchMode('forgot')}
                            className="mt-3 text-sm font-bold text-[#b66a1f]"
                          >
                            Lupa password?
                          </button>
                        )}

                        <button
                          type="submit"
                          id="btn-auth-submit"
                          disabled={busy || (mode === 'register' && isInvalid)}
                          className="mt-5 inline-flex w-full items-center justify-center gap-2 border border-[#b66a1f] bg-[#b66a1f] px-4 py-3.5 text-sm font-black text-white disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
                        >
                          {busy ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              {mode === 'login'
                                ? 'Sedang masuk...'
                                : mode === 'register'
                                  ? 'Mendaftarkan akun...'
                                  : mode === 'reset'
                                    ? 'Menyimpan password...'
                                    : 'Mengirim email...'}
                            </>
                          ) : (
                            <>
                              {mode === 'login'
                                ? 'Masuk ke KaffePOS'
                                : mode === 'register'
                                  ? 'Buat akun gratis'
                                  : mode === 'reset'
                                    ? 'Simpan password baru'
                                    : 'Kirim link reset'}
                              <ChevronRight size={17} />
                            </>
                          )}
                        </button>
                      </form>

                      <div className="mt-5 space-y-4">
                        {mode === 'login' && (
                          <button
                            type="button"
                            id="link-check-confirmation"
                            onClick={() => {
                              const registeredEmail = localStorage.getItem('kaffepos_registered_email');
                              if (registeredEmail) {
                                setEmail(registeredEmail);
                                setRegistered(true);
                                setErr('');
                                return;
                              }
                              setErr('Belum ada pendaftaran yang tersimpan di browser ini. Jika sudah daftar, cek inbox email bisnis kamu.');
                            }}
                            className="text-sm font-semibold text-slate-500"
                          >
                            Sudah daftar tapi belum verifikasi?
                          </button>
                        )}

                        {mode === 'register' && (
                          <div className="border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-sm font-black text-slate-900">Setelah daftar, cek inbox email</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              Link verifikasi dikirim ke email bisnis kamu melalui jalur auth yang sama untuk web dan APK.
                              Pengirim yang harus dicari adalah <span className="font-semibold text-slate-900">{EMAIL_SENDER}</span>.
                            </p>
                          </div>
                        )}

                        {mode === 'forgot' && !ok && (
                          <p className="text-sm leading-6 text-slate-500">
                            Jika email belum terlihat, cek folder spam atau promosi. Gunakan email bisnis yang sama saat registrasi.
                          </p>
                        )}

                        {mode === 'reset' && (
                          <div className="border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-sm font-black text-slate-900">Password baru langsung dipakai di semua perangkat</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              Setelah berhasil disimpan, sesi lama akan diminta login ulang agar web dan APK tetap sinkron.
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <p className="px-1 pb-6 pt-4 text-center text-xs leading-6 text-slate-500">
                KaffePOS memakai Supabase Auth untuk session dan verifikasi, dengan pengirim email bisnis di
                <span className="font-semibold text-slate-700"> {EMAIL_SENDER}</span>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
