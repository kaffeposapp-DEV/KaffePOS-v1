type ErrorLike = {
  message?: string | undefined;
  status?: number | undefined;
};

const INTERNAL_ERROR_PATTERNS = [
  'terjadi kesalahan di backend',
  'terjadi kesalahan dibackend',
  'internal_server_error',
  'invalid input syntax',
  'violates foreign key',
  'violates unique constraint',
  'duplicate key value',
  'syntax for type',
  'postgres',
  'stack trace',
  'query failed',
  'database error',
  'pg_',
  'connection refused',
  'econnrefused',
  'etimedout',
  'connection timeout',
  'pool timeout',
  'database connection',
  'connect timeout',
];


const DATABASE_ERROR_MESSAGE = 'Server sedang mengalami gangguan. Tim kami sedang memperbaikinya. Coba lagi dalam beberapa menit.';
const CONNECTION_ERROR_MESSAGE = 'Tidak bisa terhubung ke server. Pastikan internet aktif atau coba lagi beberapa saat.';
const OFFLINE_ERROR_MESSAGE = 'Perangkat sedang offline. Sambungkan internet lalu coba lagi.';
const TIMEOUT_ERROR_MESSAGE = 'Koneksi ke server terlalu lama. Coba lagi beberapa saat.';

function readErrorLike(error: unknown): ErrorLike {
  if (!error) return {};
  if (typeof error === 'string') return { message: error };
  if (error instanceof Error) {
    const maybeStatus = (error as Error & { status?: unknown }).status;
    return {
      message: error.message,
      status: typeof maybeStatus === 'number' ? maybeStatus : undefined,
    };
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      message: typeof record.message === 'string' ? record.message : undefined,
      status: typeof record.status === 'number' ? record.status : undefined,
    };
  }
  return {};
}

function isUnsafeMessage(message: string) {
  const lower = message.toLowerCase();
  return INTERNAL_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function normalizeUserFacingError(
  error: unknown,
  fallback = 'Terjadi gangguan pada server. Coba lagi beberapa saat.',
) {
  const { message = '', status } = readErrorLike(error);
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'email_not_confirmed') {
    return 'email_not_confirmed';
  }

    // Check for database connection errors
  if (
    lower.includes('database') ||
    lower.includes('econnrefused') ||
    lower.includes('connection refused') ||
    lower.includes('etimedout') ||
    lower.includes('pool timeout') ||
    lower.includes('connect timeout')
  ) {
    return DATABASE_ERROR_MESSAGE;
  }

  if (lower.includes('internet disconnected') || lower.includes('err_internet_disconnected') || lower.includes('offline')) {
    return OFFLINE_ERROR_MESSAGE;
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return TIMEOUT_ERROR_MESSAGE;
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('load failed') ||
    lower.includes('cors') ||
    lower.includes('ssl') ||
    lower.includes('certificate') ||
    lower.includes('err_cleartext_not_permitted')
  ) {
    return CONNECTION_ERROR_MESSAGE;
  }

  if (status === 401) {
    const looksLikeLoginOrAccountMessage = [
      'email atau password salah',
      'email atau kata sandi salah',
      'email belum terverifikasi',
      'akun belum aktif',
      'akun belum punya password aktif',
      'akun kasir nonaktif',
      'akun tidak aktif',
      'akun tidak ditemukan',
    ].some((pattern) => lower.includes(pattern));

    return trimmed && looksLikeLoginOrAccountMessage && !isUnsafeMessage(trimmed)
      ? trimmed
      : 'Sesi login berakhir. Silakan masuk ulang.';
  }
  if (status === 403) return 'Akses akun ini tidak diizinkan untuk tindakan tersebut.';
  if (status === 404) return 'Data tidak ditemukan. Coba muat ulang halaman.';
  if (status === 409 && !isUnsafeMessage(trimmed)) return trimmed || 'Data sudah berubah. Muat ulang lalu coba lagi.';
  if ((status === 400 || status === 422) && !isUnsafeMessage(trimmed)) {
    return trimmed || 'Data belum valid. Periksa kembali isian.';
  }
  if (status && status >= 500) return fallback;
  if (!trimmed || isUnsafeMessage(trimmed)) return fallback;

  return trimmed;
}

export function getRecipeSaveErrorMessage(error: unknown) {
  const { status, message = '' } = readErrorLike(error);
  const lower = message.toLowerCase();

  if (status === 401 || status === 403) return normalizeUserFacingError(error);
  if (status === 404) return 'Produk atau bahan baku tidak ditemukan. Coba muat ulang halaman.';
  if (
    status === 400 ||
    status === 422 ||
    isUnsafeMessage(message) ||
    lower.includes('menu belum bisa') ||
    lower.includes('resep') ||
    lower.includes('recipe') ||
    lower.includes('json')
  ) {
    return 'Resep belum bisa disimpan. Periksa kembali produk, bahan baku, dan jumlah per porsi.';
  }

  return normalizeUserFacingError(error, 'Resep belum bisa disimpan. Coba lagi beberapa saat.');
}
