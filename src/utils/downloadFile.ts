// src/utils/downloadFile.ts
// ═══════════════════════════════════════════════════════════════════
// CRITICAL: Android file download using Capacitor Filesystem
// Works on Android 10-15 (scoped storage) + older Android + iOS + Web
// ═══════════════════════════════════════════════════════════════════

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export type DownloadMimeType = 'application/pdf' | 'application/json' | 'text/csv';

export interface DownloadOptions {
  /** Base64 data string (without data: prefix) OR plain text */
  data: string;
  /** e.g. "KaffePOS_Laporan_Penjualan_2025-03-02.pdf" */
  fileName: string;
  mimeType: DownloadMimeType;
  /** If true, show Android share sheet after save (optional) */
  shareAfterSave?: boolean;
}

export interface DownloadResult {
  ok: boolean;
  filePath?: string;
  uri?: string;
  method?: string;
  cancelled?: boolean;
  error?: string;
}

// ── MAIN FUNCTION ──────────────────────────────────────────────────
export async function downloadFile(opts: DownloadOptions): Promise<DownloadResult> {
  const { data, fileName, mimeType, shareAfterSave = false } = opts;

  if (Capacitor.isNativePlatform()) {
    return downloadNative(data, fileName, mimeType, shareAfterSave);
  } else {
    return downloadWeb(data, fileName, mimeType);
  }
}

// ── NATIVE (Android / iOS) ─────────────────────────────────────────
async function downloadNative(
  data: string,
  fileName: string,
  mimeType: DownloadMimeType,
  shareAfterSave: boolean
): Promise<DownloadResult> {

  const platform = Capacitor.getPlatform(); // 'android' | 'ios'

  try {
    // ── Android: Save directly to Downloads folder ─────────────────
    // On Android 10+ (API 29+) Capacitor uses MediaStore — no permission needed
    // On Android 9- it uses WRITE_EXTERNAL_STORAGE (auto-requested by Capacitor)
    if (platform === 'android') {
      return await saveAndroid(data, fileName, mimeType, shareAfterSave);
    }

    // ── iOS: Save to app Documents, then share ─────────────────────
    if (platform === 'ios') {
      return await saveIOS(data, fileName, shareAfterSave);
    }

    return { ok: false, error: 'Unknown native platform' };

  } catch (err: any) {
    console.error('[downloadFile] Native error:', err);
    return { ok: false, error: err?.message || 'Download failed' };
  }
}

// ── ANDROID SAVE ───────────────────────────────────────────────────
async function saveAndroid(
  data: string,
  fileName: string,
  mimeType: DownloadMimeType,
  shareAfterSave: boolean
): Promise<DownloadResult> {

  // Capacitor Filesystem: Directory.Documents maps to Downloads on Android
  // This works with scoped storage (Android 10-15) without MANAGE_EXTERNAL_STORAGE
  const isPDF = mimeType === 'application/pdf';
  const isJSON = mimeType === 'application/json';

  try {
    let writeResult;

    if (isPDF) {
      // PDF is base64 — write as base64
      writeResult = await Filesystem.writeFile({
        path: fileName,
        data: data,           // base64 string from jsPDF output('datauristring')
        directory: Directory.Documents,  // = Downloads on Android
        recursive: true,
      });
    } else {
      // JSON/CSV is plain text — write as UTF-8
      writeResult = await Filesystem.writeFile({
        path: fileName,
        data: data,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
    }

    const uri = writeResult.uri;
    console.log('[downloadFile] Saved to:', uri);

    // Share sheet: let user open file with PDF viewer / file manager
    if (shareAfterSave || isPDF) {
      try {
        await Share.share({
          title: fileName,
          url: uri,
          dialogTitle: `Buka ${isPDF ? 'PDF' : 'File'}`,
        });
      } catch (shareErr: any) {
        // User dismissed share sheet — not an error
        if (shareErr?.message?.includes('cancel')) {
          // ok
        }
      }
    }

    return { ok: true, filePath: fileName, uri, method: 'android-filesystem' };

  } catch (err: any) {
    // Fallback: use Share.share with base64 URI
    console.warn('[downloadFile] Filesystem failed, trying Share fallback:', err);
    return await shareOnlyFallback(data, fileName, mimeType);
  }
}

// ── iOS SAVE ──────────────────────────────────────────────────────
async function saveIOS(
  data: string,
  fileName: string,
  shareAfterSave: boolean
): Promise<DownloadResult> {
  try {
    // Save to app's Documents directory (Files app accessible)
    const writeResult = await Filesystem.writeFile({
      path: `KaffePOS/${fileName}`,
      data: data,
      directory: Directory.Documents,
      recursive: true,
    });

    const uri = writeResult.uri;

    // iOS: always show share sheet so user can "Save to Files"
    await Share.share({
      title: fileName,
      url: uri,
      dialogTitle: 'Simpan ke Files',
    });

    return { ok: true, filePath: fileName, uri, method: 'ios-filesystem' };

  } catch (err: any) {
    console.error('[downloadFile] iOS error:', err);
    return { ok: false, error: err?.message };
  }
}

// ── SHARE-ONLY FALLBACK (if filesystem fails) ──────────────────────
async function shareOnlyFallback(
  data: string,
  fileName: string,
  mimeType: DownloadMimeType
): Promise<DownloadResult> {
  try {
    const base64 = data.startsWith('data:') ? data : `data:${mimeType};base64,${data}`;

    await Share.share({
      title: fileName,
      url: base64,
      dialogTitle: `Simpan ${fileName}`,
    });

    return { ok: true, method: 'share-fallback' };
  } catch (err: any) {
    if (err?.message?.includes('cancel')) return { ok: false, cancelled: true };
    return { ok: false, error: err?.message };
  }
}

// ── WEB BROWSER ───────────────────────────────────────────────────
async function downloadWeb(
  data: string,
  fileName: string,
  mimeType: DownloadMimeType
): Promise<DownloadResult> {

  const isFileOrigin = window.location.protocol === 'file:';
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // ── File:// origin (HTML opened directly) ─────────────────────
  if (isFileOrigin && isMobile) {
    return openDownloadTab(data, fileName, mimeType);
  }

  // ── iOS Safari ────────────────────────────────────────────────
  if (isIOS) {
    return openDownloadTab(data, fileName, mimeType);
  }

  // ── Desktop: File System Access API ───────────────────────────
  if ('showSaveFilePicker' in window && !isMobile) {
    try {
      const ext = fileName.split('.').pop()!.toLowerCase();
      const types: any[] = ext === 'pdf'
        ? [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
        : [{ description: 'JSON', accept: { 'application/json': ['.json'] } }];

      const fh = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        startIn: 'downloads',
        types,
      });
      const blobData = base64ToBlob(data, mimeType);
      const wr = await fh.createWritable();
      await wr.write(blobData);
      await wr.close();
      return { ok: true, method: 'file-picker' };
    } catch (err: any) {
      if (err.name === 'AbortError') return { ok: false, cancelled: true };
    }
  }

  // ── Standard blob URL download (HTTPS origin) ─────────────────
  try {
    const blobData = base64ToBlob(data, mimeType);
    const url = URL.createObjectURL(blobData);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
    document.body.appendChild(a);
    a.click();
    await new Promise(r => setTimeout(r, 2500));
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { ok: true, method: 'blob-anchor' };
  } catch (err: any) {
    return { ok: false, error: err?.message };
  }
}

// ── Open download tab for file:// / iOS ───────────────────────────
function openDownloadTab(data: string, fileName: string, mimeType: DownloadMimeType): DownloadResult {
  const dataUri = data.startsWith('data:') ? data : `data:${mimeType};base64,${data}`;
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>${fileName}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #0f172a;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #e2e8f0;
            padding: 24px;
          }
          .icon { font-size: 56px; margin-bottom: 16px; }
          h2 { color: #f97316; font-size: 20px; margin: 0 0 8px; text-align: center; }
          p { font-size: 14px; color: #94a3b8; text-align: center; margin: 0 0 24px; line-height: 1.6; }
          .filename {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 8px;
            padding: 10px 16px;
            font-family: monospace;
            font-size: 13px;
            color: #f1f5f9;
            margin-bottom: 24px;
            word-break: break-all;
            text-align: center;
          }
          a.btn {
            display: inline-block;
            background: #f97316;
            color: white;
            padding: 14px 32px;
            border-radius: 12px;
            font-weight: 700;
            font-size: 16px;
            text-decoration: none;
            transition: background 0.2s;
          }
          a.btn:active { background: #ea6d0e; transform: scale(0.97); }
          .note { margin-top: 16px; font-size: 12px; color: #64748b; text-align: center; }
        </style>
      </head>
      <body>
        <div class="icon">☕</div>
        <h2>KaffePOS</h2>
        <div class="filename">${fileName}</div>
        <p>Tap tombol di bawah untuk mendownload file ini ke HP kamu.</p>
        <a class="btn" href="${dataUri}" download="${fileName}">⬇️ Download Sekarang</a>
        <p class="note">Android: file tersimpan di folder Downloads<br>iOS: tap Share → Save to Files</p>
      </body>
      </html>
    `);
    w.document.close();
    return { ok: true, method: 'download-tab' };
  }
  return { ok: false, error: 'Popup blocked' };
}

// ── HELPERS ────────────────────────────────────────────────────────
function base64ToBlob(data: string, mimeType: string): Blob {
  // Handle data URI format
  const base64 = data.startsWith('data:')
    ? data.split(',')[1]
    : data;

  const byteChars = atob(base64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNums[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNums)], { type: mimeType });
}

// ── PDF SPECIFIC: Generate & download PDF report ───────────────────
export async function downloadPDFReport(
  jdoc: any, // jsPDF instance after drawing content
  reportName: string,
  storeName: string = 'KaffePOS'
): Promise<DownloadResult> {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = storeName.replace(/[^a-zA-Z0-9]/g, '_');
  const safeReport = reportName.replace(/\s+/g, '_');
  const fileName = `KaffePOS_${safeReport}_${safeName}_${date}.pdf`;

  // jsPDF.output('datauristring') returns "data:application/pdf;base64,..."
  const dataUri: string = jdoc.output('datauristring');
  const base64 = dataUri.split(',')[1]; // extract base64 part only

  return downloadFile({
    data: base64,
    fileName,
    mimeType: 'application/pdf',
    shareAfterSave: true,
  });
}

// ── JSON BACKUP ────────────────────────────────────────────────────
export async function downloadBackup(
  payload: object,
  storeName: string = 'KaffePOS'
): Promise<DownloadResult> {
  const date = new Date().toISOString().slice(0, 10);
  const safeName = storeName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `KaffePOS_Backup_${safeName}_${date}.json`;

  // JSON is plain text — encode as base64 for Capacitor Filesystem
  const jsonStr = JSON.stringify(payload, null, 2);
  const base64 = btoa(unescape(encodeURIComponent(jsonStr)));

  return downloadFile({
    data: base64,
    fileName,
    mimeType: 'application/json',
    shareAfterSave: false,
  });
}
