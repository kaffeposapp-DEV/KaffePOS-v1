// src/hooks/usePrinter.ts — KaffePOS v4 — Native Classic BT SPP + USB + Browser
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  // ── Native Classic Bluetooth SPP (RPPO2N) ──
  isClassicBtConnected,
  getClassicBtName,
  connectClassicBt,
  disconnectClassicBt,
  printReceiptClassicBt,
  listPairedBtDevices,
  // ── Web BLE fallback (jika native tidak tersedia) ──
  isWebBluetoothSupported,
  isBluetoothPrinterConnected,
  getConnectedPrinterName,
  getPrinterStatus,
  onPrinterStatusChange,
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  autoReconnectPrinter,
  startPrinterWatchdog,
  printReceipt,
  // ── Browser ──
  printReceiptBrowser,
  // ── USB ──
  isUsbPrinterConnected,
  getUsbPrinterName,
  connectUsbPrinter,
  disconnectUsbPrinter,
  printReceiptUsb,
  listUsbDevices,
  getSavedPrintMethod,
  setSavedPrintMethod,
  type PrintMethod,
  type PrintData,
} from '@/utils/thermalPrinter';

export interface PairedDevice { name: string; mac: string; }
export interface UsbDevice { name: string; vendorId: number; productId: number; productName: string; hasPermission: boolean; }

export interface UsePrinterReturn {
  // ── Native Classic BT (RPPO2N style) ──
  btConnected:      boolean;
  btName:           string | null;
  btReconnecting:   boolean;
  btSupported:      boolean;
  // Hubungkan via MAC/auto-pilih dari paired list
  connectClassic:   (mac?: string) => Promise<string>;
  // Hubungkan via Web BLE picker (fallback)
  selectBluetooth:  () => Promise<string>;
  disconnectBt:     () => void;
  listPaired:       () => Promise<PairedDevice[]>;

  // ── USB ──
  usbConnected:     boolean;
  usbName:          string | null;
  connectUsb:       (vendorId?: number, productId?: number) => Promise<string>;
  disconnectUsb:    () => Promise<void>;
  scanUsb:          () => Promise<UsbDevice[]>;

  // ── Method ──
  activeMethod:     PrintMethod;
  setMethod:        (m: PrintMethod) => void;

  // ── Universal print ──
  print:            (data: PrintData, force?: PrintMethod) => Promise<PrintMethod>;
  lastError:        string | null;
  clearError:       () => void;

  // ── Backward compat ──
  connected:        boolean;
  reconnecting:     boolean;
  printerName:      string | null;
  disconnect:       () => void;
  connect:          (mac?: string) => Promise<string>;
}

export function usePrinter(): UsePrinterReturn {
  // Native BT state
  const [nativeConnected, setNativeConnected] = useState(() => isClassicBtConnected());
  const [nativeName,      setNativeName]      = useState<string | null>(() => getClassicBtName());
  const [nativeRecon,     setNativeRecon]     = useState(false);

  // Web BLE state (fallback)
  const [bleConnected,    setBleConnected]    = useState(() => isBluetoothPrinterConnected());
  const [bleName,         setBleName]         = useState<string | null>(() => getConnectedPrinterName());
  const [bleRecon,        setBleRecon]        = useState(false);

  // USB state
  const [usbConnected,    setUsbConnected]    = useState(() => isUsbPrinterConnected());
  const [usbName,         setUsbName]         = useState<string | null>(() => getUsbPrinterName());

  const [activeMethod,    setActiveMethodS]   = useState<PrintMethod>(() => {
    if (isClassicBtConnected() || isBluetoothPrinterConnected()) return 'bluetooth';
    if (isUsbPrinterConnected()) return 'usb';
    return getSavedPrintMethod();
  });
  const [lastError, setLastError] = useState<string | null>(null);
  const mounted = useRef(true);

  // ── Init: auto-reconnect Classic BT dari saved MAC ───────────────────────
  useEffect(() => {
    mounted.current = true;

    // Coba auto-reconnect ke printer yang pernah dipakai (TANPA dialog)
    const savedMac = localStorage.getItem('kpos_bt_mac');
    if (savedMac && !isClassicBtConnected()) {
      setNativeRecon(true);
      connectClassicBt(savedMac)
        .then(name => {
          if (!mounted.current) return;
          setNativeConnected(true);
          setNativeName(name);
          setNativeRecon(false);
          setActiveMethodS('bluetooth');
          setSavedPrintMethod('bluetooth');
        })
        .catch(() => {
          // Silent fail — tidak tampilkan error, user bisa reconnect manual
          if (!mounted.current) return;
          setNativeRecon(false);
        });
    }

    // Web BLE listener (fallback path)
    const unsubBle = onPrinterStatusChange((connected, name) => {
      if (!mounted.current) return;
      setBleConnected(connected);
      setBleName(name);
      setBleRecon(getPrinterStatus().reconnecting);
    });

    // Web BLE auto-reconnect juga (fallback)
    autoReconnectPrinter().then(ok => {
      if (ok && mounted.current && !isClassicBtConnected()) {
        setBleConnected(true);
        setBleName(getConnectedPrinterName());
        setActiveMethodS('bluetooth');
      }
    });

    return () => {
      mounted.current = false;
      unsubBle();
    };
  }, []);

  const setMethod = useCallback((m: PrintMethod) => {
    setActiveMethodS(m);
    setSavedPrintMethod(m);
  }, []);

  // ── Native Classic BT connect ────────────────────────────────────────────
  const connectClassic = useCallback(async (mac?: string): Promise<string> => {
    setLastError(null);
    setNativeRecon(true);
    try {
      const name = await connectClassicBt(mac);
      if (mounted.current) {
        setNativeConnected(true);
        setNativeName(name);
        setNativeRecon(false);
        setActiveMethodS('bluetooth');
        setSavedPrintMethod('bluetooth');
      }
      return name;
    } catch (e: any) {
      const msg = e?.message || 'Gagal menghubungkan Bluetooth printer';
      if (mounted.current) { setLastError(msg); setNativeRecon(false); }
      throw new Error(msg);
    }
  }, []);

  // ── Web BLE connect (fallback / alternative) ─────────────────────────────
  const selectBluetooth = useCallback(async (): Promise<string> => {
    setLastError(null);
    try {
      const name = await connectBluetoothPrinter();
      if (mounted.current) {
        setBleConnected(true); setBleName(name);
        setActiveMethodS('bluetooth'); setSavedPrintMethod('bluetooth');
      }
      return name;
    } catch (e: any) {
      const msg = e?.message || 'Gagal menghubungkan Bluetooth printer';
      if (mounted.current) setLastError(msg);
      throw new Error(msg);
    }
  }, []);

  const disconnectBt = useCallback(() => {
    disconnectClassicBt(); disconnectBluetoothPrinter();
    if (mounted.current) {
      setNativeConnected(false); setNativeName(null);
      setBleConnected(false);    setBleName(null);
      if (activeMethod === 'bluetooth') setActiveMethodS('browser');
    }
  }, [activeMethod]);

  const listPaired = useCallback(() => listPairedBtDevices(), []);

  // ── USB ──────────────────────────────────────────────────────────────────
  const connectUsb = useCallback(async (vendorId?: number, productId?: number) => {
    setLastError(null);
    try {
      const name = await connectUsbPrinter(vendorId, productId);
      if (mounted.current) {
        setUsbConnected(true); setUsbName(name);
        setActiveMethodS('usb'); setSavedPrintMethod('usb');
      }
      return name;
    } catch (e: any) {
      const msg = e?.message || 'Gagal menghubungkan USB printer';
      if (mounted.current) setLastError(msg);
      throw new Error(msg);
    }
  }, []);

  const disconnectUsb = useCallback(async () => {
    await disconnectUsbPrinter();
    if (mounted.current) {
      setUsbConnected(false); setUsbName(null);
      if (activeMethod === 'usb') setActiveMethodS('browser');
    }
  }, [activeMethod]);

  const scanUsb = useCallback(() => listUsbDevices(), []);

  // ── Universal print ──────────────────────────────────────────────────────
  /**
   * Priority: USB → Native Classic BT → Web BLE → Browser
   */
  const print = useCallback(async (data: PrintData, force?: PrintMethod): Promise<PrintMethod> => {
    if (!mounted.current) return 'browser';
    setLastError(null);
    const method = force || activeMethod;

    // 1. USB
    if (method === 'usb') {
      try { await printReceiptUsb(data); return 'usb'; }
      catch (e: any) {
        if (mounted.current) setLastError(e?.message || 'USB print gagal');
      }
    }

    // 2. Native Classic BT SPP (RPPO2N) — PRIORITAS UTAMA
    if (method === 'bluetooth' || method !== 'browser') {
      // Coba native dulu
      try {
        await printReceiptClassicBt(data);
        if (mounted.current) { setNativeConnected(true); setNativeName(getClassicBtName()); }
        return 'bluetooth';
      } catch (nativeErr: any) {
        // Native gagal → coba Web BLE
        try {
          await printReceipt(data);
          return 'bluetooth';
        } catch (bleErr: any) {
          const msg = `Print gagal. ${nativeErr?.message || bleErr?.message}`;
          if (mounted.current) setLastError(msg);
          // Fallthrough ke browser
        }
      }
    }

    // 3. Browser fallback
    printReceiptBrowser(data);
    return 'browser';
  }, [activeMethod]);

  const clearError = useCallback(() => { if (mounted.current) setLastError(null); }, []);

  // Computed
  const btConnected   = nativeConnected || bleConnected;
  const btName        = nativeName || bleName;
  const btReconnecting = nativeRecon || bleRecon;
  const anyConnected  = btConnected || usbConnected;
  const currentName   = btName || (usbConnected ? usbName : null);

  return {
    btConnected, btName, btReconnecting,
    btSupported: true, // native BT selalu tersedia di Android, Web BLE optional
    connectClassic, selectBluetooth, disconnectBt, listPaired,
    usbConnected, usbName, connectUsb, disconnectUsb, scanUsb,
    activeMethod, setMethod,
    print, lastError, clearError,
    // Backward compat aliases
    connected:    anyConnected,
    reconnecting: btReconnecting,
    printerName:  currentName,
    disconnect:   disconnectBt,
    connect:      connectClassic,
  } as UsePrinterReturn;
}
