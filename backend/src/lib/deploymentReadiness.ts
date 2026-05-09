import {
  PRODUCTION_API_ORIGIN,
  PRODUCTION_WEB_ORIGIN,
  splitCorsOrigins,
} from './corsOrigins';

export type BackendDeploymentValidationInput = {
  nodeEnv: 'development' | 'test' | 'production' | string;
  webBaseUrl: string;
  apiBaseUrl: string;
  corsOrigin?: string | null;
  midtransEnvironment: 'sandbox' | 'production' | string;
  subscriptionPaymentMode?: string | null;
  midtransSnapEnabled: boolean;
  midtransServerKey?: string | null;
  midtransMerchantId?: string | null;
  resendApiKey?: string | null;
  resendFromEmail?: string | null;
  sentryDsn?: string | null;
};

export type BackendDeploymentValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function validateBackendDeploymentConfig(input: BackendDeploymentValidationInput): BackendDeploymentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const corsOrigins = new Set(splitCorsOrigins(input.corsOrigin));
  const isProduction = input.nodeEnv === 'production';

  if (isProduction) {
    if (input.webBaseUrl !== PRODUCTION_WEB_ORIGIN) {
      errors.push(`WEB_BASE_URL harus ${PRODUCTION_WEB_ORIGIN} untuk production.`);
    }
    if (input.apiBaseUrl !== PRODUCTION_API_ORIGIN) {
      errors.push(`API_BASE_URL harus ${PRODUCTION_API_ORIGIN} untuk production.`);
    }
    if (input.midtransSnapEnabled && input.midtransEnvironment !== 'production') {
      errors.push('MIDTRANS_ENVIRONMENT harus production saat MIDTRANS_SNAP_ENABLED=true di production.');
    }
  }

  if (!input.resendApiKey || !input.resendFromEmail) {
    warnings.push('Resend belum lengkap; email register/reset/payment tidak akan terkirim.');
  }

  if (isProduction && !input.sentryDsn) {
    errors.push('SENTRY_DSN wajib diisi untuk error tracking backend production.');
  }

  if (input.midtransSnapEnabled && (!input.midtransServerKey || !input.midtransMerchantId)) {
    warnings.push('Midtrans Snap aktif tetapi server key atau merchant id belum lengkap.');
  }

  if (!corsOrigins.has(PRODUCTION_WEB_ORIGIN)) {
    warnings.push('CORS_ORIGIN belum memuat domain web production.');
  }

  if (!corsOrigins.has('capacitor://localhost')) {
    warnings.push('CORS_ORIGIN belum memuat capacitor://localhost untuk APK.');
  }

  if (!corsOrigins.has('http://localhost')) {
    warnings.push('CORS_ORIGIN belum memuat http://localhost untuk APK Android lama/transisi.');
  }

  if (!corsOrigins.has('https://localhost')) {
    warnings.push('CORS_ORIGIN belum memuat https://localhost untuk APK Android final dengan androidScheme=https.');
  }

  if (input.subscriptionPaymentMode === 'midtrans_sandbox' && isProduction) {
    errors.push('SUBSCRIPTION_PAYMENT_MODE tidak boleh midtrans_sandbox di production.');
  }

  return { ok: errors.length === 0, errors, warnings };
}
