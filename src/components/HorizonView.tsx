// Horizon mode: scan a photo one pixel line at a time and turn it into a moving horizon.
import { useEffect, useRef, useState } from 'react';
import { download, slug } from '../lib/exportCode';
import { idbDel, idbGet } from '../lib/idb';
import { readImageFile } from '../lib/palette';
import { useStore } from '../store';
import type { Weather } from '../types';
import { GradientRenderer, grainScale } from '../render/renderer';
import { useRenderLoop } from './Canvas';
import { Field, Section, Seg, Slider } from './ui';

/** A procedurally drawn landscape so Horizon works before any upload. */
export function demoLandscape(): string {
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 800;
  const x = c.getContext('2d')!;
  const sky = x.createLinearGradient(0, 0, 1200, 0);
  sky.addColorStop(0, '#2C3E7A');
  sky.addColorStop(0.35, '#E89AB8');
  sky.addColorStop(0.55, '#F6B47A');
  sky.addColorStop(0.75, '#A9C8EC');
  sky.addColorStop(1, '#141B3A');
  x.fillStyle = sky;
  x.fillRect(0, 0, 1200, 800);
  const v = x.createLinearGradient(0, 0, 0, 800);
  v.addColorStop(0, 'rgba(11,16,38,.55)');
  v.addColorStop(0.5, 'rgba(255,255,255,0)');
  x.fillStyle = v;
  x.fillRect(0, 0, 1200, 800);
  const hills = ['#3B4A34', '#2F6B4F', '#1F3A2B'];
  hills.forEach((col, i) => {
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(0, 800);
    for (let px = 0; px <= 1200; px += 10) x.lineTo(px, 470 + i * 90 + Math.sin(px / (140 + i * 60) + i) * 60 + Math.sin(px / 37) * 8);
    x.lineTo(1200, 800);
    x.fill();
  });
  x.fillStyle = 'rgba(255,241,168,.9)';
  x.beginPath();
  x.arc(640, 420, 46, 0, Math.PI * 2);
  x.fill();
  return c.toDataURL('image/jpeg', 0.92);
}

/** Live scan position, shared with the inspector so a still captures exactly what's on screen. */
export const livePos = { value: 0 };
export const HORIZON_KEY = 'horizon-source';
export interface StoredSource {
  image: string;
  imageName: string;
  width: number;
  height: number;
}

export function HorizonView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const h = useStore((s) => s.horizon);
  const g = useStore((s) => s.gradient);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const posRef = useRef(h.pos);
  const lastT = useRef<number | null>(null);
  const uploaded = useRef<HTMLImageElement | null>(null);
  const exporting = useStore((s) => s.exportOpen);

  useEffect(() => {
    if (!h.image) {
      // Bring back the last photo you scanned; otherwise start from the demo landscape.
      let alive = true;
      idbGet<StoredSource>(HORIZON_KEY).then((saved) => {
        if (!alive || useStore.getState().horizon.image) return;
        if (saved?.image) useStore.getState().setHorizon({ ...saved, pos: 0 });
        else useStore.getState().setHorizon({ image: demoLandscape(), imageName: 'DEMO LANDSCAPE', width: 1200, height: 800 });
      });
      return () => {
        alive = false;
      };
    }
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = h.image;
  }, [h.image]);

  useEffect(() => {
    posRef.current = h.pos;
  }, [h.pos]);

  useRenderLoop(
    canvasRef,
    (r, t) => {
      if (img && uploaded.current !== img) {
        r.setImage(img);
        uploaded.current = img;
      }
      if (!r.hasImage) return;
      const s = useStore.getState().horizon;
      const span = s.dir === 'columns' ? s.width : s.height;
      if (s.playing && !useStore.getState().exportOpen && lastT.current !== null) {
        const dt = Math.min((t - lastT.current) / 1000, 0.1); // no jump after a pause
        posRef.current = (posRef.current + (dt * s.fps * s.step) / Math.max(1, span)) % 1;
      }
      livePos.value = posRef.current;
      lastT.current = t;
      r.render(useStore.getState().gradient, { scan: { pos: posRef.current, dir: s.dir }, pxScale: grainScale(r.canvas.width, r.canvas.height), seed: Math.floor(t / 80) % 16 });
    },
    [img, g, h.dir, h.pos],
    h.playing && !exporting,
  );

  // Sync the scrubber a few times a second without re-rendering every frame.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 120);
    return () => clearInterval(id);
  }, []);

  const span = h.dir === 'columns' ? h.width : h.height;
  const duration = span / h.step / h.fps;
  const cur = posRef.current * duration;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="horizon">
      <div className="canvas-wrap">
        <canvas ref={canvasRef} className="gl-canvas" />
        <div className="scan-source">
          {h.image && <img src={h.image} alt="" />}
          <div
            className={`scan-line ${h.dir}`}
            style={h.dir === 'columns' ? { left: `${posRef.current * 100}%` } : { top: `${posRef.current * 100}%` }}
          />
        </div>
        <div className="field-notes" aria-hidden>
          <div className="fn-top">
            <span>HORIZON · {h.imageName}</span>
            <span>
              {h.dir === 'columns' ? 'COLUMN' : 'ROW'} {Math.floor(posRef.current * span)} / {span}
            </span>
          </div>
          <div className="fn-bottom">
            <span>{g.name}</span>
            <span>
              {fmt(cur)} / {fmt(duration)}
            </span>
          </div>
        </div>
      </div>
      <div className="scrub">
        <button className="mini" onClick={() => useStore.getState().setHorizon({ playing: !h.playing, pos: posRef.current })}>
          {h.playing ? 'PAUSE' : 'PLAY'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.0005}
          value={posRef.current}
          style={{ '--p': `${posRef.current * 100}%` } as React.CSSProperties}
          onChange={(e) => {
            posRef.current = parseFloat(e.target.value);
            livePos.value = posRef.current;
            useStore.getState().setHorizon({ pos: posRef.current });
          }}
          aria-label="Scan position"
        />
        <span className="muted">{fmt(duration)}</span>
      </div>
    </div>
  );
}

const HW: { key: keyof Weather; label: string }[] = [
  { key: 'fog', label: 'FOG' },
  { key: 'haze', label: 'HAZE' },
  { key: 'frost', label: 'FROST' },
  { key: 'heat', label: 'HEAT' },
  { key: 'pixel', label: 'PIXEL' },
  { key: 'dusk', label: 'DUSK' },
];

export function HorizonInspector() {
  const h = useStore((s) => s.horizon);
  const g = useStore((s) => s.gradient);
  const file = useRef<HTMLInputElement>(null);
  const span = h.dir === 'columns' ? h.width : h.height;
  const duration = span / h.step / h.fps;

  const load = async (f?: File | null) => {
    if (!f) return;
    try {
      const r = await readImageFile(f, 4096);
      useStore.getState().setHorizon({ image: r.url, imageName: f.name.toUpperCase(), width: r.width, height: r.height, pos: 0 });
    } catch (e) {
      useStore.getState().notify((e as Error).message.toUpperCase());
    }
  };

  return (
    <div className="inspector">
      <div className="insp-title">
        <div className="name-input static">HORIZON</div>
        <p className="hint">Reads your image one pixel line at a time and turns its colours into a slowly moving horizon.</p>
      </div>
      <Section title="SOURCE">
        <button className="btn ghost wide" onClick={() => file.current?.click()}>
          CHOOSE IMAGE
        </button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => load(e.target.files?.[0])} />
        <p className="muted tiny">
          {h.imageName} · {h.width}×{h.height}
          {h.imageName !== 'DEMO LANDSCAPE' && ' · SAVED IN THIS BROWSER'}
        </p>
        {h.imageName !== 'DEMO LANDSCAPE' && (
          <button
            className="link"
            onClick={() => {
              idbDel(HORIZON_KEY);
              useStore.getState().setHorizon({ image: demoLandscape(), imageName: 'DEMO LANDSCAPE', width: 1200, height: 800, pos: 0 });
            }}
          >
            FORGET THIS PHOTO · USE THE DEMO
          </button>
        )}
      </Section>
      <Section title="SCAN">
        <Field label="DIRECTION">
          <Seg options={['columns', 'rows'] as const} value={h.dir} onChange={(dir) => useStore.getState().setHorizon({ dir, pos: 0 })} labels={{ columns: 'COLUMNS', rows: 'ROWS' }} />
        </Field>
        <Field label="FPS">
          <Seg options={['24', '30', '60'] as const} value={String(h.fps) as '24' | '30' | '60'} onChange={(v) => useStore.getState().setHorizon({ fps: parseInt(v, 10) as 24 | 30 | 60 })} />
        </Field>
        <label className="slider">
          <span className="slider-label">SPEED</span>
          <input
            type="range"
            min={0.25}
            max={8}
            step={0.25}
            value={h.step}
            style={{ '--p': `${((h.step - 0.25) / 7.75) * 100}%` } as React.CSSProperties}
            onChange={(e) => useStore.getState().setHorizon({ step: parseFloat(e.target.value) })}
          />
          <span className="slider-value">{h.step}PX</span>
        </label>
        <p className="muted tiny">
          {span} LINES ÷ {h.step}PX/FRAME ÷ {h.fps} FPS = ~{Math.round(duration)}S
        </p>
      </Section>
      <Section title="WEATHER LAYERS">
        {HW.map((w) => (
          <Slider key={w.key} label={w.label} value={g.weather[w.key]} onChange={(v) => useStore.getState().update((d) => void (d.weather[w.key] = v), false)} />
        ))}
      </Section>
      <StillSection />
      <button className="btn wide" onClick={() => useStore.getState().set({ exportOpen: true })}>
        EXPORT FILM
      </button>
    </div>
  );
}

const STILL_SIZES = [
  { id: 'source', label: 'PHOTO SIZE' },
  { id: '1080x1080', label: '1080²' },
  { id: '1080x1920', label: 'STORY' },
  { id: '1920x1080', label: 'HD' },
  { id: '3840x2160', label: '4K' },
] as const;

/** Freeze the horizon on the current frame and save it as a PNG. */
function StillSection() {
  const h = useStore((s) => s.horizon);
  const g = useStore((s) => s.gradient);
  const [size, setSize] = useState<(typeof STILL_SIZES)[number]['id']>('source');
  const [busy, setBusy] = useState(false);
  const [w, hh] = size === 'source' ? [h.width, h.height] : size.split('x').map(Number);

  const save = async () => {
    if (!h.image) return;
    setBusy(true);
    const pos = livePos.value;
    useStore.getState().setHorizon({ playing: false, pos });
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = h.image!;
      });
      const canvas = document.createElement('canvas');
      const r = new GradientRenderer(canvas, true);
      r.setSize(w, hh);
      r.setImage(img);
      r.render(g, { scan: { pos, dir: h.dir }, pxScale: grainScale(w, hh) });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
      if (!blob) throw new Error('PNG failed');
      const frame = Math.floor(pos * (h.dir === 'columns' ? h.width : h.height));
      download(`atmos-horizon-${slug(h.imageName)}-line-${frame}-${w}x${hh}.png`, blob);
      useStore.getState().notify(`STILL SAVED · LINE ${frame}`);
    } catch (e) {
      useStore.getState().notify(`STILL FAILED · ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="STILL">
      <p className="hint">Pause or scrub to the frame you like, then save it as an image.</p>
      <Field label="SIZE">
        <Seg options={STILL_SIZES.map((x) => x.id)} value={size} onChange={setSize} labels={Object.fromEntries(STILL_SIZES.map((x) => [x.id, x.label]))} />
      </Field>
      <p className="muted tiny">
        {w} × {hh} PX · PNG
      </p>
      <button className="btn ghost wide" onClick={save} disabled={busy || !h.image}>
        {busy ? 'SAVING…' : 'DOWNLOAD STILL'}
      </button>
    </Section>
  );
}
