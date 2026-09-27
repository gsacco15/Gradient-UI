// Render-loop and pointer hooks shared by the studio canvas, the home page hero and the share viewer.
import { useEffect, useRef, useState } from 'react';
import { GradientRenderer } from './renderer';

/**
 * Drives a WebGL canvas. Redraws when deps change or the canvas resizes, and every
 * frame only while `animating` — a still gradient costs nothing between edits.
 */
export function useRenderLoop(canvasRef: React.RefObject<HTMLCanvasElement | null>, draw: (r: GradientRenderer, t: number) => void, deps: unknown[], animating: boolean) {
  const rRef = useRef<GradientRenderer | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const dirty = useRef(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      rRef.current = new GradientRenderer(canvasRef.current);
      dirty.current = true;
    } catch (e) {
      setError((e as Error).message);
    }
  }, [canvasRef]);
  useEffect(() => {
    dirty.current = true;
    let raf = 0;
    const loop = (t: number) => {
      const r = rRef.current, c = canvasRef.current;
      if (r && c) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
        if (w !== c.width || h !== c.height) dirty.current = true;
        if (dirty.current || animating) {
          r.setSize(w, h);
          drawRef.current(r, t);
          dirty.current = false;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, animating]);
  return { renderer: rRef, error };
}

/**
 * Smoothed pointer position over an element, for cursor-reactive gradients.
 * `step()` eases towards the real pointer once per frame and fades presence in/out.
 */
export function usePointer(ref: React.RefObject<HTMLElement | null>) {
  const st = useRef({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, presence: 0, inside: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      st.current.tx = (e.clientX - r.left) / r.width;
      st.current.ty = (e.clientY - r.top) / r.height;
      st.current.inside = true;
    };
    const leave = () => void (st.current.inside = false);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [ref]);
  return {
    step() {
      const s = st.current;
      s.x += (s.tx - s.x) * 0.12;
      s.y += (s.ty - s.y) * 0.12;
      s.presence += ((s.inside ? 1 : 0) - s.presence) * 0.06;
      return { x: s.x, y: s.y, presence: s.presence };
    },
  };
}

/** True while the element is on screen, so off-screen animations can stop drawing. */
export function useOnScreen(ref: React.RefObject<Element | null>, margin = '0px') {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => setOn(e.some((x) => x.isIntersecting)), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return on;
}
