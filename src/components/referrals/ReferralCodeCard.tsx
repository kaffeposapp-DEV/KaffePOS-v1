import { Copy, Gift, Link2, Share2 } from 'lucide-react';
import { trackAnalyticsEvent } from '@/lib/analytics';
import type { ReferralCode } from '@/types/affiliate';
import type { ToastType } from '@/types';

type ToastApi = { showToast: (message: string, type?: ToastType) => void };

type Props = {
  referralCode: ReferralCode | null | undefined;
  referralLink: string | null | undefined;
  generating: boolean;
  onGenerate: () => Promise<boolean>;
  toast: ToastApi;
};

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export default function ReferralCodeCard({ referralCode, referralLink, generating, onGenerate, toast }: Props) {
  const code = referralCode?.code ?? '';

  const handleGenerate = async () => {
    const ok = await onGenerate();
    if (ok) {
      trackAnalyticsEvent('referral_code_generated');
      toast.showToast('Kode referral berhasil dibuat.', 'success');
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    await copyText(code);
    trackAnalyticsEvent('referral_code_copied');
    toast.showToast('Kode referral disalin.', 'success');
  };

  const handleCopyLink = async () => {
    if (!referralLink) return;
    await copyText(referralLink);
    trackAnalyticsEvent('referral_link_copied');
    toast.showToast('Link referral disalin.', 'success');
  };

  const handleShare = async () => {
    if (!referralLink) return;
    trackAnalyticsEvent('referral_share_clicked');
    if (navigator.share) {
      await navigator.share({
        title: 'Referral KaffePOS',
        text: 'Coba KaffePOS untuk kelola operasional cafe lebih rapi.',
        url: referralLink,
      });
      return;
    }
    await handleCopyLink();
  };

  if (!referralCode) {
    return (
      <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
              <Gift size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Buat kode referral kamu</h2>
              <p className="mt-1 max-w-xl text-sm font-medium leading-relaxed text-slate-500">
                Bagikan link referral kamu dan dapatkan reward saat temanmu mulai berlangganan KaffePOS.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="rounded-2xl bg-[#FF6A00] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? 'Membuat...' : 'Buat Kode Referral'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-500">Kode Referral</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="w-full rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-2xl font-black tracking-[0.18em] text-[#FF6A00] sm:w-auto">
              {code}
            </code>
            <div className="flex gap-2">
              <button type="button" onClick={() => void handleCopyCode()} className="inline-flex items-center gap-2 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-orange-50">
                <Copy size={16} /> Salin Kode
              </button>
              <button type="button" onClick={() => void handleShare()} className="inline-flex items-center gap-2 rounded-2xl bg-[#FF6A00] px-4 py-3 text-sm font-black text-white transition hover:bg-orange-600">
                <Share2 size={16} /> Bagikan
              </button>
            </div>
          </div>
          {referralLink && (
            <div className="mt-4 flex min-w-0 flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-500">
                <Link2 size={16} className="shrink-0 text-orange-500" />
                <span className="truncate">{referralLink}</span>
              </div>
              <button type="button" onClick={() => void handleCopyLink()} className="shrink-0 text-sm font-black text-[#FF6A00] hover:text-orange-700">
                Salin Link
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
