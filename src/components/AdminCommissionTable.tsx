import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { adminGetCommissions, adminApproveCommission, adminRejectCommission, adminMarkCommissionPaid } from '@/lib/backendApi';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatDate } from '@/utils/formatDate';
import type { AdminCommissionListItem, CommissionStatus } from '@/types/affiliate';

export function AdminCommissionTable() {
  const [commissions, setCommissions] = useState<AdminCommissionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CommissionStatus | 'all'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadCommissions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminGetCommissions({ status: filter === 'all' ? 'all' : filter });
      setCommissions(data.items);
    } catch (error) {
      console.error('Failed to load commissions:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadCommissions();
  }, [loadCommissions]);

  async function handleApprove(commissionId: string) {
    if (!confirm('Setujui komisi ini?')) return;

    try {
      setActionLoading(commissionId);
      await adminApproveCommission(commissionId);
      await loadCommissions();
    } catch (error) {
      console.error('Failed to approve commission:', error);
      alert('Gagal menyetujui komisi');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(commissionId: string) {
    const reason = prompt('Alasan penolakan:');
    if (!reason) return;

    try {
      setActionLoading(commissionId);
      await adminRejectCommission(commissionId, reason);
      await loadCommissions();
    } catch (error) {
      console.error('Failed to reject commission:', error);
      alert('Gagal menolak komisi');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleMarkPaid(commissionId: string) {
    if (!confirm('Tandai komisi ini sebagai sudah dibayar?')) return;

    try {
      setActionLoading(commissionId);
      await adminMarkCommissionPaid(commissionId);
      await loadCommissions();
    } catch (error) {
      console.error('Failed to mark commission as paid:', error);
      alert('Gagal menandai komisi sebagai dibayar');
    } finally {
      setActionLoading(null);
    }
  }

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

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Manajemen Komisi</h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as CommissionStatus | 'all')}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        >
          <option value="all">Semua Status</option>
          <option value="eligible">Memenuhi Syarat</option>
          <option value="approved">Disetujui</option>
          <option value="paid">Dibayar</option>
          <option value="rejected">Ditolak</option>
        </select>
      </div>

      {commissions.length === 0 ? (
        <p className="text-gray-500 text-center py-8">Tidak ada komisi</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Tanggal</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Affiliate</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Customer</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Pembayaran</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Komisi</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">Status</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((commission) => (
                <tr key={commission.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">
                    {formatDate(commission.created_at)}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <div className="font-medium text-gray-900">{commission.affiliate_name}</div>
                    <div className="text-gray-500 text-xs">{commission.affiliate_email}</div>
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <div className="font-medium text-gray-900">{commission.referred_name}</div>
                    <div className="text-gray-500 text-xs">{commission.referred_email}</div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 text-right">
                    {formatCurrency(commission.payment_amount_idr ?? 0)}
                  </td>
                  <td className="py-3 px-4 text-sm font-semibold text-orange-600 text-right">
                    {formatCurrency(commission.commission_amount_idr ?? commission.amount ?? 0)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(commission.status)}`}>
                      {commission.status}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-2">
                      {commission.status === 'eligible' && (
                        <>
                          <button
                            onClick={() => handleApprove(commission.id)}
                            disabled={actionLoading === commission.id}
                            className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                            title="Setujui"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleReject(commission.id)}
                            disabled={actionLoading === commission.id}
                            className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                            title="Tolak"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </>
                      )}
                      {commission.status === 'approved' && (
                        <button
                          onClick={() => handleMarkPaid(commission.id)}
                          disabled={actionLoading === commission.id}
                          className="p-1 text-orange-600 hover:bg-orange-50 rounded disabled:opacity-50"
                          title="Tandai Dibayar"
                        >
                          <DollarSign className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
