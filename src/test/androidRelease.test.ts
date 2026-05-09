import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Android USB debugging release scaffolding', () => {
  it('keeps Capacitor Android pointed at bundled app assets, not a live reload server', () => {
    const config = readFileSync(resolve(process.cwd(), 'capacitor.config.ts'), 'utf8');

    expect(config).toContain("webDir: 'dist'");
    expect(config).toContain("androidScheme: 'https'");
    expect(config).not.toContain("androidScheme: 'http'");
    expect(config).not.toContain('server.url');
    expect(config).not.toContain('allowMixedContent: true');
  });

  it('does not allow production API cleartext even if a transitional localhost policy file exists', () => {
    const manifest = readFileSync(resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    const networkConfigPath = resolve(process.cwd(), 'android/app/src/main/res/xml/network_security_config.xml');
    expect(existsSync(networkConfigPath)).toBe(true);

    const networkConfig = readFileSync(networkConfigPath, 'utf8');
    expect(manifest).toContain('android:networkSecurityConfig="@xml/network_security_config"');
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(networkConfig).toContain('cleartextTrafficPermitted="true"');
    expect(networkConfig).toContain('<domain includeSubdomains="false">localhost</domain>');
    expect(networkConfig).toContain('<domain includeSubdomains="false">127.0.0.1</domain>');
    expect(networkConfig).toContain('cleartextTrafficPermitted="false"');
    expect(networkConfig).not.toContain('api.kaffepos.my.id</domain>');
  });

  it('ships a repeatable USB debugging build/install script', () => {
    const scriptPath = resolve(process.cwd(), 'scripts/android-usb-debug-build.sh');
    expect(existsSync(scriptPath)).toBe(true);

    const script = readFileSync(scriptPath, 'utf8');
    expect(script).toContain('npm run build:mobile');
    expect(script).toContain('npx cap sync android');
    expect(script).toContain('./gradlew assembleDebug');
    expect(script).toContain('adb install -r');
    expect(script).toContain('localhost');
    expect(script).toContain('10.0.2.2');
  });
});
