import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeCustomizer from '@/components/settings/ThemeCustomizer';
import { DEFAULT_CUSTOM_THEME } from '@/lib/theme';
import { useStore } from '@/hooks/useStore';

describe('ThemeCustomizer interaction', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    useStore.setState({
      appTheme: 'classic',
      customTheme: DEFAULT_CUSTOM_THEME,
    });
  });

  it('persists custom theme and applies custom data-theme when saved', () => {
    const toast = { showToast: vi.fn() };
    render(<ThemeCustomizer toast={toast} />);

    fireEvent.change(screen.getByLabelText(/Warna Utama/i), {
      target: { value: '#123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan Custom Theme' }));

    expect(useStore.getState().appTheme).toBe('custom');
    expect(useStore.getState().customTheme.primary).toBe('#123456');
    expect(localStorage.getItem('kpos_app_theme')).toBe('custom');
    expect(JSON.parse(localStorage.getItem('kpos_app_theme_custom') || '{}')).toMatchObject({
      primary: '#123456',
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('custom');
    expect(toast.showToast).toHaveBeenCalledWith('Custom theme disimpan.', 'success');
  });

  it('applies preset theme without mutating custom theme draft', () => {
    const toast = { showToast: vi.fn() };
    render(<ThemeCustomizer toast={toast} />);

    fireEvent.click(screen.getByRole('button', { name: /Slate Modern/i }));

    expect(useStore.getState().appTheme).toBe('slate');
    expect(useStore.getState().customTheme).toEqual(DEFAULT_CUSTOM_THEME);
    expect(localStorage.getItem('kpos_app_theme')).toBe('slate');
    expect(toast.showToast).toHaveBeenCalledWith('Tema preset diterapkan.', 'success');
  });
});
