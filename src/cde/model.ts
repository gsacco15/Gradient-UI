// CDE Lab model: a paper town, who is in it at each hour, and a Monte Carlo collateral damage estimate.
// Everything here is pure and seeded, so the page and the Jev workers compute identical numbers.
// Weapon radii, occupancy and thresholds are simplified and illustrative, not real planning data.

export type Kind = 'home' | 'shop' | 'school' | 'warehouse' | 'clinic' | 'market';
export type Paper = 'white' | 'kraft';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Building {
  id: number;
  kind: Kind;
  rects: Rect[];
  h: number; // height in metres
  paper: Paper;
  label?: string;
  cx: number;
  cy: number;
  area: number;
  capacity: number; // people it can hold at 100%
  shield: number; // multiplier on fragment harm for people inside (1 = in the open)
  slots: Float32Array; // x,y pairs: where people stand inside, in a fixed order
  roof: { x: number; y: number; kind: 'tank' | 'box' }[];
}

export interface Street {
  x: number;
  y: number;
  w: number;
  h: number;
  main: boolean;
  horizontal: boolean;
}

export interface Tree {
  x: number;
  y: number;
  r: number;
}

export interface World {
  w: number;
  h: number;
  seed: number;
  streets: Street[];
  blocks: Rect[];
  buildings: Building[];
  trees: Tree[];
  targetId: number;
  schoolId: number;
  streetSlots: Float32Array; // x,y pairs on the pavements
  hStreets: number[]; // street centre lines, for walking paths
  vStreets: number[];
}

// ---------------------------------------------------------------- random

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;

function normal(r: Rng) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// Marsaglia–Tsang gamma (shape k, scale 1).
function gamma(r: Rng, k: number): number {
  if (k < 1) return gamma(r, k + 1) * Math.pow(r(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = normal(r);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function poisson(r: Rng, mean: number): number {
  if (mean <= 0) return 0;
  if (mean > 40) return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal(r)));
  const L = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

// ---------------------------------------------------------------- the town

export const WORLD_W = 450;
export const WORLD_H = 300;
const V_STREETS = [0, 150, 300, 450];
const H_STREETS = [0, 150, 300];
const MAIN_Y = 150;
const streetHalf = (main: boolean) => (main ? 9 : 6);

const overlaps = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
export const inRect = (r: Rect, x: number, y: number, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/** Distance from a point to a rect's edge (0 inside). */
export function rectDist(r: Rect, x: number, y: number) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}
export const buildingDist = (b: Building, x: number, y: number) => Math.min(...b.rects.map((r) => rectDist(r, x, y)));
export const inBuilding = (b: Building, x: number, y: number, pad = 0) => b.rects.some((r) => inRect(r, x, y, pad));

const M2_PER_PERSON: Record<Kind, number> = { home: 16, shop: 14, school: 8, warehouse: 70, clinic: 10, market: 4 };
const HEIGHTS: Record<Kind, [number, number]> = { home: [5, 11], shop: [4, 6], school: [8, 8], warehouse: [10, 10], clinic: [9, 9], market: [2.5, 2.5] };

function makeBuilding(r: Rng, id: number, kind: Kind, rects: Rect[], paper: Paper, label?: string): Building {
  const area = rects.reduce((s, q) => s + q.w * q.h, 0);
  const cx = rects.reduce((s, q) => s + (q.x + q.w / 2) * q.w * q.h, 0) / area;
  const cy = rects.reduce((s, q) => s + (q.y + q.h / 2) * q.w * q.h, 0) / area;
  const [h0, h1] = HEIGHTS[kind];
  const capacity = Math.max(1, Math.round(area / M2_PER_PERSON[kind]));
  // Slots: well spread points (a jittered grid, shuffled) so the first N always look evenly scattered.
  const n = Math.ceil(capacity * 1.6) + 4;
  const pts: number[] = [];
  let guard = 0;
  while (pts.length < n * 2 && guard++ < n * 40) {
    const q = rects[Math.floor(r() * rects.length)];
    const x = q.x + 1.2 + r() * Math.max(0.5, q.w - 2.4);
    const y = q.y + 1.2 + r() * Math.max(0.5, q.h - 2.4);
    let ok = true;
    for (let i = 0; i < pts.length && ok; i += 2) if (Math.hypot(pts[i] - x, pts[i + 1] - y) < 1.6 - guard / (n * 40)) ok = false;
    if (ok) pts.push(x, y);
  }
  const roof: Building['roof'] = [];
  if (kind === 'home' || kind === 'shop' || kind === 'clinic') {
    const q = rects[0];
    const count = r() < 0.55 ? 1 : r() < 0.5 ? 2 : 0;
    for (let i = 0; i < count; i++) roof.push({ x: q.x + 2.5 + r() * (q.w - 5), y: q.y + 2.5 + r() * (q.h - 5), kind: r() < 0.5 ? 'tank' : 'box' });
  }
  return {
    id,
    kind,
    rects,
    h: h0 + r() * (h1 - h0),
    paper,
    label,
    cx,
    cy,
    area,
    capacity,
    shield: kind === 'market' ? 1 : paper === 'white' ? 0.5 : 0.62,
    slots: new Float32Array(pts),
    roof,
  };
}

const worldCache = new Map<number, World>();

export function buildWorld(seed = 7): World {
  const hit = worldCache.get(seed);
  if (hit) return hit;
  const r = rng(seed);
  const streets: Street[] = [];
  for (const x of V_STREETS) streets.push({ x: x - 6, y: 0, w: 12, h: WORLD_H, main: false, horizontal: false });
  for (const y of H_STREETS) {
    const hw = streetHalf(y === MAIN_Y);
    streets.push({ x: 0, y: y - hw, w: WORLD_W, h: hw * 2, main: y === MAIN_Y, horizontal: true });
  }
  const blocks: Rect[] = [];
  for (let i = 0; i < V_STREETS.length - 1; i++)
    for (let j = 0; j < H_STREETS.length - 1; j++) {
      const x0 = V_STREETS[i] + 6;
      const x1 = V_STREETS[i + 1] - 6;
      const y0 = H_STREETS[j] + streetHalf(H_STREETS[j] === MAIN_Y);
      const y1 = H_STREETS[j + 1] - streetHalf(H_STREETS[j + 1] === MAIN_Y);
      blocks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }

  const buildings: Building[] = [];
  let id = 0;
  // The specials, placed by hand so the story reads: a warehouse on the main road, a school across it.
  const target = makeBuilding(r, id++, 'warehouse', [{ x: 206, y: 112, w: 38, h: 27 }], 'white', 'Warehouse');
  const school = makeBuilding(r, id++, 'school', [{ x: 192, y: 163, w: 62, h: 14 }, { x: 192, y: 177, w: 13, h: 27 }], 'kraft', 'School');
  const clinic = makeBuilding(r, id++, 'clinic', [{ x: 318, y: 163, w: 28, h: 20 }], 'white', 'Clinic');
  const stalls: Rect[] = [];
  for (let i = 0; i < 6; i++) stalls.push({ x: 64 + i * 7.5, y: 131, w: 6, h: 6 });
  const market = makeBuilding(r, id++, 'market', stalls, 'white', 'Market');
  buildings.push(target, school, clinic, market);
  const reserved: Rect[] = [
    { x: 200, y: 104, w: 50, h: 38 }, // warehouse yard
    { x: 188, y: 160, w: 76, h: 50 }, // school and its playground
    { x: 60, y: 126, w: 50, h: 16 }, // market
  ];
  const free = (q: Rect) => !reserved.some((z) => overlaps(q, z, 1)) && !buildings.some((b) => b.rects.some((z) => overlaps(q, z, 1.2)));

  const add = (q: Rect, onMain: boolean) => {
    if (q.w < 9 || q.h < 9 || !free(q)) return;
    const kind: Kind = onMain && r() < 0.6 ? 'shop' : 'home';
    buildings.push(makeBuilding(r, id++, kind, [q], r() < 0.38 ? 'kraft' : 'white'));
  };

  for (const bl of blocks) {
    const inset = 3;
    const L = bl.x + inset;
    const R = bl.x + bl.w - inset;
    const T = bl.y + inset;
    const B = bl.y + bl.h - inset;
    const southOnMain = Math.abs(bl.y + bl.h - (MAIN_Y - 9)) < 1;
    const northOnMain = Math.abs(bl.y - (MAIN_Y + 9)) < 1;
    // North and south rows.
    for (const edge of ['n', 's'] as const) {
      let x = L;
      while (x < R - 9) {
        let w = 13 + r() * 15;
        if (R - (x + w) < 10) w = R - x;
        const d = 14 + r() * 10;
        add({ x, y: edge === 'n' ? T : B - d, w, h: d }, (edge === 's' && southOnMain) || (edge === 'n' && northOnMain));
        x += w + (r() < 0.45 ? 0 : 1.5 + r() * 4);
      }
    }
    // West and east columns between the rows.
    for (const edge of ['w', 'e'] as const) {
      let y = T + 26;
      while (y < B - 34) {
        let hgt = 13 + r() * 12;
        if (B - 26 - (y + hgt) < 10) hgt = B - 26 - y;
        const d = 14 + r() * 8;
        add({ x: edge === 'w' ? L : R - d, y, w: d, h: hgt }, false);
        y += hgt + (r() < 0.4 ? 0 : 2 + r() * 4);
      }
    }
    // Sometimes a house in the courtyard.
    if (r() < 0.6) add({ x: bl.x + bl.w / 2 - 10 + (r() - 0.5) * 20, y: bl.y + bl.h / 2 - 8, w: 16 + r() * 8, h: 13 + r() * 6 }, false);
  }

  // Trees: street trees along the main road and a scatter in courtyards and the playground.
  const trees: Tree[] = [];
  const treeFree = (x: number, y: number, rad: number) =>
    !buildings.some((b) => inBuilding(b, x, y, rad + 0.6)) && !trees.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + rad + 1) && !streets.some((s) => inRect(s, x, y, -0.5));
  for (let x = 6; x < WORLD_W; x += 9 + r() * 10) {
    for (const y of [MAIN_Y - 10.8, MAIN_Y + 10.8]) {
      const rad = 1.6 + r() * 1;
      if (r() < 0.55 && treeFree(x, y, rad)) trees.push({ x, y, r: rad });
    }
  }
  for (let i = 0; i < 900; i++) {
    const bl = blocks[Math.floor(r() * blocks.length)];
    const x = bl.x + 5 + r() * (bl.w - 10);
    const y = bl.y + 5 + r() * (bl.h - 10);
    const rad = 1.8 + r() * 1.6;
    if (treeFree(x, y, rad)) trees.push({ x, y, r: rad });
    if (trees.length > 80) break;
  }
  for (const [x, y] of [[222, 196], [236, 188], [246, 200], [214, 202]]) trees.push({ x, y, r: 2.4 + r() });

  // Pavement slots: where people on foot might be.
  const pts: number[] = [];
  for (const bl of blocks) {
    const e = 1.4;
    for (let x = bl.x + e; x < bl.x + bl.w - e; x += 3) pts.push(x, bl.y + e, x, bl.y + bl.h - e);
    for (let y = bl.y + e + 3; y < bl.y + bl.h - e - 3; y += 3) pts.push(bl.x + e, y, bl.x + bl.w - e, y);
  }
  // The playground: children out at break are in the open.
  for (let x = 210; x < 252; x += 4) for (let y = 180; y < 204; y += 4) pts.push(x, y);

  const w: World = {
    w: WORLD_W,
    h: WORLD_H,
    seed,
    streets,
    blocks,
    buildings,
    trees,
    targetId: target.id,
    schoolId: school.id,
    streetSlots: new Float32Array(pts),
    hStreets: H_STREETS,
    vStreets: V_STREETS,
  };
  worldCache.set(seed, w);
  return w;
}

// ---------------------------------------------------------------- pattern of life

// Share of capacity present, hour by hour (00..23).
const SCHEDULE: Record<Kind, number[]> = {
  //      0    1    2    3    4    5    6    7    8    9    10   11   12   13   14   15   16   17   18   19   20   21   22   23
  home: [0.95, 0.96, 0.96, 0.96, 0.95, 0.9, 0.8, 0.62, 0.45, 0.36, 0.33, 0.34, 0.45, 0.48, 0.4, 0.38, 0.45, 0.58, 0.7, 0.82, 0.88, 0.9, 0.93, 0.94],
  shop: [0.02, 0.02, 0.02, 0.02, 0.02, 0.03, 0.1, 0.25, 0.5, 0.65, 0.7, 0.72, 0.6, 0.55, 0.62, 0.7, 0.75, 0.78, 0.7, 0.55, 0.35, 0.15, 0.05, 0.03],
  school: [0, 0, 0, 0, 0, 0, 0.01, 0.2, 0.92, 0.95, 0.9, 0.95, 0.7, 0.9, 0.6, 0.15, 0.05, 0.02, 0.01, 0, 0, 0, 0, 0],
  warehouse: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.1, 0.35, 0.6, 0.7, 0.7, 0.7, 0.5, 0.65, 0.7, 0.7, 0.6, 0.35, 0.1, 0.05, 0.05, 0.05, 0.05, 0.05],
  clinic: [0.25, 0.22, 0.2, 0.2, 0.2, 0.22, 0.3, 0.45, 0.7, 0.85, 0.9, 0.9, 0.8, 0.8, 0.85, 0.85, 0.8, 0.7, 0.55, 0.45, 0.35, 0.3, 0.28, 0.26],
  market: [0, 0, 0, 0, 0, 0.02, 0.15, 0.45, 0.8, 0.9, 0.95, 0.9, 0.7, 0.6, 0.7, 0.8, 0.85, 0.75, 0.45, 0.15, 0.03, 0, 0, 0],
};
// Share of pavement slots with someone on them.
const STREET = [0.01, 0.005, 0.003, 0.003, 0.004, 0.02, 0.06, 0.14, 0.2, 0.12, 0.1, 0.11, 0.16, 0.15, 0.11, 0.13, 0.17, 0.2, 0.17, 0.12, 0.08, 0.05, 0.03, 0.015];
// The playground slots are only busy at break.
const PLAYGROUND = [0, 0, 0, 0, 0, 0, 0, 0.02, 0.05, 0.1, 0.55, 0.05, 0.6, 0.1, 0.05, 0.3, 0, 0, 0, 0, 0, 0, 0, 0];

const lerpHour = (arr: number[], hour: number) => {
  const h = ((hour % 24) + 24) % 24;
  const i = Math.floor(h);
  const t = h - i;
  return arr[i] * (1 - t) + arr[(i + 1) % 24] * t;
};

export interface Population {
  hour: number;
  expected: Float32Array; // per building
  observed: Int16Array; // per building, -1 = nothing seen
  cv: number; // uncertainty of the expected counts
  streetQ: number; // chance a pavement slot is occupied
  playQ: number;
  playStart: number; // index (in slots, not floats) where the playground slots begin
}

export type Observations = Record<number, number>;

/** Who we think is where at this hour. Hours watched narrows the uncertainty; spotted people are counted as known. */
export function population(world: World, hour: number, watchedHours: number, obs: Observations = {}): Population {
  const expected = new Float32Array(world.buildings.length);
  const observed = new Int16Array(world.buildings.length).fill(-1);
  for (const b of world.buildings) {
    expected[b.id] = b.capacity * lerpHour(SCHEDULE[b.kind], hour);
    if (obs[b.id] != null) observed[b.id] = obs[b.id];
  }
  const playSlots = 11 * 6;
  return {
    hour,
    expected,
    observed,
    cv: 0.75 / Math.sqrt(1 + watchedHours / 8),
    streetQ: lerpHour(STREET, hour),
    playQ: lerpHour(PLAYGROUND, hour),
    playStart: world.streetSlots.length / 2 - playSlots,
  };
}

/** How many people to draw in a building (the model's central guess, or what was seen). */
export function shownCount(p: Population, b: Building) {
  const o = p.observed[b.id];
  return Math.min(b.slots.length / 2, o >= 0 ? o : Math.round(p.expected[b.id]));
}

export function totalExpected(p: Population) {
  let s = 0;
  for (let i = 0; i < p.expected.length; i++) s += p.observed[i] >= 0 ? p.observed[i] : p.expected[i];
  return s;
}

// ---------------------------------------------------------------- weapons

export type WeaponId = 'large' | 'medium' | 'small' | 'focused';
export type FuzeId = 'instant' | 'delay' | 'airburst';

export interface Weapon {
  id: WeaponId;
  name: string;
  short: string;
  blast: number; // metres of heavy blast damage
  frag: number; // metres of dangerous fragments
  cep: number; // metres: half the bombs land within this of the aim
  note: string;
}

export const WEAPONS: Weapon[] = [
  { id: 'large', name: '2,000-lb class', short: '2,000 lb', blast: 22, frag: 120, cep: 6, note: 'Destroys almost anything. Throws fragments a very long way.' },
  { id: 'medium', name: '500-lb class', short: '500 lb', blast: 13, frag: 75, cep: 6, note: 'The workhorse. Enough for most buildings.' },
  { id: 'small', name: '250-lb small-diameter', short: '250 lb', blast: 8, frag: 45, cep: 5, note: 'Narrow body, less explosive, smaller footprint.' },
  { id: 'focused', name: 'Low-collateral, dense case', short: 'Low-collateral', blast: 7, frag: 14, cep: 4, note: 'A casing that crumbles into dust, not fragments.' },
];
export const weapon = (id: WeaponId) => WEAPONS.find((w) => w.id === id)!;

export interface Fuze {
  id: FuzeId;
  name: string;
  note: string;
}
export const FUZES: Fuze[] = [
  { id: 'instant', name: 'Impact', note: 'Goes off on the roof. Fragments fly freely.' },
  { id: 'delay', name: 'Delay', note: 'Punches in first, goes off inside. Walls catch most fragments.' },
  { id: 'airburst', name: 'Airburst', note: 'Goes off above. Widest spray; weakest on the building.' },
];

export interface Plan {
  weapon: WeaponId;
  fuze: FuzeId;
  heading: number; // degrees, the direction the bomb is travelling (0 = north, 90 = east)
  aimX: number;
  aimY: number;
  hour: number;
  watched: number; // hours of observation
  hardness: number; // metres of blast the target needs
  stored: boolean; // suspected munitions inside (secondary explosion)
}

export const HARDNESS = { light: 9, standard: 12, reinforced: 17 } as const;

/** 0..1: how strongly the fragment pattern leans toward a direction (1 = straight ahead). */
export function lobe(heading: number, dx: number, dy: number) {
  const h = (heading * Math.PI) / 180;
  const len = Math.hypot(dx, dy) || 1;
  const c = (Math.sin(h) * dx - Math.cos(h) * dy) / len;
  return ((1 + c) / 2) ** 2;
}

export interface Effect {
  blast: number;
  frag: number;
  fragP: number; // peak chance of harm from fragments, in the open
  shieldPow: number; // <1 makes walls and roofs protect less
  bury: number; // multiplier on fragments when the bomb goes off inside something
}

export function effect(plan: Plan, insideBuilding: boolean): Effect {
  const w = weapon(plan.weapon);
  if (plan.fuze === 'delay') {
    return insideBuilding
      ? { blast: w.blast * 1.4, frag: w.frag * 0.6, fragP: 0.55 * 0.35, shieldPow: 1, bury: 1 }
      : { blast: w.blast * 0.8, frag: w.frag * 0.55, fragP: 0.55 * 0.5, shieldPow: 1, bury: 1 };
  }
  if (plan.fuze === 'airburst') return { blast: w.blast * 0.75, frag: w.frag * 1.3, fragP: 0.55 * 1.2, shieldPow: 0.7, bury: 1 };
  return { blast: w.blast, frag: w.frag, fragP: 0.55, shieldPow: 1, bury: 1 };
}

/** Chance someone at (x, y) is killed or badly hurt by a bomb going off at (ix, iy). shield = 1 in the open. */
export function harm(plan: Plan, e: Effect, ix: number, iy: number, x: number, y: number, shield: number, sameBuilding: boolean) {
  const dx = x - ix;
  const dy = y - iy;
  const rb = sameBuilding && plan.fuze === 'delay' ? e.blast * 1.1 : e.blast;
  const far = Math.max(rb * 1.25, e.frag);
  if (dx > far || dx < -far || dy > far || dy < -far) return 0;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d >= far) return 0;
  let pb = 0;
  if (d < rb * 0.8) pb = 0.95;
  else if (d < rb * 1.25) pb = (0.95 * (rb * 1.25 - d)) / (rb * 0.45);
  let pf = 0;
  const g = lobe(plan.heading, dx, dy);
  const reach = e.frag * (0.55 + 0.45 * g);
  if (d < reach) {
    const s = shield >= 1 ? 1 : Math.pow(shield, e.shieldPow);
    pf = e.fragP * (0.5 + 0.5 * g) * (1 - d / reach) ** 1.5 * s;
  }
  return 1 - (1 - pb) * (1 - pf);
}

/** Would a bomb going off at (ix, iy) destroy the target? */
export function destroys(world: World, plan: Plan, ix: number, iy: number) {
  const t = world.buildings[world.targetId];
  const inside = inBuilding(t, ix, iy);
  const e = effect(plan, inside);
  const q = t.rects[0];
  const half = Math.hypot(q.w, q.h) / 2;
  const dc = Math.hypot(ix - t.cx, iy - t.cy);
  const out = buildingDist(t, ix, iy);
  return e.blast >= plan.hardness * (0.6 + (0.8 * dc) / half) + 2 * out;
}

// ---------------------------------------------------------------- the estimate

export interface Estimate {
  runs: number;
  counts: Uint16Array; // civilians killed or badly hurt, per run
  pk: number; // share of runs that destroy the target
  mean: number;
  p50: number;
  p90: number;
  max: number;
  impacts: Float32Array; // x,y of the first few hundred impacts
  byBuilding: Float32Array; // expected harm per building
  street: number; // expected harm to people on foot
  secondary: number; // expected harm from the target's own contents
}

const quantile = (sorted: Uint16Array, q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

export function estimate(world: World, plan: Plan, pop: Population, runs = 400, seed = 1): Estimate {
  const r = rng(seed * 7919 + 13);
  const w = weapon(plan.weapon);
  const sigma = w.cep / 1.1774;
  const maxReach = Math.max(w.frag * 1.3, w.blast * 1.8, plan.stored ? 50 : 0) + sigma * 4;
  const near = world.buildings.filter((b) => buildingDist(b, plan.aimX, plan.aimY) < maxReach);
  const slots = world.streetSlots;
  const nearSlots: number[] = [];
  for (let i = 0; i < slots.length; i += 2) if (Math.hypot(slots[i] - plan.aimX, slots[i + 1] - plan.aimY) < maxReach) nearSlots.push(i);
  const counts = new Uint16Array(runs);
  const keep = Math.min(runs, 400);
  const impacts = new Float32Array(keep * 2);
  const byBuilding = new Float32Array(world.buildings.length);
  const target = world.buildings[world.targetId];
  const k = 1 / (pop.cv * pop.cv);
  let destroyed = 0;
  let street = 0;
  let secondary = 0;
  const secPlan: Plan = { ...plan, heading: 0, fuze: 'instant' };
  const secE: Effect = { blast: 16, frag: 45, fragP: 0.3, shieldPow: 1, bury: 1 };

  for (let run = 0; run < runs; run++) {
    const ix = plan.aimX + normal(r) * sigma;
    const iy = plan.aimY + normal(r) * sigma;
    if (run < keep) {
      impacts[run * 2] = ix;
      impacts[run * 2 + 1] = iy;
    }
    const hitB = near.find((b) => inBuilding(b, ix, iy));
    const e = effect(plan, !!hitB);
    const kill = destroys(world, plan, ix, iy);
    if (kill) destroyed++;
    const sec = kill && plan.stored;
    let c = 0;
    for (const b of near) {
      const o = pop.observed[b.id];
      const mean = pop.expected[b.id];
      let n: number;
      if (o >= 0) n = o + poisson(r, mean * 0.08);
      else n = mean <= 0 ? 0 : poisson(r, mean * gamma(r, k) / k);
      n = Math.min(n, b.slots.length / 2);
      for (let i = 0; i < n; i++) {
        const x = b.slots[i * 2];
        const y = b.slots[i * 2 + 1];
        let p = harm(plan, e, ix, iy, x, y, b.shield, hitB === b);
        if (sec) {
          const ps = harm(secPlan, secE, target.cx, target.cy, x, y, b.shield, b === target);
          secondary += ps;
          p = 1 - (1 - p) * (1 - ps);
        }
        byBuilding[b.id] += p;
        if (r() < p) c++;
      }
    }
    for (const i of nearSlots) {
      const q = i / 2 >= pop.playStart ? pop.playQ : pop.streetQ;
      if (q <= 0 || r() >= q) continue;
      let p = harm(plan, e, ix, iy, slots[i], slots[i + 1], 1, false);
      if (sec) p = 1 - (1 - p) * (1 - harm(secPlan, secE, target.cx, target.cy, slots[i], slots[i + 1], 1, false));
      street += p;
      if (r() < p) c++;
    }
    counts[run] = c;
  }
  for (let i = 0; i < byBuilding.length; i++) byBuilding[i] /= runs;
  const sorted = counts.slice().sort();
  let sum = 0;
  for (const c of counts) sum += c;
  return {
    runs,
    counts,
    pk: destroyed / runs,
    mean: sum / runs,
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    max: sorted[sorted.length - 1] ?? 0,
    impacts,
    byBuilding,
    street: street / runs,
    secondary: secondary / runs,
  };
}

// ---------------------------------------------------------------- the crude circle

export function concernRadius(plan: Plan) {
  const w = weapon(plan.weapon);
  const e = effect(plan, true);
  return Math.round(Math.max(e.frag, w.blast * 1.25) + w.cep);
}

export interface CircleContents {
  radius: number;
  kinds: Record<Kind, number>;
  sensitive: string[]; // named places inside (school, clinic, market)
  people: number;
}

export function inCircle(world: World, plan: Plan, pop: Population): CircleContents {
  const radius = concernRadius(plan);
  const kinds: Record<Kind, number> = { home: 0, shop: 0, school: 0, warehouse: 0, clinic: 0, market: 0 };
  const sensitive: string[] = [];
  let people = 0;
  for (const b of world.buildings) {
    if (b.id === world.targetId || buildingDist(b, plan.aimX, plan.aimY) > radius) continue;
    kinds[b.kind]++;
    people += pop.observed[b.id] >= 0 ? pop.observed[b.id] : pop.expected[b.id];
    if (b.label) sensitive.push(b.label);
  }
  return { radius, kinds, sensitive, people };
}

// ---------------------------------------------------------------- who signs off

export interface Rules {
  id: string;
  name: string;
  senior: number; // planning figure at or above this needs the most senior sign-off
  source: string;
}
export const RULES: Rules[] = [
  { id: 'afg2009', name: 'Afghanistan, 2009', senior: 1, source: 'reportedly: any expected civilian death went up the chain' },
  { id: 'iraq2003', name: 'Iraq, 2003', senior: 30, source: 'reportedly: 30 or more went to the defense secretary' },
];

export function approver(figure: number, rules: Rules) {
  if (figure === 0) return { level: 0, who: 'Strike cell', note: 'No civilian harm expected: signed off locally.' };
  if (figure < rules.senior) {
    if (figure < Math.max(2, rules.senior / 4)) return { level: 1, who: 'Task force commander', note: 'Below the senior threshold, but someone above the strike cell looks.' };
    return { level: 2, who: 'Theater commander', note: 'Close to the line. The general in charge signs.' };
  }
  return { level: 3, who: rules.senior >= 30 ? 'Defense secretary' : 'Senior commander', note: `At or above ${rules.senior}: the most senior sign-off (${rules.name}).` };
}

// ---------------------------------------------------------------- Jev's search space

export interface Candidate {
  weapon: WeaponId;
  fuze: FuzeId;
  heading: number;
  aim: 'centre' | 'north' | 'south' | 'east' | 'west' | 'custom'; // custom keeps the plan's own aim point
  hour: number;
}

export function aimPoint(world: World, aim: Exclude<Candidate['aim'], 'custom'>) {
  const t = world.buildings[world.targetId].rects[0];
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  const dx = t.w * 0.28;
  const dy = t.h * 0.28;
  return aim === 'north' ? { x: cx, y: cy - dy } : aim === 'south' ? { x: cx, y: cy + dy } : aim === 'east' ? { x: cx + dx, y: cy } : aim === 'west' ? { x: cx - dx, y: cy } : { x: cx, y: cy };
}

export function candidatePlan(world: World, base: Plan, c: Candidate): Plan {
  const a = c.aim === 'custom' ? { x: base.aimX, y: base.aimY } : aimPoint(world, c.aim);
  return { ...base, weapon: c.weapon, fuze: c.fuze, heading: c.heading, hour: c.hour, aimX: a.x, aimY: a.y };
}

export interface SearchSpace {
  weapons: WeaponId[];
  hours: number[];
}

/** Every plan Jev will try, coarse ones first so the picture fills in quickly. */
export function candidates(space: SearchSpace, seed = 3): Candidate[] {
  const out: Candidate[] = [];
  const headings = [0, 45, 90, 135, 180, 225, 270, 315];
  const aims = ['centre', 'north', 'south', 'east', 'west'] as const;
  for (const weapon of space.weapons)
    for (const fuze of FUZES.map((f) => f.id))
      for (const heading of headings) for (const aim of aims) for (const hour of space.hours) out.push({ weapon, fuze, heading, aim, hour });
  // Shuffle, then pull a first pass (centre aim, cardinal headings) to the front.
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  const first = (c: Candidate) => c.aim === 'centre' && c.heading % 90 === 0;
  return [...out.filter(first), ...out.filter((c) => !first(c))];
}

export interface Scored {
  c: Candidate;
  pk: number;
  mean: number;
  p90: number;
}

/** Best plan: meets the required chance of destroying the target, then least harm (planning figure, then mean). */
export function best(results: Scored[], minPk: number): Scored | undefined {
  let b: Scored | undefined;
  for (const s of results) {
    if (s.pk < minPk) continue;
    if (!b || s.p90 < b.p90 || (s.p90 === b.p90 && s.mean < b.mean - 1e-9) || (s.p90 === b.p90 && Math.abs(s.mean - b.mean) < 1e-9 && s.pk > b.pk)) b = s;
  }
  return b;
}

export const fmtHour = (h: number) => {
  const hh = Math.floor(((h % 24) + 24) % 24);
  const mm = Math.round((h - Math.floor(h)) * 60) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export const compass = (deg: number) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export function partOfDay(h: number) {
  if (h < 5 || h >= 21) return 'At night';
  if (h < 7.5) return 'At dawn';
  if (h < 11.5) return 'In the morning';
  if (h < 14.5) return 'At midday';
  if (h < 18) return 'In the afternoon';
  return 'At dusk';
}
