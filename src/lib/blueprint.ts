// Build documents for an LED light piece: a one-page blueprint (dimensions, section, wiring,
// parts) and a 1:1 placement template split across printable pages. Plain SVG + HTML strings.
import type { LedLayout, LedSettings, LedStats, Mount } from './led';

export interface BuildInfo {
  name: string; // sky name
  place: string;
  s: LedSettings;
  layout: LedLayout;
  stats: LedStats;
  diffuserMm: number; // LED to diffuser
  boxDepth: number; // inside depth of the box
  ledLabel: string; // e.g. "Strip · 60 LEDs/m"
  date?: string;
}

const IN = 25.4;
const mm = (v: number) => `${Math.round(v)} mm`;
const inch = (v: number) => `${(v / IN).toFixed(v / IN >= 10 ? 1 : 2)}″`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const f = (n: number) => +n.toFixed(2);
const shapeName = (s: LedSettings) => (s.shape === 'rect' ? (Math.abs(s.frameW - s.frameH) < 0.5 ? 'Square' : 'Rectangle') : s.shape === 'circle' ? 'Circle' : 'Oval');
const mountName: Record<Mount, string> = { forward: 'Face forward', bounce: 'Bounce off back', edge: 'Edge lit' };

/** Where the lit shape sits, for outlines. */
function litOutline(s: LedSettings, x: (v: number) => number, y: (v: number) => number, k: number, attrs: string) {
  const m = s.margin, W = s.frameW, H = s.frameH;
  if (s.shape === 'rect') return `<rect x="${f(x(m))}" y="${f(y(m))}" width="${f((W - 2 * m) * k)}" height="${f((H - 2 * m) * k)}" ${attrs}/>`;
  const rx = (s.shape === 'circle' ? Math.min(W, H) / 2 : W / 2) - m, ry = (s.shape === 'circle' ? Math.min(W, H) / 2 : H / 2) - m;
  return `<ellipse cx="${f(x(W / 2))}" cy="${f(y(H / 2))}" rx="${f(Math.max(0, rx) * k)}" ry="${f(Math.max(0, ry) * k)}" ${attrs}/>`;
}

function frameOutline(s: LedSettings, x: (v: number) => number, y: (v: number) => number, k: number, attrs: string) {
  if (s.shape === 'rect') return `<rect x="${f(x(0))}" y="${f(y(0))}" width="${f(s.frameW * k)}" height="${f(s.frameH * k)}" ${attrs}/>`;
  const rx = s.shape === 'circle' ? Math.min(s.frameW, s.frameH) / 2 : s.frameW / 2, ry = s.shape === 'circle' ? Math.min(s.frameW, s.frameH) / 2 : s.frameH / 2;
  return `<ellipse cx="${f(x(s.frameW / 2))}" cy="${f(y(s.frameH / 2))}" rx="${f(rx * k)}" ry="${f(ry * k)}" ${attrs}/>`;
}

/** A dimension line with end ticks and a centred label. */
function dim(x1: number, y1: number, x2: number, y2: number, label: string, vertical = false) {
  const t = 6;
  const ticks = vertical
    ? `<line x1="${x1 - t}" y1="${y1}" x2="${x1 + t}" y2="${y1}"/><line x1="${x2 - t}" y1="${y2}" x2="${x2 + t}" y2="${y2}"/>`
    : `<line x1="${x1}" y1="${y1 - t}" x2="${x1}" y2="${y1 + t}"/><line x1="${x2}" y1="${y2 - t}" x2="${x2}" y2="${y2 + t}"/>`;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const text = vertical
    ? `<text x="${cx - 10}" y="${cy}" transform="rotate(-90 ${cx - 10} ${cy})" text-anchor="middle" class="d">${esc(label)}</text>`
    : `<text x="${cx}" y="${cy - 10}" text-anchor="middle" class="d">${esc(label)}</text>`;
  return `<g class="dim"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${ticks}</g>${text}`;
}

/** One landscape sheet: front view, side section, wiring, parts and title block. */
export function blueprintSvg(b: BuildInfo): string {
  const { s, layout, stats } = b;
  const mount = s.mount ?? 'forward';
  const Wv = 1600, Hv = 1100;
  const out: string[] = [];

  // ---- front view, to scale inside its box
  const box = { x: 70, y: 150, w: 860, h: 760 };
  const k = Math.min((box.w - 120) / s.frameW, (box.h - 110) / s.frameH);
  const ox = box.x + 80 + (box.w - 120 - s.frameW * k) / 2, oy = box.y + 20 + (box.h - 110 - s.frameH * k) / 2;
  const X = (v: number) => ox + v * k, Y = (v: number) => oy + v * k;
  out.push(`<text x="${box.x}" y="${box.y - 22}" class="h">FRONT VIEW</text><text x="${box.x + 150}" y="${box.y - 22}" class="s">LEDs as seen through the diffuser · data path in order</text>`);
  out.push(frameOutline(s, X, Y, k, 'class="thick"'));
  out.push(litOutline(s, X, Y, k, 'class="dash"'));
  // centre lines
  out.push(`<g class="thin"><line x1="${f(X(s.frameW / 2))}" y1="${f(Y(0) - 14)}" x2="${f(X(s.frameW / 2))}" y2="${f(Y(s.frameH) + 14)}" stroke-dasharray="14 4 2 4"/><line x1="${f(X(0) - 14)}" y1="${f(Y(s.frameH / 2))}" x2="${f(X(s.frameW) + 14)}" y2="${f(Y(s.frameH / 2))}" stroke-dasharray="14 4 2 4"/></g>`);
  // wiring path, then LEDs
  if (layout.leds.length) {
    out.push(`<polyline class="wire" points="${layout.leds.map((l) => `${f(X(l.x))},${f(Y(l.y))}`).join(' ')}"/>`);
    const r = Math.max(1.1, Math.min(4, s.pitch * k * 0.26));
    out.push(`<g class="led">${layout.leds.map((l) => `<circle cx="${f(X(l.x))}" cy="${f(Y(l.y))}" r="${f(r)}"/>`).join('')}</g>`);
    const a = layout.leds[0], z = layout.leds[layout.leds.length - 1];
    out.push(`<circle cx="${f(X(a.x))}" cy="${f(Y(a.y))}" r="${f(r + 5)}" class="mark"/><text x="${f(X(a.x) - 12)}" y="${f(Y(a.y) - 12)}" text-anchor="end" class="d">DATA IN · LED 1</text>`);
    out.push(`<circle cx="${f(X(z.x))}" cy="${f(Y(z.y))}" r="${f(r + 5)}" class="mark"/><text x="${f(X(z.x) + 12)}" y="${f(Y(z.y) + 22)}" class="d">END · LED ${layout.leds.length}</text>`);
  }
  // dimensions
  out.push(dim(X(0), Y(s.frameH) + 44, X(s.frameW), Y(s.frameH) + 44, `${mm(s.frameW)} · ${inch(s.frameW)}`));
  out.push(`<g class="thin"><line x1="${f(X(0))}" y1="${f(Y(s.frameH) + 8)}" x2="${f(X(0))}" y2="${f(Y(s.frameH) + 52)}"/><line x1="${f(X(s.frameW))}" y1="${f(Y(s.frameH) + 8)}" x2="${f(X(s.frameW))}" y2="${f(Y(s.frameH) + 52)}"/></g>`);
  out.push(dim(X(0) - 44, Y(0), X(0) - 44, Y(s.frameH), `${mm(s.frameH)} · ${inch(s.frameH)}`, true));
  out.push(`<g class="thin"><line x1="${f(X(0) - 8)}" y1="${f(Y(0))}" x2="${f(X(0) - 52)}" y2="${f(Y(0))}"/><line x1="${f(X(0) - 8)}" y1="${f(Y(s.frameH))}" x2="${f(X(0) - 52)}" y2="${f(Y(s.frameH))}"/></g>`);
  out.push(`<text x="${box.x}" y="${box.y + box.h - 6}" class="s">LED PITCH ${s.pitch.toFixed(1)} mm · EDGE GAP ${mm(s.margin)} · ${layout.cols} × ${layout.rows} GRID · ${mountName[mount].toUpperCase()}</text>`);

  // ---- side section
  const sx = 1010, sy = 150, sw = 300, sh = 250;
  out.push(`<text x="${sx}" y="${sy - 22}" class="h">SECTION A–A</text><text x="${sx + 150}" y="${sy - 22}" class="s">Side view, wall on the left</text>`);
  const kd = (sw - 60) / Math.max(20, b.boxDepth), px0 = sx + 30, top = sy + 50, bot = sy + sh - 40;
  const back = 6, diffT = 3;
  const xBack = px0, xIn = xBack + back * kd;
  const ledX = mount === 'bounce' ? xIn + (b.boxDepth - b.diffuserMm) * kd * 0.5 : xIn;
  const xDiff = mount === 'bounce' ? xIn + b.boxDepth * kd - diffT * kd : Math.min(xIn + b.diffuserMm * kd, xIn + b.boxDepth * kd - diffT * kd);
  out.push(`<g class="thin"><line x1="${sx}" y1="${top - 20}" x2="${sx}" y2="${bot + 20}"/>${Array.from({ length: 8 }, (_, i) => `<line x1="${sx}" y1="${top - 20 + i * 30}" x2="${sx - 14}" y2="${top - 6 + i * 30}"/>`).join('')}</g>`);
  out.push(`<rect x="${f(xBack)}" y="${top}" width="${f(back * kd)}" height="${bot - top}" class="fill"/>`);
  out.push(`<line x1="${f(xBack)}" y1="${top}" x2="${f(xDiff + diffT * kd)}" y2="${top}" class="thick"/><line x1="${f(xBack)}" y1="${bot}" x2="${f(xDiff + diffT * kd)}" y2="${bot}" class="thick"/>`);
  out.push(`<rect x="${f(xDiff)}" y="${top}" width="${f(diffT * kd)}" height="${bot - top}" class="fill soft"/>`);
  if (mount === 'edge') {
    out.push(`<rect x="${f(xIn + 4)}" y="${top + 2}" width="10" height="6" class="fill"/><rect x="${f(xIn + 4)}" y="${bot - 8}" width="10" height="6" class="fill"/>`);
  } else {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const yy = top + ((i + 0.5) / n) * (bot - top);
      out.push(`<rect x="${f(ledX + (mount === 'bounce' ? -6 : 0))}" y="${f(yy - 4)}" width="6" height="8" class="fill"/>`);
      if (mount === 'bounce') out.push(`<line x1="${f(ledX - 6)}" y1="${f(yy)}" x2="${f(xIn + 2)}" y2="${f(yy)}" class="ray"/>`);
      else out.push(`<line x1="${f(ledX + 6)}" y1="${f(yy)}" x2="${f(xDiff - 2)}" y2="${f(yy)}" class="ray"/>`);
    }
    if (mount === 'bounce') out.push(`<line x1="${f(ledX)}" y1="${top}" x2="${f(ledX)}" y2="${bot}" class="thin"/>`);
  }
  // numbered callouts, with a key to the right
  const callout = (x: number, y: number, n: number) => `<circle cx="${f(x)}" cy="${f(y)}" r="9" class="tag"/><text x="${f(x)}" y="${f(y + 4)}" text-anchor="middle" class="n">${n}</text>`;
  out.push(callout(xBack + (back * kd) / 2, bot + 22, 1));
  out.push(callout(ledX + 3, top - 16, 2));
  out.push(callout(xDiff + (diffT * kd) / 2, bot + 22, 3));
  const keyX = sx + sw + 20;
  [
    'BACK PANEL · MATTE WHITE',
    mount === 'bounce' ? 'LEDs ON RAIL, FACING BACK' : mount === 'edge' ? 'LED STRIP ON SIDE WALLS' : 'LED STRIP ON BACK PANEL',
    'OPAL DIFFUSER · 3 mm',
  ].forEach((t, i) => out.push(callout(keyX + 9, top + 14 + i * 34, i + 1) + `<text x="${keyX + 26}" y="${top + 18 + i * 34}" class="d">${esc(t)}</text>`));
  out.push(dim(xIn, bot + 52, xIn + b.boxDepth * kd, bot + 52, `DEPTH ${mm(b.boxDepth)}`));
  if (mount === 'forward') out.push(`<text x="${keyX}" y="${top + 124}" class="d">LED → DIFFUSER ${mm(b.diffuserMm)}</text>`);
  out.push(`<text x="${keyX}" y="${top + 146}" class="d dim-t">INSIDE DEPTH ${mm(b.boxDepth)} · ${inch(b.boxDepth)}</text>`);

  // ---- wiring schematic
  const wx = 1010, wy = 470;
  out.push(`<text x="${wx}" y="${wy - 22}" class="h">WIRING</text><text x="${wx + 110}" y="${wy - 22}" class="s">5 V · common ground · data on one pin</text>`);
  const node = (x: number, y: number, w: number, h: number, a: string, c: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" class="thick"/><text x="${x + w / 2}" y="${y + h / 2 - 3}" text-anchor="middle" class="b">${esc(a)}</text><text x="${x + w / 2}" y="${y + h / 2 + 15}" text-anchor="middle" class="d">${esc(c)}</text>`;
  out.push(node(wx, wy, 130, 64, 'POWER SUPPLY', stats.psu.replace(/ \(.+\)/, '')));
  out.push(node(wx + 180, wy, 170, 64, 'CONTROLLER', 'WLED · DATA GPIO21'));
  out.push(node(wx + 400, wy, 130, 64, 'LED STRIP', `${stats.count} × WS2812B`));
  out.push(`<g class="thin"><line x1="${wx + 130}" y1="${wy + 32}" x2="${wx + 180}" y2="${wy + 32}"/><line x1="${wx + 350}" y1="${wy + 32}" x2="${wx + 400}" y2="${wy + 32}"/></g>`);
  out.push(`<text x="${wx + 155}" y="${wy + 24}" text-anchor="middle" class="d">5V</text>`);
  out.push(`<rect x="${wx + 365}" y="${wy + 26}" width="20" height="12" class="thick"/><text x="${wx + 375}" y="${wy + 60}" text-anchor="middle" class="d">330 Ω</text>`);
  const inject = Math.max(1, Math.ceil(stats.count / 150));
  out.push(`<path d="M${wx + 65} ${wy + 64} V${wy + 110} H${wx + 465} V${wy + 64}" class="wire strong"/>`);
  out.push(`<text x="${wx + 265}" y="${wy + 130}" text-anchor="middle" class="d">+5V/GND DIRECT TO STRIP · ${inject} INJECTION POINT${inject > 1 ? 'S' : ''} (EVERY ~150 LEDs)</text>`);
  out.push(`<text x="${wx}" y="${wy + 160}" class="d">1000 µF CAP ACROSS PSU · 18 AWG POWER · 22 AWG DATA</text>`);

  // ---- parts & specs
  const tx = 1010, ty = 700;
  out.push(`<text x="${tx}" y="${ty - 22}" class="h">PARTS &amp; SPECS</text>`);
  const rows: [string, string][] = [
    ['LEDs', `${stats.count.toLocaleString()} × WS2812B, 5 V`],
    ['Strip', `${b.ledLabel} · ${stats.stripMeters} m`],
    ['Pieces', mount === 'edge' ? '1 continuous loop' : `${layout.runs} rows, zigzag`],
    ['Frame', `${mm(s.frameW)} × ${mm(s.frameH)} · ${shapeName(s)}`],
    ['Box depth', `${mm(b.boxDepth)} inside`],
    ['Diffuser', `Opal acrylic 3 mm, ${mm(b.diffuserMm)} from LEDs`],
    ['Back', 'Matte white panel'],
    ['Power', `${stats.psu} · ~${Math.round(stats.typicalAmps * 5)} W typical`],
    ['Controller', 'ESP32 WLED (e.g. Athom) · 1 output'],
    ['Refresh', `up to ${stats.maxFps} fps`],
  ];
  rows.forEach(([a, v], i) => {
    const yy = ty + i * 24;
    out.push(`<text x="${tx}" y="${yy}" class="d dim-t">${esc(a.toUpperCase())}</text><text x="${tx + 130}" y="${yy}" class="v">${esc(v)}</text>`);
    out.push(`<line x1="${tx}" y1="${yy + 8}" x2="${tx + 520}" y2="${yy + 8}" class="hair"/>`);
  });

  // ---- title block
  const by = 960, bh = 100;
  out.push(`<rect x="30" y="${by}" width="${Wv - 60}" height="${bh}" class="thick"/>`);
  const cells = [30, 430, 870, 1130, 1350, Wv - 30];
  cells.slice(1, -1).forEach((cx) => out.push(`<line x1="${cx}" y1="${by}" x2="${cx}" y2="${by + bh}" class="thick"/>`));
  out.push(`<text x="54" y="${by + 58}" class="logo">Atmos</text><text x="186" y="${by + 58}" class="logo-s">[ lab ]</text>`);
  const cell = (x: number, a: string, v: string) => `<text x="${x + 20}" y="${by + 36}" class="d dim-t">${esc(a)}</text><text x="${x + 20}" y="${by + 66}" class="v big">${esc(v)}</text>`;
  out.push(cell(430, 'LIGHT PIECE', `${b.name}${b.place ? ` · ${b.place}` : ''}`.slice(0, 34)));
  out.push(cell(870, 'FRAME', `${inch(s.frameW)} × ${inch(s.frameH)}`));
  out.push(cell(1130, 'DATE', b.date ?? new Date().toISOString().slice(0, 10)));
  out.push(cell(1350, 'UNITS', 'mm · to scale'));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wv} ${Hv}" width="${Wv}" height="${Hv}">
<defs>
  <pattern id="g1" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#fff" stroke-opacity=".06"/></pattern>
  <pattern id="g2" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#g1)"/><path d="M100 0H0V100" fill="none" stroke="#fff" stroke-opacity=".12"/></pattern>
  <style>
    text { font-family: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace; fill: #fff; }
    .h { font-size: 15px; letter-spacing: .14em; font-weight: 700; }
    .s { font-size: 12px; fill-opacity: .6; letter-spacing: .04em; }
    .d { font-size: 12px; fill-opacity: .82; letter-spacing: .05em; }
    .dim-t { fill-opacity: .55; }
    .b { font-size: 13px; font-weight: 700; letter-spacing: .08em; }
    .v { font-size: 13.5px; }
    .v.big { font-size: 17px; }
    .logo { font-family: 'Geist', 'Helvetica Neue', Arial, sans-serif; font-weight: 700; font-size: 40px; letter-spacing: -.03em; }
    .logo-s { font-size: 16px; fill-opacity: .7; letter-spacing: .08em; }
    .thick { fill: none; stroke: #fff; stroke-width: 2; }
    .thin, .thin line, .dim line { stroke: #fff; stroke-opacity: .7; stroke-width: 1; fill: none; }
    .dash { fill: none; stroke: #fff; stroke-opacity: .55; stroke-width: 1.2; stroke-dasharray: 6 5; }
    .hair { stroke: #fff; stroke-opacity: .18; }
    .wire { fill: none; stroke: #fff; stroke-opacity: .3; stroke-width: 1; }
    .wire.strong { stroke-opacity: .7; stroke-dasharray: 5 4; }
    .led circle { fill: #fff; fill-opacity: .9; }
    .mark { fill: none; stroke: #fff; stroke-width: 1.5; }
    .fill { fill: #fff; fill-opacity: .85; }
    .fill.soft { fill-opacity: .35; }
    .tag { fill: #163f8c; stroke: #fff; stroke-width: 1.2; }
    .n { font-size: 11px; font-weight: 700; }
    .ray { stroke: #fff; stroke-opacity: .35; stroke-dasharray: 3 3; }
  </style>
</defs>
<rect width="${Wv}" height="${Hv}" fill="#163f8c"/><rect width="${Wv}" height="${Hv}" fill="url(#g2)"/>
<rect x="30" y="30" width="${Wv - 60}" height="${Hv - 60}" class="thick"/>
<text x="70" y="86" class="h" style="font-size:22px">LIGHT PIECE BLUEPRINT</text>
<text x="${Wv - 70}" y="86" text-anchor="end" class="s">${esc(`${stats.count.toLocaleString()} LEDs · ${shapeName(s).toUpperCase()} · ${mountName[mount].toUpperCase()}`)}</text>
${out.join('\n')}
</svg>`;
}

// ---------------------------------------------------------------- 1:1 placement template

export type Paper = 'letter' | 'a4';
const PAPER: Record<Paper, { w: number; h: number; label: string }> = { letter: { w: 215.9, h: 279.4, label: 'US Letter' }, a4: { w: 210, h: 297, label: 'A4' } };
const MARGIN = 10, OVERLAP = 10, HEAD = 9;

/** Everything drawn on the template, in mm, origin at the frame's top-left. */
function templateContent(b: BuildInfo): string {
  const { s, layout } = b;
  const id = (v: number) => v;
  const o: string[] = [];
  o.push(frameOutline(s, id, id, 1, 'fill="none" stroke="#111" stroke-width="0.5"'));
  o.push(litOutline(s, id, id, 1, 'fill="none" stroke="#111" stroke-width="0.25" stroke-dasharray="2 1.5"'));
  o.push(`<g stroke="#999" stroke-width="0.2" stroke-dasharray="4 1 1 1"><line x1="${f(s.frameW / 2)}" y1="-6" x2="${f(s.frameW / 2)}" y2="${f(s.frameH + 6)}"/><line x1="-6" y1="${f(s.frameH / 2)}" x2="${f(s.frameW + 6)}" y2="${f(s.frameH / 2)}"/></g>`);
  if (layout.leds.length) {
    // strip runs: consecutive LEDs on the same row are one piece
    let run: typeof layout.leds = [];
    const flush = (n: number) => {
      if (run.length > 1) {
        const a = run[0], z = run[run.length - 1];
        o.push(`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(z.x)}" y2="${f(z.y)}" stroke="#2445e0" stroke-opacity="0.35" stroke-width="${f(Math.min(10, s.pitch * 0.6))}" stroke-linecap="round"/>`);
        const dir = Math.sign(z.x - a.x) || 1;
        o.push(`<text x="${f(a.x)}" y="${f(a.y - Math.min(5, s.pitch * 0.3) - 1.5)}" text-anchor="${dir > 0 ? 'start' : 'end'}" font-size="2.6" fill="#2445e0">ROW ${n} ${dir > 0 ? '→' : '←'}</text>`);
      }
      run = [];
    };
    let row = 0;
    layout.leds.forEach((l, i) => {
      const prev = layout.leds[i - 1];
      if (prev && (prev.row !== l.row || s.mount === 'edge')) {
        if (s.mount !== 'edge') flush(++row);
      }
      run.push(l);
    });
    if (s.mount !== 'edge') flush(++row);
    const r = Math.max(0.8, Math.min(2.5, s.pitch * 0.18)), c = r + 1.2;
    o.push(`<g stroke="#111" stroke-width="0.25" fill="none">${layout.leds.map((l) => `<circle cx="${f(l.x)}" cy="${f(l.y)}" r="${f(r)}"/><path d="M${f(l.x - c)} ${f(l.y)}h${f(2 * c)}M${f(l.x)} ${f(l.y - c)}v${f(2 * c)}"/>`).join('')}</g>`);
    const every = s.pitch < 10 ? 20 : 10;
    o.push(`<g font-size="2.2" fill="#555">${layout.leds.filter((l) => l.i === 0 || (l.i + 1) % every === 0).map((l) => `<text x="${f(l.x + r + 0.6)}" y="${f(l.y - r - 0.4)}">${l.i + 1}</text>`).join('')}</g>`);
    const a = layout.leds[0];
    o.push(`<circle cx="${f(a.x)}" cy="${f(a.y)}" r="${f(r + 2.2)}" fill="none" stroke="#2445e0" stroke-width="0.5"/><text x="${f(a.x - r - 3.5)}" y="${f(a.y + 1)}" text-anchor="end" font-size="2.8" font-weight="700" fill="#2445e0">DATA IN</text>`);
  }
  return o.join('');
}

export function templatePages(b: BuildInfo, paper: Paper = 'letter') {
  const P = PAPER[paper];
  const tw = P.w - 2 * MARGIN, th = P.h - 2 * MARGIN - HEAD;
  const pad = 8; // paper around the frame
  const W = b.s.frameW + 2 * pad, H = b.s.frameH + 2 * pad;
  const cols = Math.max(1, Math.ceil((W - OVERLAP) / (tw - OVERLAP)));
  const rows = Math.max(1, Math.ceil((H - OVERLAP) / (th - OVERLAP)));
  return { P, tw, th, pad, cols, rows, W, H };
}

/** A self-contained, print-ready HTML document: a cover page, then the template tiled across pages at 1:1. */
export function templateHtml(b: BuildInfo, paper: Paper = 'letter'): string {
  const { P, tw, th, pad, cols, rows } = templatePages(b, paper);
  const content = templateContent(b);
  const colL = (c: number) => String.fromCharCode(65 + c);
  const pages: string[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const vx = -pad + c * (tw - OVERLAP), vy = -pad + r * (th - OVERLAP);
      const glue = [c > 0 ? `<rect x="${f(vx)}" y="${f(vy)}" width="${OVERLAP}" height="${f(th)}" fill="#2445e0" fill-opacity="0.06"/>` : '', r > 0 ? `<rect x="${f(vx)}" y="${f(vy)}" width="${f(tw)}" height="${OVERLAP}" fill="#2445e0" fill-opacity="0.06"/>` : ''].join('');
      const marks = [0, 1].flatMap((i) => [0, 1].map((j) => { const x = vx + (i ? tw - OVERLAP / 2 : OVERLAP / 2), y = vy + (j ? th - OVERLAP / 2 : OVERLAP / 2); return `<path d="M${f(x - 3)} ${f(y)}h6M${f(x)} ${f(y - 3)}v6" stroke="#2445e0" stroke-width="0.25"/>`; })).join('');
      pages.push(`<section class="page"><header><div><b>Atmos</b> [ lab ] · ${esc(b.name)} · placement template</div><span>Page ${colL(c)}${r + 1} of ${cols * rows} · ${esc(P.label)} · print at 100%</span></header>
<svg width="${f(tw)}mm" height="${f(th)}mm" viewBox="${f(vx)} ${f(vy)} ${f(tw)} ${f(th)}">${glue}${content}${marks}<text x="${f(vx + tw - 3)}" y="${f(vy + th - 3)}" text-anchor="end" font-size="6" font-weight="700" fill="#2445e0" fill-opacity="0.5">${colL(c)}${r + 1}</text></svg></section>`);
    }
  const map = Array.from({ length: rows }, (_, r) => `<div class="row">${Array.from({ length: cols }, (_, c) => `<span>${colL(c)}${r + 1}</span>`).join('')}</div>`).join('');
  const { s, stats, layout } = b;
  const cover = `<section class="page cover">
<header><div><b>Atmos</b> [ lab ] · placement template</div><span>${esc(P.label)} · ${cols * rows + 1} pages</span></header>
<h1>${esc(b.name)}</h1>
<p class="sub">${Math.round(s.frameW)} × ${Math.round(s.frameH)} mm ${esc(shapeName(s).toLowerCase())} · ${stats.count.toLocaleString()} LEDs · ${s.mount === 'edge' ? 'one loop' : `${layout.runs} rows`} · ${s.pitch.toFixed(1)} mm spacing</p>
<div class="cal"><svg width="50mm" height="50mm" viewBox="0 0 50 50"><rect x="0.15" y="0.15" width="49.7" height="49.7" fill="none" stroke="#111" stroke-width="0.3"/><text x="25" y="27" text-anchor="middle" font-size="4">50 mm</text></svg><p><b>Check the scale first.</b> This square must measure exactly 50 mm (1.97″). If not, print again with scaling set to 100% / Actual size.</p></div>
<ol>
<li>Print every page at <b>100%</b>, no “fit to page”.</li>
<li>Trim and overlap the tinted strips, lining up the blue crosses. Tape from the back.</li>
<li>Assemble in the grid below, then tape the template to the back panel.</li>
<li>Stick each strip along its blue band, LED on each cross, in the direction of the arrow. Start at <b>DATA IN</b>.</li>
<li>Join the end of each row to the start of the next (zigzag), then connect DATA IN to the controller.</li>
</ol>
<div class="map">${map}</div>
</section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(b.name)} · Atmos Lab template</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
@page { size: ${paper === 'a4' ? 'A4' : 'letter'} portrait; margin: ${MARGIN}mm; }
* { box-sizing: border-box; }
body { margin: 0; background: #f4f4f2; font-family: Geist, system-ui, sans-serif; color: #111; }
.bar { position: sticky; top: 0; display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 12px 16px; background: #fff; border-bottom: 1px solid #e5e2dc; font-size: 14px; }
.bar button { font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 999px; border: 0; background: #111; color: #fff; cursor: pointer; }
.page { width: ${f(P.w - 2 * MARGIN)}mm; margin: 16px auto; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.08); page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
header { height: ${HEAD}mm; display: flex; justify-content: space-between; align-items: center; font-family: 'JetBrains Mono', monospace; font-size: 8pt; letter-spacing: .04em; color: #555; }
header b { font-family: Geist, sans-serif; color: #111; font-size: 11pt; letter-spacing: -.02em; margin-right: 4px; }
header span { color: #888; }
svg { display: block; }
svg text { font-family: 'JetBrains Mono', monospace; }
.cover { padding-bottom: 8mm; }
.cover h1 { font-size: 30pt; letter-spacing: -.04em; margin: 10mm 0 2mm; }
.sub { color: #666; margin: 0 0 8mm; }
.cal { display: flex; gap: 6mm; align-items: center; padding: 5mm; background: #f4f4f2; border-radius: 3mm; }
.cal p { margin: 0; font-size: 10pt; line-height: 1.45; }
ol { font-size: 10.5pt; line-height: 1.6; padding-left: 5mm; margin: 8mm 0; }
.map { display: inline-flex; flex-direction: column; gap: 1.5mm; }
.map .row { display: flex; gap: 1.5mm; }
.map span { width: 14mm; height: 18mm; display: grid; place-items: center; border: 0.3mm solid #2445e0; color: #2445e0; font-family: 'JetBrains Mono', monospace; font-size: 9pt; }
@media print { body { background: #fff; } .bar { display: none; } .page { margin: 0; box-shadow: none; } }
</style></head><body>
<div class="bar"><span><b>Atmos</b> [ lab ] · ${cols * rows} template pages + cover</span><button onclick="print()">Print</button></div>
${cover}
${pages.join('\n')}
</body></html>`;
}

/** The blueprint as a printable page with its own Print and Download buttons. */
export function blueprintHtml(b: BuildInfo, svg: string, fileName: string): string {
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(b.name)} · Atmos Lab blueprint</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
@page { size: landscape; margin: 8mm; }
body { margin: 0; background: #0f2c63; font-family: Geist, system-ui, sans-serif; }
.bar { display: flex; gap: 10px; justify-content: space-between; align-items: center; padding: 12px 16px; color: #fff; font-size: 14px; }
.bar a, .bar button { font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 999px; border: 0; background: #fff; color: #111; cursor: pointer; text-decoration: none; }
.bar div { display: flex; gap: 8px; }
.sheet { padding: 0 16px 24px; }
.sheet svg { width: 100%; height: auto; display: block; box-shadow: 0 20px 60px -20px rgba(0,0,0,.6); }
@media print { body { background: #fff; } .bar { display: none; } .sheet { padding: 0; } .sheet svg { box-shadow: none; } }
</style></head><body>
<div class="bar"><span><b>Atmos</b> [ lab ] · blueprint</span><div><a href="${href}" download="${esc(fileName)}">Download SVG</a><button onclick="print()">Print</button></div></div>
<div class="sheet">${svg}</div>
</body></html>`;
}
