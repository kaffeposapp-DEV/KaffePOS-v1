export const WCAG_AAA_NORMAL_TEXT_CONTRAST = 7;
export const WCAG_AAA_LARGE_TEXT_CONTRAST = 4.5;
export const WCAG_AAA_TARGET_SIZE = 44;

export const ACCESSIBLE_COLORS = {
  text: '#0f172a',
  muted: '#334155',
  subtle: '#475569',
  accent: '#9A3412',
  accentHover: '#7C2D12',
  focus: '#9A3412',
  focusInner: '#ffffff',
} as const;

type RGB = { r: number; g: number; b: number };

function expandHex(hex: string) {
  const raw = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.slice(1);
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  throw new Error(`Invalid hex color: ${hex}`);
}

export function hexToRgb(hex: string): RGB {
  const normalized = expandHex(hex);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: string, background: string) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

export function meetsContrast(foreground: string, background: string, target = WCAG_AAA_NORMAL_TEXT_CONTRAST) {
  return contrastRatio(foreground, background) >= target;
}
