export type MidtransEnvironment = 'sandbox' | 'production';

export type MidtransClientConfig = {
  environment: MidtransEnvironment;
  clientKey: string | undefined;
};

const MIDTRANS_SCRIPT_URLS: Record<MidtransEnvironment, string> = {
  sandbox: 'https://app.sandbox.midtrans.com/snap/snap.js',
  production: 'https://app.midtrans.com/snap/snap.js',
};

function normalizeMidtransEnvironment(value?: string): MidtransEnvironment {
  return value?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox';
}

export function resolveMidtransClientConfig(input: {
  environment: string | undefined;
  clientKey: string | undefined;
}): MidtransClientConfig & {
  isProduction: boolean;
  isSandbox: boolean;
  snapScriptUrl: string;
  isSnapConfigured: boolean;
} {
  const environment = normalizeMidtransEnvironment(input.environment);
  const clientKey = input.clientKey?.trim() || undefined;

  return {
    environment,
    clientKey,
    isProduction: environment === 'production',
    isSandbox: environment === 'sandbox',
    snapScriptUrl: MIDTRANS_SCRIPT_URLS[environment],
    isSnapConfigured: Boolean(clientKey),
  };
}

export function getMidtransClientConfig() {
  return resolveMidtransClientConfig({
    environment: import.meta.env.VITE_MIDTRANS_ENVIRONMENT,
    clientKey: import.meta.env.VITE_MIDTRANS_CLIENT_KEY,
  });
}
