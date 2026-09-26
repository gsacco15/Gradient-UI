// Export panel: image, video, code and project.
import { useMemo, useRef, useState } from 'react';
import { cssCaveats, download, slug, toCSS, toJSON, toSVG, toTailwind } from '../lib/exportCode';
import { toEmbed } from '../lib/embed';
import { gradientKey } from '../lib/gradient';
import { shareLink } from '../lib/share';
import { canEncode, exportVideo, type VideoFormat } from '../lib/video';
import { GradientRenderer, grainScale, renderDataURL } from '../render/renderer';
import { useStore } from '../store';

type Tab = 'image' | 'video' | 'code' | 'project';
const SIZES: { label: string; w: number; h: number }[] = [
  { label: '1080×1080', w: 1080, h: 1080 },
  { label: '2160×2160', w: 2160, h: 2160 },
  { label: 'HD · 1920×1080', w: 1920, h: 1080 },
  { label: 'STORY · 1080×1920', w: 1080, h: 1920 },
  { label: '4K · 3840×2160', w: 3840, h: 2160 },
  { label: 'PRINT · 3600×4500', w: 3600, h: 4500 },
];

export function ExportDialog() {
  const view = useStore((s) => s.view);
  const [tab, setTab] = useState<Tab>(view === 'horizon' ? 'video' : 'image');
  const close = () => useStore.getState().set({ exportOpen: false });

  return (
    <div className="sheet-backdrop" onClick={close}>
      <aside className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Export">
        <header className="sheet-head">
          <span>{view === 'horizon' ? 'HORIZON EXPORT' : 'EXPORT'}</span>
          <button className="link" onClick={close}>
            CLOSE
          </button>
        </header>
        <nav className="tabs">
          {(['image', 'video', 'code', 'project'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t.toUpperCase()}
            </button>
          ))}
        </nav>
        <div className="sheet-body">
          {tab === 'image' && <ImageTab />}
          {tab === 'video' && <VideoTab />}
          {tab === 'code' && <CodeTab />}
          {tab === 'project' && <ProjectTab />}
        </div>
      </aside>
    </div>
  );
}

function SizePicker({ size, setSize }: { size: { w: number; h: number }; setSize: (s: { w: number; h: number }) => void }) {
  const custom = !SIZES.some((s) => s.w === size.w && s.h === size.h);
  return (
    <div className="opt-group">
      <div className="opt-label">SIZE (PX)</div>
      {SIZES.map((s) => (
        <button key={s.label} className={`opt ${s.w === size.w && s.h === size.h ? 'on' : ''}`} onClick={() => setSize(s)}>
          {s.label}
        </button>
      ))}
      <div className={`opt custom ${custom ? 'on' : ''}`}>
        CUSTOM
        <input type="number" min={16} max={8192} value={size.w} onChange={(e) => setSize({ ...size, w: clampSize(e.target.value) })} aria-label="Width" />×
        <input type="number" min={16} max={8192} value={size.h} onChange={(e) => setSize({ ...size, h: clampSize(e.target.value) })} aria-label="Height" />
      </div>
    </div>
  );
}
const clampSize = (v: string) => Math.max(16, Math.min(8192, parseInt(v, 10) || 16));

function renderPNG(w: number, h: number): Promise<Blob> {
  const g = useStore.getState().gradient;
  const canvas = document.createElement('canvas');
  const r = new GradientRenderer(canvas, true);
  r.setSize(w, h);
  r.render(g, { pxScale: grainScale(w, h) });
  return new Promise((res, rej) => canvas.toBlob((b) => {
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    if (b) res(b);
    else rej(new Error('PNG failed'));
  }, 'image/png'));
}

function ImageTab() {
  const g = useStore((s) => s.gradient);
  const [size, setSize] = useState({ w: 2160, h: 2160 });
  const [busy, setBusy] = useState(false);
  const png = async () => {
    setBusy(true);
    try {
      download(`atmos-${slug(g.name)}-${size.w}x${size.h}.png`, await renderPNG(size.w, size.h));
    } catch (e) {
      useStore.getState().notify(`EXPORT FAILED · ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const svg = () => {
    const data = renderDataURL(g, Math.min(size.w, 1600), Math.min(size.h, 1600), gradientKey(g));
    download(`atmos-${slug(g.name)}.svg`, toSVG(g, size.w, size.h, data), 'image/svg+xml');
  };
  return (
    <>
      <SizePicker size={size} setSize={setSize} />
      <div className="summary">
        {size.w} × {size.h} PX
        <br />
        PNG · ALL WEATHER LAYERS BAKED IN
      </div>
      <div className="sheet-actions">
        <button className="btn" onClick={png} disabled={busy}>
          {busy ? 'RENDERING…' : 'DOWNLOAD PNG'}
        </button>
        <button className="btn ghost" onClick={svg}>
          DOWNLOAD SVG
        </button>
      </div>
    </>
  );
}

function VideoTab() {
  const g = useStore((s) => s.gradient);
  const view = useStore((s) => s.view);
  const h = useStore((s) => s.horizon);
  const horizon = view === 'horizon' && !!h.image;
  const [format, setFormat] = useState<VideoFormat>(canEncode() ? 'mp4' : 'webm');
  const [size, setSize] = useState({ w: 1080, h: 1920 });
  const [fps, setFps] = useState<number>(horizon ? h.fps : 30);
  const [loops, setLoops] = useState(2);
  const [progress, setProgress] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const span = h.dir === 'columns' ? h.width : h.height;
  const frames = horizon ? Math.max(1, Math.floor(span / h.step)) : Math.round(g.motion.duration * loops * fps);
  const seconds = frames / fps;
  const noMotion = !horizon && g.motion.mode === 'none';

  const start = async () => {
    abort.current = new AbortController();
    setProgress(0);
    try {
      let img: HTMLImageElement | null = null;
      if (horizon && h.image) {
        img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = h.image!;
        });
      }
      const loopFrames = g.motion.duration * fps;
      const px = grainScale(size.w, size.h);
      const blob = await exportVideo({
        format,
        width: size.w,
        height: size.h,
        fps,
        frames,
        signal: abort.current.signal,
        onProgress: setProgress,
        prepare: (r) => img && r.setImage(img),
        draw: (r, i) =>
          horizon
            ? r.render(g, { scan: { pos: ((i * h.step) / span) % 1, dir: h.dir }, pxScale: px, seed: i % 24 })
            : r.render(g, { phase: (i % loopFrames) / loopFrames, pxScale: px, seed: i % 24 }),
      });
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      download(`atmos-${horizon ? 'horizon' : slug(g.name)}-${size.w}x${size.h}.${ext}`, blob);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') useStore.getState().notify(`EXPORT FAILED · ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  if (noMotion)
    return <p className="hint">This gradient is still. Pick a MOTION mode in the inspector, or switch to HORIZON to turn a photo into a film.</p>;

  return (
    <>
      <div className="opt-group">
        <div className="opt-label">FORMAT</div>
        <div className="opt-row">
          {(['mp4', 'webm'] as VideoFormat[]).map((f) => (
            <button key={f} className={`opt inline ${format === f ? 'on' : ''}`} onClick={() => setFormat(f)}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <SizePicker size={size} setSize={setSize} />
      <div className="opt-group">
        <div className="opt-label">FRAME RATE</div>
        <div className="opt-row">
          {[24, 30, 60].map((f) => (
            <button key={f} className={`opt inline ${fps === f ? 'on' : ''}`} onClick={() => setFps(f)}>
              {f} FPS
            </button>
          ))}
        </div>
      </div>
      {!horizon && (
        <div className="opt-group">
          <div className="opt-label">LOOPS</div>
          <div className="opt-row">
            {[1, 2, 4, 8].map((n) => (
              <button key={n} className={`opt inline ${loops === n ? 'on' : ''}`} onClick={() => setLoops(n)}>
                ×{n}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="summary">
        {size.w} × {size.h} PX
        <br />
        {format.toUpperCase()} / {fps} FPS
        <br />
        DURATION ~{Math.round(seconds)}S{horizon ? ` · ${frames} LINES` : ` · SEAMLESS LOOP`}
        {!canEncode() && (
          <>
            <br />
            REAL-TIME RECORDING (BROWSER HAS NO WEBCODECS)
          </>
        )}
      </div>
      <div className="sheet-actions">
        {progress === null ? (
          <button className="btn" onClick={start}>
            DOWNLOAD
          </button>
        ) : (
          <>
            <div className="progress">
              <div style={{ width: `${progress * 100}%` }} />
              <span>RENDERING {Math.round(progress * 100)}%</span>
            </div>
            <button className="btn ghost" onClick={() => abort.current?.abort()}>
              CANCEL
            </button>
          </>
        )}
      </div>
    </>
  );
}

function CodeTab() {
  const g = useStore((s) => s.gradient);
  const [kind, setKind] = useState<'css' | 'tailwind' | 'svg' | 'embed'>(g.interact.mode !== 'none' ? 'embed' : 'css');
  const key = gradientKey(g);
  const code = useMemo(() => {
    if (kind === 'css') return toCSS(g);
    if (kind === 'tailwind') return toTailwind(g);
    if (kind === 'embed') return toEmbed(g);
    return toSVG(g, 1200, 800, renderDataURL(g, 600, 400, key)) || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key, g.name, g.place, g.time]);
  const caveats = cssCaveats(g);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      useStore.getState().notify('COPIED');
    } catch {
      useStore.getState().notify('COPY BLOCKED — SELECT AND COPY');
    }
  };
  return (
    <>
      <div className="opt-row">
        {(['css', 'tailwind', 'svg', 'embed'] as const).map((k) => (
          <button key={k} className={`opt inline ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
            {k.toUpperCase()}
          </button>
        ))}
      </div>
      {kind === 'embed' && <p className="hint">A live WebGL gradient for any website — motion and cursor effects included. Paste it into your HTML; it falls back to plain CSS where WebGL is unavailable.</p>}
      {(kind === 'css' || kind === 'tailwind') && caveats.length > 0 && (
        <ul className="caveats">
          {caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      <textarea className="code" readOnly value={code} spellCheck={false} />
      <div className="sheet-actions">
        <button className="btn" onClick={copy}>
          COPY
        </button>
      </div>
    </>
  );
}

function ProjectTab() {
  const g = useStore((s) => s.gradient);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink(g));
      useStore.getState().notify('SHARE LINK COPIED');
    } catch {
      useStore.getState().notify('COPY BLOCKED');
    }
  };
  return (
    <>
      <p className="hint">An editable project file — import it later from SAVED, or share a link that opens this exact gradient.</p>
      <div className="summary">
        {g.name} · {g.place} · {g.time}
        <br />
        {g.type.toUpperCase()} · {g.points.length} COLOURS
      </div>
      <div className="sheet-actions">
        <button className="btn" onClick={() => download(`atmos-${slug(g.name)}.json`, toJSON(g), 'application/json')}>
          DOWNLOAD JSON
        </button>
        <button className="btn ghost" onClick={copyLink}>
          COPY SHARE LINK
        </button>
      </div>
    </>
  );
}
