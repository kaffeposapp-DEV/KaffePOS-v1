import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('analytics readiness helpers', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports missing analytics env in the current test build', async () => {
    const { analyticsStatus, analyticsWarnings } = await import('@/lib/analytics');
    const status = analyticsStatus();
    const warnings = analyticsWarnings();

    expect(status.ga.configured).toBe(false);
    expect(status.clarity.configured).toBe(false);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('does not inject scripts when analytics env is not configured', async () => {
    const { initAnalytics } = await import('@/lib/analytics');
    initAnalytics();

    expect(document.getElementById('kaffepos-ga')).toBeNull();
    expect(document.getElementById('kaffepos-clarity')).toBeNull();
  });

  it('injects Microsoft Clarity once for the configured production build', async () => {
    vi.stubEnv('VITE_CLARITY_PROJECT_ID', 'clarity-prod');
    const { initAnalytics, analyticsStatus } = await import('@/lib/analytics');

    initAnalytics();
    initAnalytics();

    const scripts = [...document.querySelectorAll<HTMLScriptElement>('#kaffepos-clarity')];
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('https://www.clarity.ms/tag/clarity-prod');
    expect(analyticsStatus().clarity.scriptInjected).toBe(true);
  });
});
