/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/utils/thermalPrinter.ts
import { registerPlugin } from '@capacitor/core';
import { BluetoothPrinter as NativeBtPlugin } from '@kduma-autoid/capacitor-bluetooth-printer';

export interface PrintData {
  storeName: string;
  tagline?: string;
  address?: string;
  phone?: string;
  footer?: string;
  paperWidth?: '58mm' | '80mm';
  fontSize?: 'small' | 'medium' | 'large';
  logoUrl?: string;
  logoPosition?: 'left' | 'center' | 'right';
  logoSize?: number;
  showLogoOnReceipt?: boolean;
  showTrxId?: boolean;
  showCashier?: boolean;
  divider?: 'dash' | 'equal' | 'star' | 'dot';
  customLine1?: string;
  customLine2?: string;
  transaction: {
    id: string;
    date: string;
    cashier: string;
    method: string;
    items: Array<{ name: string; qty: number; price: number; subtotal: number }>;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paid: number;
    change: number;
  };
}

// ESC/POS Commands
const CMD = {
  INIT: [0x1B, 0x40],
  ALIGN_LEFT: [0x1B, 0x61, 0x00],
  ALIGN_CENTER: [0x1B, 0x61, 0x01],
  ALIGN_RIGHT: [0x1B, 0x61, 0x02],
  BOLD_ON: [0x1B, 0x45, 0x01],
  BOLD_OFF: [0x1B, 0x45, 0x00],
  FEED: [0x1B, 0x64, 0x03],
  CUT: [0x1D, 0x56, 0x01],
  FONT_A: [0x1B, 0x4D, 0x00],
  FONT_B: [0x1B, 0x4D, 0x01],
};

function fDate(d: string) {
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fRp(n: number) {
  return 'Rp' + new Intl.NumberFormat('id-ID').format(n || 0);
}

/** Konversi logo ke grayscale sebelum print untuk hasil tajam (browser) */
export async function convertLogoForPrint(url: string, opts: { mode: 'grayscale' | 'bw', threshold: number }): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canv = document.createElement('canvas');
      canv.width = img.width; canv.height = img.height;
      const ctx = canv.getContext('2d');
      if (!ctx) { resolve(url); return; }
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canv.width, canv.height);
      const pix = data.data;
      for (let i = 0; i < pix.length; i += 4) {
        const grey = pix[i] * 0.3 + pix[i + 1] * 0.59 + pix[i + 2] * 0.11;
        if (opts.mode === 'bw') {
          const v = grey > opts.threshold ? 255 : 0;
          pix[i] = pix[i + 1] = pix[i + 2] = v;
        } else {
          pix[i] = pix[i + 1] = pix[i + 2] = grey;
        }
      }
      ctx.putImageData(data, 0, 0);
      resolve(canv.toDataURL('image/png'));
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

/** Membentuk bytes ESC/POS untuk thermal printer */
export function buildReceiptBytes(data: PrintData): Uint8Array {
  const bytes: number[] = [];
  const add = (...b:any[]) => { b.forEach(v => { if (Array.isArray(v)) add(...v); else bytes.push(v); }); };
  const line = (txt: string) => { for (let i = 0; i < txt.length; i++) bytes.push(txt.charCodeAt(i)); add(0x0A); };
  const W = data.paperWidth === '80mm' ? 42 : 32;
  const dc = data.divider === 'star' ? '*' : data.divider === 'equal' ? '=' : data.divider === 'dot' ? '·' : '-';
  const divLine = () => line(dc.repeat(W));
  const twoCol = (l: string, r: string, w: number) => {
    const space = w - l.length - r.length;
    return l + (space > 0 ? ' '.repeat(space) : ' ') + r;
  };

  add(CMD.INIT);
  add(CMD.ALIGN_CENTER);
  add(CMD.BOLD_ON);
  line(data.storeName);
  add(CMD.BOLD_OFF);
  if (data.tagline) line(data.tagline);
  if (data.address) line(data.address);
  if (data.phone) line('WA: ' + data.phone);
  divLine();
  add(CMD.ALIGN_LEFT);
  if (data.showTrxId !== false) line('No: ' + data.transaction.id);
  line('Tgl: ' + fDate(data.transaction.date));
  if (data.showCashier !== false) line('Kasir: @' + data.transaction.cashier);
  divLine();
  data.transaction.items.forEach(i => {
    line(i.name);
    line(twoCol('  ' + i.qty + 'x ' + fRp(i.price), fRp(i.subtotal), W));
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

// ── Native Classic Bluetooth SPP Shim ──────────────────────────────
const NativeBt = {
  async listPairedDevices() {
    const result = await NativeBtPlugin.list();
    const devices = (result.devices || []).map((d:any) => ({
      name: d.name || 'Unknown',
      mac: d.address || '',
    }));
    return { devices };
  },
  async connect(opts: { mac: string }) {
    await NativeBtPlugin.connect({ address: opts.mac });
    return { name: opts.mac, mac: opts.mac };
  },
  async print(opts: { data: string }) {
    await NativeBtPlugin.print({ data: opts.data });
    return { success: true };
  },
  async disconnect() {
    await NativeBtPlugin.disconnect();
    return { success: true };
  },
};

let _nativeBtConnected = false;
const _nativeBtName: string | null = null;
let _nativeBtMac: string | null = null;

export function isClassicBtConnected(): boolean { return _nativeBtConnected; }
export function getClassicBtName(): string | null { return _nativeBtName; }

export async function listPairedBtDevices(): Promise<Array<{ name: string; mac: string }>> {
  try {
    const res = await NativeBt.listPairedDevices();
    return res.devices || [];
  } catch { return []; }
}

export async function connectClassicBt(mac?: string): Promise<string> {
  let targetMac = mac || localStorage.getItem('kpos_bt_mac') || '';
  if (!targetMac) {
    const devices = await listPairedBtDevices();
    const printer = devices.find((d:any) => /printer|mp58|rpp/i.test(d.name)) || devices[0];
    if (!printer) throw new Error('No paired devices');
    targetMac = printer.mac;
  }
  await NativeBt.connect({ mac: targetMac });
  _nativeBtConnected = true; _nativeBtMac = targetMac;
  return targetMac;
}

export async function disconnectClassicBt(): Promise<void> {
  try { await NativeBt.disconnect(); } catch { /* ignore */ }
  _nativeBtConnected = false;
}

export async function printReceiptClassicBt(data: PrintData): Promise<void> {
  if (!_nativeBtConnected) await connectClassicBt();
  const bytes = buildReceiptBytes(data);
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  await NativeBt.print({ data: btoa(bin) });
}

// ── Web Bluetooth (BLE) ────────────────────────────────────────────
let _device:any = null;
let _char:any = null;
const _reconnecting = false;

export function isWebBluetoothSupported(): boolean { return !!(navigator as any).bluetooth; }
export function isBluetoothPrinterConnected(): boolean {
  if (_nativeBtConnected) return true;
  return !!(_device && _char && _device?.gatt?.connected);
}
export function getConnectedPrinterName(): string | null {
  if (_nativeBtConnected) return _nativeBtName || _nativeBtMac;
  return _device?.name || null;
}
export function getPrinterStatus(): { connected: boolean; name: string | null; reconnecting: boolean } {
  return { connected: isBluetoothPrinterConnected(), name: getConnectedPrinterName(), reconnecting: _reconnecting };
}

type StatusCallback = (connected: boolean, name: string | null) => void;
const _statusListeners: Set<StatusCallback> = new Set();
export function onPrinterStatusChange(cb: StatusCallback): () => void {
  _statusListeners.add(cb);
  return () => _statusListeners.delete(cb);
}

export async function connectBluetoothPrinter(): Promise<string> {
  const device = await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
  _char = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
  _device = device;
  return device.name || 'Printer';
}
export function disconnectBluetoothPrinter(): void {
  if (_device?.gatt?.connected) _device.gatt.disconnect();
  _device = null; _char = null;
}

export async function autoReconnectPrinter(): Promise<boolean> { return false; }
export function startPrinterWatchdog(): void {}
export function stopPrinterWatchdog(): void {}

export async function printReceipt(data: PrintData): Promise<void> {
  const bytes = buildReceiptBytes(data);
  if (!_char) throw new Error('Not connected');
  await _char.writeValue(bytes);
}

export async function testPrintMP58(): Promise<void> {
  const data: PrintData = { storeName: 'Test', transaction: { id: '1', date: new Date().toISOString(), cashier: 'Admin', method: 'Cash', items: [], subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0, change: 0 } };
  await printReceipt(data);
}

// ── USB Printing Shim ──────────────────────────────────────────────
interface UsbPrinterPlugin {
  listUsbPrinters(): Promise<{ devices:any[] }>;
  connectUsb(opts: { vendorId: number; productId: number }): Promise<any>;
  print(opts: { data: string }): Promise<any>;
  disconnectUsb(): Promise<any>;
}
const UsbPrinter = registerPlugin<UsbPrinterPlugin>('UsbPrinter');
let _usbConnected = false;
let _usbName: string | null = null;

export function isUsbPrinterConnected(): boolean { return _usbConnected; }
export function getUsbPrinterName(): string | null { return _usbName; }
export async function listUsbDevices(): Promise<any[]> {
  try { const res = await UsbPrinter.listUsbPrinters(); return res.devices || []; } catch { return []; }
}
export async function connectUsbPrinter(vendorId?: number, productId?: number): Promise<string> {
  const result = await UsbPrinter.connectUsb({ vendorId: vendorId!, productId: productId! });
  _usbConnected = true; _usbName = result.name;
  return _usbName!;
}
export async function disconnectUsbPrinter(): Promise<void> {
  try { await UsbPrinter.disconnectUsb(); } catch { /* ignore */ }
  _usbConnected = false;
}
export async function printReceiptUsb(data: PrintData): Promise<void> {
  const bytes = buildReceiptBytes(data);
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  await UsbPrinter.print({ data: btoa(bin) });
}

// ── Config ─────────────────────────────────────────────────────────
export type PrintMethod = 'bluetooth' | 'usb' | 'browser';
export function getSavedPrintMethod(): PrintMethod { return (localStorage.getItem('kpos_print_method') as PrintMethod) || 'browser'; }
export function setSavedPrintMethod(m: PrintMethod) { localStorage.setItem('kpos_print_method', m); }

// ── Fallback Browser Print ─────────────────────────────────────────
export async function printReceiptBrowser(data: PrintData): Promise<void> {
  const html = `<!DOCTYPE html><html><body><h1>${data.storeName}</h1><script>window.print();setTimeout(()=>window.close(),1000);</script></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

export async function smartPrint(data: PrintData): Promise<PrintMethod> {
  if (isBluetoothPrinterConnected()) { await printReceipt(data); return 'bluetooth'; }
  printReceiptBrowser(data); return 'browser';
}
