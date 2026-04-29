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
};

export type BackendDeploymentValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const PRODUCTION_WEB_ORIGIN = 'https://kaffepos.my.id';
const PRODUCTION_API_ORIGIN = 'https://api.kaffepos.my.id';

function splitOrigins(value?: string | null) {
  return new Set((value || '').split(',').map((entry) => entry.trim()).filter(Boolean));
}

export function validateBackendDeploymentConfig(input: BackendDeploymentValidationInput): BackendDeploymentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const corsOrigins = splitOrigins(input.corsOrigin);
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

  if (input.midtransSnapEnabled && (!input.midtransServerKey || !input.midtransMerchantId)) {
    warnings.push('Midtrans Snap aktif tetapi server key atau merchant id belum lengkap.');
  }

  if (!corsOrigins.has(PRODUCTION_WEB_ORIGIN)) {
    warnings.push('CORS_ORIGIN belum memuat domain web production.');
  }

  if (!corsOrigins.has('capacitor://localhost')) {
    warnings.push('CORS_ORIGIN belum memuat capacitor://localhost untuk APK.');
  }

  if (input.subscriptionPaymentMode === 'midtrans_sandbox' && isProduction) {
    errors.push('SUBSCRIPTION_PAYMENT_MODE tidak boleh midtrans_sandbox di production.');
  }

  return { ok: errors.length === 0, errors, warnings };
}
