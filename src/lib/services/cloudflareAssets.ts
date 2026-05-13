const CDN_BASE_URL = (import.meta.env.VITE_CLOUDFLARE_CDN_BASE_URL || '').trim().replace(/\/+$/, '');
const IMAGE_DELIVERY_BASE_URL = (import.meta.env.VITE_CLOUDFLARE_IMAGE_DELIVERY_URL || '').trim().replace(/\/+$/, '');

export function resolveCdnAsset(path: string) {
  if (!CDN_BASE_URL) return path;
  if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
  return `${CDN_BASE_URL}/${path.replace(/^\/+/, '')}`;
}

export function resolveCloudflareImage(imageId: string, variant = 'public') {
  if (!IMAGE_DELIVERY_BASE_URL || !imageId) return imageId;
  return `${IMAGE_DELIVERY_BASE_URL}/${encodeURIComponent(imageId)}/${encodeURIComponent(variant)}`;
}

export function isCloudflareCdnConfigured() {
  return Boolean(CDN_BASE_URL || IMAGE_DELIVERY_BASE_URL);
}
