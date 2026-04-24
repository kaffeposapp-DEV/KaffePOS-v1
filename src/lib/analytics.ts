const GA_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
const CLARITY_PROJECT_ID = (import.meta.env.VITE_CLARITY_PROJECT_ID || '').trim();

const GA_SCRIPT_ID = 'kaffepos-ga';
const CLARITY_SCRIPT_ID = 'kaffepos-clarity';

let gaInitialized = false;
let clarityInitialized = false;
let missingAnalyticsEnvLogged = false;

type AnalyticsCommand = (...args: unknown[]) => void;
type ClarityQueuedCommand = AnalyticsCommand & { q?: unknown[][] };
type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: AnalyticsCommand;
  clarity?: ClarityQueuedCommand;
};

export type AnalyticsRuntimeState = {
  configured: boolean;
  runtimeReady: boolean;
  initialized: boolean;
  scriptInjected: boolean;
};

export type AnalyticsStatus = {
  ga: AnalyticsRuntimeState & {
    measurementId: string | null;
  };
  clarity: AnalyticsRuntimeState & {
    projectId: string | null;
  };
};

function injectScript(src: string, id: string) {
  if (document.getElementById(id)) return;

  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function isProductionBuild() {
  return Boolean(import.meta.env.PROD);
}

function logMissingAnalyticsEnv() {
  if (!isProductionBuild() || missingAnalyticsEnvLogged) return;
  if (GA_MEASUREMENT_ID || CLARITY_PROJECT_ID) return;

  console.info(
    '[analytics] Google Analytics dan Microsoft Clarity belum aktif pada build ini. Isi VITE_GA_MEASUREMENT_ID dan/atau VITE_CLARITY_PROJECT_ID di service frontend, lalu rebuild dan redeploy frontend.'
  );
  missingAnalyticsEnvLogged = true;
}

export function analyticsStatus(): AnalyticsStatus {
  const w = typeof window === 'undefined' ? null : (window as AnalyticsWindow);
  const gaScriptInjected = typeof document !== 'undefined' && Boolean(document.getElementById(GA_SCRIPT_ID));
  const clarityScriptInjected = typeof document !== 'undefined' && Boolean(document.getElementById(CLARITY_SCRIPT_ID));

  return {
    ga: {
      configured: Boolean(GA_MEASUREMENT_ID),
      measurementId: GA_MEASUREMENT_ID || null,
      initialized: gaInitialized,
      scriptInjected: gaScriptInjected,
      runtimeReady: typeof w?.gtag === 'function',
    },
    clarity: {
      configured: Boolean(CLARITY_PROJECT_ID),
      projectId: CLARITY_PROJECT_ID || null,
      initialized: clarityInitialized,
      scriptInjected: clarityScriptInjected,
      runtimeReady: typeof w?.clarity === 'function',
    },
  };
}

export function analyticsWarnings() {
  const warnings: string[] = [];

  if (!GA_MEASUREMENT_ID) {
    warnings.push('Google Analytics belum aktif pada build frontend ini. Isi VITE_GA_MEASUREMENT_ID di service KaffePOS Web lalu rebuild dan redeploy frontend.');
  }

  if (!CLARITY_PROJECT_ID) {
    warnings.push('Microsoft Clarity belum aktif pada build frontend ini. Isi VITE_CLARITY_PROJECT_ID di service KaffePOS Web lalu rebuild dan redeploy frontend.');
  }

  return warnings;
}

export function initAnalytics() {
  if (typeof window === 'undefined') return;

  logMissingAnalyticsEnv();

  if (GA_MEASUREMENT_ID && !gaInitialized) {
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`, GA_SCRIPT_ID);
    const w = window as AnalyticsWindow;
    w.dataLayer = w.dataLayer || [];
    w.gtag = w.gtag || function gtag(...args: unknown[]) {
      w.dataLayer?.push(args);
    };
    w.gtag('js', new Date());
    w.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false });
    gaInitialized = true;
  }

  if (CLARITY_PROJECT_ID && !clarityInitialized) {
    const w = window as AnalyticsWindow;
    const clarityQueue: ClarityQueuedCommand = w.clarity || function queuedClarity(...args: unknown[]) {
      clarityQueue.q = clarityQueue.q || [];
      clarityQueue.q.push(args);
    };
    w.clarity = clarityQueue;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
    script.id = CLARITY_SCRIPT_ID;

    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }

    clarityInitialized = true;
  }
}

export function trackPageView(path: string) {
  if (typeof window === 'undefined') return;

  const w = window as AnalyticsWindow;

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
