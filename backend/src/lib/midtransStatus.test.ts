import { describe, expect, it } from 'vitest';
import { classifyMidtransWebhookStatus } from './midtransStatus';

describe('Midtrans webhook status mapping', () => {
  it('activates license only for settled payment states', () => {
    expect(classifyMidtransWebhookStatus({ transactionStatus: 'settlement' })).toMatchObject({
      kind: 'settled',
      shouldActivateLicense: true,
    });
    expect(classifyMidtransWebhookStatus({ transactionStatus: 'capture', fraudStatus: 'accept' })).toMatchObject({
      kind: 'settled',
      shouldActivateLicense: true,
    });
  });

  it('keeps pending and challenge states from becoming false-success licenses', () => {
    expect(classifyMidtransWebhookStatus({ transactionStatus: 'pending' })).toMatchObject({
      kind: 'pending',
      shouldActivateLicense: false,
    });
    expect(classifyMidtransWebhookStatus({ transactionStatus: 'capture', fraudStatus: 'challenge' })).toMatchObject({
      kind: 'pending',
      shouldActivateLicense: false,
    });
  });

  it('treats denied capture and terminal failures as failed without activation', () => {
    expect(classifyMidtransWebhookStatus({ transactionStatus: 'capture', fraudStatus: 'deny' })).toMatchObject({
      kind: 'failed',
      storedStatus: 'deny',
      shouldActivateLicense: false,
      shouldNotifyFailure: true,
    });
    for (const status of ['deny', 'cancel', 'expire', 'failure']) {
      expect(classifyMidtransWebhookStatus({ transactionStatus: status }).shouldActivateLicense).toBe(false);
    }
  });

  it('ignores unknown statuses instead of activating paid access', () => {
    expect(classifyMidtransWebhookStatus({ transactionStatus: 'authorize' })).toMatchObject({
      kind: 'ignored',
      storedStatus: 'authorize',
      shouldActivateLicense: false,
      shouldNotifyFailure: false,
    });
  });
});
