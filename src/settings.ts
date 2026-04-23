export type FontKey = 'inter' | 'system' | 'georgia' | 'charter' | 'mono';
export type ThemeKey = 'light' | 'dark';

export const FONT_OPTIONS: ReadonlyArray<{
  key: FontKey;
  label: string;
  stack: string;
}> = [
  {
    key: 'inter',
    label: 'Inter',
    stack: "'Inter', system-ui, sans-serif",
  },
  {
    key: 'system',
    label: 'System UI',
    stack:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  {
    key: 'georgia',
    label: 'Georgia (serif)',
    stack: "Georgia, 'Times New Roman', Times, serif",
  },
  {
    key: 'charter',
    label: 'Charter (serif)',
    stack: "Charter, 'Iowan Old Style', Georgia, serif",
  },
  {
    key: 'mono',
    label: 'Mono',
    stack:
      "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  },
];

export const THEME_OPTIONS: ReadonlyArray<{ key: ThemeKey; label: string }> = [
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

export const FONT_STORAGE_KEY = 'pagr:font';
export const THEME_STORAGE_KEY = 'pagr:theme';

export function getFontStack(key: FontKey): string {
  return FONT_OPTIONS.find((f) => f.key === key)?.stack ?? FONT_OPTIONS[0].stack;
}

export function loadFont(): FontKey {
  const v = localStorage.getItem(FONT_STORAGE_KEY);
  return FONT_OPTIONS.some((o) => o.key === v) ? (v as FontKey) : 'inter';
}

export function loadTheme(): ThemeKey {
  const v = localStorage.getItem(THEME_STORAGE_KEY);
  return v === 'dark' || v === 'light' ? v : 'light';
}
