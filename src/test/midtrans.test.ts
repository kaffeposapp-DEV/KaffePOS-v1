import { describe, expect, it } from 'vitest';
import { resolveMidtransClientConfig } from '@/lib/midtrans';

describe('midtrans client config', () => {
  it('resolves sandbox config by default', () => {
    expect(resolveMidtransClientConfig({ environment: undefined, clientKey: undefined })).toMatchObject({
      environment: 'sandbox',
      isSandbox: true,
      isProduction: false,
      snapScriptUrl: 'https://app.sandbox.midtrans.com/snap/snap.js',
      isSnapConfigured: false,
    });
  });

  it('resolves production script and keeps client key on frontend only', () => {
    expect(
      resolveMidtransClientConfig({
        environment: 'production',
        clientKey: 'mid-client-prod',
      }),
    ).toMatchObject({
      environment: 'production',
      isSandbox: false,
      isProduction: true,
      snapScriptUrl: 'https://app.midtrans.com/snap/snap.js',
      clientKey: 'mid-client-prod',
      isSnapConfigured: true,
    });
  });
});
