import { describe, expect, it } from 'vitest';
import { getRecipeSaveErrorMessage, normalizeUserFacingError } from './errorMessages';

describe('user-facing error messages', () => {
  it('hides generic backend/internal wording from users', () => {
    expect(normalizeUserFacingError({ message: 'Terjadi kesalahan di backend.', status: 500 })).toBe(
      'Terjadi gangguan pada server. Coba lagi beberapa saat.',
    );
    expect(normalizeUserFacingError({ message: 'invalid input syntax for type json', status: 500 })).toBe(
      'Terjadi gangguan pada server. Coba lagi beberapa saat.',
    );
  });

  it('keeps actionable validation messages safe to show', () => {
    expect(normalizeUserFacingError({ message: 'Voucher tidak berlaku untuk paket ini.', status: 422 })).toBe(
      'Voucher tidak berlaku untuk paket ini.',
    );
  });

  it('maps fetch/network failures to a helpful connection message', () => {
    expect(normalizeUserFacingError(new TypeError('Failed to fetch'))).toBe(
      'Tidak bisa terhubung ke server. Pastikan internet aktif atau coba lagi beberapa saat.',
    );
    expect(normalizeUserFacingError(new TypeError('Network request failed'))).toBe(
      'Tidak bisa terhubung ke server. Pastikan internet aktif atau coba lagi beberapa saat.',
    );
  });

  it('distinguishes offline and timeout failures without exposing technical details', () => {
    expect(normalizeUserFacingError(new TypeError('net::ERR_INTERNET_DISCONNECTED'))).toBe(
      'Perangkat sedang offline. Sambungkan internet lalu coba lagi.',
    );
    expect(normalizeUserFacingError(new Error('Request timeout'))).toBe(
      'Koneksi ke server terlalu lama. Coba lagi beberapa saat.',
    );
  });

  it('preserves safe invalid-credential messages on login 401 responses', () => {
    expect(normalizeUserFacingError({ message: 'Email atau password salah.', status: 401 })).toBe(
      'Email atau password salah.',
    );
    expect(normalizeUserFacingError({ message: 'Request gagal (401)', status: 401 })).toBe(
      'Sesi login berakhir. Silakan masuk ulang.',
    );
  });

  it('maps recipe save failures to a clear recovery hint', () => {
    expect(getRecipeSaveErrorMessage({ message: 'Terjadi kesalahan dibackend', status: 500 })).toBe(
      'Resep belum bisa disimpan. Periksa kembali produk, bahan baku, dan jumlah per porsi.',
    );
  });
});
