// Poster mode: preview + settings + print-ready PNG export.
import { useEffect, useRef, useState } from 'react';
import { download, slug } from '../lib/exportCode';
import { gradientKey } from '../lib/gradient';
import { drawPoster, gradientRect, PAPERS, POSTER_SIZES, posterFontsReady } from '../lib/poster';
import { GradientRenderer, grainScale, sharedRenderer } from '../render/renderer';
import { useStore } from '../store';
import type { PosterPaper, PosterSize } from '../types';
import { Field, Section, Seg } from './ui';

export function PosterView() {
  const g = useStore((s) => s.gradient);
  const poster = useStore((s) => s.poster);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [fonts, setFonts] = useState(false);
  const key = gradientKey(g);

  useEffect(() => {
    posterFontsReady().then(() => setFonts(true));
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !box.w || !box.h) return;
    const size = POSTER_SIZES[poster.size];
    const scale = Math.min((box.w - 40) / size.w, (box.h - 40) / size.h);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(size.w * scale * dpr), H = Math.round(size.h * scale * dpr);
    c.width = W;
    c.height = H;
    c.style.width = `${W / dpr}px`;
    c.style.height = `${H / dpr}px`;
    const r = gradientRect(W, H, poster);
    try {
      const gr = sharedRenderer();
      gr.setSize(r.w, r.h);
      gr.render(g, { pxScale: grainScale(r.w, r.h) });
      drawPoster(c.getContext('2d')!, W, H, g, poster, gr.canvas);
    } catch {
      /* WebGL unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, g.name, g.place, g.time, g.coords, poster, box, fonts]);

  return (
    <div className="poster-stage" ref={wrap}>
      <canvas ref={canvas} className="poster-canvas" aria-label={`Poster of ${g.name}`} />
    </div>
  );
}

export function PosterInspector() {
  const g = useStore((s) => s.gradient);
  const p = useStore((s) => s.poster);
  const set = useStore.getState().setPoster;
  const [busy, setBusy] = useState(false);
  const size = POSTER_SIZES[p.size];

  const exportPNG = async () => {
    setBusy(true);
    await new Promise((res) => setTimeout(res, 30));
    try {
      await posterFontsReady();
      const r = gradientRect(size.w, size.h, p);
      const glc = document.createElement('canvas');
      const gr = new GradientRenderer(glc, true);
      gr.setSize(r.w, r.h);
      gr.render(g, { pxScale: grainScale(r.w, r.h) });
      const out = document.createElement('canvas');
      out.width = size.w;
      out.height = size.h;
      drawPoster(out.getContext('2d')!, size.w, size.h, g, p, glc);
      glc.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
      const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
      if (!blob) throw new Error('PNG failed');
      download(`atmos-poster-${slug(g.name)}-${size.label.toLowerCase()}.png`, blob);
    } catch (e) {
      useStore.getState().notify(`EXPORT FAILED · ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inspector">
      <div className="insp-title">
        <div className="name-input static">POSTER</div>
        <p className="hint">Your gradient as a print, with its field notes. Exports at 300 DPI, ready for a print shop.</p>
      </div>
      <Section title="SHEET">
        <Field label="SIZE">
          <Seg options={Object.keys(POSTER_SIZES) as PosterSize[]} value={p.size} onChange={(v) => set({ size: v })} labels={Object.fromEntries(Object.entries(POSTER_SIZES).map(([k, v]) => [k, v.label]))} />
        </Field>
        <p className="muted tiny">
          {size.note} · {size.w}×{size.h} PX
        </p>
        <Field label="PAPER">
          <Seg options={Object.keys(PAPERS) as PosterPaper[]} value={p.paper} onChange={(v) => set({ paper: v })} labels={Object.fromEntries(Object.entries(PAPERS).map(([k, v]) => [k, v.label]))} />
        </Field>
        <Field label="LAYOUT">
          <Seg options={['framed', 'bleed'] as const} value={p.layout} onChange={(v) => set({ layout: v })} labels={{ bleed: 'FULL BLEED' }} />
        </Field>
        {p.layout === 'framed' && (
          <label className="slider">
            <span className="slider-label">MARGIN</span>
            <input type="range" min={0.04} max={0.2} step={0.005} value={p.margin} style={{ '--p': `${((p.margin - 0.04) / 0.16) * 100}%` } as React.CSSProperties} onChange={(e) => set({ margin: parseFloat(e.target.value) })} />
            <span className="slider-value">{Math.round(p.margin * 100)}</span>
          </label>
        )}
      </Section>
      <Section title="TYPE">
        <Field label="TITLE">
          <input className="text-input" id="poster-title" value={p.title} placeholder={g.name} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="SUBTITLE">
          <input className="text-input" id="poster-subtitle" value={p.subtitle} placeholder={`${g.place} · ${g.time}`} onChange={(e) => set({ subtitle: e.target.value })} />
        </Field>
        <Field label="EDITION">
          <input className="text-input" id="poster-edition" value={p.edition} onChange={(e) => set({ edition: e.target.value })} />
        </Field>
        <Field label="COLOUR NOTES">
          <Seg options={['on', 'off'] as const} value={p.notes ? 'on' : 'off'} onChange={(v) => set({ notes: v === 'on' })} />
        </Field>
      </Section>
      <button className="btn wide" onClick={exportPNG} disabled={busy}>
        {busy ? 'RENDERING…' : `DOWNLOAD POSTER · ${size.label} PNG`}
      </button>
    </div>
  );
}
