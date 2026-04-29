import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Android USB debugging release scaffolding', () => {
  it('keeps Capacitor Android pointed at bundled HTTPS app assets, not a live reload server', () => {
    const config = readFileSync(resolve(process.cwd(), 'capacitor.config.ts'), 'utf8');

    expect(config).toContain("webDir: 'dist'");
    expect(config).toContain("androidScheme: 'https'");
    expect(config).not.toContain('server.url');
    expect(config).not.toContain('allowMixedContent: true');
  });

  it('ships a repeatable USB debugging build/install script', () => {
    const scriptPath = resolve(process.cwd(), 'scripts/android-usb-debug-build.sh');
    expect(existsSync(scriptPath)).toBe(true);

    const script = readFileSync(scriptPath, 'utf8');
    expect(script).toContain('npm run build:mobile');
    expect(script).toContain('npx cap sync android');
    expect(script).toContain('./gradlew assembleDebug');
    expect(script).toContain('adb install -r');
  });
});
