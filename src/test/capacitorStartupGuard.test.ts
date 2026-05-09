import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Capacitor startup guard', () => {
  it('installs a tiny triggerEvent no-op before app bundles execute', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(html).toContain('kaffepos-capacitor-startup-guard');
    expect(html).toContain('window.Capacitor = window.Capacitor || { Plugins: {} };');
    expect(html).toContain('window.Capacitor.triggerEvent = window.Capacitor.triggerEvent || function');
  });
});
