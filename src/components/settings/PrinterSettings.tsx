 
 
 
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/settings/PrinterSettings.tsx
// UI pengaturan Bluetooth thermal printer — scan, connect, test print, paper size
import { useState, useCallback, useEffect } from 'react';
import {
  Bluetooth, BluetoothOff, RefreshCw, Printer,
  CheckCircle, Circle, Trash2, Zap, AlertCircle
} from 'lucide-react';
import {
  scanPairedDevices, connectPrinter, disconnectPrinter,
  testPrint, getSavedPrinter, savePrinterToStorage, clearSavedPrinter,
  requestBluetoothPermission, getPaperSize, savePaperSize,
  type BTPrinterDevice, type SavedPrinter,
} from '@/utils/bluetoothPrinter';

interface Props { toast: { showToast: (msg: string, type: string) => void } }

type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export default function PrinterSettings({ toast }: Props) {
  const [devices,           setDevices]           = useState<BTPrinterDevice[]>([],   );
  const [allDevices,        setAllDevices]         = useState<BTPrinterDevice[]>([],   );
  const [scanning,          setScanning]           = useState(false);
  const [connStatus,        setConnStatus]         = useState<ConnStatus>('disconnected');
  const [connectedPrinter,  setConnectedPrinter]   = useState<SavedPrinter | null>(null);
  const [testing,           setTesting]            = useState(false);
  const [showAll,           setShowAll]            = useState(false);
  const [paperSize,         setPaperSize]          = useState<58 | 80>(getPaperSize());
  const [errorMsg,          setErrorMsg]           = useState('');

  // Load saved printer saat mount
  useEffect(() => {
    const saved = getSavedPrinter();
    if (saved) {
      setConnectedPrinter(saved);
      setConnStatus('connected');
    }
  }, [],   );

  const handleAutoConnect = useCallback(async () => {
    const saved = getSavedPrinter();
    if (!saved) {
      toast.showToast('Belum ada printer tersimpan. Scan dan pilih printer dulu.', 'warning');
      return;
    }
    setConnStatus('connecting');
    setErrorMsg('');
    try {
      await connectPrinter(saved.address, 2);
      setConnectedPrinter(saved);
      setConnStatus('connected');
      toast.showToast(`✅ Terhubung ke ${saved.name}`, 'success');
    } catch (err:any) {
      const msg = err instanceof Error ? err.message : 'Gagal connect';
      setConnStatus('error');
      setErrorMsg(msg);
      toast.showToast(`❌ ${msg}`, 'error');
    }
  }, [toast]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setErrorMsg('');
    try {
      const hasPermission = await requestBluetoothPermission();
      if (!hasPermission) {
        setErrorMsg('Bluetooth tidak aktif atau izin ditolak. Aktifkan Bluetooth di HP kamu.');
        return;
      }
      const { printers, all } = await scanPairedDevices();
      setDevices(printers);
      setAllDevices(all);
      if (printers.length === 0 && all.length === 0) {
        setErrorMsg('Tidak ada perangkat yang dipasangkan. Pasangkan printer via Pengaturan > Bluetooth HP dulu.');
      }
    } catch (err:any) {
      const msg = err instanceof Error ? err.message : 'Scan gagal';
      setErrorMsg(msg);
    } finally {
      setScanning(false);
    }
  }, [],   );

  const handleConnect = useCallback(async (device: BTPrinterDevice) => {
    setConnStatus('connecting');
    setErrorMsg('');
    try {
      // Disconnect dulu jika ada koneksi aktif
      if (connectedPrinter) await disconnectPrinter();
      await connectPrinter(device.address);
      const saved: SavedPrinter = { name: device.name, address: device.address };
      savePrinterToStorage(saved);
      setConnectedPrinter(saved);
      setConnStatus('connected');
      toast.showToast(`✅ Terhubung ke ${device.name}`, 'success');
    } catch (err:any) {
      const msg = err instanceof Error ? err.message : 'Gagal connect';
      setConnStatus('error');
      setErrorMsg(msg);
      toast.showToast(`❌ ${msg}`, 'error');
    }
  }, [connectedPrinter, toast]);

  const handleDisconnect = useCallback(async () => {
    await disconnectPrinter();
    clearSavedPrinter();
    setConnectedPrinter(null);
    setConnStatus('disconnected');
    toast.showToast('Printer diputus', 'success');
  }, [toast]);

  const handleTestPrint = useCallback(async () => {
    if (connStatus !== 'connected') {
      toast.showToast('Hubungkan printer dulu', 'warning'); return;
    }
    setTesting(true);
    try {
      await testPrint(paperSize);
      toast.showToast('✅ Test print berhasil!', 'success');
    } catch (err:any) {
      const msg = err instanceof Error ? err.message : 'Test print gagal';
      toast.showToast(`❌ ${msg}`, 'error');
    } finally { setTesting(false); }
  }, [connStatus, paperSize, toast]);

  const handlePaperSize = (size: 58 | 80) => {
    setPaperSize(size);
    savePaperSize(size);
    toast.showToast(`Paper size: ${size}mm disimpan`, 'success');
  };

  const displayedDevices = showAll ? allDevices : devices;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center shrink-0">
          <Printer size={20} className="text-blue-600" />
        </div>
        <div>
          <p className="font-black text-slate-800">Printer Thermal</p>
          <p className="text-xs text-slate-400">Bluetooth Classic (SPP)</p>
        </div>
      </div>

      {/* Status koneksi */}
      <div className={`rounded-2xl p-4 border-2 ${
        connStatus === 'connected'   ? 'bg-green-50  border-green-200' :
        connStatus === 'connecting'  ? 'bg-blue-50   border-blue-200'  :
        connStatus === 'error'       ? 'bg-red-50    border-red-200'   :
        'bg-slate-50 border-slate-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${
              connStatus === 'connected'  ? 'bg-green-500 animate-pulse' :
              connStatus === 'connecting' ? 'bg-blue-500 animate-pulse'  :
              connStatus === 'error'      ? 'bg-red-500'                 :
              'bg-slate-300'
            }`} />
            <div>
              <p className={`font-bold text-sm ${
                connStatus === 'connected'  ? 'text-green-700' :
                connStatus === 'connecting' ? 'text-blue-700'  :
                connStatus === 'error'      ? 'text-red-700'   :
                'text-slate-500'
              }`}>
                {connStatus === 'connected'  ? `Terhubung` :
                 connStatus === 'connecting' ? 'Menghubungkan...' :
                 connStatus === 'error'      ? 'Gagal terhubung' :
                 'Tidak terhubung'}
              </p>
              {connectedPrinter && (
                <p className="text-xs text-slate-500 font-mono">{connectedPrinter.name}</p>
              )}
            </div>
          </div>

          {connStatus !== 'connected' && getSavedPrinter() && (
            <button onClick={handleAutoConnect} disabled={connStatus === 'connecting'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-xl active:scale-95 disabled:opacity-50">
              {connStatus === 'connecting'
                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                : <Bluetooth size={12}/>}
              {connStatus === 'connecting' ? 'Menghubungkan...' : 'Hubungkan Otomatis'}
            </button>
          )}

          {connStatus === 'connected' && (
            <div className="flex gap-2">
              <button onClick={handleTestPrint} disabled={testing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-xl active:scale-95 disabled:opacity-50">
                {testing
                  ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                  : <Zap size={12}/>
                }
                {testing ? '...' : 'Test'}
              </button>
              <button onClick={handleDisconnect}
                className="p-1.5 bg-red-100 text-red-500 rounded-xl active:scale-95">
                <Trash2 size={14}/>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5"/>
          <p className="text-red-600 text-xs">{errorMsg}</p>
        </div>
      )}

      {/* Paper size selector */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <p className="text-xs font-black text-slate-400 mb-3">UKURAN KERTAS</p>
        <div className="flex gap-3">
          {([58, 80] as const).map(size => (
            <button key={size} onClick={() => handlePaperSize(size)}
              className={`flex-1 py-3 rounded-xl text-sm font-bold border-2 transition-all active:scale-95 ${
                paperSize === size
                  ? 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-200'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}>
              {size}mm
              <p className={`text-[10px] font-normal mt-0.5 ${paperSize === size ? 'text-blue-100' : 'text-slate-400'}`}>
                {size === 58 ? '32 karakter' : '48 karakter'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Scan & daftar device */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-50">
          <p className="text-xs font-black text-slate-400">PILIH PRINTER</p>
          <button onClick={handleScan} disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-xl active:scale-95 disabled:opacity-50">
            <RefreshCw size={12} className={scanning ? 'animate-spin' : ''}/>
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>

        {displayedDevices.length === 0 ? (
          <div className="p-6 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              {scanning
                ? <Bluetooth size={24} className="text-blue-400 animate-pulse"/>
                : <BluetoothOff size={24} className="text-slate-300"/>
              }
            </div>
            <p className="text-slate-400 text-sm font-bold mb-1">
              {scanning ? 'Mencari perangkat...' : 'Belum ada perangkat'}
            </p>
            <p className="text-slate-300 text-xs">
              {scanning ? 'Mohon tunggu sebentar' : 'Tap "Scan" untuk mencari printer yang dipasangkan'}
            </p>
          </div>
        ) : (
          <div>
            {displayedDevices.map((device) => {
              const isConnected = connectedPrinter?.address === device.address && connStatus === 'connected';
              const isConnecting = connStatus === 'connecting';
              return (
                <button key={device.address}
                  onClick={() => !isConnected && handleConnect(device)}
                  disabled={isConnecting}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 last:border-0 active:bg-slate-50 transition-colors text-left ${
                    isConnected ? 'bg-green-50' : ''
                  }`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isConnected ? 'bg-green-100' : 'bg-slate-100'
                  }`}>
                    {isConnected
                      ? <CheckCircle size={18} className="text-green-500"/>
                      : <Circle size={18} className="text-slate-300"/>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm truncate ${isConnected ? 'text-green-700' : 'text-slate-700'}`}>
                      {device.name}
                    </p>
                    <p className="text-xs text-slate-400 font-mono">{device.address}</p>
                  </div>
                  {isConnected && (
                    <span className="text-[10px] font-black text-green-600 bg-green-100 px-2 py-1 rounded-lg shrink-0">
                      TERHUBUNG
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Toggle tampilkan semua */}
        {(allDevices.length > devices.length || showAll) && (
          <button onClick={() => setShowAll(!showAll)}
            className="w-full py-3 text-xs text-slate-400 font-bold border-t border-slate-50 hover:bg-slate-50 active:bg-slate-100">
            {showAll
              ? `Tampilkan printer saja (${devices.length})`
              : `Tampilkan semua perangkat (${allDevices.length})`
            }
          </button>
        )}
      </div>

      {/* Panduan */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-blue-700 text-xs font-black mb-2">📋 Cara Hubungkan Printer</p>
        {[
          'Aktifkan Bluetooth di HP kamu',
          'Nyalakan printer thermal',
          'Buka Pengaturan HP → Bluetooth → Scan',
          'Pasangkan printer (pairing) di Pengaturan HP',
          'Kembali ke sini → tap "Scan" → pilih printer',
          'Tap "Test" untuk coba cetak',
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-2 mb-1">
            <span className="text-blue-400 font-black text-[10px] mt-0.5 shrink-0">{i + 1}.</span>
            <p className="text-blue-600 text-xs">{step}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
