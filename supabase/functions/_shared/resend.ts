type ResendEmailInput = {
  apiKey: string;
  to: string;
  subject: string;
  html: string;
  from?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function sendResendEmailWithRetry(input: ResendEmailInput) {
  const {
    apiKey,
    to,
    subject,
    html,
    from = 'KaffePOS <noreply@kaffepos.my.id>',
    timeoutMs = 10_000,
    maxAttempts = 3,
    baseDelayMs = 800,
  } = input;

  if (!apiKey) throw new Error('RESEND_API_KEY missing');

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), timeoutMs);
    let canRetry = true;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          html,
        }),
        signal: controller.signal,
      });

      const bodyText = await response.text();
      if (response.ok) {
        return {
          ok: true,
          attempt,
          responseText: bodyText,
        };
      }

      const message = `Resend API failed (${response.status}): ${bodyText || response.statusText}`;
      lastError = new Error(message);
      canRetry = shouldRetryStatus(response.status);
      if (!canRetry || attempt === maxAttempts) {
        throw lastError;
      }
    } catch (error: any) {
      const aborted = error?.name === 'AbortError' || String(error?.message || error).toLowerCase().includes('timeout');
      lastError = aborted
        ? new Error(`Resend timeout setelah ${timeoutMs}ms`)
        : new Error(String(error?.message || error));

      if ((!aborted && !canRetry) || (!aborted && attempt === maxAttempts)) {
        throw lastError;
      }

      if (aborted && attempt === maxAttempts) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    await sleep(baseDelayMs * (2 ** (attempt - 1)));
  }

  throw lastError || new Error('Resend email gagal dikirim.');
}
