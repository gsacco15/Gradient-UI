// CDE Lab: an interactive, paper-model explainer of how militaries estimate civilian harm before a strike.
// Plan it by hand, or let Jev sweep thousands of plans in parallel while you watch and throttle it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { linkTo } from '../router';
import { Jev, key, type JevStatus } from './jev';
import {
  approver,
  best,
  buildWorld,
  compass,
  estimate,
  fmtHour,
  FUZES,
  HARDNESS,
  inCircle,
  partOfDay,
  placeName,
  population,
  RULES,
  shownCount,
  sources,
  WEAPONS,
  weapon,
  type Candidate,
  type Estimate,
  type Observations,
  type Plan,
  type Scored,
  type Sources,
  type WeaponId,
} from './model';
import { CdeScene, type Frame, type Outcome } from './scene';
import type { JobIn, JobOut } from './worker';
import '../landing/landing.css';
import './cde.css';

const SEED = 7;
const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600&display=swap';

type Layers = Frame['layers'];
type HourWindow = 'any' | 'night' | 'school-closed';
const WINDOWS: Record<HourWindow, number[]> = {
  any: [1, 4, 7, 10, 13, 16, 19, 22],
  night: [22, 23, 0, 1, 2, 3, 4],
  'school-closed': [0, 2, 4, 6, 16, 18, 20, 22],
};
const SPEEDS = [0.5, 1, 2, 4, 8, 16, 32, 64, Infinity];
const HEADING_NAMES: Record<number, string> = { 0: '↑ N', 45: '↗ NE', 90: '→ E', 135: '↘ SE', 180: '↓ S', 225: '↙ SW', 270: '← W', 315: '↖ NW' };

interface Chapter {
  title: string;
  text: string;
  plan?: Partial<Plan>;
  layers?: Partial<Layers>;
  focus?: { cx: number; cy: number; zoom: number };
  hist?: HistMode; // which reading of the histogram to show
  tables?: boolean; // show the blast and fragment tables
  count?: boolean; // open "People inside right now" on a block of flats
}

type HistMode = 'spread' | 'figure' | 'thresholds';

const CHAPTERS: Chapter[] = [
  {
    title: 'The target',
    text: 'A warehouse on the main road, said to store weapons. Whether it is a lawful military objective is a legal judgment, made by people, before any of the maths.',
    plan: { hour: 10, weapon: 'large', fuze: 'instant', heading: 180 },
    layers: { circle: false, pattern: false, impacts: false, people: false },
    focus: { cx: 225, cy: 150, zoom: 2.2 },
  },
  {
    title: 'The crude circle',
    text: 'Draw a circle as far as the weapon can reach. Is anything inside it that we must protect? Here there is a school, a clinic, a market and homes. So: go on.',
    layers: { circle: true, pattern: false, impacts: false, people: false },
    focus: { cx: 225, cy: 150, zoom: 1.3 },
  },
  {
    title: 'The tables',
    text: 'How far each weapon throws blast and fragments comes from thick books of tables, built from tests and past strikes and reportedly reissued at least twice a year. These are made-up stand-ins.',
    tables: true,
  },
  {
    title: 'The weapon',
    text: 'Warhead size, fuze, the direction the bomb arrives from and the exact aim point each change who is in reach. Fragments lean the way the bomb is travelling.',
    layers: { circle: true, pattern: true, impacts: false, people: false },
    focus: { cx: 225, cy: 150, zoom: 1.6 },
  },
  {
    title: 'Who is there',
    text: 'Nobody knows exactly. Overhead images, phone signals and an old census all disagree. Click any building to see its sources; each dot is a person the model expects.',
    layers: { circle: false, pattern: true, impacts: false, people: true },
    focus: { cx: 225, cy: 150, zoom: 1.8 },
    count: true,
  },
  {
    title: 'Managing chance',
    text: 'Bombs do not land exactly where they are aimed, and the counts are guesses. So the model is run hundreds of times. Most runs are low; a few are much worse.',
    layers: { circle: false, pattern: true, impacts: true, people: true },
    focus: { cx: 225, cy: 140, zoom: 2.2 },
    hist: 'spread',
  },
  {
    title: 'Ways to reduce the harm',
    text: 'A smaller warhead. A delay fuze, so the walls catch the fragments. An approach that throws them north, away from the school. An hour when fewer people are nearby.',
    plan: { weapon: 'small', fuze: 'delay', heading: 0, hour: 2 },
    layers: { circle: false, pattern: true, impacts: true, people: true },
    focus: { cx: 225, cy: 150, zoom: 1.8 },
    hist: 'spread',
  },
  {
    title: 'Who signs off',
    text: 'The spread is boiled down to one cautious figure: nine in ten runs come in at or below it. The higher it is, the more senior the person who must approve. The thresholds have changed from war to war.',
    layers: { circle: false, pattern: true, impacts: false, people: true },
    hist: 'thresholds',
  },
  {
    title: 'One roll of the dice',
    text: 'The estimate is a spread of possibilities. The strike is a single outcome. Press Release to see one; press it again and it may be different.',
    layers: { circle: false, pattern: true, impacts: false, people: true },
  },
];

const defaultPlan = (world: ReturnType<typeof buildWorld>): Plan => {
  const t = world.buildings[world.targetId];
  return { weapon: 'large', fuze: 'instant', heading: 180, aimX: t.cx, aimY: t.cy, hour: 10, watched: 6, hardness: HARDNESS.standard, stored: false };
};

export default function CdeLab() {
  const world = useMemo(() => buildWorld(SEED), []);
  const target = world.buildings[world.targetId];
  const [plan, setPlanState] = useState<Plan>(() => defaultPlan(world));
  const [obs, setObs] = useState<Observations>({});
  const [lawful, setLawful] = useState(true);
  const [rulesId, setRulesId] = useState('afg2009');
  const [runs, setRuns] = useState(400);
  const [layers, setLayers] = useState<Layers>({ people: true, circle: true, pattern: true, impacts: true, labels: true });
  const [est, setEst] = useState<Estimate | null>(null);
  const [computing, setComputing] = useState(false);
  const [estSeed, setEstSeed] = useState(1);
  const [hourProfile, setHourProfile] = useState<number[] | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [striking, setStriking] = useState(false);
  const [spotMode, setSpotMode] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [pop, setPop] = useState<{ bid: number; x: number; y: number; n: number } | null>(null);
  const [chapter, setChapter] = useState<number | null>(null);
  const [card, setCard] = useState<number | null>(null);
  const [aimDrag, setAimDrag] = useState(false);
  const [dayPlay, setDayPlay] = useState(false);
  const [showCards, setShowCards] = useState(true);
  const [histMode, setHistMode] = useState<HistMode>('figure');
  const [showTables, setShowTables] = useState(false);

  // Jev.
  const [jevStatus, setJevStatus] = useState<JevStatus>({ running: false, done: 0, total: 0, inflight: 0, workers: 0, rate: 0 });
  const [results, setResults] = useState<Scored[]>([]);
  const [testing, setTesting] = useState<Candidate | null>(null);
  const [follow, setFollow] = useState(true);
  const [speed, setSpeed] = useState(4); // index into SPEEDS
  const [minPk, setMinPk] = useState(0.85);
  const [hours, setHours] = useState<HourWindow>('any');
  const [allowed, setAllowed] = useState<WeaponId[]>(WEAPONS.map((w) => w.id));
  const [log, setLog] = useState<{ t: string; kind: 'info' | 'best' | 'try' | 'step' }[]>([]);
  const [jevPhase, setJevPhase] = useState<'idle' | 'checklist' | 'search' | 'done'>('idle');
  const [peek, setPeek] = useState<Scored | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CdeScene | null>(null);
  const frameRef = useRef<Frame | null>(null);
  const jevRef = useRef<Jev | null>(null);
  const bestRef = useRef<Scored | undefined>(undefined);
  const lastShown = useRef(0);
  const scriptTimers = useRef<number[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const rules = RULES.find((r) => r.id === rulesId)!;
  const setPlan = useCallback((p: Partial<Plan>) => {
    setPlanState((old) => ({ ...old, ...p }));
    setOutcome(null);
  }, []);

  // Fonts for the explainer look.
  useEffect(() => {
    if (document.querySelector(`link[href="${FONTS}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONTS;
    document.head.appendChild(l);
    const t = document.title;
    document.title = 'CDE Lab — how a strike is weighed';
    return () => {
      document.title = t;
    };
  }, []);

  const popNow = useMemo(() => population(world, plan.hour, plan.watched, obs), [world, plan.hour, plan.watched, obs]);
  const circle = useMemo(() => inCircle(world, plan, popNow), [world, plan, popNow]);

  // Every change reruns the estimate.
  useEffect(() => {
    setComputing(true);
    const id = window.setTimeout(() => {
      setEst(estimate(world, plan, popNow, runs, estSeed));
      setComputing(false);
    }, 90);
    return () => clearTimeout(id);
  }, [world, plan, popNow, runs, estSeed]);

  // Harm by hour, for the same plan: computed in a worker so dragging stays smooth.
  const profileWorker = useRef<Worker | null>(null);
  useEffect(() => {
    let w: Worker | null = null;
    try {
      w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<JobOut>) => setHourProfile(e.data.out.map((s) => s.p90));
    } catch {
      w = null;
    }
    profileWorker.current = w;
    return () => w?.terminate();
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const cands: Candidate[] = Array.from({ length: 24 }, (_, h) => ({ weapon: plan.weapon, fuze: plan.fuze, heading: plan.heading, aim: 'custom', hour: h }));
      const msg: JobIn = { job: Date.now(), seed: SEED, base: plan, obs, runs: 150, cands };
      profileWorker.current?.postMessage(msg);
    }, 250);
    return () => clearTimeout(id);
  }, [plan.weapon, plan.fuze, plan.heading, plan.aimX, plan.aimY, plan.watched, plan.hardness, plan.stored, obs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play through the day.
  useEffect(() => {
    if (!dayPlay) return;
    const id = window.setInterval(() => setPlanState((p) => ({ ...p, hour: (Math.round(p.hour * 2) / 2 + 0.5) % 24 })), 450);
    return () => clearInterval(id);
  }, [dayPlay]);

  // ------------------------------------------------------------ Jev

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);
  const pushLog = useCallback((t: string, kind: 'info' | 'best' | 'try' | 'step' = 'info') => setLog((l) => [...l.slice(-80), { t, kind }]), []);
  const speedRef = useRef(SPEEDS[speed]);
  speedRef.current = SPEEDS[speed];

  useEffect(() => {
    const jev = new Jev({
      onStatus: setJevStatus,
      onTesting: (c) => {
        const now = performance.now();
        const gap = speedRef.current === Infinity ? 180 : Math.min(250, 1000 / speedRef.current);
        if (now - lastShown.current < gap * 0.9) return;
        lastShown.current = now;
        setTesting(c);
      },
      onResults: (r) => setResults(r),
    });
    jevRef.current = jev;
    return () => {
      jev.dispose();
      scriptTimers.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (jevRef.current) jevRef.current.throttle = SPEEDS[speed];
  }, [speed]);

  const bestNow = useMemo(() => best(results, minPk), [results, minPk]);

  // Narrate: new bests, and each plan when slow enough to read.
  const seenCount = useRef(0);
  useEffect(() => {
    const fresh = results.slice(seenCount.current);
    seenCount.current = results.length;
    if (!fresh.length) return;
    if (SPEEDS[speed] <= 8) for (const s of fresh.slice(-4)) pushLog(`${describe(s.c)} → figure ${s.p90}, target ${pct(s.pk)}`, 'try');
    const b = best(results, minPk);
    if (b && (!bestRef.current || key(b.c) !== key(bestRef.current.c))) {
      pushLog(`New best: ${describe(b.c)} → planning figure ${b.p90}, mean ${b.mean.toFixed(1)}, target destroyed ${pct(b.pk)}`, 'best');
      bestRef.current = b;
    }
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  // The requirement changed mid-run: re-rank on the fly.
  const firstPk = useRef(true);
  useEffect(() => {
    if (firstPk.current) {
      firstPk.current = false;
      return;
    }
    const b = best(results, minPk);
    bestRef.current = b;
    pushLog(`Requirement now ≥ ${pct(minPk)} chance of destroying the target. ${b ? `Best: ${describe(b.c)} → ${b.p90}` : 'Nothing tried so far meets it.'}`, 'step');
  }, [minPk]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (jevPhase === 'search' && !jevStatus.running && jevStatus.done >= jevStatus.total && jevStatus.total > 0) {
      setJevPhase('done');
      const b = best(results, minPk);
      if (b) {
        const a = approver(b.p90, rules);
        pushLog(`Done: ${jevStatus.done} plans. Best: ${describe(b.c)} → planning figure ${b.p90}. Sign-off: ${a.who}.`, 'best');
      } else pushLog(`Done: ${jevStatus.done} plans. None destroys the target ${pct(minPk)} of the time. Relax the requirement or reconsider the strike.`, 'best');
    }
  }, [jevStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const space = useCallback(() => ({ weapons: allowed, hours: WINDOWS[hours] }), [allowed, hours]);

  const runJev = () => {
    const jev = jevRef.current;
    if (!jev) return;
    scriptTimers.current.forEach(clearTimeout);
    scriptTimers.current = [];
    setLog([]);
    bestRef.current = undefined;
    seenCount.current = 0;
    setJevPhase('checklist');
    jev.throttle = SPEEDS[speed];
    const sp = space();
    const n = sp.weapons.length * 3 * 8 * 5 * sp.hours.length;
    const big = weapon(sp.weapons.includes('large') ? 'large' : sp.weapons[0]);
    const c = inCircle(world, { ...plan, weapon: big.id, fuze: 'instant' }, popNow);
    const homes = c.kinds.home + c.kinds.shop;
    const steps = [
      () => pushLog('Checking: is the warehouse a lawful target?', 'step'),
      () => pushLog(lawful ? 'Marked as a military objective by the targeting cell. That is a legal call made by people; Jev takes it as given.' : 'Not confirmed as a lawful target. Stop here: no estimate can make an unlawful strike lawful.', lawful ? 'info' : 'best'),
      () => lawful && pushLog(`Crude circle for the ${big.short}: ${c.radius} m. Inside: ${[...c.sensitive, `${homes} homes and shops`].join(', ')}. Something to protect, so go on.`, 'step'),
      () => lawful && pushLog(`Sweeping ${n.toLocaleString()} plans (${sp.weapons.length} weapons × 3 fuzes × 8 directions × 5 aim points × ${sp.hours.length} hours), ${jev.runs} runs each, on ${jev.workers} workers.`, 'step'),
      () => {
        if (!lawful) {
          setJevPhase('idle');
          return;
        }
        setJevPhase('search');
        jev.start(plan, obs, sp, SEED);
      },
    ];
    const gap = SPEEDS[speed] === Infinity ? 150 : Math.max(200, 1300 / Math.sqrt(SPEEDS[speed]));
    steps.forEach((f, i) => scriptTimers.current.push(window.setTimeout(f, i * gap)));
  };

  // If the assumptions Jev scores against change mid-run, restart it with them.
  const assumptions = `${plan.watched}|${plan.hardness}|${plan.stored}|${JSON.stringify(obs)}|${allowed.join()}|${hours}`;
  const lastAssumptions = useRef(assumptions);
  useEffect(() => {
    if (assumptions === lastAssumptions.current) return;
    const onlySpace = assumptions.split('|').slice(0, 4).join('|') === lastAssumptions.current.split('|').slice(0, 4).join('|');
    lastAssumptions.current = assumptions;
    const jev = jevRef.current;
    if (!jev || jevPhase !== 'search') return;
    pushLog(onlySpace ? 'Search space changed: keeping what still fits, carrying on.' : 'Assumptions changed (people seen, hours watched or the target): re-scoring from scratch.', 'step');
    bestRef.current = undefined;
    jev.start(plan, obs, space(), SEED, onlySpace);
  }, [assumptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyCandidate = (c: Candidate) => {
    const p = { ...plan };
    const t = target.rects[0];
    const off = { centre: [0, 0], north: [0, -0.28], south: [0, 0.28], east: [0.28, 0], west: [-0.28, 0], custom: [(plan.aimX - target.cx) / t.w, (plan.aimY - target.cy) / t.h] }[c.aim];
    setPlan({ ...p, weapon: c.weapon, fuze: c.fuze, heading: c.heading, hour: c.hour, aimX: t.x + t.w / 2 + off[0] * t.w, aimY: t.y + t.h / 2 + off[1] * t.h });
    pushLog(`Applied to the plan: ${describe(c)}.`, 'step');
  };

  // ------------------------------------------------------------ the scene

  const ghostCand = peek?.c ?? (jevPhase === 'search' || jevPhase === 'done' ? testing : null);
  const ghostPlan = useMemo(() => {
    if (!ghostCand) return null;
    const t = target.rects[0];
    const off = { centre: [0, 0], north: [0, -0.28], south: [0, 0.28], east: [0.28, 0], west: [-0.28, 0], custom: [0, 0] }[ghostCand.aim];
    return { ...plan, weapon: ghostCand.weapon, fuze: ghostCand.fuze, heading: ghostCand.heading, hour: ghostCand.hour, aimX: t.x + t.w / 2 + off[0] * t.w, aimY: t.y + t.h / 2 + off[1] * t.h };
  }, [ghostCand, plan, target]);
  const following = follow && !!ghostPlan && (jevStatus.running || !!peek) && !outcome && !striking;
  const shownPlan = following ? ghostPlan! : plan;
  const popShown = useMemo(() => (following ? population(world, shownPlan.hour, plan.watched, obs) : popNow), [following, shownPlan.hour, world, plan.watched, obs, popNow]);

  frameRef.current = {
    world,
    pop: popShown,
    plan: shownPlan,
    est: following ? null : est,
    layers,
    circleR: inCircle(world, shownPlan, popShown).radius,
    ghost: following ? null : ghostPlan,
    spotMode,
    hover,
    selected: pop?.bid ?? null,
    outcome,
    aimDrag,
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const scene = new CdeScene(canvas, world);
    sceneRef.current = scene;
    scene.resize();
    // Phones: start closer in, on the target and the school.
    if (canvas.clientWidth < 600) scene.view = { cx: 225, cy: 158, zoom: 2.4 };
    const ro = new ResizeObserver(() => scene.resize());
    ro.observe(canvas);
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (frameRef.current) scene.render(frameRef.current, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [world]);

  // Smoothly move the camera toward a focus.
  const focusRef = useRef<{ cx: number; cy: number; zoom: number } | null>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const s = sceneRef.current;
      const f = focusRef.current;
      if (s && f) {
        const v = s.view;
        v.cx += (f.cx - v.cx) * 0.08;
        v.cy += (f.cy - v.cy) * 0.08;
        v.zoom += (f.zoom - v.zoom) * 0.08;
        s.clampView();
        if (Math.abs(f.zoom - v.zoom) < 0.005 && Math.hypot(f.cx - v.cx, f.cy - v.cy) < 0.1) focusRef.current = null;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Pointer: drag the aim point, pan, zoom, spot people.
  const drag = useRef<{ mode: 'aim' | 'pan'; x: number; y: number; cx: number; cy: number } | null>(null);
  const localXY = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent) => {
    const s = sceneRef.current;
    if (!s || striking) return;
    const p = localXY(e);
    const w = s.toWorld(p.x, p.y);
    focusRef.current = null;
    if (spotMode) {
      openPeople(w.x, w.y, p.x, p.y);
      return;
    }
    const { s: sc } = s.cam();
    const nearAim = Math.hypot(w.x - plan.aimX, w.y - plan.aimY) * sc < 22;
    const onTarget = target.rects.some((q) => w.x >= q.x && w.x <= q.x + q.w && w.y >= q.y && w.y <= q.y + q.h);
    (e.target as Element).setPointerCapture(e.pointerId);
    if (!outcome && (nearAim || onTarget)) {
      drag.current = { mode: 'aim', x: p.x, y: p.y, cx: 0, cy: 0 };
      setAimDrag(true);
      moveAim(w.x, w.y);
    } else drag.current = { mode: 'pan', x: p.x, y: p.y, cx: s.view.cx, cy: s.view.cy };
  };
  const moveAim = (x: number, y: number) => {
    const q = target.rects[0];
    setPlan({ aimX: Math.max(q.x + 1, Math.min(q.x + q.w - 1, x)), aimY: Math.max(q.y + 1, Math.min(q.y + q.h - 1, y)) });
  };
  const onMove = (e: React.PointerEvent) => {
    const s = sceneRef.current;
    if (!s) return;
    const p = localXY(e);
    const w = s.toWorld(p.x, p.y);
    const d = drag.current;
    if (d?.mode === 'aim') moveAim(w.x, w.y);
    else if (d?.mode === 'pan') {
      const { s: sc } = s.cam();
      s.view.cx = d.cx - (p.x - d.x) / sc;
      s.view.cy = d.cy - (p.y - d.y) / sc;
      s.clampView();
    } else {
      const b = s.buildingAt(w.x, w.y);
      setHover(b && (spotMode || b.id === world.targetId) ? b.id : null);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setAimDrag(false);
    // A click (not a drag) on a building: who is inside right now?
    const s = sceneRef.current;
    if (d?.mode === 'pan' && s && e.type === 'pointerup') {
      const p = localXY(e);
      if (Math.hypot(p.x - d.x, p.y - d.y) < 5) {
        const w = s.toWorld(p.x, p.y);
        openPeople(w.x, w.y, p.x, p.y);
      }
    }
  };
  const openPeople = (wx: number, wy: number, px: number, py: number) => {
    const b = sceneRef.current?.buildingAt(wx, wy);
    if (!b || b.id === world.targetId) return setPop(null);
    setPop({ bid: b.id, x: px, y: py, n: obs[b.id] ?? shownCount(popNow, b) });
  };
  useEffect(() => {
    const c = canvasRef.current!;
    const wheel = (e: WheelEvent) => {
      const s = sceneRef.current;
      if (!s) return;
      e.preventDefault();
      focusRef.current = null;
      const p = localXY(e);
      const before = s.toWorld(p.x, p.y);
      s.view.zoom *= Math.exp(-e.deltaY * 0.0015);
      s.clampView();
      const after = s.toWorld(p.x, p.y);
      s.view.cx += before.x - after.x;
      s.view.cy += before.y - after.y;
      s.clampView();
    };
    c.addEventListener('wheel', wheel, { passive: false });
    return () => c.removeEventListener('wheel', wheel);
  }, []);

  // ------------------------------------------------------------ tour

  const goChapter = (i: number | null) => {
    setChapter(i);
    if (i == null) return;
    const ch = CHAPTERS[i];
    setCard(i);
    window.setTimeout(() => setCard((c) => (c === i ? null : c)), 1700);
    if (ch.plan) setPlan({ ...ch.plan, aimX: target.cx, aimY: target.cy });
    if (ch.layers) setLayers((l) => ({ ...l, ...ch.layers }));
    if (ch.focus) window.setTimeout(() => (focusRef.current = ch.focus!), 900);
    setHistMode(ch.hist ?? 'figure');
    setShowTables(!!ch.tables);
    setPop(null);
    if (ch.count) {
      // Open the sources for the biggest block of flats near the target, once the camera has settled.
      const flats = world.buildings
        .filter((b) => b.kind === 'home' && Math.hypot(b.cx - target.cx, b.cy - target.cy) < 90)
        .sort((a, b) => b.area - a.area)[0];
      if (flats)
        window.setTimeout(() => {
          const s = sceneRef.current;
          if (!s) return;
          const { s: sc, ox, oy } = s.cam();
          setPop({ bid: flats.id, x: flats.cx * sc + ox, y: flats.cy * sc + oy, n: shownCount(popNow, flats) });
        }, 2600);
    }
    setOutcome(null);
  };

  // ------------------------------------------------------------ strike

  const release = () => {
    const s = sceneRef.current;
    if (!s || !lawful) return;
    setOutcome(null);
    s.clearStrike();
    setStriking(true);
    setDayPlay(false);
    if (jevRef.current?.running) jevRef.current.pause();
    focusRef.current = { cx: plan.aimX, cy: plan.aimY + 10, zoom: 1.9 };
    s.onImpact = (o) => setOutcome(o);
    s.onSettled = () => setStriking(false);
    s.strike(plan, popNow, Math.floor(Math.random() * 1e9));
  };
  const resetTown = () => {
    sceneRef.current?.clearStrike();
    setOutcome(null);
    setStriking(false);
    focusRef.current = { cx: 225, cy: 150, zoom: 1.3 };
  };
  const holdForHour = () => {
    if (!hourProfile) return;
    let h = plan.hour;
    let bestV = Infinity;
    hourProfile.forEach((v, i) => {
      if (v < bestV || (v === bestV && Math.abs(i - plan.hour) < Math.abs(h - plan.hour))) {
        bestV = v;
        h = i;
      }
    });
    setPlan({ hour: h });
  };

  // ------------------------------------------------------------ derived

  const fig = est?.p90 ?? 0;
  const signoff = approver(fig, rules);
  const reduceTip = useMemo(() => {
    if (!est) return '';
    if (hourProfile) {
      const min = Math.min(...hourProfile);
      const at = hourProfile.indexOf(min);
      if (min < fig - 1) return `An hour when fewer are nearby (${fmtHour(at)}: ${min})`;
    }
    if (plan.weapon === 'large' || plan.weapon === 'medium') return 'A smaller warhead';
    if (plan.fuze !== 'delay') return 'A delay fuze';
    const s = world.buildings[world.schoolId];
    const toSchool = (Math.atan2(s.cx - plan.aimX, -(s.cy - plan.aimY)) * 180) / Math.PI;
    const diff = Math.abs(((plan.heading - toSchool + 540) % 360) - 180);
    if (diff < 90) return 'An approach that throws fragments away from the school';
    return 'Watch longer, to narrow the guess';
  }, [est, hourProfile, fig, plan, world]);

  const schoolNow = shownCount(popNow, world.buildings[world.schoolId]);
  const w = weapon(plan.weapon);

  return (
    <div className="landing cde">
      <nav className="l-nav">
        <a className="l-logo" {...linkTo('/')}>
          Atmos<span>[ cde lab ]</span>
        </a>
        <div className="l-links" />
        <div className="l-actions">
          <span className="cde-exp">An explainer, not a targeting tool</span>
          <button className="l-pill dark" onClick={() => goChapter(chapter == null ? 0 : null)}>
            {chapter == null ? 'Take the tour' : 'End tour'}
          </button>
        </div>
      </nav>

      <header className="cde-head">
        <p className="cde-kicker">Collateral damage estimation</p>
        <h1>How a strike is weighed</h1>
        <p>
          A paper town, a warehouse said to hold weapons, and a school across the road. Change the weapon, the fuze, the direction of attack, the aim point and the hour, and watch the estimate of people killed or badly hurt move. Or let Jev sweep thousands of plans in parallel.
        </p>
      </header>

      <div className="cde-grid">
        <section className="cde-stage">
          <div className="cde-map">
            <canvas
              ref={canvasRef}
              className={`cde-canvas ${spotMode ? 'spot' : ''} ${hover === world.targetId && !spotMode ? 'aim' : ''}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => setHover(null)}
              aria-label="A paper model of a town, seen from above"
            />
            <div className="cde-when">
              <b>{partOfDay(shownPlan.hour)}</b>
              <span>{fmtHour(shownPlan.hour)}</span>
              {following && <em>Jev is testing</em>}
            </div>

            {showCards && (
              <div className="cde-cards">
                <Checklist
                  lawful={lawful}
                  circle={circle.sensitive.length ? `${circle.sensitive[0] === 'School' ? 'The school' : circle.sensitive[0]}: go on` : circle.people > 0.5 ? 'Homes: go on' : 'Nothing: no estimate needed'}
                  weaponLine={`${w.short} · ${FUZES.find((f) => f.id === plan.fuze)!.name.toLowerCase()} · heading ${compass(plan.heading)}`}
                  reduce={reduceTip}
                  computing={computing}
                  signoff={`${signoff.who}`}
                  signLevel={signoff.level}
                />
                {est && histMode !== 'spread' && <ApproveCard level={signoff.level} figure={est.p90} rules={rules} />}
                {est && <Histogram est={est} rules={rules} computing={computing} aside={following} mode={histMode} onMode={setHistMode} />}
              </div>
            )}

            {showTables && (
              <div className="cde-tables">
                <TablesScene />
                <div className="cde-card cde-table">
                  <h4>Blast and fragments</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Weapon</th>
                        <th>Blast</th>
                        <th>Fragments</th>
                        <th>Half land within</th>
                      </tr>
                    </thead>
                    <tbody>
                      {WEAPONS.map((wp) => (
                        <tr key={wp.id} className={wp.id === plan.weapon ? 'on' : ''} onClick={() => setPlan({ weapon: wp.id })}>
                          <td>{wp.name}</td>
                          <td>{wp.blast} m</td>
                          <td>{wp.frag} m</td>
                          <td>{wp.cep} m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="cde-hint">Illustrative numbers, invented for this model. Real tables are classified. Click a row to choose that weapon.</p>
                  {chapter == null && (
                    <button className="cde-link" onClick={() => setShowTables(false)}>
                      Close the tables
                    </button>
                  )}
                </div>
              </div>
            )}

            {card != null && (
              <div className="cde-chapter" key={card}>
                <div>
                  <span className="n">{card + 1}</span>
                  <h2>{CHAPTERS[card].title}</h2>
                </div>
              </div>
            )}
            {chapter != null && card == null && (
              <div className="cde-caption">
                <span className="n">{chapter + 1}</span>
                <div>
                  <h3>{CHAPTERS[chapter].title}</h3>
                  <p>{CHAPTERS[chapter].text}</p>
                </div>
                <div className="cde-caption-nav">
                  <button onClick={() => goChapter(Math.max(0, chapter - 1))} disabled={chapter === 0}>
                    Back
                  </button>
                  {chapter < CHAPTERS.length - 1 ? <button className="dark" onClick={() => goChapter(chapter + 1)}>Next</button> : <button className="dark" onClick={() => { goChapter(null); release(); }}>Release</button>}
                </div>
              </div>
            )}

            {outcome && (
              <div className="cde-outcome">
                <p className="cde-kicker">One outcome</p>
                <div className="big">
                  {outcome.count}
                  <span>{outcome.count === 1 ? 'person' : 'people'} killed or badly hurt</span>
                </div>
                {est && (
                  <p>
                    The estimate said half the runs at or below <b>{est.p50}</b>, nine in ten at or below <b>{est.p90}</b>. This time it was {outcome.count}.
                  </p>
                )}
                <p>
                  Target {outcome.destroyed ? 'destroyed' : <b>not destroyed</b>}. It landed {Math.round(Math.hypot(outcome.ix - plan.aimX, outcome.iy - plan.aimY))} m from the aim point
                  {outcome.secondary ? ', and what was stored inside went off too.' : '.'}
                </p>
                <p className="cde-small">Every red ring is a person in the model. Real people have names.</p>
                <div className="cde-row">
                  <button className="l-pill dark" onClick={resetTown} disabled={striking}>
                    Rebuild the town
                  </button>
                  <button className="l-pill ghost" onClick={release} disabled={striking}>
                    Roll again
                  </button>
                </div>
              </div>
            )}

            {pop && (
              <div
                className="cde-card cde-pop"
                style={{
                  left: Math.max(10, Math.min(pop.x + 24, (canvasRef.current?.clientWidth ?? 400) - 330)),
                  top: Math.max(10, Math.min(pop.y - 40, (canvasRef.current?.clientHeight ?? 600) - 330)),
                }}
              >
                <h4>People inside right now</h4>
                <span>
                  {placeName(world.buildings[pop.bid])} · {fmtHour(plan.hour)}
                </span>
                <SourceBars s={sources(world, popNow, world.buildings[pop.bid])} onUse={(n) => setPop({ ...pop, n })} />
                <div className="cde-stepper">
                  <button onClick={() => setPop({ ...pop, n: Math.max(0, pop.n - 1) })}>−</button>
                  <em>{pop.n} seen</em>
                  <button onClick={() => setPop({ ...pop, n: Math.min(world.buildings[pop.bid].slots.length / 2, pop.n + 1) })}>+</button>
                </div>
                <div className="cde-row">
                  <button
                    className="l-pill dark"
                    onClick={() => {
                      setObs({ ...obs, [pop.bid]: pop.n });
                      setPop(null);
                    }}
                  >
                    Log it
                  </button>
                  {obs[pop.bid] != null && (
                    <button
                      className="l-pill ghost"
                      onClick={() => {
                        const o = { ...obs };
                        delete o[pop.bid];
                        setObs(o);
                        setPop(null);
                      }}
                    >
                      Forget
                    </button>
                  )}
                  <button className="cde-x" onClick={() => setPop(null)} aria-label="Close">
                    ×
                  </button>
                </div>
              </div>
            )}

            <div className="cde-bar">
              {(
                [
                  ['people', 'People inside'],
                  ['pattern', 'Pattern'],
                  ['circle', 'Circle'],
                  ['impacts', 'Landings'],
                  ['labels', 'Labels'],
                ] as [keyof Layers, string][]
              ).map(([k, name]) => (
                <button key={k} className={`cde-chip ${layers[k] ? 'on' : ''}`} onClick={() => setLayers({ ...layers, [k]: !layers[k] })} aria-pressed={layers[k]}>
                  {name}
                </button>
              ))}
              <button className={`cde-chip ${showCards ? 'on' : ''}`} onClick={() => setShowCards(!showCards)}>
                Cards
              </button>
              <span className="cde-zoom">
                <button onClick={() => (focusRef.current = { ...sceneRef.current!.view, zoom: sceneRef.current!.view.zoom * 1.35 })} aria-label="Zoom in">
                  +
                </button>
                <button onClick={() => (focusRef.current = { ...sceneRef.current!.view, zoom: sceneRef.current!.view.zoom / 1.35 })} aria-label="Zoom out">
                  −
                </button>
                <button onClick={() => (focusRef.current = { cx: 225, cy: 150, zoom: 1.3 })}>Fit</button>
              </span>
            </div>
          </div>
        </section>

        <aside className="cde-panel">
          <Group n={1} title="The target">
            <label className="cde-check">
              <input type="checkbox" checked={lawful} onChange={(e) => setLawful(e.target.checked)} />
              <span>
                Confirmed lawful military objective
                <small>A legal judgment by people, before any estimate. Untick it and nothing else matters.</small>
              </span>
            </label>
            <Seg
              value={plan.hardness}
              onChange={(hardness) => setPlan({ hardness })}
              options={[
                [HARDNESS.light, 'Light shed'],
                [HARDNESS.standard, 'Warehouse'],
                [HARDNESS.reinforced, 'Reinforced'],
              ]}
            />
            <label className="cde-check">
              <input type="checkbox" checked={plan.stored} onChange={(e) => setPlan({ stored: e.target.checked })} />
              <span>
                Weapons stored inside
                <small>If it's destroyed, what's inside may go off too, whatever bomb you choose.</small>
              </span>
            </label>
          </Group>

          <Group n={2} title="Weapon">
            <div className="cde-weapons">
              {WEAPONS.map((wp) => (
                <button key={wp.id} className={plan.weapon === wp.id ? 'on' : ''} onClick={() => setPlan({ weapon: wp.id })}>
                  <b>{wp.name}</b>
                  <span>{wp.note}</span>
                  <em>
                    blast {wp.blast} m · fragments {wp.frag} m · lands within {wp.cep} m half the time
                  </em>
                </button>
              ))}
            </div>
            <Seg value={plan.fuze} onChange={(fuze) => setPlan({ fuze })} options={FUZES.map((f) => [f.id, f.name] as [typeof f.id, string])} />
            <p className="cde-hint">{FUZES.find((f) => f.id === plan.fuze)!.note}</p>
            <button className="cde-link" onClick={() => setShowTables(!showTables)}>
              {showTables ? 'Close the tables' : 'Open the blast and fragment tables'}
            </button>
          </Group>

          <Group n={3} title="Direction and aim">
            <div className="cde-dir">
              <Dial value={plan.heading} onChange={(heading) => setPlan({ heading })} />
              <div>
                <p className="cde-hint">
                  Arriving from the {compass(plan.heading + 180)}, heading {compass(plan.heading)}. Fragments lean the way it's travelling.
                </p>
                <p className="cde-hint">Drag the crosshair on the warehouse to move the aim point.</p>
                <button className="cde-link" onClick={() => setPlan({ aimX: target.cx, aimY: target.cy })}>
                  Re-centre the aim
                </button>
              </div>
            </div>
          </Group>

          <Group n={4} title="Who is there">
            <div className="cde-slider">
              <span>
                Hour <em>{fmtHour(plan.hour)}</em>
              </span>
              <input type="range" min={0} max={23.5} step={0.5} value={plan.hour} onChange={(e) => setPlan({ hour: +e.target.value })} />
            </div>
            {hourProfile && <HourBars values={hourProfile} hour={plan.hour} onPick={(hour) => setPlan({ hour })} />}
            <div className="cde-row">
              <button className="cde-chip dark-ish" onClick={() => setDayPlay(!dayPlay)}>
                {dayPlay ? 'Stop the clock' : 'Play the day'}
              </button>
              <span className="cde-hint">
                School: {schoolNow ? `${schoolNow} inside` : 'empty'} · ~{Math.round(circle.people)} people in the circle
              </span>
            </div>
            <div className="cde-slider">
              <span>
                Hours watched <em>{plan.watched} h</em>
              </span>
              <input type="range" min={0} max={72} step={2} value={plan.watched} onChange={(e) => setPlan({ watched: +e.target.value })} />
            </div>
            <div className="cde-row">
              <button className={`cde-chip ${spotMode ? 'on' : ''}`} onClick={() => setSpotMode(!spotMode)} aria-pressed={spotMode}>
                {spotMode ? 'Done spotting' : 'Log people seen'}
              </button>
              {Object.keys(obs).length > 0 && (
                <button className="cde-link" onClick={() => setObs({})}>
                  Forget {Object.keys(obs).length} sighting{Object.keys(obs).length > 1 ? 's' : ''}
                </button>
              )}
            </div>
            {spotMode && <p className="cde-hint">Click any building to compare what overhead images, phone signals and the census say, and log a count. Logged counts replace the model's guess (blue dots).</p>}
          </Group>

          <Group n={5} title="Who signs off">
            <Seg value={rulesId} onChange={setRulesId} options={RULES.map((r) => [r.id, r.name] as [string, string])} />
            <p className="cde-hint">Senior sign-off at {rules.senior} or more: {rules.source}.</p>
            <div className="cde-sign">
              {[0, 1, 2, 3].map((l) => (
                <span key={l} className={l === signoff.level ? 'on' : l < signoff.level ? 'past' : ''}>
                  {['Strike cell', 'Task force', 'Theater', rules.senior >= 30 ? 'Defense sec.' : 'Senior cmdr'][l]}
                </span>
              ))}
            </div>
            <p className="cde-hint">{signoff.note}</p>
            <Seg value={runs} onChange={setRuns} options={[[100, '100 runs'], [400, '400 runs'], [1000, '1,000 runs']]} />
            <button className="cde-link" onClick={() => setEstSeed(estSeed + 1)}>
              Run the estimate again with new dice
            </button>
          </Group>

          <Group n={6} title="Decide">
            <div className="cde-decide">
              <button className="l-pill dark" onClick={release} disabled={!lawful || striking}>
                Release
              </button>
              <button className="l-pill ghost" onClick={holdForHour} disabled={!hourProfile || striking}>
                Hold for a better hour
              </button>
              <button className="l-pill ghost" onClick={resetTown} disabled={striking}>
                Call it off
              </button>
            </div>
            {!lawful && <p className="cde-hint warn">No lawful target, no strike.</p>}
            <p className="cde-hint">Whether the expected harm is excessive against the military advantage is a human judgment. The model can't make it.</p>
          </Group>
        </aside>
      </div>

      <section className="cde-jev">
        <div className="cde-jev-head">
          <div>
            <p className="cde-kicker">Auto-analyst</p>
            <h2>
              Jev <span className={`cde-status ${jevPhase}`}>{jevPhase === 'idle' ? 'Idle' : jevPhase === 'checklist' ? 'Walking the checklist' : jevPhase === 'search' ? (jevStatus.running ? 'Searching' : 'Paused') : 'Done'}</span>
            </h2>
          </div>
          <div className="cde-row">
            <button className="l-pill dark" onClick={runJev}>
              {jevPhase === 'idle' ? 'Run Jev' : 'Start over'}
            </button>
            {jevPhase === 'search' && (
              <button className="l-pill ghost" onClick={() => (jevStatus.running ? jevRef.current?.pause() : jevRef.current?.resume())}>
                {jevStatus.running ? 'Pause' : 'Resume'}
              </button>
            )}
            {jevPhase === 'search' && !jevStatus.running && (
              <button className="l-pill ghost" onClick={() => jevRef.current?.step()}>
                Step
              </button>
            )}
          </div>
        </div>

        <div className="cde-jev-grid">
          <div className="cde-jev-controls">
            <div className="cde-slider">
              <span>
                Throttle <em>{SPEEDS[speed] === Infinity ? 'flat out' : `${SPEEDS[speed]} plans/s`}</em>
              </span>
              <input type="range" min={0} max={SPEEDS.length - 1} step={1} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
            </div>
            <div className="cde-slider">
              <span>
                Workers in parallel <em>{jevStatus.workers}</em>
              </span>
              <input type="range" min={1} max={Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4))} step={1} value={jevStatus.workers || 1} onChange={(e) => jevRef.current?.setWorkers(+e.target.value)} />
            </div>
            <div className="cde-slider">
              <span>
                Must destroy the target <em>{pct(minPk)} of runs</em>
              </span>
              <input type="range" min={0.5} max={0.99} step={0.01} value={minPk} onChange={(e) => setMinPk(+e.target.value)} />
            </div>
            <Seg value={hours} onChange={setHours} options={[['any', 'Any hour'], ['night', 'Night only'], ['school-closed', 'School closed']]} />
            <div className="cde-allowed">
              {WEAPONS.map((wp) => (
                <label key={wp.id} className="cde-check small">
                  <input
                    type="checkbox"
                    checked={allowed.includes(wp.id)}
                    onChange={(e) => {
                      const next = e.target.checked ? [...allowed, wp.id] : allowed.filter((x) => x !== wp.id);
                      if (next.length) setAllowed(WEAPONS.map((x) => x.id).filter((x) => next.includes(x)));
                    }}
                  />
                  <span>{wp.short}</span>
                </label>
              ))}
            </div>
            <label className="cde-check small">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              <span>Show each plan on the map as Jev tries it</span>
            </label>
            <div className="cde-progress">
              <div style={{ width: `${jevStatus.total ? (100 * jevStatus.done) / jevStatus.total : 0}%` }} />
            </div>
            <p className="cde-hint mono">
              {jevStatus.done.toLocaleString()} / {jevStatus.total.toLocaleString()} plans · {jevStatus.rate.toFixed(0)}/s · {jevStatus.inflight} of {jevStatus.workers} workers busy
            </p>
          </div>

          <div className="cde-jev-mid">
            <div className="cde-testing" key={testing ? key(testing) : 'none'}>
              <p className="cde-kicker">{jevPhase === 'search' ? 'Now testing' : 'Next up'}</p>
              {testing ? (
                <div className="cde-flip">
                  <Chip k="Weapon" v={weapon(testing.weapon).short} />
                  <Chip k="Fuze" v={FUZES.find((f) => f.id === testing.fuze)!.name} />
                  <Chip k="Heading" v={HEADING_NAMES[testing.heading]} />
                  <Chip k="Aim" v={testing.aim} />
                  <Chip k="Hour" v={fmtHour(testing.hour)} />
                </div>
              ) : (
                <p className="cde-hint">Press Run Jev. It walks the checklist, then tries every combination, runs each one {jevRef.current?.runs ?? 120} times, and keeps the plan that meets the requirement with the least harm.</p>
              )}
            </div>
            <div className="cde-log" ref={logRef}>
              {log.map((l, i) => (
                <div key={i} className={l.kind}>
                  {l.t}
                </div>
              ))}
            </div>
          </div>

          <div className="cde-jev-right">
            <Scatter results={results} best={bestNow} minPk={minPk} onPeek={setPeek} onPick={(s) => applyCandidate(s.c)} />
            {bestNow ? (
              <div className="cde-best">
                <p className="cde-kicker">Best so far</p>
                <b>{describe(bestNow.c)}</b>
                <span>
                  Planning figure {bestNow.p90} · mean {bestNow.mean.toFixed(1)} · target destroyed {pct(bestNow.pk)} · {approver(bestNow.p90, rules).who}
                </span>
                <button className="l-pill dark" onClick={() => applyCandidate(bestNow.c)}>
                  Use this plan
                </button>
              </div>
            ) : (
              <p className="cde-hint">Each dot is a plan: harm across, chance of destroying the target up. Hover to preview it on the map, click to use it.</p>
            )}
          </div>
        </div>
      </section>

      <footer className="cde-foot">
        <p>
          <b>About this model.</b> An illustrative explainer of the collateral damage estimation process as it has been publicly described. Weapon radii, how people are spread through the day, shielding and approval levels are simplified and invented for teaching; the two approval thresholds are as reported in the press. Real estimates rest on classified data, and the decisions that matter, whether a target is lawful and whether the expected harm is excessive, are made by people. Inspired by an explainer by{' '}
          <a href="https://x.com/tobiaschneider" target="_blank" rel="noreferrer">
            Tobias Schneider
          </a>
          .
        </p>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- pieces

const pct = (v: number) => `${Math.round(v * 100)}%`;
const describe = (c: Candidate) => `${weapon(c.weapon).short}, ${FUZES.find((f) => f.id === c.fuze)!.name.toLowerCase()} fuze, heading ${compass(c.heading)}, aim ${c.aim}, ${fmtHour(c.hour)}`;
function SourceBars({ s, onUse }: { s: Sources; onUse: (n: number) => void }) {
  const rows: [string, number, string][] = [
    ['Overhead images', s.overhead, 'Only people outside or at a window'],
    ['Phone signals', s.phones, 'Not everyone carries one'],
    ['Census, years old', s.census, 'Who lived here, not who is here now'],
    ["The model's guess", s.model, 'Pattern of life at this hour'],
  ];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="cde-sources">
      {rows.map(([name, v, note], i) => (
        <button key={name} className={i === 2 ? 'old' : i === 3 ? 'model' : ''} onClick={() => onUse(v)} title={`${note}. Click to use ${v}.`}>
          <span>{name}</span>
          <span className="bar">
            <i style={{ width: `${(v / max) * 100}%` }} />
            <b>{v}</b>
          </span>
        </button>
      ))}
      <small>The sources disagree. Click one to use its count, or set your own.</small>
    </div>
  );
}

function Group({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="cde-group">
      <h3>
        <span>{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Seg<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="cde-seg" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)} role="radio" aria-checked={v === value}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Chip({ k, v }: { k: string; v: string }) {
  return (
    <span className="cde-flipchip">
      <small>{k}</small>
      <b>{v}</b>
    </span>
  );
}

function Checklist(p: { lawful: boolean; circle: string; weaponLine: string; reduce: string; computing: boolean; signoff: string; signLevel: number }) {
  const rows: { done: boolean | 'spin'; t: string; sub?: string; warn?: boolean }[] = [
    { done: p.lawful, t: 'Lawful target', sub: p.lawful ? undefined : 'Not confirmed: stop here', warn: !p.lawful },
    { done: p.lawful, t: 'Crude circle: anything inside?', sub: p.circle },
    { done: p.lawful, t: 'Weapon, fuze, direction, aim', sub: p.weaponLine },
    { done: false, t: 'Ways to reduce the harm', sub: p.reduce },
    { done: p.computing ? 'spin' : p.lawful, t: 'Run the estimate again' },
    { done: p.lawful && !p.computing, t: 'Who signs off', sub: p.signoff },
  ];
  return (
    <div className="cde-card cde-checklist">
      <h4>The estimate</h4>
      {rows.map((r, i) => (
        <div key={i} className="cde-item">
          <span className={`box ${r.done === 'spin' ? 'spin' : r.done ? 'done' : ''}`}>
            {r.done === true && (
              <svg viewBox="0 0 20 20">
                <path d="M4 10.5l4 4 8-10" />
              </svg>
            )}
          </span>
          <div>
            <b>{r.t}</b>
            {r.sub && <em className={r.warn ? 'warn' : ''}>{r.sub}</em>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** A caption box inside an SVG chart, in the explainer's style. */
function Box({ x, y, text, anchor = 'middle', tone = 'ink', size = 11 }: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end'; tone?: 'ink' | 'brick'; size?: number }) {
  const w = text.length * size * 0.56 + 12;
  const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return (
    <g className={`box ${tone}`}>
      <rect x={left + 1.5} y={y - size - 3.5} width={w} height={size + 9} className="shadow" />
      <rect x={left} y={y - size - 5} width={w} height={size + 9} />
      <text x={left + w / 2} y={y} textAnchor="middle" style={{ fontSize: size }}>
        {text}
      </text>
    </g>
  );
}

function Histogram({ est, rules, computing, aside, mode, onMode }: { est: Estimate; rules: (typeof RULES)[number]; computing: boolean; aside: boolean; mode: HistMode; onMode: (m: HistMode) => void }) {
  // Up to 30 people, one bar each; beyond that, bars of 2, 5 or 10 people.
  const step = [1, 2, 5, 10].find((k) => est.max / k <= 32) ?? 20;
  const maxX = Math.max(30, Math.ceil((est.max + 1) / (step * 5)) * step * 5);
  const nb = Math.floor(maxX / step) + 1;
  const bins = new Array(nb).fill(0);
  for (const c of est.counts) bins[Math.min(nb - 1, Math.floor(c / step))]++;
  const peak = Math.max(...bins, 1);
  const W = 300;
  const H = 150;
  const bw = W / nb;
  const x = (v: number) => (v / step + 0.5) * bw;
  const barTop = (i: number) => H - (bins[i] / peak) * (H - 8);
  const tickStep = maxX <= 30 ? 5 : maxX <= 60 ? 10 : maxX <= 150 ? 25 : 50;
  const ticks = Array.from({ length: Math.floor(maxX / tickStep) + 1 }, (_, i) => i * tickStep);
  // "Most runs": the low cluster, up to the median.
  const low = est.p50;
  let lowRuns = 0;
  for (const c of est.counts) if (c <= low) lowRuns++;
  const maxBin = Math.min(nb - 1, Math.floor(est.max / step));
  const barClass = (i: number) => (mode === 'spread' ? (i * step <= low ? 'in' : 'out') : 'grey');
  return (
    <div className={`cde-card cde-hist ${computing ? 'busy' : ''} ${aside ? 'aside' : ''} mode-${mode}`}>
      <div className="cde-hist-head">
        <h4>{aside ? 'Your plan, while Jev tests others' : 'Our model: killed or badly hurt'}</h4>
        <span className="mono">{est.runs} runs</span>
      </div>
      <svg viewBox={`-6 -40 ${W + 12} ${H + 72}`} role="img" aria-label={`Histogram of ${est.runs} runs. ${lowRuns} runs at ${low} or fewer. Cautious figure ${est.p90}. Worst run ${est.max}.`}>
        {mode === 'spread' && (
          <text x={W / 2} y={-26} textAnchor="middle" className="sub">
            {lowRuns} of {est.runs} runs: {low === 0 ? 'none' : `${low} or fewer`}
          </text>
        )}
        {bins.map((_, i) => (
          <rect key={i} x={i * bw + 0.6} width={Math.max(0.5, bw - 1.2)} y={barTop(i)} height={H - barTop(i)} className={barClass(i)} />
        ))}
        {mode === 'spread' && (
          <>
            {bins[0] > 0 && (
              <g className="lead">
                <line x1={x(0)} x2={x(0)} y1={-2} y2={barTop(0)} />
                <circle cx={x(0)} cy={barTop(0)} r={2} />
                <Box x={x(0) - 4} y={-4} text="None" anchor="start" size={12} />
              </g>
            )}
            {est.max > 0 && (
              <g className="lead">
                <line x1={x(maxBin * step)} x2={x(maxBin * step)} y1={18} y2={H} />
                <circle cx={x(maxBin * step)} cy={H} r={2} />
                <Box x={x(maxBin * step)} y={20} text={String(est.max)} size={12} />
              </g>
            )}
          </>
        )}
        {mode === 'thresholds' &&
          RULES.map((r, i) => {
            if (r.senior > maxX) return null;
            const right = r.senior > maxX * 0.6;
            return (
              <g key={r.id} className={r.id === rules.id ? 'rule on' : 'rule'}>
                <line x1={x(r.senior)} x2={x(r.senior)} y1={-24 + i * 24} y2={H} />
                <circle cx={x(r.senior)} cy={-24 + i * 24} r={2.2} />
                <Box x={x(r.senior) + (right ? 6 : -4)} y={-14 + i * 24 + 16} text={`${r.name}: ${r.senior}`} anchor={right ? 'end' : 'start'} size={11} />
              </g>
            );
          })}
        {mode !== 'spread' && (
          <g className="fig">
            <line x1={x(est.p90)} x2={x(est.p90)} y1={-34} y2={H} />
            <path d={`M${x(est.p90) - 5},-38 L${x(est.p90) + 5},-38 L${x(est.p90)},-30 Z`} />
            {mode === 'figure' && (
              <>
                <line x1={x(est.p90) - 12} x2={x(est.p90)} y1={20} y2={20} />
                <circle cx={x(est.p90)} cy={20} r={2} />
                <Box x={x(est.p90) - 12} y={25} text={`One cautious figure: ${est.p90}`} anchor="end" tone="brick" size={11.5} />
              </>
            )}
          </g>
        )}
        <line x1={0} x2={W} y1={H} y2={H} className="axis" />
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H + 16} textAnchor="middle" className="tick">
            {t}
          </text>
        ))}
        <text x={W / 2} y={H + 30} textAnchor="middle" className="tick label">
          people
        </text>
      </svg>
      {mode === 'thresholds' && <div className="cde-hist-caption">Thresholds for senior approval, reportedly</div>}
      <div className="cde-hist-foot">
        <span>
          nine in ten runs at or below <b>{est.p90}</b> · median <b>{est.p50}</b> · target destroyed <b>{pct(est.pk)}</b>
        </span>
      </div>
      <div className="cde-hist-tabs" role="tablist">
        {(
          [
            ['spread', 'The spread'],
            ['figure', 'One figure'],
            ['thresholds', 'Thresholds'],
          ] as [HistMode, string][]
        ).map(([m, name]) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => onMode(m)} role="tab" aria-selected={mode === m}>
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function ApproveCard({ level, figure, rules }: { level: number; figure: number; rules: (typeof RULES)[number] }) {
  const rows = ['Most senior', 'More senior', 'Senior'];
  return (
    <div className="cde-card cde-approve">
      <h4>Who must approve</h4>
      {rows.map((r, i) => (
        <div key={r} className={3 - i === level ? 'on' : ''}>
          {r}
        </div>
      ))}
      <small>{level === 0 ? 'No civilian harm expected: the strike cell signs.' : `Figure ${figure}; senior sign-off at ${rules.senior} (${rules.name})`}</small>
    </div>
  );
}

/** A stack of paper books on a desk, with a pencil: the tables. */
function TablesScene() {
  return (
    <div className="cde-desk" aria-hidden>
      <svg viewBox="0 0 400 260">
        <defs>
          <linearGradient id="wood" x1="0" x2="1">
            <stop offset="0" stopColor="#c98a4b" />
            <stop offset="0.5" stopColor="#b8773c" />
            <stop offset="1" stopColor="#d49a5c" />
          </linearGradient>
          <linearGradient id="cover" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#dedbd4" />
            <stop offset="1" stopColor="#c9c5bc" />
          </linearGradient>
        </defs>
        <rect width="400" height="260" fill="url(#wood)" />
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M0 ${18 + i * 30} Q200 ${10 + i * 30 + (i % 2) * 14} 400 ${22 + i * 30}`} stroke="rgba(90,50,20,0.18)" fill="none" />
        ))}
        <polygon points="20,20 390,8 396,250 12,254" fill="#f4f0e6" />
        <polygon points="20,20 390,8 396,90 12,120" fill="rgba(60,40,20,0.08)" />
        {[2, 1, 0].map((k) => (
          <g key={k} transform={`translate(${96 + k * 3},${108 - k * 16})`}>
            <polygon points="0,40 150,22 196,56 46,78" fill="#8f8a80" transform="translate(4,8)" opacity="0.35" />
            <polygon points="0,40 46,78 46,92 0,54" fill="#e9e6de" />
            <polygon points="46,78 196,56 196,70 46,92" fill="#f7f5f0" />
            {Array.from({ length: 5 }, (_, j) => (
              <line key={j} x1={50 + j * 28} y1={82 - j * 4} x2={70 + j * 28} y2={79 - j * 4} stroke="#9a958b" strokeWidth="0.6" />
            ))}
            <polygon points="0,40 150,22 196,56 46,78" fill="url(#cover)" stroke="#8f8a80" strokeWidth="0.6" />
          </g>
        ))}
        <g transform="translate(270,150) rotate(-18)">
          <rect width="110" height="7" fill="#1f3a2c" />
          <polygon points="0,0 -16,3.5 0,7" fill="#e3c9a0" />
          <polygon points="-11,2.3 -16,3.5 -11,4.7" fill="#2a2520" />
          <rect x="104" width="9" height="7" fill="#c9a44c" />
          <rect x="113" width="8" height="7" fill="#e28b8b" rx="1.5" />
        </g>
        <rect x="300" y="186" width="30" height="20" rx="4" fill="#efe9dc" transform="rotate(-12 315 196)" />
        <line x1="171" y1="130" x2="171" y2="40" stroke="#231f1a" strokeWidth="1.2" />
        <circle cx="171" cy="130" r="2.5" fill="#231f1a" />
      </svg>
      <span className="cde-desk-label">Tables for blast and fragments</span>
      <span className="cde-desk-note">Reissued at least twice a year, reportedly</span>
    </div>
  );
}

function Dial({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let a = (Math.atan2(dx, -dy) * 180) / Math.PI;
    a = (Math.round(a / 15) * 15 + 360) % 360;
    onChange(a);
  };
  const h = (value * Math.PI) / 180;
  const ux = Math.sin(h);
  const uy = -Math.cos(h);
  return (
    <svg
      ref={ref}
      className="cde-dial"
      viewBox="-60 -60 120 120"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
      role="slider"
      aria-label="Attack heading"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={359}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange((value + 15) % 360);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange((value + 345) % 360);
      }}
    >
      <circle r={52} className="ring" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * 15 * Math.PI) / 180;
        const l = i % 6 === 0 ? 8 : 4;
        return <line key={i} x1={Math.sin(a) * 52} y1={-Math.cos(a) * 52} x2={Math.sin(a) * (52 - l)} y2={-Math.cos(a) * (52 - l)} className="tick" />;
      })}
      {['N', 'E', 'S', 'W'].map((t, i) => (
        <text key={t} x={Math.sin((i * Math.PI) / 2) * 38} y={-Math.cos((i * Math.PI) / 2) * 38 + 4} textAnchor="middle">
          {t}
        </text>
      ))}
      <line x1={-ux * 46} y1={-uy * 46} x2={ux * 18} y2={uy * 18} className="track" />
      <g transform={`translate(${ux * 20},${uy * 20}) rotate(${value})`}>
        <path d="M0,-9 L7,6 L0,2 L-7,6 Z" className="plane" />
      </g>
      <circle r={3} className="hub" />
    </svg>
  );
}

function HourBars({ values, hour, onPick }: { values: number[]; hour: number; onPick: (h: number) => void }) {
  const max = Math.max(1, ...values);
  return (
    <div className="cde-hours" role="group" aria-label="Planning figure by hour for this plan">
      {values.map((v, h) => (
        <button key={h} className={Math.floor(hour) === h ? 'on' : ''} onClick={() => onPick(h)} title={`${fmtHour(h)}: planning figure ${v}`}>
          <i style={{ height: `${6 + (v / max) * 94}%` }} />
        </button>
      ))}
      <div className="cde-hours-axis">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

const W_COL: Record<WeaponId, string> = { large: '#1d1b18', medium: '#6f5b43', small: '#b4472d', focused: '#2d5a86' };

function Scatter({ results, best: b, minPk, onPeek, onPick }: { results: Scored[]; best?: Scored; minPk: number; onPeek: (s: Scored | null) => void; onPick: (s: Scored) => void }) {
  const W = 320;
  const H = 210;
  const maxX = Math.max(10, ...results.map((r) => r.p90));
  const x = (v: number) => 28 + (v / maxX) * (W - 40);
  const y = (v: number) => H - 40 - v * (H - 54);
  // Jitter so identical plans don't sit on top of each other.
  const j = (s: Scored, k: number) => (((s.c.heading * 7 + s.c.hour * 13 + (s.c.aim.length + k) * 5) % 11) - 5) * 0.5;
  return (
    <svg className="cde-scatter" viewBox={`0 0 ${W} ${H}`} onPointerLeave={() => onPeek(null)}>
      <rect x={28} y={y(1)} width={W - 40} height={y(minPk) - y(1)} className="ok" />
      <line x1={28} x2={W - 12} y1={y(minPk)} y2={y(minPk)} className="req" />
      <text x={W - 12} y={y(minPk) - 4} textAnchor="end" className="lab">
        requirement {pct(minPk)}
      </text>
      <line x1={28} x2={28} y1={y(0)} y2={y(1)} className="axis" />
      <line x1={28} x2={W - 12} y1={y(0)} y2={y(0)} className="axis" />
      <text x={24} y={y(1) + 4} textAnchor="end" className="lab">
        100%
      </text>
      <text x={24} y={y(0)} textAnchor="end" className="lab">
        0
      </text>
      <text x={W - 12} y={y(0) + 13} textAnchor="end" className="lab">
        planning figure → {maxX}
      </text>
      <text x={32} y={y(1) - 2} className="lab">
        target destroyed ↑
      </text>
      {results.map((s, i) => (
        <circle
          key={i}
          cx={x(s.p90) + j(s, 1)}
          cy={y(s.pk) + j(s, 2)}
          r={2.2}
          fill={W_COL[s.c.weapon]}
          opacity={s.pk >= minPk ? 0.7 : 0.18}
          onPointerEnter={() => onPeek(s)}
          onClick={() => onPick(s)}
        />
      ))}
      {b && <circle cx={x(b.p90) + j(b, 1)} cy={y(b.pk) + j(b, 2)} r={6} className="best" />}
      <g className="legend">
        {WEAPONS.map((wp, i) => (
          <g key={wp.id} transform={`translate(${34 + i * 72},${H - 6})`}>
            <circle r={3} fill={W_COL[wp.id]} cy={-3} />
            <text x={6} y={0}>
              {wp.short}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
