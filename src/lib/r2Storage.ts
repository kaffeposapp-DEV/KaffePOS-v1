// src/lib/r2Storage.ts — KaffePOS v5
// Upload, delete, dan compress gambar via Cloudflare R2
// Worker URL: VITE_R2_WORKER_URL di .env
// Auth secret: VITE_R2_SECRET di .env

// ── Konfigurasi ────────────────────────────────────────────────────
// Untuk APK: hardcode URL worker kamu setelah deploy
// Contoh: https://kaffepos-images.yourname.workers.dev
const WORKER_URL = import.meta.env.VITE_R2_WORKER_URL
  || 'https://kaffepos-images.YOUR_CF_SUBDOMAIN.workers.dev';

const AUTH_SECRET = import.meta.env.VITE_R2_SECRET || 'GANTI_DENGAN_SECRET_KAMU';

// ── Kompres gambar sebelum upload (max 500KB, max 800px) ──────────
export async function compressImage(
  file: File,
  maxWidthPx = 800,
  qualityJpeg = 0.82,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidthPx / Math.max(img.width, img.height));
      const w     = Math.round(img.width  * scale);
      const h     = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Kompres gagal')),
        'image/jpeg',
        qualityJpeg,
      );
    };
    img.onerror = () => reject(new Error('Gagal membaca gambar'));
    img.src = url;
  });
}

// ── Upload file ke R2 via Worker ──────────────────────────────────
// Returns: public URL string
export async function uploadToR2(
  file: File | Blob,
  storeId: string,
  folder: 'menu' | 'logo' = 'menu',
): Promise<string> {
  const ext      = file instanceof File
    ? (file.name.split('.').pop() || 'jpg')
    : 'jpg';
  const filename = `${folder}_${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
  const key      = `${storeId}/${filename}`;

  const res = await fetch(`${WORKER_URL}/upload/${key}`, {
    method:  'PUT',
    headers: {
      'Authorization': `Bearer ${AUTH_SECRET}`,
      'Content-Type':  file instanceof File ? (file.type || 'image/jpeg') : 'image/jpeg',
    },
    body: file,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload gagal' }));
    throw new Error((err as any).error || `Upload gagal: ${res.status}`);
  }

  const data = await res.json() as { url: string; key: string };
  return data.url;
}

// ── Upload dengan kompres otomatis ────────────────────────────────
export async function uploadImageR2(
  file: File,
  storeId: string,
  folder: 'menu' | 'logo' = 'menu',
  onProgress?: (pct: number) => void,
): Promise<string> {
  onProgress?.(10);

  // Kompres dulu jika > 300KB
  let toUpload: File | Blob = file;
  if (file.size > 300 * 1024) {
    onProgress?.(30);
    toUpload = await compressImage(file);
  }

  onProgress?.(60);
  const url = await uploadToR2(toUpload, storeId, folder);
  onProgress?.(100);
  return url;
}

// ── Delete file dari R2 ───────────────────────────────────────────
export async function deleteFromR2(publicUrl: string): Promise<void> {
  // Extract key dari URL: .../file/{storeId}/{filename} → {storeId}/{filename}
  const match = publicUrl.match(/\/file\/(.+)$/);
  if (!match) return; // bukan R2 URL, skip

  const key = match[1];
  await fetch(`${WORKER_URL}/file/${key}`, {
    method:  'DELETE',
    headers: { 'Authorization': `Bearer ${AUTH_SECRET}` },
  });
  // Tidak throw jika gagal delete — tidak critical
}

// ── Helper: apakah URL adalah R2 URL ─────────────────────────────
export function isR2Url(url?: string): boolean {
  if (!url) return false;
  return url.includes('workers.dev/file/') || url.includes(WORKER_URL);
}
