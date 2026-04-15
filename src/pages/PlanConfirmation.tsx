import { ArrowLeft, CheckCircle2, Instagram } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getBillingCycleLabel,
  getPlanDefinition,
  getPlanPrice,
  formatRupiah,
  INSTAGRAM_ADMIN_URL,
} from '@/lib/subscriptionPlans';

const STEPS = [
  'Chat admin kami di Instagram @kaffepos',
  'Beritahu paket dan periode yang kamu pilih',
  'Admin akan kirimkan nomor rekening',
  'Transfer sesuai nominal dan kirim bukti',
  'Akun kamu akan aktif dalam 1x24 jam',
];

export default function PlanConfirmation() {
  const [params] = useSearchParams();
  const plan = getPlanDefinition(params.get('plan'));
  const billingCycle = params.get('billingCycle') || (plan.isFree ? 'free' : 'monthly');
  const amount = getPlanPrice(plan.id, billingCycle);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7ed_0%,#f8fafc_46%,#e2e8f0_100%)] px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-4 py-2 text-sm font-bold text-slate-600 shadow-sm backdrop-blur"
          >
            <ArrowLeft size={16} />
            Kembali
          </Link>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <div className="p-6 sm:p-8" style={{ background: plan.gradient }}>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-white/70">Konfirmasi Paket</p>
            <h1 className="mt-3 text-3xl font-black text-white">Paket yang kamu pilih</h1>
            <p className="mt-2 max-w-xl text-sm text-white/80">
              Cek detail paketmu dulu, lalu lanjut chat admin untuk proses pembayaran manual.
            </p>
          </div>

          <div className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-900 px-4 py-2 text-sm font-black text-white">
                {plan.name}
              </span>
              <span className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">
                {getBillingCycleLabel(billingCycle)}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">
                {plan.badge}
              </span>
            </div>

            <div className="grid gap-4 rounded-3xl border border-slate-100 bg-slate-50 p-5 sm:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Harga Transfer</p>
                <p className="mt-2 text-3xl font-black text-slate-900">{formatRupiah(amount)}</p>
                <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Fitur Yang Kamu Dapat</p>
                <div className="mt-3 space-y-2">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2 text-sm text-slate-600">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Cara Berlangganan</p>
              <div className="mt-4 space-y-3">
                {STEPS.map((step, index) => (
                  <div key={step} className="flex items-start gap-3 rounded-2xl border border-slate-100 px-4 py-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">
                      {index + 1}
                    </span>
                    <p className="pt-1 text-sm text-slate-600">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={INSTAGRAM_ADMIN_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 text-sm font-black text-white shadow-lg shadow-slate-900/15"
              >
                <Instagram size={18} />
                Chat Admin di Instagram
              </a>
              <Link
                to="/login"
                className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 px-5 py-4 text-sm font-bold text-slate-600"
              >
                Kembali pilih paket
              </Link>
            </div>

            <p className="text-center text-xs text-slate-500">
              Butuh bantuan? DM kami di @kaffepos — kami response dalam jam kerja 09.00-21.00 WIB
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
