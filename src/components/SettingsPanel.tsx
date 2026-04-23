import { useEffect, useRef } from 'react';
import type { FontKey, ThemeKey } from '../settings';
import { FONT_OPTIONS, THEME_OPTIONS } from '../settings';

type Props = {
  font: FontKey;
  theme: ThemeKey;
  onFontChange: (font: FontKey) => void;
  onThemeChange: (theme: ThemeKey) => void;
  onClose: () => void;
};

export function SettingsPanel({
  font,
  theme,
  onFontChange,
  onThemeChange,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Defer so the click that opened the panel doesn't immediately close it.
    const t = window.setTimeout(() => {
      window.addEventListener('mousedown', onDown);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="settings-panel" role="dialog">
      <label className="settings-row">
        <span className="settings-label">Font</span>
        <select
          className="settings-select"
          value={font}
          onChange={(e) => onFontChange(e.target.value as FontKey)}
        >
          {FONT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key} style={{ fontFamily: opt.stack }}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-row">
        <span className="settings-label">Theme</span>
        <select
          className="settings-select"
          value={theme}
          onChange={(e) => onThemeChange(e.target.value as ThemeKey)}
        >
          {THEME_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
