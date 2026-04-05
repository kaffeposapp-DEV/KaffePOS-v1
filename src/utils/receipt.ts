/* eslint-disable @typescript-eslint/no-explicit-any */
import type { StoreSettings, Transaction } from '@/types';

type ReceiptSettings = Partial<StoreSettings> & {
  show_logo_on_receipt?: boolean;
  receipt_font_size?: 'small' | 'medium' | 'large';
  receipt_show_address?: boolean;
  receipt_show_whatsapp?: boolean;
  receipt_show_tax?: boolean;
  receipt_show_cashier?: boolean;
  receipt_show_trx_id?: boolean;
  receipt_divider?: string;
  currency?: string;
  receipt_header?: string;
  receipt_footer?: string;
  receipt_custom_line1?: string;
  receipt_custom_line2?: string;
};

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  logo_position: 'center',
  logo_size: 40,
  show_logo_on_receipt: true,
  paper_width: '58mm',
  receipt_font_size: 'medium',
  receipt_show_address: true,
  receipt_show_whatsapp: true,
  receipt_show_tax: true,
  receipt_show_cashier: true,
  receipt_show_trx_id: true,
  receipt_divider: 'dash',
  tax_percent: 0,
  currency: 'IDR',
  receipt_header: '',
  receipt_footer: 'Terima kasih!',
  receipt_custom_line1: '',
  receipt_custom_line2: '',
} as const;

export function getReceiptSettings(source?: ReceiptSettings | Record<string, any> | null): ReceiptSettings {
  return {
    ...DEFAULT_RECEIPT_SETTINGS,
    ...(source || {}),
  };
}

export function getReceiptDividerChar(divider?: string) {
  if (divider === 'star') return '*';
  if (divider === 'equal') return '=';
  if (divider === 'dot') return '·';
  return '-';
}

export function getReceiptCharWidth(paperWidth?: string) {
  return paperWidth === '80mm' ? 42 : 32;
}

export function getReceiptPreviewWidth(paperWidth?: string) {
  return paperWidth === '80mm' ? 300 : 210;
}

export function getReceiptFontPx(fontSize?: string) {
  if (fontSize === 'large') return 12;
  if (fontSize === 'small') return 9;
  return 10.5;
}

export function formatReceiptCurrency(n: number) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(n || 0);
}

export function formatReceiptDate(d: string) {
  return new Date(d).toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function createReceiptPrintData(storeSettings: any, transaction: Transaction | any) {
  const s = getReceiptSettings(storeSettings);
  return {
    storeName: s.store_name || 'KaffePOS',
    tagline: s.tagline || '',
    address: s.receipt_show_address ? (s.address || '') : '',
    phone: s.receipt_show_whatsapp ? (s.whatsapp || '') : '',
    footer: s.receipt_footer || 'Terima kasih!',
    paperWidth: (s.paper_width || '58mm') as '58mm' | '80mm',
    fontSize: (s.receipt_font_size || 'medium') as 'small' | 'medium' | 'large',
    logoUrl: s.logo_url || s.logo_base64 || '',
    logoPosition: (s.logo_position || 'center') as 'left' | 'center' | 'right',
    logoSize: s.logo_size || 40,
    showLogoOnReceipt: s.show_logo_on_receipt !== false,
    showTrxId: s.receipt_show_trx_id !== false,
    showCashier: s.receipt_show_cashier !== false,
    divider: s.receipt_divider || 'dash',
    customLine1: s.receipt_custom_line1 || '',
    customLine2: s.receipt_custom_line2 || '',
    headerText: s.receipt_header || '',
    showTax: s.receipt_show_tax !== false,
    transaction,
  };
}

export function getInventoryUsageMap(inventory: any[], menu: any[], transactions: any[]) {
  const menuMap = new Map(menu.map((item: any) => [item.id, item]));
  const menuByName = new Map(menu.map((item: any) => [item.name, item]));
  const usage = new Map<string, number>();

  transactions
    .filter((tx: any) => !tx.is_void)
    .forEach((tx: any) => {
      (tx.items || []).forEach((sold: any) => {
        const baseName = (sold.name || '').split(' (')[0];
        const menuItem = menuByName.get(sold.name) || menuByName.get(baseName) || menuMap.get((sold as any)._baseId);
        (menuItem?.recipe || []).forEach((recipe: any) => {
          const qty = (usage.get(recipe.matId) || 0) + (recipe.qty || 0) * (sold.qty || 0);
          usage.set(recipe.matId, qty);
        });
      });
    });

  return inventory.map((item: any) => {
    const used = usage.get(item.id) || 0;
    const baseline = Math.max(item.stock + used, 0);
    const ratio = baseline > 0 ? item.stock / baseline : 1;
    return {
      itemId: item.id,
      used,
      baseline,
      ratio,
      percent: Math.max(0, Math.min(100, Math.round(ratio * 100))),
    };
  });
}
