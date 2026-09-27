// Interface mode: sample screens wearing the current gradient.
// Click any outlined element to choose where the gradient goes — background, border or text.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { contrastRatio, hexToRgb, type RGB } from '../lib/color';
import { cssBackground, cssCaveats } from '../lib/exportCode';
import { gradientKey } from '../lib/gradient';
import { renderDataURL, renderPixels } from '../render/renderer';
import { useStore } from '../store';
import type { Gradient, UiScreen, UiStyle, UiTarget } from '../types';
import { Field, Section, Seg } from './ui';

// The serif and grotesk faces are only used here, so they load when Interface mode opens.
let extraFonts = false;
function loadInterfaceFonts() {
  if (extraFonts || typeof document === 'undefined') return;
  extraFonts = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Schibsted+Grotesk:wght@400;500;600;700&display=swap';
  document.head.appendChild(l);
}
loadInterfaceFonts();

const LIGHT_TEXT: RGB = [1, 1, 1];
const DARK_TEXT: RGB = hexToRgb('#141414');

export const FONTS: Record<UiStyle['font'], { label: string; stack: string }> = {
  sans: { label: 'GEIST', stack: "'Geist', ui-sans-serif, system-ui, sans-serif" },
  grotesk: { label: 'GROTESK', stack: "'Schibsted Grotesk', ui-sans-serif, system-ui, sans-serif" },
  serif: { label: 'SERIF', stack: "'Instrument Serif', ui-serif, Georgia, serif" },
  mono: { label: 'MONO', stack: "'JetBrains Mono', ui-monospace, monospace" },
};

type Kind = 'block' | 'card' | 'button' | 'text';
interface ElementDef {
  id: string;
  label: string;
  kind: Kind;
  sample: string; // text used in "copy component"
}

export const SCREENS: Record<UiScreen, { label: string; elements: ElementDef[] }> = {
  landing: {
    label: 'LANDING PAGE',
    elements: [
      { id: 'nav', label: 'NAVIGATION', kind: 'block', sample: 'Northlight' },
      { id: 'logo', label: 'LOGO', kind: 'text', sample: 'Northlight' },
      { id: 'hero', label: 'HERO HEADER', kind: 'block', sample: 'Every sky, ready for your interface.' },
      { id: 'hero-title', label: 'HERO TITLE', kind: 'text', sample: 'Every sky, ready for your interface.' },
      { id: 'btn-primary', label: 'PRIMARY BUTTON', kind: 'button', sample: 'Start free' },
      { id: 'card-1', label: 'FEATURE CARD 1', kind: 'card', sample: 'Forecast shuffle' },
      { id: 'card-2', label: 'FEATURE CARD 2', kind: 'card', sample: 'Named palettes' },
      { id: 'card-3', label: 'FEATURE CARD 3', kind: 'card', sample: 'Export anywhere' },
      { id: 'price-title', label: 'PRICE', kind: 'text', sample: '$12/mo' },
      { id: 'login-panel', label: 'LOGIN PANEL', kind: 'card', sample: 'Welcome back' },
      { id: 'login-btn', label: 'LOGIN BUTTON', kind: 'button', sample: 'Continue' },
    ],
  },
  app: {
    label: 'MOBILE APP',
    elements: [
      { id: 'app-header', label: 'WEATHER CARD', kind: 'card', sample: '18° Partly cloudy' },
      { id: 'app-temp', label: 'TEMPERATURE', kind: 'text', sample: '18°' },
      { id: 'app-card', label: 'FORECAST CARD', kind: 'card', sample: 'Next 5 days' },
      { id: 'app-fab', label: 'ACTION BUTTON', kind: 'button', sample: '+' },
      { id: 'app-tabbar', label: 'TAB BAR', kind: 'block', sample: 'Today · Radar · Places' },
    ],
  },
  dashboard: {
    label: 'DASHBOARD',
    elements: [
      { id: 'dash-side', label: 'SIDEBAR', kind: 'block', sample: 'Overview' },
      { id: 'dash-title', label: 'PAGE TITLE', kind: 'text', sample: 'Good morning, Ava' },
      { id: 'dash-stat-1', label: 'STAT · VISITORS', kind: 'card', sample: '24.8k' },
      { id: 'dash-stat-2', label: 'STAT · CONVERSION', kind: 'card', sample: '3.9%' },
      { id: 'dash-stat-3', label: 'STAT · REVENUE', kind: 'card', sample: '$18,240' },
      { id: 'dash-chart', label: 'CHART FILL', kind: 'block', sample: 'Traffic' },
      { id: 'dash-btn', label: 'BUTTON', kind: 'button', sample: 'New report' },
    ],
  },
};

const ALL_ELEMENTS = Object.values(SCREENS).flatMap((s) => s.elements);
const TARGET_LABEL: Record<UiTarget, string> = { background: 'BACKGROUND', border: 'BORDER', text: 'TEXT', none: 'NOT PAINTED' };

export interface ContrastReport {
  light: { min: number; median: number };
  dark: { min: number; median: number };
  best: 'light' | 'dark';
}

function useGradientImage(g: Gradient) {
  const key = gradientKey(g);
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setUrl(renderDataURL(g, 960, 640, key, { pxScale: 1 }));
      } catch {
        /* no WebGL */
      }
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

/** Contrast of light and dark text across every part of the gradient. */
export function useContrast(g: Gradient): ContrastReport | null {
  const key = gradientKey(g);
  return useMemo(() => {
    try {
      const px = renderPixels(g, 24, 16);
      const light: number[] = [], dark: number[] = [];
      for (let i = 0; i < px.length; i += 4) {
        const c: RGB = [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255];
        light.push(contrastRatio(c, LIGHT_TEXT));
        dark.push(contrastRatio(c, DARK_TEXT));
      }
      const stat = (xs: number[]) => {
        const s = [...xs].sort((a, b) => a - b);
        return { min: s[0], median: s[Math.floor(s.length / 2)] };
      };
      const L = stat(light), D = stat(dark);
      return { light: L, dark: D, best: L.min >= D.min ? 'light' : 'dark' };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export const grade = (r: number) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA LARGE' : 'FAIL');

// ---------------------------------------------------------------- painting helpers

interface Kit {
  img: string;
  style: UiStyle;
  assign: Record<string, UiTarget>;
  picked: string | null;
  tried: boolean;
  onGrad: string; // text colour on gradient
  surface: string;
  panel: string;
  ink: string;
  sub: string;
  line: string;
  shadow: string;
  glass: React.CSSProperties;
  paint: (id: string, base?: React.CSSProperties) => React.CSSProperties;
  el: (id: string) => Record<string, unknown>;
  on: (id: string) => boolean; // is this element's background painted?
}

function useKit(g: Gradient): Kit {
  const { assign, picked, style, tried } = useStore((s) => s.ui);
  const img = useGradientImage(g);
  const contrast = useContrast(g);
  const tone = style.textTone === 'auto' ? contrast?.best ?? 'light' : style.textTone;
  const dark = style.surface === 'dark';
  const kit: Kit = {
    img,
    style,
    assign,
    picked,
    tried,
    onGrad: tone === 'light' ? '#FFFFFF' : '#141414',
    surface: dark ? '#111214' : '#FFFFFF',
    panel: dark ? '#1B1C1F' : '#F5F5F3',
    ink: dark ? '#F2F2F2' : '#141414',
    sub: dark ? '#9A9A9A' : '#6B6B6B',
    line: dark ? '#26272B' : '#ECECEC',
    shadow: style.shadow ? `0 ${Math.round(24 * style.shadow)}px ${Math.round(60 * style.shadow)}px -20px rgba(0,0,0,${(0.55 * style.shadow).toFixed(2)})` : 'none',
    glass: {
      background: dark ? `rgba(20,20,24,${0.25 + style.glass * 0.35})` : `rgba(255,255,255,${0.2 + style.glass * 0.35})`,
      backdropFilter: `blur(${Math.round(style.glass * 24)}px) saturate(140%)`,
      WebkitBackdropFilter: `blur(${Math.round(style.glass * 24)}px) saturate(140%)`,
      border: `1px solid rgba(255,255,255,${0.15 + style.glass * 0.3})`,
    },
    paint: () => ({}),
    el: () => ({}),
    on: (id) => assign[id] === 'background',
  };
  kit.paint = (id, base = {}) => {
    const t: UiTarget = assign[id] ?? 'none';
    const s: React.CSSProperties = { ...base };
    const fill = (base.background as string | undefined) ?? kit.surface;
    if (!img) return s;
    if (t === 'background') {
      s.background = `url(${img}) center / cover`;
      s.color = kit.onGrad;
    } else if (t === 'border') {
      s.border = `${style.borderWidth}px solid transparent`;
      s.background = `linear-gradient(${fill}, ${fill}) padding-box, url(${img}) center / cover border-box`;
    } else if (t === 'text') {
      s.background = `url(${img}) center / cover`;
      s.WebkitBackgroundClip = 'text';
      s.backgroundClip = 'text';
      s.color = 'transparent';
    }
    return s;
  };
  kit.el = (id) => {
    const def = ALL_ELEMENTS.find((e) => e.id === id);
    return {
      'data-el': id,
      'data-label': `${def?.label ?? id} · ${TARGET_LABEL[assign[id] ?? 'none']}`,
      className: `ui-el ${picked === id ? 'picked' : ''} ${!tried && (id === 'hero' || id === 'app-header' || id === 'dash-stat-1') ? 'beckon' : ''}`,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        useStore.getState().setUi({ picked: id, tried: true });
      },
    };
  };
  return kit;
}

// ---------------------------------------------------------------- view

export function InterfaceView() {
  const g = useStore((s) => s.gradient);
  const screen = useStore((s) => s.ui.screen);
  const k = useKit(g);
  const sp = k.style.spacing;

  return (
    <div className="iface-shell">
      <div className="iface-bar">
        <div className="iface-screens" role="tablist" aria-label="Sample screen">
          {(Object.keys(SCREENS) as UiScreen[]).map((s) => (
            <button key={s} role="tab" aria-selected={screen === s} className={screen === s ? 'on' : ''} onClick={() => useStore.getState().setUi({ screen: s, picked: null })}>
              {SCREENS[s].label}
            </button>
          ))}
        </div>
        <span className="iface-hint">SAMPLE SCREEN · CLICK ANY OUTLINED PART TO PAINT IT</span>
      </div>
      <div className="iface-scroll" onClick={() => useStore.getState().setUi({ picked: null })}>
        <div
          className={`iface iface-${screen}`}
          style={{ background: screen === 'app' ? k.panel : k.surface, color: k.ink, fontFamily: FONTS[k.style.font].stack, '--r': `${k.style.radius}px`, '--sp': sp } as React.CSSProperties}
        >
          {screen === 'landing' && <Landing g={g} k={k} />}
          {screen === 'app' && <MobileApp g={g} k={k} />}
          {screen === 'dashboard' && <Dashboard k={k} />}
        </div>
      </div>
    </div>
  );
}

function Landing({ g, k }: { g: Gradient; k: Kit }) {
  const { style, paint, el, img } = k;
  const r = style.radius, sp = style.spacing;
  return (
    <>
      <nav {...el('nav')} style={paint('nav', { background: k.surface, padding: `${14 * sp}px ${28 * sp}px`, borderBottom: `1px solid ${k.line}` })}>
        <span {...el('logo')} style={{ ...paint('logo'), fontWeight: 700, letterSpacing: '-0.01em', fontSize: 19 }}>
          Northlight
        </span>
        <span className="iface-links" style={{ color: k.on('nav') ? k.onGrad : k.sub }}>
          <span>Forecast</span>
          <span>Palettes</span>
          <span>Pricing</span>
        </span>
        <span className="iface-pill" style={{ borderRadius: r, border: `1px solid ${k.on('nav') ? k.onGrad : k.ink}`, color: k.on('nav') ? k.onGrad : k.ink }}>
          Sign in
        </span>
      </nav>

      <header {...el('hero')} style={{ ...paint('hero', { background: k.panel }), padding: `${72 * sp}px ${28 * sp}px ${80 * sp}px`, margin: `${16 * sp}px`, borderRadius: r * 1.5, boxShadow: k.shadow }}>
        <div className="iface-kicker" style={{ opacity: 0.75 }}>
          {g.place} · {g.time}
        </div>
        <h1 {...el('hero-title')} style={{ ...paint('hero-title'), fontSize: 'clamp(32px, 5.4vw, 62px)', lineHeight: 1.02, margin: `${14 * sp}px 0`, fontWeight: style.font === 'serif' ? 400 : 600, letterSpacing: style.font === 'serif' ? '-0.01em' : '-0.035em', maxWidth: 660 }}>
          Every sky, ready for your interface.
        </h1>
        <p style={{ maxWidth: 460, opacity: 0.85, lineHeight: 1.55, fontSize: 16 }}>Gradients drawn from real places and moments, tuned for buttons, cards and screens.</p>
        <div className="iface-row" style={{ gap: 12 * sp, marginTop: 26 * sp }}>
          <button {...el('btn-primary')} style={{ ...paint('btn-primary', { background: k.ink, color: k.surface }), borderRadius: r, padding: `${12 * sp}px ${20 * sp}px`, boxShadow: k.shadow, fontWeight: 600 }}>
            Start free
          </button>
          <button className="iface-glass-btn" style={{ ...k.glass, borderRadius: r, padding: `${12 * sp}px ${20 * sp}px`, color: k.on('hero') ? k.onGrad : k.ink }}>
            View gallery
          </button>
        </div>
      </header>

      <section className="iface-cards" style={{ gap: 16 * sp, padding: `0 ${16 * sp}px` }}>
        {[
          { id: 'card-1', t: 'Forecast shuffle', d: 'Lock the colours you love. Shuffle the rest by place and time.' },
          { id: 'card-2', t: 'Named palettes', d: 'Every colour logged like a field note: Glacier Hour, Dune Ember.' },
          { id: 'card-3', t: 'Export anywhere', d: 'CSS, Tailwind, SVG, PNG and seamless video loops.' },
        ].map((c) => (
          <article key={c.id} {...el(c.id)} style={{ ...paint(c.id, { background: k.panel }), borderRadius: r, padding: `${24 * sp}px`, boxShadow: k.shadow }}>
            <div className="iface-icon" style={{ borderRadius: r / 2, background: k.on(c.id) ? 'rgba(255,255,255,.25)' : img ? `url(${img}) center / cover` : k.ink }} />
            <h3 style={{ margin: `${14 * sp}px 0 ${6 * sp}px`, fontSize: 18, fontWeight: 600 }}>{c.t}</h3>
            <p style={{ margin: 0, opacity: 0.8, lineHeight: 1.5, fontSize: 14 }}>{c.d}</p>
          </article>
        ))}
      </section>

      <section className="iface-split" style={{ gap: 16 * sp, padding: `${16 * sp}px` }}>
        <div style={{ background: k.panel, borderRadius: r, padding: `${28 * sp}px`, boxShadow: k.shadow }}>
          <div style={{ color: k.sub, fontSize: 13 }}>Atmos Pro</div>
          <div {...el('price-title')} style={{ ...paint('price-title'), fontSize: 60, fontWeight: 700, letterSpacing: '-0.04em', margin: `${8 * sp}px 0` }}>
            $12<span style={{ fontSize: 18 }}>/mo</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 14, color: k.sub }}>
            <li>Every collection</li>
            <li>4K video loops</li>
            <li>Team palettes</li>
          </ul>
        </div>
        <div className="iface-login-bg" style={{ borderRadius: r * 1.5, background: img ? `url(${img}) center / cover` : k.panel, boxShadow: k.shadow }}>
          <form {...el('login-panel')} onSubmit={(e) => e.preventDefault()} style={{ ...(k.assign['login-panel'] === 'none' || !k.assign['login-panel'] ? k.glass : paint('login-panel', { background: k.surface })), borderRadius: r, padding: `${24 * sp}px`, color: k.on('login-panel') ? k.onGrad : k.ink }}>
            <div style={{ fontWeight: 600, marginBottom: 14 * sp, fontSize: 17 }}>Welcome back</div>
            <input placeholder="you@studio.com" style={{ borderRadius: r / 1.5 }} readOnly aria-label="Sample email" />
            <input placeholder="Password" type="password" style={{ borderRadius: r / 1.5 }} readOnly aria-label="Sample password" />
            <button {...el('login-btn')} style={{ ...paint('login-btn', { background: k.ink, color: k.surface }), borderRadius: r / 1.5, padding: `${11 * sp}px`, width: '100%', fontWeight: 600, marginTop: 6 * sp }}>
              Continue
            </button>
          </form>
        </div>
      </section>
      <footer style={{ padding: `${24 * sp}px ${28 * sp}px`, color: k.sub, fontSize: 12 }}>© Northlight · sample screen generated by Atmos</footer>
    </>
  );
}

function MobileApp({ g, k }: { g: Gradient; k: Kit }) {
  const { style, paint, el } = k;
  const r = style.radius, sp = style.spacing;
  const days = [['Mon', '19°', '11°'], ['Tue', '17°', '10°'], ['Wed', '21°', '12°'], ['Thu', '16°', '9°'], ['Fri', '18°', '11°']];
  return (
    <div className="phone" style={{ background: k.surface, color: k.ink }}>
      <div className="phone-status">
        <span>9:41</span>
        <span>●●● ◐</span>
      </div>
      <div className="phone-body" style={{ padding: `${10 * sp}px ${16 * sp}px ${16 * sp}px`, gap: 14 * sp }}>
        <div style={{ fontSize: 13, color: k.sub }}>{g.place.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</div>
        <section {...el('app-header')} style={{ ...paint('app-header', { background: k.panel }), borderRadius: r * 1.6, padding: `${22 * sp}px`, boxShadow: k.shadow, minHeight: 190 }}>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Now · {g.time}</div>
          <div {...el('app-temp')} style={{ ...paint('app-temp'), fontSize: 84, fontWeight: 300, letterSpacing: '-0.05em', lineHeight: 1, margin: `${10 * sp}px 0` }}>
            18°
          </div>
          <div style={{ fontSize: 15, opacity: 0.9 }}>Partly cloudy · H 21° L 11°</div>
        </section>
        <div className="phone-hours">
          {['Now', '10', '11', '12', '13', '14'].map((h, i) => (
            <div key={h} style={{ borderRadius: r, background: k.panel, padding: `${10 * sp}px 0` }}>
              <span style={{ color: k.sub, fontSize: 11 }}>{h}</span>
              <strong style={{ fontSize: 14 }}>{18 + (i % 3)}°</strong>
            </div>
          ))}
        </div>
        <section {...el('app-card')} style={{ ...paint('app-card', { background: k.panel }), borderRadius: r, padding: `${16 * sp}px ${18 * sp}px` }}>
          <div style={{ fontSize: 13, color: k.on('app-card') ? k.onGrad : k.sub, marginBottom: 8 * sp }}>Next 5 days</div>
          {days.map(([d, hi, lo]) => (
            <div key={d} className="phone-day" style={{ padding: `${6 * sp}px 0` }}>
              <span>{d}</span>
              <span style={{ opacity: 0.6 }}>{lo}</span>
              <span className="phone-range" style={{ background: k.img ? `url(${k.img}) center / cover` : k.ink, borderRadius: 4 }} />
              <span>{hi}</span>
            </div>
          ))}
        </section>
      </div>
      <button {...el('app-fab')} style={{ ...paint('app-fab', { background: k.ink, color: k.surface }), borderRadius: Math.max(r, 20), boxShadow: k.shadow }} aria-label="Add place">
        +
      </button>
      <nav {...el('app-tabbar')} style={{ ...paint('app-tabbar', { background: k.surface }), borderTop: `1px solid ${k.line}` }}>
        <span>Today</span>
        <span style={{ opacity: 0.55 }}>Radar</span>
        <span style={{ opacity: 0.55 }}>Places</span>
      </nav>
    </div>
  );
}

function Dashboard({ k }: { k: Kit }) {
  const { style, paint, el, img } = k;
  const r = style.radius, sp = style.spacing;
  const pts = [18, 26, 22, 34, 30, 44, 40, 52, 47, 60, 58, 70];
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (pts.length - 1)) * 100} ${100 - v}`).join(' ');
  return (
    <div className="dash" style={{ gap: 16 * sp, padding: 16 * sp }}>
      <aside {...el('dash-side')} style={{ ...paint('dash-side', { background: k.panel }), borderRadius: r, padding: `${20 * sp}px ${16 * sp}px` }}>
        <strong style={{ fontSize: 16 }}>Northlight</strong>
        {['Overview', 'Audience', 'Palettes', 'Exports', 'Settings'].map((n, i) => (
          <span key={n} style={{ opacity: i === 0 ? 1 : 0.6, fontSize: 14 }}>
            {n}
          </span>
        ))}
      </aside>
      <main className="dash-main" style={{ gap: 16 * sp }}>
        <div className="dash-head">
          <div>
            <div style={{ color: k.sub, fontSize: 13 }}>Thursday, 12 June</div>
            <h2 {...el('dash-title')} style={{ ...paint('dash-title'), margin: 0, fontSize: 32, fontWeight: style.font === 'serif' ? 400 : 600, letterSpacing: '-0.03em' }}>
              Good morning, Ava
            </h2>
          </div>
          <button {...el('dash-btn')} style={{ ...paint('dash-btn', { background: k.ink, color: k.surface }), borderRadius: r, padding: `${10 * sp}px ${16 * sp}px`, fontWeight: 600 }}>
            New report
          </button>
        </div>
        <div className="dash-stats" style={{ gap: 12 * sp }}>
          {[
            ['dash-stat-1', 'Visitors', '24.8k', '+12%'],
            ['dash-stat-2', 'Conversion', '3.9%', '+0.4'],
            ['dash-stat-3', 'Revenue', '$18,240', '+8%'],
          ].map(([id, label, v, d]) => (
            <div key={id} {...el(id)} style={{ ...paint(id, { background: k.panel }), borderRadius: r, padding: `${18 * sp}px`, boxShadow: k.shadow }}>
              <div style={{ fontSize: 13, opacity: 0.75 }}>{label}</div>
              <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.03em', margin: `${6 * sp}px 0 ${2 * sp}px`, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{d} this week</div>
            </div>
          ))}
        </div>
        <section style={{ background: k.panel, borderRadius: r, padding: `${18 * sp}px` }}>
          <div className="dash-head" style={{ marginBottom: 10 * sp }}>
            <strong style={{ fontSize: 15 }}>Traffic</strong>
            <span style={{ color: k.sub, fontSize: 12 }}>Last 12 weeks</span>
          </div>
          <div {...el('dash-chart')} style={{ borderRadius: r / 2 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <defs>
                <clipPath id="dash-area">
                  <path d={`${path} L 100 100 L 0 100 Z`} />
                </clipPath>
              </defs>
              {[25, 50, 75].map((y) => (
                <line key={y} x1="0" x2="100" y1={y} y2={y} stroke={k.line} strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
              ))}
              {k.assign['dash-chart'] === 'background' && img ? (
                <image href={img} x="0" y="0" width="100" height="100" preserveAspectRatio="none" clipPath="url(#dash-area)" />
              ) : (
                <path d={`${path} L 100 100 L 0 100 Z`} fill={k.ink} opacity="0.08" />
              )}
              <path d={path} fill="none" stroke={k.ink} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </section>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- copy component

export function componentCode(def: ElementDef, target: UiTarget, g: Gradient, style: UiStyle): string {
  const bg = cssBackground(g).replace(/\s*\n\s*/g, ' ');
  const cls = `atmos-${def.kind}`;
  const font = FONTS[style.font].stack.replace(/'/g, '"');
  const shadow = style.shadow ? `0 ${Math.round(24 * style.shadow)}px ${Math.round(60 * style.shadow)}px -20px rgba(0, 0, 0, ${(0.55 * style.shadow).toFixed(2)})` : 'none';
  const paint =
    target === 'background'
      ? [`background: ${bg};`, `color: #fff;`]
      : target === 'border'
        ? [`border: ${style.borderWidth}px solid transparent;`, `background: linear-gradient(#fff, #fff) padding-box, ${bg} border-box;`]
        : target === 'text'
          ? [`background: ${bg};`, `-webkit-background-clip: text;`, `background-clip: text;`, `color: transparent;`]
          : [`background: #f5f5f3;`];
  const box: Record<Kind, string[]> = {
    button: [`font: 600 15px/1 ${font};`, `padding: 12px 20px;`, `border: 0;`, `border-radius: ${style.radius}px;`, `box-shadow: ${shadow};`, `cursor: pointer;`],
    card: [`font-family: ${font};`, `padding: 24px;`, `border-radius: ${style.radius}px;`, `box-shadow: ${shadow};`],
    block: [`font-family: ${font};`, `padding: 48px 28px;`, `border-radius: ${Math.round(style.radius * 1.5)}px;`],
    text: [`font: 600 56px/1.05 ${font};`, `letter-spacing: -0.03em;`, `margin: 0;`],
  };
  const tag = def.kind === 'button' ? 'button' : def.kind === 'text' ? 'h1' : 'div';
  const caveats = cssCaveats(g);
  const lines = [
    `<!-- ${def.label.toLowerCase()} · ${g.name} gradient · made with Atmos -->`,
    `<${tag} class="${cls}">${def.sample}</${tag}>`,
    '',
    '<style>',
    `.${cls} {`,
    ...[...box[def.kind], ...paint].map((l) => `  ${l}`),
    '}',
    '</style>',
  ];
  if (caveats.length && target !== 'none') lines.push('', `<!-- CSS approximates this gradient: ${caveats.join(' ')} For an exact match, export a PNG and use it as background-image. -->`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- inspector

export function InterfaceInspector() {
  const g = useStore((s) => s.gradient);
  const { assign, picked, style, screen } = useStore((s) => s.ui);
  const contrast = useContrast(g);
  const [code, setCode] = useState<string | null>(null);
  const elements = SCREENS[screen].elements;
  const pickedEl = ALL_ELEMENTS.find((e) => e.id === picked);
  const setStyle = useStore.getState().setUiStyle;

  useEffect(() => setCode(null), [picked]);

  const targets: UiTarget[] = pickedEl?.kind === 'text' ? ['text', 'none'] : ['background', 'border', 'text', 'none'];
  const tone = style.textTone === 'auto' ? contrast?.best ?? 'light' : style.textTone;
  const on = contrast ? contrast[tone] : null;

  const copy = async () => {
    if (!pickedEl) return;
    const c = componentCode(pickedEl, assign[pickedEl.id] ?? 'none', g, style);
    setCode(c);
    try {
      await navigator.clipboard.writeText(c);
      useStore.getState().notify('COMPONENT CODE COPIED');
    } catch {
      useStore.getState().notify('SELECT THE CODE BELOW TO COPY');
    }
  };

  return (
    <div className="inspector">
      <div className="insp-title">
        <div className="name-input static">INTERFACE</div>
        <p className="hint">See your gradient on real screens. Pick a part of the sample, then choose how the gradient is used on it.</p>
      </div>

      <Section title={pickedEl ? `SELECTED · ${pickedEl.label}` : 'SELECTED'}>
        {pickedEl ? (
          <>
            <Field label="USE THE GRADIENT AS">
              <Seg options={targets} value={assign[pickedEl.id] ?? 'none'} onChange={(t) => useStore.getState().setUi({ assign: { ...assign, [pickedEl.id]: t } })} labels={{ none: 'NOTHING' }} />
            </Field>
            <button className="btn ghost wide" onClick={copy}>
              COPY COMPONENT CODE
            </button>
            {code && <textarea className="code small" readOnly value={code} spellCheck={false} aria-label="Component code" onFocus={(e) => e.target.select()} />}
          </>
        ) : (
          <p className="hint">Click something in the sample, or pick it from this list.</p>
        )}
        <ul className="el-list">
          {elements.map((e) => (
            <li key={e.id} className={picked === e.id ? 'sel' : ''} onClick={() => useStore.getState().setUi({ picked: e.id, tried: true })}>
              <span>{e.label}</span>
              <span className={`el-target t-${assign[e.id] ?? 'none'}`}>{TARGET_LABEL[assign[e.id] ?? 'none']}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="CONTRAST CHECK">
        {contrast && on ? (
          <div className="contrast">
            <div className={`contrast-badge ${on.min >= 4.5 ? 'ok' : on.min >= 3 ? 'warn' : 'bad'}`}>
              <span>{tone === 'light' ? 'WHITE' : 'DARK'} TEXT ON THIS GRADIENT</span>
              <strong>{grade(on.min)}</strong>
            </div>
            <div className="contrast-rows">
              <span>HARDEST SPOT TO READ</span>
              <span>{on.min.toFixed(2)} : 1</span>
              <span>TYPICAL</span>
              <span>{on.median.toFixed(2)} : 1</span>
            </div>
            <p className="hint">
              {on.min >= 4.5
                ? 'Body text is readable everywhere on this gradient.'
                : on.min >= 3
                  ? 'Fine for big headings. Small text may be hard to read in places.'
                  : 'Text will be hard to read somewhere. Try the other text colour, add DUSK, or darken a stop.'}
            </p>
          </div>
        ) : (
          <p className="hint">Unavailable.</p>
        )}
      </Section>

      <Section title="COMPONENT STYLE">
        <Field label="TEXT ON GRADIENT">
          <Seg options={['auto', 'light', 'dark'] as const} value={style.textTone} onChange={(textTone) => setStyle({ textTone })} labels={{ light: 'WHITE' }} />
        </Field>
        <Field label="PAGE">
          <Seg options={['light', 'dark'] as const} value={style.surface} onChange={(surface) => setStyle({ surface })} />
        </Field>
        <Field label="TYPEFACE">
          <Seg options={Object.keys(FONTS) as UiStyle['font'][]} value={style.font} onChange={(font) => setStyle({ font })} labels={Object.fromEntries(Object.entries(FONTS).map(([k, v]) => [k, v.label]))} />
        </Field>
        <StyleSlider label="CORNERS" value={style.radius} min={0} max={32} step={1} unit="PX" onChange={(radius) => setStyle({ radius })} />
        <StyleSlider label="SHADOW" value={style.shadow} min={0} max={1} step={0.01} onChange={(shadow) => setStyle({ shadow })} />
        <StyleSlider label="GLASS" value={style.glass} min={0} max={1} step={0.01} onChange={(glass) => setStyle({ glass })} />
        <StyleSlider label="SPACING" value={style.spacing} min={0.6} max={1.6} step={0.05} onChange={(spacing) => setStyle({ spacing })} />
        <StyleSlider label="BORDER" value={style.borderWidth} min={1} max={8} step={1} unit="PX" onChange={(borderWidth) => setStyle({ borderWidth })} />
      </Section>
    </div>
  );
}

function StyleSlider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }): ReactNode {
  return (
    <label className="slider">
      <span className="slider-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} style={{ '--p': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="slider-value">{unit ? `${value}${unit}` : Math.round(((value - min) / (max - min)) * 100)}</span>
    </label>
  );
}
