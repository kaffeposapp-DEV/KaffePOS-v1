import { describe, expect, it } from 'vitest';
import { WCAG_AAA_NORMAL_TEXT_CONTRAST } from '@/lib/accessibility';
import { DEFAULT_CUSTOM_THEME, buildThemeScale, evaluateCustomTheme } from '@/lib/theme';

describe('theme guardrails', () => {
  it('builds a complete primary scale for custom theme', () => {
    const scale = buildThemeScale(DEFAULT_CUSTOM_THEME.primary);

    expect(scale[50]).toMatch(/^#/);
    expect(scale[500]).toBe(DEFAULT_CUSTOM_THEME.primary);
    expect(scale[900]).toMatch(/^#/);
  });

  it('lightens unreadable surfaces and separates accent from primary', () => {
    const evaluation = evaluateCustomTheme({
      primary: '#334155',
      accent: '#334155',
      surface: '#475569',
    });

    expect(evaluation.theme.surface).not.toBe('#475569');
    expect(evaluation.theme.accent).not.toBe('#334155');
    expect(evaluation.warnings.length).toBeGreaterThan(0);
    expect(evaluation.contrast.onSurface).toBeGreaterThanOrEqual(7);
  });

  it('keeps custom primary colors readable against white text at AAA contrast', () => {
    const evaluation = evaluateCustomTheme({
      primary: '#FF6A00',
      accent: '#0f766e',
      surface: '#fff7ed',
    });

    expect(evaluation.theme.primary).not.toBe('#ff6a00');
    expect(evaluation.contrast.onPrimary).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT_CONTRAST);
  });
});
