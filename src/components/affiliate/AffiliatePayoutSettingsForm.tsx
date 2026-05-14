import { useState } from 'react';
import { trackAnalyticsEvent } from '@/lib/analytics';
import type { AffiliatePayoutInput, AffiliatePayoutInfo } from '@/types/affiliate';
import type { ToastType } from '@/types';

type ToastApi = { showToast: (message: string, type?: ToastType) => void };

type Props = { payoutInfo?: AffiliatePayoutInfo | null; updating: boolean; onSubmit: (payload: AffiliatePayoutInput) => Promise<boolean>; toast: ToastApi };

export default function AffiliatePayoutSettingsForm({ payoutInfo, updating, onSubmit, toast }: Props) {
  const [form, setForm] = useState({ payoutName: String(payoutInfo?.payout_name ?? ''), payoutBankName: String(payoutInfo?.payout_bank_name ?? ''), payoutAccountNumber: '', payoutAccountHolder: String(payoutInfo?.payout_account_holder ?? '') });
  const [touched, setTouched] = useState(false);
  const valid = form.payoutName.trim().length >= 2 && form.payoutBankName.trim().length >= 2 && form.payoutAccountNumber.trim().length >= 4 && form.payoutAccountHolder.trim().length >= 2;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    const ok = await onSubmit(form);
    if (ok) {
      trackAnalyticsEvent('affiliate_payout_updated');
      toast.showToast('Payout berhasil diperbarui.', 'success');
      setForm((prev) => ({ ...prev, payoutAccountNumber: '' }));
    }
  };

  return (
    <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-500">Payout</p>
        <h2 className="mt-2 text-xl font-black text-slate-900">Pengaturan payout</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">Nomor rekening saat ini: {payoutInfo?.payout_account_number_masked || 'Belum tersedia'}</p>
      </div>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama payout" value={form.payoutName} onChange={(value) => setForm((prev) => ({ ...prev, payoutName: value }))} />
        <Field label="Nama bank" value={form.payoutBankName} onChange={(value) => setForm((prev) => ({ ...prev, payoutBankName: value }))} />
        <Field label="Nomor rekening baru" value={form.payoutAccountNumber} inputMode="numeric" placeholder="Isi ulang untuk update" onChange={(value) => setForm((prev) => ({ ...prev, payoutAccountNumber: value }))} />
        <Field label="Nama pemilik rekening" value={form.payoutAccountHolder} onChange={(value) => setForm((prev) => ({ ...prev, payoutAccountHolder: value }))} />
        {touched && !valid && <p className="text-sm font-bold text-rose-600 sm:col-span-2">Lengkapi semua data payout sebelum menyimpan.</p>}
        <div className="sm:col-span-2"><button type="submit" disabled={updating} className="rounded-2xl bg-[#FF6A00] px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60">{updating ? 'Menyimpan...' : 'Simpan Payout'}</button></div>
      </form>
    </section>
  );
}

function Field({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'] }) {
  return (
    <label className="block"><span className="text-sm font-black text-slate-700">{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-50" /></label>
  );
}
