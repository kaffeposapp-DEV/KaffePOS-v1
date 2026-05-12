type SnapCallbacks = {
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?: (result: unknown) => void;
  onClose?: () => void;
};

type SnapWindow = Window & {
  snap?: {
    pay: (token: string, callbacks?: SnapCallbacks) => void;
  };
};

let snapScriptPromise: Promise<void> | null = null;
let loadedSnapScriptUrl: string | null = null;

export function loadMidtransSnapScript(scriptUrl: string) {
  if (typeof window === 'undefined') return Promise.reject(new Error('Browser tidak tersedia.'));
  const url = scriptUrl.trim();
  if (!url) return Promise.reject(new Error('URL Snap Midtrans tidak tersedia.'));

  const snapWindow = window as SnapWindow;
  if (snapWindow.snap && loadedSnapScriptUrl === url) return Promise.resolve();
  if (snapScriptPromise && loadedSnapScriptUrl === url) return snapScriptPromise;

  snapScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = Array.from(document.querySelectorAll<HTMLScriptElement>('script[data-midtrans-snap="true"]'))
      .find((script) => script.src === url);
    if (existing) {
      if (snapWindow.snap?.pay) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Gagal memuat Snap Midtrans.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.midtransSnap = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Gagal memuat Snap Midtrans.'));
    document.head.appendChild(script);
  }).then(() => {
    loadedSnapScriptUrl = url;
  }).catch((error) => {
    snapScriptPromise = null;
    loadedSnapScriptUrl = null;
    throw error;
  });

  return snapScriptPromise;
}

export async function openMidtransSnap(input: {
  snapToken: string;
  snapScriptUrl?: string | null;
  paymentUrl?: string | null;
  callbacks?: SnapCallbacks;
}) {
  if (!input.snapScriptUrl) {
    if (input.paymentUrl) {
      window.location.assign(input.paymentUrl);
      return;
    }
    throw new Error('URL pembayaran Midtrans tidak tersedia.');
  }

  await loadMidtransSnapScript(input.snapScriptUrl);
  const snapWindow = window as SnapWindow;
  if (!snapWindow.snap?.pay) {
    if (input.paymentUrl) {
      window.location.assign(input.paymentUrl);
      return;
    }
    throw new Error('Snap Midtrans belum siap.');
  }
  snapWindow.snap.pay(input.snapToken, input.callbacks);
}
