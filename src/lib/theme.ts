export type ThemePresetId = 'classic' | 'slate' | 'emerald' | 'midnight' | 'custom';

export type CustomThemeConfig = {
  primary: string;
  accent: string;
  surface: string;
};

export type ThemeGuardrailResult = {
  theme: CustomThemeConfig;
  warnings: string[];
  contrast: {
    onPrimary: number;
    onSurface: number;
  };
};

export const DEFAULT_CUSTOM_THEME: CustomThemeConfig = {
  primary: '#d8823b',
  accent: '#0f766e',
  surface: '#fff7ed',
};

export const THEME_PRESETS: Array<{
  id: ThemePresetId;
  name: string;
  description: string;
  preview: CustomThemeConfig;
}> = [
  {
    id: 'classic',
    name: 'Classic Coffee',
    description: 'Hangat, familiar, dan cocok untuk kedai harian.',
    preview: { primary: '#d8823b', accent: '#7a421a', surface: '#fdf8f4' },
  },
  {
    id: 'slate',
    name: 'Slate Modern',
    description: 'Lebih formal untuk operasional yang terasa rapi.',
    preview: { primary: '#475569', accent: '#0f172a', surface: '#f8fafc' },
  },
  {
    id: 'emerald',
    name: 'Emerald Business',
    description: 'Bersih dan segar untuk nuansa profesional.',
    preview: { primary: '#10b981', accent: '#065f46', surface: '#ecfdf5' },
  },
  {
    id: 'midnight',
    name: 'Midnight POS',
    description: 'Kuat dan kontras untuk tampilan modern.',
    preview: { primary: '#3b82f6', accent: '#1e3a8a', surface: '#eff6ff' },
  },
  {
    id: 'custom',
    name: 'Custom Theme',
    description: 'Atur primary, accent, dan surface sesuai karakter brand kamu.',
    preview: DEFAULT_CUSTOM_THEME,
  },
];

type RGB = { r: number; g: number; b: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(value: string, fallback: string) {
  const raw = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  return fallback;
}

function hexToRgb(hex: string): RGB {
  const normalized = normalizeHex(hex, '#000000');
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(rgb: RGB) {
  return `#${[rgb.r, rgb.g, rgb.b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function mixColors(base: string, target: string, ratio: number) {
  const baseRgb = hexToRgb(base);
  const targetRgb = hexToRgb(target);
  return rgbToHex({
    r: baseRgb.r + (targetRgb.r - baseRgb.r) * ratio,
    g: baseRgb.g + (targetRgb.g - baseRgb.g) * ratio,
    b: baseRgb.b + (targetRgb.b - baseRgb.b) * ratio,
  });
}

function getLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function getContrastRatio(foreground: string, background: string) {
  const light = Math.max(getLuminance(foreground), getLuminance(background));
  const dark = Math.min(getLuminance(foreground), getLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

export function getReadableTextColor(background: string) {
  const whiteContrast = getContrastRatio('#ffffff', background);
  const darkContrast = getContrastRatio('#0f172a', background);
  return whiteContrast >= darkContrast ? '#ffffff' : '#0f172a';
}

export function buildThemeScale(primary: string) {
  return {
    50: mixColors(primary, '#ffffff', 0.92),
    100: mixColors(primary, '#ffffff', 0.84),
    200: mixColors(primary, '#ffffff', 0.68),
    300: mixColors(primary, '#ffffff', 0.52),
    400: mixColors(primary, '#ffffff', 0.28),
    500: primary,
    600: mixColors(primary, '#000000', 0.08),
    700: mixColors(primary, '#000000', 0.18),
    800: mixColors(primary, '#000000', 0.32),
    900: mixColors(primary, '#000000', 0.5),
  };
}

export function evaluateCustomTheme(input: Partial<CustomThemeConfig>): ThemeGuardrailResult {
  const theme: CustomThemeConfig = {
    primary: normalizeHex(input.primary ?? DEFAULT_CUSTOM_THEME.primary, DEFAULT_CUSTOM_THEME.primary),
    accent: normalizeHex(input.accent ?? DEFAULT_CUSTOM_THEME.accent, DEFAULT_CUSTOM_THEME.accent),
    surface: normalizeHex(input.surface ?? DEFAULT_CUSTOM_THEME.surface, DEFAULT_CUSTOM_THEME.surface),
  };

  const warnings: string[] = [];
  const onPrimary = getContrastRatio(getReadableTextColor(theme.primary), theme.primary);
  let onSurface = getContrastRatio('#0f172a', theme.surface);

  if (onPrimary < 4.5) {
    warnings.push('Warna utama terlalu lemah. Sistem akan memilih warna teks yang lebih aman.');
  }

  if (onSurface < 7) {
    theme.surface = getLighterSurface(theme.surface);
    onSurface = getContrastRatio('#0f172a', theme.surface);
    warnings.push('Warna surface disesuaikan agar teks tetap nyaman dibaca.');
  }

  if (getContrastRatio(theme.primary, theme.accent) < 1.2) {
    theme.accent = mixColors(theme.primary, '#0f172a', 0.45);
    warnings.push('Accent terlalu mirip dengan primary, jadi disesuaikan agar hirarki UI tetap jelas.');
  }

  return {
    theme,
    warnings,
    contrast: {
      onPrimary,
      onSurface,
    },
  };
}

function getLighterSurface(surface: string) {
  let candidate = surface;
  let ratio = 0.24;

  while (getContrastRatio('#0f172a', candidate) < 7 && ratio <= 0.9) {
    candidate = mixColors(surface, '#ffffff', ratio);
    ratio += 0.12;
  }

  return candidate;
}

export function applyThemeToDocument(themeId: ThemePresetId, customTheme?: Partial<CustomThemeConfig>) {
  const root = document.documentElement;
  root.setAttribute('data-theme', themeId);

  const cleanupKeys = [
    '--theme-50',
    '--theme-100',
    '--theme-200',
    '--theme-300',
    '--theme-400',
    '--theme-500',
    '--theme-600',
    '--theme-700',
    '--theme-800',
    '--theme-900',
    '--theme-accent',
    '--theme-surface',
    '--theme-surface-soft',
    '--theme-on-primary',
    '--theme-on-surface',
  ];

  cleanupKeys.forEach((key) => root.style.removeProperty(key));

  if (themeId !== 'custom') return;

  const { theme } = evaluateCustomTheme(customTheme ?? DEFAULT_CUSTOM_THEME);
  const scale = buildThemeScale(theme.primary);
  const onPrimary = getReadableTextColor(theme.primary);

  root.style.setProperty('--theme-50', scale[50]);
  root.style.setProperty('--theme-100', scale[100]);
  root.style.setProperty('--theme-200', scale[200]);
  root.style.setProperty('--theme-300', scale[300]);
  root.style.setProperty('--theme-400', scale[400]);
  root.style.setProperty('--theme-500', scale[500]);
  root.style.setProperty('--theme-600', scale[600]);
  root.style.setProperty('--theme-700', scale[700]);
  root.style.setProperty('--theme-800', scale[800]);
  root.style.setProperty('--theme-900', scale[900]);
  root.style.setProperty('--theme-accent', theme.accent);
  root.style.setProperty('--theme-surface', theme.surface);
  root.style.setProperty('--theme-surface-soft', mixColors(theme.surface, '#ffffff', 0.45));
  root.style.setProperty('--theme-on-primary', onPrimary);
  root.style.setProperty('--theme-on-surface', '#0f172a');
}
