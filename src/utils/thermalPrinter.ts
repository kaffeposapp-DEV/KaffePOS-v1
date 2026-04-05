/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/utils/thermalPrinter.ts
import { registerPlugin } from '@capacitor/core';
import { BluetoothPrinter as NativeBtPlugin } from '@kduma-autoid/capacitor-bluetooth-printer';
import {
  formatReceiptCurrency,
  formatReceiptDate,
  getReceiptCharWidth,
  getReceiptDividerChar,
} from '@/utils/receipt';

export interface PrintData {
  storeName: string;
  tagline?: string;
  address?: string;
  phone?: string;
  headerText?: string;
  footer?: string;
  paperWidth?: '58mm' | '80mm';
  fontSize?: 'small' | 'medium' | 'large';
  logoUrl?: string;
  logoPosition?: 'left' | 'center' | 'right';
  logoSize?: number;
  showLogoOnReceipt?: boolean;
  showTrxId?: boolean;
  showCashier?: boolean;
  showTax?: boolean;
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
  return formatReceiptDate(d);
}

function fRp(n: number) {
  return formatReceiptCurrency(n);
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

async function loadImageData(url: string, maxWidth: number, desiredWidth?: number) {
  return new Promise<ImageData | null>((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const scaleWidth = Math.max(48, Math.min(maxWidth, desiredWidth || Math.round(maxWidth * 0.45)));
      const ratio = img.height / Math.max(1, img.width);
      const width = Math.max(8, Math.min(maxWidth, Math.round(scaleWidth)));
      const height = Math.max(8, Math.round(width * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { resolve(null); return; }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(ctx.getImageData(0, 0, width, height));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function imageDataToEscPosRaster(imageData: ImageData): number[] {
  const { width, height, data } = imageData;
  const widthBytes = Math.ceil(width / 8);
  const raster = [
    0x1D, 0x76, 0x30, 0x00,
    widthBytes & 0xff, (widthBytes >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ];

  for (let y = 0; y < height; y += 1) {
    for (let xb = 0; xb < widthBytes; xb += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = xb * 8 + bit;
        if (x >= width) continue;
        const idx = (y * width + x) * 4;
        const grey = data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11;
        if (grey < 190) byte |= (0x80 >> bit);
      }
      raster.push(byte);
    }
  }

  return raster;
}

/** Membentuk bytes ESC/POS untuk thermal printer */
export async function buildReceiptBytes(data: PrintData): Promise<Uint8Array> {
  const bytes: number[] = [];
  const add = (...b:any[]) => { b.forEach(v => { if (Array.isArray(v)) add(...v); else bytes.push(v); }); };
  const line = (txt: string) => { for (let i = 0; i < txt.length; i++) bytes.push(txt.charCodeAt(i)); add(0x0A); };
  const W = getReceiptCharWidth(data.paperWidth);
  const dc = getReceiptDividerChar(data.divider);
  const divLine = () => line(dc.repeat(W));
  const twoCol = (l: string, r: string, w: number) => {
    const space = w - l.length - r.length;
    return l + (space > 0 ? ' '.repeat(space) : ' ') + r;
  };

  add(CMD.INIT);
  add(CMD.ALIGN_CENTER);
  if (data.showLogoOnReceipt !== false && data.logoUrl) {
    const maxWidth = data.paperWidth === '80mm' ? 576 : 384;
    const desiredWidth = Math.round((data.logoSize || 40) * 3);
    const imageData = await loadImageData(data.logoUrl, maxWidth, desiredWidth);
    if (imageData) {
      if (data.logoPosition === 'left') add(CMD.ALIGN_LEFT);
      else if (data.logoPosition === 'right') add(CMD.ALIGN_RIGHT);
      else add(CMD.ALIGN_CENTER);
      add(imageDataToEscPosRaster(imageData));
      add(0x0A);
      add(CMD.ALIGN_CENTER);
    }
  }
  add(CMD.BOLD_ON);
  line(data.storeName);
  add(CMD.BOLD_OFF);
  if (data.tagline) line(data.tagline);
  if (data.address) line(data.address);
  if (data.phone) line('WA: ' + data.phone);
  if (data.headerText) line(data.headerText);
  divLine();
  add(CMD.ALIGN_LEFT);
  if (data.showTrxId !== false) line('No: ' + data.transaction.id);
  line('Tgl: ' + fDate(data.transaction.date));
  if (data.showCashier !== false) line('Kasir: ' + data.transaction.cashier);
  divLine();
  data.transaction.items.forEach(i => {
    line(i.name);
    line(twoCol('  ' + i.qty + 'x ' + fRp(i.price), fRp(i.subtotal), W));
  });
  divLine();
  if (data.transaction.discount > 0) line(twoCol('Diskon', '-' + fRp(data.transaction.discount), W));
  if (data.showTax !== false && data.transaction.tax > 0) line(twoCol('Pajak', fRp(data.transaction.tax), W));
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
  const bytes = await buildReceiptBytes(data);
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
  const bytes = await buildReceiptBytes(data);
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
  const bytes = await buildReceiptBytes(data);
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  await UsbPrinter.print({ data: btoa(bin) });
}

// ── Config ─────────────────────────────────────────────────────────
export type PrintMethod = 'bluetooth' | 'usb' | 'browser';
export function getSavedPrintMethod(): PrintMethod { return (localStorage.getItem('kpos_print_method') as PrintMethod) || 'browser'; }
export function setSavedPrintMethod(m: PrintMethod) { localStorage.setItem('kpos_print_method', m); }

// ── Fallback Browser Print ─────────────────────────────────────────
export async function printReceiptBrowser(data: PrintData): Promise<void> {
  const W = data.paperWidth === '80mm' ? 300 : 210;
  const fontSize = data.fontSize === 'large' ? 12 : data.fontSize === 'small' ? 9 : 10.5;
  const divider = getReceiptDividerChar(data.divider).repeat(Math.floor(W / 7));
  const esc = (value = '') =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const itemHtml = data.transaction.items.map((item) => `
    <div class="item">
      <div class="item-name">${esc(item.name)}</div>
      <div class="row">
        <span>${item.qty}x ${esc(fRp(item.price))}</span>
        <span>${esc(fRp(item.subtotal))}</span>
      </div>
    </div>
  `).join('');
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${esc(data.storeName)}</title>
      <style>
        body { margin: 0; padding: 16px; background: #f8fafc; }
        .receipt {
          width: ${W}px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0;
          border-radius: 8px; padding: 10px 8px; color: #1e293b; line-height: 1.6;
          font-family: 'Courier New', monospace; font-size: ${fontSize}px;
        }
        .center { text-align: center; }
        .left { text-align: left; }
        .right { text-align: right; }
        .title { font-weight: bold; font-size: ${fontSize + 3}px; }
        .muted { color: #64748b; }
        .divider { color: #94a3b8; margin: 4px 0; white-space: pre-wrap; }
        .row { display: flex; justify-content: space-between; }
        .bold { font-weight: bold; }
        .total { font-weight: bold; font-size: ${fontSize + 1}px; }
        .logo img { display: inline-block; object-fit: contain; height: ${Math.max(20, data.logoSize || 40)}px; }
        @media print {
          body { padding: 0; background: #fff; }
          .receipt { border: 0; width: 100%; max-width: none; }
        }
      </style>
    </head>
    <body>
      <div class="receipt">
        ${data.showLogoOnReceipt !== false && data.logoUrl ? `<div class="logo ${data.logoPosition || 'center'}"><img src="${data.logoUrl}" alt="logo" /></div>` : ''}
        <div class="center title">${esc(data.storeName)}</div>
        ${data.tagline ? `<div class="center muted">${esc(data.tagline)}</div>` : ''}
        ${data.address ? `<div class="center muted">${esc(data.address)}</div>` : ''}
        ${data.phone ? `<div class="center muted">WA: ${esc(data.phone)}</div>` : ''}
        ${data.headerText ? `<div class="center">${esc(data.headerText)}</div>` : ''}
        <div class="divider">${esc(divider)}</div>
        ${data.showTrxId !== false ? `<div class="muted">No: ${esc(data.transaction.id)}</div>` : ''}
        <div class="muted">Tgl: ${esc(fDate(data.transaction.date))}</div>
        ${data.showCashier !== false ? `<div class="muted">Kasir: ${esc(data.transaction.cashier)}</div>` : ''}
        <div class="divider">${esc(divider)}</div>
        ${itemHtml}
        <div class="divider">${esc(divider)}</div>
        ${data.transaction.discount > 0 ? `<div class="row"><span>Diskon</span><span>-${esc(fRp(data.transaction.discount))}</span></div>` : ''}
        ${data.showTax !== false && data.transaction.tax > 0 ? `<div class="row"><span>Pajak</span><span>${esc(fRp(data.transaction.tax))}</span></div>` : ''}
        <div class="row total"><span>TOTAL</span><span>${esc(fRp(data.transaction.total))}</span></div>
        <div class="divider">${esc(divider)}</div>
        <div class="row"><span>Bayar (${esc(data.transaction.method)})</span><span>${esc(fRp(data.transaction.paid))}</span></div>
        ${data.transaction.method === 'Tunai' ? `<div class="row bold"><span>Kembali</span><span>${esc(fRp(data.transaction.change))}</span></div>` : ''}
        <div class="divider">${esc(divider)}</div>
        <div class="center bold">${esc(data.footer || 'Terima kasih!')}</div>
        ${data.customLine1 ? `<div class="center muted">${esc(data.customLine1)}</div>` : ''}
        ${data.customLine2 ? `<div class="center muted">${esc(data.customLine2)}</div>` : ''}
      </div>
      <script>window.print();setTimeout(()=>window.close(),1000);</script>
    </body>
  </html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

export async function smartPrint(data: PrintData): Promise<PrintMethod> {
  if (isBluetoothPrinterConnected()) { await printReceipt(data); return 'bluetooth'; }
  printReceiptBrowser(data); return 'browser';
}
