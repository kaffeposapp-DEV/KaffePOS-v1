import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart3, 
  Download, 
  ShieldCheck,
  Smartphone, 
  Star, 
  Store, 
  Zap,
  ArrowRight,
  Menu,
  X,
  Rocket, 
  ArrowUp,
  Coffee,
  Check,
  Lock,
  Instagram,
  MessageCircle,
  HelpCircle,
  Wifi,
  BarChart,
  Cpu,
  Shield,
  FileText,
  FileCheck,
  Scale
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import LOGO_WEB from '@/assets/logo-kaffeposweb.svg';
import LOGO_ICON from '@/assets/logo-kaffeposappicon.svg';
import PREVIEW_BRAND from '@/assets/preview-brand.jpg';
import PREVIEW_REPORT from '@/assets/preview-report.jpg';
import PREVIEW_LICENSE from '@/assets/preview-license.jpg';

const NAV_LINKS = [
  { name: 'Fitur', href: '#features' },
  { name: 'Harga', href: '#pricing' },
  { name: 'Testimoni', href: '#testimonials' },
  { name: 'Download APK', href: '#download' },
];

type FeatureTitle =
  | 'Smart Cloud POS'
  | 'Manajemen Stok (RECIPE)'
  | 'Laporan Dashboard AI'
  | 'Keamanan Berlapis';

type SafeContentKey = 'ADVISORY' | 'TERMS' | 'PRIVACY' | 'AUDIT';

type MarketingFeature = {
  title: FeatureTitle;
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
    name: 'Kopi Susu',
    price: '49rb',
    period: '/bulan',
    desc: 'Naik kelas dari catatan manual ke operasional yang lebih stabil.',
    features: ['Transaksi unlimited', 'Export PDF & Excel', 'Laporan mingguan/bulanan', 'Cetak browser / WiFi'],
    color: 'border-white/5 bg-white/[0.01]'
  },
  {
    name: 'Signature',
    price: '99rb',
    period: '/bulan',
    desc: 'Paket paling pas untuk bisnis yang ingin jalan lebih serius.',
    features: ['Transaksi unlimited', 'Multi kasir & cashier session', 'Thermal Bluetooth/USB', 'AI Insight penjualan'],
    color: 'border-[#d8823b]/50 bg-[#d8823b]/5'
  },
  {
    name: 'Founder',
    price: '199rb',
    period: '/bulan',
    desc: 'Untuk outlet intensif yang butuh paket paling lengkap dan dukungan lebih cepat.',
    features: ['Semua fitur Signature', 'Pendampingan setup prioritas', 'Review operasional berkala', 'Jalur bantuan lebih cepat'],
    color: 'border-white/5 bg-white/[0.01]'
  }
];

const FEATURES: MarketingFeature[] = [
  {
    title: 'Smart Cloud POS',
    desc: 'Transaksi instan, struk digital, dan sinkronisasi real-time antar perangkat tanpa delay.',
    icon: Store,
    color: 'bg-emerald-500/10 text-emerald-400',
  },
  {
    title: 'Manajemen Stok (RECIPE)',
    desc: 'Hitung HPP otomatis. Stok bahan baku terpotong otomatis saat menu terjual.',
    icon: Zap,
    color: 'bg-orange-500/10 text-orange-400',
  },
  {
    title: 'Laporan Dashboard AI',
    desc: 'Analisis penjualan harian, produk terlaris, hingga prediksi stok berbasis AI.',
    icon: BarChart3,
    color: 'bg-blue-500/10 text-blue-400',
  },
  {
    title: 'Keamanan Berlapis',
    desc: 'Akses akun diverifikasi, data sinkron lewat koneksi aman, dan pemisahan data toko dijaga di server.',
    icon: ShieldCheck,
    color: 'bg-purple-500/10 text-purple-400',
  },
];

const FEATURE_DETAILS: Record<FeatureTitle, FeatureDetail> = {
  'Smart Cloud POS': {
    highlights: ['Offline-First Engine', 'Instant Digital Receipts', 'Split-Bill Matrix', 'Multi-Terminal Sync'],
    details: 'Sistem inti KaffePOS dirancang untuk keandalan maksimal. Dengan teknologi Offline-First, bisnis Anda tetap berjalan meski internet terputus. Data akan disinkronkan secara otomatis ke cloud saat koneksi kembali tersedia.',
    stats: { metric: 'Sync Status', value: 'Real-time' },
    icon: Wifi,
  },
  'Manajemen Stok (RECIPE)': {
    highlights: ['Raw Material Tracking', 'Automated HPP Calculation', 'Cogs Visibility', 'Stock Level Alerts'],
    details: 'Kendali penuh atas setiap gram bahan baku Anda. Sistem Recipe kami secara otomatis memotong stok bahan baku saat menu terjual, menghitung HPP secara real-time, dan memberi peringatan ketika stok mulai menipis.',
    stats: { metric: 'Accuracy', value: '99.9%' },
    icon: Cpu,
  },
  'Laporan Dashboard AI': {
    highlights: ['Sales Forecasting', 'Best-Seller Heatmaps', 'Inventory Prediction', 'Profitability Audit'],
    details: 'Ubah data menjadi keputusan bisnis yang lebih cepat. AI KaffePOS menganalisis pola penjualan untuk membantu membaca kebutuhan stok, melihat menu paling menguntungkan, dan merapikan evaluasi operasional mingguan.',
    stats: { metric: 'Insights', value: 'Real-time' },
    icon: BarChart,
  },
  'Keamanan Berlapis': {
    highlights: ['OTP Verification', 'Row-Level Security', 'Server-Side Validation', 'Role-Based Access'],
    details: 'Keamanan operasional dijaga lewat verifikasi email, pembatasan akses data per akun dan toko, serta validasi server untuk alur yang sensitif. Fokusnya adalah menjaga data bisnis tetap terpisah dan hanya diakses oleh pihak yang berwenang.',
    stats: { metric: 'Protection', value: 'Server-side' },
    icon: ShieldCheck,
  },
};

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
    name: 'Dani Sanjaya',
    handle: '@kopi_senja',
    body: 'KaffePOS beneran ngerubah cara kami kelola stok. Dulu sering tekor bahan, sekarang semua keganti otomatis!',
    rating: 5,
  },
  {
    name: 'Siti Aminah',
    handle: '@bakery_ceria',
    body: 'Laporan PDF-nya rapi banget buat pajak harian. Tinggal klik langsung jadi di HP.',
    rating: 5,
  },
  {
    name: 'Budi Santoso',
    handle: '@angkringan_milenial',
    body: 'Aplikasi teringan yang pernah saya coba. Di HP spek rendah pun tetep lancar jaya buat jualan.',
    rating: 5,
  },
  {
    name: 'Riska Putri',
    handle: '@gelato_heaven',
    body: 'Fitur resepnya gila banget! HPP jadi akurat sampai ke gram terakhir. Sangat membantu profit margin.',
    rating: 5,
  },
  {
    name: 'Fahmi Idris',
    handle: '@brew_cloud',
    body: 'Sinkronisasi Cloud-nya instan. Saya bisa pantau 3 cabang sekaligus dari rumah tanpa perlu telepon manager.',
    rating: 5,
  },
  {
    name: 'Maya Sartika',
    handle: '@dimsum_queen',
    body: 'Dukungan printernya luas. Pakai printer thermal murah pun langsung konek via Bluetooth tanpa ribet.',
    rating: 5,
  },
  {
    name: 'Hendra Wijaya',
    handle: '@steak_house_pdp',
    body: 'Sistem shift kasirnya rapi. Gak ada lagi selisih uang di laci setiap ganti pegawai. Sangat aman!',
    rating: 5,
  },
  {
    name: 'Lestari Wahyu',
    handle: '@healthy_bowl',
    body: 'Tampilannya modern & clean. Pelanggan sering salfok lihat kasir kami pakai KaffePOS karena estetik.',
    rating: 5,
  },
  {
    name: 'Dedi Kurniawan',
    handle: '@martabak_bangka',
    body: 'Dashboard analytics-nya bantu banget buat nentuin promo mingguan. Data real-time itu kuncinya!',
    rating: 5,
  },
  {
    name: 'Nina Marlina',
    handle: '@bubble_tea_hub',
    body: 'Mudah dipelajari. Pegawai baru cukup 10 menit training sudah bisa pake buat jualan. Hemat waktu banget.',
    rating: 5,
  },
];


// Reusable Counter Component
function Counter({ end, duration = 2000, suffix = "" }: { end: number, duration?: number, suffix?: string }) {
  const [count, setCount] = useState(0);
  const countRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );
    if (countRef.current) observer.observe(countRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    let start = 0;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [isVisible, end, duration]);

  return <div ref={countRef} className="tabular-nums">{count.toLocaleString('id-ID')}{suffix}</div>;
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

  const handleLogoKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      scrollToTarget('#top');
    }
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

  const BRAND_ACCENT = '#d8823b';

  return (
    <div id="top" className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans selection:bg-[#d8823b]/30 overflow-x-hidden">
      
      {/* WCAG Skip Link */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-white focus:text-black focus:px-6 focus:py-3 focus:rounded-xl focus:font-black">
        Skip to main content
      </a>

      {/* Persistent Background Layer */}
      <style dangerouslySetInnerHTML={{ __html: `
        html {
          scroll-behavior: smooth;
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}} />
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
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isScrolled 
          ? 'bg-[#0b0f19]/90 backdrop-blur-2xl border-b border-white/5 py-2 shadow-2xl' 
          : 'bg-[#0b0f19]/30 backdrop-blur-xl py-4'
      }`}>
        <nav className="max-w-[1400px] mx-auto px-6 md:px-12 flex items-center justify-between" aria-label="Main Navigation">
          <div 
            className="flex items-center gap-4 cursor-pointer group focus-visible:ring-4 focus-visible:ring-[#d8823b]/50 outline-none rounded-2xl transition-all" 
            onClick={() => scrollToTarget('#top')}
            role="button"
            tabIndex={0}
            onKeyDown={handleLogoKeyDown}
          >
            <div className="h-10 md:h-12 lg:h-14 flex items-center justify-center group-hover:scale-105 transition-transform duration-500 ease-out">
              <img
                src={LOGO_WEB}
                alt="KaffePOS Home"
                className="h-full w-auto object-contain drop-shadow-2xl"
                loading="eager"
              />
            </div>
          </div>

          {/* Desktop Navigation */}
          <ul className="hidden lg:flex items-center gap-12 list-none">
            {NAV_LINKS.map(link => (
              <li key={link.name}>
                <a 
                  href={link.href}
                  onClick={(e) => scrollToSection(e, link.href)} 
                  className="text-[16px] font-black text-slate-100 hover:text-[#d8823b] transition-all focus-visible:text-[#d8823b] outline-none drop-shadow-lg py-2 px-1 relative group"
                >
                  {link.name}
                  <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#d8823b] transition-all group-hover:w-full rounded-full" />
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden md:flex items-center gap-6">
            {isAuthenticated ? (
              <button 
                onClick={() => navigate('/')}
                className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-[20px] text-[15px] font-black transition-all border border-white/10 shadow-2xl group flex items-center gap-3"
              >
                Dashboard <ArrowRight size={18} className="group-hover:translate-x-1.5 transition-transform" />
              </button>
            ) : (
              <>
                <button 
                  onClick={() => navigate('/login')}
                  className="text-slate-100 hover:text-white px-6 py-3 text-[15px] font-black transition-all focus-visible:ring-4 focus-visible:ring-[#d8823b]/30 rounded-xl"
                >
                  Masuk
                </button>
                <button 
                  onClick={() => navigate('/register')}
                  className="bg-[#d8823b] hover:bg-[#ef934b] text-[#0b0f19] px-10 py-4 rounded-[20px] text-[15px] font-black transition-all shadow-[0_20px_40px_rgba(216,130,59,0.3)] hover:-translate-y-1 active:translate-y-0"
                >
                  Gabung Gratis
                </button>
              </>
            )}
          </div>

          <button 
            className="lg:hidden text-white w-14 h-14 flex items-center justify-center bg-slate-900/80 rounded-2xl border border-white/10 shadow-xl backdrop-blur-md" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Tutup menu" : "Buka menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </nav>

        {/* Mobile Menu Overlay - Reference: MELD-style Clean UX */}
        <div 
          className={`fixed inset-0 z-[100] lg:hidden transition-all duration-300 ${
            mobileMenuOpen ? 'visible opacity-100' : 'invisible opacity-0'
          }`}
          aria-hidden={!mobileMenuOpen}
        >
          {/* Solid Backdrop */}
          <div 
            className="absolute inset-0 bg-[#0b0f19] transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Drawer Content - Optimized to match MELD reference */}
          <div 
            className={`absolute inset-x-0 top-0 bg-[#0b0f19]/95 backdrop-blur-2xl border-b border-white/5 transition-transform duration-500 ease-out flex flex-col ${
              mobileMenuOpen ? 'translate-y-0' : '-translate-y-full'
            }`}
          >
            {/* Header Area */}
            <div className="flex items-center justify-between p-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg border border-white/10 p-1 bg-white">
                  <img src={LOGO_ICON} alt="KaffePOS" className="w-full h-full object-contain" />
                </div>
                <span className="text-xl font-black text-white tracking-widest uppercase">KAFFEPOS</span>
              </div>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="w-12 h-12 flex items-center justify-center text-white hover:bg-white/5 rounded-full transition-colors"
                aria-label="Tutup menu"
              >
                <X size={32} />
              </button>
            </div>

            {/* Navigation Links Area */}
            <div className="px-10 pb-12">
              <div className="flex flex-col border-t border-white/5 py-8 space-y-8">
                {NAV_LINKS.map((link) => (
                  <a 
                    key={link.name} 
                    href={link.href}
                    onClick={(e) => scrollToSection(e, link.href)} 
                    className="text-2xl font-black text-white/90 hover:text-[#d8823b] transition-colors tracking-tighter uppercase italic"
                  >
                    {link.name}
                  </a>
                ))}
              </div>

              {/* Action Buttons Area */}
              <div className="flex flex-col border-t border-white/5 pt-10 pb-6 gap-8 text-center">
                <button 
                  onClick={() => { setMobileMenuOpen(false); navigate('/login'); }}
                  className="text-xl font-black text-[#d8823b] hover:text-white transition-colors uppercase italic tracking-widest"
                >
                  MASUK AKUN
                </button>
                <button 
                  onClick={() => { setMobileMenuOpen(false); navigate('/register'); }}
                  className="w-full bg-[#d8823b] text-[#0b0f19] py-6 rounded-[24px] font-black text-2xl shadow-2xl shadow-[#d8823b]/30 hover:scale-[1.02] active:scale-95 transition-all uppercase italic"
                >
                  GABUNG GRATIS SEKARANG
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="relative z-10 pt-20 overflow-x-hidden">
        
        {/* Hero Section */}
        <section className="relative pt-24 pb-20 md:pt-48 md:pb-40 px-4 sm:px-6 overflow-x-hidden">
          <div className="w-full max-w-7xl mx-auto text-center relative z-10 min-w-0">
            <div className="inline-flex max-w-[calc(100vw-32px)] items-center justify-center gap-2 sm:gap-3 bg-white/[0.03] border border-white/10 px-3 sm:px-6 py-3 rounded-full mb-10 animate-in slide-up backdrop-blur-md">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse border-2 border-emerald-500/30" />
              <span className="min-w-0 text-center text-[10px] sm:text-[12px] font-black text-slate-200 uppercase tracking-[0.08em] sm:tracking-[0.3em] break-words">AI-Powered Cloud POS v2.0</span>
            </div>

            <h1 className="max-w-[calc(100vw-32px)] mx-auto text-[34px] sm:text-[48px] md:text-[64px] lg:text-[80px] font-black leading-[1.08] text-white tracking-normal mb-8 animate-in slide-up delay-100 break-words">
               <span className="text-white">SISTEM POS</span> <br />
               <span className="text-[#d8823b]">PROFESIONAL.</span>
            </h1>
            
            <p className="max-w-[340px] sm:max-w-[800px] mx-auto text-[15px] sm:text-[18px] md:text-[24px] text-slate-300 font-medium leading-relaxed mb-16 sm:mb-20 animate-in slide-up delay-200 break-words">
              Solusi manajemen operasional paling cerdas untuk UMKM. Kelola stok, pantau transaksi, dan scale-up bisnis Anda dalam satu dashboard intuitif.
            </p>

            <div className="w-full max-w-[350px] sm:max-w-none mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-5 sm:gap-6 animate-in slide-up delay-300">
              <button 
                onClick={() => navigate('/register')}
                className="w-full sm:w-auto min-w-0 bg-[#d8823b] hover:bg-[#ef934b] text-slate-950 px-5 sm:px-14 py-5 sm:py-7 rounded-[22px] sm:rounded-[28px] text-[16px] sm:text-[20px] font-black transition-all shadow-[0_30px_60px_rgba(216,130,59,0.4)] flex items-center justify-center gap-3 sm:gap-4 group hover:-translate-y-1.5 active:translate-y-0"
              >
                <span className="min-w-0 whitespace-nowrap">Mulai Gratis Sekarang</span>
                <ArrowRight size={20} strokeWidth={3} className="shrink-0 group-hover:translate-x-2 transition-transform" />
              </button>
              <a 
                href="#download"
                onClick={handleDownload}
                className="w-full sm:w-auto min-w-0 bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] text-white px-5 sm:px-14 py-5 sm:py-7 rounded-[22px] sm:rounded-[28px] text-[16px] sm:text-[20px] font-black transition-all flex items-center justify-center gap-3 sm:gap-4 hover:-translate-y-1.5 active:translate-y-0 backdrop-blur-sm"
              >
                <Smartphone size={20} className="shrink-0" />
                <span className="min-w-0 whitespace-nowrap">Unduh Android APK</span>
              </a>
            </div>


          </div>
        </section>

        {/* Dynamic Stats Section - With Counter Animation */}
        <section className="py-24 md:py-36 bg-slate-950/90 border-y border-white/5 relative z-10 px-6">
          <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-12 md:gap-20">
             <div className="text-center group p-6 rounded-[40px] hover:bg-white/[0.02] transition-colors">
               <div className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tighter group-hover:text-[#d8823b] transition-colors flex justify-center items-center">
                 <Counter end={1200} suffix="+" />
               </div>
               <div className="text-[12px] md:text-[14px] text-slate-400 font-black uppercase tracking-[0.4em] mb-2 leading-none">Kafe Aktif</div>
               <div className="text-[11px] text-[#d8823b] font-bold uppercase tracking-widest opacity-60">Verified Partners</div>
             </div>
             <div className="text-center group p-6 rounded-[40px] hover:bg-white/[0.02] transition-colors">
               <div className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tighter group-hover:text-[#d8823b] transition-colors flex justify-center items-center">
                 <Counter end={4000000} suffix="+" />
               </div>
               <div className="text-[12px] md:text-[14px] text-slate-400 font-black uppercase tracking-[0.4em] mb-2 leading-none">Transaksi</div>
               <div className="text-[11px] text-[#d8823b] font-bold uppercase tracking-widest opacity-60">Secured Volume</div>
             </div>
             <div className="text-center group p-6 rounded-[40px] hover:bg-white/[0.02] transition-colors">
               <div className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tighter group-hover:text-[#d8823b] transition-colors flex justify-center items-center">
                 <Counter end={99} suffix=".9%" />
               </div>
               <div className="text-[12px] md:text-[14px] text-slate-400 font-black uppercase tracking-[0.4em] mb-2 leading-none">Uptime</div>
               <div className="text-[11px] text-[#d8823b] font-bold uppercase tracking-widest opacity-60">Operasional Stabil</div>
             </div>
             <div className="text-center group p-6 rounded-[40px] bg-[#d8823b]/5 border border-[#d8823b]/10 transition-transform hover:-translate-y-2">
               <div className="text-4xl md:text-5xl lg:text-6xl font-black text-[#d8823b] mb-6 tracking-tighter flex justify-center items-center">
                 <Counter end={100} suffix="ms" duration={1500} />
               </div>
               <div className="text-[12px] md:text-[14px] text-slate-400 font-black uppercase tracking-[0.4em] mb-2 leading-none">Latency</div>
               <div className="text-[11px] text-[#d8823b] font-bold uppercase tracking-widest">Global Speed</div>
             </div>
          </div>
        </section>

        {/* Features Grid - WCAG Enhanced */}
        <section id="features" className="py-36 md:py-52 px-6 bg-[#0b0f19] relative z-10 scroll-mt-32">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-12 mb-32 text-center md:text-left">
              <div className="max-w-3xl">
                <span className="text-[#d8823b] font-bold uppercase tracking-[0.2em] text-[13px] mb-4 block">Platform Terpadu</span>
                <h2 className="text-[36px] md:text-[54px] font-black text-white leading-[1.1] tracking-tight">
                   MANAJEMEN <br />
                   <span className="text-[#d8823b]">OPERASIONAL</span>
                </h2>
              </div>
              <p className="text-slate-300 text-[18px] md:text-[22px] font-medium max-w-[420px] mx-auto md:mx-0 mb-4 leading-relaxed opacity-80">
                 Teknologi yang dibangun untuk menangani lonjakan transaksi tanpa cacat, memberikan stabilitas bagi bisnis Anda.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-12">
              {FEATURES.map((feature, i) => (
                <div key={i} className="group relative p-10 md:p-16 rounded-[60px] bg-white/[0.015] border border-white/5 hover:border-[#d8823b]/50 hover:bg-white/[0.04] transition-all duration-700 overflow-hidden shadow-2xl backdrop-blur-sm flex flex-col items-center md:items-start text-center md:text-left">
                  <div className="absolute -right-20 -top-20 w-64 h-64 bg-[#d8823b]/5 blur-[100px] rounded-full group-hover:bg-[#d8823b]/15 transition-all duration-700" />
                  <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity">
                     <feature.icon size={120} strokeWidth={1} />
                  </div>
                  <div className={`w-24 h-24 rounded-[32px] flex items-center justify-center mb-12 transition-all group-hover:scale-110 group-hover:rotate-12 duration-700 shadow-3xl ${feature.color}`}>
                    <feature.icon size={48} strokeWidth={2.5} />
                  </div>
                  <h3 className="text-4xl font-black text-white mb-8 tracking-tight group-hover:text-[#d8823b] transition-colors uppercase italic">{feature.title}</h3>
                  <p className="text-slate-200 text-[20px] leading-relaxed mb-12 font-medium opacity-80 group-hover:opacity-100 transition-opacity">{feature.desc}</p>
                  <button 
                    onClick={() => handleFeatureClick(feature)}
                    className="flex items-center gap-4 text-[15px] font-black text-[#d8823b] group-hover:gap-8 transition-all uppercase tracking-[0.3em] italic outline-none focus:ring-2 focus:ring-[#d8823b]/50 rounded-lg"
                  >
                    Master This Feature <ArrowRight size={22} strokeWidth={4} className="group-hover:translate-x-2 transition-transform" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-36 md:py-52 px-6 bg-slate-950/30 relative z-10 scroll-mt-32">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-32">
              <span className="text-[#d8823b] font-bold uppercase tracking-[0.2em] text-[13px] mb-4 block">Investasi Transparan</span>
              <h2 className="text-[36px] md:text-[54px] font-black text-white tracking-tight leading-tight uppercase">PILIHAN PAKET.</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               {PRICING.map((p, i) => (
                 <div key={i} className={`p-12 rounded-[50px] border ${p.color} backdrop-blur-sm transition-all duration-500 hover:-translate-y-4 group`}>
                    <h3 className="text-2xl font-black text-white mb-2 uppercase italic tracking-widest">{p.name}</h3>
                    <p className="text-slate-400 text-sm mb-10 font-medium h-[40px] leading-relaxed">{p.desc}</p>
                    <div className="flex items-baseline gap-2 mb-10">
                       <span className="text-white text-sm font-black uppercase">Rp</span>
                       <span className="text-6xl font-black text-white tracking-tighter group-hover:text-[#d8823b] transition-colors">{p.price}</span>
                       {p.period && <span className="text-slate-400 font-bold">{p.period}</span>}
                    </div>
                    <ul className="space-y-6 mb-12 border-t border-white/5 pt-10">
                       {p.features.map((feature, idx) => (
                         <li key={idx} className="flex items-center gap-4 text-slate-300 font-medium">
                            <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                               <Check size={14} strokeWidth={4} />
                            </div>
                            {feature}
                         </li>
                       ))}
                    </ul>
                    <button 
                      onClick={() => navigate('/register')}
                      className={`w-full py-6 rounded-[28px] font-black text-lg transition-all ${p.period ? 'bg-[#d8823b] text-slate-950' : 'bg-white/5 text-white hover:bg-white/10'}`}
                    >
                      {p.period ? 'Pilih Paket Pro' : 'Mulai Gratis'}
                    </button>
                 </div>
               ))}
            </div>
          </div>
        </section>

        {/* Testimonials - Enhanced Depth */}
        <section id="testimonials" className="py-36 px-6 bg-slate-950/50 relative z-10 scroll-mt-32">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-32">
              <span className="text-[#d8823b] font-bold uppercase tracking-[0.2em] text-[13px] mb-4 block">Kepercayaan</span>
              <h2 className="text-[36px] md:text-[54px] font-black text-white tracking-tight leading-tight uppercase">MITRA KAMI.</h2>
            </div>

            <div className="relative overflow-hidden group">
              {/* Testimonial Track */}
              <div className="flex gap-4 md:gap-8 overflow-x-auto pb-8 snap-x">
                 {TESTIMONIALS.map((t, i) => (
                   <div key={i} className="w-[300px] md:w-[380px] shrink-0 snap-center bg-white/[0.01] border border-white/10 p-6 md:p-10 rounded-[24px] hover:bg-white/[0.04] transition-all duration-300 shadow-xl ring-1 ring-white/5 group/card">
                     <div className="flex gap-1.5 mb-8">
                        {[...Array(t.rating)].map((_, i) => <Star key={i} size={16} fill="#d8823b" className="text-[#d8823b]" />)}
                     </div>
                     <blockquote className="text-slate-200 text-[18px] italic font-medium mb-10 leading-relaxed opacity-90 h-[100px] overflow-hidden">
                       &ldquo;{t.body}&rdquo;
                     </blockquote>
                     <div className="flex items-center gap-5 pt-8 border-t border-white/5">
                        <div className="w-14 h-14 rounded-2xl bg-[#d8823b]/10 border border-[#d8823b]/30 flex items-center justify-center text-[#d8823b] font-black text-xl">
                           {t.name[0]}
                        </div>
                        <div>
                          <div className="text-white font-black text-[16px] group-hover/card:text-[#d8823b] transition-colors">{t.name}</div>
                          <div className="text-white/30 text-[11px] font-black uppercase tracking-widest">{t.handle}</div>
                        </div>
                     </div>
                   </div>
                 ))}
              </div>

              {/* Gradient Overlays */}
              <div className="absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-[#0b0f19] to-transparent z-10" />
              <div className="absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-[#0b0f19] to-transparent z-10" />
            </div>
          </div>
        </section>

        {/* APK CTA Section - Redesigned with Real Slanted Preview */}
        <section id="download" className="py-36 px-6 overflow-hidden relative z-10 scroll-mt-32">
          <div className="max-w-7xl mx-auto bg-gradient-to-br from-[#d8823b] to-[#c87635] rounded-[80px] p-12 md:p-32 relative shadow-[0_60px_200px_rgba(216,130,59,0.4)] ring-1 ring-white/20 group">
             <div className="flex flex-col lg:flex-row items-center justify-between gap-16 lg:gap-24 relative z-10">
               {/* Content Side */}
               <div className="max-w-xl text-slate-950 text-center lg:text-left flex-1">
                 <div className="w-24 h-24 bg-white/30 backdrop-blur-2xl rounded-[32px] flex items-center justify-center mb-10 mx-auto lg:mx-0 shadow-xl border border-white/20 overflow-hidden">
                   <img src={LOGO_ICON} alt="KaffePOS System Icon" className="w-full h-full object-cover scale-110" />
                 </div>
                 <h2 className="text-[42px] md:text-[64px] font-black mb-6 leading-[1.1] tracking-tight text-white">KASIR <br />DI SAKU.</h2>
                 <p className="text-white/80 text-[18px] md:text-[20px] mb-12 font-medium leading-relaxed">Performa andal dalam desain minimalis. Jualan offline, cetak struk instan, pantau stok kapanpun, dimanapun.</p>
                 
                 <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-6">
                    <button 
                      onClick={handleDownload}
                      className="w-full sm:w-auto bg-slate-950 text-white px-12 py-6 rounded-[28px] font-black text-xl flex items-center justify-center gap-4 hover:scale-105 active:scale-95 hover:shadow-2xl transition-all group/btn"
                    >
                      <Download size={28} strokeWidth={3} className="group-hover/btn:translate-y-1 transition-transform" /> UNDUH APK
                    </button>
                 </div>
               </div>

               {/* Preview Side - Triple Fan */}
               <div className="relative group/preview mt-12 lg:mt-0 flex-1 flex justify-center lg:justify-end scale-[0.8] sm:scale-85 md:scale-95 lg:scale-100 transition-transform pt-12">
                  {/* Background Geometric Outline */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] md:w-[420px] aspect-[9/18] border-[2px] border-white/10 rounded-[100px] rotate-0 pointer-events-none z-0 transition-all duration-1000 group-hover/preview:rotate-6" />
                  
                  <div className="relative flex items-end justify-center animate-in zoom-in fade-in slide-in-from-bottom-20 duration-1000 ease-out z-10">
                     {/* Phone Left */}
                     <div className="relative w-[150px] md:w-[200px] aspect-[9/19.5] rounded-[40px] border-[6px] border-slate-950 bg-slate-900 overflow-hidden shadow-2xl -rotate-[6deg] -translate-x-12 translate-y-8 z-10 group-hover/preview:-rotate-[10deg] group-hover/preview:-translate-x-20 transition-all duration-700">
                        <img src={PREVIEW_BRAND} alt="Tampilan Pengaturan Brand KaffePOS" className="w-full h-full object-cover opacity-80 group-hover/preview:opacity-100 transition-opacity" />
                     </div>

                     {/* Phone Center */}
                     <div className="relative w-[180px] md:w-[240px] aspect-[9/19.5] rounded-[45px] border-[8px] border-slate-950 bg-slate-900 overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.5)] z-30 group-hover/preview:scale-105 transition-all duration-700">
                        <img src={PREVIEW_REPORT} alt="Dashboard Laporan Penjualan KaffePOS" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                     </div>

                     {/* Phone Right */}
                     <div className="relative w-[150px] md:w-[200px] aspect-[9/19.5] rounded-[40px] border-[6px] border-slate-950 bg-slate-900 overflow-hidden shadow-2xl rotate-[6deg] translate-x-12 translate-y-8 z-10 group-hover/preview:rotate-[10deg] group-hover/preview:translate-x-20 transition-all duration-700">
                        <img src={PREVIEW_LICENSE} alt="Manajemen Langganan KaffePOS" className="w-full h-full object-cover opacity-80 group-hover/preview:opacity-100 transition-opacity" />
                     </div>
                  </div>
               </div>
             </div>
          </div>
        </section>

        {/* Global CTA - Final Punch */}
        <section className="py-52 px-6 text-center border-t border-white/5 relative z-10">
          <h2 className="text-[60px] md:text-[120px] lg:text-[160px] font-black text-white mb-20 tracking-tighter italic leading-none opacity-90 drop-shadow-2xl">DOMINASI BI<br className="md:hidden" />SNIS ANDA. ⚡</h2>
          <div className="flex flex-wrap justify-center gap-8 mb-28">
             {['OTP Verification', 'Row-Level Security', 'Auto-Sync Ready'].map((badge, i) => (
               <div key={i} className="flex items-center gap-4 px-6 md:px-10 py-3 md:py-5 rounded-[40px] border border-white/10 bg-white/5 text-[11px] md:text-[14px] font-black text-slate-200 uppercase tracking-[0.4em] shadow-lg whitespace-nowrap">
                 <ShieldCheck size={20} className="text-[#d8823b]" /> {badge}
               </div>
             ))}
          </div>
          <button 
            onClick={() => navigate('/register')}
            className="bg-white text-slate-950 px-12 md:px-24 py-6 md:py-10 rounded-[30px] md:rounded-[40px] text-[18px] md:text-[28px] font-black hover:scale-[1.1] active:scale-100 transition-all shadow-[0_0_80px_rgba(255,255,255,0.2)] md:shadow-[0_0_120px_rgba(255,255,255,0.3)] font-sans italic uppercase tracking-widest ring-4 md:ring-8 ring-white/10"
          >
            SAYA MAU GABUNG!
          </button>
        </section>

      </main>

      {/* Download Warning Modal */}
      {showDownloadWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setShowDownloadWarning(false)} />
           <div className="relative bg-[#0b0f19] border border-white/10 p-10 md:p-12 rounded-[50px] max-w-[540px] w-full shadow-[0_50px_100px_rgba(0,0,0,0.8)] animate-in zoom-in slide-in-from-bottom-10 duration-500">
              <div className="w-24 h-24 bg-[#d8823b]/10 rounded-[32px] flex items-center justify-center mb-10 mx-auto border border-[#d8823b]/20">
                 <Lock size={48} style={{ color: BRAND_ACCENT }} />
              </div>
              <h3 className="text-4xl md:text-5xl font-black text-white text-center mb-6 italic leading-tight uppercase tracking-tighter">PERLU PENDAFTARAN. 🛡️</h3>
              <p className="text-slate-300 text-lg md:text-xl text-center mb-10 font-medium leading-relaxed">
                 Fitur unduh APK hanya tersedia untuk pemilik outlet terdaftar guna menjaga keamanan dan lisensi Dashboard Anda.
              </p>
              <div className="flex flex-col gap-4">
                 <button 
                   onClick={() => navigate('/register')}
                   className="w-full bg-[#d8823b] text-slate-950 py-6 rounded-[24px] font-black text-xl shadow-[0_20px_40px_rgba(216,130,59,0.3)] hover:scale-105 transition-all uppercase italic"
                 >
                   Daftar Gratis Sekarang
                 </button>
                 <button 
                   onClick={() => setShowDownloadWarning(false)}
                   className="w-full bg-white/5 text-white py-6 rounded-[24px] font-black text-lg hover:bg-white/10 transition-all uppercase tracking-widest"
                 >
                   Nanti Saja
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Feature Intelligence Detail Overlay */}
      {isFeatureDetailOpen && selectedFeature && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-10">
           <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-3xl animate-in fade-in duration-500" onClick={() => setIsFeatureDetailOpen(false)} />
           
           <div className="relative bg-[#0b0f19] border border-white/10 rounded-[60px] max-w-[900px] w-full max-h-[90vh] overflow-hidden shadow-[0_100px_200px_rgba(0,0,0,0.9)] animate-in zoom-in slide-in-from-bottom-20 duration-700 flex flex-col md:flex-row">
              {/* Left Side: Visual/Metric */}
              <div className={`md:w-1/2 p-12 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-br from-[#0b0f19] to-slate-900`}>
                 <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-[#d8823b] blur-[150px] rounded-full" />
                 </div>

                 {(() => {
                    const detail = FEATURE_DETAILS[selectedFeature.title];
                    const DetailIcon = detail?.icon || HelpCircle;
                    return (
                       <div className="relative z-10 text-center">
                          <div className={`w-32 h-32 rounded-[40px] flex items-center justify-center mx-auto mb-10 shadow-3xl bg-[#d8823b]/10 border border-[#d8823b]/20 text-[#d8823b] animate-bounce duration-[4000ms]`}>
                             <DetailIcon size={64} strokeWidth={1.5} />
                          </div>
                          <div className="text-[12px] font-black uppercase tracking-[0.6em] text-[#d8823b] mb-4 opacity-60">{detail.stats.metric}</div>
                          <div className="text-7xl font-black text-white italic tracking-tighter mb-2">{detail.stats.value}</div>
                          <div className="w-16 h-1 bg-[#d8823b] mx-auto rounded-full mt-8" />
                       </div>
                    );
                 })()}
              </div>

              {/* Right Side: Logic/Content */}
              <div className="md:w-1/2 p-12 md:p-16 overflow-y-auto bg-slate-950/50">
                 <button 
                   onClick={() => setIsFeatureDetailOpen(false)}
                   className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors"
                 >
                    <X size={32} />
                 </button>

                 <h3 className="text-4xl md:text-5xl font-black text-white mb-8 tracking-tighter italic leading-none uppercase">
                    {selectedFeature.title}
                 </h3>
                 
                 <p className="text-slate-300 text-[18px] md:text-[20px] font-medium leading-relaxed mb-12 opacity-80">
                    {FEATURE_DETAILS[selectedFeature.title]?.details}
                 </p>

                 <div className="space-y-6">
                    <h4 className="text-[11px] font-black text-[#d8823b] uppercase tracking-[0.5em] mb-4">Technical Advantage</h4>
                    {FEATURE_DETAILS[selectedFeature.title]?.highlights.map((h: string, idx: number) => (
                       <div key={idx} className="flex items-center gap-5 group/item">
                          <div className="w-2 h-2 rounded-full bg-[#d8823b] group-hover/item:scale-150 transition-transform" />
                          <span className="text-white font-black text-[16px] tracking-tight group-hover/item:text-[#d8823b] transition-colors italic uppercase">{h}</span>
                       </div>
                    ))}
                 </div>

                 <button 
                   onClick={() => setIsFeatureDetailOpen(false)}
                   className="mt-16 w-full py-6 rounded-[24px] bg-white/5 border border-white/10 text-white font-black hover:bg-white/10 transition-all uppercase tracking-widest italic"
                 >
                    Kembali Ke Welcome Page
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Safe Detail Overlay - Legal & Advisory */}
      {isSafeDetailOpen && selectedSafeItem && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-10">
           <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-3xl animate-in fade-in duration-500" onClick={() => setIsSafeDetailOpen(false)} />
           
           <div className="relative bg-[#0b0f19] border border-white/10 rounded-[60px] max-w-[800px] w-full max-h-[85vh] overflow-hidden shadow-[0_100px_200px_rgba(0,0,0,0.9)] animate-in zoom-in slide-in-from-bottom-20 duration-700 flex flex-col">
              {/* Header Box */}
              <div className="p-12 md:p-16 bg-gradient-to-br from-slate-900 to-[#0b0f19] border-b border-white/5 relative">
                 <button 
                   onClick={() => setIsSafeDetailOpen(false)}
                   className="absolute top-8 right-8 text-slate-500 hover:text-white transition-colors"
                 >
                    <X size={32} />
                 </button>

                 <div className="flex items-center gap-8 mb-8">
                    {(() => {
                       const item = SAFE_CONTENT[selectedSafeItem];
                       const ItemIcon = item?.icon || Shield;
                       return (
                          <div className="w-20 h-20 rounded-[28px] bg-[#d8823b]/10 border border-[#d8823b]/20 flex items-center justify-center text-[#d8823b]">
                             <ItemIcon size={40} />
                          </div>
                       );
                    })()}
                    <div>
                       <h3 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter uppercase leading-none">
                          {selectedSafeItem}
                       </h3>
                       <p className="text-[#d8823b] font-black text-[12px] uppercase tracking-[0.5em] mt-3 italic">Kebijakan & Keamanan</p>
                    </div>
                 </div>

                 <p className="text-slate-300 text-lg md:text-xl font-medium leading-relaxed opacity-80 max-w-2xl">
                    {SAFE_CONTENT[selectedSafeItem]?.description}
                 </p>
              </div>

              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto p-12 md:p-16 bg-slate-950/30">
                 <div className="space-y-12">
                    {SAFE_CONTENT[selectedSafeItem]?.points.map((p, idx: number) => (
                       <div key={idx} className="group/safe-item">
                          <div className="flex items-center gap-5 mb-4">
                             <div className="w-6 h-[2px] bg-[#d8823b]/50 group-hover/safe-item:w-10 group-hover/safe-item:bg-[#d8823b] transition-all" />
                             <h4 className="text-white font-black text-xl italic uppercase tracking-tight group-hover/safe-item:text-[#d8823b] transition-colors">
                                {p.title}
                             </h4>
                          </div>
                          <p className="text-slate-400 text-lg leading-relaxed ml-11 font-medium group-hover/safe-item:text-slate-200 transition-colors">
                             {p.detail}
                          </p>
                       </div>
                    ))}
                 </div>

                 <div className="mt-20 pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="text-slate-500 text-sm font-black italic tracking-widest">VERIFIED BY KAFFEPOS PLATFORM INTERNAL AUDIT . 2026</div>
                    <button 
                      onClick={() => setIsSafeDetailOpen(false)}
                      className="px-12 py-5 rounded-[20px] bg-white/5 text-white font-black text-sm hover:bg-white/10 transition-all uppercase tracking-[0.3em] italic border border-white/10"
                    >
                       Tutup Dokumen
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Footer - Solid & Enterprise */}
      <footer className="py-32 px-6 border-t border-white/5 bg-slate-950/95 relative z-10" role="contentinfo">
        {/* Animated Coffee Beans Floating in Background */}
        <div className="absolute top-[20%] left-[5%] opacity-10 animate-float hidden lg:block">
           <Coffee size={40} strokeWidth={1.5} className="text-[#d8823b]" />
        </div>
        <div className="absolute bottom-[40%] right-[10%] opacity-10 animate-float hidden lg:block" style={{ animationDelay: '2s' }}>
           <Coffee size={60} strokeWidth={1.5} className="text-[#d8823b]" />
        </div>

        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-24 mb-32 text-center md:text-left">
            <div className="col-span-2">
              <div className="flex justify-center md:justify-start mb-12 group cursor-pointer" onClick={() => navigate('/welcome')}>
                <div className="h-16 md:h-20 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                  <img
                    src={LOGO_WEB}
                    alt="KaffePOS"
                    className="h-full w-auto object-contain opacity-100"
                    loading="eager"
                  />
                </div>
              </div>
              <p className="text-slate-400 text-[17px] font-medium leading-relaxed max-w-[320px] mx-auto md:mx-0 opacity-80">
                Membangun ekosistem digital untuk kemandirian ekonomi UMKM Indonesia. Teknologi lokal kualitas global.
              </p>
            </div>
            
            <div className="col-span-1">
              <h4 className="text-white font-black text-sm mb-12 uppercase tracking-[0.4em] opacity-100 italic">CORE</h4>
              <ul className="space-y-8 text-sm text-slate-400 font-black list-none p-0 tracking-widest">
                <li className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2">POS SYSTEM</li>
                <li className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2">INVENTORY</li>
                <li className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2">AI ANALYTICS</li>
                <li className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2">STABLE APK</li>
              </ul>
            </div>

            <div className="col-span-1">
              <h4 className="text-white font-black text-sm mb-12 uppercase tracking-[0.4em] opacity-100 italic">HUB</h4>
              <ul className="space-y-8 text-sm text-slate-400 font-black list-none p-0 tracking-widest">
                <li className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2">RESOURCES</li>
                <li className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2">COMMUNITY</li>
                <li className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2">CHANGELOG</li>
                <li className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2">YOUTUBE</li>
              </ul>
            </div>

            <div className="col-span-1">
              <h4 className="text-white font-black text-sm mb-12 uppercase tracking-[0.4em] opacity-100 italic">SAFE</h4>
              <ul className="space-y-8 text-sm text-slate-400 font-black list-none p-0 tracking-widest">
                <li 
                  onClick={() => { setSelectedSafeItem('ADVISORY'); setIsSafeDetailOpen(true); }}
                  className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2"
                >ADVISORY</li>
                <li 
                  onClick={() => { setSelectedSafeItem('TERMS'); setIsSafeDetailOpen(true); }}
                  className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2"
                >TERMS</li>
                <li 
                  onClick={() => { setSelectedSafeItem('PRIVACY'); setIsSafeDetailOpen(true); }}
                  className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2"
                >PRIVACY</li>
                <li 
                  onClick={() => { setSelectedSafeItem('AUDIT'); setIsSafeDetailOpen(true); }}
                  className="hover:text-[#d8823b] transition-all cursor-pointer hover:translate-x-2"
                >AUDIT</li>
              </ul>
            </div>

            <div className="col-span-1">
              <h4 className="text-white font-black text-sm mb-12 uppercase tracking-[0.4em] opacity-100 italic">SOCIAL</h4>
              <div className="flex justify-center md:justify-start gap-4 flex-wrap">
                 <a 
                   href="https://wa.me/6285186076224"
                   target="_blank"
                   rel="noopener noreferrer"
                   className="w-14 h-14 rounded-[20px] bg-white/[0.03] border border-white/5 flex items-center justify-center text-slate-400 hover:text-[#25D366] hover:border-[#25D366]/50 transition-all cursor-pointer shadow-xl hover:scale-110 active:scale-95 group"
                   title="WhatsApp KaffePOS"
                 >
                    <MessageCircle size={28} className="group-hover:rotate-12 transition-transform" />
                 </a>
                 <a 
                   href="https://instagram.com/kaffepos"
                   target="_blank"
                   rel="noopener noreferrer"
                   className="w-14 h-14 rounded-[20px] bg-white/[0.03] border border-white/5 flex items-center justify-center text-slate-400 hover:text-[#E4405F] hover:border-[#E4405F]/50 transition-all cursor-pointer shadow-xl hover:scale-110 active:scale-95 group"
                   title="Instagram KaffePOS"
                 >
                    <Instagram size={28} className="group-hover:-translate-y-1 transition-transform" />
                 </a>
                 <div className="w-14 h-14 rounded-[20px] bg-white/[0.03] border border-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:border-[#d8823b] transition-all cursor-pointer shadow-xl hover:scale-110 active:scale-95 group">
                    <Rocket size={28} className="group-hover:-translate-y-1 transition-transform" />
                 </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between pt-16 border-t border-white/5 gap-12">
            <div className="text-slate-500 text-[14px] font-black italic tracking-[0.2em] text-center md:text-left opacity-60">
              &copy; 2026 KAFFEPOS PLATFORM. BUILT FOR DOMINANCE. ☕
            </div>
            <div className="flex items-center gap-4 text-emerald-500 font-black text-[12px] tracking-[0.5em] uppercase px-6 py-2 rounded-full bg-emerald-500/5 border border-emerald-500/10">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              SYSTEM AAA STATUS
            </div>
          </div>
        </div>
      </footer>

      {/* Back to Top */}
      {showScrollTop && (
        <button 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-12 right-12 z-[60] bg-[#d8823b] text-slate-950 w-20 h-20 rounded-[32px] flex items-center justify-center shadow-[0_30px_60px_rgba(216,130,59,0.4)] hover:scale-110 active:scale-90 transition-all animate-in fade-in zoom-in duration-500 ring-8 ring-[#d8823b]/20"
          aria-label="Kembali ke atas"
        >
          <ArrowUp size={36} strokeWidth={4} />
        </button>
      )}

    </div>
  );
}
