// Shared between the /api/generate function and the browser: the JSON shape Claude
// returns for "text → gradient", and a sanitizer that never trusts it blindly.
import type { FrameShape, GradientType, InteractMode, MotionMode, Symmetry } from '../types';

export const TYPES: GradientType[] = ['linear', 'radial', 'conic', 'mesh', 'frame', 'aperture', 'bands', 'halo'];
export const SYMMETRIES: Symmetry[] = ['none', 'mirror', 'quadrant', 'kaleido'];
export const MOTIONS: MotionMode[] = ['none', 'drift', 'rotate', 'pulse', 'flow'];
export const SHAPES: FrameShape[] = ['square', 'circle', 'arch'];
export const INTERACTS: InteractMode[] = ['none', 'follow', 'repel', 'lens'];
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
  size: number;
  glow: number;
  bands: number;
  shape: FrameShape;
  ratio: number;
  softness: number;
  rotation: number;
  centerX: number;
  centerY: number;
  slices: number;
  pixel: number;
  speed: number;
  duration: number;
  interact: InteractMode;
  interactStrength: number;
  background: string;
  points: { pos: number; x: number; y: number; size: number }[];
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
  required: ['name', 'place', 'time', 'coords', 'type', 'angle', 'colors', 'points', 'background', 'symmetry', 'slices', 'rotation', 'centerX', 'centerY', 'shape', 'ratio', 'softness', 'size', 'glow', 'bands', 'motion', 'speed', 'duration', 'interact', 'interactStrength', 'pixel', 'fog', 'haze', 'frost', 'clouds', 'heat', 'dusk', 'note'],
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
    speed: { ...num, description: '0-1 motion intensity (0.2 subtle, 0.5 medium, 0.9 strong)' },
    duration: { ...num, description: '4-30 seconds per seamless motion loop (slow skies 12-20)' },
    interact: { type: 'string', enum: INTERACTS, description: 'Cursor reaction: none, follow (drawn to the pointer), repel (pushed away), lens (magnifying bulge)' },
    interactStrength: { ...num, description: '0-1 cursor reaction strength' },
    pixel: { ...num, description: '0-1 pixelation; only for retro or 8-bit moods, else 0' },
    points: {
      type: 'array',
      description: 'One entry per colour, same order. pos = where it sits along the ramp (0-1, increasing). x, y = where a mesh blob sits (0-1, y down). size = mesh blob spread (0.05-1). Use [] to spread colours evenly.',
      items: { type: 'object', additionalProperties: false, required: ['pos', 'x', 'y', 'size'], properties: { pos: num, x: num, y: num, size: num } },
    },
    background: { ...str, description: 'Hex base colour behind mesh blobs, usually the darkest or the sky colour' },
    slices: { ...num, description: '2-16 kaleido slices (only used with symmetry kaleido); 6 if unused' },
    rotation: { ...num, description: '-180 to 180 degrees, turns the whole composition' },
    centerX: { ...num, description: '0-1 horizontal centre for radial, conic, frame, aperture and halo (0.5 = middle)' },
    centerY: { ...num, description: '0-1 vertical centre, y down (0.5 = middle, 1 = bottom edge, e.g. a sun on the horizon)' },
    shape: { type: 'string', enum: SHAPES, description: 'Frame and aperture shape' },
    ratio: { ...num, description: 'Aperture / halo width ÷ height: 1 = true circle or square, 0.5 = twice as tall, 2 = twice as wide' },
    softness: { ...num, description: '0-1: frame band softness, aperture edge softness, bands seam softness, halo ring thickness' },
    size: { ...num, description: '0.1-1.2 size of the aperture window or halo ring; 0.6 if unused' },
    glow: { ...num, description: '0-1 light spilling past the aperture edge onto the wall, or halo corona; 0.45 if unused' },
    bands: { ...num, description: '2-8 number of bands for the bands type (also frame bands); 3 if unused' },
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

How Atmos draws (use this to pick controls deliberately):
- colors: 3 to 6, in order. For ramp types they run along the ramp from first to last; points[].pos sets where each sits (0-1, increasing) so you can make a colour occupy more or less space. Use [] for even spacing.
- type:
  linear: a straight ramp; angle sets direction (CSS convention, 180 = top to bottom, 0 = bottom to top, 90 = left to right). Sky scenes usually run zenith to horizon with angle 180.
  radial: rings from centerX/centerY outward, first colour at the centre. A low sun: centerY near 1.
  conic: sweeps around the centre from angle; spinning or crystalline ideas.
  mesh: soft blobs of colour on the background colour; points[].x/y place each blob (0-1, y down) and size sets its spread. Organic, cloudy, watery scenes.
  frame: nested soft bands of the shape toward the centre (poster-like); bands sets how many, softness their blur.
  aperture: a single window of light set in a wall, like a James Turrell Skyspace, Ganzfeld or light installation. Colours run wall -> edge glow -> inner field. shape picks square, circle or arch (arch = chapel window); ratio makes it taller (<1) or wider (>1); size its size; softness its edge; glow the light spilling onto the wall.
  bands: stacked soft fields of colour, for horizons, seascapes, strata and Rothko-like pieces; bands = how many, softness = painterly seams, angle 180 = horizontal.
  halo: a ring of light with a corona, for eclipses, moon rings and rings of light. Colours run background sky -> ring. size = ring size, ratio = oval ring, softness = ring thickness, glow = corona.
- symmetry: none (default), mirror (left/right), quadrant (four mirrored copies), kaleido (slices around the centre). Aperture and halo are always none.
- rotation turns the whole composition. centerX/centerY move radial, conic, frame, aperture and halo.
- weather: fog = soft blur, haze = film grain, frost = ordered dither (retro), clouds = drifting noise warp, heat = shimmer (deserts, fire), dusk = vignette, pixel = pixelation (8-bit only).
- motion: none, drift (gentle wandering), rotate (slow turn), pulse (breathing), flow (liquid swirl). speed 0-1, duration = seconds per seamless loop.
- interact: how it reacts to the cursor on screen: none, follow, repel, lens.

Guidance:
- Pick the type that best matches the subject, then set its own controls with intent; leave unrelated controls at neutral values (rotation 0, centre 0.5, slices 6, bands 3, size 0.6, glow 0.45, ratio 1).
- If the user names a shape or proportion (round, arched, tall, wide, narrow slit), set shape and ratio to match.
- Keep weather subtle: haze 0.15-0.4 for texture, fog up to 0.5 for mist, frost and pixel only for pixel or retro moods, heat only for deserts or fire.
- motion is "none" unless the description implies movement; interact is "none" unless it asks for something interactive.
- Names and places are uppercase. Everything must be safe for all audiences.
If the description is not about colours or a scene, interpret it loosely as a mood.`;

const HEX = /^#?[0-9a-f]{6}$/i;
const clamp01 = (v: unknown, max = 1) => Math.min(max, Math.max(0, typeof v === 'number' && Number.isFinite(v) ? v : 0));
const numIn = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
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
    size: typeof r.size === 'number' && Number.isFinite(r.size) ? Math.min(1.2, Math.max(0.1, r.size)) : 0.62,
    glow: typeof r.glow === 'number' && Number.isFinite(r.glow) ? clamp01(r.glow) : 0.45,
    bands: typeof r.bands === 'number' && Number.isFinite(r.bands) ? Math.min(8, Math.max(2, Math.round(r.bands))) : 3,
    shape: pick(r.shape, SHAPES, 'square'),
    ratio: numIn(r.ratio, 0.35, 2.8, 1),
    softness: numIn(r.softness, 0, 1, 0.7),
    rotation: numIn(r.rotation, -180, 180, 0),
    centerX: numIn(r.centerX, -0.2, 1.2, 0.5),
    centerY: numIn(r.centerY, -0.2, 1.2, 0.5),
    slices: Math.round(numIn(r.slices, 2, 16, 6)),
    pixel: clamp01(r.pixel, 0.8),
    speed: numIn(r.speed, 0, 1, 0.5),
    duration: numIn(r.duration, 4, 30, 10),
    interact: pick(r.interact, INTERACTS, 'none'),
    interactStrength: numIn(r.interactStrength, 0, 1, 0.6),
    background: typeof r.background === 'string' && HEX.test(r.background.trim()) ? `#${r.background.trim().replace('#', '').toUpperCase()}` : colors[colors.length - 1],
    points: (Array.isArray(r.points) ? r.points : []).slice(0, colors.length).map((p) => {
      const q = (p ?? {}) as Record<string, unknown>;
      return { pos: numIn(q.pos, 0, 1, 0), x: numIn(q.x, 0, 1, 0.5), y: numIn(q.y, 0, 1, 0.5), size: numIn(q.size, 0.05, 1, 0.45) };
    }),
    fog: clamp01(r.fog, 0.8),
    haze: clamp01(r.haze, 0.7),
    frost: clamp01(r.frost, 0.8),
    clouds: clamp01(r.clouds, 0.8),
    heat: clamp01(r.heat, 0.8),
    dusk: clamp01(r.dusk, 0.8),
    note: text(r.note, 120, ''),
  };
}
