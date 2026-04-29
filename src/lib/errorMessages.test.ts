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

  it('maps recipe save failures to a clear recovery hint', () => {
    expect(getRecipeSaveErrorMessage({ message: 'Terjadi kesalahan dibackend', status: 500 })).toBe(
      'Resep belum bisa disimpan. Periksa kembali produk, bahan baku, dan jumlah per porsi.',
    );
  });
});
