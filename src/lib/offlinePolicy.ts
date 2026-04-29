export type PosPaymentMethod = 'Tunai' | 'Transfer' | 'QRIS' | 'Debit' | 'Kredit';

export function canProcessPosPaymentOffline(method: PosPaymentMethod): boolean {
  return method === 'Tunai' || method === 'Transfer';
}

export function getOfflinePaymentBlockedMessage(method: PosPaymentMethod): string {
  if (canProcessPosPaymentOffline(method)) return '';
  if (method === 'QRIS') return 'QRIS membutuhkan koneksi internet. Gunakan Tunai atau Transfer saat offline.';
  return 'Metode pembayaran ini membutuhkan koneksi internet.';
}

export function canStartOnlineBillingFlow(isOnline: boolean): boolean {
  return isOnline;
}

export function getOnlineBillingBlockedMessage(): string {
  return 'Langganan dan pembayaran online membutuhkan koneksi internet.';
}
