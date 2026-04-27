import { beforeEach, describe, expect, it } from 'vitest';
import { getStoredAuthSession, saveStoredAuthSession } from '@/lib/authSession';
import { APP_UPDATE_REPORT_KEY, POST_UPDATE_SYNC_PENDING_KEY, STORAGE_META_KEY, STORAGE_SCHEMA_VERSION, runAppUpgradeBootstrap } from '@/lib/appUpgrade';

describe('app upgrade bootstrap', () => {
  beforeEach(async () => {
    localStorage.clear();
    await saveStoredAuthSession(null);
  });

  it('migrates legacy local storage and keeps valid user session after update', async () => {
    localStorage.setItem('kpos_bt_mac', 'AA:BB:CC:DD:EE:FF');
    localStorage.setItem('kpos_app_theme', 'custom');
    localStorage.setItem('kpos_app_theme_custom', JSON.stringify({
      primary: '#123456',
      accent: '#123456',
      surface: '#223344',
    }));
    localStorage.setItem('kaffepos_sub_v2', JSON.stringify({
      status: {
        plan: 'signature',
        isActive: true,
        expiryDate: '2026-12-31T00:00:00.000Z',
        transactionCount: 4,
        transactionLimit: -1,
        daysRemaining: 30,
      },
      savedAt: Date.now(),
    }));
    await saveStoredAuthSession({
      accessToken: 'token-abc',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: { id: 'user-1', email: 'owner@kaffepos.my.id' },
    });

    const report = await runAppUpgradeBootstrap();
    const migratedPrinter = JSON.parse(localStorage.getItem('kaffepos_bt_printer') || '{}');
    const meta = JSON.parse(localStorage.getItem(STORAGE_META_KEY) || '{}');
    const upgradedTheme = JSON.parse(localStorage.getItem('kpos_app_theme_custom') || '{}');

    expect(report.firstLaunchAfterUpdate).toBe(true);
    expect(report.syncRecommended).toBe(true);
    expect(report.schemaVersionAfter).toBe(STORAGE_SCHEMA_VERSION);
    expect(migratedPrinter.address).toBe('AA:BB:CC:DD:EE:FF');
    expect(upgradedTheme.primary).toBe('#123456');
    expect(upgradedTheme.accent).not.toBe('#123456');
    expect(meta.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    expect(localStorage.getItem(APP_UPDATE_REPORT_KEY)).toBeTruthy();
    expect(localStorage.getItem(POST_UPDATE_SYNC_PENDING_KEY)).toBe('1');
    expect(await getStoredAuthSession()).toMatchObject({
      accessToken: 'token-abc',
      user: { id: 'user-1' },
    });
  });

  it('archives corrupted local payloads with targeted recovery instead of wiping all data', async () => {
    localStorage.setItem('kpos_app_theme', 'custom');
    localStorage.setItem('kpos_app_theme_custom', '{oops');
    localStorage.setItem('kaffepos_bt_printer', '{broken');
    localStorage.setItem('kaffepos_sub_v2', '{broken');
    localStorage.setItem('kaffepos_tx_month', '{"count":"x"}');
    localStorage.setItem('kpos_last_tab', 'settings');

    const report = await runAppUpgradeBootstrap();

    expect(report.recoveredKeys).toEqual(expect.arrayContaining([
      'kpos_app_theme_custom',
      'kaffepos_bt_printer',
      'kaffepos_sub_v2',
    ]));
    expect(localStorage.getItem('kpos_last_tab')).toBe('settings');
    expect(localStorage.getItem('kpos_app_theme_custom')).toBeTruthy();
    expect(localStorage.getItem('kaffepos_tx_month')).toContain('"count":0');
    expect(localStorage.getItem('kaffepos_recovery_kpos_app_theme_custom')).toBeTruthy();
    expect(localStorage.getItem(STORAGE_META_KEY)).toBeTruthy();
    expect(localStorage.getItem(POST_UPDATE_SYNC_PENDING_KEY)).toBe('1');
  });

  it('does not mark a fresh install as an app update', async () => {
    const report = await runAppUpgradeBootstrap();

    expect(report.firstLaunchAfterUpdate).toBe(false);
    expect(report.previousAppVersion).toBeNull();
    expect(report.schemaVersionAfter).toBe(STORAGE_SCHEMA_VERSION);
    expect(localStorage.getItem(POST_UPDATE_SYNC_PENDING_KEY)).toBe('1');
  });
});
