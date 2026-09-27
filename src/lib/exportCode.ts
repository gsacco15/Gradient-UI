// Code exports: CSS, Tailwind, SVG and project JSON.
import { nameForColor } from '../data/names';
import type { Gradient } from '../types';
import { mixHex } from './color';
import { sortedStops } from './gradient';

const pct = (v: number) => `${+(v * 100).toFixed(2)}%`;
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gradient';

/** Browsers blend CSS/SVG stops in sRGB; add in-between stops so the blend matches our Oklab renderer. */
export function expandStops(g: Gradient, sub = 3): { color: string; pos: number }[] {
  const s = sortedStops(g);
  const out: { color: string; pos: number }[] = [];
  s.forEach((p, i) => {
    out.push({ color: p.color, pos: p.pos });
    const n = s[i + 1];
    if (!n) return;
    for (let k = 1; k < sub; k++) {
      const t = k / sub;
      out.push({ color: mixHex(p.color, n.color, t), pos: p.pos + (n.pos - p.pos) * t });
    }
  });
  return out;
}

const stopList = (g: Gradient, sub = 3) => expandStops(g, sub).map((s) => `${s.color} ${pct(s.pos)}`).join(', ');

/** The ramp colour at t (0..1), for exports that need one colour at a given point. */
function rampColor(g: Gradient, t: number): string {
  const s = sortedStops(g);
  if (t <= s[0].pos) return s[0].color;
  for (let i = 1; i < s.length; i++) if (t <= s[i].pos) return mixHex(s[i - 1].color, s[i].color, (t - s[i - 1].pos) / Math.max(1e-6, s[i].pos - s[i - 1].pos));
  return s[s.length - 1].color;
}

/** Effects CSS can't reproduce faithfully. */
export function cssCaveats(g: Gradient): string[] {
  const out: string[] = [];
  if (g.type === 'frame') out.push('Frame composition is approximated with a radial gradient.');
  if (g.type === 'mesh') out.push('Mesh is approximated with layered radial gradients.');
  if (g.type === 'aperture') out.push('Aperture is approximated with a radial gradient; the soft edge and wall glow need the PNG export.');
  if (g.type === 'bands') out.push('Bands are approximated with a linear gradient; the painterly seams need the PNG export.');
  if (g.type === 'halo') out.push('Halo is approximated with a radial gradient; the corona needs the PNG export.');
  if (g.composition.symmetry !== 'none') out.push(`${g.composition.symmetry} symmetry is not expressible in CSS.`);
  if (g.weather.fog > 0) out.push('Fog (blur) is baked into the renderer only.');
  if (g.weather.frost > 0) out.push('Frost dither needs the PNG export.');
  if (g.weather.clouds > 0 || g.weather.heat > 0) out.push('Clouds/heat distortion needs the PNG or video export.');
  if (g.weather.pixel > 0) out.push('Pixelation needs the PNG export.');
  if (g.motion.mode !== 'none') out.push('Motion needs the video export.');
  return out;
}

export function cssBackground(g: Gradient): string {
  const at = `at ${pct(g.center.x)} ${pct(g.center.y)}`;
  switch (g.type) {
    case 'linear':
      return `linear-gradient(${Math.round(g.angle)}deg, ${stopList(g)})`;
    case 'radial':
      return `radial-gradient(ellipse 70.71% 70.71% ${at}, ${stopList(g)})`;
    case 'conic':
      return `conic-gradient(from ${Math.round(g.angle)}deg ${at}, ${stopList(g)})`;
    case 'frame': {
      const rev = expandStops(g, 2).map((s) => `${s.color} ${pct((1 - s.pos) * 0.5)}`).reverse().join(', ');
      const shape = g.composition.shape === 'circle' ? 'circle closest-side' : 'closest-side';
      return `radial-gradient(${shape} ${at}, ${rev})`;
    }
    case 'aperture': {
      // centre (ramp 1) -> edge (0.5) at the aperture size -> wall (0) just past it
      const size = g.composition.size ?? 0.62;
      const shape = g.composition.shape === 'circle' ? 'circle closest-side' : 'closest-side';
      return `radial-gradient(${shape} ${at}, ${rampColor(g, 1)} 0%, ${rampColor(g, 0.75)} ${pct(size * 0.55)}, ${rampColor(g, 0.5)} ${pct(size * 0.95)}, ${rampColor(g, 0.5 * (g.composition.glow ?? 0.45))} ${pct(size * 1.05)}, ${rampColor(g, 0)} ${pct(Math.min(1, size * 1.35))})`;
    }
    case 'bands': {
      const n = Math.max(1, Math.round(g.composition.count));
      const seam = Math.max(0.02, g.composition.softness) * 0.3 / n;
      const stops = Array.from({ length: n }, (_, i) => {
        const c = rampColor(g, n > 1 ? i / (n - 1) : 0.5);
        const a = i / n, b = (i + 1) / n;
        return `${c} ${pct(i ? a + seam : a)}, ${c} ${pct(i < n - 1 ? b - seam : b)}`;
      });
      return `linear-gradient(${Math.round(g.angle)}deg, ${stops.join(', ')})`;
    }
    case 'halo': {
      const r = 0.9 * (g.composition.size ?? 0.62), w = 0.03 + g.composition.softness * 0.2;
      const sky = rampColor(g, 0), ring = rampColor(g, 1), corona = rampColor(g, 0.5 * (g.composition.glow ?? 0.45));
      return `radial-gradient(circle closest-side ${at}, ${sky} ${pct(Math.max(0, r - w))}, ${ring} ${pct(r)}, ${corona} ${pct(Math.min(1, r + w))}, ${sky} ${pct(Math.min(1, r + w * 3))})`;
    }
    case 'mesh': {
      const layers = g.points.map(
        (p) => `radial-gradient(ellipse ${pct(p.size * 1.1)} ${pct(p.size * 1.1)} at ${pct(p.x)} ${pct(p.y)}, ${p.color} 0%, ${p.color}00 100%)`,
      );
      return [...layers, g.background].join(',\n    ');
    }
  }
}

const GRAIN_SVG = (amount: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${(amount * 0.55).toFixed(2)}'/%3E%3C/svg%3E")`;

export function toCSS(g: Gradient): string {
  const cls = `.atmos-${slug(g.name)}`;
  const caveats = cssCaveats(g);
  const lines = [
    `/* ${g.name} · ${g.place} · ${g.time} — made with Atmos */`,
    ...caveats.map((c) => `/* note: ${c} */`),
    `${cls} {`,
    `  background: ${sortedStops(g)[0].color};`,
    `  background: ${cssBackground(g)};`,
    `}`,
  ];
  if (g.weather.haze > 0) {
    lines.push(
      '',
      `/* grain (haze) overlay */`,
      `${cls} { position: relative; isolation: isolate; }`,
      `${cls}::after {`,
      `  content: ""; position: absolute; inset: 0; pointer-events: none;`,
      `  background-image: ${GRAIN_SVG(g.weather.haze)};`,
      `  mix-blend-mode: overlay;`,
      `}`,
    );
  }
  lines.push('', ':root {', ...tokenLines(g).map((l) => `  ${l}`), '}');
  return lines.join('\n');
}

function tokenLines(g: Gradient): string[] {
  const seen = new Set<string>();
  return sortedStops(g).flatMap((p) => {
    const n = slug(nameForColor(p.color));
    const key = seen.has(n) ? `${n}-${seen.size}` : n;
    seen.add(n);
    return [`--atmos-${key}: ${p.color};`];
  });
}

export function toTailwind(g: Gradient): string {
  const bg = cssBackground(g).replace(/\s*\n\s*/g, ' ').replace(/ /g, '_');
  const colors = sortedStops(g)
    .map((p) => `  --color-${slug(nameForColor(p.color))}: ${p.color};`)
    .filter((l, i, a) => a.indexOf(l) === i);
  const v3 = sortedStops(g)
    .map((p) => `        '${slug(nameForColor(p.color))}': '${p.color}',`)
    .filter((l, i, a) => a.indexOf(l) === i);
  return [
    `<!-- Tailwind utility (arbitrary value) -->`,
    `<div class="bg-[${bg}]"></div>`,
    '',
    `/* Tailwind v4 — app.css */`,
    `@theme {`,
    ...colors,
    `  --background-image-${slug(g.name)}: ${cssBackground(g).replace(/\s*\n\s*/g, ' ')};`,
    `}`,
    '',
    `// Tailwind v3 — tailwind.config.js`,
    `module.exports = {`,
    `  theme: {`,
    `    extend: {`,
    `      colors: {`,
    ...v3,
    `      },`,
    `      backgroundImage: {`,
    `        '${slug(g.name)}': "${cssBackground(g).replace(/\s*\n\s*/g, ' ')}",`,
    `      },`,
    `    },`,
    `  },`,
    `};`,
  ].join('\n');
}

export const svgNative = (g: Gradient) => (g.type === 'linear' || g.type === 'radial' || g.type === 'mesh') && g.composition.symmetry === 'none';

/** SVG: native gradients where possible, otherwise an embedded render. */
export function toSVG(g: Gradient, w: number, h: number, pngDataUrl?: string): string {
  const grain =
    g.weather.haze > 0
      ? `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`
      : '';
  const grainRect = g.weather.haze > 0 ? `<rect width="${w}" height="${h}" filter="url(#grain)" opacity="${(g.weather.haze * 0.35).toFixed(2)}" style="mix-blend-mode:overlay"/>` : '';
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n<!-- ${g.name} · ${g.place} · ${g.time} — made with Atmos -->`;
  const stops = expandStops(g, 4).map((s) => `<stop offset="${pct(s.pos)}" stop-color="${s.color}"/>`).join('');

  if (!svgNative(g) || g.weather.fog > 0.25 || g.weather.frost > 0 || g.weather.clouds > 0 || g.weather.pixel > 0) {
    if (!pngDataUrl) return '';
    return `${head}\n<image href="${pngDataUrl}" width="${w}" height="${h}"/>\n</svg>`;
  }
  if (g.type === 'linear') {
    const a = (g.angle * Math.PI) / 180;
    const dx = Math.sin(a), dy = -Math.cos(a);
    const len = Math.abs(w * dx) + Math.abs(h * dy);
    const cx = w / 2, cy = h / 2;
    const f = (v: number) => v.toFixed(1);
    return `${head}\n<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${f(cx - (dx * len) / 2)}" y1="${f(cy - (dy * len) / 2)}" x2="${f(cx + (dx * len) / 2)}" y2="${f(cy + (dy * len) / 2)}">${stops}</linearGradient>${grain}</defs>\n<rect width="${w}" height="${h}" fill="url(#g)"/>${grainRect}\n</svg>`;
  }
  if (g.type === 'radial') {
    return `${head}\n<defs><radialGradient id="g" cx="${g.center.x}" cy="${g.center.y}" r="0.7071">${stops}</radialGradient>${grain}</defs>\n<rect width="${w}" height="${h}" fill="url(#g)"/>${grainRect}\n</svg>`;
  }
  // mesh: soft blobs over the base colour
  const blobs = g.points
    .map((p, i) => `<radialGradient id="b${i}"><stop offset="0" stop-color="${p.color}"/><stop offset="1" stop-color="${p.color}" stop-opacity="0"/></radialGradient>`)
    .join('');
  const circles = g.points
    .map((p, i) => `<ellipse cx="${(p.x * w).toFixed(1)}" cy="${(p.y * h).toFixed(1)}" rx="${(p.size * h * 1.2).toFixed(1)}" ry="${(p.size * h * 1.2).toFixed(1)}" fill="url(#b${i})"/>`)
    .join('\n');
  return `${head}\n<defs>${blobs}${grain}<filter id="soft"><feGaussianBlur stdDeviation="${(h * 0.04).toFixed(1)}"/></filter></defs>\n<rect width="${w}" height="${h}" fill="${g.background}"/>\n<g filter="url(#soft)">\n${circles}\n</g>${grainRect}\n</svg>`;
}

export function toJSON(g: Gradient): string {
  return JSON.stringify({ app: 'atmos', version: 1, gradient: g }, null, 2);
}

export function download(filename: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
