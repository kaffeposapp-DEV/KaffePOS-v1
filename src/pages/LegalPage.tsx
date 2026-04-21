import { ArrowLeft, ExternalLink, FileText, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_URL,
  SUPPORT_INSTAGRAM_URL,
  SUPPORT_WHATSAPP_URL,
} from '../lib/support';

type LegalKind = 'terms' | 'privacy';

interface LegalSection {
  title: string;
  paragraphs: string[];
}

interface LegalDocument {
  eyebrow: string;
  title: string;
  summary: string;
  sections: LegalSection[];
}

const LAST_UPDATED = '19 April 2026';

const LEGAL_CONTENT: Record<LegalKind, LegalDocument> = {
  terms: {
    eyebrow: 'Ketentuan Penggunaan',
    title: 'Ketentuan Penggunaan KaffePOS',
    summary: 'Dokumen ini mengatur penggunaan layanan KaffePOS untuk operasional kasir, backoffice, sinkronisasi data, dan layanan pendukung yang kami sediakan.',
    sections: [
      {
        title: '1. Cakupan layanan',
        paragraphs: [
          'KaffePOS menyediakan aplikasi point of sale, manajemen menu, laporan, sinkronisasi data, dan integrasi printer thermal untuk membantu operasional bisnis pengguna.',
          'Sebagian fitur dapat berubah mengikuti paket berlangganan, pembaruan produk, atau kebutuhan keamanan sistem tanpa menghilangkan fungsi inti yang sudah aktif untuk pelanggan.',
        ],
      },
      {
        title: '2. Tanggung jawab pengguna',
        paragraphs: [
          'Pengguna wajib menjaga kerahasiaan akun, kode OTP, perangkat kasir, serta memastikan data operasional yang dimasukkan ke sistem akurat dan sah digunakan.',
          'Pengguna tidak diperkenankan memakai KaffePOS untuk aktivitas yang melanggar hukum, menyalahgunakan akses akun lain, mengganggu layanan, atau mencoba mengambil data di luar hak aksesnya.',
        ],
      },
      {
        title: '3. Langganan dan pembayaran',
        paragraphs: [
          'Fitur tertentu dapat memerlukan paket berbayar. Tagihan, masa aktif, dan hak akses mengikuti paket yang dipilih pengguna pada saat aktivasi atau perpanjangan.',
          'Apabila terjadi keterlambatan pembayaran, KaffePOS berhak membatasi fitur berbayar sampai status langganan dipulihkan. Kebijakan refund dan dispute mengikuti kebijakan komersial yang berlaku pada saat transaksi.',
        ],
      },
      {
        title: '4. Ketersediaan layanan',
        paragraphs: [
          'Kami berupaya menjaga layanan tetap tersedia, namun pemeliharaan terjadwal, gangguan jaringan, kegagalan pihak ketiga, atau kondisi force majeure dapat menyebabkan layanan tidak sepenuhnya tersedia sementara waktu.',
          'Pengguna disarankan tetap menyiapkan prosedur operasional cadangan yang wajar untuk kondisi offline, kendala printer, atau gangguan perangkat.',
        ],
      },
      {
        title: '5. Pembatasan tanggung jawab',
        paragraphs: [
          'KaffePOS tidak bertanggung jawab atas kehilangan keuntungan, kerugian tidak langsung, atau dampak lanjutan yang timbul dari penggunaan layanan di luar panduan operasional yang wajar.',
          'Tanggung jawab kami dibatasi pada upaya perbaikan layanan, investigasi insiden, dan dukungan yang proporsional sesuai paket dan kanal support yang berlaku.',
        ],
      },
      {
        title: '6. Pengakhiran dan bantuan',
        paragraphs: [
          'Pengguna dapat berhenti menggunakan layanan kapan saja. Kami dapat menangguhkan atau mengakhiri akses akun bila ditemukan pelanggaran keamanan, penyalahgunaan sistem, atau kewajiban komersial yang tidak dipenuhi.',
          'Untuk klarifikasi, komplain, atau kebutuhan bantuan operasional, pengguna dapat menghubungi kanal support resmi KaffePOS yang tercantum pada halaman ini.',
        ],
      },
    ],
  },
  privacy: {
    eyebrow: 'Kebijakan Privasi',
    title: 'Kebijakan Privasi KaffePOS',
    summary: 'Dokumen ini menjelaskan data yang diproses KaffePOS, tujuan penggunaannya, serta langkah perlindungan yang kami terapkan untuk layanan web dan APK Android.',
    sections: [
      {
        title: '1. Data yang diproses',
        paragraphs: [
          'Kami dapat memproses data akun seperti nama, email, profil usaha, data transaksi, inventaris, aktivitas login, log notifikasi, serta metadata teknis yang diperlukan untuk menjaga layanan tetap berjalan.',
          'Beberapa data operasional juga dapat tersimpan lokal di perangkat secara offline untuk menjaga kelangsungan penggunaan saat koneksi tidak stabil, lalu disinkronkan kembali ketika koneksi tersedia.',
        ],
      },
      {
        title: '2. Tujuan penggunaan data',
        paragraphs: [
          'Data diproses untuk autentikasi, sinkronisasi operasional toko, pengiriman OTP atau notifikasi transaksi, analitik operasional dasar, pemulihan akun, dan peningkatan reliabilitas layanan.',
          'Kami tidak menjual data pribadi pengguna ke pihak ketiga untuk tujuan iklan pihak ketiga.',
        ],
      },
      {
        title: '3. Perlindungan data',
        paragraphs: [
          'Kami menggunakan kontrol akses berbasis akun, pembatasan service role pada backend, enkripsi jalur komunikasi, serta pencatatan insiden operasional untuk membantu mendeteksi penyalahgunaan dan gangguan layanan.',
          'Meski demikian, tidak ada sistem yang sepenuhnya bebas risiko. Pengguna tetap perlu menjaga keamanan perangkat, email, dan kredensial akunnya sendiri.',
        ],
      },
      {
        title: '4. Penyedia pihak ketiga',
        paragraphs: [
          'KaffePOS saat ini menggunakan penyedia infrastruktur pihak ketiga seperti Contabo, Coolify, Cloudflare, Resend, dan Firebase Crashlytics ketika fitur pemantauan APK diaktifkan.',
          'Pemrosesan oleh pihak ketiga mengikuti kebutuhan operasional layanan dan kebijakan mereka masing-masing sejauh relevan dengan fungsi KaffePOS.',
        ],
      },
      {
        title: '5. Retensi data dan hak pengguna',
        paragraphs: [
          'Data disimpan selama diperlukan untuk operasional layanan, kepatuhan, penyelesaian sengketa, audit keamanan, dan dukungan pelanggan sesuai kebutuhan bisnis yang wajar.',
          'Pengguna dapat meminta pembaruan data akun, klarifikasi penggunaan data, atau bantuan penutupan akun melalui kanal support resmi KaffePOS.',
        ],
      },
      {
        title: '6. Kontak privasi dan support',
        paragraphs: [
          'Jika ada pertanyaan mengenai privasi, insiden akun, atau permintaan bantuan terkait data, silakan hubungi KaffePOS melalui email atau WhatsApp resmi yang tercantum di bawah.',
        ],
      },
    ],
  },
};

const CONTACT_LINKS = [
  {
    label: 'Email Support',
    href: SUPPORT_EMAIL_URL,
    value: SUPPORT_EMAIL,
  },
  {
    label: 'WhatsApp Support',
    href: SUPPORT_WHATSAPP_URL,
    value: 'Chat Admin KaffePOS',
  },
  {
    label: 'Instagram KaffePOS',
    href: SUPPORT_INSTAGRAM_URL,
    value: '@kaffepos',
  },
];

export default function LegalPage({ kind }: { kind: LegalKind }) {
  const navigate = useNavigate();
  const legalDocument = LEGAL_CONTENT[kind];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-10">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-700 hover:bg-slate-800"
          >
            <ArrowLeft size={16} />
            Kembali
          </button>
          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
            {kind === 'terms' ? <FileText size={14} /> : <Shield size={14} />}
            Terakhir diperbarui {LAST_UPDATED}
          </div>
        </div>

        <div className="mt-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-400">
            {legalDocument.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">
            {legalDocument.title}
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
            {legalDocument.summary}
          </p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <div className="space-y-4">
            {legalDocument.sections.map((section) => (
              <section
                key={section.title}
                className="rounded-lg border border-slate-800 bg-slate-900/70 p-5 sm:p-6"
              >
                <h2 className="text-lg font-bold text-white">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
                  {section.paragraphs.map((paragraph, index) => (
                    <p key={`${section.title}-${index}`}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="rounded-lg border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
            <p className="text-sm font-bold text-white">Kontak resmi KaffePOS</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Hubungi kanal resmi berikut untuk bantuan operasional, isu akun, atau pertanyaan privasi.
            </p>
            <div className="mt-5 space-y-3">
              {CONTACT_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 transition hover:border-slate-700 hover:bg-slate-900"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{link.label}</p>
                    <p className="mt-1 text-xs text-slate-400">{link.value}</p>
                  </div>
                  <ExternalLink size={15} className="mt-0.5 shrink-0 text-slate-400" />
                </a>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
