import { describe, expect, it } from 'vitest';
import { ALL_PRESETS, COLLECTIONS } from '../data/collections';
import { nameForColor } from '../data/names';
import { contrastRatio, hexToOklab, hexToRgb, mixHex, normalizeHex, oklabToHex } from './color';
import { cssBackground, cssCaveats, expandStops, toCSS, toSVG, toTailwind } from './exportCode';
import { forecastShuffle, moodPalette, randomGradient, remix } from './generate';
import { hydrateGradient, makeGradient } from './gradient';
import { extractPalette } from './palette';
import { decodeGradient, encodeGradient } from './share';
import { skyColors, solarElevation } from './sky';

const seeded = (s = 42) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

describe('color', () => {
  it('round-trips hex through Oklab', () => {
    for (const hex of ['#000000', '#FFFFFF', '#3F5A8C', '#F6B47A', '#1FD1A0']) expect(oklabToHex(hexToOklab(hex))).toBe(hex);
  });
  it('normalizes hex input', () => {
    expect(normalizeHex('abc')).toBe('#AABBCC');
    expect(normalizeHex('#12ab9f')).toBe('#12AB9F');
    expect(normalizeHex('nope')).toBeNull();
  });
  it('computes WCAG contrast', () => {
    expect(contrastRatio(hexToRgb('#000000'), hexToRgb('#FFFFFF'))).toBeCloseTo(21, 0);
  });
  it('mixes in Oklab', () => {
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
  });
});

describe('presets + names', () => {
  it('has ten collections of curated gradients with unique ids', () => {
    expect(COLLECTIONS).toHaveLength(10);
    expect(ALL_PRESETS.length).toBeGreaterThanOrEqual(85);
    expect(new Set(ALL_PRESETS.map((g) => g.id)).size).toBe(ALL_PRESETS.length);
  });
  it('names colours by nearest field note', () => {
    expect(nameForColor('#F6B47A')).toBe('GOLDEN HOUR');
    expect(nameForColor('#F6B47B')).toBe('GOLDEN HOUR');
  });
});

describe('generate', () => {
  const base = makeGradient({ name: 'X', place: 'Y', time: '00:00', type: 'mesh', colors: ['#111111', '#222222', '#333333'] });
  it('keeps locked colours on shuffle', () => {
    base.points[1].locked = true;
    const next = forecastShuffle(base, seeded());
    expect(next.points[1].color).toBe('#222222');
    expect(next.points[0].color).not.toBe('#111111');
    expect(next.place).not.toBe('Y');
  });
  it('produces valid palettes for every mood', () => {
    for (const mood of ['cold', 'warm', 'lush', 'neon', 'dark', 'soft'] as const) {
      const p = moodPalette(mood, 4, seeded(7));
      expect(p).toHaveLength(4);
      p.forEach((c) => expect(c).toMatch(/^#[0-9A-F]{6}$/));
    }
  });
  it('random gradients and remixes are well formed', () => {
    const g = randomGradient(base, seeded(3));
    expect(g.points.length).toBeGreaterThanOrEqual(3);
    expect(remix(g, 6, seeded(9))).toHaveLength(6);
  });
});

describe('exports', () => {
  const g = makeGradient({ name: 'GLACIER HOUR', place: 'ICELAND', time: '03:12', colors: ['#DCEEFA', '#6FA3B8', '#2D5F8A'], weather: { haze: 0.3 } });
  it('writes CSS with Oklab-matched stops and tokens', () => {
    const css = toCSS(g);
    expect(css).toContain('.atmos-glacier-hour');
    expect(css).toContain('linear-gradient(180deg');
    expect(css).toContain('::after');
    expect(expandStops(g, 3)).toHaveLength(7);
  });
  it('flags effects CSS cannot reproduce', () => {
    expect(cssCaveats(g)).toEqual([]);
    expect(cssCaveats({ ...g, type: 'frame', weather: { ...g.weather, fog: 0.5 } }).length).toBe(2);
  });
  it('writes Tailwind and SVG', () => {
    expect(toTailwind(g)).toContain('@theme');
    expect(toSVG(g, 100, 100)).toContain('<linearGradient');
    expect(toSVG({ ...g, type: 'mesh' }, 100, 100)).toContain('<ellipse');
    expect(toSVG({ ...g, type: 'conic' }, 100, 100)).toBe('');
    expect(cssBackground({ ...g, type: 'conic' })).toMatch(/^conic-gradient/);
  });
});

describe('share links', () => {
  it('round-trips a gradient through the URL', () => {
    const g = ALL_PRESETS[10];
    const back = decodeGradient(encodeGradient(g))!;
    expect(back.name).toBe(g.name);
    expect(back.points.map((p) => p.color)).toEqual(g.points.map((p) => p.color));
  });
  it('rejects garbage', () => expect(decodeGradient('%%%')).toBeNull());
  it('hydrates partial project JSON', () => {
    const g = hydrateGradient({ name: 'OLD', points: [{ color: '#FF0000' } as never] });
    expect(g.weather.fog).toBe(0);
    expect(g.points[0].size).toBeGreaterThan(0);
  });
});

describe('live sky', () => {
  it('finds the sun high at noon and below the horizon at midnight (equator, equinox)', () => {
    expect(solarElevation(new Date(Date.UTC(2026, 2, 20, 12, 0)), 0, 0)).toBeGreaterThan(80);
    expect(solarElevation(new Date(Date.UTC(2026, 2, 20, 0, 0)), 0, 0)).toBeLessThan(-80);
  });
  it('maps elevation to sky phases', () => {
    expect(skyColors(-30).phase).toBe('NIGHT');
    expect(skyColors(60).phase).toBe('HIGH SUN');
    expect(skyColors(0).colors).toHaveLength(4);
  });
});

describe('palette extraction', () => {
  it('finds the dominant colours of an image', () => {
    const px = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 100; i++) {
      const red = i < 70;
      px.set(red ? [220, 40, 40, 255] : [30, 60, 200, 255], i * 4);
    }
    const pal = extractPalette(px, 4);
    expect(pal[0]).toBe('#DC2828');
    expect(pal).toContain('#1E3CC8');
  });
});

describe('v0.2 features', () => {
  it('builds a self-contained embed with the shader and uniforms', async () => {
    const { toEmbed } = await import('./embed');
    const g = makeGradient({ name: 'SOLAR WIND', place: 'TROMSØ', time: '23:14', type: 'mesh', colors: ['#3DF5A7', '#0B1026'], interact: { mode: 'repel', strength: 0.5 } });
    const html = toEmbed(g);
    expect(html).toContain('<canvas');
    expect(html).toContain('u_react');
    expect(html).toContain('"react":true');
    expect(html).toContain('#version 300 es');
  });
  it('writes copyable component code for each target', async () => {
    const { componentCode } = await import('../components/InterfaceView');
    const g = makeGradient({ name: 'X', place: 'Y', time: '0', colors: ['#000000', '#FFFFFF'] });
    const style = { radius: 12, shadow: 0, glass: 0, spacing: 1, borderWidth: 2, font: 'sans', textTone: 'auto', surface: 'light' } as const;
    const def = { id: 'b', label: 'BUTTON', kind: 'button' as const, sample: 'Go' };
    expect(componentCode(def, 'background', g, style)).toContain('linear-gradient(180deg');
    expect(componentCode(def, 'border', g, style)).toContain('padding-box');
    expect(componentCode({ ...def, kind: 'text' }, 'text', g, style)).toContain('background-clip: text');
  });
  it('keeps the gradient inside the sheet for every poster layout', async () => {
    const { gradientRect, POSTER_SIZES } = await import('./poster');
    for (const { w, h } of Object.values(POSTER_SIZES)) {
      const r = gradientRect(w, h, { size: 'a3', paper: 'white', layout: 'framed', margin: 0.1, title: '', subtitle: '', notes: true, edition: '' });
      expect(r.x).toBeGreaterThan(0);
      expect(r.y + r.h).toBeLessThan(h);
      expect(r.w).toBeGreaterThan(w / 2);
    }
  });
});
