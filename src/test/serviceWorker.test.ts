import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('offline shell service worker', () => {
  const swPath = resolve(process.cwd(), 'public/sw.js');
  const offlinePath = resolve(process.cwd(), 'public/offline.html');

  it('ships a navigation fallback shell without caching API data blindly', () => {
    expect(existsSync(swPath)).toBe(true);
    expect(existsSync(offlinePath)).toBe(true);

    const source = readFileSync(swPath, 'utf8');
    expect(source).toContain("OFFLINE_FALLBACK_URL = '/offline.html'");
    expect(source).toContain("request.mode === 'navigate'");
    expect(source).toContain('shouldBypassRequest');
    expect(source).toContain('/api/');
    expect(source).toContain('event.respondWith(handleNavigationRequest');
  });
});
