// CDE Lab renderer: the town as a paper diorama seen from above, with the sun, the people and the strike.
import {
  buildingDist,
  destroys,
  effect,
  harm,
  inBuilding,
  lobe,
  rng,
  shownCount,
  weapon,
  type Building,
  type Estimate,
  type Plan,
  type Population,
  type World,
} from './model';

export interface ViewState {
  cx: number;
  cy: number;
  zoom: number;
}

export interface Outcome {
  ix: number;
  iy: number;
  destroyed: boolean;
  damaged: number[]; // building ids
  hurtSlots: Record<number, number[]>; // building id -> slot indexes
  hurtWalkers: number[];
  count: number;
  secondary: boolean;
}

export interface Frame {
  world: World;
  pop: Population;
  plan: Plan;
  est: Estimate | null;
  layers: { people: boolean; circle: boolean; pattern: boolean; impacts: boolean; labels: boolean };
  circleR: number;
  ghost: Plan | null; // what Jev is trying right now
  spotMode: boolean;
  hover: number | null; // building under the pointer
  outcome: Outcome | null; // after the strike
  aimDrag: boolean;
}

// ---------------------------------------------------------------- palette

const C = {
  ground: '#e7ddcc',
  pavement: '#ddd2c0',
  street: '#b5aca1',
  road: '#8f8781',
  lane: '#efe8da',
  white: '#f3f1ec',
  whiteEdge: '#d6d1c7',
  kraft: '#c99f69',
  kraftEdge: '#a7804f',
  tree: '#76863f',
  treeLight: '#a9b865',
  ink: '#1d1b18',
  red: '#b4472d',
  jev: '#2d5a86',
};

const SKIN = ['#6b4a32', '#8a6040', '#a97a52', '#c4966a', '#5a3d2a'];
const CLOTH = ['#3d4f6b', '#8b3a2e', '#e7e1d4', '#6e7a4a', '#2f2c29', '#b48a3c', '#5b6d80', '#9a6b8a', '#d9c7a4'];

// ---------------------------------------------------------------- sun

export function sun(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  // Sunrise 6, sunset 18. The sun swings east → south → west.
  const day = h >= 5.6 && h <= 18.4;
  const t = (h - 6) / 12;
  const elev = day ? Math.max(0.06, Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * 1.15) : 0.5;
  const az = day ? Math.PI / 2 + Math.PI * t : Math.PI * 0.75 + (h < 12 ? h + 24 - 18 : h - 18) * 0.05; // radians from north, clockwise
  const len = day ? Math.min(3.4, 0.8 / Math.tan(Math.min(1.35, elev))) + 0.45 : 0.7;
  return { dx: -Math.sin(az) * len, dy: Math.cos(az) * len, alpha: day ? 0.3 + 0.12 * Math.min(1, elev * 1.6) : 0.2, day, elev };
}

// Colour grading through the day: [hour, multiply colour, strength]
const GRADE: [number, [number, number, number], number][] = [
  [0, [70, 86, 140], 0.62],
  [4.5, [70, 86, 140], 0.6],
  [6, [238, 170, 120], 0.34],
  [7.5, [255, 214, 170], 0.16],
  [10, [255, 246, 232], 0.06],
  [14, [255, 244, 228], 0.06],
  [17, [255, 206, 150], 0.18],
  [18.6, [226, 132, 98], 0.36],
  [20, [95, 96, 150], 0.52],
  [21.5, [70, 86, 140], 0.62],
  [24, [70, 86, 140], 0.62],
];
export function grade(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < GRADE.length - 1; i++) {
    const [h0, c0, s0] = GRADE[i];
    const [h1, c1, s1] = GRADE[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0 || 1);
      return { rgb: c0.map((v, k) => Math.round(v + (c1[k] - v) * t)) as [number, number, number], s: s0 + (s1 - s0) * t };
    }
  }
  return { rgb: [255, 255, 255] as [number, number, number], s: 0 };
}
export const nightness = (hour: number) => {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 7 && h <= 17.5) return 0;
  if (h > 17.5 && h < 20.5) return (h - 17.5) / 3;
  if (h >= 20.5 || h <= 5) return 1;
  return 1 - (h - 5) / 2;
};

// ---------------------------------------------------------------- textures

function paperTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const r = rng(99);
  // Value noise at two scales plus grain.
  const grid = (n: number) => Array.from({ length: (n + 1) * (n + 1) }, () => r());
  const g1 = grid(8);
  const g2 = grid(32);
  const sample = (gr: number[], n: number, x: number, y: number) => {
    const fx = (x / size) * n;
    const fy = (y / size) * n;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const at = (a: number, b: number) => gr[(b % n) * (n + 1) + (a % n)];
    const s = (t: number) => t * t * (3 - 2 * t);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * s(tx);
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * s(tx);
    return a + (b - a) * s(ty);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = 238 + sample(g1, 8, x, y) * 10 + sample(g2, 32, x, y) * 6 + (r() - 0.5) * 9;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  // Fibres.
  g.globalAlpha = 0.05;
  g.strokeStyle = '#6b5a45';
  for (let i = 0; i < 180; i++) {
    const x = r() * size;
    const y = r() * size;
    const a = r() * Math.PI;
    const l = 3 + r() * 10;
    g.lineWidth = 0.5 + r() * 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 3, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 3, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return c;
}

// ---------------------------------------------------------------- people on foot

interface Walker {
  id: number;
  x: number;
  y: number;
  path: { x: number; y: number }[];
  speed: number;
  skin: string;
  cloth: string;
  phase: number;
  kind: 'street' | 'play' | 'transit';
  flee: number;
  hurt: boolean;
  gone: boolean;
}

class Crowd {
  walkers: Walker[] = [];
  private r = rng(4242);
  private nextId = 1;
  private lines = new Map<string, number[]>(); // slots grouped by pavement line

  constructor(private world: World) {
    const s = world.streetSlots;
    const play = world.streetSlots.length / 2 - 66;
    for (let i = 0; i < s.length; i += 2) {
      if (i / 2 >= play) continue;
      const kx = `x${Math.round(s[i] * 2)}`;
      const ky = `y${Math.round(s[i + 1] * 2)}`;
      for (const k of [kx, ky]) {
        const a = this.lines.get(k) ?? [];
        a.push(i);
        this.lines.set(k, a);
      }
    }
  }

  private spawn(kind: Walker['kind'], x: number, y: number): Walker {
    const r = this.r;
    return {
      id: this.nextId++,
      x,
      y,
      path: [],
      speed: kind === 'play' ? 1.6 + r() * 1.4 : 1.1 + r() * 0.6,
      skin: SKIN[Math.floor(r() * SKIN.length)],
      cloth: CLOTH[Math.floor(r() * CLOTH.length)],
      phase: r() * 10,
      kind,
      flee: 0,
      hurt: false,
      gone: false,
    };
  }

  /** Match the number of people on foot to the hour, and walk people between buildings when the hour moves. */
  sync(pop: Population, prev: Population | null) {
    const r = this.r;
    const s = this.world.streetSlots;
    const nSlots = s.length / 2;
    const playStart = pop.playStart;
    const want = { street: Math.round(pop.streetQ * playStart), play: Math.round(pop.playQ * (nSlots - playStart)) };
    for (const kind of ['street', 'play'] as const) {
      const mine = this.walkers.filter((w) => w.kind === kind && !w.gone && !w.hurt);
      if (mine.length > want[kind]) {
        for (const w of mine.slice(want[kind])) w.gone = true;
      } else {
        for (let i = mine.length; i < want[kind]; i++) {
          const k = kind === 'play' ? playStart + Math.floor(r() * (nSlots - playStart)) : Math.floor(r() * playStart);
          this.walkers.push(this.spawn(kind, s[k * 2] + (r() - 0.5) * 1.2, s[k * 2 + 1] + (r() - 0.5) * 1.2));
        }
      }
    }
    // People moving between buildings as the hour changes.
    if (prev && prev.hour !== pop.hour) {
      const from: Building[] = [];
      const to: Building[] = [];
      for (const b of this.world.buildings) {
        const d = shownCount(pop, b) - shownCount(prev, b);
        for (let i = 0; i < Math.min(12, Math.abs(d)); i++) (d > 0 ? to : from).push(b);
      }
      const n = Math.min(90, Math.max(from.length, to.length));
      for (let i = 0; i < n; i++) {
        const a = from[i % Math.max(1, from.length)] ?? this.world.buildings[Math.floor(r() * this.world.buildings.length)];
        const b = to[i % Math.max(1, to.length)] ?? this.world.buildings[Math.floor(r() * this.world.buildings.length)];
        if (a === b) continue;
        const w = this.spawn('transit', a.cx, a.cy);
        w.path = this.route(a, b);
        w.speed = 7 + r() * 5; // hurried along: an hour passes in a few seconds
        w.phase = -r() * 1.5; // a staggered start
        this.walkers.push(w);
      }
    }
    this.walkers = this.walkers.filter((w) => !w.gone || w.kind === 'transit');
  }

  private nearestSlot(x: number, y: number) {
    const s = this.world.streetSlots;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < s.length; i += 2) {
      const d = (s[i] - x) ** 2 + (s[i + 1] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return { x: s[best], y: s[best + 1] };
  }

  private route(a: Building, b: Building) {
    const w = this.world;
    const near = (arr: number[], v: number) => arr.reduce((m, c) => (Math.abs(c - v) < Math.abs(m - v) ? c : m), arr[0]);
    const sa = this.nearestSlot(a.cx, a.cy);
    const sb = this.nearestSlot(b.cx, b.cy);
    const ha = near(w.hStreets.slice(1, -1).concat(w.hStreets), sa.y);
    const hb = near(w.hStreets, sb.y);
    const v = near(w.vStreets.slice(1, -1), (sa.x + sb.x) / 2);
    const j = () => (this.r() - 0.5) * 5;
    return [
      { x: sa.x, y: sa.y },
      { x: sa.x, y: ha + j() },
      { x: v + j(), y: ha + j() },
      { x: v + j(), y: hb + j() },
      { x: sb.x, y: hb + j() },
      { x: sb.x, y: sb.y },
      { x: b.cx, y: b.cy },
    ];
  }

  step(dt: number, blast: { x: number; y: number; t: number } | null) {
    const r = this.r;
    const s = this.world.streetSlots;
    for (const w of this.walkers) {
      if (w.hurt) continue;
      if (w.kind === 'transit') {
        w.phase += dt;
        if (w.phase < 0) continue;
      } else w.phase += dt;
      if (blast && blast.t < 8) {
        const dx = w.x - blast.x;
        const dy = w.y - blast.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 110) {
          w.flee = 1;
          w.path = [{ x: w.x + (dx / d) * 30, y: w.y + (dy / d) * 30 }];
        }
      }
      if (!w.path.length) {
        if (w.gone) continue;
        if (r() < 0.004 || w.kind === 'play') {
          if (w.kind === 'play') {
            w.path = [{ x: 210 + r() * 42, y: 180 + r() * 24 }];
          } else {
            const k = `x${Math.round(w.x * 2)}`;
            const line = this.lines.get(r() < 0.5 ? k : `y${Math.round(w.y * 2)}`);
            if (line?.length) {
              const i = line[Math.floor(r() * line.length)];
              if (Math.hypot(s[i] - w.x, s[i + 1] - w.y) < 40) w.path = [{ x: s[i] + (r() - 0.5) * 1, y: s[i + 1] + (r() - 0.5) * 1 }];
            }
          }
        }
        continue;
      }
      const t = w.path[0];
      const dx = t.x - w.x;
      const dy = t.y - w.y;
      const d = Math.hypot(dx, dy);
      const sp = w.speed * (w.flee ? 3.2 : 1) * dt;
      if (d <= sp) {
        w.x = t.x;
        w.y = t.y;
        w.path.shift();
        if (!w.path.length && w.kind === 'transit') w.gone = true;
      } else {
        w.x += (dx / d) * sp;
        w.y += (dy / d) * sp;
      }
    }
    this.walkers = this.walkers.filter((w) => !(w.kind === 'transit' && w.gone));
  }

  visible() {
    return this.walkers.filter((w) => !(w.gone && w.kind !== 'transit'));
  }
}

// ---------------------------------------------------------------- effects

interface Scrap {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
}
interface Puff {
  x: number;
  y: number;
  r: number;
  grow: number;
  life: number;
  seed: number;
  dark: number;
}
interface StrikeFx {
  plan: Plan;
  outcome: Outcome;
  t: number; // seconds since release
  impactAt: number;
  impacted: boolean;
  scraps: Scrap[];
  puffs: Puff[];
}

// ---------------------------------------------------------------- the scene

export class CdeScene {
  view: ViewState = { cx: 225, cy: 150, zoom: 1.3 };
  crowd: Crowd;
  private ctx: CanvasRenderingContext2D;
  private bg = document.createElement('canvas');
  private bgKey = '';
  private tex = paperTexture();
  private texPattern: CanvasPattern | null = null;
  private dpr = 1;
  private cw = 1;
  private ch = 1;
  private fx: StrikeFx | null = null;
  private shake = 0;
  private cars: { x: number; y: number; dir: number; color: string; horizontal: boolean; speed: number }[] = [];
  private lastPop: Population | null = null;
  onImpact: ((o: Outcome) => void) | null = null;
  onSettled: (() => void) | null = null;
  time = 0;

  constructor(
    public canvas: HTMLCanvasElement,
    public world: World,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.crowd = new Crowd(world);
    const r = rng(11);
    const colors = ['#e7e2d8', '#6c8aa8', '#b8483a', '#2f2d2b', '#d9c9a3'];
    for (let i = 0; i < 5; i++) {
      const horizontal = i < 3;
      const lanes = horizontal ? [world.hStreets[1] - 4, world.hStreets[1] + 4] : [world.vStreets[1] - 2.5, world.vStreets[2] + 2.5];
      const lane = lanes[i % 2];
      this.cars.push({ x: horizontal ? r() * world.w : lane, y: horizontal ? lane : r() * world.h, dir: i % 2 ? 1 : -1, color: colors[i], horizontal, speed: 6 + r() * 5 });
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = Math.max(1, rect.width);
    this.ch = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.bgKey = '';
  }

  /** Pixels per metre and offset, CSS pixels. */
  cam() {
    const base = Math.min(this.cw / this.world.w, this.ch / this.world.h);
    const s = base * this.view.zoom;
    return { s, ox: this.cw / 2 - this.view.cx * s, oy: this.ch / 2 - this.view.cy * s };
  }
  toWorld(px: number, py: number) {
    const { s, ox, oy } = this.cam();
    return { x: (px - ox) / s, y: (py - oy) / s };
  }
  clampView() {
    const { s } = this.cam();
    const hw = this.cw / 2 / s;
    const hh = this.ch / 2 / s;
    const v = this.view;
    v.zoom = Math.max(1, Math.min(6, v.zoom));
    v.cx = hw * 2 >= this.world.w ? this.world.w / 2 : Math.max(hw, Math.min(this.world.w - hw, v.cx));
    v.cy = hh * 2 >= this.world.h ? this.world.h / 2 : Math.max(hh, Math.min(this.world.h - hh, v.cy));
  }

  buildingAt(x: number, y: number) {
    return this.world.buildings.find((b) => inBuilding(b, x, y, 0.5)) ?? null;
  }

  isStriking() {
    return !!this.fx;
  }

  /** Release: fly in along the heading, fall, detonate. The outcome is one draw from the same model. */
  strike(plan: Plan, pop: Population, seed: number) {
    const outcome = resolveStrike(this.world, plan, pop, this.crowd.visible(), seed);
    this.fx = { plan, outcome, t: 0, impactAt: 2.6, impacted: false, scraps: [], puffs: [] };
    return outcome;
  }

  clearStrike() {
    this.fx = null;
    for (const w of this.crowd.walkers) {
      w.hurt = false;
      w.flee = 0;
    }
  }

  // ---------------------------------------------------------------- static layer

  private drawStatic(f: Frame, damaged: Set<number>, crater: { x: number; y: number; r: number } | null) {
    const { world } = f;
    const hour = f.plan.hour;
    const cam = this.cam();
    const key = [this.cw, this.ch, this.dpr, cam.s.toFixed(3), cam.ox.toFixed(1), cam.oy.toFixed(1), hour.toFixed(2), [...damaged].join('.'), crater ? `${crater.x.toFixed(1)},${crater.y.toFixed(1)}` : ''].join('|');
    if (key === this.bgKey) return;
    this.bgKey = key;
    const bg = this.bg;
    bg.width = this.canvas.width;
    bg.height = this.canvas.height;
    const g = bg.getContext('2d')!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { s, ox, oy } = cam;
    g.save();
    g.translate(ox, oy);
    g.scale(s, s);

    // Ground, blocks, streets.
    g.fillStyle = C.street;
    g.fillRect(-200, -200, world.w + 400, world.h + 400);
    for (const bl of world.blocks) {
      g.fillStyle = C.pavement;
      g.fillRect(bl.x, bl.y, bl.w, bl.h);
      g.fillStyle = C.ground;
      g.fillRect(bl.x + 2.6, bl.y + 2.6, bl.w - 5.2, bl.h - 5.2);
      g.strokeStyle = 'rgba(120,100,80,0.18)';
      g.lineWidth = 0.35;
      g.strokeRect(bl.x + 0.2, bl.y + 0.2, bl.w - 0.4, bl.h - 0.4);
    }
    // Blocks beyond the edge, so the town doesn't stop at the frame.
    g.fillStyle = C.pavement;
    for (const [x, y, w, h] of [
      [-150, 6, 144, 136],
      [-150, 159, 144, 135],
      [456, 6, 144, 136],
      [456, 159, 144, 135],
      [6, -150, 438, 144],
      [6, 306, 438, 144],
    ])
      g.fillRect(x, y, w, h);
    for (const st of world.streets) {
      if (!st.main) continue;
      g.fillStyle = C.road;
      g.fillRect(st.x - 200, st.y + 1.5, st.w + 400, st.h - 3);
      g.strokeStyle = C.lane;
      g.lineWidth = 0.45;
      g.setLineDash([3.2, 3.2]);
      g.beginPath();
      g.moveTo(-200, st.y + st.h / 2);
      g.lineTo(world.w + 200, st.y + st.h / 2);
      g.stroke();
      g.setLineDash([]);
    }
    if (crater) {
      const grd = g.createRadialGradient(crater.x, crater.y, 0, crater.x, crater.y, crater.r * 2.4);
      grd.addColorStop(0, 'rgba(40,32,26,0.85)');
      grd.addColorStop(0.35, 'rgba(60,48,38,0.55)');
      grd.addColorStop(1, 'rgba(60,48,38,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(crater.x, crater.y, crater.r * 2.4, 0, Math.PI * 2);
      g.fill();
    }

    // Shadows, on their own layer so they can be softened and never double up.
    const sh = sun(hour);
    const shadow = document.createElement('canvas');
    shadow.width = bg.width;
    shadow.height = bg.height;
    const sg = shadow.getContext('2d')!;
    sg.setTransform(this.dpr * s, 0, 0, this.dpr * s, ox * this.dpr, oy * this.dpr);
    sg.fillStyle = '#000';
    for (const b of world.buildings) {
      const hgt = damaged.has(b.id) ? b.h * 0.3 : b.h;
      for (const q of b.rects) castRect(sg, q.x, q.y, q.w, q.h, sh.dx * hgt, sh.dy * hgt);
    }
    for (const t of world.trees) {
      for (let k = 0; k <= 6; k++) {
        sg.beginPath();
        sg.arc(t.x + sh.dx * (k / 6) * 4.5, t.y + sh.dy * (k / 6) * 4.5, t.r * 0.95, 0, Math.PI * 2);
        sg.fill();
      }
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = Math.min(0.85, sh.alpha * 1.75);
    g.globalCompositeOperation = 'multiply';
    if ('filter' in g) g.filter = `blur(${Math.max(1, s * this.dpr * 0.7)}px)`;
    const tint = document.createElement('canvas');
    tint.width = shadow.width;
    tint.height = shadow.height;
    const tg = tint.getContext('2d')!;
    tg.drawImage(shadow, 0, 0);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = sh.day ? '#5a4332' : '#1f2748';
    tg.fillRect(0, 0, tint.width, tint.height);
    g.drawImage(tint, 0, 0);
    g.restore();

    // Trees: crumpled paper balls.
    for (const t of world.trees) drawTree(g, t.x, t.y, t.r, sh);

    // Buildings.
    for (const b of world.buildings) drawBuilding(g, b, sh, damaged.has(b.id));

    g.restore();

    // Paper grain over everything.
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.texPattern) this.texPattern = g.createPattern(this.tex, 'repeat');
    if (this.texPattern) {
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 0.85;
      g.fillStyle = this.texPattern;
      g.fillRect(0, 0, bg.width, bg.height);
    }
    // Time of day.
    const gr = grade(hour);
    g.globalAlpha = gr.s;
    g.fillStyle = `rgb(${gr.rgb.join(',')})`;
    g.fillRect(0, 0, bg.width, bg.height);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // Lit windows at night: warm light spilling around occupied buildings.
    const night = nightness(hour);
    if (night > 0.05) {
      g.globalCompositeOperation = 'screen';
      g.setTransform(this.dpr * s, 0, 0, this.dpr * s, ox * this.dpr, oy * this.dpr);
      for (const b of world.buildings) {
        if (damaged.has(b.id)) continue;
        const n = shownCount(f.pop, b);
        if (!n || b.kind === 'market') continue;
        const q = b.rects[0];
        const lr = rng(b.id * 31 + 7);
        const lights = Math.min(4, Math.ceil(n / 3));
        for (let i = 0; i < lights; i++) {
          const side = Math.floor(lr() * 4);
          const u = 0.15 + lr() * 0.7;
          const x = side === 0 ? q.x + q.w * u : side === 1 ? q.x + q.w + 0.4 : side === 2 ? q.x + q.w * u : q.x - 0.4;
          const y = side === 0 ? q.y - 0.4 : side === 1 ? q.y + q.h * u : side === 2 ? q.y + q.h + 0.4 : q.y + q.h * u;
          const rad = 3.2 + lr() * 2;
          const grd = g.createRadialGradient(x, y, 0, x, y, rad);
          grd.addColorStop(0, `rgba(255,190,110,${0.5 * night})`);
          grd.addColorStop(1, 'rgba(255,190,110,0)');
          g.fillStyle = grd;
          g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
      }
      // Street lamps along the main road.
      for (let x = 12; x < world.w; x += 24) {
        for (const y of [world.hStreets[1] - 9.5, world.hStreets[1] + 9.5]) {
          const grd = g.createRadialGradient(x, y, 0, x, y, 7);
          grd.addColorStop(0, `rgba(255,214,150,${0.42 * night})`);
          grd.addColorStop(1, 'rgba(255,214,150,0)');
          g.fillStyle = grd;
          g.fillRect(x - 7, y - 7, 14, 14);
        }
      }
      g.globalCompositeOperation = 'source-over';
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    // Tilt-shift: soften the top and bottom of the frame, like a macro lens on a model.
    if ('filter' in g) {
      const tmp = document.createElement('canvas');
      tmp.width = bg.width;
      tmp.height = bg.height;
      const t2 = tmp.getContext('2d')!;
      t2.filter = `blur(${2.2 * this.dpr}px)`;
      t2.drawImage(bg, 0, 0);
      t2.filter = 'none';
      t2.globalCompositeOperation = 'destination-in';
      const grd = t2.createLinearGradient(0, 0, 0, tmp.height);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.2, 'rgba(0,0,0,0)');
      grd.addColorStop(0.8, 'rgba(0,0,0,0)');
      grd.addColorStop(1, 'rgba(0,0,0,1)');
      t2.fillStyle = grd;
      t2.fillRect(0, 0, tmp.width, tmp.height);
      g.drawImage(tmp, 0, 0);
    }
    // Vignette.
    const vg = g.createRadialGradient(bg.width / 2, bg.height / 2, Math.min(bg.width, bg.height) * 0.35, bg.width / 2, bg.height / 2, Math.max(bg.width, bg.height) * 0.75);
    vg.addColorStop(0, 'rgba(30,20,10,0)');
    vg.addColorStop(1, 'rgba(30,20,10,0.22)');
    g.fillStyle = vg;
    g.fillRect(0, 0, bg.width, bg.height);
    g.restore();
  }

  // ---------------------------------------------------------------- per frame

  render(f: Frame, dt: number) {
    this.time += dt;
    if (f.pop !== this.lastPop) {
      this.crowd.sync(f.pop, this.lastPop);
      this.lastPop = f.pop;
    }
    const fx = this.fx;
    if (fx) this.stepFx(fx, dt, f);
    this.crowd.step(dt, fx && fx.impacted ? { x: fx.outcome.ix, y: fx.outcome.iy, t: fx.t - fx.impactAt } : null);
    for (const car of this.cars) {
      const stop = fx && fx.impacted && Math.hypot(car.x - fx.outcome.ix, car.y - fx.outcome.iy) < 60;
      if (stop) continue;
      if (car.horizontal) car.x = ((car.x + car.dir * car.speed * dt + this.world.w + 40) % (this.world.w + 40)) - 20;
      else car.y = ((car.y + car.dir * car.speed * dt + this.world.h + 40) % (this.world.h + 40)) - 20;
    }

    const shown = f.outcome;
    const damaged = new Set(shown ? shown.damaged : []);
    const crater = shown ? { x: shown.ix, y: shown.iy, r: weapon(fx?.plan.weapon ?? f.plan.weapon).blast * 0.35 } : null;
    this.drawStatic(f, damaged, crater);

    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const shake = this.shake > 0 ? this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sx = shake ? (Math.random() - 0.5) * 14 * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * 14 * shake : 0;
    g.drawImage(this.bg, sx * this.dpr, sy * this.dpr);
    const { s, ox, oy } = this.cam();
    g.setTransform(this.dpr * s, 0, 0, this.dpr * s, (ox + sx) * this.dpr, (oy + sy) * this.dpr);
    const px = 1 / s; // one CSS pixel, in metres

    const night = nightness(f.plan.hour);
    const sh = sun(f.plan.hour);

    // Cars.
    for (const car of this.cars) drawCar(g, car, night, sh);

    // Pattern of harm: the blast disc and the fragment "rose" around the aim point.
    const plan = f.plan;
    const striking = !!fx && !fx.impacted;
    if (f.layers.pattern && !shown) drawPattern(g, plan, C.red, 1, px, this.time);
    if (f.ghost) drawPattern(g, f.ghost, C.jev, 0.9, px, this.time);

    // The crude circle.
    if (f.layers.circle && !shown) {
      g.save();
      g.strokeStyle = 'rgba(29,27,24,0.7)';
      g.lineWidth = 1.2 * px;
      g.setLineDash([5 * px, 4 * px]);
      g.lineDashOffset = -this.time * 6 * px;
      g.beginPath();
      g.arc(plan.aimX, plan.aimY, f.circleR, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      const a = -Math.PI * 0.78;
      label(g, plan.aimX + Math.cos(a) * f.circleR, plan.aimY + Math.sin(a) * f.circleR, `${f.circleR} m`, px, { small: true, plain: true });
      g.restore();
    }

    // Where it might land.
    if (f.layers.impacts && f.est && !shown) {
      g.fillStyle = 'rgba(196,72,44,0.55)';
      const n = f.est.impacts.length / 2;
      const show = Math.min(n, Math.floor((this.time * 900) % (n + 200)) + 60);
      for (let i = 0; i < Math.min(n, show); i++) {
        g.beginPath();
        g.arc(f.est.impacts[i * 2], f.est.impacts[i * 2 + 1], Math.max(0.35, 1.6 * px), 0, Math.PI * 2);
        g.fill();
      }
    }

    // People inside, seen as if the roofs were glass.
    const outcome = shown;
    if (f.layers.people) {
      const eInside = effect(plan, true);
      const eOut = effect(plan, false);
      const t = this.world.buildings[this.world.targetId];
      const aimInside = inBuilding(t, plan.aimX, plan.aimY);
      for (const b of this.world.buildings) {
        const n = shownCount(f.pop, b);
        if (!n) continue;
        const hurt = outcome ? new Set(outcome.hurtSlots[b.id] ?? []) : null;
        const known = f.pop.observed[b.id] >= 0;
        for (let i = 0; i < n; i++) {
          const x = b.slots[i * 2];
          const y = b.slots[i * 2 + 1];
          let col = known ? '#1b3a5c' : C.ink;
          if (!outcome && f.layers.pattern) {
            const p = harm(plan, aimInside ? eInside : eOut, plan.aimX, plan.aimY, x, y, b.shield, inBuilding(b, plan.aimX, plan.aimY));
            if (p > 0.02) col = mix(known ? '#1b3a5c' : '#2a2622', '#d0452a', Math.min(1, p * 1.6));
          }
          const rr = Math.max(0.42, Math.min(0.7, 1.9 * px));
          if (hurt?.has(i)) {
            g.strokeStyle = C.red;
            g.lineWidth = Math.max(0.35, 1.4 * px);
            g.beginPath();
            g.arc(x, y, rr * 1.35, 0, Math.PI * 2);
            g.stroke();
            continue;
          }
          g.fillStyle = col;
          g.beginPath();
          g.arc(x, y, rr, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // People on foot.
    const hurtW = new Set(outcome?.hurtWalkers ?? []);
    for (const w of this.crowd.visible()) {
      if (hurtW.has(w.id)) w.hurt = true;
      drawFigure(g, w, this.time, sh, night, px);
    }

    // Labels.
    if (f.layers.labels) {
      for (const b of this.world.buildings) {
        if (!b.label) continue;
        const top = Math.min(...b.rects.map((q) => q.y));
        const left = Math.min(...b.rects.map((q) => q.x));
        const lx = b.kind === 'school' ? left + 6 : b.cx;
        const ly = b.kind === 'school' ? b.cy + 26 : top - 7;
        g.strokeStyle = C.ink;
        g.lineWidth = 1.1 * px;
        g.beginPath();
        g.moveTo(lx, ly);
        g.lineTo(b.cx, b.cy);
        g.stroke();
        g.fillStyle = C.ink;
        g.beginPath();
        g.arc(b.cx, b.cy, 2.2 * px, 0, Math.PI * 2);
        g.fill();
        label(g, lx, ly, b.label, px, {});
      }
    }

    // Hover and spotting.
    if (f.hover != null) {
      const b = this.world.buildings[f.hover];
      g.strokeStyle = f.spotMode ? C.jev : 'rgba(29,27,24,0.55)';
      g.lineWidth = 1.6 * px;
      for (const q of b.rects) g.strokeRect(q.x - 0.6, q.y - 0.6, q.w + 1.2, q.h + 1.2);
    }

    // Aim point.
    if (!shown && !striking) drawAim(g, plan.aimX, plan.aimY, px, f.aimDrag ? 1.25 : 1, C.ink);
    if (f.ghost) drawAim(g, f.ghost.aimX, f.ghost.aimY, px, 0.85, C.jev);

    // Approach track.
    if (!shown && f.layers.pattern) drawTrack(g, plan, px, this.world, this.time, false);

    if (fx) this.drawFx(g, fx, px);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  private stepFx(fx: StrikeFx, dt: number, f: Frame) {
    fx.t += dt;
    const o = fx.outcome;
    if (!fx.impacted && fx.t >= fx.impactAt) {
      fx.impacted = true;
      this.shake = 1;
      const r = rng(Math.round(o.ix * 100 + o.iy));
      const w = weapon(fx.plan.weapon);
      const e = effect(fx.plan, true);
      const n = 70 + Math.round(w.blast * 6);
      const cols = ['#f3f1ec', '#c99f69', '#8f8781', '#e7ddcc', '#d6d1c7', '#6b5a45'];
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const g2 = lobe(fx.plan.heading, Math.sin(a), -Math.cos(a));
        const v = (6 + r() * 26) * (0.5 + g2) * (fx.plan.fuze === 'delay' ? 0.55 : 1) * Math.sqrt(e.blast / 10);
        fx.scraps.push({ x: o.ix, y: o.iy, z: 0, vx: Math.sin(a) * v, vy: -Math.cos(a) * v, vz: 10 + r() * 22, rot: r() * 6, vr: (r() - 0.5) * 18, size: 0.6 + r() * 1.8, color: cols[Math.floor(r() * cols.length)] });
      }
      const puffs = 14 + Math.round(w.blast * 1.2);
      for (let i = 0; i < puffs; i++) {
        const a = r() * Math.PI * 2;
        const d = r() * w.blast * 0.9;
        fx.puffs.push({ x: o.ix + Math.cos(a) * d, y: o.iy + Math.sin(a) * d, r: 2 + r() * 3, grow: (3 + r() * 5) * Math.sqrt(w.blast / 10), life: 0, seed: r() * 1000, dark: r() });
      }
      if (o.secondary) {
        const t = this.world.buildings[this.world.targetId];
        for (let i = 0; i < 14; i++) fx.puffs.push({ x: t.cx + (r() - 0.5) * 20, y: t.cy + (r() - 0.5) * 14, r: 3, grow: 7, life: -0.6 - r() * 0.8, seed: r() * 1000, dark: 0.8 });
      }
      this.onImpact?.(o);
    }
    for (const p of fx.scraps) {
      p.vz -= 38 * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
      const drag = p.z > 0 ? 1 : 0.2;
      p.x += p.vx * dt * drag;
      p.y += p.vy * dt * drag;
      p.rot += p.vr * dt * drag;
      if (p.z === 0) {
        p.vx *= 0.8;
        p.vy *= 0.8;
      }
    }
    for (const p of fx.puffs) p.life += dt;
    if (fx.impacted && fx.t > fx.impactAt + 7) {
      fx.puffs = fx.puffs.filter((p) => p.life < 9);
      if (!fx.puffs.length) {
        this.onSettled?.();
      }
    }
    void f;
  }

  private drawFx(g: CanvasRenderingContext2D, fx: StrikeFx, px: number) {
    const o = fx.outcome;
    const plan = fx.plan;
    const t = fx.t;
    const h = (plan.heading * Math.PI) / 180;
    const ux = Math.sin(h);
    const uy = -Math.cos(h);
    // The aircraft: a folded paper plane crossing the town along the attack heading.
    const fly = 150;
    const planeT = t / fx.impactAt;
    if (planeT < 2.4) {
      const along = (planeT - 0.72) * fly;
      const x = o.ix + ux * along;
      const y = o.iy + uy * along;
      drawTrack(g, plan, px, this.world, this.time, true);
      drawPlane(g, x + 26, y + 26, h, 1, 0.22); // shadow, far below
      drawPlane(g, x, y, h, 1, 1);
    }
    // The bomb: released ahead of the target, falling and slowing, its shadow sliding in.
    if (!fx.impacted && planeT > 0.2) {
      const k = (planeT - 0.2) / 0.8;
      const along = -(1 - k) * fly * 0.4;
      const alt = (1 - k * k) * 26;
      const x = o.ix + ux * along;
      const y = o.iy + uy * along;
      g.fillStyle = 'rgba(40,30,20,0.35)';
      g.beginPath();
      g.ellipse(x + alt, y + alt, 1.2, 0.6, h, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(x, y);
      g.rotate(h);
      g.fillStyle = '#6f6a63';
      g.beginPath();
      g.ellipse(0, 0, 0.7, 2.2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c9a44c';
      g.fillRect(-0.7, 0.8, 1.4, 0.35);
      g.restore();
    }
    if (!fx.impacted) return;
    const dt = t - fx.impactAt;
    const e = effect(plan, true);
    // Flash.
    if (dt < 0.5) {
      const a = 1 - dt / 0.5;
      const rad = e.blast * (1.5 + dt * 5);
      const grd = g.createRadialGradient(o.ix, o.iy, 0, o.ix, o.iy, rad);
      grd.addColorStop(0, `rgba(255,248,225,${a})`);
      grd.addColorStop(0.4, `rgba(255,200,120,${a * 0.7})`);
      grd.addColorStop(1, 'rgba(255,160,80,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(o.ix, o.iy, rad, 0, Math.PI * 2);
      g.fill();
    }
    // Shock rings: blast, then the fragment front.
    if (dt < 1.6) {
      const k = dt / 1.6;
      g.strokeStyle = `rgba(255,250,240,${(1 - k) * 0.9})`;
      g.lineWidth = (1 - k) * 3 * px + px;
      g.beginPath();
      g.arc(o.ix, o.iy, e.blast * 1.25 * Math.min(1, k * 3), 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = `rgba(180,71,45,${(1 - k) * 0.6})`;
      g.setLineDash([3 * px, 3 * px]);
      g.beginPath();
      for (let a = 0; a <= 72; a++) {
        const th = (a / 72) * Math.PI * 2;
        const dx = Math.sin(th);
        const dy = -Math.cos(th);
        const reach = e.frag * (0.55 + 0.45 * lobe(plan.heading, dx, dy)) * k;
        if (a === 0) g.moveTo(o.ix + dx * reach, o.iy + dy * reach);
        else g.lineTo(o.ix + dx * reach, o.iy + dy * reach);
      }
      g.stroke();
      g.setLineDash([]);
    }
    // Scraps of paper.
    for (const p of fx.scraps) {
      const lift = p.z * 0.35;
      if (p.z > 0.1) {
        g.fillStyle = 'rgba(40,30,20,0.2)';
        g.fillRect(p.x - p.size / 2 + lift, p.y - p.size / 2 + lift, p.size, p.size * 0.6);
      }
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.beginPath();
      g.moveTo(-p.size / 2, -p.size * 0.3);
      g.lineTo(p.size / 2, -p.size * 0.4);
      g.lineTo(p.size * 0.4, p.size * 0.35);
      g.lineTo(-p.size * 0.5, p.size * 0.25);
      g.closePath();
      g.fill();
      g.restore();
    }
    // Smoke: torn tissue-paper puffs that swell, drift downwind and thin out.
    for (const p of fx.puffs) {
      if (p.life < 0) continue;
      const k = Math.min(1, p.life / 7);
      const rad = p.r + p.grow * Math.sqrt(p.life);
      const a = Math.max(0, (p.life < 0.3 ? p.life / 0.3 : 1) * (1 - k) * 0.85);
      const x = p.x + p.life * 1.4;
      const y = p.y - p.life * 0.6;
      const pr = rng(Math.round(p.seed));
      const base = Math.round(200 + (1 - p.dark) * 45 - p.dark * 60);
      g.fillStyle = `rgba(${base},${base - 4},${base - 10},${a})`;
      g.beginPath();
      const pts = 14;
      for (let i = 0; i <= pts; i++) {
        const th = (i / pts) * Math.PI * 2;
        const rr = rad * (0.82 + pr() * 0.3);
        const X = x + Math.cos(th) * rr;
        const Y = y + Math.sin(th) * rr;
        if (i === 0) g.moveTo(X, Y);
        else g.lineTo(X, Y);
      }
      g.closePath();
      g.fill();
    }
  }
}

// ---------------------------------------------------------------- the strike, resolved

/** One draw: where it lands, what falls, who is hurt. Uses the people actually drawn on screen. */
export function resolveStrike(world: World, plan: Plan, pop: Population, walkers: { id: number; x: number; y: number }[], seed: number): Outcome {
  const r = rng(seed);
  const w = weapon(plan.weapon);
  const sigma = w.cep / 1.1774;
  const n1 = Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  const n2 = Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  const ix = plan.aimX + n1 * sigma;
  const iy = plan.aimY + n2 * sigma;
  const hitB = world.buildings.find((b) => inBuilding(b, ix, iy));
  const e = effect(plan, !!hitB);
  const destroyed = destroys(world, plan, ix, iy);
  const target = world.buildings[world.targetId];
  const secondary = destroyed && plan.stored;
  const secPlan: Plan = { ...plan, heading: 0, fuze: 'instant' };
  const secE = { blast: 16, frag: 45, fragP: 0.3, shieldPow: 1, bury: 1 };
  const damaged: number[] = [];
  for (const b of world.buildings) {
    const d = buildingDist(b, ix, iy);
    if ((b === target && destroyed) || d < e.blast * (plan.fuze === 'delay' && hitB === b ? 1.1 : 0.7) || (secondary && buildingDist(b, target.cx, target.cy) < 10)) damaged.push(b.id);
  }
  const hurtSlots: Record<number, number[]> = {};
  let count = 0;
  for (const b of world.buildings) {
    const n = shownCount(pop, b);
    for (let i = 0; i < n; i++) {
      const x = b.slots[i * 2];
      const y = b.slots[i * 2 + 1];
      let p = harm(plan, e, ix, iy, x, y, b.shield, hitB === b);
      if (secondary) p = 1 - (1 - p) * (1 - harm(secPlan, secE, target.cx, target.cy, x, y, b.shield, b === target));
      if (r() < p) {
        (hurtSlots[b.id] ??= []).push(i);
        count++;
      }
    }
  }
  const hurtWalkers: number[] = [];
  for (const wk of walkers) {
    let p = harm(plan, e, ix, iy, wk.x, wk.y, 1, false);
    if (secondary) p = 1 - (1 - p) * (1 - harm(secPlan, secE, target.cx, target.cy, wk.x, wk.y, 1, false));
    if (r() < p) {
      hurtWalkers.push(wk.id);
      count++;
    }
  }
  return { ix, iy, destroyed, damaged, hurtSlots, hurtWalkers, count, secondary };
}

// ---------------------------------------------------------------- drawing helpers

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

function castRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dx: number, dy: number) {
  // The shadow of a box: the hull of its footprint and the footprint moved along the sun.
  const pts = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x + dx, y + dy],
    [x + w + dx, y + dy],
    [x + w + dx, y + h + dy],
    [x + dx, y + h + dy],
  ];
  const hull = convexHull(pts);
  g.beginPath();
  hull.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.closePath();
  g.fill();
}

function convexHull(points: number[][]) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: number[][] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function drawTree(g: CanvasRenderingContext2D, x: number, y: number, rad: number, sh: ReturnType<typeof sun>) {
  const r = rng(Math.round(x * 13 + y * 7));
  const grd = g.createRadialGradient(x - sh.dx * 0.6, y - sh.dy * 0.6, rad * 0.1, x, y, rad);
  grd.addColorStop(0, C.treeLight);
  grd.addColorStop(1, C.tree);
  g.fillStyle = grd;
  g.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (0.85 + r() * 0.2);
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  // Crumple creases.
  g.strokeStyle = 'rgba(60,70,30,0.35)';
  g.lineWidth = 0.12;
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * rad * 0.1, y + Math.sin(a) * rad * 0.1);
    g.lineTo(x + Math.cos(a + 0.4) * rad * 0.8, y + Math.sin(a + 0.4) * rad * 0.8);
    g.stroke();
  }
}

function drawBuilding(g: CanvasRenderingContext2D, b: Building, sh: ReturnType<typeof sun>, damaged: boolean) {
  const r = rng(b.id * 977 + 3);
  const kraft = b.paper === 'kraft';
  const face = kraft ? C.kraft : C.white;
  const edge = kraft ? C.kraftEdge : C.whiteEdge;
  // Light direction on the roof: toward the sun.
  const lx = -sh.dx;
  const ly = -sh.dy;
  if (damaged) {
    for (const q of b.rects) {
      const pr = rng(b.id * 17 + Math.round(q.x));
      g.fillStyle = kraft ? '#8c7454' : '#b7b1a6';
      g.beginPath();
      const pts = 22;
      for (let i = 0; i < pts; i++) {
        const t = i / pts;
        const side = Math.floor(t * 4);
        const u = (t * 4) % 1;
        const j = () => (pr() - 0.5) * Math.min(q.w, q.h) * 0.22;
        const x = side === 0 ? q.x + q.w * u : side === 1 ? q.x + q.w : side === 2 ? q.x + q.w * (1 - u) : q.x;
        const y = side === 0 ? q.y : side === 1 ? q.y + q.h * u : side === 2 ? q.y + q.h : q.y + q.h * (1 - u);
        if (i === 0) g.moveTo(x + j(), y + j());
        else g.lineTo(x + j(), y + j());
      }
      g.closePath();
      g.fill();
      // Torn sheets and rubble.
      for (let i = 0; i < 16; i++) {
        const x = q.x + pr() * q.w;
        const y = q.y + pr() * q.h;
        const s = 0.8 + pr() * 3;
        g.fillStyle = pr() < 0.5 ? face : pr() < 0.5 ? '#6f675d' : '#d9d3c8';
        g.save();
        g.translate(x, y);
        g.rotate(pr() * 6);
        g.fillRect(-s / 2, -s / 3, s, s * 0.66);
        g.restore();
      }
    }
    return;
  }
  for (const q of b.rects) {
    // Roof: a gentle gradient toward the lit side.
    const grd = g.createLinearGradient(q.x + q.w / 2 - lx * q.w * 0.3, q.y + q.h / 2 - ly * q.h * 0.3, q.x + q.w / 2 + lx * q.w * 0.3, q.y + q.h / 2 + ly * q.h * 0.3);
    grd.addColorStop(0, shade(face, -0.06));
    grd.addColorStop(1, shade(face, 0.03));
    g.fillStyle = grd;
    g.fillRect(q.x, q.y, q.w, q.h);

    if (b.kind === 'warehouse') {
      // Accordion-folded roof.
      const strip = 2.4;
      for (let x = q.x, i = 0; x < q.x + q.w - 0.01; x += strip, i++) {
        const w = Math.min(strip, q.x + q.w - x);
        const lg = g.createLinearGradient(x, 0, x + w, 0);
        const lit = (i % 2 === 0) === lx > 0;
        lg.addColorStop(0, lit ? '#fbfaf7' : '#dcd8d0');
        lg.addColorStop(1, lit ? '#e9e6df' : '#cbc6bc');
        g.fillStyle = lg;
        g.fillRect(x, q.y, w, q.h);
      }
      // Zigzag hems top and bottom.
      g.fillStyle = C.ground;
      for (const yy of [q.y, q.y + q.h]) {
        g.beginPath();
        for (let x = q.x, i = 0; x <= q.x + q.w + 0.01; x += strip / 2, i++) {
          const y = yy + (i % 2 ? (yy === q.y ? 0.9 : -0.9) : 0);
          if (i === 0) g.moveTo(x, yy);
          g.lineTo(x, y);
        }
        g.lineTo(q.x + q.w, yy);
        g.closePath();
        g.fill();
      }
    } else if (b.kind === 'market') {
      // Striped awnings.
      const stripes = 5;
      for (let i = 0; i < stripes; i++) {
        g.fillStyle = i % 2 ? '#efe7d6' : ['#b85a3c', '#4f7a8a', '#c9a44c'][b.rects.indexOf(q) % 3];
        g.fillRect(q.x + (i * q.w) / stripes, q.y, q.w / stripes, q.h);
      }
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(q.x, q.y + q.h * 0.55, q.w, q.h * 0.45);
    } else {
      // Parapet on flat white roofs.
      if (!kraft && r() < 0.65 && q.w > 10 && q.h > 10) {
        g.strokeStyle = shade(face, 0.04);
        g.lineWidth = 0.9;
        g.strokeRect(q.x + 0.45, q.y + 0.45, q.w - 0.9, q.h - 0.9);
        g.strokeStyle = 'rgba(90,80,70,0.22)';
        g.lineWidth = 0.18;
        g.strokeRect(q.x + 0.95, q.y + 0.95, q.w - 1.9, q.h - 1.9);
      }
      // Creases and folds in the paper.
      g.strokeStyle = kraft ? 'rgba(90,60,30,0.22)' : 'rgba(120,110,100,0.16)';
      g.lineWidth = 0.14;
      const folds = kraft ? 3 : 2;
      for (let i = 0; i < folds; i++) {
        g.beginPath();
        if (r() < 0.5) {
          const x = q.x + q.w * (0.2 + r() * 0.6);
          g.moveTo(x, q.y);
          g.lineTo(x + (r() - 0.5) * 3, q.y + q.h);
        } else {
          const y = q.y + q.h * (0.2 + r() * 0.6);
          g.moveTo(q.x, y);
          g.lineTo(q.x + q.w, y + (r() - 0.5) * 3);
        }
        g.stroke();
      }
      if (kraft) {
        // Crumple patches.
        for (let i = 0; i < 3; i++) {
          g.fillStyle = r() < 0.5 ? 'rgba(255,240,210,0.12)' : 'rgba(90,60,30,0.1)';
          const x = q.x + r() * q.w;
          const y = q.y + r() * q.h;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (r() - 0.3) * q.w * 0.4, y + r() * q.h * 0.3);
          g.lineTo(x + (r() - 0.7) * q.w * 0.3, y + r() * q.h * 0.4);
          g.closePath();
          g.fill();
        }
      }
    }
    // Lit and shaded edges give the box its height.
    const lw = 0.35;
    g.fillStyle = 'rgba(255,255,255,0.55)';
    if (ly < 0) g.fillRect(q.x, q.y, q.w, lw);
    else g.fillRect(q.x, q.y + q.h - lw, q.w, lw);
    if (lx < 0) g.fillRect(q.x, q.y, lw, q.h);
    else g.fillRect(q.x + q.w - lw, q.y, lw, q.h);
    g.strokeStyle = edge;
    g.lineWidth = 0.18;
    g.strokeRect(q.x, q.y, q.w, q.h);
  }
  // Rooftop kit: water tanks and stair boxes.
  for (const k of b.roof) {
    g.fillStyle = 'rgba(40,30,20,0.25)';
    if (k.kind === 'tank') {
      g.beginPath();
      g.arc(k.x + sh.dx * 1.5, k.y + sh.dy * 1.5, 1.1, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#9a968f';
      g.beginPath();
      g.arc(k.x, k.y, 1.1, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#6f6b64';
      g.lineWidth = 0.15;
      g.stroke();
    } else {
      g.fillRect(k.x + sh.dx * 1.2, k.y + sh.dy * 1.2, 2.2, 1.6);
      g.fillStyle = '#7d7568';
      g.beginPath();
      g.moveTo(k.x, k.y);
      g.lineTo(k.x + 2.2, k.y + 0.3);
      g.lineTo(k.x + 2.2, k.y + 1.6);
      g.lineTo(k.x, k.y + 1.3);
      g.closePath();
      g.fill();
    }
  }
}

function shade(hex: string, amt: number) {
  const p = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${p.map((v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)))).join(',')})`;
}

function drawCar(g: CanvasRenderingContext2D, car: { x: number; y: number; dir: number; color: string; horizontal: boolean }, night: number, sh: ReturnType<typeof sun>) {
  g.save();
  g.translate(car.x, car.y);
  g.rotate(car.horizontal ? (car.dir > 0 ? 0 : Math.PI) : car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  g.fillStyle = 'rgba(40,30,20,0.25)';
  g.fillRect(-2.2 + sh.dx * 0.7, -1 + sh.dy * 0.7, 4.4, 2);
  g.fillStyle = car.color;
  roundRect(g, -2.2, -1, 4.4, 2, 0.6);
  g.fill();
  g.fillStyle = 'rgba(40,50,60,0.55)';
  roundRect(g, 0.2, -0.8, 1.1, 1.6, 0.3);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  roundRect(g, -1.5, -0.8, 1.5, 1.6, 0.3);
  g.fill();
  if (night > 0.2) {
    const grd = g.createRadialGradient(4, 0, 0, 4, 0, 6);
    grd.addColorStop(0, `rgba(255,236,190,${0.55 * night})`);
    grd.addColorStop(1, 'rgba(255,236,190,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(2, -0.8);
    g.lineTo(9, -3);
    g.lineTo(9, 3);
    g.lineTo(2, 0.8);
    g.fill();
  }
  g.restore();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawFigure(g: CanvasRenderingContext2D, w: Walker, time: number, sh: ReturnType<typeof sun>, night: number, px: number) {
  const scale = Math.max(1, 1.6 * px); // never smaller than a readable dot
  if (w.hurt) {
    g.strokeStyle = C.red;
    g.lineWidth = Math.max(0.3, 1.3 * px);
    g.beginPath();
    g.arc(w.x, w.y, 1.1 * scale, 0, Math.PI * 2);
    g.stroke();
    return;
  }
  const moving = w.path.length > 0;
  const bob = moving ? Math.sin((time + w.phase) * 11) * 0.12 : 0;
  g.fillStyle = `rgba(40,30,20,${0.22 * (1 - night * 0.5)})`;
  g.beginPath();
  g.ellipse(w.x + sh.dx * 0.9 * scale, w.y + sh.dy * 0.9 * scale, 0.55 * scale, 0.4 * scale, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = w.cloth;
  g.beginPath();
  g.ellipse(w.x, w.y + bob, 0.62 * scale, 0.45 * scale, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = w.skin;
  g.beginPath();
  g.arc(w.x, w.y + bob - 0.05 * scale, 0.3 * scale, 0, Math.PI * 2);
  g.fill();
}

function drawAim(g: CanvasRenderingContext2D, x: number, y: number, px: number, k: number, color: string) {
  const r = 7 * px * k;
  g.strokeStyle = color;
  g.lineWidth = 1.4 * px;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.moveTo(x - r * 1.6, y);
  g.lineTo(x - r * 0.4, y);
  g.moveTo(x + r * 0.4, y);
  g.lineTo(x + r * 1.6, y);
  g.moveTo(x, y - r * 1.6);
  g.lineTo(x, y - r * 0.4);
  g.moveTo(x, y + r * 0.4);
  g.lineTo(x, y + r * 1.6);
  g.stroke();
}

function drawPattern(g: CanvasRenderingContext2D, plan: Plan, color: string, alpha: number, px: number, time: number) {
  const e = effect(plan, true);
  g.save();
  g.globalAlpha = alpha;
  // Fragment reach, shaped by the direction of travel.
  g.beginPath();
  for (let a = 0; a <= 90; a++) {
    const th = (a / 90) * Math.PI * 2;
    const dx = Math.sin(th);
    const dy = -Math.cos(th);
    const reach = e.frag * (0.55 + 0.45 * lobe(plan.heading, dx, dy));
    if (a === 0) g.moveTo(plan.aimX + dx * reach, plan.aimY + dy * reach);
    else g.lineTo(plan.aimX + dx * reach, plan.aimY + dy * reach);
  }
  g.closePath();
  const grd = g.createRadialGradient(plan.aimX, plan.aimY, 0, plan.aimX, plan.aimY, e.frag);
  grd.addColorStop(0, hexA(color, 0.11));
  grd.addColorStop(1, hexA(color, 0.015));
  g.fillStyle = grd;
  g.fill();
  g.strokeStyle = hexA(color, 0.55);
  g.lineWidth = 1 * px;
  g.setLineDash([2.5 * px, 3 * px]);
  g.lineDashOffset = time * 5 * px;
  g.stroke();
  g.setLineDash([]);
  // Blast.
  g.fillStyle = hexA(color, 0.16);
  g.beginPath();
  g.arc(plan.aimX, plan.aimY, e.blast, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawTrack(g: CanvasRenderingContext2D, plan: Plan, px: number, world: World, time: number, live: boolean) {
  const h = (plan.heading * Math.PI) / 180;
  const ux = Math.sin(h);
  const uy = -Math.cos(h);
  const L = Math.max(world.w, world.h) * 1.2;
  g.save();
  g.strokeStyle = live ? 'rgba(29,27,24,0.35)' : 'rgba(29,27,24,0.28)';
  g.lineWidth = 1 * px;
  g.setLineDash([6 * px, 5 * px]);
  g.lineDashOffset = -time * 20 * px;
  g.beginPath();
  g.moveTo(plan.aimX - ux * L, plan.aimY - uy * L);
  g.lineTo(plan.aimX - ux * 12, plan.aimY - uy * 12);
  g.stroke();
  g.setLineDash([]);
  if (!live) {
    // An arrowhead on the way in.
    const d = 40;
    const x = plan.aimX - ux * d;
    const y = plan.aimY - uy * d;
    g.fillStyle = 'rgba(29,27,24,0.55)';
    g.beginPath();
    g.moveTo(x + ux * 5 * px * 1.6, y + uy * 5 * px * 1.6);
    g.lineTo(x - uy * 3.5 * px * 1.6 - ux * 3 * px, y + ux * 3.5 * px * 1.6 - uy * 3 * px);
    g.lineTo(x + uy * 3.5 * px * 1.6 - ux * 3 * px, y - ux * 3.5 * px * 1.6 - uy * 3 * px);
    g.closePath();
    g.fill();
  }
  g.restore();
}

function drawPlane(g: CanvasRenderingContext2D, x: number, y: number, h: number, k: number, alpha: number) {
  g.save();
  g.translate(x, y);
  g.rotate(h);
  g.scale(k, k);
  g.globalAlpha = alpha;
  const s = 5;
  if (alpha < 0.5) {
    g.fillStyle = '#2a2018';
    g.beginPath();
    g.moveTo(0, -s * 2);
    g.lineTo(s * 1.6, s * 1.4);
    g.lineTo(0, s * 0.8);
    g.lineTo(-s * 1.6, s * 1.4);
    g.closePath();
    g.fill();
  } else {
    // Two folded wings, one catching the light.
    g.fillStyle = '#f7f5f0';
    g.beginPath();
    g.moveTo(0, -s * 2);
    g.lineTo(-s * 1.6, s * 1.4);
    g.lineTo(0, s * 0.8);
    g.closePath();
    g.fill();
    g.fillStyle = '#d9d4ca';
    g.beginPath();
    g.moveTo(0, -s * 2);
    g.lineTo(s * 1.6, s * 1.4);
    g.lineTo(0, s * 0.8);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(80,70,60,0.5)';
    g.lineWidth = 0.15;
    g.beginPath();
    g.moveTo(0, -s * 2);
    g.lineTo(0, s * 0.8);
    g.stroke();
  }
  g.restore();
}

function hexA(hex: string, a: number) {
  const p = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${p.join(',')},${a})`;
}

function label(g: CanvasRenderingContext2D, x: number, y: number, text: string, px: number, o: { small?: boolean; plain?: boolean }) {
  g.save();
  const size = (o.small ? 11 : 12.5) * px;
  g.font = `600 ${size}px "IBM Plex Sans", "Geist", system-ui, sans-serif`;
  const w = g.measureText(text).width;
  const padX = 6 * px;
  const padY = 4 * px;
  const bw = w + padX * 2;
  const bh = size + padY * 2;
  if (!o.plain) {
    g.fillStyle = 'rgba(40,30,20,0.16)';
    g.fillRect(x - bw / 2 + 1.5 * px, y - bh / 2 + 2 * px, bw, bh);
  }
  g.fillStyle = o.plain ? 'rgba(250,247,240,0.85)' : '#fbf8f1';
  g.fillRect(x - bw / 2, y - bh / 2, bw, bh);
  g.fillStyle = C.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + 0.5 * px);
  g.restore();
}
