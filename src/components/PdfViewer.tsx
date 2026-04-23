import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

type Props = {
  path: string;
  reloadKey: number;
};

const RENDER_SCALE = 1.5;

export function PdfViewer({ path, reloadKey }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();
    setError(null);

    (async () => {
      try {
        const bytes = await window.pagr.readFileBytes(path);
        if (cancelled) return;
        // pdfjs takes ownership of the buffer; give it a fresh copy so our
        // Uint8Array isn't transferred away.
        const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }

        const ratio = window.devicePixelRatio || 1;
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) break;
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: RENDER_SCALE });
          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-page';
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({
            canvas,
            canvasContext: ctx,
            viewport,
            transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
          }).promise;
          if (cancelled) break;
          container.appendChild(canvas);
        }

        if (cancelled) await doc.destroy();
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, reloadKey]);

  if (error) {
    return <div className="viewer-error">Failed to load PDF: {error}</div>;
  }
  return (
    <div className="pdf-viewer">
      <div className="pdf-pages" ref={containerRef} />
    </div>
  );
}
