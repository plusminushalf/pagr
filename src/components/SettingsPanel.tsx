import { useEffect } from 'react';
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="settings-overlay" onMouseDown={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-header">Settings</div>
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
    </div>
  );
}
