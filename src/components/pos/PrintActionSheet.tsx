 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/pos/PrintActionSheet.tsx — KaffePOS v5
// Bottom sheet pilihan cetak: Bluetooth, USB, WhatsApp (PDF)
// REMOVED: Browser Print, Simpan PDF (tidak dibutuhkan di Android)
import { useEffect, useRef, useState, useCallback } from 'react';
import { Bluetooth, Usb, X } from 'lucide-react';
import { usePrinter } from '@/hooks/usePrinter';
import { type PrintData } from '@/utils/thermalPrinter';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import {
  createReceiptPrintData,
  formatReceiptCurrency,
  getReceiptDividerChar,
  getReceiptSettings,
} from '@/utils/receipt';
import { useModalBehavior } from '@/hooks/useModalBehavior';

// ── Format helpers ───────────────────────────────────────────────────────────
const fRp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n || 0);

function formatDate(d: string) {
  return new Date(d).toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Generate PDF → base64 ────────────────────────────────────────────────────
async function generateReceiptPDFBase64(tx:any, storeSettings:any): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const { convertLogoForPrint } = await import('@/utils/thermalPrinter');
  const settings = getReceiptSettings(storeSettings);
  const pw = settings.paper_width === '80mm' ? 80 : 58;
  const doc = new jsPDF({ unit: 'mm', format: [pw, 297], orientation: 'portrait' });
  const font = settings.receipt_font_size === 'large' ? 9 : settings.receipt_font_size === 'small' ? 7 : 8;
  let y = 4;
  const fRpJ = (n: number) => formatReceiptCurrency(n);
  const line = (text: string, align: 'left' | 'center' | 'right' = 'left', bold = false) => {
    doc.setFontSize(font);
    doc.setFont('courier', bold ? 'bold' : 'normal');
    if (align === 'center') doc.text(text, pw / 2, y, { align: 'center' });
    else if (align === 'right') doc.text(text, pw - 3, y, { align: 'right' });
    else doc.text(text, 3, y);
    y += font * 0.42;
  };
  const dividerChar = getReceiptDividerChar(settings.receipt_divider);
  const divider = () => { line(dividerChar.repeat(Math.floor((pw - 6) / 1.8))); };

  // Logo
  const rawLogoUrl = settings.logo_url || settings.logo_base64 || '';
  if (settings.show_logo_on_receipt !== false && rawLogoUrl && rawLogoUrl.length > 10) {
    try {
      const processedLogo = await convertLogoForPrint(rawLogoUrl, { mode: 'grayscale', threshold: 220 });
      const logoSize = settings.logo_size || 40;
      const logoH = Math.min(logoSize * 0.264583, 15);
      const logoW = logoH;
      const x =
        settings.logo_position === 'left' ? 3 :
        settings.logo_position === 'right' ? pw - logoW - 3 :
        (pw - logoW) / 2;
      doc.addImage(processedLogo, 'PNG', x, y, logoW, logoH);
      y += logoH + 1;
    } catch { /* skip */ }
  }

  // Header
  const storeName = settings.store_name || 'KaffePOS';
  doc.setFont('courier', 'bold'); doc.setFontSize(font + 2);
  doc.text(storeName, pw / 2, y, { align: 'center' }); y += (font + 2) * 0.45;
  if (settings.tagline) line(settings.tagline, 'center');
  if (settings.receipt_show_address && settings.address) line(settings.address, 'center');
  if (settings.receipt_show_whatsapp && settings.whatsapp) line('WA: ' + settings.whatsapp, 'center');
  if (settings.receipt_header) line(settings.receipt_header, 'center');
  divider();

  // ORDER ID Besar di Tengah
  doc.setFont('courier', 'bold'); doc.setFontSize(font + 5);
  doc.text(tx.id, pw / 2, y, { align: 'center' }); 
  y += (font + 5) * 0.45 + 1;

  if (tx.customer_name) {
    doc.setFontSize(font + 2);
    doc.text(tx.customer_name.toUpperCase(), pw / 2, y, { align: 'center' });
    y += (font + 2) * 0.45 + 1;
  }
  divider();

  doc.setFontSize(font); doc.setFont('courier', 'normal');
  line('Tgl : ' + formatDate(tx.date));
  if (settings.receipt_show_cashier !== false && tx.cashier) line('Kasir: ' + tx.cashier);
  divider();

  tx.items.forEach((item:any) => {
    line(item.name, 'left', true);
    doc.setFontSize(font); doc.setFont('courier', 'normal');
    doc.text(`  ${item.qty}x ${fRpJ(item.price)}`, 3, y);
    doc.text(fRpJ(item.subtotal), pw - 3, y, { align: 'right' });
    y += font * 0.42;
  });
  divider();

  if (tx.discount > 0) {
    doc.setFontSize(font); doc.setFont('courier', 'normal');
    doc.text('Diskon', 3, y); doc.text('-' + fRpJ(tx.discount), pw - 3, y, { align: 'right' });
    y += font * 0.42;
  }
  if (settings.receipt_show_tax !== false && tx.tax > 0) {
    doc.text('Pajak', 3, y); doc.text(fRpJ(tx.tax), pw - 3, y, { align: 'right' });
    y += font * 0.42;
  }
  doc.setFont('courier', 'bold');
  doc.text('TOTAL', 3, y); doc.text(fRpJ(tx.total), pw - 3, y, { align: 'right' });
  y += font * 0.42;
  divider();

  doc.setFont('courier', 'normal');
  doc.text('Bayar (' + tx.method + ')', 3, y); doc.text(fRpJ(tx.paid), pw - 3, y, { align: 'right' });
  y += font * 0.42;
  if (tx.method === 'Tunai') {
    doc.setFont('courier', 'bold');
    doc.text('Kembali', 3, y); doc.text(fRpJ(tx.change), pw - 3, y, { align: 'right' });
    y += font * 0.42;
  }
  divider();
  line(settings.receipt_footer || 'Terima kasih!', 'center', true);
  if (settings.receipt_custom_line1) line(settings.receipt_custom_line1, 'center');
  if (settings.receipt_custom_line2) line(settings.receipt_custom_line2, 'center');

  return doc.output('datauristring').split(',')[1]; // base64 only
}

// ── Share PDF via native share sheet (WhatsApp, dll) ────────────────────────
async function sharePDFToWhatsApp(tx:any, storeSettings:any): Promise<void> {
  const base64 = await generateReceiptPDFBase64(tx, storeSettings);
  const dateStr = new Date(tx.date).toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `Struk_${tx.id}_${dateStr}.pdf`;

  // Simpan ke cache direktori (tidak butuh izin)
  await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
  });

  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });

  await Share.share({
    title: `Struk ${storeSettings?.store_name || 'KaffePOS'}`,
    text: `Struk transaksi ${tx.id} — ${fRp(tx.total)}`,
    url: uri,
    dialogTitle: 'Kirim struk via...',
  });
}

// ── Props ────────────────────────────────────────────────────────────────────
export interface PrintActionSheetProps {
  visible:       boolean;
  onClose:       () => void;
  transaction:   any;
  storeSettings:any;
  allowThermalPrint?: boolean;
  toast:         { showToast: (m: string, t?: 'success' | 'error' | 'warning' | 'info') => void };
}

// ── Komponen utama ───────────────────────────────────────────────────────────
export default function PrintActionSheet({
  visible, onClose, transaction, storeSettings, allowThermalPrint = true, toast,
}: PrintActionSheetProps) {
  const printer = usePrinter();
  const [loading, setLoading] = useState<string | null>(null);
  const startYRef = useRef<number>(0);

  useEffect(() => { if (!visible) setLoading(null); }, [visible]);

  // Swipe-down to close
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  }, [],   );
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - startYRef.current;
    if (dy > 60) onClose();
  }, [onClose]);

  const doClose = useCallback(() => { setLoading(null); onClose(); }, [onClose]);
  const { panelRef, onBackdropClick, dialogProps } = useModalBehavior<HTMLDivElement>({
    open: visible && Boolean(transaction),
    onClose: doClose,
    disabled: Boolean(loading),
  });

  if (!visible || !transaction) return null;

  const tx = transaction;
  const storeName = storeSettings?.store_name || 'KaffePOS';

  const makePrintData = (): PrintData => (
    createReceiptPrintData(storeSettings, tx) as PrintData
  );

  // ── Action handlers ───────────────────────────────────────────────────────
  const handleBluetooth = async () => {
    if (!allowThermalPrint) {
      toast.showToast('Cetak Bluetooth tersedia mulai paket Signature.', 'info');
      return;
    }
    setLoading('bt');
    try {
      if (!printer.btConnected) {
        await printer.connectClassic();
      }
      const { printReceiptClassicBt } = await import('@/utils/thermalPrinter');
      await printReceiptClassicBt(makePrintData());
      toast.showToast('🖨️ Struk dicetak via Bluetooth!', 'success');
      doClose();
    } catch (e:any) {
      toast.showToast(e?.message || 'Gagal cetak Bluetooth', 'error');
    } finally { setLoading(null); }
  };

  const handleUsb = async () => {
    if (!allowThermalPrint) {
      toast.showToast('Cetak USB thermal tersedia mulai paket Signature.', 'info');
      return;
    }
    setLoading('usb');
    try {
      if (!printer.usbConnected) await printer.connectUsb();
      const { printReceiptUsb } = await import('@/utils/thermalPrinter');
      await printReceiptUsb(makePrintData());
      toast.showToast('🖨️ Struk dicetak via USB!', 'success');
      doClose();
    } catch (e:any) {
      toast.showToast(e?.message || 'Gagal cetak USB. Cek kabel OTG.', 'error');
    } finally { setLoading(null); }
  };

  // WhatsApp: generate PDF lalu buka native share sheet
  const handleWhatsApp = async () => {
    setLoading('wa');
    try {
      await sharePDFToWhatsApp(tx, storeSettings);
      doClose();
    } catch (e:any) {
      // Fallback: jika Share API tidak tersedia (browser), fallback ke text WA
      const msg = formatReceiptTextWA(tx, storeName);
      const wa  = (storeSettings?.whatsapp || '').replace(/\D/g, '');
      const url = wa
        ? `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(url, '_system');
      doClose();
    } finally { setLoading(null); }
  };

  const Spinner = () => (
    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
  );

  const btStatus = printer.btReconnecting
    ? { label: 'Menghubungkan...', color: 'text-yellow-500', dot: '🟡' }
    : printer.btConnected
      ? { label: printer.btName || 'Terhubung',  color: 'text-green-500',  dot: '🟢' }
      : { label: 'Belum terhubung', color: 'text-slate-400', dot: '🔴' };

  const usbStatus = printer.usbConnected
    ? { label: printer.usbName || 'USB Terhubung', color: 'text-green-500', dot: '🟢' }
    : { label: 'Colok kabel OTG ke printer', color: 'text-slate-400', dot: '' };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        className="bg-white w-full max-w-md rounded-t-3xl overflow-hidden"
        aria-labelledby="print-action-sheet-title"
        {...dialogProps}
        style={{ animation: 'slideUp 0.25s ease-out' }}
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h3 id="print-action-sheet-title" className="font-black text-slate-800 text-base">Cetak / Bagikan Struk</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {tx.id} &nbsp;·&nbsp; <span className="font-bold text-orange-500">{fRp(tx.total)}</span>
              </p>
            </div>
            <button onClick={doClose} className="p-2 rounded-full bg-slate-100 active:scale-90">
              <X size={16} className="text-slate-500" />
            </button>
          </div>
        </div>

        <div className="px-4 pt-3">
          <div
            aria-label="Preview struk"
            className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] text-slate-700"
          >
            <div className="text-center font-black text-slate-900">{storeName}</div>
            <div className="mt-1 text-center text-[10px] text-slate-500">{tx.id}</div>
            {tx.customer_name && <div className="mt-1 text-center font-bold text-slate-800">{tx.customer_name}</div>}
            <div className="my-3 border-t border-dashed border-slate-300" />
            <div className="space-y-2">
              {(tx.items || []).map((item: any, index: number) => (
                <div key={`${item.name}-${index}`}>
                  <div className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{item.name}</span>
                    <span className="shrink-0">{fRp(item.subtotal)}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">{item.qty} x {fRp(item.price)}</div>
                </div>
              ))}
            </div>
            <div className="my-3 border-t border-dashed border-slate-300" />
            {tx.discount > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Diskon</span>
                <span>-{fRp(tx.discount)}</span>
              </div>
            )}
            {tx.tax > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Pajak</span>
                <span>{fRp(tx.tax)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between text-sm font-black text-slate-900">
              <span>Total</span>
              <span>{fRp(tx.total)}</span>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="px-4 py-3 space-y-2.5 pb-safe">

          {/* 1. Bluetooth */}
          <button
            onClick={handleBluetooth}
            disabled={loading !== null}
            className={`w-full flex items-center gap-3.5 p-4 rounded-2xl border active:scale-[0.98] disabled:opacity-60 transition-transform ${allowThermalPrint ? 'bg-orange-50 border-orange-100' : 'bg-slate-50 border-slate-200'}`}
          >
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
              {loading === 'bt' ? <Spinner /> : <Bluetooth size={24} className="text-orange-500" />}
            </div>
            <div className="text-left flex-1">
              <p className="font-black text-slate-800 text-sm">Cetak via Bluetooth</p>
              <p className={`text-xs font-medium mt-0.5 ${btStatus.color}`}>
                {btStatus.dot} {btStatus.label}
              </p>
              {!printer.btConnected && (
                <p className={`text-[10px] mt-0.5 ${allowThermalPrint ? 'text-orange-400' : 'text-slate-400'}`}>{allowThermalPrint ? 'Tap untuk hubungkan & cetak' : 'Tersedia mulai paket Signature'}</p>
              )}
            </div>
            {!printer.btConnected && !printer.btReconnecting && (
              <span className={`text-[10px] font-bold px-2.5 py-1.5 rounded-xl shrink-0 ${allowThermalPrint ? 'text-orange-500 bg-orange-100' : 'text-slate-500 bg-slate-200'}`}>{allowThermalPrint ? 'Hubungkan' : 'Locked'}</span>
            )}
          </button>

          {/* 2. USB OTG */}
          <button
            onClick={handleUsb}
            disabled={loading !== null}
            className={`w-full flex items-center gap-3.5 p-4 rounded-2xl border active:scale-[0.98] disabled:opacity-60 transition-transform ${allowThermalPrint ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-200'}`}
          >
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              {loading === 'usb' ? <Spinner /> : <Usb size={24} className="text-blue-500" />}
            </div>
            <div className="text-left flex-1">
              <p className="font-black text-slate-800 text-sm">Cetak via USB OTG</p>
              <p className={`text-xs font-medium mt-0.5 ${usbStatus.color}`}>
                {allowThermalPrint ? `${usbStatus.dot} ${usbStatus.label}` : 'Tersedia mulai paket Signature'}
              </p>
            </div>
            {printer.usbConnected && (
              <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2.5 py-1.5 rounded-xl shrink-0">🟢 Siap</span>
            )}
          </button>

          {/* 3. WhatsApp — kirim PDF */}
          <button
            onClick={handleWhatsApp}
            disabled={loading !== null}
            className="w-full flex items-center gap-3.5 p-4 rounded-2xl active:scale-[0.98] disabled:opacity-60 transition-transform"
            style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: '#dcfce7' }}>
              {loading === 'wa'
                ? <Spinner />
                : <span className="text-2xl">💬</span>
              }
            </div>
            <div className="text-left flex-1">
              <p className="font-black text-slate-800 text-sm">Kirim Struk via WhatsApp</p>
              <p className="text-xs mt-0.5 font-medium" style={{ color: '#16a34a' }}>
                {loading === 'wa' ? 'Membuat PDF...' : 'Format PDF — kirim ke pelanggan'}
              </p>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1.5 rounded-xl shrink-0"
              style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
              PDF
            </span>
          </button>

          {/* Tutup */}
          <button
            onClick={doClose}
            className="w-full py-3.5 text-slate-400 font-bold text-sm active:scale-95 rounded-2xl"
          >
            Tutup
          </button>
        </div>

        {/* Safe area bottom */}
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)', height: 'env(safe-area-inset-bottom, 8px)' }} />
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Fallback text format untuk WA jika Share API tidak tersedia ──────────────
function formatReceiptTextWA(tx:any, storeName: string): string {
  const fR = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n || 0);
  let msg = `🧾 *STRUK PEMBAYARAN*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏪 *${storeName}*\n`;
  msg += `📅 ${new Date(tx.date).toLocaleString('id-ID')}\n`;
  msg += `🔖 ${tx.id}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  tx.items.forEach((item:any) => {
    msg += `• ${item.name} x${item.qty}\n`;
    msg += `  ${fR(item.subtotal)}\n`;
  });
  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  if (tx.discount > 0) msg += `Diskon: -${fR(tx.discount)}\n`;
  if (tx.tax > 0) msg += `Pajak: ${fR(tx.tax)}\n`;
  msg += `*TOTAL: ${fR(tx.total)}*\n`;
  msg += `Bayar: ${tx.method}\n`;
  if (tx.method === 'Tunai' && tx.change > 0) msg += `Kembali: ${fR(tx.change)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `_Terima kasih sudah berkunjung!_ 🙏`;
  return msg;
}
