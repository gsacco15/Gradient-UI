import type { ColorPoint, Composition, Gradient, GradientType, Interact, Motion, Weather } from '../types';

let counter = 0;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const MAX_POINTS = 8;

export const DEFAULT_COMPOSITION: Composition = {
  symmetry: 'none',
  slices: 6,
  shape: 'square',
  count: 3,
  softness: 0.7,
  rotation: 0,
  size: 0.62,
  glow: 0.45,
  ratio: 1,
};

export const DEFAULT_WEATHER: Weather = { fog: 0, haze: 0.18, frost: 0, heat: 0, clouds: 0, pixel: 0, dusk: 0 };
export const DEFAULT_MOTION: Motion = { mode: 'none', speed: 0.5, duration: 8 };
export const DEFAULT_INTERACT: Interact = { mode: 'none', strength: 0.6 };

// Default mesh layout: points spread on a loose ellipse so any palette looks good as a mesh.
function meshSpot(i: number, n: number): { x: number; y: number } {
  if (n === 1) return { x: 0.5, y: 0.5 };
  const a = (i / n) * Math.PI * 2 + 0.6;
  return { x: 0.5 + Math.cos(a) * 0.3, y: 0.5 + Math.sin(a) * 0.28 };
}

export function pointsFromColors(colors: string[]): ColorPoint[] {
  return colors.slice(0, MAX_POINTS).map((color, i) => ({
    id: uid('pt'),
    color: color.toUpperCase(),
    pos: colors.length === 1 ? 0 : i / (colors.length - 1),
    ...meshSpot(i, colors.length),
    size: 0.45,
  }));
}

export interface GradientSeed {
  name: string;
  place: string;
  time: string;
  coords?: string;
  collection?: string;
  type?: GradientType;
  colors: string[];
  angle?: number;
  background?: string;
  composition?: Partial<Composition>;
  weather?: Partial<Weather>;
  motion?: Partial<Motion>;
  interact?: Partial<Interact>;
  center?: { x: number; y: number };
}

export function makeGradient(seed: GradientSeed): Gradient {
  return {
    id: uid('grad'),
    name: seed.name,
    place: seed.place,
    time: seed.time,
    coords: seed.coords,
    collection: seed.collection,
    type: seed.type ?? 'linear',
    angle: seed.angle ?? 180,
    center: seed.center ?? { x: 0.5, y: 0.5 },
    background: seed.background ?? seed.colors[seed.colors.length - 1],
    points: pointsFromColors(seed.colors),
    composition: { ...DEFAULT_COMPOSITION, ...seed.composition },
    weather: { ...DEFAULT_WEATHER, ...seed.weather },
    motion: { ...DEFAULT_MOTION, ...seed.motion },
    interact: { ...DEFAULT_INTERACT, ...seed.interact },
  };
}

export function cloneGradient(g: Gradient, fresh = true): Gradient {
  const c: Gradient = JSON.parse(JSON.stringify(g));
  if (fresh) c.id = uid('grad');
  return c;
}

export const sortedStops = (g: Gradient) => [...g.points].sort((a, b) => a.pos - b.pos);

/** Stable key used to cache rendered thumbnails. */
export function gradientKey(g: Gradient): string {
  const { id: _id, name: _n, place: _p, time: _t, coords: _c, collection: _col, ...rest } = g;
  return JSON.stringify(rest);
}

/** Fill in any fields missing from older or hand-written project JSON. */
export function hydrateGradient(raw: Partial<Gradient>): Gradient {
  const base = makeGradient({ name: 'UNTITLED', place: 'SOMEWHERE', time: '12:00', colors: ['#A9C8EC', '#F6B47A'] });
  const g: Gradient = {
    ...base,
    ...raw,
    composition: { ...DEFAULT_COMPOSITION, ...raw.composition },
    weather: { ...DEFAULT_WEATHER, ...raw.weather },
    motion: { ...DEFAULT_MOTION, ...raw.motion },
    interact: { ...DEFAULT_INTERACT, ...raw.interact },
    center: raw.center ?? base.center,
  } as Gradient;
  if (!Array.isArray(g.points) || g.points.length === 0) g.points = base.points;
  g.points = g.points.slice(0, MAX_POINTS).map((p, i) => ({
    id: p.id ?? uid('pt'),
    color: p.color ?? '#FFFFFF',
    pos: p.pos ?? i / Math.max(1, g.points.length - 1),
    x: p.x ?? 0.5,
    y: p.y ?? 0.5,
    size: p.size ?? 0.45,
    locked: p.locked,
  }));
  return g;
}
