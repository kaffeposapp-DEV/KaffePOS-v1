import { describe, expect, it } from 'vitest';
import { ApiError, getSafeApiErrorMessage } from './errors';

describe('backend ApiError mapping', () => {
  it('preserves expected user-facing messages for route-level errors', () => {
    expect(getSafeApiErrorMessage(new ApiError(403, 'Akses tidak diizinkan untuk role akun ini.'))).toBe(
      'Akses tidak diizinkan untuk role akun ini.',
    );
    expect(getSafeApiErrorMessage(new ApiError(404, 'Menu tidak ditemukan.'))).toBe('Menu tidak ditemukan.');
  });

  it('does not expose raw server failure messages to clients', () => {
    expect(getSafeApiErrorMessage(new ApiError(503, 'Midtrans belum dikonfigurasi di backend.'))).toBe(
      'Terjadi gangguan pada server. Coba lagi beberapa saat.',
    );
  });
});
