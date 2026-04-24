import { useEffect } from 'react';

type Shortcut = { keys: string[]; label: string };

const SHORTCUTS: Shortcut[] = [
  { keys: ['⌘', 'O'], label: 'Open folder' },
  { keys: ['⌘', '⇧', 'O'], label: 'Open file' },
  { keys: ['⌘', 'K'], label: 'Command palette' },
  { keys: ['⌘', 'S'], label: 'Save' },
  { keys: ['⌘', 'B'], label: 'Toggle sidebar' },
  { keys: ['⌘', '?'], label: 'Show this help' },
  { keys: ['Esc'], label: 'Close dialog / palette' },
];

type Props = { onClose: () => void };

export function ShortcutsHelp({ onClose }: Props) {
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
    <div className="shortcuts-overlay" onClick={onClose}>
      <div
        className="shortcuts-panel"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-header">Keyboard shortcuts</div>
        <ul className="shortcuts-list">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="shortcuts-row">
              <span className="shortcuts-label">{s.label}</span>
              <span className="shortcuts-keys">
                {s.keys.map((k, i) => (
                  <kbd key={i} className="shortcuts-key">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
