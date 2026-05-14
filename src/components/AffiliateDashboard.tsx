import { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Clock, CheckCircle, Users } from 'lucide-react';
import { getAffiliateDashboard } from '@/lib/backendApi';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import type { AffiliateDashboardData as AffiliateDashboardType } from '@/types/affiliate';

export function AffiliateDashboard() {
  const [dashboard, setDashboard] = useState<AffiliateDashboardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAffiliateDashboard();
      setDashboard(data);
    } catch (err) {
      console.error('Failed to load affiliate dashboard:', err);
      setError(err instanceof Error ? err.message : 'Gagal memuat dashboard affiliate');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <p className="text-red-600">{error || 'Data tidak tersedia'}</p>
      </div>
    );
  }

  const { affiliate_profile } = dashboard;
  const pending_commission_idr = dashboard.pending_commission;
  const approved_commission_idr = dashboard.approved_commission;
  const paid_commission_idr = dashboard.paid_commission;
  const recent_commissions = dashboard.commission_history;

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      eligible: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      paid: 'bg-gray-100 text-gray-800',
      rejected: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-600',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      pending: 'Menunggu',
      eligible: 'Memenuhi Syarat',
      approved: 'Disetujui',
      paid: 'Dibayar',
      rejected: 'Ditolak',
      cancelled: 'Dibatalkan',
    };
    return labels[status as keyof typeof labels] || status;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard Affiliate</h2>
        <p className="text-gray-600 mt-1">
          Status: <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            affiliate_profile.status === 'active' ? 'bg-green-100 text-green-800' :
            affiliate_profile.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
            affiliate_profile.status === 'suspended' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {affiliate_profile.status === 'active' ? 'Aktif' :
             affiliate_profile.status === 'pending' ? 'Menunggu Persetujuan' :
             affiliate_profile.status === 'suspended' ? 'Ditangguhkan' :
             affiliate_profile.status === 'rejected' ? 'Ditolak' : affiliate_profile.status}
          </span>
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{affiliate_profile.total_clicks}</p>
          <p className="text-sm text-gray-600">Total Klik</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{affiliate_profile.total_registrations}</p>
          <p className="text-sm text-gray-600">Pendaftaran</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{affiliate_profile.total_paid_conversions}</p>
          <p className="text-sm text-gray-600">Konversi Berbayar</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-5 h-5 text-orange-500" />
          </div>
          <p className="text-2xl font-bold text-orange-600">
            {formatCurrency(affiliate_profile.total_commission_earned_idr)}
          </p>
          <p className="text-sm text-gray-600">Total Komisi</p>
        </div>
      </div>

      {/* Commission Summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Ringkasan Komisi</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-yellow-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-900">Menunggu</span>
            </div>
            <p className="text-xl font-bold text-yellow-600">{formatCurrency(pending_commission_idr)}</p>
          </div>

          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-900">Disetujui</span>
            </div>
            <p className="text-xl font-bold text-green-600">{formatCurrency(approved_commission_idr)}</p>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-900">Dibayar</span>
            </div>
            <p className="text-xl font-bold text-gray-600">{formatCurrency(paid_commission_idr)}</p>
          </div>
        </div>
      </div>

      {/* Recent Commissions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Komisi Terbaru</h3>
        {recent_commissions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Belum ada komisi</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Tanggal</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Order ID</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Pembayaran</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Komisi</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent_commissions.map((commission) => (
                  <tr key={commission.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {formatDate(commission.created_at)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 font-mono">
                      {commission.payment_order_id?.substring(0, 12)}...
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 text-right">
                      {formatCurrency(commission.payment_amount_idr ?? 0)}
                    </td>
                    <td className="py-3 px-4 text-sm font-semibold text-orange-600 text-right">
                      {formatCurrency(commission.commission_amount_idr ?? commission.amount ?? 0)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(commission.status)}`}>
                        {getStatusLabel(commission.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-50 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          💡 Komisi {affiliate_profile.commission_rate}% dari pembayaran pertama customer akan disetujui setelah customer aktif 30 hari. Pembayaran komisi dilakukan setiap bulan.
        </p>
      </div>
    </div>
  );
}
