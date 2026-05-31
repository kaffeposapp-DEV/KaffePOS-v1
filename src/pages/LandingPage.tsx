import { useState, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store,
  Zap,
  ArrowRight,
  Menu,
  X,
  ArrowUp,
  Coffee,
  Lock,
  Instagram,
  MessageCircle,
  HelpCircle,
  Wifi,
  Shield,
  FileText,
  FileCheck,
  Scale,
  ShoppingBag,
  Cloud,
  Trophy,
  Brain,
  Printer,
  ChefHat,
  Star,
  Gift,
  BadgePercent,
  CreditCard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import PricingPage from '@/components/subscription/PricingPage';
import type { BillingCycle, SubscriptionPlanId } from '@/lib/subscriptionPlans';
import LOGO_ICON from '@/assets/logo-kaffeposappicon.svg';
import { useModalBehavior } from '@/hooks/useModalBehavior';

const NAV_LINKS = [
  { name: 'Beranda', href: '#top' },
  { name: 'Fitur', href: '#features' },
  { name: 'Harga', href: '#pricing' },
  { name: 'Tentang', href: '#about' },
  { name: 'Kontak', href: '#contact' },
];

type FeatureTitle =
  | 'POS Offline First'
  | 'Gamification Seru'
  | 'Kopi Passport Loyalty'
  | 'AI Insights'
  | 'Inventory + Resep + KDS'
  | 'Thermal Printer Ready';

type SafeContentKey = 'ADVISORY' | 'TERMS' | 'PRIVACY' | 'AUDIT';

type MarketingFeature = {
  title: string;
  desc: string;
  icon: LucideIcon;
  color: string;
};

type FeatureDetail = {
  highlights: string[];
  details: string;
  stats: {
    metric: string;
    value: string;
  };
  icon: LucideIcon;
};

type SafeContentItem = {
  icon: LucideIcon;
  description: string;
  points: Array<{
    title: string;
    detail: string;
  }>;
};

const PRICING = [
  {
    name: 'Secangkir',
    price: 'Gratis',
    period: '14 hari',
    desc: 'Gratis 14 hari full akses Signature. Otomatis Rp49.000/bulan setelah trial berakhir.',
    features: ['Full akses Signature', 'Gamification', 'AI Insights', 'Loyalty advanced'],
    color: 'border-slate-100 bg-white'
  },
  {
    name: 'Kopi Susu',
    price: '49rb',
    period: '/bulan',
    desc: 'Semua yang dibutuhkan cafe kecil: unlimited transaksi, printer thermal, dan loyalty dasar.',
    features: ['Transaksi unlimited', 'Printer thermal', 'Inventory + resep', 'Loyalty dasar'],
    color: 'border-slate-100 bg-white'
  },
  {
    name: 'Signature',
    price: '129rb',
    period: '/bulan',
    desc: 'Paling Populer: full gamification, Kopi Passport lengkap, AI Insights, dan Notification Center.',
    features: ['Full Gamification', 'Kopi Passport lengkap', 'AI Insights', 'Notification Center'],
    color: 'border-[#FF6A00]/20 bg-orange-50/30'
  }
];

const BENEFITS = [
  {
    title: 'Mulai hemat dari Rp49.000/bulan',
    desc: 'Biaya ringan untuk cafe kecil, warung kopi, booth, sampai brand yang mulai punya cabang.',
    icon: BadgePercent,
  },
  {
    title: 'Gratis 14 hari Full Signature',
    desc: 'Coba fitur premium lengkap dulu: Gamification, AI Insights, Kopi Passport, KDS, dan laporan.',
    icon: Gift,
  },
  {
    title: 'Tim makin semangat jualan',
    desc: 'Misi, poin, level, dan leaderboard bikin operasional terasa lebih hidup tanpa ribet.',
    icon: Trophy,
  },
];

const PAYMENT_FLOW_STEPS = [
  'Buat akun atau login ke KaffePOS.',
  'Pilih paket Kopi Susu atau Signature di halaman harga.',
  'Lanjut ke checkout langganan dan pilih metode pembayaran.',
  'Sistem membuat transaksi server-side lalu mengarahkan ke Duitku Sandbox.',
  'Status pembayaran dikonfirmasi melalui callback/check transaction di sisi server.',
];

const SUPPORT_CONTACT = [
  { label: 'Email', value: 'help@kaffepos.my.id', href: 'mailto:help@kaffepos.my.id' },
  { label: 'Phone', value: '0851-8607-6224', href: 'tel:+6285186076224' },
  {
    label: 'Business Address',
    value: 'Jl. Bhayangkara, Indra Kasih, Kec. Medan Tembung, Kota Medan, Sumatera Utara 20221',
  },
];

const FEATURES: MarketingFeature[] = [
  {
    title: 'POS Offline First',
    desc: 'Transaksi tetap jalan saat internet putus. Data otomatis sync saat online kembali.',
    icon: ShoppingBag,
    color: 'bg-orange-50 text-[#FF6A00]',
  },
  {
    title: 'Gamification Seru',
    desc: 'Poin, level, misi harian, dan leaderboard untuk bikin kasir lebih engaged.',
    icon: Trophy,
    color: 'bg-orange-50 text-[#FF6A00]',
  },
  {
    title: 'Kopi Passport Loyalty',
    desc: 'Stamp, poin, tier pelanggan, dan reward yang terasa cocok untuk cafe Indonesia.',
    icon: Gift,
    color: 'bg-orange-50 text-[#FF6A00]',
  },
  {
    title: 'AI Insights',
    desc: 'Baca tren revenue, menu terlaris, peak hour, dan rekomendasi operasional.',
    icon: Brain,
    color: 'bg-orange-50 text-[#FF6A00]',
  },
  {
    title: 'Inventory + Resep + KDS',
    desc: 'Stok bahan otomatis terpotong dari resep, pesanan masuk ke Kitchen Display.',
    icon: ChefHat,
    color: 'bg-orange-50 text-[#FF6A00]',
  },
  {
    title: 'Thermal Printer Ready',
    desc: 'Cetak struk cepat di tablet Android, mobile, dan desktop dengan alur kasir rapi.',
    icon: Printer,
    color: 'bg-orange-50 text-[#FF6A00]',
  },
];

const FEATURE_DETAILS: Record<FeatureTitle, FeatureDetail> = {
  'POS Offline First': {
    highlights: ['Offline Checkout', 'Auto Sync', 'Digital Receipt', 'Tablet POS Mode'],
    details: 'Kasir tetap bisa transaksi saat internet putus. Order tersimpan aman di perangkat lalu tersinkron otomatis saat koneksi kembali tersedia.',
    stats: { metric: 'Internet Putus', value: 'Tetap Jualan' },
    icon: Wifi,
  },
  'Gamification Seru': {
    highlights: ['Daily Mission', 'Leaderboard', 'Level & Points', 'Staff Motivation'],
    details: 'KaffePOS bikin tim kasir lebih semangat lewat misi, poin, level, dan leaderboard yang mudah dipahami.',
    stats: { metric: 'Team Energy', value: 'Naik' },
    icon: Trophy,
  },
  'Kopi Passport Loyalty': {
    highlights: ['Stamp Digital', 'Poin Pelanggan', 'Reward', 'Tier Loyalty'],
    details: 'Program loyalty terasa natural untuk cafe: pelanggan kumpulkan stamp, poin, dan reward tanpa kartu fisik.',
    stats: { metric: 'Repeat Order', value: 'Lebih Mudah' },
    icon: Gift,
  },
  'AI Insights': {
    highlights: ['Revenue Trend', 'Top Menu', 'Peak Hour', 'Smart Recommendation'],
    details: 'AI Insights membantu membaca pola penjualan, menu terlaris, jam ramai, dan rekomendasi praktis untuk keputusan harian.',
    stats: { metric: 'Decision', value: 'Lebih Cepat' },
    icon: Brain,
  },
  'Inventory + Resep + KDS': {
    highlights: ['Recipe Stock Deduction', 'COGS Visibility', 'Kitchen Display', 'Low Stock Alert'],
    details: 'Setiap menu bisa punya resep. Saat transaksi terjadi, bahan otomatis berkurang dan pesanan bisa masuk ke Kitchen Display.',
    stats: { metric: 'Dapur & Stok', value: 'Sinkron' },
    icon: ChefHat,
  },
  'Thermal Printer Ready': {
    highlights: ['58mm / 80mm Preview', 'Android Tablet Friendly', 'Digital Receipt', 'Fast Checkout'],
    details: 'Struk digital dan printer thermal disiapkan untuk operasional kasir harian di mobile, tablet, dan desktop.',
    stats: { metric: 'Receipt', value: 'Siap Cetak' },
    icon: Printer,
  },
};

const PROMOTIONAL_TEXTS = {
  shortTaglines: [
    'Kasir cafe paling seru di Indonesia.',
    'POS murah, fiturnya serius.',
    'Jualan rapi, tim makin happy.',
  ],
  longTagline:
    'KaffePOS membantu cafe jualan lebih cepat, stok lebih rapi, tim lebih semangat, dan keputusan bisnis lebih pintar mulai dari Rp49.000/bulan.',
  instagramCaption:
    'Cafe kamu butuh kasir yang bukan cuma buat transaksi? Kenalan dengan KaffePOS: POS offline-first, Gamification paling seru, Kopi Passport Loyalty, AI Insights, Inventory resep + KDS, dan thermal printer. Coba gratis 14 hari Full Signature. Mulai dari Rp49.000/bulan.',
  whatsappCaption:
    'Halo, kami lagi buka akses KaffePOS untuk cafe owner. Fiturnya lengkap: kasir offline-first, stok resep, KDS, loyalty, gamification, AI Insights, laporan PDF, dan printer thermal. Ada trial 14 hari Full Signature, lalu mulai Rp49.000/bulan.',
  launchPromo:
    'Promo Early Bird: daftar saat launch dan nikmati akses prioritas, onboarding beta, serta harga awal yang ramah untuk cafe pertama kamu.',
};

const CLOSED_BETA_INVITES = {
  whatsapp:
    'Halo Kak, KaffePOS sedang membuka Closed Beta untuk 10-20 cafe owner. Kakak bisa coba gratis 14 hari Full Signature: POS, Gamification, Kopi Passport Loyalty, AI Insights, Inventory resep + KDS, Offline Mode, dan Thermal Printer. Sebagai beta user, feedback Kakak akan langsung membantu kami memoles produk sebelum rilis publik. Mau kami aktifkan aksesnya?',
  emailSubject: 'Undangan Closed Beta KaffePOS untuk Cafe Owner',
  emailBody:
    'Halo Kak,\n\nKami mengundang Kakak bergabung dalam Closed Beta KaffePOS, sistem kasir cafe dengan POS offline-first, Gamification, Kopi Passport Loyalty, AI Insights, Inventory resep + KDS, laporan PDF, dan thermal printer.\n\nSelama beta, Kakak mendapatkan trial 14 hari Full Signature dan akses prioritas untuk memberi feedback langsung ke tim KaffePOS.\n\nJika berkenan, balas email ini dan kami bantu aktifkan aksesnya.\n\nSalam hangat,\nTim KaffePOS',
};

void PROMOTIONAL_TEXTS;
void CLOSED_BETA_INVITES;

function getFeatureDetail(title: string): FeatureDetail {
  return FEATURE_DETAILS[title as FeatureTitle] ?? {
    highlights: ['Mudah dipakai', 'Sinkronisasi aman', 'Siap operasional', 'Dukungan lintas perangkat'],
    details: 'Fitur ini dirancang agar operasional harian tetap cepat, rapi, dan mudah dipahami oleh tim.',
    stats: { metric: 'Ready', value: 'POS' },
    icon: HelpCircle,
  };
}

const SAFE_CONTENT: Record<SafeContentKey, SafeContentItem> = {
  ADVISORY: {
    icon: Scale,
    description: 'Layanan konsultasi strategis untuk mitra KaffePOS guna mengoptimalkan operasional bisnis dan efisiensi finansial.',
    points: [
      { title: 'Optimasi Menu', detail: 'Analisis profitabilitas berbasis AI untuk membantu membaca menu mana yang paling laku.' },
      { title: 'Manajemen Biaya', detail: 'Saran pengelolaan HPP dan pengeluaran operasional outlet.' },
      { title: 'Ekspansi Bisnis', detail: 'Panduan pembukaan cabang baru dengan sistem tersentralisasi.' },
    ],
  },
  TERMS: {
    icon: FileText,
    description: 'Ketentuan penggunaan platform KaffePOS yang mengatur hak dan kewajiban antara penyedia layanan dan pengguna.',
    points: [
      { title: 'Lisensi Perangkat', detail: 'Aturan mengenai penggunaan aplikasi pada satu atau lebih terminal kasir.' },
      { title: 'Pembayaran & Langganan', detail: 'Ketentuan siklus tagihan dan kebijakan pengembalian dana.' },
      { title: 'Tanggung Jawab Pengguna', detail: 'Kewajiban menjaga kerahasiaan kredensial dan keakuratan data.' },
    ],
  },
  PRIVACY: {
    icon: Shield,
    description: 'Komitmen kami dalam melindungi data pribadi Anda dan riwayat transaksi outlet secara aman dan transparan.',
    points: [
      { title: 'Perlindungan Data', detail: 'Akses data dibatasi per akun dan toko, serta koneksi ke server berjalan melalui kanal aman.' },
      { title: 'Kebijakan Penggunaan', detail: 'Data Anda tidak dijual dan tidak dibagikan ke pihak ketiga di luar kebutuhan operasional layanan.' },
      { title: 'Hak Akses Data', detail: 'Anda tetap memiliki kendali untuk melihat, mengoreksi, atau mengekspor data bisnis yang tersedia di akun Anda.' },
    ],
  },
  AUDIT: {
    icon: FileCheck,
    description: 'Sistem audit berkelanjutan untuk memastikan stabilitas platform dan integritas data finansial Anda.',
    points: [
      { title: 'Riwayat Transaksi', detail: 'Audit trail membantu melacak perubahan penting pada stok, penjualan, dan status akun.' },
      { title: 'Keamanan Infrastruktur', detail: 'Pengecekan internal rutin dilakukan untuk menutup akses yang tidak perlu pada server dan fungsi sensitif.' },
      { title: 'Validasi Server', detail: 'Aksi penting seperti verifikasi akun dan aktivasi langganan diproses melalui validasi server-side.' },
    ],
  },
};

const TESTIMONIALS = [
  {
    name: 'Owner Cafe Beta',
    handle: 'Closed Beta Participant',
    body: 'Placeholder testimonial: POS terasa cepat, trial full fitur membantu tim mencoba semua alur sebelum berlangganan.',
    rating: 5,
  },
  {
    name: 'Head Barista Beta',
    handle: 'Closed Beta Participant',
    body: 'Placeholder testimonial: Gamification bikin shift lebih seru, leaderboard jadi bahan evaluasi harian yang ringan.',
    rating: 5,
  },
  {
    name: 'Manager Outlet Beta',
    handle: 'Closed Beta Participant',
    body: 'Placeholder testimonial: inventory resep dan KDS membantu dapur tetap sinkron dengan kasir.',
    rating: 5,
  },
];

const FAQS = [
  {
    q: 'Apakah benar gratis 14 hari?',
    a: 'Ya. Trial Secangkir membuka Full Signature selama 14 hari, jadi cafe bisa mencoba fitur premium sebelum lanjut ke paket berbayar.',
  },
  {
    q: 'Mulai bayar dari berapa?',
    a: 'Paket Kopi Susu mulai Rp49.000/bulan. Paket Signature tersedia untuk cafe yang ingin Gamification, AI Insights, dan fitur lanjutan.',
  },
  {
    q: 'Bisa dipakai saat internet mati?',
    a: 'Bisa. POS, cart, transaksi offline, dan sinkronisasi dibuat offline-first. Data dikirim otomatis saat koneksi kembali stabil.',
  },
  {
    q: 'Apakah support printer thermal?',
    a: 'Ya. KaffePOS disiapkan untuk printer thermal 58mm/80mm, termasuk alur Android tablet untuk kasir.',
  },
  {
    q: 'Apakah cocok untuk cafe kecil?',
    a: 'Cocok. KaffePOS dibuat agar cafe kecil bisa mulai murah, lalu upgrade saat transaksi dan tim makin berkembang.',
  },
];

void PRICING;


function DashboardPreview() {
  const chartBars = [32, 44, 38, 52, 68, 48, 59, 76, 62, 84, 95, 118];
  const topProducts = ['Americano', 'Latte', 'Cappuccino', 'Caramel Macchiato'];

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_26px_80px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2" aria-label="KaffePOS dashboard">
          <img src={LOGO_ICON} alt="" className="h-7 w-7 object-contain" />
          <span className="text-sm font-extrabold text-slate-900">Kaffe<span className="text-[#FF6A00]">POS</span></span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <div className="h-8 w-8 rounded-full bg-slate-100" />
          <div>
            <p className="text-xs font-bold text-slate-700">Barista</p>
            <p className="text-[10px] text-slate-400">Pemilik</p>
          </div>
        </div>
      </div>
      <div className="grid min-h-[360px] grid-cols-1 sm:grid-cols-[150px_1fr] bg-slate-50/60">
        <div className="hidden border-r border-slate-100 bg-white p-4 sm:block">
          {['Dashboard', 'Penjualan', 'Produk', 'Stok', 'Pelanggan', 'Laporan'].map((item, index) => (
            <div
              key={item}
              className={`mb-2 flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold ${
                index === 0 ? 'bg-orange-50 text-[#FF6A00]' : 'text-slate-500'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${index === 0 ? 'bg-[#FF6A00]' : 'bg-slate-200'}`} />
              {item}
            </div>
          ))}
        </div>
        <div className="p-4 sm:p-5">
          <p className="mb-4 text-sm font-extrabold text-slate-900">Ringkasan</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Penjualan Hari Ini', 'Rp 2.450.000', '+12.5%'],
              ['Transaksi', '128', '+8.2%'],
              ['Pelanggan Baru', '25', '+15.4%'],
              ['Produk Terjual', '320', '+10.1%'],
            ].map(([label, value, growth]) => (
              <div key={label} className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400">{label}</p>
                <p className="mt-2 text-sm font-extrabold text-slate-900 sm:text-base">{value}</p>
                <p className="mt-1 text-[10px] font-bold text-emerald-600">{growth} dari kemarin</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
            <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-extrabold text-slate-900">Grafik Penjualan</p>
              <div className="mt-5 flex h-36 items-end gap-2 border-b border-l border-slate-100 pl-2">
                {chartBars.map((height, index) => (
                  <div
                    key={`${height}-${index}`}
                    className="flex-1 rounded-t bg-[#FF6A00]"
                    style={{ height: `${height}px`, opacity: 0.45 + index / 24 }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-extrabold text-slate-900">Penjualan Terlaris</p>
              <div className="space-y-3">
                {topProducts.map((item, index) => (
                  <div key={item} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-orange-100" />
                      <span className="truncate text-xs font-bold text-slate-700">
                        {index + 1}. {item}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-500">{120 - index * 18}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileCheckoutPreview() {
  const rows = [
    ['Americano', 'Rp 18.000'],
    ['Latte', 'Rp 22.000'],
    ['Cappuccino', 'Rp 22.000'],
    ['Caramel Macchiato', 'Rp 24.000'],
  ];

  return (
    <div className="w-[210px] overflow-hidden rounded-[30px] border-[8px] border-slate-900 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
      <div className="flex items-center justify-between px-4 py-3 text-[10px] font-bold text-slate-900">
        <span>16:04</span>
        <span className="h-4 w-16 rounded-full bg-slate-900" />
      </div>
      <div className="border-t border-slate-100 px-4 pb-4 pt-3">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-extrabold text-slate-900">Transaksi Baru</span>
          <span className="text-slate-400">•••</span>
        </div>
        <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
          Cari produk
        </div>
        <div className="space-y-3">
          {rows.map(([name, price]) => (
            <div key={name} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-orange-100" />
                <div>
                  <p className="text-[11px] font-bold text-slate-900">{name}</p>
                  <p className="text-[9px] text-slate-400">1 item</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-700">{price}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs font-bold text-slate-500">Total</span>
          <span className="text-sm font-extrabold text-slate-900">Rp 86.000</span>
        </div>
        <button type="button" className="mt-4 h-10 w-full rounded-lg bg-[#FF6A00] text-xs font-extrabold text-white">
          Bayar
        </button>
      </div>
    </div>
  );
}

function LandingDeviceShowcase() {
  return (
    <div data-testid="reference-device-showcase" className="relative mx-auto w-full max-w-[760px]">
      <div className="absolute -right-8 top-16 hidden h-52 w-52 rounded-full bg-orange-100/70 lg:block" aria-hidden="true" />
      <DashboardPreview />
      <div className="absolute -bottom-8 -right-2 hidden md:block lg:-right-16">
        <MobileCheckoutPreview />
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showDownloadWarning, setShowDownloadWarning] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<MarketingFeature | null>(null);
  const [isFeatureDetailOpen, setIsFeatureDetailOpen] = useState(false);
  const [selectedSafeItem, setSelectedSafeItem] = useState<SafeContentKey | null>(null);
  const [isSafeDetailOpen, setIsSafeDetailOpen] = useState(false);
  const [pricingCycle, setPricingCycle] = useState<Exclude<BillingCycle, 'free'>>('yearly');

  useEffect(() => {
    // Sync URL for unauthenticated users hitting root
    if (window.location.pathname === '/' || window.location.pathname === '') {
      window.history.replaceState({}, '', '/welcome');
    }

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
      setShowScrollTop(window.scrollY > 500);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [mobileMenuOpen]);

  const scrollToTarget = (id: string) => {
    const targetId = id.replace('#', '');
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      setMobileMenuOpen(false);
    }
  };

  const scrollToSection = (e: ReactMouseEvent<HTMLElement>, id: string) => {
    e.preventDefault();
    scrollToTarget(id);
  };

  const handleDownload = (e: ReactMouseEvent<HTMLElement>) => {
    e.preventDefault();
    if (!isAuthenticated) {
      setShowDownloadWarning(true);
    } else {
      // Trigger actual download
      const link = document.createElement('a');
      link.href = '/downloads/kaffepos-latest.apk';
      link.download = 'kaffepos-v2.apk';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleFeatureClick = (feature: MarketingFeature) => {
    setSelectedFeature(feature);
    setIsFeatureDetailOpen(true);
  };

  const closeDownloadWarning = () => setShowDownloadWarning(false);
  const closeFeatureDetail = () => setIsFeatureDetailOpen(false);
  const closeSafeDetail = () => setIsSafeDetailOpen(false);
  const downloadModal = useModalBehavior<HTMLDivElement>({
    open: showDownloadWarning,
    onClose: closeDownloadWarning,
  });
  const featureModal = useModalBehavior<HTMLDivElement>({
    open: isFeatureDetailOpen,
    onClose: closeFeatureDetail,
  });
  const safeModal = useModalBehavior<HTMLDivElement>({
    open: isSafeDetailOpen,
    onClose: closeSafeDetail,
  });

  const handlePricingSelect = (plan: SubscriptionPlanId, cycle: BillingCycle) => {
    if (plan === 'secangkir') {
      navigate('/register');
      return;
    }
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(`/plan-confirmation?plan=${plan}&billingCycle=${cycle}`)}`);
      return;
    }
    navigate(`/plan-confirmation?plan=${plan}&billingCycle=${cycle}`);
  };

  void handleDownload;
  void handleFeatureClick;

  const BRAND_ACCENT = '#FF6A00';

  return (
    <div id="top" className="kaffe-app-bg min-h-screen text-slate-900 font-sans selection:bg-[#FF6A00]/20 overflow-x-hidden">

      {/* WCAG Skip Link */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-white focus:text-black focus:px-6 focus:py-3 focus:rounded-xl focus:font-black">
        Skip to main content
      </a>

      {/* Persistent Background Layer */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Navbar */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/95 backdrop-blur-xl border-b border-slate-200/70 py-3 shadow-sm'
          : 'bg-white/90 backdrop-blur-xl border-b border-slate-100 py-4'
      }`}>
        <nav className="max-w-[1400px] mx-auto px-6 md:px-12 flex items-center justify-between" aria-label="Main Navigation">
          <button
            type="button"
            className="flex items-center gap-4 cursor-pointer group focus-visible:ring-4 focus-visible:ring-[#FF6A00]/50 outline-none rounded-2xl transition-all text-left"
            onClick={() => scrollToTarget('#top')}
          >
            <div className="flex items-center gap-3 group-hover:scale-105 transition-transform duration-500 ease-out">
              <img
                src={LOGO_ICON}
                alt=""
                className="h-10 w-10 object-contain md:h-11 md:w-11"
                loading="eager"
              />
              <span className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-[28px]">
                Kaffe<span className="text-[#FF6A00]">POS</span>
              </span>
            </div>
          </button>

          {/* Desktop Navigation */}
          <ul className="hidden lg:flex items-center gap-10 list-none">
            {NAV_LINKS.map(link => (
              <li key={link.name}>
                <a
                  href={link.href}
                  onClick={(e) => scrollToSection(e, link.href)}
                  className={`text-[15px] font-bold transition-all focus-visible:text-[#FF6A00] outline-none py-2 px-1 relative group ${
                    isScrolled ? 'text-slate-600 hover:text-slate-900' : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  {link.name}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#FF6A00] rounded-full transition-all group-hover:w-full" />
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden md:flex items-center gap-5">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => navigate('/')}
                className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-lg text-[14px] font-bold transition-all shadow-sm group flex items-center gap-2"
              >
                Dashboard <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-slate-600 hover:text-slate-900 px-4 py-2.5 text-[14px] font-bold transition-all rounded-lg"
                >
                  Masuk
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="bg-[#FF6A00] hover:bg-[#FF8A1C] text-white px-6 py-3 rounded-lg text-[14px] font-extrabold transition-all shadow-[0_10px_24px_rgba(255,106,0,0.2)]"
                >
                  Coba Gratis
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            className="lg:hidden text-slate-900 w-11 h-11 flex items-center justify-center bg-white rounded-lg border border-slate-200 shadow-sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Tutup menu" : "Buka menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </nav>

        {/* Mobile Menu Overlay - Reference: MELD-style Clean UX */}
        <div
          className={`fixed inset-0 z-[100] lg:hidden transition-all duration-300 ${
            mobileMenuOpen ? 'visible opacity-100' : 'invisible opacity-0'
          }`}
          aria-hidden={!mobileMenuOpen}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div
            className={`absolute inset-x-0 top-0 bg-white border-b border-slate-200 transition-transform duration-500 ease-out flex flex-col ${
              mobileMenuOpen ? 'translate-y-0' : '-translate-y-full'
            }`}
          >
            {/* Header Area */}
            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg overflow-hidden shadow-soft p-1.5 bg-white border border-slate-100">
                  <img src={LOGO_ICON} alt="KaffePOS" className="w-full h-full object-contain" />
                </div>
                <span className="text-lg font-extrabold text-slate-900 tracking-tight">Kaffe<span className="text-[#FF6A00]">POS</span></span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors"
                aria-label="Tutup menu"
              >
                <X size={24} />
              </button>
            </div>

            {/* Navigation Links Area */}
            <div className="px-6 pb-10">
              <div className="flex flex-col gap-5 border-t border-slate-100 py-6">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    onClick={(e) => scrollToSection(e, link.href)}
                    className="text-lg font-bold text-slate-700 hover:text-[#FF6A00] transition-colors"
                  >
                    {link.name}
                  </a>
                ))}
              </div>

              {/* Action Buttons Area */}
              <div className="flex flex-col border-t border-slate-100 pt-6 gap-4">
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); navigate('/login'); }}
                  className="w-full py-4 text-slate-600 font-bold hover:text-slate-900 transition-colors"
                >
                  Masuk Akun
                </button>
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); navigate('/register'); }}
                  className="w-full bg-[#FF6A00] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#FF6A00]/20"
                >
                  Gabung Gratis Sekarang
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="relative z-10 pt-20 overflow-x-hidden">

        {/* Hero Section */}
        <section className="relative overflow-hidden px-5 pb-14 pt-14 sm:px-6 md:pb-20 md:pt-24">
          <div className="mx-auto grid min-w-0 max-w-7xl items-center gap-12 lg:grid-cols-[0.95fr_1.2fr]">
            <div className="relative z-10 min-w-0 text-left">
              <h1 className="max-w-[340px] break-words font-display text-[34px] font-extrabold leading-[1.14] text-slate-900 sm:max-w-[620px] sm:text-[52px] md:text-[64px]">
                Kasir Cafe Paling Seru di <span className="text-[#FF6A00]">Indonesia</span>
              </h1>
              <p className="mt-6 max-w-[340px] break-words text-base font-medium leading-8 text-slate-600 sm:max-w-[560px] md:text-lg">
                Mulai dari Rp49.000/bulan. Coba gratis 14 hari Full Signature: Gamification, Kopi Passport Loyalty, AI Insights, Inventory resep + KDS, Offline Mode, dan thermal printer.
              </p>

              <div className="mt-8 flex max-w-[340px] flex-col gap-3 sm:max-w-none sm:flex-row">
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#FF6A00] px-7 text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(255,106,0,0.22)] hover:bg-[#ef6200] sm:w-auto"
                >
                  Coba Gratis 14 Hari <ArrowRight size={16} />
                </button>
                <a
                  href="#features"
                  onClick={(e) => scrollToSection(e, '#features')}
                  className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-[#FF6A00]/40 bg-white px-7 text-sm font-extrabold text-[#FF6A00] hover:bg-orange-50 sm:w-auto"
                >
                  Lihat Fitur Seru
                </a>
              </div>

              <div className="mt-10 grid max-w-[560px] gap-5 sm:grid-cols-3">
                {[
                  { title: 'Offline First', desc: 'Tetap jualan saat internet putus', icon: Cloud },
                  { title: 'Gamification', desc: 'Tim kasir makin semangat', icon: Trophy },
                  { title: 'AI Insights', desc: 'Keputusan bisnis lebih cepat', icon: Brain },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#FF6A00]">
                        <Icon size={19} />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900">{item.title}</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <LandingDeviceShowcase />
          </div>
        </section>

        {/* Partner Section */}
        <section className="bg-white px-5 py-10 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <p className="text-center text-xs font-semibold text-slate-400">Dibuat untuk cafe owner yang ingin kasirnya cepat, rapi, dan menyenangkan</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-5 text-sm font-extrabold text-slate-500 md:gap-x-14">
              <div className="flex items-center gap-2"><Coffee size={18} className="text-[#FF6A00]" /> Kopi Kita</div>
              <div className="flex items-center gap-2"><Zap size={18} className="text-[#FF6A00]" /> Brewlicious</div>
              <div className="flex items-center gap-2"><Store size={18} className="text-[#FF6A00]" /> Tanamera</div>
              <div className="flex items-center gap-2"><Coffee size={18} className="text-[#FF6A00]" /> Daily Brew</div>
              <div className="flex items-center gap-2"><Store size={18} className="text-[#FF6A00]" /> Kopi Nusantara</div>
            </div>
          </div>
        </section>

        <section className="px-5 py-10 sm:px-6 md:py-14">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-4 md:grid-cols-3">
              {BENEFITS.map((benefit) => {
                const Icon = benefit.icon;
                return (
                  <div key={benefit.title} className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-[#FF6A00]">
                      <Icon size={22} />
                    </div>
                    <h2 className="mt-5 font-display text-xl font-extrabold text-slate-900">{benefit.title}</h2>
                    <p className="mt-3 text-sm font-semibold leading-7 text-slate-500">{benefit.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="features" className="px-5 py-8 sm:px-6">
          <div className="kaffe-soft-section mx-auto max-w-7xl rounded-[24px] px-5 py-8 md:px-8 md:py-10">
            <h2 className="text-center font-display text-2xl font-extrabold text-slate-900 md:text-3xl">
              Satu POS, Banyak Cara Bikin Cafe Makin Hidup
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm font-semibold leading-7 text-slate-500">
              KaffePOS menggabungkan transaksi cepat, loyalty, game untuk tim, insight pintar, stok resep, KDS, dan printer dalam workflow yang tetap ringan.
            </p>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <button
                    key={feature.title}
                    type="button"
                    onClick={() => handleFeatureClick(feature)}
                    className="rounded-lg bg-white px-4 py-6 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                  >
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50 text-[#FF6A00]">
                      <Icon size={24} />
                    </div>
                    <h3 className="mt-5 text-sm font-extrabold text-slate-900">{feature.title}</h3>
                    <p className="mt-3 text-xs leading-6 text-slate-500">{feature.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section id="about" className="px-5 py-12 sm:px-6 md:py-16">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="text-xs font-extrabold uppercase text-[#FF6A00]">AI Insights & Dashboard</p>
              <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight text-slate-900 md:text-4xl">
                Dari Transaksi Harian Jadi Keputusan Bisnis
              </h2>
              <p className="mt-5 text-sm leading-7 text-slate-600 md:text-base">
                Dashboard KaffePOS membantu owner melihat revenue, menu favorit, jam ramai, stok kritis, dan performa tim tanpa harus buka banyak file.
              </p>
              <div className="mt-7 space-y-4">
                {['Revenue harian, mingguan, dan bulanan', 'AI Insights untuk menu dan peak hour', 'Top menu, metode pembayaran, dan margin', 'PDF report clean untuk evaluasi owner'].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#FF6A00] text-[11px] text-[#FF6A00]">✓</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <DashboardPreview />
          </div>
        </section>

        <section id="pricing" className="px-5 pb-16 sm:px-6 md:pb-20">
          <div className="mx-auto max-w-7xl">
            <div className="mb-6 text-center">
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#FF6A00]">Harga Ramah Cafe</p>
              <h2 className="mt-3 font-display text-3xl font-extrabold text-slate-900 md:text-4xl">
                Mulai Murah, Upgrade Saat Cafe Makin Ramai
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
                Mulai dengan trial 14 hari Full Signature. Setelah itu pilih paket sesuai tahap cafe: Kopi Susu mulai Rp49.000 atau Signature untuk fitur paling lengkap.
              </p>
            </div>
            <PricingPage
              selectedCycle={pricingCycle}
              onCycleChange={setPricingCycle}
              onSelectPlan={handlePricingSelect}
              ctaLabel={(plan) => {
                if (plan === 'secangkir') {
                  return 'Mulai Sekarang';
                }
                return isAuthenticated ? 'Lanjut ke Checkout' : 'Login untuk Checkout';
              }}
            />
            <div className="kaffe-cta-band mt-6 flex flex-col gap-4 rounded-[24px] p-6 md:flex-row md:items-center md:justify-between md:p-8">
              <div className="flex min-w-0 items-start gap-5">
                <div className="kaffe-cta-logo-card hidden h-20 w-20 shrink-0 items-center justify-center rounded-[22px] border border-white bg-white shadow-[0_16px_40px_rgba(31,41,51,0.12)] sm:flex">
                  <img src={LOGO_ICON} alt="" className="h-11 w-11" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-2xl font-extrabold text-white md:text-3xl">
                    Promo Launch: coba Full Signature dulu, bayar saat sudah cocok.
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-white/90">
                    Early Bird beta user mendapat akses prioritas, onboarding lebih dekat, dan kesempatan ikut menentukan fitur KaffePOS berikutnya.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-7 text-sm font-extrabold text-[#FF6A00] shadow-[0_14px_30px_rgba(31,41,51,0.16)] hover:bg-orange-50"
              >
                Ambil Trial Gratis <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 sm:px-6 md:pb-20">
          <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[24px] border border-orange-100 bg-white p-6 shadow-sm md:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-[#FF6A00]">
                  <CreditCard size={22} />
                </div>
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-widest text-[#FF6A00]">Pembayaran Langganan</p>
                  <h2 className="mt-1 font-display text-2xl font-extrabold text-slate-900 md:text-3xl">Duitku Sandbox untuk Checkout KaffePOS</h2>
                </div>
              </div>
              <p className="mt-5 text-sm font-semibold leading-7 text-slate-600 md:text-base">
                Payment gateway Duitku digunakan untuk pembayaran paket/langganan KaffePOS oleh client atau pemilik usaha yang menggunakan sistem POS KaffePOS. Pengguna dapat membuat akun, login, memilih paket, melakukan checkout, dan diarahkan ke halaman pembayaran Duitku Sandbox. Status pembayaran dikonfirmasi melalui callback/check transaction di sisi server.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#FF6A00] px-6 text-sm font-extrabold text-white shadow-[0_14px_30px_rgba(255,106,0,0.2)] hover:bg-[#ef6200]"
                >
                  Buat Akun & Checkout <ArrowRight size={16} />
                </button>
                <a
                  href="#pricing"
                  onClick={(e) => scrollToSection(e, '#pricing')}
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-[#FF6A00]/40 bg-white px-6 text-sm font-extrabold text-[#FF6A00] hover:bg-orange-50"
                >
                  Lihat Paket KaffePOS
                </a>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-6 md:p-8">
              <h3 className="font-display text-xl font-extrabold text-slate-900">Alur Checkout</h3>
              <ol className="mt-5 space-y-3">
                {PAYMENT_FLOW_STEPS.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm font-semibold leading-6 text-slate-600">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-50 text-xs font-extrabold text-[#FF6A00] ring-1 ring-orange-100">{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="contact" className="bg-white px-5 py-14 sm:px-6 md:py-18">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 max-w-3xl">
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#FF6A00]">Kontak Dukungan</p>
              <h2 className="mt-3 font-display text-3xl font-extrabold text-slate-900 md:text-4xl">Bantuan untuk Registrasi, Login, dan Pembayaran</h2>
              <p className="mt-4 text-sm font-semibold leading-7 text-slate-500">Tim KaffePOS siap membantu pertanyaan akun, paket, checkout, dan verifikasi pembayaran.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {SUPPORT_CONTACT.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-[#FF6A00]">{item.label}</p>
                  {item.href ? (
                    <a href={item.href} className="mt-3 block break-words text-sm font-extrabold text-slate-900 hover:text-[#FF6A00]">{item.value}</a>
                  ) : (
                    <p className="mt-3 text-sm font-extrabold leading-7 text-slate-900">{item.value}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-14 sm:px-6 md:py-18">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest text-[#FF6A00]">Testimonial</p>
                <h2 className="mt-3 font-display text-3xl font-extrabold text-slate-900 md:text-4xl">
                  Sedang Dipoles Bersama Cafe Owner Beta
                </h2>
              </div>
              <p className="max-w-xl text-sm font-semibold leading-7 text-slate-500">
                Placeholder ini siap diganti dengan quote asli setelah Closed Beta berjalan.
              </p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {TESTIMONIALS.map((item) => (
                <div key={item.name} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
                  <div className="mb-4 flex gap-1 text-[#FF6A00]">
                    {Array.from({ length: item.rating }).map((_, index) => (
                      <Star key={index} size={16} fill="#FF6A00" />
                    ))}
                  </div>
                  <p className="text-sm font-semibold leading-7 text-slate-600">&ldquo;{item.body}&rdquo;</p>
                  <div className="mt-5">
                    <p className="text-sm font-extrabold text-slate-900">{item.name}</p>
                    <p className="text-xs font-bold text-slate-400">{item.handle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-16 sm:px-6 md:pb-20">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#FF6A00]">FAQ</p>
              <h2 className="mt-3 font-display text-3xl font-extrabold text-slate-900 md:text-4xl">
                Pertanyaan yang Sering Muncul
              </h2>
            </div>
            <div className="mt-8 space-y-3">
              {FAQS.map((item) => (
                <details key={item.q} className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-extrabold text-slate-900">
                    {item.q}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[#FF6A00] transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-4 text-sm font-semibold leading-7 text-slate-500">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* Download Warning Modal */}
      {showDownloadWarning && (
        <div className="kaffe-modal-overlay fixed inset-0 z-[100] flex justify-center">
           <button
             type="button"
             className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl animate-in fade-in duration-300"
             onClick={closeDownloadWarning}
             aria-label="Tutup peringatan unduhan"
           />
           <div
             ref={downloadModal.panelRef}
             className="kaffe-modal-panel kaffe-modal-scroll relative w-full bg-white border border-slate-100 p-6 sm:p-8 md:p-10 shadow-premium animate-in zoom-in slide-in-from-bottom-10 duration-500 [--kaffe-modal-max-width:540px]"
             aria-labelledby="download-warning-title"
             {...downloadModal.dialogProps}
           >
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#FF6A00]/5 rounded-2xl flex items-center justify-center mb-6 sm:mb-8 mx-auto border border-[#FF6A00]/10">
                 <Lock size={48} style={{ color: BRAND_ACCENT }} />
              </div>
              <h3 id="download-warning-title" className="kaffe-safe-text text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 text-center mb-4 sm:mb-5 italic leading-tight uppercase">PERLU PENDAFTARAN</h3>
              <p className="kaffe-safe-text text-slate-500 text-sm sm:text-base md:text-lg text-center mb-6 sm:mb-8 font-medium leading-relaxed">
                 Fitur unduh APK hanya tersedia untuk pemilik outlet terdaftar guna menjaga keamanan dan lisensi Dashboard Anda.
              </p>
              <div className="flex flex-col gap-4">
                 <button
                   type="button"
                   onClick={() => navigate('/register')}
                   className="w-full bg-[#FF6A00] text-white py-4 sm:py-5 rounded-2xl font-black text-sm sm:text-base shadow-premium hover:scale-[1.02] transition-all uppercase italic"
                 >
                   Daftar Gratis Sekarang
                 </button>
                 <button
                   type="button"
                   onClick={closeDownloadWarning}
                   className="w-full bg-slate-50 text-slate-400 py-4 sm:py-5 rounded-2xl font-black text-sm hover:bg-slate-100 transition-all uppercase tracking-widest"
                 >
                   Nanti Saja
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Feature Intelligence Detail Overlay */}
      {isFeatureDetailOpen && selectedFeature && (
        <div className="kaffe-modal-overlay fixed inset-0 z-[110] flex justify-center">
           <button
             type="button"
             className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl animate-in fade-in duration-500"
             onClick={closeFeatureDetail}
             aria-label="Tutup detail fitur"
           />

           <div
             ref={featureModal.panelRef}
             className="kaffe-modal-panel kaffe-modal-scroll relative bg-white border border-slate-100 w-full shadow-premium animate-in zoom-in slide-in-from-bottom-20 duration-700 flex flex-col md:flex-row [--kaffe-modal-max-width:900px]"
             aria-labelledby="feature-detail-title"
             {...featureModal.dialogProps}
           >
              {/* Left Side: Visual/Metric */}
              <div className={`md:w-1/2 p-6 sm:p-8 md:p-10 flex flex-col items-center justify-center relative overflow-hidden bg-slate-50`}>
                 <div className="absolute inset-0 opacity-5">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-[#FF6A00] blur-[150px] rounded-full" />
                 </div>

                 {(() => {
                    const detail = getFeatureDetail(selectedFeature.title);
                    const DetailIcon = detail?.icon || HelpCircle;
                    return (
                       <div className="relative z-10 text-center">
                          <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl border border-[#FF6A00]/10 bg-white text-[#FF6A00] shadow-premium motion-safe:animate-[bounce_4s_infinite] sm:mb-8 sm:size-24 sm:rounded-[28px] md:size-28">
                             <DetailIcon size={52} strokeWidth={1.5} />
                          </div>
                          <div className="kaffe-safe-text text-[10px] sm:text-[11px] font-black uppercase tracking-[0.24em] sm:tracking-[0.42em] text-slate-400 mb-3 opacity-60">{detail.stats.metric}</div>
                          <div className="kaffe-safe-text text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 italic leading-none mb-2">{detail.stats.value}</div>
                          <div className="w-14 h-1.5 bg-[#FF6A00] mx-auto rounded-full mt-6" />
                       </div>
                    );
                 })()}
              </div>

              {/* Right Side: Logic/Content */}
              <div className="md:w-1/2 p-6 sm:p-8 md:p-12 bg-white">
                 <button
                   type="button"
                   onClick={closeFeatureDetail}
                   className="absolute top-4 right-4 sm:top-6 sm:right-6 text-slate-400 hover:text-slate-900 transition-colors"
                   aria-label="Tutup detail fitur"
                 >
                    <X size={24} />
                 </button>

                 <h3 id="feature-detail-title" className="kaffe-safe-text pr-10 text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 mb-5 sm:mb-6 italic leading-tight uppercase">
                    {selectedFeature.title}
                 </h3>

                 <p className="kaffe-safe-text text-slate-500 text-sm sm:text-base md:text-lg font-medium leading-relaxed mb-8 sm:mb-10">
                    {getFeatureDetail(selectedFeature.title).details}
                 </p>

                 <div className="space-y-4 sm:space-y-5">
                    <h4 className="kaffe-safe-text text-[10px] sm:text-[11px] font-black text-[#FF6A00] uppercase tracking-[0.28em] sm:tracking-[0.42em] mb-4">Technical Advantage</h4>
                    {getFeatureDetail(selectedFeature.title).highlights.map((h: string, idx: number) => (
                       <div key={idx} className="flex items-start gap-4 group/item">
                          <div className="mt-2 w-2 h-2 shrink-0 rounded-full bg-[#FF6A00] group-hover/item:scale-150 transition-transform" />
                          <span className="kaffe-safe-text text-slate-900 font-black text-sm sm:text-[15px] tracking-tight group-hover/item:text-[#FF6A00] transition-colors italic uppercase">{h}</span>
                       </div>
                    ))}
                 </div>

                 <button
                   type="button"
                   onClick={closeFeatureDetail}
                   className="mt-10 sm:mt-12 w-full py-4 sm:py-5 rounded-2xl bg-slate-50 border border-slate-100 text-slate-500 font-black hover:bg-slate-100 transition-all uppercase tracking-[0.18em] sm:tracking-widest italic text-xs sm:text-sm"
                 >
                    Kembali Ke Welcome Page
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Safe Detail Overlay - Legal & Advisory */}
      {isSafeDetailOpen && selectedSafeItem && (
        <div className="kaffe-modal-overlay fixed inset-0 z-[110] flex justify-center">
           <button
             type="button"
             className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl animate-in fade-in duration-500"
             onClick={closeSafeDetail}
             aria-label="Tutup dokumen keamanan"
           />

           <div
             ref={safeModal.panelRef}
             className="kaffe-modal-panel relative bg-white border border-slate-100 w-full shadow-premium animate-in zoom-in slide-in-from-bottom-20 duration-700 flex flex-col [--kaffe-modal-max-width:800px]"
             aria-labelledby="safe-detail-title"
             {...safeModal.dialogProps}
           >
              {/* Header Box */}
              <div className="p-6 sm:p-8 md:p-12 bg-slate-50 border-b border-slate-100 relative">
                 <button
                   type="button"
                   onClick={closeSafeDetail}
                   className="absolute top-4 right-4 sm:top-6 sm:right-6 text-slate-400 hover:text-slate-900 transition-colors"
                   aria-label="Tutup dokumen keamanan"
                 >
                    <X size={24} />
                 </button>

                 <div className="flex items-start gap-4 sm:gap-6 mb-6 pr-10">
                    {(() => {
                       const item = SAFE_CONTENT[selectedSafeItem];
                       const ItemIcon = item?.icon || Shield;
                       return (
                          <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-2xl bg-white border border-slate-100 shadow-soft flex items-center justify-center text-[#FF6A00]">
                             <ItemIcon size={32} />
                          </div>
                       );
                    })()}
                    <div className="min-w-0">
                       <h3 id="safe-detail-title" className="kaffe-safe-text text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 italic uppercase leading-tight">
                          {selectedSafeItem}
                       </h3>
                       <p className="kaffe-safe-text text-[#FF6A00] font-black text-[10px] sm:text-[11px] uppercase tracking-[0.24em] sm:tracking-[0.36em] mt-2 italic">Kebijakan & Keamanan</p>
                    </div>
                 </div>

                 <p className="kaffe-safe-text text-slate-500 text-sm sm:text-base md:text-lg font-medium leading-relaxed max-w-2xl">
                    {SAFE_CONTENT[selectedSafeItem]?.description}
                 </p>
              </div>

              {/* Scrollable Content Area */}
              <div className="kaffe-modal-scroll flex-1 p-6 sm:p-8 md:p-12 bg-white">
                 <div className="space-y-8 sm:space-y-10">
                    {SAFE_CONTENT[selectedSafeItem]?.points.map((p, idx: number) => (
                       <div key={idx} className="group/safe-item">
                          <div className="flex items-start gap-4 mb-3">
                             <div className="w-6 h-[2.5px] bg-[#FF6A00]/30 group-hover/safe-item:w-10 group-hover/safe-item:bg-[#FF6A00] transition-all" />
                             <h4 className="kaffe-safe-text text-slate-900 font-black text-base sm:text-lg italic uppercase tracking-tight group-hover/safe-item:text-[#FF6A00] transition-colors">
                                {p.title}
                             </h4>
                          </div>
                          <p className="kaffe-safe-text text-slate-500 text-sm sm:text-base leading-relaxed sm:ml-10 font-medium">
                             {p.detail}
                          </p>
                       </div>
                    ))}
                 </div>

                 <div className="mt-12 sm:mt-16 pt-8 sm:pt-10 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-5 sm:gap-6">
                    <div className="kaffe-safe-text text-center md:text-left text-slate-400 text-xs sm:text-sm font-black italic tracking-widest uppercase">Platform Internal Audit &bull; 2026</div>
                    <button
                      type="button"
                      onClick={closeSafeDetail}
                      className="w-full md:w-auto px-8 sm:px-10 py-4 rounded-2xl bg-slate-50 text-slate-500 font-black text-xs sm:text-sm hover:bg-slate-100 transition-all uppercase tracking-[0.2em] sm:tracking-[0.28em] italic border border-slate-100"
                    >
                       Tutup Dokumen
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      <footer className="kaffe-footer relative z-10 px-6 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
            <div>
              <button type="button" className="mb-5 flex items-center gap-3" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 ring-1 ring-orange-100">
                  <img src={LOGO_ICON} alt="" className="h-7 w-7" />
                </span>
                <span className="text-2xl font-extrabold text-slate-900">Kaffe<span className="text-[#FF6A00]">POS</span></span>
              </button>
              <p className="max-w-sm text-sm font-medium leading-7 text-slate-600">
                Sistem kasir modern yang membantu bisnis Anda berkembang lebih cepat dan efisien.
              </p>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-extrabold text-slate-900">Produk</h4>
              <ul className="space-y-3 text-sm font-semibold text-slate-600">
                <li><a href="#features" onClick={(e) => scrollToSection(e, '#features')}>Fitur</a></li>
                <li><a href="#pricing" onClick={(e) => scrollToSection(e, '#pricing')}>Harga</a></li>
                <li>Update</li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-extrabold text-slate-900">Perusahaan</h4>
              <ul className="space-y-3 text-sm font-semibold text-slate-600">
                <li><a href="#about" onClick={(e) => scrollToSection(e, '#about')}>Tentang Kami</a></li>
                <li>Karir</li>
                <li><a href="#contact" onClick={(e) => scrollToSection(e, '#contact')}>Kontak</a></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-extrabold text-slate-900">Bantuan</h4>
              <ul className="space-y-3 text-sm font-semibold text-slate-600">
                <li><button type="button" className="text-left" onClick={() => { setSelectedSafeItem('ADVISORY'); setIsSafeDetailOpen(true); }}>Pusat Bantuan</button></li>
                <li><button type="button" className="text-left" onClick={() => { setSelectedSafeItem('TERMS'); setIsSafeDetailOpen(true); }}>Panduan</button></li>
                <li><button type="button" className="text-left" onClick={() => { setSelectedSafeItem('PRIVACY'); setIsSafeDetailOpen(true); }}>Kebijakan Privasi</button></li>
              </ul>
            </div>

            <div>
              <h4 className="mb-4 text-sm font-extrabold text-slate-900">Ikuti Kami</h4>
              <div className="flex gap-3">
                <a href="https://wa.me/6285186076224" target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-[#FF6A00] ring-1 ring-orange-100 hover:bg-orange-100" aria-label="WhatsApp KaffePOS">
                  <MessageCircle size={18} />
                </a>
                <a href="https://instagram.com/kaffepos" target="_blank" rel="noopener noreferrer" className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-[#FF6A00] ring-1 ring-orange-100 hover:bg-orange-100" aria-label="Instagram KaffePOS">
                  <Instagram size={18} />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-orange-100 pt-6 text-center text-xs font-medium text-slate-500">
            © 2026 kaffePOS. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Back to Top */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-12 right-12 z-[60] bg-[#FF6A00] text-white w-20 h-20 rounded-[32px] flex items-center justify-center shadow-premium hover:scale-110 active:scale-90 transition-all animate-in fade-in zoom-in duration-500 ring-8 ring-[#FF6A00]/10"
          aria-label="Kembali ke atas"
        >
          <ArrowUp size={36} strokeWidth={4} />
        </button>
      )}

    </div>
  );
}
