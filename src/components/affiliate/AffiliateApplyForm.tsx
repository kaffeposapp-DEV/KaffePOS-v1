import { useState } from 'react';
import { trackAnalyticsEvent } from '@/lib/analytics';
import type { AffiliateApplyInput } from '@/types/affiliate';
import type { ToastType } from '@/types';

type ToastApi = { showToast: (message: string, type?: ToastType) => void };
type Props = { submitting: boolean; onSubmit: (payload: AffiliateApplyInput) => Promise<boolean>; toast: ToastApi };

const initial = { payoutName: '', payoutBankName: '', payoutAccountNumber: '', payoutAccountHolder: '', acceptedTerms: false };

export default function AffiliateApplyForm({ submitting, onSubmit, toast }: Props) {
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState(false);
  const valid = form.payoutName.trim().length >= 2 && form.payoutBankName.trim().length >= 2 && form.payoutAccountNumber.trim().length >= 4 && form.payoutAccountHolder.trim().length >= 2 && form.acceptedTerms;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const ok = await onSubmit({ ...form, termsVersion: 'v1', acceptedTerms: true });
    if (ok) {
      trackAnalyticsEvent('affiliate_application_submitted');
      toast.showToast('Pengajuan affiliate berhasil dikirim.', 'success');
      setForm(initial);
    }
  };

  return (
    <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-500">Daftar Affiliate</p>
        <h2 className="mt-2 text-xl font-black text-slate-900">Mulai jadi partner KaffePOS</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">Lengkapi data payout. Nomor rekening disimpan aman oleh backend.</p>
      </div>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama payout" value={form.payoutName} onFocus={() => trackAnalyticsEvent('affiliate_application_started')} onChange={(value) => setForm((prev) => ({ ...prev, payoutName: value }))} />
        <Field label="Nama bank" value={form.payoutBankName} onChange={(value) => setForm((prev) => ({ ...prev, payoutBankName: value }))} />
        <Field label="Nomor rekening" value={form.payoutAccountNumber} inputMode="numeric" onChange={(value) => setForm((prev) => ({ ...prev, payoutAccountNumber: value }))} />
        <Field label="Nama pemilik rekening" value={form.payoutAccountHolder} onChange={(value) => setForm((prev) => ({ ...prev, payoutAccountHolder: value }))} />
        <label className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-semibold text-slate-600 sm:col-span-2">
          <input type="checkbox" checked={form.acceptedTerms} onChange={(event) => setForm((prev) => ({ ...prev, acceptedTerms: event.target.checked }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#FF6A00]" />
          Saya menyetujui syarat affiliate KaffePOS dan memahami payout wajib melewati review admin.
        </label>
        {touched && !valid && <p className="text-sm font-bold text-rose-600 sm:col-span-2">Lengkapi semua field dan setujui syarat affiliate.</p>}
        <div className="sm:col-span-2">
          <button type="submit" disabled={submitting} className="rounded-2xl bg-[#FF6A00] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? 'Mengirim...' : 'Daftar Affiliate'}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({ label, value, onChange, onFocus, inputMode }: { label: string; value: string; onChange: (value: string) => void; onFocus?: () => void; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'] }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input value={value} onFocus={onFocus} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-50" />
    </label>
  );
}
