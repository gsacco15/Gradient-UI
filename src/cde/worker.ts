// Jev's worker: scores candidate plans off the main thread. Same seed for every candidate, so they're compared on the same dice.
import { buildWorld, candidatePlan, estimate, population, type Candidate, type Observations, type Plan, type Population, type Scored } from './model';

export interface JobIn {
  job: number;
  seed: number;
  base: Plan;
  obs: Observations;
  runs: number;
  cands: Candidate[];
}
export interface JobOut {
  job: number;
  out: Scored[];
}

export function score(msg: JobIn): Scored[] {
  const world = buildWorld(msg.seed);
  const pops = new Map<number, Population>();
  return msg.cands.map((c) => {
    let pop = pops.get(c.hour);
    if (!pop) pops.set(c.hour, (pop = population(world, c.hour, msg.base.watched, msg.obs)));
    const e = estimate(world, candidatePlan(world, msg.base, c), pop, msg.runs, 17);
    return { c, pk: e.pk, mean: e.mean, p90: e.p90 };
  });
}

// Only wire up messaging when running as a worker.
const WGS = (globalThis as { WorkerGlobalScope?: abstract new () => unknown }).WorkerGlobalScope;
if (WGS && self instanceof WGS) {
  self.onmessage = (e: MessageEvent<JobIn>) => {
    const out: JobOut = { job: e.data.job, out: score(e.data) };
    (self as unknown as Worker).postMessage(out);
  };
}
