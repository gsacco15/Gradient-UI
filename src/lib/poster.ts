// Poster mode: the gradient as a print, with field-note typography.
// One draw function feeds both the on-screen preview and the full-size export.
import { nameForColor } from '../data/names';
import type { Gradient, PosterPaper, PosterSettings, PosterSize } from '../types';
import { luminance } from './color';
import { sortedStops } from './gradient';

export const POSTER_SIZES: Record<PosterSize, { label: string; w: number; h: number; note: string }> = {
  a3: { label: 'A3', w: 3508, h: 4961, note: '297 × 420 MM · 300 DPI' },
  portrait45: { label: '4:5', w: 3600, h: 4500, note: '12 × 15 IN · 300 DPI' },
  square: { label: 'SQUARE', w: 3600, h: 3600, note: '12 × 12 IN · 300 DPI' },
  landscape: { label: 'LANDSCAPE', w: 4961, h: 3508, note: '420 × 297 MM · 300 DPI' },
};

export const PAPERS: Record<PosterPaper, { label: string; bg: string; ink: string; muted: string }> = {
  white: { label: 'WHITE', bg: '#FFFFFF', ink: '#161616', muted: '#8A8A8A' },
  bone: { label: 'BONE', bg: '#EEEAE1', ink: '#1C1A17', muted: '#8C867B' },
  ink: { label: 'INK', bg: '#121212', ink: '#EDEDED', muted: '#7C7C7C' },
};

export const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

/** Where the gradient sits on the sheet. */
export function gradientRect(W: number, H: number, s: PosterSettings) {
  if (s.layout === 'bleed') return { x: 0, y: 0, w: W, h: H };
  const u = Math.min(W, H) / 100;
  const m = s.margin * Math.min(W, H);
  const info = W > H ? 13 * u : 16 * u;
  return { x: m, y: m, w: W - 2 * m, h: H - 2 * m - info };
}

/** Average luminance of a region of the gradient (for choosing ink on bleed layouts). */
function regionTone(src: CanvasImageSource, sw: number, sh: number, fx: number, fy: number, fw: number, fh: number): number {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const x = c.getContext('2d')!;
  x.drawImage(src, fx * sw, fy * sh, fw * sw, fh * sh, 0, 0, 8, 8);
  const d = x.getImageData(0, 0, 8, 8).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += luminance([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]);
  return sum / 64;
}

export function drawPoster(ctx: CanvasRenderingContext2D, W: number, H: number, g: Gradient, s: PosterSettings, src: CanvasImageSource & { width: number; height: number }) {
  const paper = PAPERS[s.paper];
  const u = Math.min(W, H) / 100;
  const r = gradientRect(W, H, s);
  const bleed = s.layout === 'bleed';
  const m = bleed ? 5.5 * u : s.margin * Math.min(W, H);

  ctx.save();
  ctx.fillStyle = paper.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, r.x, r.y, r.w, r.h);

  const tone = (fx: number, fy: number, fw: number, fh: number) =>
    bleed ? (regionTone(src, src.width, src.height, fx, fy, fw, fh) > 0.42 ? 'rgba(20,20,20,.82)' : 'rgba(255,255,255,.9)') : paper.ink;
  const muted = (c: string) => (bleed ? c.replace(/[\d.]+\)$/, '.6)') : paper.muted);

  const text = (t: string, x: number, y: number, size: number, color: string, weight = 400, align: CanvasTextAlign = 'left', spacing = 0.06) => {
    ctx.font = `${weight} ${size}px ${MONO}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${size * spacing}px`;
    ctx.fillText(t, x, y);
  };

  const small = 1.05 * u;
  const title = (s.title || g.name).toUpperCase();
  const subtitle = (s.subtitle || `${g.place} · ${g.time}`).toUpperCase();
  const stops = g.type === 'mesh' ? g.points : sortedStops(g);
  const date = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase();

  // Header line, sitting in the top margin (or over the gradient when bled).
  const topY = bleed ? m : Math.max(r.y * 0.62, small * 1.6);
  const tl = tone(0, 0, 0.4, 0.08), tr = tone(0.6, 0, 0.4, 0.08);
  text('ATMOS [ STUDIO ]', m, topY, small, tl, 500);
  text('SKY & NATURE GRADIENTS', m, topY + small * 1.5, small, muted(tl));
  text(g.coords ?? '', W - m, topY, small, tr, 400, 'right');
  text(subtitle, W - m, topY + small * 1.5, small, muted(tr), 400, 'right');

  if (bleed) {
    const bl = tone(0, 0.75, 0.6, 0.25), br = tone(0.6, 0.85, 0.4, 0.15);
    text(title, m, H - m - 3.2 * u, 4 * u, bl, 500, 'left', 0.02);
    text(subtitle, m, H - m - 0.2 * u, 1.3 * u, muted(bl));
    text(s.edition.toUpperCase(), W - m, H - m - 0.2 * u, small, br, 400, 'right');
    text(date, W - m, H - m - 1.8 * u, small, muted(br), 400, 'right');
    if (s.notes) {
      const nl = tone(0, 0.35, 0.3, 0.3);
      stops.forEach((p, i) => {
        const y = H * 0.42 + i * 3.1 * u;
        ctx.fillStyle = p.color;
        ctx.fillRect(m, y - small * 0.85, small * 0.85, small * 0.85);
        ctx.strokeStyle = nl;
        ctx.lineWidth = Math.max(1, u * 0.08);
        ctx.strokeRect(m, y - small * 0.85, small * 0.85, small * 0.85);
        text(nameForColor(p.color), m + small * 1.6, y, small, nl);
        text(p.color, m + small * 1.6, y + small * 1.35, small, muted(nl));
      });
    }
    ctx.restore();
    return;
  }

  // Framed: title block and field notes under the gradient.
  const infoY = r.y + r.h + 4.6 * u;
  text(title, m, infoY, 3.6 * u, paper.ink, 500, 'left', 0.02);
  text(subtitle, m, infoY + 2.5 * u, 1.3 * u, paper.muted);

  if (s.notes) {
    const cols = W > H ? 3 : 2;
    const colW = Math.min(22 * u, (r.w * 0.5) / cols);
    const x0 = r.x + r.w - cols * colW;
    stops.forEach((p, i) => {
      const cx = x0 + (i % cols) * colW;
      const cy = infoY - 2.2 * u + Math.floor(i / cols) * 3.3 * u;
      ctx.fillStyle = p.color;
      ctx.fillRect(cx, cy - small * 0.85, small * 0.85, small * 0.85);
      text(nameForColor(p.color), cx + small * 1.6, cy, small, paper.ink);
      text(p.color, cx + small * 1.6, cy + small * 1.35, small, paper.muted);
    });
  }

  const footY = H - Math.max(m * 0.45, 2.2 * u);
  text(s.edition.toUpperCase(), m, footY, small, paper.muted);
  text(`${g.type.toUpperCase()} · ${stops.length} COLOURS`, W / 2, footY, small, paper.muted, 400, 'center');
  text(date, W - m, footY, small, paper.muted, 400, 'right');
  ctx.restore();
}

export async function posterFontsReady() {
  try {
    await Promise.all([document.fonts.load(`400 20px ${MONO}`), document.fonts.load(`500 20px ${MONO}`)]);
  } catch {
    /* fall back to system mono */
  }
}
