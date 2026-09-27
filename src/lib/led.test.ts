import { describe, expect, it } from 'vitest';
import { adalight, buildLayout, DEFAULT_LED, fastLedSketch, ledStats, sampleLeds, toLed } from './led';

describe('LED layout', () => {
  it('fills a 12 in square at 30 LEDs/m', () => {
    const l = buildLayout(DEFAULT_LED);
    expect(l.cols).toBe(l.rows);
    expect(l.leds.length).toBe(l.cols * l.rows);
    expect(l.leds.map((x) => x.i)).toEqual(l.leds.map((_, i) => i));
  });

  it('snakes serpentine rows', () => {
    const l = buildLayout({ ...DEFAULT_LED, frameW: 100, frameH: 60, pitch: 20, margin: 10 });
    const row0 = l.leds.filter((x) => x.row === 0).map((x) => x.col);
    const row1 = l.leds.filter((x) => x.row === 1).map((x) => x.col);
    expect(row0).toEqual([0, 1, 2, 3, 4]);
    expect(row1).toEqual([4, 3, 2, 1, 0]);
  });

  it('starts from the bottom when asked', () => {
    const l = buildLayout({ ...DEFAULT_LED, start: 'bottom' });
    expect(l.leds[0].row).toBe(l.rows - 1);
  });

  it('circles and ovals use fewer LEDs, about pi/4 of the grid', () => {
    const rect = buildLayout(DEFAULT_LED).leds.length;
    const circle = buildLayout({ ...DEFAULT_LED, shape: 'circle' }).leds.length;
    expect(circle / rect).toBeGreaterThan(0.55);
    expect(circle / rect).toBeLessThan(0.85);
    const oval = buildLayout({ ...DEFAULT_LED, frameH: 500, shape: 'oval' }).leds.length;
    expect(oval).toBeGreaterThan(circle);
  });

  it('estimates power', () => {
    const l = buildLayout(DEFAULT_LED);
    const s = ledStats(l, DEFAULT_LED);
    expect(s.maxAmps).toBeCloseTo(l.leds.length * 0.06);
    expect(s.psu).toMatch(/^5 V \d+ A/);
  });
});

describe('LED output', () => {
  it('gamma keeps black and full white, dims the middle', () => {
    expect(toLed(0, 1, 2.2)).toBe(0);
    expect(toLed(255, 1, 2.2)).toBe(255);
    expect(toLed(128, 1, 2.2)).toBeLessThan(64);
  });

  it('samples in data-line order', () => {
    const l = buildLayout({ ...DEFAULT_LED, frameW: 40, frameH: 40, pitch: 20, margin: 10 }); // 2 cols x 2 rows
    const rgba = new Uint8ClampedArray([10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255]);
    const { screen } = sampleLeds(l, rgba, 1, 1);
    expect(Array.from(screen).filter((_, i) => i % 3 === 0)).toEqual([10, 20, 40, 30]);
  });

  it('frames Adalight packets', () => {
    const p = adalight(new Uint8Array(300 * 3));
    expect(Array.from(p.slice(0, 6))).toEqual([0x41, 0x64, 0x61, 0x01, 0x2b, 0x01 ^ 0x2b ^ 0x55]);
    expect(p.length).toBe(906);
  });

  it('writes a FastLED sketch', () => {
    const src = fastLedSketch([new Uint8Array([1, 2, 3])], 1, 30, 'Test');
    expect(src).toContain('#define NUM_LEDS 1');
    expect(src).toContain('{1,2,3}');
  });
});

describe('LED direction', () => {
  it('bounce uses the same grid as forward', () => {
    expect(buildLayout({ ...DEFAULT_LED, mount: 'bounce' }).leds.length).toBe(buildLayout(DEFAULT_LED).leds.length);
  });

  it('edge lighting runs one strip around the inside edge', () => {
    const s = { ...DEFAULT_LED, mount: 'edge' as const };
    const l = buildLayout(s);
    const perimeter = 4 * (s.frameW - 2 * s.margin);
    expect(l.leds.length).toBe(Math.floor(perimeter / s.pitch - 0.5) + 1); // first LED half a step in
    expect(l.runs).toBe(1);
    expect(l.leds[0].x).toBeCloseTo(s.margin + s.pitch / 2);
    expect(l.leds[0].y).toBeCloseTo(s.margin);
    // steps between neighbours are one LED spacing (corners cut a little shorter)
    for (let i = 1; i < l.leds.length; i++) expect(Math.hypot(l.leds[i].x - l.leds[i - 1].x, l.leds[i].y - l.leds[i - 1].y)).toBeLessThanOrEqual(s.pitch + 0.01);
  });

  it('edge lighting follows a circle', () => {
    const s = { ...DEFAULT_LED, mount: 'edge' as const, shape: 'circle' as const };
    const l = buildLayout(s);
    const r = s.frameW / 2 - s.margin;
    expect(Math.abs(l.leds.length - (2 * Math.PI * r) / s.pitch)).toBeLessThan(2);
    for (const p of l.leds) expect(Math.hypot(p.x - s.frameW / 2, p.y - s.frameH / 2)).toBeCloseTo(r, 0);
  });
});
