// LED Lab: preview a gradient as a wall-mounted LED light piece, size the build, and send it to real LEDs.
import { useEffect, useMemo, useRef, useState } from 'react';
import { COLLECTIONS } from '../data/collections';
import { cloneGradient } from '../lib/gradient';
import { download } from '../lib/exportCode';
import { adalight, buildLayout, DEFAULT_LED, FRAMES, fastLedSketch, inToMm, layoutJson, LED_TYPES, ledStats, mmToIn, sampleLeds, gridFor, wledStill, type Mount, type LedLayout, type LedSettings, type LedShape } from '../lib/led';
import { GradientRenderer, renderPixels } from '../render/renderer';
import { gradientFromHash } from '../lib/share';
import { blueprintHtml, blueprintSvg, templateHtml, templatePages, type BuildInfo, type Paper } from '../lib/blueprint';
import { linkTo } from '../router';
import { useStore } from '../store';
import type { Gradient } from '../types';
import '../landing/landing.css';
import './led.css';

type View = 'diffused' | 'leds' | 'split';
type Bezel = 'black' | 'white' | 'oak';
type BezelWidth = 'none' | 'thin' | 'standard';

const BEZELS: Record<Bezel, { face: string; edge: string }> = {
  black: { face: '#070707', edge: 'rgba(255,255,255,0.06)' },
  white: { face: '#f4f2ee', edge: 'rgba(0,0,0,0.18)' },
  oak: { face: '#b98d5c', edge: 'rgba(0,0,0,0.25)' },
};

interface Look {
  view: View;
  diffusion: number; // 0..1
  brightness: number; // 0.05..1
  gamma: number;
  room: 'dark' | 'light';
  wires: boolean;
  bezel: Bezel;
  bezelWidth: BezelWidth;
  playing: boolean;
  spill?: boolean; // light spilling onto the wall around the piece
}

/** The starting piece, for the Lab and the home page: a dense oval, no bezel, bare LEDs beside the diffused glow. */
const PIECE: LedSettings = { frameW: 18 * 25.4, frameH: 24 * 25.4, shape: 'oval', pitch: 1000 / 144, margin: 15, wiring: 'serpentine', start: 'top', mount: 'forward' };
const PIECE_LOOK: Look = { view: 'split', diffusion: 0.85, brightness: 1, gamma: 2.2, room: 'dark', wires: false, playing: false, spill: false, bezel: 'black', bezelWidth: 'none' };
const SETTINGS_KEY = 'atmos.led';
const load = (): { s: LedSettings; look: Look; source: string } => {
  const fallback = { s: { ...DEFAULT_LED, ...PIECE }, look: { ...PIECE_LOOK, playing: true }, source: 'studio' };
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    return v ? { s: { ...fallback.s, ...v.s }, look: { ...fallback.look, ...v.look }, source: v.source ?? 'studio' } : fallback;
  } catch {
    return fallback;
  }
};

const layoutCache = new Map<string, LedLayout>();
const layoutFor = (s: LedSettings) => {
  const key = JSON.stringify(s);
  let l = layoutCache.get(key);
  if (!l) {
    if (layoutCache.size > 8) layoutCache.clear();
    layoutCache.set(key, (l = buildLayout(s)));
  }
  return l;
};

/**
 * Any sky as an LED piece, set up exactly like the Lab (frame, LEDs, view, room, wall glow), so the
 * home page shows what the Lab will. Drawn when scrolled into view and when the sky, size or Lab settings change.
 */
export function LedPiece({ g, className }: { g: Gradient; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [seen, setSeen] = useState(false);
  const [lab, setLab] = useState(load);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: '300px' });
    io.observe(el);
    const refresh = () => setLab(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      io.disconnect();
      window.removeEventListener('storage', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!seen || !el) return;
    let raf = 0;
    const paint = () => {
      try {
        // Always the showcase oval; the light itself (LEDs, direction, view, room, glow, diffuser, brightness) follows the Lab.
        const piece: LedSettings = { ...lab.s, frameW: PIECE.frameW, frameH: PIECE.frameH, shape: PIECE.shape, margin: PIECE.margin };
        const look: Look = { ...lab.look, bezelWidth: 'none' };
        const layout = layoutFor(piece);
        const rgba = renderPixels(forLeds(g), layout.cols, layout.rows);
        draw(el, document.createElement('canvas'), { layout, s: piece, look }, sampleLeds(layout, rgba, look.brightness, 1).screen);
      } catch {
        /* no WebGL: the card's own background shows instead */
      }
    };
    paint();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [g, seen, lab]);
  const light = lab.look.room === 'light';
  return (
    <>
      <canvas ref={ref} className={className} aria-hidden />
      {lab.look.view === 'split' ? (
        <>
          <span className={`l-lab-cap l-lab-cap-l ${light ? 'ink' : ''}`}>BARE LEDS</span>
          <span className={`l-lab-cap l-lab-cap-r ${light ? 'ink' : ''}`}>DIFFUSED</span>
        </>
      ) : (
        <span className={`l-lab-cap l-lab-cap-l ${light ? 'ink' : ''}`}>{lab.look.view === 'leds' ? 'BARE LEDS' : 'DIFFUSED'}</span>
      )}
    </>
  );
}

/** LEDs can't show film grain or dither, and nobody hovers over a wall piece. */
function forLeds(src: Gradient): Gradient {
  const g = cloneGradient(src, false);
  g.weather = { ...g.weather, haze: 0, frost: 0, pixel: 0 };
  g.interact = { mode: 'none', strength: 0 };
  return g;
}

export default function LedLab() {
  const initial = useMemo(load, []);
  // A sky handed over from the home page ("Open the Lab"), carried in the link.
  const [linked] = useState(() => gradientFromHash(location.hash));
  useEffect(() => {
    if (linked) history.replaceState(null, '', '/led');
  }, [linked]);
  // Arriving from the home page's light piece: show it in the same oval. Otherwise keep your own frame.
  const [s, setS] = useState<LedSettings>(linked ? { ...initial.s, frameW: PIECE.frameW, frameH: PIECE.frameH, shape: PIECE.shape, margin: PIECE.margin } : initial.s);
  const [look, setLook] = useState<Look>(linked ? { ...initial.look, bezelWidth: 'none' } : initial.look);
  const [source, setSource] = useState(linked ? 'linked' : initial.source);
  const studio = useStore((st) => st.gradient);
  const src = useMemo(
    () => (source === 'linked' && linked ? linked : source === 'studio' ? studio : COLLECTIONS.flatMap((c) => c.gradients).find((g) => g.name === source) ?? studio),
    [source, studio, linked],
  );
  const g = useMemo(() => forLeds(src), [src]);
  const layout = useMemo(() => buildLayout(s), [s]);
  const stats = useMemo(() => ledStats(layout, s, look.brightness), [layout, s, look.brightness]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ s, look, source }));
    } catch {
      /* private mode */
    }
  }, [s, look, source]);

  // Bounce needs room behind the LEDs for the light to reach the back panel and come back.
  const boxDepth = diffuserMm(s.pitch, look.diffusion) + (s.mount === 'bounce' ? 10 + s.pitch * 0.6 : 10);
  const set = (p: Partial<LedSettings>) => setS((o) => ({ ...o, ...p }));
  const frameId = FRAMES.find((f) => Math.abs(f.w - s.frameW) < 0.5 && Math.abs(f.h - s.frameH) < 0.5)?.id ?? 'custom';
  const typeId = LED_TYPES.find((t) => Math.abs(t.pitch - s.pitch) < 0.01)?.id ?? 'custom';

  const serial = useSerial();
  const glow = useMemo(() => [...src.points].sort((a, b) => a.pos - b.pos)[Math.floor(src.points.length / 2)]?.color ?? '#e0679a', [src]);
  const engine = useLedEngine(g, layout, s, look, serial.send);
  const [stillNote, setStillNote] = useState<string | null>(null);
  const [paper, setPaper] = useState<Paper>(() => (/^en-US|^en-CA|^es-MX/.test(navigator.language) ? 'letter' : 'a4'));
  const build = (): BuildInfo => ({
    name: src.name,
    place: src.place,
    s,
    layout,
    stats,
    diffuserMm: diffuserMm(s.pitch, look.diffusion),
    boxDepth,
    ledLabel: LED_TYPES.find((t) => Math.abs(t.pitch - s.pitch) < 0.01)?.label ?? `Custom · ${s.pitch.toFixed(1)} mm spacing`,
  });
  const pageCount = useMemo(() => {
    const t = templatePages({ s, layout } as BuildInfo, paper);
    return t.cols * t.rows;
  }, [s, layout, paper]);
  const openBlueprint = (b: BuildInfo) => {
    const file = `atmos-${slug(b.name)}-blueprint.svg`;
    openDoc(blueprintHtml(b, blueprintSvg(b), file), file.replace('.svg', '.html'));
  };
  const copyStill = async () => {
    const json = engine.stillJson(src.name);
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setStillNote('Copied. Paste it into a WLED preset (steps below).');
    } catch {
      download(`atmos-${slug(src.name)}-wled-still.json`, json, 'application/json');
      setStillNote('Downloaded. Open the file, copy everything, and paste it into a WLED preset (steps below).');
    }
  };

  return (
    <div className="landing led">
      <nav className="l-nav">
        <a className="l-logo" {...linkTo('/')}>
          Atmos<span>[ lab ]</span>
        </a>
        <div className="l-links" />
        <div className="l-actions">
          <span className="led-exp">Experimental</span>
          <a className="l-pill dark" {...linkTo('/studio')}>
            Open studio
          </a>
        </div>
      </nav>

      <div className="led-grid">
        <section className={`led-stage room-${look.room}`}>
          <canvas ref={engine.canvas} className="led-canvas" aria-label={`${g.name} on ${stats.count} LEDs`} />
          <div className="led-stage-top">
            <span>
              {g.name} · {g.place}
            </span>
            <span>
              {mmToIn(s.frameW).toFixed(1)} × {mmToIn(s.frameH).toFixed(1)} in · {stats.count} LEDs
            </span>
          </div>
          <div className="led-stage-bar">
            <Seg value={look.view} onChange={(view) => setLook({ ...look, view })} options={[['diffused', 'Diffused'], ['leds', 'Bare LEDs'], ['split', 'Split']]} />
            <Seg value={look.room} onChange={(room) => setLook({ ...look, room })} options={[['dark', 'Dark room'], ['light', 'Daylight']]} />
            <button className={`led-chip ${look.spill !== false ? 'on' : ''}`} onClick={() => setLook({ ...look, spill: look.spill === false })} aria-pressed={look.spill !== false} title="Light spilling onto the wall around the piece">
              Wall glow {look.spill !== false ? 'on' : 'off'}
            </button>
            {g.motion.mode !== 'none' && (
              <button className="led-chip" onClick={() => setLook({ ...look, playing: !look.playing })}>
                {look.playing ? 'Pause' : 'Play'}
              </button>
            )}
          </div>
        </section>

        <aside className="led-panel">
          <Group title="Sky">
            <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Gradient">
              {linked && <option value="linked">From the home page · {linked.name}</option>}
              <option value="studio">Your studio sky · {studio.name}</option>
              {COLLECTIONS.map((c) => (
                <optgroup key={c.id} label={c.title}>
                  {c.gradients.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Group>

          <Group title="Frame">
            <button
              className="led-reset"
              onClick={() => {
                setS({ ...DEFAULT_LED, ...PIECE });
                setLook({ ...PIECE_LOOK, playing: true });
              }}
              title="Back to the starting piece: 18 × 24 in oval, 144 LEDs/m, split view, no bezel"
            >
              Reset to default
            </button>
            <select
              value={frameId}
              onChange={(e) => {
                const f = FRAMES.find((x) => x.id === e.target.value);
                if (f) set({ frameW: f.w, frameH: f.h });
              }}
              aria-label="Frame size"
            >
              {FRAMES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
            <div className="led-two">
              <Num label="Width (in)" value={mmToIn(s.frameW)} onChange={(v) => set({ frameW: inToMm(v) })} min={3} max={96} />
              <Num label="Height (in)" value={mmToIn(s.frameH)} onChange={(v) => set({ frameH: inToMm(v) })} min={3} max={96} />
            </div>
            <Seg value={look.bezelWidth} onChange={(bezelWidth) => setLook({ ...look, bezelWidth })} options={[['standard', 'Full frame'], ['thin', 'Thin bezel'], ['none', 'No bezel']]} />
            {look.bezelWidth !== 'none' && <Seg value={look.bezel} onChange={(bezel) => setLook({ ...look, bezel })} options={[['black', 'Black'], ['white', 'White'], ['oak', 'Oak']]} />}
            <Seg value={s.shape} onChange={(shape: LedShape) => set({ shape })} options={[['rect', s.frameW === s.frameH ? 'Square' : 'Rectangle'], ['circle', 'Circle'], ['oval', 'Oval']]} />
          </Group>

          <Group title="LEDs">
            <select
              value={typeId}
              onChange={(e) => {
                const t = LED_TYPES.find((x) => x.id === e.target.value);
                if (t) set({ pitch: t.pitch });
              }}
              aria-label="LED type"
            >
              {LED_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
              <option value="custom">Custom spacing</option>
            </select>
            <div className="led-two">
              <Num label="Spacing (mm)" value={s.pitch} onChange={(pitch) => set({ pitch })} min={4} max={100} step={0.5} />
              <Num label="Edge gap (mm)" value={s.margin} onChange={(margin) => set({ margin })} min={0} max={100} step={1} />
            </div>
          </Group>

          <Group title="LED direction">
            <Seg value={s.mount ?? 'forward'} onChange={(mount) => set({ mount })} options={[['forward', 'Forward'], ['bounce', 'Bounce'], ['edge', 'Edge']]} />
            <MountDiagram mount={s.mount ?? 'forward'} glow={glow} />
            <p className="led-hint">{MOUNT_NOTES[s.mount ?? 'forward']}</p>
          </Group>

          <Group title="Diffuser">
            <Slider label="Distance from LEDs" value={look.diffusion} onChange={(diffusion) => setLook({ ...look, diffusion })} min={0} max={1} step={0.01} show={`${Math.round(diffuserMm(s.pitch, look.diffusion))} mm · ${diffuserLook(look.diffusion, s.mount)}`} />
            <p className="led-hint">
              {s.mount === 'edge'
                ? 'How deep the box is in front of the strip. Deeper boxes let the edge light reach further into the middle.'
                : s.mount === 'bounce'
                  ? 'How far the frosted sheet sits in front of the LEDs. The bounce off the back doubles the light’s path, so even a shallow box looks seamless.'
                  : 'How far the frosted sheet sits in front of the LEDs. Too close and you see each LED as a bright spot; about 1.5× the LED spacing and it melts into one smooth glow.'}
            </p>
          </Group>

          <Group title="Wiring">
            {s.mount !== 'edge' && <Seg value={s.wiring} onChange={(wiring) => set({ wiring })} options={[['serpentine', 'Zigzag'], ['rows', 'Same direction']]} />}
            <Seg value={s.start} onChange={(start) => set({ start })} options={[['top', 'Data in top left'], ['bottom', 'Bottom left']]} />
            <label className="led-check">
              <input type="checkbox" checked={look.wires} onChange={(e) => setLook({ ...look, wires: e.target.checked })} /> Show the wiring path
            </label>
          </Group>

          <Group title="Output">
            <Slider label="Brightness" value={look.brightness} onChange={(brightness) => setLook({ ...look, brightness })} min={0.05} max={1} step={0.01} show={`${Math.round(look.brightness * 100)}%`} />
            <Slider label="Gamma" value={look.gamma} onChange={(gamma) => setLook({ ...look, gamma })} min={1} max={3} step={0.1} show={look.gamma.toFixed(1)} />
            <p className="led-hint">LEDs make dark shades look much brighter than a screen does, so skies look washed out. Gamma corrects that. 2.2 matches most screens; go higher if the dark parts still look pale on the wall. Only changes what's sent to the LEDs.</p>
          </Group>

          <Group title="Build sheet">
            <dl className="led-stats">
              <Stat k="LEDs" v={stats.count.toLocaleString()} />
              <Stat k="Grid" v={`${layout.cols} × ${layout.rows}`} />
              <Stat k="Strip pieces" v={s.mount === 'edge' ? '1 loop' : `${layout.runs} rows`} />
              <Stat k="Strip to buy" v={`${stats.stripMeters} m`} />
              <Stat k="Power, typical" v={`${(stats.typicalAmps * 5).toFixed(0)} W`} />
              <Stat k="Power supply" v={stats.psu} />
              <Stat k="Max refresh" v={`${stats.maxFps} fps`} />
              <Stat k="Box depth" v={`${Math.round(boxDepth)} mm · ${mmToIn(boxDepth).toFixed(1)} in`} />
            </dl>
            <p className="led-hint">
              Numbers assume 5 V WS2812B-style LEDs. Inject power every ~150 LEDs so the far end doesn't fade. {stats.count > 800 ? 'Over ~800 LEDs is a lot for one WLED controller: use 30 LEDs/m or split across two controllers.' : ''}
            </p>
          </Group>

          <Group title="Build it">
            <div className="led-actions">
              <button className="l-pill dark led-bp" onClick={() => openBlueprint(build())}>
                Blueprint
              </button>
              <button className="l-pill ghost" onClick={() => openDoc(templateHtml(build(), paper), `atmos-${slug(src.name)}-template.html`)}>
                Placement template · 1:1
              </button>
            </div>
            <Seg value={paper} onChange={setPaper} options={[['letter', 'US Letter'], ['a4', 'A4']]} />
            <p className="led-hint">
              <strong>Blueprint</strong>: one sheet with the dimensions, LED layout and data path, a side section with the depth, the wiring and a parts list. <strong>Template</strong>: every LED at real size across {pageCount} printable page{pageCount === 1 ? '' : 's'} plus a cover; tape it to the back panel and stick the strips on the lines.
            </p>
          </Group>

          <Group title="Send to LEDs">
            <div className="led-actions">
              {serial.supported ? (
                <button className={`l-pill ${serial.connected ? 'ghost' : 'dark'}`} onClick={serial.connected ? serial.disconnect : serial.connect}>
                  {serial.connected ? 'Disconnect USB' : 'Stream over USB'}
                </button>
              ) : (
                <button className="l-pill ghost" disabled title="Web Serial needs Chrome or Edge on a computer">
                  Stream over USB (Chrome)
                </button>
              )}
              <button className="l-pill ghost" onClick={() => engine.exportSketch(src.name)} disabled={engine.exporting}>
                {engine.exporting ? 'Rendering…' : 'Arduino sketch'}
              </button>
              <button className="l-pill ghost" onClick={copyStill}>
                Copy WLED still
              </button>
              <button className="l-pill ghost" onClick={() => download(`atmos-${slug(src.name)}-led-map.json`, layoutJson(layout, s, src.name), 'application/json')}>
                LED map (JSON)
              </button>
            </div>
            {serial.status && <p className="led-hint strong">{serial.status}</p>}
            {stillNote && <p className="led-hint strong">{stillNote}</p>}
            <p className="led-hint">
              USB streaming sends Adalight frames at 115200 baud, which WLED and most LED boards understand. The Arduino sketch plays this sky on its own with FastLED, no computer needed.
            </p>
            <p className="led-hint">
              <strong>WLED still</strong> is this exact picture, frozen, with every LED its own colour (the moment on screen; pause first to pick it). In WLED: set up the LEDs as one plain strip of {stats.count} (no 2D matrix, so the order matches the wiring here), then Presets → + Preset → untick “Use current state” → paste into the API command box → Save.
            </p>
          </Group>
        </aside>
      </div>

      <footer className="l-foot">
        <span>ATMOS [ LAB ] · LIGHT PIECES FROM YOUR SKIES</span>
        <span className="led-foot-links">
          <a {...linkTo('/')}>HOME</a>
          <a {...linkTo('/studio')}>STUDIO</a>
          <a {...linkTo('/#community')}>COMMUNITY</a>
        </span>
        <span>PREVIEWS ARE CLOSE APPROXIMATIONS OF REAL LEDS</span>
      </footer>
    </div>
  );
}

/** Diffuser distance in mm for the slider (0..1): from 0.3× to 2.2× the LED spacing. */
const diffuserMm = (pitch: number, d: number) => pitch * (0.3 + 1.9 * d);
/** How far the light spreads before the diffuser, in LED spacings. */
const spreadRatio = (mount: Mount | undefined, d: number) => {
  const r = diffuserMm(1, d);
  return mount === 'bounce' ? r * 2 + 0.8 : mount === 'edge' ? 0.6 + r * 0.6 : r;
};
const diffuserLook = (d: number, mount?: Mount) => {
  if (mount === 'edge') return 'wash';
  const r = spreadRatio(mount, d);
  return r < 0.9 ? 'spotty' : r < 1.4 ? 'soft' : 'seamless';
};

/**
 * Edge lighting: the strip around the rim shines across a white-lined box, so every point inside
 * gets a blend of the nearby rim LEDs, dimming a little toward the middle.
 */
function edgeField(layout: LedLayout, s: LedSettings, rgb: Uint8Array, out: Uint8ClampedArray, gcols: number, grows: number) {
  const { pitch, x0, y0 } = gridFor(s);
  const half = Math.min(s.frameW, s.frameH) / 2;
  const soft = (pitch * 2) ** 2;
  for (let r = 0, p = 0; r < grows; r++) {
    const y = y0 + (r - FILL_PAD) * pitch;
    for (let c = 0; c < gcols; c++, p += 4) {
      const x = x0 + (c - FILL_PAD) * pitch;
      let R = 0, G = 0, B = 0, W = 0, dmin = Infinity;
      for (const l of layout.leds) {
        const d2 = (l.x - x) ** 2 + (l.y - y) ** 2;
        const w = 1 / (d2 + soft);
        R += rgb[l.i * 3] * w;
        G += rgb[l.i * 3 + 1] * w;
        B += rgb[l.i * 3 + 2] * w;
        W += w;
        if (d2 < dmin) dmin = d2;
      }
      const lum = W ? 1 - 0.35 * Math.min(1, Math.sqrt(dmin) / half) : 0;
      out[p] = W ? (R / W) * lum : 0;
      out[p + 1] = W ? (G / W) * lum : 0;
      out[p + 2] = W ? (B / W) * lum : 0;
      out[p + 3] = 255;
    }
  }
}

/** Open a generated document in a new tab; if pop-ups are blocked, download it instead. */
function openDoc(html: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) download(fileName, html, 'text/html');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Renders the sky at one pixel per LED every frame, draws the preview, and hands frames to the serial port. */
function useLedEngine(g: Gradient, layout: LedLayout, s: LedSettings, look: Look, send: (rgb: Uint8Array) => void) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ g, layout, s, look, send });
  state.current = { g, layout, s, look, send };
  const [exporting, setExporting] = useState(false);
  const tools = useRef<{ r: GradientRenderer; read: CanvasRenderingContext2D; grid: HTMLCanvasElement } | null>(null);
  const phase = useRef(0);

  const sampleAt = (p: number, raw = false) => {
    const { g, layout, look } = state.current;
    const t = tools.current!;
    t.r.setSize(layout.cols, layout.rows);
    t.r.render(g, { phase: p, pxScale: 1, seed: 0 });
    t.read.canvas.width = layout.cols;
    t.read.canvas.height = layout.rows;
    t.read.drawImage(t.r.canvas, 0, 0);
    const rgba = t.read.getImageData(0, 0, layout.cols, layout.rows).data;
    return raw ? sampleLeds(layout, rgba, 1, 1) : sampleLeds(layout, rgba, look.brightness, look.gamma);
  };

  /** The moment on screen as a WLED preset command. WLED does its own gamma, so colours go as designed. */
  const stillJson = (name: string) => {
    if (!tools.current) return null;
    const { layout, look } = state.current;
    return wledStill(sampleAt(phase.current, true).screen, layout.leds.length, look.brightness, name);
  };

  useEffect(() => {
    try {
      const read = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      tools.current = { r: new GradientRenderer(document.createElement('canvas'), true), read, grid: document.createElement('canvas') };
    } catch {
      return;
    }
    let raf = 0, last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const { g, look } = state.current;
      const dt = last ? (t - last) / 1000 : 0;
      last = t;
      if (g.motion.mode !== 'none' && look.playing) phase.current = (phase.current + dt / Math.max(1, g.motion.duration)) % 1;
      const frame = sampleAt(phase.current);
      state.current.send(frame.drive);
      draw(canvas.current, tools.current!.grid, state.current, frame.screen);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportSketch = async (name: string) => {
    if (!tools.current) return;
    setExporting(true);
    await new Promise((r) => setTimeout(r, 30));
    const { g, layout } = state.current;
    const count = layout.leds.length;
    // Keep the whole loop under ~1.5 MB so it fits in an ESP32's flash.
    const fps = 20;
    const want = g.motion.mode === 'none' ? 1 : Math.round(g.motion.duration * fps);
    const frames = Math.max(1, Math.min(want, Math.floor(1_500_000 / Math.max(1, count * 3))));
    const out: Uint8Array[] = [];
    for (let f = 0; f < frames; f++) out.push(sampleAt(f / frames).drive);
    const realFps = g.motion.mode === 'none' ? 1 : Math.max(1, Math.round(frames / g.motion.duration));
    download(`atmos-${slug(name)}-leds.ino`, fastLedSketch(out, count, realFps, name));
    setExporting(false);
  };

  return { canvas, exporting, exportSketch, stillJson };
}

/** Draw the wall, the frame, and the lit piece (bare LEDs, diffused, or both side by side). */
function draw(c: HTMLCanvasElement | null, grid: HTMLCanvasElement, st: { layout: LedLayout; s: LedSettings; look: Look }, rgb: Uint8Array) {
  if (!c) return;
  const { layout, s, look } = st;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(c.clientWidth * dpr), H = Math.round(c.clientHeight * dpr);
  if (!W || !H) return;
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  const ctx = c.getContext('2d')!;
  const dark = look.room === 'dark';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = dark ? '#0e0d0c' : '#e9e6df';
  ctx.fillRect(0, 0, W, H);

  // mm → px, with room around the frame for the light it throws on the wall.
  const standard = Math.max(12, Math.min(s.frameW, s.frameH) * 0.05);
  const border = look.bezelWidth === 'none' ? 0 : look.bezelWidth === 'thin' ? Math.max(4, standard * 0.3) : standard;
  const k = Math.min((W * 0.72) / (s.frameW + 2 * standard), (H * 0.72) / (s.frameH + 2 * standard));
  const ox = (W - s.frameW * k) / 2, oy = (H - s.frameH * k) / 2;

  // One pixel per grid cell, padded, with empty cells taking their nearest LED's colour: the
  // diffuser box's white walls bounce light into the gaps rather than leaving them black.
  const P = FILL_PAD;
  const mount = s.mount ?? 'forward';
  const gcols = layout.cols + 2 * P, grows = layout.rows + 2 * P;
  grid.width = gcols;
  grid.height = grows;
  const gctx = grid.getContext('2d')!;
  const img = gctx.createImageData(gcols, grows);
  if (mount === 'edge') edgeField(layout, s, rgb, img.data, gcols, grows);
  const near = mount === 'edge' ? new Int32Array(0) : nearestLed(layout);
  for (let c = 0, p = 0; c < near.length; c++, p += 4) {
    const i = near[c];
    if (i < 0) continue;
    img.data[p] = rgb[i * 3];
    img.data[p + 1] = rgb[i * 3 + 1];
    img.data[p + 2] = rgb[i * 3 + 2];
    img.data[p + 3] = 255;
  }
  gctx.putImageData(img, 0, 0);

  const pitch = s.pitch;
  const gx = ox + (s.frameW - (layout.cols - 1) * pitch) / 2 * k - (pitch * k) / 2 - P * pitch * k;
  const gy = oy + (s.frameH - (layout.rows - 1) * pitch) / 2 * k - (pitch * k) / 2 - P * pitch * k;
  const gw = gcols * pitch * k, gh = grows * pitch * k;

  const shapePath = (inset: number) => {
    const p = new Path2D();
    const x = ox + inset * k, y = oy + inset * k, w = (s.frameW - 2 * inset) * k, h = (s.frameH - 2 * inset) * k;
    if (s.shape === 'rect') p.rect(x, y, w, h);
    else {
      const rx = s.shape === 'circle' ? Math.min(w, h) / 2 : w / 2, ry = s.shape === 'circle' ? Math.min(w, h) / 2 : h / 2;
      p.ellipse(x + w / 2, y + h / 2, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    }
    return p;
  };

  const diffusedAny = look.view !== 'leds';
  // Light spilling onto the wall: soft pools around the rim, each the colour of the LEDs beside it.
  // Plain radial gradients, so it looks the same in every browser (no canvas blur needed).
  if (diffusedAny && look.spill !== false && layout.leds.length) {
    const fw = s.frameW * k, fh = s.frameH * k, cx = ox + fw / 2, cy = oy + fh / 2;
    const rx = s.shape === 'circle' ? Math.min(fw, fh) / 2 : fw / 2, ry = s.shape === 'circle' ? Math.min(fw, fh) / 2 : fh / 2;
    const { pitch: gp, x0, y0 } = gridFor(s);
    const near = nearestLed(layout), gcols2 = layout.cols + 2 * FILL_PAD;
    const reach = Math.min(fw, fh) * 0.42;
    const n = 36;
    ctx.save();
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2, dx = Math.cos(t), dy = Math.sin(t);
      // Where this direction meets the edge of the lit shape.
      const d = s.shape === 'rect' ? Math.min(rx / Math.max(Math.abs(dx), 1e-6), ry / Math.max(Math.abs(dy), 1e-6)) : 1;
      const px = s.shape === 'rect' ? cx + dx * d : cx + rx * dx, py = s.shape === 'rect' ? cy + dy * d : cy + ry * dy;
      // Colour of the LEDs just inside that point.
      const mmx = (cx + (px - cx) * 0.85 - ox) / k, mmy = (cy + (py - cy) * 0.85 - oy) / k;
      const col = Math.min(layout.cols - 1, Math.max(0, Math.round((mmx - x0) / gp)));
      const row = Math.min(layout.rows - 1, Math.max(0, Math.round((mmy - y0) / gp)));
      const li = near[(row + FILL_PAD) * gcols2 + col + FILL_PAD];
      if (li < 0) continue;
      const [r, gg, b] = [rgb[li * 3], rgb[li * 3 + 1], rgb[li * 3 + 2]];
      const glow = ctx.createRadialGradient(px, py, 0, px, py, reach);
      glow.addColorStop(0, `rgba(${r},${gg},${b},${dark ? 0.16 : 0.07})`);
      glow.addColorStop(0.5, `rgba(${r},${gg},${b},${dark ? 0.06 : 0.025})`);
      glow.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(px - reach, py - reach, reach * 2, reach * 2);
    }
    ctx.restore();
  }

  // Frame, following the shape. With no bezel, the lightbox floats with just its shadow.
  const inner = shapePath(0);
  const outer = border ? shapePath(-border) : inner;
  const bezel = BEZELS[look.bezel] ?? BEZELS.black;
  ctx.save();
  ctx.shadowColor = dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = standard * k * 0.6;
  ctx.shadowOffsetY = standard * k * 0.15;
  ctx.fillStyle = border ? bezel.face : '#030303';
  ctx.fill(outer);
  ctx.restore();
  if (border) {
    ctx.strokeStyle = bezel.edge;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.stroke(outer);
  }
  ctx.fillStyle = '#030303';
  ctx.fill(inner);

  const drawDiffused = () => {
    ctx.save();
    ctx.clip(inner);
    ctx.imageSmoothingEnabled = true;
    // Further from the LEDs, the light spreads wider and each LED's hot spot fades out.
    // Bouncing off the back roughly doubles the path and hides the LEDs; edge light is already a wash.
    const ratio = spreadRatio(mount, look.diffusion);
    blurDraw(ctx, grid, gx, gy, gw, gh, Math.max(0.5, pitch * k * ratio * 0.7));
    if (mount === 'bounce') {
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; // a little light lost in the bounce
      ctx.fill(inner);
    }
    const hot = mount === 'forward' ? Math.min(1, Math.max(0, (1.4 - ratio) / 1.1)) : 0;
    if (hot > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const rad = pitch * k * (0.3 + 0.35 * ratio);
      for (const l of layout.leds) {
        const x = ox + l.x * k, y = oy + l.y * k;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, rad);
        glow.addColorStop(0, `rgba(${rgb[l.i * 3]},${rgb[l.i * 3 + 1]},${rgb[l.i * 3 + 2]},${(0.85 * hot).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // A faint sheen on the diffuser surface.
    const sheen = ctx.createLinearGradient(ox, oy, ox + s.frameW * k, oy + s.frameH * k);
    sheen.addColorStop(0, 'rgba(255,255,255,0.05)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fill(inner);
    ctx.restore();
  };

  const drawBare = () => {
    ctx.save();
    ctx.clip(inner);
    const r = Math.max(0.8, pitch * k * 0.2);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of layout.leds) {
      const x = ox + l.x * k, y = oy + l.y * k;
      const col = `rgb(${rgb[l.i * 3]},${rgb[l.i * 3 + 1]},${rgb[l.i * 3 + 2]})`;
      if (r > 2.5) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        glow.addColorStop(0, col);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = glow;
        ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  if (look.view === 'diffused') drawDiffused();
  else if (look.view === 'leds') drawBare();
  else {
    const mid = ox + (s.frameW * k) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, mid, H);
    ctx.clip();
    drawBare();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(mid, 0, W - mid, H);
    ctx.clip();
    drawDiffused();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(mid, oy - border * k);
    ctx.lineTo(mid, oy + (s.frameH + border) * k);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (look.wires && layout.leds.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    layout.leds.forEach((l, i) => (i ? ctx.lineTo(ox + l.x * k, oy + l.y * k) : ctx.moveTo(ox + l.x * k, oy + l.y * k)));
    ctx.stroke();
    const a = layout.leds[0], z = layout.leds[layout.leds.length - 1];
    ctx.fillStyle = '#3df58a';
    ctx.beginPath();
    ctx.arc(ox + a.x * k, oy + a.y * k, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath();
    ctx.arc(ox + z.x * k, oy + z.y * k, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)';
    ctx.fillText('DATA IN', ox + a.x * k - 20 * dpr, oy - border * k - 8 * dpr);
    ctx.restore();
  }
}

const MOUNT_NOTES: Record<Mount, string> = {
  forward: 'LEDs point straight at the diffuser. Sharpest picture; needs the most depth to hide the dots.',
  bounce: 'LEDs point backward at a matte white back panel, and the diffuser only sees reflected light. Smoothest glow in a shallow box, slightly softer picture, about 10–20% dimmer.',
  edge: 'One strip around the inside edge, shining inward across a white-lined box. Very few LEDs and an even Turrell-style wash, but only the edge colours can be controlled, so the middle is a blend.',
};

const scratchCanvases = new Map<string, HTMLCanvasElement>();
const scratch = (name: string) => {
  let c = scratchCanvases.get(name);
  if (!c) scratchCanvases.set(name, (c = document.createElement('canvas')));
  return c;
};

/** Canvas blur isn't in every browser (iPhone Safari has lacked it), so check once. */
let canFilter: boolean | null = null;
const hasCanvasFilter = () =>
  (canFilter ??= !(window as unknown as { __atmosNoCanvasFilter?: boolean }).__atmosNoCanvasFilter && typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype);

/**
 * Draw an image blurred by about r pixels. Uses the canvas blur filter where it exists; otherwise
 * shrinks the image (with a clear border so edges fade out too) and lets smooth upscaling blur it.
 */
function blurDraw(ctx: CanvasRenderingContext2D, src: CanvasImageSource, x: number, y: number, w: number, h: number, r: number) {
  ctx.imageSmoothingEnabled = true;
  if (r < 0.75) return void ctx.drawImage(src, x, y, w, h);
  if (hasCanvasFilter()) {
    ctx.filter = `blur(${r.toFixed(1)}px)`;
    ctx.drawImage(src, x, y, w, h);
    ctx.filter = 'none';
    return;
  }
  const step = Math.max(1, r / 1.5), pad = 2;
  const iw = Math.max(1, Math.round(w / step)), ih = Math.max(1, Math.round(h / step));
  const a = scratch('blurA');
  a.width = iw + pad * 2;
  a.height = ih + pad * 2;
  const ac = a.getContext('2d')!;
  ac.clearRect(0, 0, a.width, a.height);
  ac.imageSmoothingEnabled = true;
  ac.drawImage(src, pad, pad, iw, ih);
  // A second, half-size pass rounds off the blockiness of a single upscale.
  const b = scratch('blurB');
  b.width = Math.max(2, Math.round(a.width / 2));
  b.height = Math.max(2, Math.round(a.height / 2));
  const bc = b.getContext('2d')!;
  bc.clearRect(0, 0, b.width, b.height);
  bc.imageSmoothingEnabled = true;
  bc.drawImage(a, 0, 0, b.width, b.height);
  ctx.drawImage(b, x - pad * step, y - pad * step, a.width * step, a.height * step);
}

const FILL_PAD = 3;
const nearCache = new WeakMap<LedLayout, Int32Array>();

/** For every cell of the padded grid, the index of the closest LED (breadth-first flood from the LEDs). */
function nearestLed(layout: LedLayout): Int32Array {
  const hit = nearCache.get(layout);
  if (hit) return hit;
  const P = FILL_PAD, w = layout.cols + 2 * P, h = layout.rows + 2 * P;
  const out = new Int32Array(w * h).fill(-1);
  let queue: number[] = [];
  for (const l of layout.leds) {
    const c = (l.row + P) * w + l.col + P;
    out[c] = l.i;
    queue.push(c);
  }
  while (queue.length) {
    const next: number[] = [];
    for (const c of queue) {
      const x = c % w, y = (c - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (out[n] >= 0) continue;
        out[n] = out[c];
        next.push(n);
      }
    }
    queue = next;
  }
  nearCache.set(layout, out);
  return out;
}

// ---------------------------------------------------------------- Web Serial (Adalight)

interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
}

function useSerial() {
  const nav = navigator as Navigator & { serial?: { requestPort(): Promise<SerialPortLike> } };
  const supported = !!nav.serial;
  const port = useRef<SerialPortLike | null>(null);
  const writer = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const busy = useRef(false);
  const lastSent = useRef(0);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const baud = 115200;

  const connect = async () => {
    try {
      const p = await nav.serial!.requestPort();
      await p.open({ baudRate: baud });
      port.current = p;
      writer.current = p.writable!.getWriter();
      setConnected(true);
      setStatus('Connected. Streaming this sky to your LEDs.');
    } catch (e) {
      if ((e as Error).name !== 'NotFoundError') setStatus(`Couldn't open the port: ${(e as Error).message}`);
    }
  };

  const disconnect = async () => {
    try {
      writer.current?.releaseLock();
      await port.current?.close();
    } catch {
      /* already gone */
    }
    writer.current = null;
    port.current = null;
    setConnected(false);
    setStatus(null);
  };

  useEffect(() => () => void disconnect(), []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Send a frame if the line is free, no faster than the baud rate allows. */
  const send = (rgb: Uint8Array) => {
    const w = writer.current;
    if (!w || busy.current || !rgb.length) return;
    const packet = adalight(rgb);
    const minGap = ((packet.length * 10) / baud) * 1000;
    const now = performance.now();
    if (now - lastSent.current < minGap) return;
    lastSent.current = now;
    busy.current = true;
    w.write(packet)
      .catch(() => {
        setStatus('The LED board disconnected.');
        void disconnect();
      })
      .finally(() => (busy.current = false));
  };

  return { supported, connected, status, connect, disconnect, send };
}

// ---------------------------------------------------------------- side-view diagram

/** A cut-away of the box from the side: wall on the left, you on the right, and where the light goes. */
function MountDiagram({ mount, glow }: { mount: Mount; glow: string }) {
  const ray = (d: string, i: number) => <path key={i} d={d} stroke={glow} strokeWidth="1.6" fill="none" strokeLinecap="round" markerEnd="url(#led-arrow)" opacity="0.9" />;
  const ys = [44, 66, 88, 110];
  let leds: React.ReactNode = null, rays: React.ReactNode[] = [], label = '';
  if (mount === 'forward') {
    label = 'LEDs on the back, pointing at you';
    leds = (
      <>
        <rect x="30" y="34" width="5" height="88" fill="#bbb" />
        {ys.map((y) => <rect key={y} x="35" y={y - 4} width="6" height="8" rx="1.5" fill={glow} />)}
      </>
    );
    rays = ys.flatMap((y) => [`M44 ${y} L236 ${y}`, `M44 ${y} L236 ${y - 14}`, `M44 ${y} L236 ${y + 14}`]).map(ray);
  } else if (mount === 'bounce') {
    label = 'LEDs on a rail, pointing back at the white panel';
    leds = (
      <>
        <rect x="118" y="34" width="5" height="88" fill="#bbb" />
        {ys.map((y) => <rect key={y} x="112" y={y - 4} width="6" height="8" rx="1.5" fill={glow} />)}
      </>
    );
    rays = ys.flatMap((y) => [`M110 ${y} L34 ${y}`, `M34 ${y} L236 ${y - 22}`, `M34 ${y} L236 ${y + 8}`]).map(ray);
  } else {
    label = 'One strip around the edge, shining across the box';
    leds = (
      <>
        {[60, 100].map((x) => <rect key={`t${x}`} x={x - 4} y="24" width="8" height="6" rx="1.5" fill={glow} />)}
        {[60, 100].map((x) => <rect key={`b${x}`} x={x - 4} y="130" width="8" height="6" rx="1.5" fill={glow} />)}
      </>
    );
    rays = [`M60 32 L236 90`, `M100 32 L236 118`, `M60 32 L34 70`, `M60 128 L236 70`, `M100 128 L236 42`, `M60 128 L34 90`, `M34 70 L236 60`, `M34 90 L236 100`].map(ray);
  }
  return (
    <figure className="led-diagram">
      <svg viewBox="0 0 320 160" role="img" aria-label={`Side view: ${label}`}>
        <defs>
          <marker id="led-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0 L8 4 L0 8 z" fill={glow} />
          </marker>
          <marker id="led-look" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="#6d6b66" />
          </marker>
          <pattern id="led-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#c9c5bd" strokeWidth="2" />
          </pattern>
        </defs>
        <rect x="6" y="8" width="16" height="144" fill="url(#led-hatch)" />
        <rect x="22" y="18" width="8" height="124" fill="#fff" stroke="#111" strokeWidth="1" />
        <rect x="22" y="18" width="226" height="6" fill="#111" />
        <rect x="22" y="136" width="226" height="6" fill="#111" />
        <rect x="238" y="24" width="8" height="112" fill="#f2f0ec" stroke="#999" strokeWidth="1" strokeDasharray="2 2" />
        {rays}
        {leds}
        <text x="14" y="156" className="led-dg-t" textAnchor="middle">wall</text>
        <text x="26" y="13" className="led-dg-t">white back</text>
        <text x="242" y="13" className="led-dg-t" textAnchor="middle">frosted front</text>
        <text x="290" y="84" className="led-dg-t" textAnchor="middle">you</text>
        <path d="M278 90 L256 90" stroke="#6d6b66" strokeWidth="1" markerEnd="url(#led-look)" />
      </svg>
      <figcaption>Side view · {label}</figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- small controls

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="led-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="led-seg" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Num({ label, value, onChange, min, max, step = 0.5 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  return (
    <label className="led-num">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
        onBlur={() => setText(fmt(value))}
      />
    </label>
  );
}
const fmt = (v: number) => String(Math.round(v * 10) / 10);

function Slider({ label, value, onChange, min, max, step, show }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; show: string }) {
  return (
    <label className="led-slider">
      <span>
        {label}
        <em>{show}</em>
      </span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
