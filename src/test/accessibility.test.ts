import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACCESSIBLE_COLORS,
  WCAG_AAA_NORMAL_TEXT_CONTRAST,
  WCAG_AAA_TARGET_SIZE,
  contrastRatio,
  meetsContrast,
} from '@/lib/accessibility';

describe('WCAG 2.2 AAA accessibility guardrails', () => {
  it('keeps core text and action colors at AAA contrast on white surfaces', () => {
    const white = '#ffffff';

    expect(contrastRatio(ACCESSIBLE_COLORS.text, white)).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT_CONTRAST);
    expect(contrastRatio(ACCESSIBLE_COLORS.muted, white)).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT_CONTRAST);
    expect(contrastRatio(ACCESSIBLE_COLORS.subtle, white)).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT_CONTRAST);
    expect(contrastRatio(ACCESSIBLE_COLORS.accent, white)).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT_CONTRAST);
    expect(meetsContrast(white, ACCESSIBLE_COLORS.accent)).toBe(true);
  });

  it('ships global CSS support for keyboard focus, touch targets, and reduced motion', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toContain(`--a11y-accent: ${ACCESSIBLE_COLORS.accent}`);
    expect(css).toContain(`min-height: ${WCAG_AAA_TARGET_SIZE}px`);
    expect(css).toContain(`min-width: ${WCAG_AAA_TARGET_SIZE}px`);
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });
});
