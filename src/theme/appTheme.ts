export type ThemeAccentId = 'emerald' | 'vscode' | 'blue' | 'violet' | 'amber' | 'rose' | 'custom';

export type ThemeAccentOption = {
  id: ThemeAccentId;
  label: string;
  light: string;
  dark: string;
  darkBackground?: string;
  darkCard?: string;
  darkMuted?: string;
};

export const THEME_ACCENT_STORAGE_KEY = 'pixcode.theme.accent';
export const THEME_CUSTOM_LIGHT_STORAGE_KEY = 'pixcode.theme.customLight';
export const THEME_CUSTOM_DARK_STORAGE_KEY = 'pixcode.theme.customDark';
export const DEFAULT_CUSTOM_LIGHT = '#059669';
export const DEFAULT_CUSTOM_DARK = '#10b981';

export const THEME_ACCENT_OPTIONS: ThemeAccentOption[] = [
  { id: 'emerald', label: 'Emerald', light: '#059669', dark: '#10b981' },
  {
    id: 'vscode',
    label: 'VS Code',
    light: '#007acc',
    dark: '#007acc',
    darkBackground: '215 28% 7%',
    darkCard: '215 25% 10%',
    darkMuted: '215 18% 16%',
  },
  { id: 'blue', label: 'Blue', light: '#2563eb', dark: '#60a5fa' },
  { id: 'violet', label: 'Violet', light: '#7c3aed', dark: '#a78bfa' },
  { id: 'amber', label: 'Amber', light: '#d97706', dark: '#f59e0b' },
  { id: 'rose', label: 'Rose', light: '#e11d48', dark: '#fb7185' },
  { id: 'custom', label: 'Custom', light: DEFAULT_CUSTOM_LIGHT, dark: DEFAULT_CUSTOM_DARK },
];

export const DEFAULT_THEME_ACCENT: ThemeAccentId = 'emerald';

function getStoredValue(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function isThemeAccentId(value: unknown): value is ThemeAccentId {
  return typeof value === 'string' && THEME_ACCENT_OPTIONS.some((option) => option.id === value);
}

export function isThemeHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function readThemeAccent(): ThemeAccentId {
  const stored = getStoredValue(THEME_ACCENT_STORAGE_KEY);
  return isThemeAccentId(stored) ? stored : DEFAULT_THEME_ACCENT;
}

export function readThemeColor(key: string, fallback: string): string {
  const stored = getStoredValue(key);
  return isThemeHexColor(stored) ? stored : fallback;
}

export function hexToHslToken(hex: string): string {
  const normalized = hex.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === red) {
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
    hue /= 6;
  }

  return `${Math.round(hue * 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

export function foregroundForHex(hex: string): string {
  const normalized = hex.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? '160 18% 6%' : '210 40% 98%';
}

export function applyThemeAccent(
  root: HTMLElement,
  accent: ThemeAccentId,
  isDarkMode: boolean,
  customLight: string,
  customDark: string,
): string {
  const selected = THEME_ACCENT_OPTIONS.find((option) => option.id === accent) ?? THEME_ACCENT_OPTIONS[0];
  const activeHex = accent === 'custom'
    ? (isDarkMode ? customDark : customLight)
    : (isDarkMode ? selected.dark : selected.light);
  const activeHsl = hexToHslToken(activeHex);

  root.style.setProperty('--primary', activeHsl);
  root.style.setProperty('--ring', activeHsl);
  root.style.setProperty('--primary-foreground', foregroundForHex(activeHex));
  root.style.setProperty('--nav-tab-glow', `${activeHsl} / ${isDarkMode ? '0.25' : '0.18'}`);
  root.style.setProperty('--nav-tab-ring', `${activeHsl} / ${isDarkMode ? '0.15' : '0.10'}`);
  root.style.setProperty('--nav-input-focus-ring', `${activeHsl} / ${isDarkMode ? '0.25' : '0.22'}`);

  if (isDarkMode && selected.darkBackground) {
    root.style.setProperty('--background', selected.darkBackground);
    root.style.setProperty('--card', selected.darkCard ?? selected.darkBackground);
    root.style.setProperty('--popover', selected.darkCard ?? selected.darkBackground);
    root.style.setProperty('--muted', selected.darkMuted ?? selected.darkCard ?? selected.darkBackground);
    root.style.setProperty('--secondary', selected.darkMuted ?? selected.darkCard ?? selected.darkBackground);
    root.style.setProperty('--accent', selected.darkMuted ?? selected.darkCard ?? selected.darkBackground);
  } else {
    ['--background', '--card', '--popover', '--muted', '--secondary', '--accent'].forEach((name) => {
      root.style.removeProperty(name);
    });
  }

  return activeHex;
}
