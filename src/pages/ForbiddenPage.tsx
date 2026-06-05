import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Home, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function ForbiddenPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const handleGoHome = () => {
    navigate('/');
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-orange-600" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Akses Ditolak
          </h1>

          {/* Message */}
          <p className="text-gray-600 mb-6">
            Maaf, Anda tidak memiliki izin untuk mengakses halaman ini.
            {role === 'cashier' && (
              <span className="block mt-2 text-sm">
                Akun kasir hanya dapat mengakses POS, Kitchen, dan History.
              </span>
            )}
          </p>

          {/* User Info */}
          {user?.email && (
            <div className="bg-gray-50 rounded-lg p-3 mb-6">
              <p className="text-sm text-gray-500">Login sebagai:</p>
              <p className="text-sm font-medium text-gray-900">{user.email}</p>
              <p className="text-xs text-gray-500 mt-1">
                Role: {role === 'owner_admin' ? 'Owner/Admin' : 'Kasir'}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button type="button"
              onClick={handleGoHome}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Home className="w-5 h-5" />
              Kembali ke Beranda
            </button>

            <button type="button"
              onClick={handleGoBack}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Kembali
            </button>
          </div>

          {/* Help Text */}
          <p className="text-xs text-gray-500 mt-6">
            Jika Anda merasa ini adalah kesalahan, hubungi Owner/Admin Anda.
          </p>
        </div>
      </div>
    </div>
  );
}
