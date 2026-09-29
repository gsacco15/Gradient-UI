// Jev: an auto-analyst that sweeps weapon, fuze, direction, aim and hour in parallel workers, throttled on the fly.
import { candidates, type Candidate, type Observations, type Plan, type Scored, type SearchSpace } from './model';
import { score, type JobIn, type JobOut } from './worker';

export interface JevStatus {
  running: boolean;
  done: number;
  total: number;
  inflight: number;
  workers: number;
  rate: number; // plans per second actually achieved
}

interface Slot {
  w: Worker | null;
  pending: number;
}

type Listener = {
  onTesting?: (c: Candidate) => void;
  onResults?: (s: Scored[]) => void;
  onStatus?: (s: JevStatus) => void;
};

export class Jev {
  private pool: Slot[] = [];
  private jobGen = new Map<number, number>();
  private queue: Candidate[] = [];
  private job = 0;
  private generation = 0;
  private timer: number | null = null;
  private budget = 0;
  private last = 0;
  private doneTimes: number[] = [];
  results: Scored[] = [];
  total = 0;
  running = false;
  throttle = 4; // plans per second; Infinity = as fast as the workers go
  runs = 120;
  private base: Plan | null = null;
  private obs: Observations = {};
  private seed = 7;

  constructor(
    private l: Listener,
    size = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1)),
  ) {
    this.setWorkers(size);
  }

  setWorkers(n: number) {
    for (const p of this.pool) p.w?.terminate();
    this.pool = [];
    for (let i = 0; i < n; i++) {
      let w: Worker | null = null;
      try {
        w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      } catch {
        w = null; // no workers: fall back to the main thread
      }
      const slot: Slot = { w, pending: 0 };
      if (w) w.onmessage = (e: MessageEvent<JobOut>) => this.receive(slot, e.data);
      this.pool.push(slot);
    }
    this.emit();
  }

  get workers() {
    return this.pool.length;
  }

  /** Start (or restart) a search. Results that were scored on the same assumptions are kept. */
  start(base: Plan, obs: Observations, space: SearchSpace, seed: number, keep = false) {
    this.generation++;
    this.base = base;
    this.obs = obs;
    this.seed = seed;
    const all = candidates(space);
    if (!keep) this.results = [];
    const seen = new Set(this.results.map((s) => key(s.c)));
    this.results = this.results.filter((s) => space.weapons.includes(s.c.weapon) && space.hours.includes(s.c.hour));
    this.queue = all.filter((c) => !seen.has(key(c)));
    this.total = all.length;
    this.running = true;
    this.budget = 1;
    this.last = performance.now();
    if (this.timer == null) this.timer = window.setInterval(() => this.tick(), 40);
    this.l.onResults?.(this.results);
    this.emit();
  }

  pause() {
    this.running = false;
    this.emit();
  }
  resume() {
    if (!this.base) return;
    this.running = true;
    this.last = performance.now();
    this.emit();
  }
  /** One plan, now, even when paused. */
  step() {
    if (!this.queue.length) return;
    this.dispatch(1);
  }
  stop() {
    this.running = false;
    this.queue = [];
    this.generation++;
    this.emit();
  }
  dispose() {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
    for (const p of this.pool) p.w?.terminate();
  }

  private tick() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (!this.running || !this.base) return;
    if (!this.queue.length && this.pool.every((p) => !p.pending)) {
      this.running = false;
      this.emit();
      return;
    }
    if (this.throttle === Infinity) {
      this.dispatch(Infinity);
      return;
    }
    this.budget = Math.min(this.budget + dt * this.throttle, Math.max(1, this.throttle));
    const n = Math.floor(this.budget);
    if (n > 0) this.budget -= this.dispatch(n);
  }

  /** Hand up to n plans to free workers; returns how many went out. */
  private dispatch(n: number) {
    let sent = 0;
    for (const slot of this.pool) {
      if (sent >= n || !this.queue.length) break;
      if (slot.pending) continue;
      const size = n === Infinity ? 6 : Math.min(n - sent, Math.max(1, Math.ceil((n - sent) / this.pool.length)));
      const cands = this.queue.splice(0, size);
      const msg: JobIn = { job: ++this.job, seed: this.seed, base: this.base!, obs: this.obs, runs: this.runs, cands };
      slot.pending++;
      sent += cands.length;
      this.jobGen.set(msg.job, this.generation);
      this.l.onTesting?.(cands[cands.length - 1]);
      if (slot.w) slot.w.postMessage(msg);
      else setTimeout(() => this.receive(slot, { job: msg.job, out: score(msg) }), 0);
    }
    this.emit();
    return sent;
  }

  private receive(slot: Slot, out: JobOut) {
    slot.pending = Math.max(0, slot.pending - 1);
    const gen = this.jobGen.get(out.job);
    this.jobGen.delete(out.job);
    if (gen !== this.generation) return;
    const now = performance.now();
    for (let i = 0; i < out.out.length; i++) this.doneTimes.push(now);
    this.results = this.results.concat(out.out);
    this.l.onResults?.(this.results);
    this.emit();
  }

  status(): JevStatus {
    const now = performance.now();
    this.doneTimes = this.doneTimes.filter((t) => now - t < 2000);
    return {
      running: this.running,
      done: this.results.length,
      total: this.total,
      inflight: this.pool.filter((p) => p.pending).length,
      workers: this.pool.length,
      rate: this.doneTimes.length / 2,
    };
  }

  private emit() {
    this.l.onStatus?.(this.status());
  }
}

export const key = (c: Candidate) => `${c.weapon}|${c.fuze}|${c.heading}|${c.aim}|${c.hour}`;
