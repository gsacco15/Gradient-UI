// The live canvas: WebGL render + draggable handles for mesh points, centres and angles.
import { useEffect, useMemo, useRef } from 'react';
import { gradientKey, MAX_POINTS, sortedStops, uid } from '../lib/gradient';
import { grainScale, renderPixels } from '../render/renderer';
import { luminance, rgbToHex } from '../lib/color';
import { nameForColor } from '../data/names';
import { useStore } from '../store';
import { cssBackground } from '../lib/exportCode';
import type { Gradient } from '../types';
import { usePointer, useRenderLoop } from '../render/loop';

export { usePointer, useRenderLoop };

export function GradientCanvas({ compare }: { compare: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gradient = useStore((s) => s.gradient);
  const baseline = useStore((s) => s.baseline);
  const playing = useStore((s) => s.playing);
  const showLabels = useStore((s) => s.showLabels);
  const exporting = useStore((s) => s.exportOpen);
  const lastPhase = useRef(0);
  const shown = compare ? baseline : gradient;
  const reactive = shown.interact.mode !== 'none';
  const pointer = usePointer(wrapRef);

  const { renderer, error } = useRenderLoop(
    canvasRef,
    (r, t) => {
      const g = compare ? baseline : gradient;
      let phase = lastPhase.current;
      if (g.motion.mode !== 'none' && playing) phase = ((t / 1000) / Math.max(1, g.motion.duration)) % 1;
      lastPhase.current = phase;
      r.render(g, { phase, pxScale: grainScale(r.canvas.width, r.canvas.height), seed: 0, mouse: reactive ? pointer.step() : undefined });
    },
    [gradient, baseline, compare, playing],
    ((shown.motion.mode !== 'none' && playing) || reactive) && !exporting,
  );

  // Sample the rendered colour under a point (for double-click to add).
  const sampleAt = (x: number, y: number): string => {
    const c = canvasRef.current;
    const r = renderer.current;
    if (!c || !r) return '#FFFFFF';
    const gl = c.getContext('webgl2')!;
    r.render(useStore.getState().gradient, { phase: lastPhase.current });
    const px = new Uint8Array(4);
    gl.readPixels(Math.round(x * c.width), Math.round((1 - y) * c.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return rgbToHex([px[0] / 255, px[1] / 255, px[2] / 255]);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const g = useStore.getState().gradient;
    if (g.points.length >= MAX_POINTS) return useStore.getState().notify(`MAX ${MAX_POINTS} COLOURS`);
    const rect = wrapRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
    const color = sampleAt(x, y);
    const id = uid('pt');
    const pos = rampPosAt(g, x, y);
    useStore.getState().update((d) => d.points.push({ id, color, x, y, pos, size: 0.35 }));
    useStore.getState().select(id);
  };

  return (
    <div className="canvas-wrap" ref={wrapRef} onDoubleClick={onDoubleClick}>
      <canvas ref={canvasRef} className="gl-canvas" aria-label={`${gradient.name} gradient preview`} />
      {error && (
        <div className="gl-error" style={{ background: cssBackground(shown) }}>
          <span>Live preview isn’t available in this browser, so this is a close CSS version.</span>
        </div>
      )}
      {!compare && <Handles wrapRef={wrapRef} />}
      {compare && <div className="compare-tag">BEFORE</div>}
      {showLabels && <FieldNotes g={compare ? baseline : gradient} />}
    </div>
  );
}


/** Approximate ramp position for a canvas point (used when adding colours by double-click). */
function rampPosAt(g: Gradient, x: number, y: number): number {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  if (g.type === 'linear') {
    const a = (g.angle * Math.PI) / 180;
    const dx = Math.sin(a), dy = -Math.cos(a);
    return clamp((x - 0.5) * dx + (y - 0.5) * dy + 0.5);
  }
  if (g.type === 'radial') return clamp(Math.hypot(x - g.center.x, y - g.center.y) / 0.7071);
  if (g.type === 'conic') return (((Math.atan2(x - g.center.x, -(y - g.center.y)) - (g.angle * Math.PI) / 180) / (Math.PI * 2)) % 1 + 1) % 1;
  if (g.type === 'frame') return clamp(1 - Math.max(Math.abs(x - g.center.x), Math.abs(y - g.center.y)) / 0.5);
  if (g.type === 'aperture') {
    const r = Math.max(Math.abs(x - g.center.x), Math.abs(y - g.center.y)) / 0.5 / Math.max(0.05, g.composition.size ?? 0.62);
    return r < 1 ? clamp(0.5 + 0.5 * (1 - r)) : 0;
  }
  if (g.type === 'bands') {
    const a = (g.angle * Math.PI) / 180;
    return clamp((x - 0.5) * Math.sin(a) - (y - 0.5) * Math.cos(a) + 0.5);
  }
  return 0.5;
}

/** Pick light or dark label ink for three regions of the canvas by sampling the render. */
function useLabelTones(g: Gradient) {
  const key = gradientKey(g);
  return useMemo(() => {
    const W = 24, H = 16;
    let px: Uint8ClampedArray;
    try {
      px = renderPixels(g, W, H);
    } catch {
      return { tl: LIGHT, tr: LIGHT, list: LIGHT, bl: LIGHT, br: LIGHT };
    }
    const tone = (x0: number, x1: number, y0: number, y1: number) => {
      let sum = 0, n = 0;
      for (let y = Math.floor(y0 * H); y < Math.ceil(y1 * H); y++)
        for (let x = Math.floor(x0 * W); x < Math.ceil(x1 * W); x++) {
          const i = (y * W + x) * 4;
          sum += luminance([px[i] / 255, px[i + 1] / 255, px[i + 2] / 255]);
          n++;
        }
      return sum / Math.max(1, n) > 0.42 ? DARK : LIGHT;
    };
    return { tl: tone(0, 0.4, 0, 0.1), tr: tone(0.6, 1, 0, 0.1), list: tone(0, 0.3, 0.3, 0.7), bl: tone(0, 0.4, 0.9, 1), br: tone(0.6, 1, 0.9, 1) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
const LIGHT = 'rgba(255,255,255,.88)';
const DARK = 'rgba(20,20,20,.72)';

function FieldNotes({ g }: { g: Gradient }) {
  const stops = g.type === 'mesh' ? g.points : sortedStops(g);
  const tones = useLabelTones(g);
  return (
    <div className="field-notes" aria-hidden>
      <div className="fn-top">
        <span style={{ color: tones.tl }}>{g.place}</span>
        <span style={{ color: tones.tr }}>{g.coords ?? ''}</span>
      </div>
      <div className="fn-list" style={{ color: tones.list }}>
        {stops.map((p) => (
          <div key={p.id} className="fn-item">
            <span className="fn-swatch" style={{ background: p.color, borderColor: tones.list }} />
            <span>{nameCache(p.color)}</span>
            <span>{p.color}</span>
          </div>
        ))}
      </div>
      <div className="fn-bottom">
        <span style={{ color: tones.bl }}>{g.name}</span>
        <span style={{ color: tones.br }}>{g.time}</span>
      </div>
    </div>
  );
}

const names = new Map<string, string>();
const nameCache = (hex: string) => {
  if (!names.has(hex)) names.set(hex, nameForColor(hex));
  return names.get(hex)!;
};

// ---------------------------------------------------------------- handles

type Drag =
  | { kind: 'point'; id: string }
  | { kind: 'center' }
  | { kind: 'angle' };

function Handles({ wrapRef }: { wrapRef: React.RefObject<HTMLDivElement | null> }) {
  const g = useStore((s) => s.gradient);
  const selected = useStore((s) => s.selected);
  const drag = useRef<Drag | null>(null);

  const rel = (e: PointerEvent | React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, w: r.width, h: r.height };
  };

  const start = (d: Drag) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    useStore.getState().checkpoint();
    drag.current = d;
    if (d.kind === 'point') useStore.getState().select(d.id);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !wrapRef.current) return;
      const p = rel(e);
      const cl = (v: number) => Math.min(1.1, Math.max(-0.1, v));
      const { update } = useStore.getState();
      if (d.kind === 'point') {
        update((g) => {
          const pt = g.points.find((q) => q.id === d.id);
          if (pt) { pt.x = cl(p.x); pt.y = cl(p.y); }
        }, false);
      } else if (d.kind === 'center') {
        update((g) => { g.center = { x: cl(p.x), y: cl(p.y) }; }, false);
      } else {
        update((g) => {
          const cx = g.type === 'linear' ? 0.5 : g.center.x, cy = g.type === 'linear' ? 0.5 : g.center.y;
          const ang = (Math.atan2((p.x - cx) * p.w, -(p.y - cy) * p.h) * 180) / Math.PI;
          g.angle = Math.round((ang + 360) % 360);
        }, false);
      }
    };
    const up = () => (drag.current = null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [wrapRef]);

  // Scroll a mesh point to resize it; Shift+scroll rotates linear/conic angle.
  const onWheel = (id: string) => (e: React.WheelEvent) => {
    e.stopPropagation();
    const { update } = useStore.getState();
    update((g) => {
      const pt = g.points.find((q) => q.id === id);
      if (pt) pt.size = Math.min(1, Math.max(0.05, pt.size * (e.deltaY > 0 ? 0.93 : 1.07)));
    }, false);
  };

  const showCenter = g.type === 'radial' || g.type === 'conic' || g.type === 'frame' || g.type === 'aperture' || g.type === 'halo';
  const showAngle = g.type === 'linear' || g.type === 'conic';
  const a = (g.angle * Math.PI) / 180;
  const cx = g.type === 'linear' ? 0.5 : g.center.x, cy = g.type === 'linear' ? 0.5 : g.center.y;

  return (
    <div className="handles">
      {g.type === 'mesh' &&
        g.points.map((p) => (
          <button
            key={p.id}
            className={`handle point ${selected === p.id ? 'sel' : ''}`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, background: p.color, '--ring': `${Math.round(p.size * 160)}px` } as React.CSSProperties}
            onPointerDown={start({ kind: 'point', id: p.id })}
            onWheel={onWheel(p.id)}
            onDoubleClick={(e) => e.stopPropagation()}
            title={`${p.color} — drag to move, scroll to resize`}
            aria-label={`Colour point ${p.color}`}
          >
            {selected === p.id && <span className="ring" />}
          </button>
        ))}
      {showCenter && (
        <button
          className="handle center"
          style={{ left: `${g.center.x * 100}%`, top: `${g.center.y * 100}%` }}
          onPointerDown={start({ kind: 'center' })}
          onDoubleClick={(e) => e.stopPropagation()}
          title="Drag to move the centre"
          aria-label="Gradient centre"
        />
      )}
      {showAngle && (
        <>
          <div className="angle-line" style={{ left: `${cx * 100}%`, top: `${cy * 100}%`, transform: `rotate(${g.angle}deg) translateY(-100%)` }} />
          <button
            className="handle angle"
            style={{ left: `calc(${cx * 100}% + ${Math.sin(a).toFixed(4)} * 30cqmin)`, top: `calc(${cy * 100}% - ${Math.cos(a).toFixed(4)} * 30cqmin)` }}
            onPointerDown={start({ kind: 'angle' })}
            onDoubleClick={(e) => e.stopPropagation()}
            title={`${g.angle}° — drag to rotate`}
            aria-label="Gradient angle"
          />
        </>
      )}
    </div>
  );
}

