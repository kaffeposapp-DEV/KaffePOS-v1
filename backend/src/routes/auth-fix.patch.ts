// Patch untuk memperbaiki error handling di login endpoint
// Tambahkan logging yang lebih baik dan error messages yang lebih spesifik

import { log } from '../core/errors';

// Fungsi helper untuk log error dengan detail
export function logAuthError(context: string, error: unknown, metadata?: Record<string, unknown>) {
  log('error', `auth.${context}`, {
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : error,
    ...metadata,
  });
}

// Fungsi untuk detect database connection error
export function isDatabaseConnectionError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  
  return (
    lower.includes('econnrefused') ||
    lower.includes('connection refused') ||
    lower.includes('connect econnrefused') ||
    lower.includes('connection terminated') ||
    lower.includes('connection timeout') ||
    lower.includes('database') && lower.includes('not') && lower.includes('connect') ||
    lower.includes('pool') && lower.includes('timeout') ||
    lower.includes('ssl') && lower.includes('connection')
  );
}

// Fungsi untuk convert error ke user-friendly message
export function getAuthErrorMessage(error: unknown): string {
  if (isDatabaseConnectionError(error)) {
    return 'Server sedang mengalami gangguan koneksi database. Tim kami sedang memperbaikinya. Coba lagi dalam beberapa menit.';
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Rate limit errors
    if (message.includes('too many') || message.includes('rate limit')) {
      return 'Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.';
    }
    
    // Timeout errors
    if (message.includes('timeout')) {
      return 'Koneksi ke server terlalu lama. Periksa koneksi internet Anda dan coba lagi.';
    }
  }
  
  return 'Login belum bisa diproses. Coba lagi beberapa saat.';
}
