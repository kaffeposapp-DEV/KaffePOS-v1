export const PRODUCTION_WEB_ORIGIN = 'https://kaffepos.my.id';
export const PRODUCTION_API_ORIGIN = 'https://api.kaffepos.my.id';

export type ReleaseChannel = 'development' | 'staging' | 'production';

export type FrontendReleaseValidationInput = {
  releaseChannel: ReleaseChannel;
  apiBaseUrl?: string | null | undefined;
  webBaseUrl?: string | null | undefined;
  clarityProjectId?: string | null | undefined;
  sentryDsn?: string | null | undefined;
  appTarget?: string | null | undefined;
};

export type ReleaseValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '10.0.2.2' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.local')
  );
}

function readUrlHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

export function normalizeReleaseUrl(value?: string | null) {
  return value?.trim() ? trimTrailingSlash(value) : '';
}

export function resolveRuntimeApiBaseUrl(input: {
  explicitApiBaseUrl?: string | null;
  hostname?: string | null;
  isNativePlatform: boolean;
}) {
  const explicit = normalizeReleaseUrl(input.explicitApiBaseUrl);
  if (explicit) return explicit;

  if (input.isNativePlatform) return PRODUCTION_API_ORIGIN;

  const hostname = input.hostname ?? '';
  if (!hostname || isLocalHostname(hostname)) return '';

  if (hostname === 'kaffepos.my.id' || hostname.endsWith('.kaffepos.my.id')) {
    return PRODUCTION_API_ORIGIN;
  }

  return '';
}

export function validateFrontendReleaseConfig(input: FrontendReleaseValidationInput): ReleaseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const apiBaseUrl = normalizeReleaseUrl(input.apiBaseUrl);
  const webBaseUrl = normalizeReleaseUrl(input.webBaseUrl) || PRODUCTION_WEB_ORIGIN;
  const clarityProjectId = input.clarityProjectId?.trim() || '';
  const sentryDsn = input.sentryDsn?.trim() || '';

  if (input.releaseChannel === 'production') {
    if (apiBaseUrl && apiBaseUrl !== PRODUCTION_API_ORIGIN) {
      errors.push(`VITE_API_BASE_URL harus ${PRODUCTION_API_ORIGIN} untuk production.`);
    }

    if (webBaseUrl !== PRODUCTION_WEB_ORIGIN) {
      errors.push(`WEB_BASE_URL frontend harus ${PRODUCTION_WEB_ORIGIN} untuk production.`);
    }

    if (!clarityProjectId) {
      errors.push('VITE_CLARITY_PROJECT_ID wajib diisi untuk verifikasi Clarity production.');
    }

    if (!sentryDsn) {
      errors.push('VITE_SENTRY_DSN wajib diisi untuk error tracking production.');
    }
  }

  if (input.appTarget === 'mobile' && apiBaseUrl) {
    if (!apiBaseUrl.startsWith('https://')) {
      errors.push('APK/mobile build harus memakai API HTTPS agar aman di device Android.');
    }

    const apiHostname = readUrlHostname(apiBaseUrl);
    if (!apiHostname || isLocalHostname(apiHostname)) {
      errors.push('APK/mobile build tidak boleh memakai API lokal seperti localhost, 127.0.0.1, atau 10.0.2.2.');
    }
  }

  if (!apiBaseUrl) {
    warnings.push(`VITE_API_BASE_URL kosong: web production dan APK akan memakai fallback ${PRODUCTION_API_ORIGIN}.`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function getCurrentFrontendReleaseValidation() {
  return validateFrontendReleaseConfig({
    releaseChannel: import.meta.env.PROD ? 'production' : 'development',
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    webBaseUrl: PRODUCTION_WEB_ORIGIN,
    clarityProjectId: import.meta.env.VITE_CLARITY_PROJECT_ID,
    sentryDsn: import.meta.env.VITE_SENTRY_DSN,
    appTarget: import.meta.env.VITE_APP_TARGET,
  });
}
