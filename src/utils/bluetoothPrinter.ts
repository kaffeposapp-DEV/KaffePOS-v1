// src/utils/bluetoothPrinter.ts — Bluetooth Thermal Printer Manager
// Wrapper untuk @kduma-autoid/capacitor-bluetooth-printer
// Mendukung printer SPP (Classic Bluetooth): VSC MP-58, RONGTA, XP, GOOJPRT, dll.

import { BluetoothPrinter } from '@kduma-autoid/capacitor-bluetooth-printer';
import { buildReceipt, type ReceiptData } from './escpos';

export interface BTPrinterDevice {
  name:    string;
  address: string;
  bonded:  boolean;
}

// FIX #2: Perluas keyword agar lebih banyak printer terdeteksi otomatis
const PRINTER_NAME_KEYWORDS = [
  'printer', 'print', 'pos', 'thermal', 'rpp', 'mp-', 'mp5', 'mp58',
  'xp-', 'xp5', 'xp8', 'rongta', 'goojprt', 'zj-', 'rppo', 'vsc',
  'btp', 'pt-', 'gp-', 'epson', 'citizen', 'star', 'bt', 'receipt',
  'cashier', 'kassa', 'rp-', 'pp-', 'ct-', 'mini', 'portable', 'wireless',
  'ipp', 'spp', 'tsp', 'tmt', 'tm-', 'm08', 'p8', 'p58', 'xprn',
];

function isPrinterDevice(name: string): boolean {
  const lower = name.toLowerCase();
  return PRINTER_NAME_KEYWORDS.some(kw => lower.includes(kw));
}

const STORAGE_KEY = 'kaffepos_bt_printer';
const PAPER_SIZE_KEY = 'kaffepos_paper_size';

export interface SavedPrinter {
  name:    string;
  address: string;
}

export function getSavedPrinter(): SavedPrinter | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function savePrinterToStorage(printer: SavedPrinter): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(printer)); } catch {}
}

export function clearSavedPrinter(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getPaperSize(): 58 | 80 {
  return (parseInt(localStorage.getItem(PAPER_SIZE_KEY) || '58') || 58) as 58 | 80;
}

export function savePaperSize(size: 58 | 80): void {
  localStorage.setItem(PAPER_SIZE_KEY, String(size));
}

// FIX #2: Scan — tampilkan semua jika tidak ada yang cocok keyword printer
export async function scanPairedDevices(): Promise<{ all: BTPrinterDevice[]; printers: BTPrinterDevice[] }> {
  try {
    const { devices } = await BluetoothPrinter.list();
    const all: BTPrinterDevice[] = (devices || []).map((d: { name?: string; address?: string }) => ({
      name:    d.name || 'Unknown',
      address: d.address || '',
      bonded:  true,
    }));
    const printers = all.filter(d => isPrinterDevice(d.name));
    // Jika tidak ada yang terdeteksi sebagai printer, tampilkan semua device
    return { all, printers: printers.length > 0 ? printers : all };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Scan gagal: ${msg}`);
  }
}

// FIX #2: Connect dengan retry otomatis + timeout 10 detik per percobaan
// Android BT bisa hang tanpa batas — timeout wajib ada
export async function connectPrinter(address: string, retries = 2): Promise<void> {
  let lastErr = '';
  for (let i = 0; i <= retries; i++) {
    try {
      // Timeout 10 detik per percobaan — Android BT bisa hang tanpa batas
      await Promise.race([
        BluetoothPrinter.connect({ address }),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('Timeout koneksi 10 detik. Pastikan printer menyala dan Bluetooth aktif.')), 10_000)
        ),
      ]);
      return;
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (i < retries) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error(`Gagal connect setelah ${retries + 1} percobaan: ${lastErr}`);
}

export async function disconnectPrinter(): Promise<void> {
  try { await BluetoothPrinter.disconnect(); } catch {}
}

// FIX #2: Auto re-connect jika printer terputus saat print
export async function printRaw(data: number[]): Promise<void> {
  const toHex = (d: number[]) => d.map(b => b.toString(16).padStart(2, '0')).join('');
  try {
    await BluetoothPrinter.print({ data: toHex(data) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('not connected') || msg.toLowerCase().includes('disconnected')) {
      const saved = getSavedPrinter();
      if (saved) {
        await connectPrinter(saved.address, 1);
        await BluetoothPrinter.print({ data: toHex(data) });
        return;
      }
    }
    throw new Error(`Print gagal: ${msg}`);
  }
}

export async function testPrint(paperWidth: 58 | 80 = 58): Promise<void> {
  const { EscPos } = await import('./escpos');
  const width = paperWidth === 58 ? 32 : 48;
  const esc = new EscPos();
  const bytes = esc.init()
    .alignCenter().boldOn().sizeDouble()
    .text('KaffePOS').newline()
    .sizeNormal().boldOff()
    .text('Test Print Berhasil!').newline()
    .divider(width)
    .alignLeft()
    .text(`Printer: ${paperWidth}mm`).newline()
    .text(new Date().toLocaleString('id-ID')).newline()
    .divider(width)
    .alignCenter()
    .text('Printer siap digunakan').newline()
    .feed(3).cutPartial()
    .build();
  await printRaw(bytes);
}

export async function printReceipt(receiptData: ReceiptData): Promise<void> {
  const paperWidth = getPaperSize();
  const bytes = buildReceipt(receiptData, paperWidth);
  await printRaw(bytes);
}

// FIX #2: Auto-connect ke printer tersimpan dengan retry
export async function autoConnect(): Promise<BTPrinterDevice | null> {
  const saved = getSavedPrinter();
  if (!saved) return null;
  try {
    await connectPrinter(saved.address, 2);
    return { name: saved.name, address: saved.address, bonded: true };
  } catch {
    return null;
  }
}

export async function requestBluetoothPermission(): Promise<boolean> {
  try {
    const { devices } = await BluetoothPrinter.list();
    // Berhasil list = Bluetooth aktif dan permission granted
    return Array.isArray(devices);
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    // Hanya return false jika memang permission denied atau BT disabled
    if (msg.includes('disabled') || msg.includes('permission') || msg.includes('denied')) return false;
    // Error lain (timeout, dsb) — anggap BT aktif, biarkan scan berjalan
    return true;
  }
}

/**
 * Auto-reconnect ke printer tersimpan saat app resume dari background.
 * Berjalan silent — tidak throw jika gagal.
 */
export async function autoConnectOnResume(): Promise<void> {
  const saved = getSavedPrinter();
  if (!saved) return;
  try {
    // Coba connect tanpa retry (best-effort saat resume)
    await Promise.race([
      BluetoothPrinter.connect({ address: saved.address }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8_000)),
    ]);
  } catch {
    // Gagal auto-connect — user bisa manual connect dari PrinterSettings
  }
}
