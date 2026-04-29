import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('white and orange professional design system', () => {
  it('ships the reference orange gradient tokens and global button styling', () => {
    const css = readProjectFile('src/index.css');

    expect(css).toContain('--brand-gradient: linear-gradient');
    expect(css).toContain('--brand-surface-gradient: linear-gradient');
    expect(css).toContain('#FF6A00');
    expect(css).toContain('#FF8A1C');
    expect(css).toContain('--brand-neutral-900: #1F2933');
    expect(css).toContain('.kaffe-app-bg');
    expect(css).toContain('.kaffe-soft-section');
    expect(css).toContain('.kaffe-cta-band');
    expect(css).toContain('.kaffe-metric-card');
    expect(css).toContain('.kaffe-table-surface');
    expect(css).toContain('background-image: var(--brand-gradient)');
  });

  it('uses clean white gradient surfaces for web and app shells', () => {
    const landing = readProjectFile('src/pages/LandingPage.tsx');
    const appShell = readProjectFile('src/components/AppShell.tsx');
    const auth = readProjectFile('src/components/auth/AuthPage.tsx');
    const dashboard = readProjectFile('src/components/dashboard/Dashboard.tsx');
    const css = readProjectFile('src/index.css');

    expect(landing).toContain('kaffe-soft-section');
    expect(landing).toContain('kaffe-cta-band');
    expect(landing).toContain('kaffe-footer');
    expect(landing).not.toContain('footer className="relative z-10 bg-[#FF6A00]');
    expect(appShell).toContain('kaffe-app-bg');
    expect(appShell).toContain('kaffe-sidebar');
    expect(auth).toContain('kaffe-app-bg');
    expect(auth).toContain('authPreviewCards');
    expect(auth).toContain('APP_PREVIEW');
    expect(auth).toContain('BRAND_PREVIEW');
    expect(auth).toContain('LICENSE_PREVIEW');
    expect(auth).toContain('kaffe-auth-preview');
    expect(auth).toContain('kaffe-float-soft');
    expect(css).toContain('.kaffe-auth-preview');
    expect(css).toContain('.kaffe-mobile-preview-strip');
    expect(css).toContain('@keyframes kaffeFloat');
    expect(css).toContain('@keyframes kaffeGlowSweep');
    expect(dashboard).toContain('kaffe-app-bg');
    expect(dashboard).toContain('kaffe-metric-card');
  });

  it('keeps product management aligned with the desktop web reference', () => {
    const menu = readProjectFile('src/components/menu/MenuTab.tsx');

    expect(menu).toContain('kaffe-table-surface');
    expect(menu).toContain('kaffe-product-grid');
    expect(menu).toContain('kaffe-filter-chip');
    expect(menu).toContain('Tambah Produk');
  });

  it('keeps the marketing hero shrinkable on narrow mobile screens', () => {
    const landing = readProjectFile('src/pages/LandingPage.tsx');

    expect(landing).toContain('grid min-w-0');
    expect(landing).toContain('relative z-10 min-w-0 text-left');
    expect(landing).toContain('break-words');
    expect(landing).toContain('max-w-[340px]');
  });
});
