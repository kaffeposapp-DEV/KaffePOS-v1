import { Copy, Link2, Share2 } from 'lucide-react';
import { trackAnalyticsEvent } from '@/lib/analytics';
import type { ToastType } from '@/types';

type ToastApi = { showToast: (message: string, type?: ToastType) => void };

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
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

export default function AffiliateLinkCard({ code, link, toast }: { code?: string | null; link?: string | null; toast: ToastApi }) {
  if (!code && !link) return null;

  const copyCode = async () => {
    if (!code) return;
    await copyText(code);
    trackAnalyticsEvent('affiliate_code_copied');
    toast.showToast('Kode affiliate disalin.', 'success');
  };
  const copyLink = async () => {
    if (!link) return;
    await copyText(link);
    trackAnalyticsEvent('affiliate_link_copied');
    toast.showToast('Link affiliate disalin.', 'success');
  };
  const share = async () => {
    if (!link) return;
    trackAnalyticsEvent('affiliate_share_clicked');
    if (navigator.share) {
      await navigator.share({ title: 'Affiliate KaffePOS', text: 'Coba KaffePOS lewat link affiliate saya.', url: link });
      return;
    }
    await copyLink();
  };

  return (
    <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-500">Link Affiliate</p>
      {code && <code className="mt-3 inline-flex rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-2xl font-black tracking-[0.18em] text-[#FF6A00]">{code}</code>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyCode()} className="inline-flex items-center gap-2 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-orange-50"><Copy size={16} /> Salin Kode</button>
        <button type="button" onClick={() => void copyLink()} className="inline-flex items-center gap-2 rounded-2xl border border-orange-100 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-orange-50"><Link2 size={16} /> Salin Link</button>
        <button type="button" onClick={() => void share()} className="inline-flex items-center gap-2 rounded-2xl bg-[#FF6A00] px-4 py-3 text-sm font-black text-white hover:bg-orange-600"><Share2 size={16} /> Bagikan</button>
      </div>
      {link && <p className="mt-4 truncate rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">{link}</p>}
    </section>
  );
}
