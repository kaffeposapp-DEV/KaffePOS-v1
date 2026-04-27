import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { persistCriticalStorageBackup, restoreCriticalStorageBackup } from '@/lib/appStorageBackup';

describe('app storage backup', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Preferences.get).mockResolvedValue({ value: null });
    vi.mocked(Preferences.set).mockResolvedValue();
    vi.mocked(Preferences.remove).mockResolvedValue();
  });

  it('backs up only critical persisted keys for native upgrade safety', async () => {
    localStorage.setItem('kpos_app_theme', 'custom');
    localStorage.setItem('kaffepos_bt_printer', '{"address":"AA:BB"}');
    localStorage.setItem('kpos_store_id_user-1', 'store-1');
    localStorage.setItem('kpos_menu_store-1', '[{"id":"m1"}]');

    await persistCriticalStorageBackup();

    expect(Preferences.set).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(vi.mocked(Preferences.set).mock.calls[0][0].value);
    expect(payload.snapshot.kpos_app_theme).toBe('custom');
    expect(payload.snapshot.kaffepos_bt_printer).toBe('{"address":"AA:BB"}');
    expect(payload.snapshot['kpos_store_id_user-1']).toBe('store-1');
    expect(payload.snapshot['kpos_menu_store-1']).toBeUndefined();
  });

  it('restores missing critical keys from native backup without overwriting fresh local data', async () => {
    vi.mocked(Preferences.get).mockResolvedValue({
      value: JSON.stringify({
        snapshot: {
          kpos_app_theme: 'custom',
          kpos_app_theme_custom: '{"primary":"#123456"}',
          kaffepos_bt_printer: '{"name":"Printer","address":"AA:BB"}',
        },
      }),
    });
    localStorage.setItem('kpos_app_theme', 'classic');

    const restoredKeys = await restoreCriticalStorageBackup();

    expect(localStorage.getItem('kpos_app_theme')).toBe('classic');
    expect(localStorage.getItem('kaffepos_bt_printer')).toBe('{"name":"Printer","address":"AA:BB"}');
    expect(restoredKeys).toEqual(['kpos_app_theme_custom', 'kaffepos_bt_printer']);
  });
});
