// android/app/src/main/java/com/kaffepos/app/UsbPrinterPlugin.java
package com.kaffepos.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;

@CapacitorPlugin(name = "UsbPrinter")
public class UsbPrinterPlugin extends Plugin {

    private static final String TAG = "UsbPrinterPlugin";
    private static final String ACTION_USB_PERMISSION = "com.kaffepos.app.USB_PERMISSION";

    private UsbManager usbManager;
    private UsbDevice connectedDevice;
    private UsbDeviceConnection usbConnection;
    private UsbEndpoint usbEndpoint;

    private PluginCall permissionCall;

    private final BroadcastReceiver usbPermissionReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (ACTION_USB_PERMISSION.equals(intent.getAction())) {
                synchronized (this) {
                    UsbDevice device;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice.class);
                    } else {
                        device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    }
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        if (device != null && permissionCall != null) {
                            doConnect(device, permissionCall);
                        }
                    } else {
                        if (permissionCall != null) {
                            permissionCall.reject("Izin USB ditolak");
                        }
                    }
                    permissionCall = null;
                }
            }
        }
    };

    @Override
    public void load() {
        usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(usbPermissionReceiver, filter);
        }
    }

    /** List semua USB device yang terhubung */
    @PluginMethod
    public void listUsbPrinters(PluginCall call) {
        JSArray arr = new JSArray();
        if (usbManager == null) { call.resolve(new JSObject().put("devices", arr)); return; }
        HashMap<String, UsbDevice> devices = usbManager.getDeviceList();
        for (UsbDevice d : devices.values()) {
            JSObject obj = new JSObject();
            obj.put("name",        d.getDeviceName());
            obj.put("vendorId",    d.getVendorId());
            obj.put("productId",   d.getProductId());
            obj.put("productName", d.getProductName() != null ? d.getProductName() : "USB Printer");
            obj.put("hasPermission", usbManager.hasPermission(d));
            arr.put(obj);
        }
        JSObject result = new JSObject();
        result.put("devices", arr);
        call.resolve(result);
    }

    /** Connect ke USB printer via vendorId + productId */
    @PluginMethod
    public void connectUsb(PluginCall call) {
        int vendorId  = call.getInt("vendorId", 0);
        int productId = call.getInt("productId", 0);

        if (usbManager == null) { call.reject("USB Manager tidak tersedia"); return; }

        HashMap<String, UsbDevice> devices = usbManager.getDeviceList();
        UsbDevice target = null;
        for (UsbDevice d : devices.values()) {
            if (d.getVendorId() == vendorId && d.getProductId() == productId) {
                target = d; break;
            }
        }
        if (target == null) {
            // Coba ambil device pertama (kalau tidak ada filter)
            if (!devices.isEmpty()) {
                target = devices.values().iterator().next();
            } else {
                call.reject("Tidak ada USB device terhubung");
                return;
            }
        }

        if (!usbManager.hasPermission(target)) {
            permissionCall = call;
            PendingIntent pi = PendingIntent.getBroadcast(
                getContext(), 0, new Intent(ACTION_USB_PERMISSION),
                PendingIntent.FLAG_MUTABLE
            );
            usbManager.requestPermission(target, pi);
        } else {
            doConnect(target, call);
        }
    }

    private void doConnect(UsbDevice device, PluginCall call) {
        UsbInterface intf = null;
        UsbEndpoint ep    = null;

        // Cari interface dengan endpoint BULK_OUT
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface ui = device.getInterface(i);
            for (int j = 0; j < ui.getEndpointCount(); j++) {
                UsbEndpoint e = ui.getEndpoint(j);
                if (e.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK &&
                    e.getDirection() == UsbConstants.USB_DIR_OUT) {
                    intf = ui; ep = e; break;
                }
            }
            if (ep != null) break;
        }

        if (intf == null || ep == null) {
            call.reject("Endpoint output tidak ditemukan. Pastikan printer ESC/POS.");
            return;
        }

        UsbDeviceConnection conn = usbManager.openDevice(device);
        if (conn == null) { call.reject("Gagal membuka koneksi USB"); return; }
        if (!conn.claimInterface(intf, true)) {
            conn.close();
            call.reject("Gagal klaim interface USB");
            return;
        }

        connectedDevice = device;
        usbConnection   = conn;
        usbEndpoint     = ep;

        JSObject result = new JSObject();
        result.put("name",      device.getProductName() != null ? device.getProductName() : "USB Printer");
        result.put("vendorId",  device.getVendorId());
        result.put("productId", device.getProductId());
        call.resolve(result);
        Log.d(TAG, "USB Printer connected: " + device.getDeviceName());
    }

    /** Kirim ESC/POS bytes ke printer */
    @PluginMethod
    public void printUsb(PluginCall call) {
        if (usbConnection == null || usbEndpoint == null) {
            call.reject("Printer USB tidak terhubung");
            return;
        }
        String b64 = call.getString("data", "");
        if (b64 == null || b64.isEmpty()) {
            call.reject("Data kosong");
            return;
        }
        byte[] data;
        try { data = Base64.decode(b64, Base64.DEFAULT); }
        catch (Exception e) { call.reject("Data tidak valid"); return; }

        // Kirim dalam chunk 64 bytes
        int CHUNK = 64;
        int offset = 0;
        int timeout = 3000;
        while (offset < data.length) {
            int len = Math.min(CHUNK, data.length - offset);
            int sent = usbConnection.bulkTransfer(usbEndpoint, data, offset, len, timeout);
            if (sent < 0) {
                call.reject("Gagal mengirim data ke printer USB (offset=" + offset + ")");
                return;
            }
            offset += sent;
        }
        call.resolve(new JSObject().put("success", true));
    }

    /** Putuskan koneksi USB */
    @PluginMethod
    public void disconnectUsb(PluginCall call) {
        try {
            if (usbConnection != null) { usbConnection.close(); }
        } catch (Exception ignored) {}
        usbConnection   = null;
        usbEndpoint     = null;
        connectedDevice = null;
        call.resolve(new JSObject().put("success", true));
    }

    /** Cek apakah USB printer terhubung */
    @PluginMethod
    public void isUsbConnected(PluginCall call) {
        boolean ok = usbConnection != null && usbEndpoint != null;
        call.resolve(new JSObject().put("connected", ok));
    }

    @Override
    protected void handleOnDestroy() {
        try { getContext().unregisterReceiver(usbPermissionReceiver); } catch (Exception ignored) {}
        try { if (usbConnection != null) usbConnection.close(); } catch (Exception ignored) {}
    }
}
