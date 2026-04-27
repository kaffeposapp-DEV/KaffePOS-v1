import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/hooks/useStore';

describe('useStore theme persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({
      appTheme: 'classic',
      customTheme: {
        primary: '#d8823b',
        accent: '#0f766e',
        surface: '#fff7ed',
      },
    });
  });

  it('preserves saved theme preferences across resetState', () => {
    useStore.getState().setCustomTheme({
      primary: '#123456',
      accent: '#654321',
      surface: '#f7f7f7',
    });
    useStore.getState().setAppTheme('custom');

    useStore.getState().resetState();

    expect(useStore.getState().appTheme).toBe('custom');
    expect(useStore.getState().customTheme).toMatchObject({
      primary: '#123456',
      accent: '#654321',
      surface: '#f7f7f7',
    });
  });
});
