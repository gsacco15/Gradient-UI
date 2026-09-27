// Forecast shuffle + remix: palette generation tuned to sky and nature moods.
import { PLACES, nameForColor, randomTime, type Place } from '../data/names';
import type { Gradient, GradientType } from '../types';
import { clamp, hexToOklch, oklch } from './color';
import { cloneGradient, uid } from './gradient';

type Rand = () => number;
const rr = (r: Rand, a: number, b: number) => a + (b - a) * r();
const pick = <T,>(r: Rand, xs: T[]) => xs[Math.floor(r() * xs.length)];

/** Palette for a mood, ordered like a sky: light to dark or dark to light. */
export function moodPalette(mood: Place['mood'], n: number, r: Rand = Math.random): string[] {
  const out: string[] = [];
  const base = {
    cold: [190, 260], warm: [15, 75], lush: [110, 195], neon: [140, 330], dark: [230, 320], soft: [0, 360],
  }[mood];
  const hue0 = rr(r, base[0], base[1]);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    let L: number, C: number, H: number;
    switch (mood) {
      case 'neon':
        L = i === 0 || i === n - 1 ? rr(r, 0.12, 0.2) : rr(r, 0.62, 0.85);
        C = i === 0 || i === n - 1 ? 0.04 : rr(r, 0.16, 0.26);
        H = hue0 + (i % 2 ? 140 : 0) + rr(r, -15, 15);
        break;
      case 'dark':
        L = 0.12 + t * rr(r, 0.25, 0.5);
        C = rr(r, 0.03, 0.14);
        H = hue0 + t * rr(r, -60, 60);
        break;
      case 'soft':
        L = rr(r, 0.82, 0.96);
        C = rr(r, 0.03, 0.09);
        H = hue0 + t * rr(r, 40, 120);
        break;
      case 'warm':
        L = 0.95 - t * rr(r, 0.3, 0.55);
        C = rr(r, 0.06, 0.16);
        H = hue0 + t * rr(r, -35, 25);
        break;
      case 'lush':
        L = 0.9 - t * rr(r, 0.35, 0.6);
        C = rr(r, 0.05, 0.14);
        H = hue0 + t * rr(r, -30, 30);
        break;
      default: // cold
        L = 0.97 - t * rr(r, 0.35, 0.6);
        C = rr(r, 0.03, 0.12);
        H = hue0 + t * rr(r, -25, 35);
    }
    out.push(oklch(clamp(L), Math.max(0, C), (H + 360) % 360));
  }
  return r() < 0.5 ? out : out.reverse();
}

/** Keep locked colours, regenerate the rest, and give it a new place + moment. */
export function forecastShuffle(g: Gradient, r: Rand = Math.random): Gradient {
  const place = pick(r, PLACES);
  const next = cloneGradient(g, false);
  const palette = moodPalette(place.mood, next.points.length, r);
  next.points = next.points.map((p, i) => (p.locked ? p : { ...p, color: palette[i] }));
  if (next.type === 'mesh') {
    next.background = next.points[next.points.length - 1].color;
    next.points = next.points.map((p) => (p.locked ? p : { ...p, x: rr(r, 0.1, 0.9), y: rr(r, 0.1, 0.9), size: rr(r, 0.3, 0.6) }));
  }
  next.place = place.place;
  next.coords = place.coords;
  next.time = randomTime(r);
  next.name = nameForColor(next.points[Math.floor(next.points.length / 2)].color);
  next.collection = undefined;
  return next;
}

/** A completely new gradient — type, composition and all. */
export function randomGradient(base: Gradient, r: Rand = Math.random): Gradient {
  const types: GradientType[] = ['linear', 'radial', 'mesh', 'mesh', 'frame', 'conic', 'aperture', 'bands', 'halo'];
  const next = cloneGradient(base, false);
  next.type = pick(r, types);
  next.angle = Math.round(rr(r, 0, 360));
  next.center = { x: rr(r, 0.3, 0.7), y: rr(r, 0.3, 1) };
  next.composition = {
    ...next.composition,
    symmetry: r() < 0.7 ? 'none' : pick(r, ['mirror', 'quadrant', 'kaleido'] as const),
    count: Math.round(rr(r, 2, 5)),
    shape: pick(r, ['square', 'circle', 'arch'] as const),
    softness: rr(r, 0.5, 1),
    size: rr(r, 0.4, 0.8),
    glow: rr(r, 0.2, 0.7),
  };
  if (next.type === 'aperture' || next.type === 'halo') next.composition.symmetry = 'none';
  next.weather = { ...next.weather, fog: r() < 0.5 ? rr(r, 0.2, 0.5) : 0, haze: rr(r, 0.1, 0.45), clouds: r() < 0.25 ? rr(r, 0.2, 0.5) : 0 };
  const n = Math.round(rr(r, 3, 5));
  while (next.points.length < n) next.points.push({ ...next.points[next.points.length - 1], id: uid('pt'), locked: false });
  next.points = next.points.slice(0, Math.max(n, next.points.filter((p) => p.locked).length));
  next.points.forEach((p, i) => (p.pos = i / Math.max(1, next.points.length - 1)));
  return forecastShuffle(next, r);
}

/** Close variations of the current gradient. */
export function remix(g: Gradient, count = 6, r: Rand = Math.random): Gradient[] {
  return Array.from({ length: count }, (_, k) => {
    const v = cloneGradient(g, true);
    const amt = 0.5 + k * 0.15;
    v.points = v.points.map((p) => {
      if (p.locked) return p;
      const [L, C, H] = hexToOklch(p.color);
      return {
        ...p,
        color: oklch(clamp(L + rr(r, -0.06, 0.06) * amt), Math.max(0, C * rr(r, 0.8, 1.25)), H + rr(r, -22, 22) * amt),
        x: clamp(p.x + rr(r, -0.12, 0.12) * amt),
        y: clamp(p.y + rr(r, -0.12, 0.12) * amt),
      };
    });
    v.angle = (v.angle + rr(r, -30, 30) * amt + 360) % 360;
    v.name = nameForColor(v.points[Math.floor(v.points.length / 2)].color);
    return v;
  });
}
