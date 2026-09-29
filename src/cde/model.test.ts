import { describe, expect, it } from 'vitest';
import { approver, best, buildWorld, candidates, estimate, harm, effect, HARDNESS, inCircle, lobe, population, RULES, type Plan, type Scored } from './model';
import { score } from './worker';

const world = buildWorld(7);
const t = world.buildings[world.targetId];
const plan = (p: Partial<Plan> = {}): Plan => ({ weapon: 'large', fuze: 'instant', heading: 180, aimX: t.cx, aimY: t.cy, hour: 10, watched: 6, hardness: HARDNESS.standard, stored: false, ...p });
const run = (p: Partial<Plan>, runs = 300) => estimate(world, plan(p), population(world, plan(p).hour, plan(p).watched), runs, 3);

describe('cde world', () => {
  it('is deterministic and has the story buildings', () => {
    expect(buildWorld(7)).toBe(world);
    expect(world.buildings[world.targetId].label).toBe('Warehouse');
    expect(world.buildings[world.schoolId].label).toBe('School');
    const again = buildWorld(8);
    expect(again.buildings.length).toBeGreaterThan(40);
  });
  it('fills the school by day and empties it at night', () => {
    const s = world.buildings[world.schoolId];
    expect(population(world, 10, 0).expected[s.id]).toBeGreaterThan(50);
    expect(population(world, 2, 0).expected[s.id]).toBe(0);
  });
  it('narrows uncertainty with hours watched', () => {
    expect(population(world, 10, 48).cv).toBeLessThan(population(world, 10, 0).cv);
  });
});

describe('cde estimate', () => {
  it('is reproducible for a seed', () => {
    expect(run({}).counts).toEqual(run({}).counts);
  });
  it('orders percentiles', () => {
    const e = run({});
    expect(e.p50).toBeLessThanOrEqual(e.p90);
    expect(e.p90).toBeLessThanOrEqual(e.max);
  });
  it('drops with a smaller warhead, a delay fuze and a night-time strike', () => {
    const big = run({ weapon: 'large', fuze: 'instant', hour: 10 });
    const small = run({ weapon: 'small', fuze: 'instant', hour: 10 });
    const delay = run({ weapon: 'small', fuze: 'delay', hour: 10 });
    const night = run({ weapon: 'small', fuze: 'delay', hour: 2 });
    expect(small.mean).toBeLessThan(big.mean);
    expect(night.mean).toBeLessThan(delay.mean);
    expect(night.p90).toBeLessThanOrEqual(2);
  });
  it('is lower by day when fragments are thrown away from the school', () => {
    const toward = run({ heading: 180 });
    const away = run({ heading: 0 });
    expect(away.mean).toBeLessThan(toward.mean * 0.7);
  });
  it('small warheads with impact fuzes rarely destroy the target; delay fuzes help', () => {
    expect(run({ weapon: 'small', fuze: 'instant' }).pk).toBeLessThan(0.3);
    expect(run({ weapon: 'small', fuze: 'delay' }).pk).toBeGreaterThan(0.8);
    expect(run({ weapon: 'small', fuze: 'delay', hardness: HARDNESS.reinforced }).pk).toBeLessThan(0.3);
  });
  it('counts stored munitions going off', () => {
    const e = run({ weapon: 'small', fuze: 'delay', hour: 10, stored: true });
    expect(e.secondary).toBeGreaterThan(0);
    expect(e.mean).toBeGreaterThan(run({ weapon: 'small', fuze: 'delay', hour: 10 }).mean);
  });
  it('treats logged sightings as known', () => {
    const house = world.buildings.find((b) => b.kind === 'home' && Math.hypot(b.cx - t.cx, b.cy - t.cy) < 45)!;
    const p = plan({ weapon: 'medium', hour: 2 });
    const none = estimate(world, p, population(world, 2, 6, { [house.id]: 0 }), 300, 3);
    const many = estimate(world, p, population(world, 2, 6, { [house.id]: 20 }), 300, 3);
    expect(many.byBuilding[house.id]).toBeGreaterThan(none.byBuilding[house.id]);
    // Seeing nobody cuts the estimate sharply, but leaves a little for people who weren't seen.
    const guess = estimate(world, p, population(world, 2, 6), 300, 3);
    expect(none.byBuilding[house.id]).toBeLessThan(guess.byBuilding[house.id] * 0.25);
  });
});

describe('cde effects', () => {
  it('leans fragments the way the bomb travels', () => {
    expect(lobe(0, 0, -1)).toBeCloseTo(1);
    expect(lobe(0, 0, 1)).toBeCloseTo(0);
    const p = plan({ heading: 0 });
    const e = effect(p, false);
    expect(harm(p, e, 0, 0, 0, -30, 1, false)).toBeGreaterThan(harm(p, e, 0, 0, 0, 30, 1, false));
  });
  it('walls shield and distance helps', () => {
    const p = plan();
    const e = effect(p, false);
    expect(harm(p, e, 0, 0, 40, 0, 0.5, false)).toBeLessThan(harm(p, e, 0, 0, 40, 0, 1, false));
    expect(harm(p, e, 0, 0, 90, 0, 1, false)).toBeLessThan(harm(p, e, 0, 0, 30, 0, 1, false));
    expect(harm(p, e, 0, 0, 500, 0, 1, false)).toBe(0);
  });
  it("finds the school inside the big weapon's circle", () => {
    const c = inCircle(world, plan(), population(world, 10, 6));
    expect(c.sensitive).toContain('School');
    expect(c.radius).toBeGreaterThan(100);
  });
});

describe('cde sign-off and Jev', () => {
  it('escalates approval with the figure', () => {
    const r = RULES.find((x) => x.id === 'iraq2003')!;
    expect(approver(0, r).level).toBe(0);
    expect(approver(1, r).level).toBe(1);
    expect(approver(15, r).level).toBe(2);
    expect(approver(30, r).level).toBe(3);
    expect(approver(1, RULES[0]).level).toBe(3);
  });
  it('enumerates the whole space, coarse plans first', () => {
    const c = candidates({ weapons: ['large', 'small'], hours: [2, 10] });
    expect(c.length).toBe(2 * 3 * 8 * 5 * 2);
    expect(c[0].aim).toBe('centre');
    expect(new Set(c.map((x) => JSON.stringify(x))).size).toBe(c.length);
  });
  it('picks the least harmful plan that meets the requirement', () => {
    const mk = (p90: number, pk: number, mean = p90): Scored => ({ c: { weapon: 'small', fuze: 'delay', heading: 0, aim: 'centre', hour: p90 }, p90, pk, mean });
    const list = [mk(0, 0.2), mk(3, 0.9), mk(1, 0.86), mk(1, 0.95, 0.5)];
    expect(best(list, 0.85)!.pk).toBe(0.95);
    expect(best(list, 0.99)).toBeUndefined();
  });
  it('scores candidates the same way as the page', () => {
    const base = plan();
    const [s] = score({ job: 1, seed: 7, base, obs: {}, runs: 200, cands: [{ weapon: 'medium', fuze: 'delay', heading: 0, aim: 'custom', hour: 2 }] });
    const e = estimate(world, { ...base, weapon: 'medium', fuze: 'delay', heading: 0, hour: 2 }, population(world, 2, base.watched), 200, 17);
    expect(s.p90).toBe(e.p90);
    expect(s.pk).toBe(e.pk);
  });
});
