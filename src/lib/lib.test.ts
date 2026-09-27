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
  it('has eleven collections of curated gradients with unique ids', () => {
    expect(COLLECTIONS).toHaveLength(11);
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

describe('text → gradient', () => {
  it('sanitizes model output and rejects unusable colours', async () => {
    const { sanitizeAi } = await import('./aiSchema');
    const ok = sanitizeAi({ name: 'tokyo rain', place: 'shibuya', time: '2:07', type: 'nope', angle: -90, colors: ['#ff00aa', 'bad', '0a0a12'], fog: 9, haze: -1 });
    expect(ok?.name).toBe('TOKYO RAIN');
    expect(ok?.time).toBe('02:07');
    expect(ok?.type).toBe('mesh');
    expect(ok?.angle).toBe(270);
    expect(ok?.colors).toEqual(['#FF00AA', '#0A0A12']);
    expect(ok?.fog).toBe(0.8);
    expect(ok?.haze).toBe(0);
    expect(sanitizeAi({ colors: ['#fff'] })).toBeNull();
  });
  it('built-in generator is deterministic and reads colour and mood words', async () => {
    const { localTextGradient } = await import('./textGradient');
    const a = localTextGradient('Tokyo rain at 2am');
    const b = localTextGradient('Tokyo rain at 2am');
    expect(a.gradient.points.map((p) => p.color)).toEqual(b.gradient.points.map((p) => p.color));
    expect(a.gradient.time.startsWith('02:')).toBe(true);
    const blue = localTextGradient('deep navy and cobalt blue');
    const hues = blue.gradient.points.map((p) => hexToOklab(p.color)[2]);
    expect(hues.every((v) => v < 0)).toBe(true); // Oklab b < 0 = blue side
  });
  it('the API answers 503 when no key is configured', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const { POST } = await import('../../api/generate');
    const res = await POST(new Request('http://x/api/generate', { method: 'POST', body: JSON.stringify({ prompt: 'fog' }) }));
    expect(res.status).toBe(503);
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  });
});

describe('AI light-work types', () => {
  it('accepts aperture, bands and halo with their options, clamped', async () => {
    const { sanitizeAi } = await import('./aiSchema');
    const { fromAi } = await import('./textGradient');
    const base = { name: 'x', place: 'y', time: '19:40', coords: '', angle: 180, colors: ['#15131F', '#6B4FA0', '#F2C9A8'], symmetry: 'quadrant', motion: 'none', fog: 0, haze: 0, frost: 0, clouds: 0, heat: 0, dusk: 0, note: '' };
    const a = sanitizeAi({ ...base, type: 'aperture', size: 5, glow: -1, bands: 20 })!;
    expect(a.type).toBe('aperture');
    expect(a.size).toBe(1.2);
    expect(a.glow).toBe(0);
    expect(a.bands).toBe(8);
    const g = fromAi(a);
    expect(g.composition.symmetry).toBe('none'); // one aperture, never mirrored copies
    const b = sanitizeAi({ ...base, type: 'bands', bands: 4 })!;
    expect(fromAi(b).composition.count).toBe(4);
    expect(sanitizeAi({ ...base, type: 'halo' })!.size).toBe(0.62); // missing -> default
  });
});
