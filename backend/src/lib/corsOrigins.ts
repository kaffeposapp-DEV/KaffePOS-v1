export const PRODUCTION_WEB_ORIGIN = 'https://kaffepos.my.id';
export const PRODUCTION_API_ORIGIN = 'https://api.kaffepos.my.id';

export const APK_WEBVIEW_ORIGINS = [
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
] as const;

export const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  PRODUCTION_WEB_ORIGIN,
  'https://www.kaffepos.my.id',
  PRODUCTION_API_ORIGIN,
  ...APK_WEBVIEW_ORIGINS,
] as const;

export const REQUIRED_RUNTIME_CORS_ORIGINS = [
  PRODUCTION_WEB_ORIGIN,
  'https://www.kaffepos.my.id',
  PRODUCTION_API_ORIGIN,
  ...APK_WEBVIEW_ORIGINS,
] as const;

function normalizeCorsOrigin(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  const customScheme = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)$/i);
  if (customScheme) {
    return `${customScheme[1].toLowerCase()}://${customScheme[2].toLowerCase()}`;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

export function splitCorsOrigins(value?: string | null) {
  return (value || '')
    .split(',')
    .map((entry) => normalizeCorsOrigin(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function buildAllowedCorsOrigins(corsOrigin?: string | null) {
  const configured = splitCorsOrigins(corsOrigin);
  const base = configured.length > 0 ? configured : [...DEFAULT_CORS_ORIGINS];

  return new Set([
    ...base,
    ...REQUIRED_RUNTIME_CORS_ORIGINS,
  ].map((entry) => normalizeCorsOrigin(entry)).filter((entry): entry is string => Boolean(entry)));
}

export function isOriginAllowed(origin: string | undefined, allowedOrigins: Set<string>) {
  if (!origin) return true;
  const normalized = normalizeCorsOrigin(origin);
  return Boolean(normalized && allowedOrigins.has(normalized));
}
