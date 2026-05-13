import { env } from '../../core/env';

class CloudflareAssetServiceClass {
  get configured() {
    return Boolean(env.CLOUDFLARE_R2_PUBLIC_URL || env.CLOUDFLARE_IMAGES_DELIVERY_URL);
  }

  resolveR2Url(key: string) {
    if (!env.CLOUDFLARE_R2_PUBLIC_URL) return null;
    return `${env.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
  }

  resolveImageUrl(imageId: string, variant = 'public') {
    const baseUrl = env.CLOUDFLARE_IMAGES_DELIVERY_URL
      || (env.CLOUDFLARE_IMAGES_ACCOUNT_HASH
        ? `https://imagedelivery.net/${env.CLOUDFLARE_IMAGES_ACCOUNT_HASH}`
        : null);
    if (!baseUrl) return null;
    return `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(imageId)}/${encodeURIComponent(variant)}`;
  }

  cacheHeaders(kind: 'html' | 'asset' | 'image' | 'service-worker' = 'asset') {
    if (kind === 'html') return 'no-cache';
    if (kind === 'service-worker') return 'no-cache, no-store, must-revalidate';
    if (kind === 'image') return 'public, max-age=604800';
    return 'public, max-age=31536000, immutable';
  }
}

export const CloudflareAssetService = new CloudflareAssetServiceClass();
