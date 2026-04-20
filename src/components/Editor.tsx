import { useEffect, useRef } from 'react';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

type Props = {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
};

/**
 * Milkdown Crepe editor. Crepe is a batteries-included, ProseMirror-based
 * markdown editor with "click a rendered line → edit as markdown" built in
 * (that's its Live Preview behavior out of the box).
 *
 * We remount the component when `initialMarkdown` identity changes (App.tsx
 * uses `key={activePath}` for this), which keeps state management simple:
 * each file gets a fresh editor.
 */
export function Editor({ initialMarkdown, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const crepe = new Crepe({
      root: host,
      defaultValue: initialMarkdown,
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, md) => {
        onChangeRef.current(md);
      });
    });

    crepe
      .create()
      .catch((err) => console.error('Failed to init Milkdown:', err));

    return () => {
      void crepe.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor-host" ref={hostRef} />;
}
