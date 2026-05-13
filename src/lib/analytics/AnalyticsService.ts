const GA_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
const CLARITY_PROJECT_ID = (import.meta.env.VITE_CLARITY_PROJECT_ID || '').trim();
const ANALYTICS_CONSENT_KEY = 'kaffepos_analytics_consent';

const GA_SCRIPT_ID = 'kaffepos-ga';
const CLARITY_SCRIPT_ID = 'kaffepos-clarity';

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

export type AnalyticsEventName =
  | 'sign_up'
  | 'login'
  | 'first_transaction'
  | 'transaction_created'
  | 'upgrade_started'
  | 'upgrade_clicked'
  | 'upgrade_completed'
  | 'trial_started'
  | 'trial_ended'
  | 'feature_usage'
  | 'gamification_used'
  | 'loyalty_used'
  | 'ai_insights_used'
  | 'pdf_export'
  | 'pdf_exported'
  | 'payment_started'
  | 'payment_completed'
  | 'payment_success'
  | 'feedback_submitted'
  | (string & Record<never, never>);

function hasAnalyticsConsent() {
  if (typeof window === 'undefined') return false;
  const explicit = localStorage.getItem(ANALYTICS_CONSENT_KEY);
  if (explicit === 'denied') return false;
  if (explicit === 'granted') return true;
  return true;
}

function injectScript(src: string, id: string) {
  if (document.getElementById(id)) return;

  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  script.referrerPolicy = 'origin';
  document.head.appendChild(script);
}

class AnalyticsServiceClass {
  private gaInitialized = false;
  private clarityInitialized = false;
  private missingAnalyticsEnvLogged = false;

  init() {
    if (typeof window === 'undefined') return;

    this.logMissingAnalyticsEnv();
    if (!hasAnalyticsConsent()) return;

    this.initGa();
    this.initClarity();
  }

  status(): AnalyticsStatus {
    const w = typeof window === 'undefined' ? null : (window as AnalyticsWindow);
    const gaScriptInjected = typeof document !== 'undefined' && Boolean(document.getElementById(GA_SCRIPT_ID));
    const clarityScriptInjected = typeof document !== 'undefined' && Boolean(document.getElementById(CLARITY_SCRIPT_ID));

    return {
      ga: {
        configured: Boolean(GA_MEASUREMENT_ID),
        measurementId: GA_MEASUREMENT_ID || null,
        initialized: this.gaInitialized,
        scriptInjected: gaScriptInjected,
        runtimeReady: typeof w?.gtag === 'function',
      },
      clarity: {
        configured: Boolean(CLARITY_PROJECT_ID),
        projectId: CLARITY_PROJECT_ID || null,
        initialized: this.clarityInitialized,
        scriptInjected: clarityScriptInjected,
        runtimeReady: typeof w?.clarity === 'function',
      },
    };
  }

  warnings() {
    const warnings: string[] = [];

    if (!GA_MEASUREMENT_ID) {
      warnings.push('Google Analytics belum aktif pada build frontend ini. Isi VITE_GA_MEASUREMENT_ID di service KaffePOS Web lalu rebuild dan redeploy frontend.');
    }

    if (!CLARITY_PROJECT_ID) {
      warnings.push('Microsoft Clarity belum aktif pada build frontend ini. Isi VITE_CLARITY_PROJECT_ID di service KaffePOS Web lalu rebuild dan redeploy frontend.');
    }

    return warnings;
  }

  pageView(path: string) {
    if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;

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

  event(eventName: AnalyticsEventName, params: Record<string, unknown> = {}) {
    if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;
    const w = window as AnalyticsWindow;
    const payload = {
      ...params,
      event_source: 'kaffepos_app',
      app_platform: this.platform(),
    };

    if (GA_MEASUREMENT_ID && typeof w.gtag === 'function') {
      w.gtag('event', this.normalizeGaEventName(eventName), payload);
    }

    if (CLARITY_PROJECT_ID && typeof w.clarity === 'function') {
      w.clarity('event', eventName);
    }
  }

  identify(userId: string, traits: Record<string, unknown> = {}) {
    if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;
    const w = window as AnalyticsWindow;

    if (GA_MEASUREMENT_ID && typeof w.gtag === 'function') {
      w.gtag('set', { user_id: userId });
    }

    if (CLARITY_PROJECT_ID && typeof w.clarity === 'function') {
      w.clarity('identify', userId);
      Object.entries(traits).forEach(([key, value]) => w.clarity?.('set', key, String(value ?? '')));
    }
  }

  setConsent(granted: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ANALYTICS_CONSENT_KEY, granted ? 'granted' : 'denied');
    if (granted) this.init();
  }

  private initGa() {
    if (!GA_MEASUREMENT_ID || this.gaInitialized) return;

    injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`, GA_SCRIPT_ID);
    const w = window as AnalyticsWindow;
    w.dataLayer = w.dataLayer || [];
    w.gtag = w.gtag || function gtag(...args: unknown[]) {
      w.dataLayer?.push(args);
    };
    w.gtag('js', new Date());
    w.gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: false,
      anonymize_ip: true,
      transport_type: 'beacon',
    });
    this.gaInitialized = true;
  }

  private initClarity() {
    if (!CLARITY_PROJECT_ID || this.clarityInitialized) return;
    if (document.getElementById(CLARITY_SCRIPT_ID)) {
      this.clarityInitialized = true;
      return;
    }

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
    script.referrerPolicy = 'origin';

    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }

    this.clarityInitialized = true;
  }

  private logMissingAnalyticsEnv() {
    if (!import.meta.env.PROD || this.missingAnalyticsEnvLogged) return;
    if (GA_MEASUREMENT_ID || CLARITY_PROJECT_ID) return;

    console.info(
      '[analytics] Google Analytics dan Microsoft Clarity belum aktif pada build ini. Isi VITE_GA_MEASUREMENT_ID dan/atau VITE_CLARITY_PROJECT_ID di service frontend, lalu rebuild dan redeploy frontend.'
    );
    this.missingAnalyticsEnvLogged = true;
  }

  private normalizeGaEventName(eventName: string) {
    const aliases: Record<string, string> = {
      register: 'sign_up',
      upgrade_clicked: 'upgrade_started',
      pdf_exported: 'pdf_export',
      payment_completed: 'payment_success',
    };
    return aliases[eventName] ?? eventName;
  }

  private platform() {
    if (typeof window === 'undefined') return 'server';
    return window.location.protocol === 'capacitor:' ? 'capacitor' : 'web';
  }
}

export const AnalyticsService = new AnalyticsServiceClass();

export const initAnalytics = () => AnalyticsService.init();
export const analyticsStatus = () => AnalyticsService.status();
export const analyticsWarnings = () => AnalyticsService.warnings();
export const trackPageView = (path: string) => AnalyticsService.pageView(path);
export const trackAnalyticsEvent = (eventName: AnalyticsEventName, params: Record<string, unknown> = {}) =>
  AnalyticsService.event(eventName, params);
export const identifyAnalyticsUser = (userId: string, traits?: Record<string, unknown>) =>
  AnalyticsService.identify(userId, traits);
export const setAnalyticsConsent = (granted: boolean) => AnalyticsService.setConsent(granted);
