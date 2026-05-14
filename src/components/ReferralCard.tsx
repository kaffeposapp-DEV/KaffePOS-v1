import { useState, useEffect } from 'react';
import { Copy, Share2, Users, TrendingUp, Gift } from 'lucide-react';
import { generateReferralCode, getReferralStats } from '@/lib/backendApi';
import { formatCurrency } from '@/utils/formatCurrency';
import type { ReferralStats } from '@/types/affiliate';

export function ReferralCard() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      setLoading(true);
      const data = await getReferralStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load referral stats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateCode() {
    try {
      setGenerating(true);
      await generateReferralCode();
      await loadStats();
    } catch (error) {
      console.error('Failed to generate referral code:', error);
      alert('Gagal membuat kode referral');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyLink() {
    if (!stats?.referral_code) return;

    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.kaffepos.my.id';
    const referralLink = `${apiBaseUrl}/ref/${stats.referral_code.code}`;

    try {
      await navigator.clipboard.writeText(referralLink);
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);

      // Track analytics
      if (window.gtag) {
        window.gtag('event', 'referral_code_copied', {
          referral_code: stats.referral_code.code,
        });
      }
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Gagal menyalin link');
    }
  }

  async function handleShare() {
    if (!stats?.referral_code) return;

    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.kaffepos.my.id';
    const referralLink = `${apiBaseUrl}/ref/${stats.referral_code.code}`;
    const shareText = `Coba KaffePOS untuk kelola kedai kopi kamu! Daftar pakai link ini dan kita berdua dapat bonus: ${referralLink}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Ajak Teman ke KaffePOS',
          text: shareText,
          url: referralLink,
        });

        // Track analytics
        if (window.gtag) {
          window.gtag('event', 'referral_link_shared', {
            referral_code: stats.referral_code.code,
          });
        }
      } catch (error) {
        console.error('Failed to share:', error);
      }
    } else {
      handleCopyLink();
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!stats?.referral_code) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center py-8">
          <Gift className="w-12 h-12 text-orange-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Ajak Teman, Dapat Bonus!
          </h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Dapatkan bonus Rp150.000 untuk setiap teman yang berlangganan paket berbayar dan aktif 30 hari.
          </p>
          <button
            onClick={handleGenerateCode}
            disabled={generating}
            className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Membuat...' : 'Buat Kode Referral'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Program Referral</h3>
        <Gift className="w-5 h-5 text-orange-500" />
      </div>

      {/* Referral Code */}
      <div className="bg-orange-50 rounded-lg p-4 mb-6">
        <p className="text-sm text-gray-600 mb-2">Kode Referral Kamu</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-2xl font-bold text-orange-600 tracking-wider">
            {stats.referral_code.code}
          </code>
          <button
            onClick={handleCopyLink}
            className="p-2 hover:bg-orange-100 rounded-lg transition-colors"
            title="Salin Link"
          >
            <Copy className={`w-5 h-5 ${copying ? 'text-green-600' : 'text-orange-600'}`} />
          </button>
          <button
            onClick={handleShare}
            className="p-2 hover:bg-orange-100 rounded-lg transition-colors"
            title="Bagikan"
          >
            <Share2 className="w-5 h-5 text-orange-600" />
          </button>
        </div>
        {copying && (
          <p className="text-sm text-green-600 mt-2">Link berhasil disalin!</p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <Users className="w-5 h-5 text-gray-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{stats.total_clicks}</p>
          <p className="text-xs text-gray-600">Klik</p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <TrendingUp className="w-5 h-5 text-gray-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{stats.total_registrations}</p>
          <p className="text-xs text-gray-600">Pendaftaran</p>
        </div>
        <div className="text-center p-4 bg-orange-50 rounded-lg">
          <Gift className="w-5 h-5 text-orange-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-orange-600">{stats.total_paid_conversions}</p>
          <p className="text-xs text-gray-600">Berbayar</p>
        </div>
      </div>

      {/* Total Rewards */}
      <div className="border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Total Bonus Diterima</span>
          <span className="text-lg font-bold text-orange-600">
            {formatCurrency(stats.total_rewards_earned_idr ?? 0)}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-xs text-blue-800">
          💡 Bonus Rp150.000 akan diberikan setelah teman yang kamu ajak berlangganan paket berbayar dan aktif selama 30 hari.
        </p>
      </div>
    </div>
  );
}
