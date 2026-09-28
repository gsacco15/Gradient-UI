// Lazily rendered gradient thumbnails (queued so a big gallery never blocks the page).
import { useEffect, useRef, useState } from 'react';
import { cssBackground } from '../lib/exportCode';
import { gradientKey } from '../lib/gradient';
import { renderDataURL } from '../render/renderer';
import type { Gradient } from '../types';

const queue: (() => void)[] = [];
let running = false;
function pump() {
  if (running) return;
  running = true;
  const step = () => {
    const start = performance.now();
    while (queue.length && performance.now() - start < 12) queue.shift()!();
    if (queue.length) setTimeout(step, 0);
    else running = false;
  };
  setTimeout(step, 0);
}

export function useThumb(g: Gradient, w: number, h: number, priority = false): string | null {
  const key = gradientKey(g);
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef(key);
  ref.current = key;
  useEffect(() => {
    let alive = true;
    const job = () => {
      if (!alive) return;
      try {
        setUrl(renderDataURL(g, w, h, key, { pxScale: 1 }));
      } catch {
        /* WebGL unavailable */
      }
    };
    if (priority) queue.unshift(job);
    else queue.push(job);
    pump();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, w, h]);
  return url;
}

export function Thumb({ g, w = 160, h = 200, className = '', priority = false }: { g: Gradient; w?: number; h?: number; className?: string; priority?: boolean }) {
  const url = useThumb(g, w, h, priority);
  // The CSS version sits underneath, so a thumbnail is never blank: it shows at once, and stays if WebGL is unavailable.
  const css = cssBackground(g).replace(/\s*\n\s*/g, ' ');
  return <div className={`thumb ${className}`} style={{ background: url ? `center / cover no-repeat url(${url}), ${css}` : css, aspectRatio: `${w} / ${h}` }} />;
}
