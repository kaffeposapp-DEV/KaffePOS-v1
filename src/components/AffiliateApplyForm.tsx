import { useState } from 'react';
import { CheckCircle, DollarSign, Users, TrendingUp } from 'lucide-react';
import { applyForAffiliate } from '@/lib/backendApi';

interface AffiliateApplyFormProps {
  onSuccess?: () => void;
}

export function AffiliateApplyForm({ onSuccess }: AffiliateApplyFormProps) {
  const [step, setStep] = useState<'info' | 'form' | 'success'>('info');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState('bank_transfer');
  const [payoutDetails, setPayoutDetails] = useState({
    bank_name: '',
    account_number: '',
    account_holder: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!acceptedTerms) {
      setError('Kamu harus menyetujui syarat dan ketentuan');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await applyForAffiliate({
        payoutName: payoutDetails.account_holder || 'Affiliate KaffePOS',
        payoutBankName: payoutDetails.bank_name,
        payoutAccountNumber: payoutDetails.account_number,
        payoutAccountHolder: payoutDetails.account_holder,
        acceptedTerms: true,
        termsVersion: 'v1',
      });

      // Track analytics
      if (window.gtag) {
        window.gtag('event', 'affiliate_application_submitted', {
          payout_method: payoutMethod,
        });
      }

      setStep('success');
      if (onSuccess) {
        setTimeout(onSuccess, 2000);
      }
    } catch (err) {
      console.error('Failed to apply for affiliate:', err);
      setError(err instanceof Error ? err.message : 'Gagal mengirim aplikasi');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'success') {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Aplikasi Berhasil Dikirim!
          </h3>
          <p className="text-gray-600 mb-6">
            Tim kami akan meninjau aplikasi kamu dalam 1-2 hari kerja. Kamu akan menerima notifikasi setelah aplikasi disetujui.
          </p>
          <button type="button"
            onClick={() => onSuccess?.()}
            className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Kembali ke Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (step === 'info') {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Bergabung dengan Program Affiliate KaffePOS
          </h2>
          <p className="text-gray-600 mb-6">
            Dapatkan penghasilan tambahan dengan merekomendasikan KaffePOS ke pemilik kedai kopi lainnya.
          </p>

          {/* Benefits */}
          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-4 p-4 bg-orange-50 rounded-lg">
              <DollarSign className="w-6 h-6 text-orange-600 flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Komisi 20%</h4>
                <p className="text-sm text-gray-600">
                  Dapatkan 20% dari pembayaran pertama setiap customer yang kamu referensikan.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg">
              <Users className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Tanpa Batas</h4>
                <p className="text-sm text-gray-600">
                  Tidak ada batasan jumlah referral. Semakin banyak kamu referensikan, semakin besar penghasilan kamu.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Dashboard Real-time</h4>
                <p className="text-sm text-gray-600">
                  Pantau klik, registrasi, konversi, dan komisi kamu secara real-time.
                </p>
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div className="bg-gray-50 rounded-lg p-6 mb-8">
            <h4 className="font-semibold text-gray-900 mb-3">Syarat & Ketentuan</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Memiliki akun KaffePOS aktif</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Komisi dibayarkan setelah customer aktif 30 hari</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Pembayaran komisi dilakukan setiap bulan via transfer bank</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                <span>Tidak diperbolehkan melakukan self-referral atau referral palsu</span>
              </li>
            </ul>
          </div>

          <div className="flex gap-4">
            <button type="button"
              onClick={() => setStep('form')}
              className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
            >
              Daftar Sekarang
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div className="max-w-xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Formulir Aplikasi Affiliate
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Payout Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Metode Pembayaran
            </label>
            <select
              value={payoutMethod}
              onChange={(e) => setPayoutMethod(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              required
            >
              <option value="bank_transfer">Transfer Bank</option>
              <option value="e_wallet" disabled>E-Wallet (segera hadir)</option>
            </select>
          </div>

          {/* Bank Details */}
          {payoutMethod === 'bank_transfer' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nama Bank
                </label>
                <input
                  type="text"
                  value={payoutDetails.bank_name}
                  onChange={(e) => setPayoutDetails({ ...payoutDetails, bank_name: e.target.value })}
                  placeholder="Contoh: BCA, Mandiri, BNI"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nomor Rekening
                </label>
                <input
                  type="text"
                  value={payoutDetails.account_number}
                  onChange={(e) => setPayoutDetails({ ...payoutDetails, account_number: e.target.value })}
                  placeholder="1234567890"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nama Pemilik Rekening
                </label>
                <input
                  type="text"
                  value={payoutDetails.account_holder}
                  onChange={(e) => setPayoutDetails({ ...payoutDetails, account_holder: e.target.value })}
                  placeholder="Nama sesuai rekening bank"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                />
              </div>
            </>
          )}

          {/* Terms Acceptance */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="terms"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
            />
            <label htmlFor="terms" className="text-sm text-gray-600">
              Saya menyetujui syarat dan ketentuan program affiliate KaffePOS dan berkomitmen untuk tidak melakukan self-referral atau referral palsu.
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setStep('info')}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Kembali
            </button>
            <button
              type="submit"
              disabled={loading || !acceptedTerms}
              className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? 'Mengirim...' : 'Kirim Aplikasi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
