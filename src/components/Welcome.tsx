type Props = {
  onOpenFolder: () => void;
};

const mod = /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl';

const shortcuts: Array<{ keys: string; label: string }> = [
  { keys: `${mod} O`, label: 'Open a folder' },
  { keys: `${mod} K`, label: 'Search files & jump around' },
  { keys: `${mod} S`, label: 'Save the current file' },
];

export function Welcome({ onOpenFolder }: Props) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1 className="welcome-title">pagr</h1>
        <p className="welcome-subtitle">
          A tiny, opinionated markdown viewer and editor for folders that
          Claude wrote. Edit <code>.md</code> files, flip through images,
          and read PDFs — so you can review plans, workout routines,
          company strategy, and anything else Claude put on disk without
          squinting at a terminal.
        </p>

        <button
          className="welcome-cta"
          type="button"
          onClick={onOpenFolder}
        >
          Open a folder…
        </button>

        <div className="welcome-shortcuts">
          <div className="welcome-section-label">Shortcuts</div>
          <ul>
            {shortcuts.map((s) => (
              <li key={s.keys}>
                <kbd>{s.keys}</kbd>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="welcome-tips">
          <div className="welcome-section-label">Good for</div>
          <ul>
            <li>Personal notes, journals, and scratchpads</li>
            <li>Reading through a folder of PDFs or research</li>
            <li>Editing a docs folder alongside your editor of choice</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
