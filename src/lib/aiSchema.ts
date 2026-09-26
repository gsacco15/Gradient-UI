// Shared between the /api/generate function and the browser: the JSON shape Claude
// returns for "text → gradient", and a sanitizer that never trusts it blindly.
import type { GradientType, MotionMode, Symmetry } from '../types';

export const TYPES: GradientType[] = ['linear', 'radial', 'conic', 'mesh', 'frame'];
export const SYMMETRIES: Symmetry[] = ['none', 'mirror', 'quadrant', 'kaleido'];
export const MOTIONS: MotionMode[] = ['none', 'drift', 'rotate', 'pulse', 'flow'];
export const MAX_PROMPT = 200;

export interface AiGradient {
  name: string;
  place: string;
  time: string;
  coords: string;
  type: GradientType;
  angle: number;
  colors: string[];
  symmetry: Symmetry;
  motion: MotionMode;
  fog: number;
  haze: number;
  frost: number;
  clouds: number;
  heat: number;
  dusk: number;
  note: string;
}

const num = { type: 'number' } as const;
const str = { type: 'string' } as const;

export const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'place', 'time', 'coords', 'type', 'angle', 'colors', 'symmetry', 'motion', 'fog', 'haze', 'frost', 'clouds', 'heat', 'dusk', 'note'],
  properties: {
    name: { type: 'string', description: 'Evocative 1-3 word colour name in caps, e.g. GLACIER HOUR' },
    place: { type: 'string', description: 'A real place in caps, e.g. ICELAND FJORD' },
    time: { type: 'string', description: 'Local time HH:MM' },
    coords: { type: 'string', description: 'Approximate coordinates, e.g. 64.14° N · 21.94° W' },
    type: { type: 'string', enum: TYPES },
    angle: { ...num, description: 'Degrees 0-360, CSS convention (180 = top to bottom)' },
    colors: { type: 'array', items: { type: 'string', description: 'Hex colour #RRGGBB' }, description: '3 to 6 colours in gradient order' },
    symmetry: { type: 'string', enum: SYMMETRIES },
    motion: { type: 'string', enum: MOTIONS },
    fog: { ...num, description: '0-1 soft blur' },
    haze: { ...num, description: '0-1 film grain' },
    frost: { ...num, description: '0-1 ordered dither' },
    clouds: { ...num, description: '0-1 noise warp' },
    heat: { ...num, description: '0-1 shimmer' },
    dusk: { ...num, description: '0-1 vignette' },
    note: { ...str, description: 'One short sentence describing the scene, under 90 characters' },
  },
} as const;

export const SYSTEM_PROMPT = `You design gradients for Atmos, a studio where every colour is a place and a moment in nature.
Turn the user's description into one gradient. Choose a real place and a time of day that fit the mood, and colours that feel observed rather than generic.
Guidance:
- 3 to 6 colours, ordered as they should appear. Sky scenes usually run zenith to horizon with angle 180.
- mesh suits organic, cloudy or watery scenes; frame suits poster-like nested soft squares; radial suits a sun, moon or glow; conic suits spinning or crystalline ideas.
- Keep weather subtle: haze 0.15-0.4 for texture, fog up to 0.5 for mist, frost only for pixel or retro moods, heat only for deserts or fire.
- motion is "none" unless the description implies movement.
- Names and places are uppercase. Everything must be safe for all audiences.
If the description is not about colours or a scene, interpret it loosely as a mood.`;

const HEX = /^#?[0-9a-f]{6}$/i;
const clamp01 = (v: unknown, max = 1) => Math.min(max, Math.max(0, typeof v === 'number' && Number.isFinite(v) ? v : 0));
const text = (v: unknown, n: number, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : fallback);

/** Clamp and validate model output into something the renderer can always draw. */
export function sanitizeAi(raw: unknown): AiGradient | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const colors = (Array.isArray(r.colors) ? r.colors : [])
    .filter((c): c is string => typeof c === 'string' && HEX.test(c.trim()))
    .map((c) => `#${c.trim().replace('#', '').toUpperCase()}`)
    .slice(0, 6);
  if (colors.length < 2) return null;
  const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
  return {
    name: text(r.name, 28, 'UNTITLED').toUpperCase(),
    place: text(r.place, 32, 'SOMEWHERE').toUpperCase(),
    time: /^\d{1,2}:\d{2}$/.test(String(r.time)) ? String(r.time).padStart(5, '0') : '12:00',
    coords: text(r.coords, 32, ''),
    type: pick(r.type, TYPES, 'mesh'),
    angle: typeof r.angle === 'number' && Number.isFinite(r.angle) ? ((r.angle % 360) + 360) % 360 : 180,
    colors,
    symmetry: pick(r.symmetry, SYMMETRIES, 'none'),
    motion: pick(r.motion, MOTIONS, 'none'),
    fog: clamp01(r.fog, 0.8),
    haze: clamp01(r.haze, 0.7),
    frost: clamp01(r.frost, 0.8),
    clouds: clamp01(r.clouds, 0.8),
    heat: clamp01(r.heat, 0.8),
    dusk: clamp01(r.dusk, 0.8),
    note: text(r.note, 120, ''),
  };
}
