 
 
/* eslint-disable @typescript-eslint/no-unused-vars */
 
 
/* eslint-disable @typescript-eslint/no-explicit-any */
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
  _shareAfterSave?: boolean;
}

export interface DownloadResult {
  ok: boolean;
  filePath?: string;
  uri?: string;
  method?: string;
  cancelled?: boolean;
  error?: string;
}

export interface SharePdfOptions {
  fileName: string;
  base64: string;
  title?: string;
  text?: string;
  dialogTitle?: string;
}

// ── MAIN FUNCTION ──────────────────────────────────────────────────
export async function downloadFile(opts: DownloadOptions): Promise<DownloadResult> {
  const { data, fileName, mimeType, _shareAfterSave = false } = opts;

  if (Capacitor.isNativePlatform()) {
    return downloadNative(data, fileName, mimeType, _shareAfterSave);
  } else {
    return downloadWeb(data, fileName, mimeType);
  }
}

// ── NATIVE (Android / iOS) ─────────────────────────────────────────
async function downloadNative(
  data: string,
  fileName: string,
  mimeType: DownloadMimeType,
  _shareAfterSave: boolean
): Promise<DownloadResult> {

  const platform = Capacitor.getPlatform(); // 'android' | 'ios'

  try {
    // ── Android: Save directly to Downloads folder ─────────────────
    if (platform === 'android') {
      return await saveAndroid(data, fileName, mimeType, _shareAfterSave);
    }

    // ── iOS: Save to app Documents, then share ─────────────────────
    if (platform === 'ios') {
      return await saveIOS(data, fileName, _shareAfterSave);
    }

    return { ok: false, error: 'Unknown native platform' };

  } catch (err:any) {
    console.error('[downloadFile] Native error:', err);
    return { ok: false, error: err?.message || 'Download failed' };
  }
}

// ── ANDROID SAVE ───────────────────────────────────────────────────
async function saveAndroid(
  data: string,
  fileName: string,
  mimeType: DownloadMimeType,
  _shareAfterSave: boolean
): Promise<DownloadResult> {

  const isPDF = mimeType === 'application/pdf';

  try {
    let writeResult;

    if (isPDF) {
      writeResult = await Filesystem.writeFile({
        path: fileName,
        data: data,
        directory: Directory.Documents,
        recursive: true,
      });
    } else {
      writeResult = await Filesystem.writeFile({
        path: fileName,
        data: data,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
    }

    const uri = writeResult.uri;

    if (_shareAfterSave || isPDF) {
      try {
        await Share.share({
          title: fileName,
          url: uri,
          dialogTitle: `Buka ${isPDF ? 'PDF' : 'File'}`,
        });
      } catch (shareErr:any) {
        if (shareErr?.message?.includes('cancel')) {
          // ok
        }
      }
    }

    return { ok: true, filePath: fileName, uri, method: 'android-filesystem' };

  } catch (err:any) {
    console.warn('[downloadFile] Filesystem failed, trying Share fallback:', err);
    return await shareOnlyFallback(data, fileName, mimeType);
  }
}

// ── iOS SAVE ──────────────────────────────────────────────────────
async function saveIOS(
  data: string,
  fileName: string,
  _shareAfterSave: boolean
): Promise<DownloadResult> {
  try {
    const writeResult = await Filesystem.writeFile({
      path: `KaffePOS/${fileName}`,
      data: data,
      directory: Directory.Documents,
      recursive: true,
    });

    const uri = writeResult.uri;

    await Share.share({
      title: fileName,
      url: uri,
      dialogTitle: 'Simpan ke Files',
    });

    return { ok: true, filePath: fileName, uri, method: 'ios-filesystem' };

  } catch (err:any) {
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
  } catch (err:any) {
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

  if (isFileOrigin && isMobile) {
    return openDownloadTab(data, fileName, mimeType);
  }

  if (isIOS) {
    return openDownloadTab(data, fileName, mimeType);
  }

  if ('showSaveFilePicker' in window && !isMobile) {
    try {
      const ext = fileName.split('.').pop()!.toLowerCase();
      const types:any[] = ext === 'pdf'
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
    } catch (err:any) {
      if (err.name === 'AbortError') return { ok: false, cancelled: true };
    }
  }

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
  } catch (err:any) {
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
  const base64 = data.startsWith('data:') ? data.split(',')[1] : data;
  const byteChars = atob(base64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNums[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNums)], { type: mimeType });
}

// ── PDF SPECIFIC ───────────────────────────────────────────────────
export async function downloadPDFReport(
  jdoc:any,
  reportName: string,
  storeName: string = 'KaffePOS'
): Promise<DownloadResult> {
  const date = new Date().toISOString().slice(0, 10);
  const cleanReport = reportName.replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '_');
  const cleanStore = storeName.replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '_');
  const fileName = `${cleanReport}_${cleanStore}_${date}.pdf`;
  const dataUri: string = jdoc.output('datauristring');
  const base64 = dataUri.split(',')[1];

  return downloadFile({
    data: base64,
    fileName,
    mimeType: 'application/pdf',
    _shareAfterSave: true,
  });
}

export async function sharePDFReport(
  jdoc: any,
  reportName: string,
  storeName: string = 'KaffePOS',
  text?: string,
): Promise<DownloadResult> {
  const date = new Date().toISOString().slice(0, 10);
  const cleanReport = reportName.replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '_');
  const cleanStore = storeName.replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '_');
  const fileName = `${cleanReport}_${cleanStore}_${date}.pdf`;
  const dataUri: string = jdoc.output('datauristring');
  const base64 = dataUri.split(',')[1];

  return sharePdfFile({
    fileName,
    base64,
    title: `Laporan ${storeName}`,
    ...(text ? { text } : {}),
    dialogTitle: 'Kirim laporan via WhatsApp',
  });
}

export async function sharePdfFile(opts: SharePdfOptions): Promise<DownloadResult> {
  const {
    fileName,
    base64,
    title = fileName,
    text = '',
    dialogTitle = 'Bagikan PDF',
  } = opts;

  if (!Capacitor.isNativePlatform()) {
    const downloadResult = await downloadFile({
      data: base64,
      fileName,
      mimeType: 'application/pdf',
      _shareAfterSave: false,
    });

    try {
      const waText = text || `Laporan PDF siap diunduh: ${fileName}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, '_blank');
    } catch {
      // ignore browser popup issues
    }

    return downloadResult;
  }

  try {
    await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });

    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });

    await Share.share({
      title,
      text,
      url: uri,
      dialogTitle,
    });

    return { ok: true, filePath: fileName, uri, method: 'native-share-pdf' };
  } catch (err:any) {
    console.error('[sharePdfFile] Share PDF failed:', err);
    return { ok: false, error: err?.message || 'Gagal membagikan PDF' };
  }
}

// ── JSON BACKUP ────────────────────────────────────────────────────
export async function downloadBackup(
  payload: object,
  storeName: string = 'KaffePOS'
): Promise<DownloadResult> {
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `KaffePOS_Backup_${storeName.replace(/[^a-zA-Z0-9]/g, '_')}_${date}.json`;
  const jsonStr = JSON.stringify(payload, null, 2);
  const base64 = btoa(unescape(encodeURIComponent(jsonStr)));

  return downloadFile({
    data: base64,
    fileName,
    mimeType: 'application/json',
    _shareAfterSave: false,
  });
}
