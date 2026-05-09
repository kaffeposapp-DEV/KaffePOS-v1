export type MidtransWebhookStatusKind = 'settled' | 'pending' | 'failed' | 'ignored';

export type MidtransWebhookStatusDecision = {
  kind: MidtransWebhookStatusKind;
  storedStatus: string;
  shouldActivateLicense: boolean;
  shouldNotifyFailure: boolean;
};

const FAILED_STATUSES = new Set(['deny', 'cancel', 'expire', 'failure']);

export function classifyMidtransWebhookStatus(input: {
  transactionStatus: string;
  fraudStatus?: string | null;
}): MidtransWebhookStatusDecision {
  const transactionStatus = input.transactionStatus.trim().toLowerCase();
  const fraudStatus = input.fraudStatus?.trim().toLowerCase() || null;

  if (transactionStatus === 'settlement') {
    return {
      kind: 'settled',
      storedStatus: 'settlement',
      shouldActivateLicense: true,
      shouldNotifyFailure: false,
    };
  }

  if (transactionStatus === 'capture') {
    if (fraudStatus === 'challenge') {
      return {
        kind: 'pending',
        storedStatus: 'pending',
        shouldActivateLicense: false,
        shouldNotifyFailure: false,
      };
    }

    if (fraudStatus === 'deny') {
      return {
        kind: 'failed',
        storedStatus: 'deny',
        shouldActivateLicense: false,
        shouldNotifyFailure: true,
      };
    }

    return {
      kind: 'settled',
      storedStatus: 'settlement',
      shouldActivateLicense: true,
      shouldNotifyFailure: false,
    };
  }

  if (transactionStatus === 'pending') {
    return {
      kind: 'pending',
      storedStatus: 'pending',
      shouldActivateLicense: false,
      shouldNotifyFailure: false,
    };
  }

  if (FAILED_STATUSES.has(transactionStatus)) {
    return {
      kind: 'failed',
      storedStatus: transactionStatus,
      shouldActivateLicense: false,
      shouldNotifyFailure: true,
    };
  }

  return {
    kind: 'ignored',
    storedStatus: transactionStatus || 'unknown',
    shouldActivateLicense: false,
    shouldNotifyFailure: false,
  };
}
