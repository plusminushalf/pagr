import { useEffect, useState } from 'react';

type Props = {
  path: string;
  reloadKey: number;
};

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};

export function ImageViewer({ path, reloadKey }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setError(null);
    setSrc(null);

    (async () => {
      try {
        const bytes = await window.pagr.readFileBytes(path);
        if (cancelled) return;
        const ext = path.toLowerCase().split('.').pop() ?? '';
        const type = MIME_BY_EXT[ext] ?? 'application/octet-stream';
        url = URL.createObjectURL(new Blob([bytes], { type }));
        setSrc(url);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, reloadKey]);

  return (
    <div className="image-viewer">
      {error ? (
        <div className="viewer-error">Failed to load image: {error}</div>
      ) : src ? (
        <img src={src} alt={path} />
      ) : null}
    </div>
  );
}
