// WLED palette mode: a sky's colours as a WLED custom palette, and close recreations of a few
// WLED effects that use it, so a piece can be previewed before any hardware exists.
// These follow how the WLED effects behave; they are not WLED's own code, so timing differs a little.
import { hexToRgb } from './color';
import type { Gradient } from '../types';
import type { LedLayout } from './led';

export type WledEffect = 'colorwaves' | 'flow' | 'noise' | 'plasma' | 'aurora';

export const WLED_EFFECTS: { id: WledEffect; label: string; note: string }[] = [
  { id: 'colorwaves', label: 'Colorwaves', note: 'Soft bands of colour rolling through, with a gentle pulse.' },
  { id: 'flow', label: 'Flow', note: 'The palette scrolls smoothly across the piece.' },
  { id: 'noise', label: 'Noise 2D', note: 'Slow drifting clouds of colour.' },
  { id: 'plasma', label: 'Plasma', note: 'Overlapping waves that swirl and mix.' },
  { id: 'aurora', label: 'Aurora', note: 'Glowing curtains drifting over a dark sky.' },
];

export interface PaletteStop {
  pos: number; // 0..255
  color: string; // #rrggbb
}

/** The sky's colours, in ramp order, as up to 16 palette stops (WLED's limit for custom palettes). */
export function paletteFromGradient(g: Gradient): PaletteStop[] {
  let pts = [...g.points].sort((a, b) => a.pos - b.pos);
  if (pts.length > 16) pts = pts.filter((_, i) => i % Math.ceil(pts.length / 16) === 0).slice(0, 16);
  if (pts.length === 1) return [{ pos: 0, color: pts[0].color }, { pos: 255, color: pts[0].color }];
  // Spread evenly when the stops sit on top of each other (mesh points often share positions).
  const spread = pts.every((p, i) => i === 0 || p.pos > pts[i - 1].pos + 0.01);
  return pts.map((p, i) => ({
    pos: i === 0 ? 0 : i === pts.length - 1 ? 255 : Math.round(255 * (spread ? p.pos : i / (pts.length - 1))),
    color: p.color.toLowerCase(),
  }));
}

/** WLED's custom palette file (palette0.json … palette9.json). */
export function wledPaletteJson(stops: PaletteStop[]): string {
  return JSON.stringify({ palette: stops.flatMap((s) => [s.pos, s.color.replace('#', '').toUpperCase()]) });
}

/** 256 RGB entries, blended in plain RGB the way WLED blends palettes. */
export function palette256(stops: PaletteStop[]): Uint8Array {
  const out = new Uint8Array(256 * 3);
  const rgb = stops.map((s) => hexToRgb(s.color).map((v) => v * 255));
  for (let i = 0; i < 256; i++) {
    let k = 0;
    while (k < stops.length - 2 && i > stops[k + 1].pos) k++;
    const a = stops[k], b = stops[Math.min(k + 1, stops.length - 1)];
    const t = b.pos === a.pos ? 0 : Math.min(1, Math.max(0, (i - a.pos) / (b.pos - a.pos)));
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(rgb[k][c] + (rgb[Math.min(k + 1, rgb.length - 1)][c] - rgb[k][c]) * t);
  }
  return out;
}

// ---------------------------------------------------------------- effects

const frac = (x: number) => x - Math.floor(x);
const TAU = Math.PI * 2;

function hash(x: number, y: number, z: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Smooth 3D value noise, 0..1. */
export function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

/**
 * Colour every LED for one moment of a WLED effect. `speed` and `size` are 0..1, like WLED's
 * speed and intensity sliders. Returns RGB in data-line order, before brightness and gamma.
 */
export function renderEffect(fx: WledEffect, layout: LedLayout, pal: Uint8Array, t: number, speed: number, size: number): Uint8Array {
  const out = new Uint8Array(layout.leds.length * 3);
  const span = Math.max(layout.cols, layout.rows, 2) - 1;
  const rate = 0.15 + speed * 1.6;
  const T = t * rate;
  for (const l of layout.leds) {
    // Square coordinates so patterns keep their shape on any frame.
    const u = l.col / span, v = l.row / span;
    let idx = 0, lum = 1;
    switch (fx) {
      case 'colorwaves': {
        const scale = 0.6 + size * 2.4;
        idx = frac(v * scale * 0.5 + 0.06 * Math.sin(u * TAU + T * 0.7) - T * 0.12);
        lum = 0.72 + 0.28 * Math.sin(TAU * (v * scale * 0.8 + T * 0.18) + u * 1.3) ** 2;
        break;
      }
      case 'flow': {
        const scale = 0.5 + size * 2;
        idx = frac((u * 0.35 + v) * scale * 0.5 - T * 0.1);
        break;
      }
      case 'noise': {
        const scale = 1.2 + size * 5;
        const n = noise3(u * scale, v * scale, T * 0.35);
        idx = Math.min(1, Math.max(0, (n - 0.15) / 0.7));
        break;
      }
      case 'plasma': {
        const scale = 0.6 + size * 2.4;
        const p = Math.sin(u * scale * TAU + T) + Math.sin(v * scale * TAU * 0.8 - T * 1.3) + Math.sin((u + v) * scale * Math.PI + T * 0.7);
        idx = p / 6 + 0.5;
        break;
      }
      case 'aurora': {
        const width = 0.08 + size * 0.25;
        let glow = 0, tone = 0;
        for (let k = 0; k < 3; k++) {
          const cx = frac(0.2 + k * 0.33 + 0.08 * Math.sin(T * 0.4 + k * 2) + T * 0.03 * (k % 2 ? 1 : -1));
          const d = Math.min(Math.abs(u - cx), 1 - Math.abs(u - cx));
          const w = Math.exp(-((d / width) ** 2)) * (0.6 + 0.4 * Math.sin(T * 0.9 + k * 1.7 + v * 4));
          glow += w;
          tone += w * (k / 3 + 0.15);
        }
        idx = glow > 0.001 ? frac(tone / glow + v * 0.25) : 0;
        lum = Math.min(1, 0.06 + glow * (1 - v * 0.55));
        break;
      }
    }
    const p = Math.min(255, Math.max(0, Math.round(idx * 255))) * 3;
    out[l.i * 3] = pal[p] * lum;
    out[l.i * 3 + 1] = pal[p + 1] * lum;
    out[l.i * 3 + 2] = pal[p + 2] * lum;
  }
  return out;
}
