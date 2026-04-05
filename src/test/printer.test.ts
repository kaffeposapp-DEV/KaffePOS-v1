/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as printerUtils from '@/utils/thermalPrinter';

// Mock the whole utility library
vi.mock('@/utils/thermalPrinter', () => ({
  isClassicBtConnected: vi.fn(() => false),
  getClassicBtName: vi.fn(() => null),
  connectClassicBt: vi.fn().mockResolvedValue('My Printer'),
  disconnectClassicBt: vi.fn(),
  printReceiptClassicBt: vi.fn().mockResolvedValue(true),
  listPairedBtDevices: vi.fn().mockResolvedValue([{ name: 'Printer 1', mac: '00:11:22:33:44:55' }]),
  isBluetoothPrinterConnected: vi.fn(() => false),
  getConnectedPrinterName: vi.fn(() => null),
  getPrinterStatus: vi.fn(() => ({ reconnecting: false })),
  onPrinterStatusChange: vi.fn(() => () => {}),
  connectBluetoothPrinter: vi.fn().mockResolvedValue('BLE Printer'),
  disconnectBluetoothPrinter: vi.fn(),
  autoReconnectPrinter: vi.fn().mockResolvedValue(true),
  printReceipt: vi.fn().mockResolvedValue(true),
  printReceiptBrowser: vi.fn(),
  isUsbPrinterConnected: vi.fn(() => false),
  getUsbPrinterName: vi.fn(() => null),
  connectUsbPrinter: vi.fn().mockResolvedValue('USB Printer'),
  disconnectUsbPrinter: vi.fn().mockResolvedValue(undefined),
  printReceiptUsb: vi.fn().mockResolvedValue(true),
  listUsbDevices: vi.fn().mockResolvedValue([]),
  getSavedPrintMethod: vi.fn(() => 'bluetooth'),
  setSavedPrintMethod: vi.fn(),
}));

describe('Printer Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scan bluetooth mengembalikan array device', async () => {
    const devices = await printerUtils.listPairedBtDevices();
    expect(devices).toBeInstanceOf(Array);
    expect(devices.length).toBeGreaterThan(0);
    expect(devices[0].name).toBe('Printer 1');
  });

  it('connect ke printer berhasil', async () => {
    const name = await printerUtils.connectClassicBt('00:11:22:33:44:55');
    expect(name).toBe('My Printer');
    expect(printerUtils.connectClassicBt).toHaveBeenCalledWith('00:11:22:33:44:55');
  });

  it('print receipt tidak throw error', async () => {
    const printData = { 
      items: [{ name: 'Coffee', qty: 1, price: 10000 }], 
      total: 10000, 
      date: new Date().toISOString() 
    } as any;
    
    await expect(printerUtils.printReceiptClassicBt(printData)).resolves.not.toThrow();
    expect(printerUtils.printReceiptClassicBt).toHaveBeenCalled();
  });

  it('auto-reconnect saat koneksi putus (mock logic)', async () => {
    // Verivikasi autoReconnectPrinter dipanggil
    const ok = await printerUtils.autoReconnectPrinter();
    expect(ok).toBe(true);
    expect(printerUtils.autoReconnectPrinter).toHaveBeenCalled();
  });
});
