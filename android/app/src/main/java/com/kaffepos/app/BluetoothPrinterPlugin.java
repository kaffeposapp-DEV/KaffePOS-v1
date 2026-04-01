// android/app/src/main/java/com/kaffepos/app/BluetoothPrinterPlugin.java
// Native Capacitor plugin — Classic Bluetooth SPP/RFCOMM untuk printer ESC/POS
package com.kaffepos.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetoothConnect"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_SCAN },    alias = "bluetoothScan"),
    }
)
public class BluetoothPrinterPlugin extends Plugin {

    private static final String TAG  = "BluetoothPrinter";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final int CONNECT_TIMEOUT_MS = 8000;

    private BluetoothAdapter btAdapter;
    private BluetoothSocket  btSocket;
    private OutputStream     btOutput;
    private String connectedMac  = null;
    private String connectedName = null;

    // Saved call untuk setelah permission granted
    private PluginCall savedCall = null;
    private String     pendingAction = null;

    @Override
    public void load() {
        btAdapter = BluetoothAdapter.getDefaultAdapter();
        Log.d(TAG, "BluetoothPrinterPlugin loaded, adapter=" + (btAdapter != null));
    }

    private boolean hasBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return getPermissionState("bluetoothConnect") == com.getcapacitor.PermissionState.GRANTED;
        }
        return true;
    }

    // ── Request permissions ─────────────────────────────────────────────────
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAliases(new String[]{"bluetoothConnect", "bluetoothScan"}, call, "permissionsCallback");
        } else {
            JSObject result = new JSObject();
            result.put("bluetoothConnect", "granted");
            result.put("bluetoothScan",    "granted");
            call.resolve(result);
        }
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        // Cek apakah granted
        if (hasBluetoothPermission()) {
            // Kalau ada pending action, eksekusi
            if (savedCall != null && "listPairedDevices".equals(pendingAction)) {
                doListPairedDevices(savedCall);
                savedCall = null; pendingAction = null;
            } else if (savedCall != null && "connect".equals(pendingAction)) {
                doConnect(savedCall);
                savedCall = null; pendingAction = null;
            }
        } else {
            if (savedCall != null) savedCall.reject("Izin Bluetooth ditolak oleh user");
        }
        JSObject result = new JSObject();
        result.put("bluetoothConnect",
            hasBluetoothPermission() ? "granted" : "denied");
        call.resolve(result);
    }

    // ── List paired devices ─────────────────────────────────────────────────
    @PluginMethod
    public void listPairedDevices(PluginCall call) {
        if (btAdapter == null) { call.reject("Bluetooth tidak tersedia di perangkat ini"); return; }
        if (!btAdapter.isEnabled()) { call.reject("Bluetooth tidak aktif. Nyalakan Bluetooth dulu."); return; }

        if (!hasBluetoothPermission()) {
            savedCall    = call;
            pendingAction = "listPairedDevices";
            requestPermissionForAliases(new String[]{"bluetoothConnect"}, call, "permissionsCallback");
            return;
        }
        doListPairedDevices(call);
    }

    private void doListPairedDevices(PluginCall call) {
        JSArray arr = new JSArray();
        try {
            Set<BluetoothDevice> paired = btAdapter.getBondedDevices();
            Log.d(TAG, "Paired devices count: " + paired.size());
            for (BluetoothDevice d : paired) {
                String name = "Unknown";
                String mac  = d.getAddress();
                try { name = d.getName() != null ? d.getName() : mac; } catch (SecurityException ignored) {}
                JSObject obj = new JSObject();
                obj.put("name", name);
                obj.put("mac",  mac);
                arr.put(obj);
                Log.d(TAG, "  Device: " + name + " [" + mac + "]");
            }
        } catch (SecurityException e) {
            call.reject("Izin Bluetooth ditolak: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("devices", arr);
        call.resolve(result);
    }

    // ── Connect via MAC address ─────────────────────────────────────────────
    @PluginMethod
    public void connect(PluginCall call) {
        if (btAdapter == null) { call.reject("Bluetooth tidak tersedia"); return; }
        if (!btAdapter.isEnabled()) { call.reject("Bluetooth tidak aktif. Nyalakan Bluetooth dulu."); return; }

        if (!hasBluetoothPermission()) {
            savedCall     = call;
            pendingAction = "connect";
            requestPermissionForAliases(new String[]{"bluetoothConnect"}, call, "permissionsCallback");
            return;
        }
        doConnect(call);
    }

    private void doConnect(PluginCall call) {
        String mac = call.getString("mac", "");
        if (mac == null || mac.isEmpty()) { call.reject("MAC address diperlukan"); return; }

        // Putuskan koneksi lama
        doDisconnect();

        new Thread(() -> {
            try {
                BluetoothDevice device = btAdapter.getRemoteDevice(mac.toUpperCase().trim());
                Log.d(TAG, "Connecting to: " + device.getName() + " [" + mac + "]");

                // Cancel discovery supaya connect lebih cepat
                try { btAdapter.cancelDiscovery(); } catch (SecurityException ignored) {}

                BluetoothSocket socket = null;

                // 1. Coba secure RFCOMM
                try {
                    socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                    Log.d(TAG, "Created secure RFCOMM socket");
                } catch (Exception e) {
                    Log.w(TAG, "Secure socket gagal: " + e.getMessage());
                    socket = null;
                }

                // 2. Fallback ke insecure RFCOMM
                if (socket == null) {
                    try {
                        socket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                        Log.d(TAG, "Created insecure RFCOMM socket");
                    } catch (Exception e) {
                        Log.w(TAG, "Insecure socket gagal: " + e.getMessage());
                    }
                }

                // 3. Fallback paling akhir: reflection
                if (socket == null) {
                    try {
                        Method method = device.getClass().getMethod("createRfcommSocket", int.class);
                        socket = (BluetoothSocket) method.invoke(device, 1);
                        Log.d(TAG, "Created RFCOMM socket via reflection");
                    } catch (Exception e) {
                        call.reject("Gagal buat socket Bluetooth: " + e.getMessage());
                        return;
                    }
                }

                // Connect dengan timeout
                final BluetoothSocket finalSocket = socket;
                Thread connThread = new Thread(() -> {
                    try { finalSocket.connect(); }
                    catch (Exception e) { Log.e(TAG, "connect() error: " + e.getMessage()); }
                });
                connThread.start();

                try { connThread.join(CONNECT_TIMEOUT_MS); }
                catch (InterruptedException ignored) {}

                if (!socket.isConnected()) {
                    try { socket.close(); } catch (Exception ignored) {}
                    call.reject("Gagal terhubung ke printer dalam " + (CONNECT_TIMEOUT_MS/1000) + " detik. " +
                        "Pastikan printer menyala dan tidak terhubung ke device lain.");
                    return;
                }

                btSocket = socket;
                btOutput = socket.getOutputStream();
                connectedMac  = mac.toUpperCase().trim();
                connectedName = "";
                try { connectedName = device.getName(); } catch (SecurityException ignored) {}
                if (connectedName == null || connectedName.isEmpty()) connectedName = mac;

                // ESC @ — init printer
                try { btOutput.write(new byte[]{0x1B, 0x40}); btOutput.flush(); }
                catch (Exception ignored) {}

                Log.d(TAG, "Connected! Name=" + connectedName + " MAC=" + connectedMac);

                JSObject result = new JSObject();
                result.put("name", connectedName);
                result.put("mac",  connectedMac);
                call.resolve(result);

            } catch (SecurityException e) {
                call.reject("Izin Bluetooth ditolak: " + e.getMessage());
            } catch (Exception e) {
                Log.e(TAG, "connect error: " + e.getMessage());
                call.reject("Gagal terhubung: " + e.getMessage());
            }
        }).start();
    }

    // ── Print (send Base64 ESC/POS bytes) ──────────────────────────────────
    @PluginMethod
    public void print(PluginCall call) {
        if (btSocket == null || !btSocket.isConnected() || btOutput == null) {
            call.reject("Printer tidak terhubung. Hubungkan printer dulu.");
            return;
        }
        String b64 = call.getString("data", "");
        if (b64 == null || b64.isEmpty()) { call.reject("Data cetak kosong"); return; }

        byte[] data;
        try { data = Base64.decode(b64, Base64.DEFAULT); }
        catch (Exception e) { call.reject("Data tidak valid: " + e.getMessage()); return; }

        Log.d(TAG, "Printing " + data.length + " bytes");

        new Thread(() -> {
            try {
                int CHUNK = 512;
                for (int i = 0; i < data.length; i += CHUNK) {
                    int len = Math.min(CHUNK, data.length - i);
                    btOutput.write(data, i, len);
                    btOutput.flush();
                    Thread.sleep(10);
                }
                Log.d(TAG, "Print success!");
                call.resolve(new JSObject().put("success", true));
            } catch (Exception e) {
                Log.e(TAG, "Print error: " + e.getMessage());
                doDisconnect();
                call.reject("Gagal mengirim data ke printer: " + e.getMessage());
            }
        }).start();
    }

    // ── Disconnect ──────────────────────────────────────────────────────────
    @PluginMethod
    public void disconnect(PluginCall call) {
        doDisconnect();
        call.resolve(new JSObject().put("success", true));
    }

    // ── isConnected ─────────────────────────────────────────────────────────
    @PluginMethod
    public void isConnected(PluginCall call) {
        boolean ok = btSocket != null && btSocket.isConnected() && btOutput != null;
        JSObject r = new JSObject();
        r.put("connected", ok);
        r.put("name", ok ? connectedName : null);
        r.put("mac",  ok ? connectedMac  : null);
        call.resolve(r);
    }

    private void doDisconnect() {
        try { if (btOutput != null) { btOutput.close(); } } catch (Exception ignored) {}
        try { if (btSocket != null) { btSocket.close(); } } catch (Exception ignored) {}
        btOutput = null; btSocket = null;
        connectedMac = connectedName = null;
    }

    @Override
    protected void handleOnDestroy() { doDisconnect(); }
}
