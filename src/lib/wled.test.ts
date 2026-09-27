import { describe, expect, it } from 'vitest';
import { ALL_PRESETS } from '../data/collections';
import { buildLayout, DEFAULT_LED } from './led';
import { palette256, paletteFromGradient, renderEffect, WLED_EFFECTS, wledPaletteJson } from './wled';

describe('WLED palette', () => {
  const g = ALL_PRESETS[0];
  it('keeps the exact colours, first at 0 and last at 255', () => {
    const stops = paletteFromGradient(g);
    expect(stops[0].pos).toBe(0);
    expect(stops[stops.length - 1].pos).toBe(255);
    const colours = [...g.points].sort((a, b) => a.pos - b.pos).map((p) => p.color.toLowerCase());
    expect(stops.map((s) => s.color)).toEqual(colours.slice(0, 16));
  });

  it('writes the WLED palette file', () => {
    const json = JSON.parse(wledPaletteJson([{ pos: 0, color: '#ff8800' }, { pos: 255, color: '#0000ff' }]));
    expect(json).toEqual({ palette: [0, 'FF8800', 255, '0000FF'] });
  });

  it('blends 256 entries between stops', () => {
    const p = palette256([{ pos: 0, color: '#000000' }, { pos: 255, color: '#ffffff' }]);
    expect(Array.from(p.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(p.slice(255 * 3))).toEqual([255, 255, 255]);
    expect(p[128 * 3]).toBeGreaterThan(120);
    expect(p[128 * 3]).toBeLessThan(135);
  });

  it('every effect lights every LED from the palette and moves over time', () => {
    const layout = buildLayout(DEFAULT_LED);
    const pal = palette256(paletteFromGradient(g));
    for (const fx of WLED_EFFECTS) {
      const a = renderEffect(fx.id, layout, pal, 0, 0.5, 0.5);
      const b = renderEffect(fx.id, layout, pal, 3, 0.5, 0.5);
      expect(a.length).toBe(layout.leds.length * 3);
      expect(a.some((v, i) => v !== b[i])).toBe(true);
    }
  });
});
