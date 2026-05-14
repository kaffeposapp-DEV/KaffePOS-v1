import { ShieldCheck } from 'lucide-react';

const rules = [
  'Bagikan link referral kamu ke teman yang ingin mencoba KaffePOS.',
  'Temanmu mendapat diskon 20% untuk bulan pertama.',
  'Kamu mendapat kredit Rp150.000 setelah teman berlangganan dan aktif 30 hari.',
  'Reward bisa ditolak jika ada fraud, refund, cancel, atau self-referral.',
];

export default function ReferralRulesCard() {
  return (
    <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 text-[#FF6A00]">
          <ShieldCheck size={22} />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900">Cara kerja singkat</h2>
          <ul className="mt-3 space-y-2 text-sm font-medium leading-relaxed text-slate-600">
            {rules.map((rule) => (
              <li key={rule} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF6A00]" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
