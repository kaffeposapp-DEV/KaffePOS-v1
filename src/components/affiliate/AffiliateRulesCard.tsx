import { ShieldCheck } from 'lucide-react';

const rules = [
  'Affiliate mendapat komisi 20% dari pembayaran pertama customer.',
  'Komisi masuk pending setelah customer berhasil membayar.',
  'Komisi eligible setelah customer aktif 30 hari.',
  'Payout perlu persetujuan admin dan minimal Rp250.000.',
  'Fraud, spam, refund, atau pembatalan bisa membuat komisi ditolak.',
];

export default function AffiliateRulesCard() {
  return (
    <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-[#FF6A00]">
          <ShieldCheck size={22} />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900">Aturan Affiliate</h2>
          <div className="mt-3 grid gap-2 text-sm font-semibold leading-relaxed text-slate-500 sm:grid-cols-2">
            {rules.map((rule) => <p key={rule}>• {rule}</p>)}
          </div>
        </div>
      </div>
    </section>
  );
}
