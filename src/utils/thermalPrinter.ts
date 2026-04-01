// src/utils/thermalPrinter.ts — KaffePOS v4 — Auto-reconnect + Watchdog
const ESC = 0x1B, GS = 0x1D;
const CMD = {
  INIT:         [ESC, 0x40],
  ALIGN_LEFT:   [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  BOLD_ON:      [ESC, 0x45, 0x01],
  BOLD_OFF:     [ESC, 0x45, 0x00],
  FONT_NORMAL:  [ESC, 0x21, 0x00],
  FONT_LARGE:   [ESC, 0x21, 0x30],
  CUT:          [GS,  0x56, 0x41, 0x03],
  FEED:         [ESC, 0x64, 0x03],
};

function strToBytes(str: string): number[] {
  const b: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    b.push(c < 128 ? c : 0x3F);
  }
  return b;
}

function twoCol(l: string, r: string, W = 32): string {
  const maxL = W - r.length - 1;
  const left = l.length > maxL ? l.slice(0, maxL) : l;
  return left.padEnd(W - r.length) + r;
}

const fRp = (n: number) => 'Rp' + new Intl.NumberFormat('id-ID').format(n || 0);
const fDate = (d: string) =>
  new Date(d).toLocaleString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

export interface PrintData {
  storeName: string;
  address?: string;
  phone?: string;
  tagline?: string;
  footer?: string;
  paperWidth?: '58mm' | '80mm';
  fontSize?: string;
  divider?: string;
  showCashier?: boolean;
  showTrxId?: boolean;
  customLine1?: string;
  customLine2?: string;
  logoUrl?: string;
  logoPosition?: string;
  logoSize?: number;
  transaction: {
    id: string; date: string; cashier: string; method: string;
    items: { name: string; qty: number; price: number; subtotal: number }[];
    subtotal: number; discount: number; tax: number; total: number;
    paid: number; change: number;
    customer_name?: string | null;
  };
}

/**
 * Konversi logo ke grayscale PNG dengan background transparan.
 * Ini penting agar logo terlihat bersih saat dicetak di thermal printer
 * (printer thermal hanya mencetak piksel gelap, background transparan = tidak tercetak).
 * Juga mendukung mode "outline only" dengan threshold kontras tinggi.
 */
export async function convertLogoForPrint(
  logoUrl: string,
  opts: { mode?: 'grayscale' | 'outline'; threshold?: number } = {}
): Promise<string> {
  return new Promise((resolve) => {
    if (!logoUrl) { resolve(''); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Max lebar 200px agar tidak terlalu besar di struk
      const maxW = 200;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      // Gambar dengan background transparan (JANGAN fill putih)
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      // Ambil pixel data
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const threshold = opts.threshold ?? 200; // piksel lebih terang dari ini → transparan

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];

        // Konversi ke grayscale (luminance formula)
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

        if (opts.mode === 'outline') {
          // Mode outline: piksel terang + hampir transparan → transparan sepenuhnya
          // Piksel gelap → hitam solid
          if (gray > threshold || a < 30) {
            data[i + 3] = 0; // transparan
          } else {
            data[i]     = 0;   // hitam
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 255; // solid
          }
        } else {
          // Mode grayscale: Background putih / transparan → transparan
          // Piksel berwarna → grayscale
          if (a < 30 || gray > threshold) {
            data[i + 3] = 0; // hapus background putih
          } else {
            data[i]     = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
            // alpha tetap
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => resolve(logoUrl); // fallback: pakai original
    img.src = logoUrl;
  });
}

export function buildReceiptBytes(data: PrintData): Uint8Array {
  const W = data.paperWidth === '80mm' ? 48 : 32;
  const dc = data.divider === 'star' ? '*' : data.divider === 'equal' ? '=' : data.divider === 'dot' ? '.' : '-';
  const bytes: number[] = [];
  const add = (...cmds: number[][]) => cmds.forEach(c => bytes.push(...c));
  const line = (s = '') => { bytes.push(...strToBytes(s), 0x0A); };
  const divLine = () => line(dc.repeat(W));

  add(CMD.INIT, CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.FONT_LARGE);
  line(data.storeName.slice(0, W));
  add(CMD.FONT_NORMAL, CMD.BOLD_OFF);
  if (data.tagline) line(data.tagline.slice(0, W));
  if (data.address) line(data.address.slice(0, W));
  if (data.phone) line('WA: ' + data.phone);
  add(CMD.ALIGN_CENTER);
  divLine();
  if (data.showTrxId !== false) {
    add(CMD.BOLD_ON, CMD.FONT_LARGE); // Besar dan bold
    line(data.transaction.id);
  }
  if (data.transaction.customer_name) {
    add(CMD.FONT_NORMAL, CMD.BOLD_ON); // Font ukuran biasa tapi tebal untuk nama pelanggan
    line(data.transaction.customer_name.toUpperCase().slice(0, W));
  }
  add(CMD.FONT_NORMAL, CMD.BOLD_OFF);
  divLine();
  
  add(CMD.ALIGN_LEFT);
  line('Tgl: ' + fDate(data.transaction.date));
  if (data.showCashier !== false) line('Kasir: ' + data.transaction.cashier);
  divLine();
  data.transaction.items.forEach(item => {
    line(item.name.slice(0, W));
    line(twoCol('  ' + item.qty + 'x ' + fRp(item.price), fRp(item.subtotal), W));
  });
  divLine();
  if (data.transaction.discount > 0) line(twoCol('Diskon', '-' + fRp(data.transaction.discount), W));
  if (data.transaction.tax > 0) line(twoCol('Pajak', fRp(data.transaction.tax), W));
  add(CMD.BOLD_ON);
  line(twoCol('TOTAL', fRp(data.transaction.total), W));
  add(CMD.BOLD_OFF);
  divLine();
  line(twoCol('Bayar (' + data.transaction.method + ')', fRp(data.transaction.paid), W));
  if (data.transaction.method === 'Tunai') {
    add(CMD.BOLD_ON);
    line(twoCol('Kembali', fRp(data.transaction.change), W));
    add(CMD.BOLD_OFF);
  }
  divLine();
  add(CMD.ALIGN_CENTER);
  line(data.footer || 'Terima kasih!');
  if (data.customLine1) line(data.customLine1.slice(0, W));
  if (data.customLine2) line(data.customLine2.slice(0, W));
  add(CMD.FEED, CMD.CUT);
  return new Uint8Array(bytes);
}

// ── Native Classic Bluetooth SPP (pakai @kduma-autoid/capacitor-bluetooth-printer) ─
import { BluetoothPrinter as NativeBtPlugin } from '@kduma-autoid/capacitor-bluetooth-printer';

// Shim agar kode lama tetap jalan
const NativeBt = {
  async listPairedDevices() {
    const result = await NativeBtPlugin.list(); // ← API yang benar: list()
    const devices = (result.devices || []).map((d: { name?: string; address?: string }) => ({
      name: d.name || 'Unknown',
      mac:  d.address || '',
    }));
    return { devices };
  },
  async connect(opts: { mac: string }) {
    await NativeBtPlugin.connect({ address: opts.mac });
    return { name: opts.mac, mac: opts.mac };
  },
  async print(opts: { data: string }) {
    // Plugin ini terima hex string langsung via print({ data })
    await NativeBtPlugin.print({ data: opts.data }); // ← API yang benar: print()
    return { success: true };
  },
  async disconnect() {
    await NativeBtPlugin.disconnect();
    return { success: true };
  },
  async isConnected() {
    return { connected: _nativeBtConnected, name: _nativeBtName, mac: _nativeBtMac };
  },
};

// Native BT state
let _nativeBtConnected = false;
let _nativeBtName: string | null = null;
let _nativeBtMac:  string | null = null;

const LS_NATIVE_BT_MAC  = 'kpos_bt_mac';
const LS_NATIVE_BT_NAME = 'kpos_bt_name';

export function isClassicBtConnected(): boolean { return _nativeBtConnected; }
export function getClassicBtName(): string | null { return _nativeBtName; }

/** List printer Bluetooth yang sudah di-pair di HP — dengan timeout 8 detik */
export async function listPairedBtDevices(): Promise<Array<{ name: string; mac: string }>> {
  try {
    const res = await Promise.race([
      NativeBt.listPairedDevices(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('Timeout: Bluetooth mungkin belum aktif di tablet')), 8_000)
      ),
    ]);
    return (res as any).devices || [];
  } catch (e: any) {
    console.warn('[BT] listPaired error:', e?.message);
    return [];
  }
}

/**
 * Connect ke printer Classic BT via MAC address atau auto-pilih dari paired list.
 * Menggunakan requestPermissions Capacitor yang benar (Android 12+).
 */
export async function connectClassicBt(mac?: string): Promise<string> {
  // Step 1: "Warm up" — list() pada Android 12+ akan trigger permission dialog
  // untuk BLUETOOTH_CONNECT secara otomatis (plugin tidak expose requestPermissions sendiri)
  // Kita tidak butuh hasilnya, cukup trigger permissionnya dulu
  try { await NativeBtPlugin.list(); } catch { /* permission belum diberikan, lanjut coba connect */ }

  let targetMac = mac || localStorage.getItem(LS_NATIVE_BT_MAC) || '';

  if (!targetMac) {
    // Step 2: Ambil daftar paired devices
    const devices = await listPairedBtDevices();
    console.log('[BT] Paired devices:', JSON.stringify(devices));

    if (!devices || devices.length === 0) {
      throw new Error(
        'Tidak ada perangkat Bluetooth yang di-pair.\n' +
        'Langkah:\n' +
        '1. Tablet → Pengaturan → Bluetooth → Aktifkan\n' +
        '2. Scan → Pilih printer (RPP02N/MP-58/dll) → PIN: 0000 atau 1234\n' +
        '3. Setelah paired muncul di daftar, kembali ke app → Hubungkan Printer'
      );
    }

    // Prioritas: cari printer berdasarkan nama umum, kalau tidak ada → pakai device pertama
    const printer =
      devices.find(d => /rpp|printer|mp-58|mp58|vsc|xp-|goojprt|hoin|thermal|pos|POS/i.test(d.name))
      || devices[0];

    targetMac = printer.mac;
    console.log('[BT] Auto-selected:', printer.name, printer.mac);
  }

  // Step 3: Connect dengan timeout 15 detik
  try {
    await Promise.race([
      NativeBt.connect({ mac: targetMac }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(
          'Timeout koneksi 15 detik.\n' +
          'Pastikan:\n' +
          '• Printer menyala (lampu biru berkedip)\n' +
          '• Printer tidak terhubung ke HP/device lain\n' +
          '• Jarak tablet dan printer < 5 meter'
        )), 15_000)
      ),
    ]);
  } catch (connErr: any) {
    _nativeBtConnected = false;
    throw new Error(connErr?.message || 'Gagal terhubung ke printer Bluetooth.');
  }

  _nativeBtConnected = true;
  _nativeBtName = targetMac; // akan diupdate setelah handshake
  _nativeBtMac  = targetMac;

  // Step 4: Kirim INIT command sebagai probe (konfirmasi socket benar-benar terbuka)
  try {
    const probe = new Uint8Array([0x1B, 0x40]); // ESC @ = printer init
    let bin = ''; probe.forEach(b => { bin += String.fromCharCode(b); });
    await NativeBtPlugin.print({ data: btoa(bin) });
  } catch (probeErr: any) {
    // Probe gagal — reset state dan lempar error deskriptif
    _nativeBtConnected = false;
    try { await NativeBtPlugin.disconnect(); } catch {}
    throw new Error(
      'Printer terdeteksi tapi tidak bisa menerima data.\n' +
      'Coba:\n' +
      '1. Restart printer → tunggu lampu stabil\n' +
      '2. Unpair dari Pengaturan Bluetooth tablet\n' +
      '3. Pair ulang dan coba hubungkan lagi'
    );
  }

  // Ambil nama dari paired list jika memungkinkan
  try {
    const devices = await listPairedBtDevices();
    const found = devices.find(d => d.mac === targetMac);
    if (found?.name) _nativeBtName = found.name;
  } catch {}

  try {
    localStorage.setItem(LS_NATIVE_BT_MAC,  _nativeBtMac);
    localStorage.setItem(LS_NATIVE_BT_NAME, _nativeBtName ?? targetMac);
    localStorage.setItem('kpos_print_method', 'bluetooth');
  } catch {}

  return _nativeBtName ?? targetMac;
}

/** Disconnect native BT */
export async function disconnectClassicBt(): Promise<void> {
  try { await NativeBt.disconnect(); } catch {}
  _nativeBtConnected = false;
  _nativeBtName = null;
  _nativeBtMac  = null;
}

/** Cetak via native Classic BT SPP — dengan auto-reconnect dan retry 1x */
export async function printReceiptClassicBt(data: PrintData): Promise<void> {
  const _doSend = async () => {
    const bytes = buildReceiptBytes(data);
    let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
    const b64 = btoa(bin);
    await NativeBtPlugin.print({ data: b64 });
  };

  if (!_nativeBtConnected) {
    // Coba auto-reconnect dari saved MAC
    try { await connectClassicBt(); }
    catch {
      throw new Error(
        'Printer Bluetooth tidak terhubung.\n' +
        'Buka tab Pengaturan → Printer → Hubungkan via Bluetooth.'
      );
    }
  }

  try {
    await _doSend();
  } catch (e: any) {
    // Print gagal → coba reconnect 1x lalu print ulang
    console.warn('[BT] Print gagal, coba reconnect:', e?.message);
    _nativeBtConnected = false;
    try {
      await connectClassicBt(_nativeBtMac ?? undefined);
      await _doSend();
    } catch {
      throw new Error(
        'Gagal mencetak struk.\n' +
        'Kemungkinan penyebab:\n' +
        '• Printer kehabisan kertas\n' +
        '• Koneksi Bluetooth terputus\n' +
        '• Restart printer lalu coba lagi'
      );
    }
  }
}

// ── Bluetooth state (Web BLE) ─────────────────────────────────────────────────
let _device: any = null;
let _char:   any = null;
let _watchdogTimer: ReturnType<typeof setInterval> | null = null;
let _reconnecting = false;
let _reconnectAttempts = 0;
const MAX_RECONNECT = 3;

const LS_PRINTER_NAME = 'kpos_printer_name';
const LS_PRINTER_ID   = 'kpos_printer_id';

// Status change listeners
type StatusCallback = (connected: boolean, name: string | null) => void;
const _statusListeners: Set<StatusCallback> = new Set();

function _notifyStatus(connected: boolean, name: string | null) {
  _statusListeners.forEach(cb => { try { cb(connected, name); } catch {} });
}

// UUID prioritas untuk BLE
const BT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
];
const BT_CHARS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  '49535343-8841-43f4-a8d4-ecbe34729bb3',
  '0000ff02-0000-1000-8000-00805f9b34fb',
];

// BLE chunk config
const BLE_CHUNK = 20;
const BLE_DELAY = 50;

export function isWebBluetoothSupported(): boolean {
  return !!(navigator as any).bluetooth;
}

export function isBluetoothPrinterConnected(): boolean {
  // Cek native BT dulu, lalu Web BLE
  if (_nativeBtConnected) return true;
  return !!(_device && _char && _device?.gatt?.connected);
}

export function getConnectedPrinterName(): string | null {
  if (_nativeBtConnected) return _nativeBtName;
  if (_device?.gatt?.connected) return _device?.name || localStorage.getItem(LS_PRINTER_NAME) || null;
  return null;
}

/** Status real-time printer */
export function getPrinterStatus(): { connected: boolean; name: string | null; reconnecting: boolean } {
  return {
    connected:    isBluetoothPrinterConnected(),
    name:         getConnectedPrinterName(),
    reconnecting: _reconnecting,
  };
}

/** Daftar listener untuk perubahan status koneksi printer */
export function onPrinterStatusChange(cb: StatusCallback): () => void {
  _statusListeners.add(cb);
  return () => _statusListeners.delete(cb);
}

export function disconnectBluetoothPrinter(): void {
  stopPrinterWatchdog();
  try { if (_device?.gatt?.connected) _device.gatt.disconnect(); } catch {}
  _device = null; _char = null; _reconnecting = false; _reconnectAttempts = 0;
  try { localStorage.removeItem(LS_PRINTER_NAME); } catch {}
  try { localStorage.removeItem(LS_PRINTER_ID); } catch {}
  _notifyStatus(false, null);
}

/** Connect manual dengan filter nama dan timeout 15s */
export async function connectBluetoothPrinter(): Promise<string> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth tidak tersedia. Gunakan Chrome Android atau aktifkan di chrome://flags.');
  }
  const nav = navigator as any;

  // Coba filter khusus MP-58 Pro dulu
  let device: any;
  try {
    device = await nav.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'MP-58' },
        { namePrefix: 'MP58' },
        { namePrefix: 'VSC' },
        { namePrefix: 'Printer' },
        { namePrefix: 'BT' },
        { namePrefix: 'RPP' },
        { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
        { services: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] },
      ],
      optionalServices: BT_SERVICES,
    });
  } catch (filterErr: any) {
    if (filterErr?.name === 'NotFoundError' || filterErr?.message?.includes('cancelled')) throw filterErr;
    // Filter gagal → acceptAllDevices
    device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BT_SERVICES,
    });
  }

  const name = await _connectToDevice(device);

  try {
    localStorage.setItem(LS_PRINTER_NAME, name);
    if (device.id) localStorage.setItem(LS_PRINTER_ID, device.id);
  } catch {}

  device.addEventListener('gattserverdisconnected', _onDeviceDisconnected);
  startPrinterWatchdog();
  _notifyStatus(true, name);
  return name;
}

/** Connect ke BluetoothDevice — TANPA dialog picker, dengan timeout 15s */
async function _connectToDevice(device: any): Promise<string> {
  // Connect dengan timeout 15 detik
  const server = await Promise.race([
    device.gatt.connect(),
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('Timeout koneksi 15 detik. Pastikan printer menyala dan dekat.')), 15000)
    ),
  ]);

  let characteristic: any = null;

  // 1. Coba pasangan service+char yang dikenal
  for (let i = 0; i < BT_SERVICES.length; i++) {
    try {
      const svc = await server.getPrimaryService(BT_SERVICES[i]);
      try {
        characteristic = await svc.getCharacteristic(BT_CHARS[i]);
        break;
      } catch {
        // Coba semua characteristic di service ini
        try {
          const chars = await svc.getCharacteristics();
          for (const ch of chars) {
            if (ch.properties.writeWithoutResponse || ch.properties.write) {
              characteristic = ch; break;
            }
          }
          if (characteristic) break;
        } catch {}
      }
    } catch {}
  }

  // 2. Fallback: scan semua services
  if (!characteristic) {
    try {
      const allSvcs = await server.getPrimaryServices();
      for (const svc of allSvcs) {
        try {
          const chars = await svc.getCharacteristics();
          for (const ch of chars) {
            if (ch.properties.writeWithoutResponse || ch.properties.write) {
              characteristic = ch; break;
            }
          }
          if (characteristic) break;
        } catch {}
      }
    } catch {}
  }

  if (!characteristic) {
    throw new Error(
      'Printer tidak mendukung koneksi ini.\n' +
      'Pastikan:\n' +
      '1. Printer MP-58 Pro menyala (lampu berkedip)\n' +
      '2. Printer tidak terhubung ke device lain\n' +
      '3. Restart printer → coba lagi'
    );
  }

  _device = device;
  _char = characteristic;
  return device.name || 'Thermal Printer';
}

/** Handler saat device disconnect (dari sisi hardware) */
function _onDeviceDisconnected() {
  if (_reconnecting) return;
  _char = null;
  _notifyStatus(false, _device?.name || null);
  // Coba auto-reconnect
  _scheduleReconnect();
}

function _scheduleReconnect() {
  if (_reconnectAttempts >= MAX_RECONNECT || !_device) return;
  _reconnecting = true;
  _reconnectAttempts++;
  const delay = _reconnectAttempts * 2000; // 2s, 4s, 6s

  setTimeout(async () => {
    if (!_device) { _reconnecting = false; return; }
    try {
      await _connectToDevice(_device);
      _reconnecting = false;
      _reconnectAttempts = 0;
      _notifyStatus(true, _device?.name || null);
    } catch {
      if (_reconnectAttempts < MAX_RECONNECT) {
        _scheduleReconnect();
      } else {
        // Gagal 3x — beri tahu user
        _reconnecting = false;
        _device = null; _char = null;
        _notifyStatus(false, null);
      }
    }
  }, delay);
}

/**
 * Auto-reconnect ke printer terakhir TANPA dialog picker.
 * Untuk MP-58 Pro: pakai device object yang masih di-remember browser.
 */
export async function autoReconnectPrinter(): Promise<boolean> {
  if (!isWebBluetoothSupported()) return false;
  if (isBluetoothPrinterConnected()) return true;

  // Kalau masih punya _device reference → reconnect langsung
  if (_device) {
    try {
      const name = await _connectToDevice(_device);
      _reconnecting = false;
      _reconnectAttempts = 0;
      try { localStorage.setItem(LS_PRINTER_NAME, name); } catch {}
      _device.removeEventListener('gattserverdisconnected', _onDeviceDisconnected);
      _device.addEventListener('gattserverdisconnected', _onDeviceDisconnected);
      startPrinterWatchdog();
      _notifyStatus(true, name);
      return true;
    } catch {
      // Fallthrough ke getDevices()
    }
  }

  const savedName = localStorage.getItem(LS_PRINTER_NAME);
  if (!savedName) return false;

  try {
    const nav = navigator as any;
    if (!nav.bluetooth.getDevices) return false;
    const devices: any[] = await nav.bluetooth.getDevices();
    if (!devices.length) return false;

    const target = devices.find((d: any) => d.name === savedName) || devices[0];
    if (!target) return false;

    const name = await _connectToDevice(target);
    try { localStorage.setItem(LS_PRINTER_NAME, name); } catch {}
    target.removeEventListener('gattserverdisconnected', _onDeviceDisconnected);
    target.addEventListener('gattserverdisconnected', _onDeviceDisconnected);
    startPrinterWatchdog();
    _reconnectAttempts = 0;
    _notifyStatus(true, name);
    return true;
  } catch {
    return false;
  }
}

/** Mulai watchdog: cek koneksi setiap 5 detik */
export function startPrinterWatchdog(): void {
  if (_watchdogTimer) return; // sudah jalan
  _watchdogTimer = setInterval(() => {
    if (!_device) { stopPrinterWatchdog(); return; }
    const nowConnected = _device?.gatt?.connected === true;
    if (!nowConnected && !_reconnecting) {
      _char = null;
      _notifyStatus(false, _device?.name || null);
      _scheduleReconnect();
    }
  }, 5000);
}

/** Stop watchdog */
export function stopPrinterWatchdog(): void {
  if (_watchdogTimer) {
    clearInterval(_watchdogTimer);
    _watchdogTimer = null;
  }
}

// ── Send data via BLE (MP-58 Pro compatible) ─────────────────────────────────
async function sendBT(data: Uint8Array): Promise<void> {
  if (!_char) throw new Error('Printer tidak terhubung');

  // BLE MTU default = 20 bytes, delay 50ms untuk stabilitas
  const CHUNK = BLE_CHUNK;
  const DELAY = BLE_DELAY;
  const MAX_RETRY = 3;

  for (let i = 0; i < data.length; i += CHUNK) {
    const chunk = data.slice(i, i + CHUNK);
    let sent = false;

    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      try {
        // Prioritas writeValueWithoutResponse (lebih cepat di BLE)
        if (_char.properties?.writeWithoutResponse) {
          await _char.writeValueWithoutResponse(chunk);
        } else {
          await _char.writeValue(chunk);
        }
        sent = true;
        break;
      } catch (e: any) {
        if (attempt < MAX_RETRY - 1) {
          await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
        } else {
          throw new Error(`Gagal mengirim data ke printer (chunk ${i}/${data.length}): ${e?.message}`);
        }
      }
    }

    if (sent) await new Promise(r => setTimeout(r, DELAY));
  }
}

export async function printReceipt(data: PrintData): Promise<void> {
  // Auto-reconnect kalau tidak terhubung
  if (!isBluetoothPrinterConnected()) {
    _notifyStatus(false, _device?.name || null);
    const ok = await autoReconnectPrinter();
    if (!ok) throw new Error(
      'Printer tidak terhubung.\n' +
      'Buka Pengaturan → Printer → Pilih Printer untuk menghubungkan kembali.'
    );
  }
  await sendBT(buildReceiptBytes(data));
}

/** Test print khusus MP-58 Pro */
export async function testPrintMP58(): Promise<void> {
  if (!isBluetoothPrinterConnected()) throw new Error('Printer belum terhubung');
  const testData: PrintData = {
    storeName: 'KaffePOS',
    tagline: 'Test Print MP-58 Pro ✓',
    footer: 'Printer terhubung & berfungsi!',
    paperWidth: '58mm',
    transaction: {
      id: 'TEST-' + Date.now().toString().slice(-6),
      date: new Date().toISOString(),
      cashier: 'Test',
      method: 'Tunai',
      items: [{ name: 'Kopi Test', qty: 1, price: 15000, subtotal: 15000 }],
      subtotal: 15000, discount: 0, tax: 0, total: 15000, paid: 15000, change: 0,
    },
  };
  await printReceipt(testData);
}

// ── Browser print (universal fallback) ──────────────────────────────────────
export async function printReceiptBrowser(data: PrintData): Promise<void> {
  const dc = data.divider === 'star' ? '*' : data.divider === 'equal' ? '=' : data.divider === 'dot' ? '·' : '-';
  const W = data.paperWidth === '80mm' ? 72 : 48;
  const fs = data.fontSize === 'large' ? '13px' : data.fontSize === 'small' ? '10px' : '11px';
  const pw = data.paperWidth === '80mm' ? '76mm' : '54mm';
  const divLine = dc.repeat(W);
  const fRpH = (n: number) => 'Rp' + new Intl.NumberFormat('id-ID').format(n || 0);
  const t = data.transaction;
  const taxAmt = t.tax || 0;

  // FIX: konversi logo ke grayscale tanpa background sebelum print
  let processedLogoUrl = '';
  if (data.logoUrl && data.logoUrl.length > 10) {
    try {
      processedLogoUrl = await convertLogoForPrint(data.logoUrl, { mode: 'grayscale', threshold: 220 });
    } catch {
      processedLogoUrl = data.logoUrl; // fallback original
    }
  }

  const html = `<!DOCTYPE html><html><head><title>Struk</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',Courier,monospace;font-size:${fs};width:${pw};padding:3mm 2mm;color:#000;line-height:1.5}
.c{text-align:center}.r{text-align:right}.b{font-weight:700}
.lg{font-size:1.4em;margin-bottom:2px}
.row{display:flex;justify-content:space-between}
.div{color:#666;margin:3px 0;white-space:pre}
.pl{padding-left:8px}
.logo-wrap{display:flex;justify-content:center;margin-bottom:4px}
.logo-img{max-height:${data.logoSize || 40}px;max-width:90%;object-fit:contain;mix-blend-mode:multiply;filter:brightness(0)}
@media print{
  html,body{width:auto;margin:0;padding:0}
  @page{margin:2mm;size:${data.paperWidth||'58mm'} auto}
  .logo-img{filter:brightness(0);print-color-adjust:exact;-webkit-print-color-adjust:exact}
}
</style></head><body>`;

  let body = '';
  if (processedLogoUrl) {
    const logoAlign = data.logoPosition === 'left' ? 'flex-start' : data.logoPosition === 'right' ? 'flex-end' : 'center';
    body += `<div class="logo-wrap" style="justify-content:${logoAlign}"><img src="${processedLogoUrl}" class="logo-img" /></div>`;
  }
  body += `<p class="c b lg">${data.storeName}</p>`;
  if (data.tagline) body += `<p class="c">${data.tagline}</p>`;
  if (data.address) body += `<p class="c" style="font-size:0.9em">${data.address}</p>`;
  if (data.phone) body += `<p class="c" style="font-size:0.9em">WA: ${data.phone}</p>`;
  body += `<p class="div">${divLine}</p>`;
  if (data.showTrxId !== false) body += `<p>No: ${t.id}</p>`;
  body += `<p>Tgl: ${fDate(t.date)}</p>`;
  if (data.showCashier !== false) body += `<p>Kasir: @${t.cashier}</p>`;
  body += `<p class="div">${divLine}</p>`;
  t.items.forEach(i => {
    body += `<p class="b">${i.name}</p>`;
    body += `<div class="row pl"><span>${i.qty}x ${fRpH(i.price)}</span><span>${fRpH(i.subtotal)}</span></div>`;
  });
  body += `<p class="div">${divLine}</p>`;
  if (t.discount > 0) body += `<div class="row"><span>Diskon</span><span>-${fRpH(t.discount)}</span></div>`;
  if (taxAmt > 0) body += `<div class="row"><span>Pajak</span><span>${fRpH(taxAmt)}</span></div>`;
  body += `<div class="row b" style="font-size:1.15em"><span>TOTAL</span><span>${fRpH(t.total)}</span></div>`;
  body += `<p class="div">${divLine}</p>`;
  body += `<div class="row"><span>Bayar (${t.method})</span><span>${fRpH(t.paid)}</span></div>`;
  if (t.method === 'Tunai') body += `<div class="row b"><span>Kembali</span><span>${fRpH(t.change)}</span></div>`;
  body += `<p class="div">${divLine}</p>`;
  body += `<p class="c b">${data.footer || 'Terima kasih!'}</p>`;
  if (data.customLine1) body += `<p class="c" style="font-size:0.9em">${data.customLine1}</p>`;
  if (data.customLine2) body += `<p class="c" style="font-size:0.9em">${data.customLine2}</p>`;

  const fullHtml = html + body + `<script>window.onload=function(){window.print();setTimeout(()=>window.close(),1500);}<\/script></body></html>`;

  const w = window.open('', '_blank', 'width=400,height=600,toolbar=0,menubar=0,scrollbars=1');
  if (w) {
    w.document.write(fullHtml);
    w.document.close();
  } else {
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `struk-${t.id.slice(-8)}.html`;
    a.click();
  }
}


// ── USB Printing via Capacitor native plugin ─────────────────────────────────

interface UsbPrinterPlugin {
  listUsbPrinters(): Promise<{ devices: Array<{ name: string; vendorId: number; productId: number; productName: string; hasPermission: boolean }> }>;
  connectUsb(opts: { vendorId: number; productId: number }): Promise<{ name: string; vendorId: number; productId: number }>;
  print(opts: { data: string }): Promise<{ success: boolean }>;
  disconnectUsb(): Promise<{ success: boolean }>;
  isUsbConnected(): Promise<{ connected: boolean }>;
}

import { registerPlugin } from '@capacitor/core';

const UsbPrinter = registerPlugin<UsbPrinterPlugin>('UsbPrinter');

let _usbConnected = false;
let _usbName: string | null = null;

const LS_USB_VENDOR  = 'kpos_usb_vendor_id';
const LS_USB_PRODUCT = 'kpos_usb_product_id';
const LS_USB_NAME    = 'kpos_usb_name';
const LS_PRINT_METHOD = 'kpos_print_method';

export type PrintMethod = 'bluetooth' | 'usb' | 'browser';

export function getSavedPrintMethod(): PrintMethod {
  return (localStorage.getItem(LS_PRINT_METHOD) as PrintMethod) || 'browser';
}
export function setSavedPrintMethod(m: PrintMethod) {
  try { localStorage.setItem(LS_PRINT_METHOD, m); } catch {}
}

/** Cek apakah USB printer terhubung */
export function isUsbPrinterConnected(): boolean {
  return _usbConnected;
}

/** Nama USB printer yang terhubung */
export function getUsbPrinterName(): string | null {
  return _usbName;
}

/** List semua USB device yang terdeteksi */
export async function listUsbDevices(): Promise<Array<{ name: string; vendorId: number; productId: number; productName: string; hasPermission: boolean }>> {
  try {
    const res = await UsbPrinter.listUsbPrinters();
    return res.devices || [];
  } catch {
    return [];
  }
}

/**
 * Connect ke USB printer.
 * Kalau vendorId/productId tidak diberikan → ambil device pertama yang tersedia.
 * Returns nama printer.
 */
export async function connectUsbPrinter(vendorId?: number, productId?: number): Promise<string> {
  let vId = vendorId;
  let pId = productId;

  // Kalau tidak ada arg → ambil dari localStorage atau scan
  if (!vId || !pId) {
    const savedV = localStorage.getItem(LS_USB_VENDOR);
    const savedP = localStorage.getItem(LS_USB_PRODUCT);
    if (savedV && savedP) {
      vId = parseInt(savedV); pId = parseInt(savedP);
    } else {
      // Scan device
      const devices = await listUsbDevices();
      if (!devices.length) throw new Error('Tidak ada USB printer terdeteksi. Pastikan kabel OTG terhubung dan printer menyala.');
      vId = devices[0].vendorId;
      pId = devices[0].productId;
    }
  }

  const result = await UsbPrinter.connectUsb({ vendorId: vId!, productId: pId! });
  _usbConnected = true;
  _usbName = result.name || 'USB Printer';

  try {
    localStorage.setItem(LS_USB_VENDOR,  String(vId));
    localStorage.setItem(LS_USB_PRODUCT, String(pId));
    localStorage.setItem(LS_USB_NAME,    _usbName);
    localStorage.setItem(LS_PRINT_METHOD, 'usb');
  } catch {}

  return _usbName;
}

/** Putuskan USB printer */
export async function disconnectUsbPrinter(): Promise<void> {
  try { await UsbPrinter.disconnectUsb(); } catch {}
  _usbConnected = false;
  _usbName = null;
  try {
    localStorage.removeItem(LS_USB_VENDOR);
    localStorage.removeItem(LS_USB_PRODUCT);
    localStorage.removeItem(LS_USB_NAME);
    if (getSavedPrintMethod() === 'usb') setSavedPrintMethod('browser');
  } catch {}
}

/** Cetak struk via USB */
export async function printReceiptUsb(data: PrintData): Promise<void> {
  if (!_usbConnected) {
    // Coba auto-reconnect dari saved device
    try { await connectUsbPrinter(); } catch {
      throw new Error('USB Printer tidak terhubung. Colokkan kabel OTG dan coba lagi.');
    }
  }
  const bytes = buildReceiptBytes(data);
  // Convert Uint8Array → Base64
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  const b64 = btoa(bin);
  await UsbPrinter.print({ data: b64 });
}

// ── Smart print: USB > BT > Browser ─────────────────────────────────────────
export async function smartPrint(data: PrintData): Promise<'bluetooth' | 'usb' | 'browser'> {
  // 1. USB (kalau terhubung)
  if (isUsbPrinterConnected()) {
    try { await printReceiptUsb(data); return 'usb'; } catch {}
  }
  // 2. Bluetooth (kalau Web BT tersedia)
  if (isWebBluetoothSupported()) {
    try { await printReceipt(data); return 'bluetooth'; } catch {}
  }
  // 3. Browser fallback
  printReceiptBrowser(data);
  return 'browser';
}
