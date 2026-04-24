import { beforeEach, describe, expect, it } from 'vitest';
import { analyticsStatus, analyticsWarnings, initAnalytics } from '@/lib/analytics';

describe('analytics readiness helpers', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('reports missing analytics env in the current test build', () => {
    const status = analyticsStatus();
    const warnings = analyticsWarnings();

    expect(status.ga.configured).toBe(false);
    expect(status.clarity.configured).toBe(false);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('does not inject scripts when analytics env is not configured', () => {
    initAnalytics();

    expect(document.getElementById('kaffepos-ga')).toBeNull();
    expect(document.getElementById('kaffepos-clarity')).toBeNull();
  });
});
