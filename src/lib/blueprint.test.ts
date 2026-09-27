import { describe, expect, it } from 'vitest';
import { blueprintSvg, templateHtml, templatePages, type BuildInfo } from './blueprint';
import { buildLayout, DEFAULT_LED, ledStats } from './led';

const info = (over: Partial<BuildInfo['s']> = {}): BuildInfo => {
  const s = { ...DEFAULT_LED, ...over };
  const layout = buildLayout(s);
  return { name: 'SKYSPACE', place: 'RODEN CRATER', s, layout, stats: ledStats(layout, s), diffuserMm: 40, boxDepth: 50, ledLabel: 'Strip · 30 LEDs/m', date: '2026-09-27' };
};

describe('blueprint', () => {
  it('draws every LED, both dimensions, the section, wiring, parts and title block', () => {
    const b = info();
    const svg = blueprintSvg(b);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.match(/<circle cx=/g)!.length).toBeGreaterThanOrEqual(b.layout.leds.length);
    expect(svg).toContain(`${Math.round(b.s.frameW)} mm`);
    for (const t of ['SECTION A–A', 'WIRING', 'PARTS &amp; SPECS', 'DATA IN', 'INSIDE DEPTH 50 mm', 'LED → DIFFUSER 40 mm', '330 Ω', 'Atmos', '[ lab ]', '2026-09-27']) expect(svg).toContain(t);
  });

  it('describes edge-lit and bounce builds', () => {
    expect(blueprintSvg(info({ mount: 'edge' }))).toContain('LED STRIP ON SIDE WALLS');
    expect(blueprintSvg(info({ mount: 'bounce' }))).toContain('LEDs ON RAIL, FACING BACK');
  });
});

describe('placement template', () => {
  it('tiles a 12 in frame onto 4 letter pages with a cover, at real size', () => {
    const b = info();
    const t = templatePages(b, 'letter');
    expect(t.cols * t.rows).toBe(4);
    const html = templateHtml(b, 'letter');
    expect(html.match(/class="page"/g)!.length).toBe(4);
    expect(html).toContain('50 mm');
    expect(html).toContain('size: letter portrait');
    expect(html).toMatch(/<svg width="[\d.]+mm" height="[\d.]+mm"/);
    expect(html).toContain('Page B2 of 4');
  });

  it('a small frame fits on one A4 page', () => {
    const t = templatePages(info({ frameW: 150, frameH: 150 }), 'a4');
    expect(t.cols * t.rows).toBe(1);
  });
});
