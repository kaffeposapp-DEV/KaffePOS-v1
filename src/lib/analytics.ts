const GA_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
const CLARITY_PROJECT_ID = (import.meta.env.VITE_CLARITY_PROJECT_ID || '').trim();

let gaInitialized = false;
let clarityInitialized = false;

function injectScript(src: string, id: string) {
  if (document.getElementById(id)) return;

  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

export function analyticsStatus() {
  return {
    ga: {
      configured: Boolean(GA_MEASUREMENT_ID),
      measurementId: GA_MEASUREMENT_ID || null,
    },
    clarity: {
      configured: Boolean(CLARITY_PROJECT_ID),
      projectId: CLARITY_PROJECT_ID || null,
    },
  };
}

export function initAnalytics() {
  if (typeof window === 'undefined') return;

  if (GA_MEASUREMENT_ID && !gaInitialized) {
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`, 'kaffepos-ga');
    const w = window as typeof window & {
      dataLayer?: unknown[];
      gtag?: (...args: unknown[]) => void;
    };
    w.dataLayer = w.dataLayer || [];
    w.gtag = w.gtag || function gtag(...args: unknown[]) {
      w.dataLayer?.push(args);
    };
    w.gtag('js', new Date());
    w.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false });
    gaInitialized = true;
  }

  if (CLARITY_PROJECT_ID && !clarityInitialized) {
    const w = window as typeof window & {
      clarity?: (...args: unknown[]) => void;
    };
    ((c, l, a, r, i, t, y) => {
      c[a] = c[a] || function clarityQueue(...args: unknown[]) {
        (c[a].q = c[a].q || []).push(args);
      };
      t = l.createElement(r) as HTMLScriptElement;
      t.async = true;
      t.src = `https://www.clarity.ms/tag/${i}`;
      t.id = 'kaffepos-clarity';
      y = l.getElementsByTagName(r)[0];
      y.parentNode?.insertBefore(t, y);
    })(w as Record<string, any>, document, 'clarity', 'script', CLARITY_PROJECT_ID, null as any, null as any);
    clarityInitialized = true;
  }
}

export function trackPageView(path: string) {
  if (typeof window === 'undefined') return;

  const w = window as typeof window & {
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  };

  if (GA_MEASUREMENT_ID && typeof w.gtag === 'function') {
    w.gtag('event', 'page_view', {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }

  if (CLARITY_PROJECT_ID && typeof w.clarity === 'function') {
    w.clarity('set', 'route', path);
  }
}
