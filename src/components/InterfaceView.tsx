// Interface mode: a sample product site wearing the current gradient.
// Click any element to apply the gradient to its background, border or text.
import { useEffect, useMemo, useState } from 'react';
import { contrastRatio, hexToRgb, type RGB } from '../lib/color';
import { gradientKey } from '../lib/gradient';
import { renderDataURL, renderPixels } from '../render/renderer';
import { useStore } from '../store';
import type { Gradient, UiTarget } from '../types';
import { Field, Section, Seg } from './ui';

const LIGHT_TEXT: RGB = [1, 1, 1];
const DARK_TEXT: RGB = hexToRgb('#141414');
const SURFACE = { light: '#FFFFFF', dark: '#111214' };

export const ELEMENTS: { id: string; label: string; kind: 'block' | 'text' }[] = [
  { id: 'nav', label: 'NAVIGATION', kind: 'block' },
  { id: 'logo', label: 'LOGO', kind: 'text' },
  { id: 'hero', label: 'HERO HEADER', kind: 'block' },
  { id: 'hero-title', label: 'HERO TITLE', kind: 'text' },
  { id: 'btn-primary', label: 'PRIMARY BUTTON', kind: 'block' },
  { id: 'card-1', label: 'CARD · FORECAST', kind: 'block' },
  { id: 'card-2', label: 'CARD · PALETTES', kind: 'block' },
  { id: 'card-3', label: 'CARD · EXPORT', kind: 'block' },
  { id: 'price-title', label: 'PRICE', kind: 'text' },
  { id: 'login-panel', label: 'LOGIN PANEL', kind: 'block' },
  { id: 'login-btn', label: 'LOGIN BUTTON', kind: 'block' },
];

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

export function InterfaceView() {
  const g = useStore((s) => s.gradient);
  const { assign, picked, style } = useStore((s) => s.ui);
  const img = useGradientImage(g);
  const contrast = useContrast(g);

  const tone = style.textTone === 'auto' ? contrast?.best ?? 'light' : style.textTone;
  const onGradText = tone === 'light' ? '#FFFFFF' : '#141414';
  const surface = SURFACE[style.surface];
  const ink = style.surface === 'light' ? '#141414' : '#F2F2F2';
  const sub = style.surface === 'light' ? '#6B6B6B' : '#9A9A9A';
  const panel = style.surface === 'light' ? '#F6F6F4' : '#1B1C1F';

  const font = { mono: "'JetBrains Mono', ui-monospace, monospace", sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", serif: "ui-serif, Georgia, 'Times New Roman', serif" }[style.font];
  const r = style.radius;
  const sp = style.spacing;
  const shadow = style.shadow ? `0 ${Math.round(24 * style.shadow)}px ${Math.round(60 * style.shadow)}px -20px rgba(0,0,0,${(0.55 * style.shadow).toFixed(2)})` : 'none';

  const paint = (id: string, base: React.CSSProperties = {}): React.CSSProperties => {
    const t: UiTarget = assign[id] ?? 'none';
    const s: React.CSSProperties = { ...base };
    const fill = base.background ?? surface;
    if (t === 'background' && img) {
      s.background = `url(${img}) center / cover`;
      s.color = onGradText;
    } else if (t === 'border' && img) {
      s.border = `${style.borderWidth}px solid transparent`;
      s.background = `linear-gradient(${fill}, ${fill}) padding-box, url(${img}) center / cover border-box`;
    } else if (t === 'text' && img) {
      s.background = `url(${img}) center / cover`;
      s.WebkitBackgroundClip = 'text';
      s.backgroundClip = 'text';
      s.color = 'transparent';
    }
    return s;
  };

  const el = (id: string) => ({
    'data-el': id,
    className: `ui-el ${picked === id ? 'picked' : ''}`,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      useStore.getState().setUi({ picked: id });
    },
  });

  const glassBg = style.surface === 'light' ? `rgba(255,255,255,${0.2 + style.glass * 0.35})` : `rgba(20,20,24,${0.25 + style.glass * 0.35})`;
  const glass: React.CSSProperties = {
    background: glassBg,
    backdropFilter: `blur(${Math.round(style.glass * 24)}px) saturate(140%)`,
    WebkitBackdropFilter: `blur(${Math.round(style.glass * 24)}px) saturate(140%)`,
    border: `1px solid rgba(255,255,255,${0.15 + style.glass * 0.3})`,
  };

  return (
    <div className="iface-scroll" onClick={() => useStore.getState().setUi({ picked: null })}>
      <div className="iface" style={{ background: surface, color: ink, fontFamily: font, '--r': `${r}px`, '--sp': sp } as React.CSSProperties}>
        <nav {...el('nav')} style={paint('nav', { background: surface, padding: `${14 * sp}px ${28 * sp}px`, borderBottom: `1px solid ${style.surface === 'light' ? '#ECECEC' : '#26272B'}` })}>
          <span {...el('logo')} style={{ ...paint('logo'), fontWeight: 700, letterSpacing: '.02em', fontSize: 18 }}>
            Northlight
          </span>
          <span className="iface-links" style={{ color: assign.nav === 'background' ? onGradText : sub }}>
            <span>Forecast</span>
            <span>Palettes</span>
            <span>Pricing</span>
          </span>
          <span className="iface-pill" style={{ borderRadius: r, border: `1px solid ${assign.nav === 'background' ? onGradText : ink}`, color: assign.nav === 'background' ? onGradText : ink }}>
            Sign in
          </span>
        </nav>

        <header {...el('hero')} style={{ ...paint('hero', { background: panel }), padding: `${72 * sp}px ${28 * sp}px ${80 * sp}px`, margin: `${16 * sp}px`, borderRadius: r * 1.5, boxShadow: shadow }}>
          <div className="iface-kicker" style={{ opacity: 0.75 }}>
            {g.place} · {g.time}
          </div>
          <h1 {...el('hero-title')} style={{ ...paint('hero-title'), fontSize: 'clamp(30px, 5vw, 58px)', lineHeight: 1.02, margin: `${14 * sp}px 0`, fontWeight: 600, letterSpacing: '-0.02em', maxWidth: 640 }}>
            Every sky, ready for your interface.
          </h1>
          <p style={{ maxWidth: 460, opacity: 0.85, lineHeight: 1.5 }}>Gradients drawn from real places and moments — tuned for buttons, cards and screens.</p>
          <div className="iface-row" style={{ gap: 12 * sp, marginTop: 26 * sp }}>
            <button {...el('btn-primary')} style={{ ...paint('btn-primary', { background: ink, color: surface }), borderRadius: r, padding: `${12 * sp}px ${20 * sp}px`, boxShadow: shadow, fontWeight: 600 }}>
              Start free
            </button>
            <button className="iface-glass-btn" style={{ ...glass, borderRadius: r, padding: `${12 * sp}px ${20 * sp}px`, color: assign.hero === 'background' ? onGradText : ink }}>
              View gallery
            </button>
          </div>
        </header>

        <section className="iface-cards" style={{ gap: 16 * sp, padding: `0 ${16 * sp}px` }}>
          {[
            { id: 'card-1', t: 'Forecast shuffle', d: 'Lock the colours you love. Shuffle the rest by place and time.' },
            { id: 'card-2', t: 'Named palettes', d: 'Every colour logged like a field note — Glacier Hour, Dune Ember.' },
            { id: 'card-3', t: 'Export anywhere', d: 'CSS, Tailwind, SVG, PNG and seamless video loops.' },
          ].map((c) => (
            <article key={c.id} {...el(c.id)} style={{ ...paint(c.id, { background: panel }), borderRadius: r, padding: `${24 * sp}px`, boxShadow: shadow }}>
              <div className="iface-icon" style={{ borderRadius: r / 2, background: assign[c.id] === 'background' ? 'rgba(255,255,255,.25)' : img ? `url(${img}) center / cover` : ink }} />
              <h3 style={{ margin: `${14 * sp}px 0 ${6 * sp}px`, fontSize: 17 }}>{c.t}</h3>
              <p style={{ margin: 0, opacity: 0.8, lineHeight: 1.5, fontSize: 14 }}>{c.d}</p>
            </article>
          ))}
        </section>

        <section className="iface-split" style={{ gap: 16 * sp, padding: `${16 * sp}px` }}>
          <div style={{ background: panel, borderRadius: r, padding: `${28 * sp}px`, boxShadow: shadow }}>
            <div style={{ color: sub, fontSize: 13 }}>ATMOS PRO</div>
            <div {...el('price-title')} style={{ ...paint('price-title'), fontSize: 56, fontWeight: 700, letterSpacing: '-0.03em', margin: `${8 * sp}px 0` }}>
              $12<span style={{ fontSize: 18 }}>/mo</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 14, color: sub }}>
              <li>Every collection</li>
              <li>4K video loops</li>
              <li>Team palettes</li>
            </ul>
          </div>
          <div className="iface-login-bg" style={{ borderRadius: r * 1.5, background: img ? `url(${img}) center / cover` : panel, boxShadow: shadow }}>
            <form {...el('login-panel')} style={{ ...(assign['login-panel'] === 'none' ? glass : paint('login-panel', { background: surface })), borderRadius: r, padding: `${24 * sp}px`, color: assign['login-panel'] === 'background' ? onGradText : ink }}>
              <div style={{ fontWeight: 600, marginBottom: 14 * sp }}>Welcome back</div>
              <input placeholder="you@studio.com" style={{ borderRadius: r / 1.5 }} readOnly />
              <input placeholder="Password" type="password" style={{ borderRadius: r / 1.5 }} readOnly />
              <button {...el('login-btn')} style={{ ...paint('login-btn', { background: ink, color: surface }), borderRadius: r / 1.5, padding: `${11 * sp}px`, width: '100%', fontWeight: 600, marginTop: 6 * sp }}>
                Continue
              </button>
            </form>
          </div>
        </section>
        <footer style={{ padding: `${24 * sp}px ${28 * sp}px`, color: sub, fontSize: 12 }}>© Northlight — sample interface generated by Atmos</footer>
      </div>
    </div>
  );
}

export function InterfaceInspector() {
  const g = useStore((s) => s.gradient);
  const { assign, picked, style } = useStore((s) => s.ui);
  const contrast = useContrast(g);
  const pickedEl = ELEMENTS.find((e) => e.id === picked);
  const setStyle = useStore.getState().setUiStyle;

  const targets: UiTarget[] = pickedEl?.kind === 'text' ? ['text', 'none'] : ['background', 'border', 'text', 'none'];
  const tone = style.textTone === 'auto' ? contrast?.best ?? 'light' : style.textTone;
  const on = contrast ? contrast[tone] : null;

  return (
    <div className="inspector">
      <div className="insp-title">
        <div className="name-input static">INTERFACE</div>
        <p className="hint">Click any element in the preview to choose where the gradient goes.</p>
      </div>

      <Section title={pickedEl ? pickedEl.label : 'ELEMENT'}>
        {pickedEl ? (
          <Seg
            options={targets}
            value={assign[pickedEl.id] ?? 'none'}
            onChange={(t) => useStore.getState().setUi({ assign: { ...assign, [pickedEl.id]: t } })}
          />
        ) : (
          <p className="hint">Nothing selected.</p>
        )}
        <ul className="el-list">
          {ELEMENTS.map((e) => (
            <li key={e.id} className={picked === e.id ? 'sel' : ''} onClick={() => useStore.getState().setUi({ picked: e.id })}>
              <span>{e.label}</span>
              <span className="muted">{(assign[e.id] ?? 'none').toUpperCase()}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="CONTRAST CHECK">
        {contrast && on ? (
          <div className="contrast">
            <div className={`contrast-badge ${on.min >= 4.5 ? 'ok' : on.min >= 3 ? 'warn' : 'bad'}`}>
              <span>{tone === 'light' ? 'WHITE' : 'DARK'} TEXT ON GRADIENT</span>
              <strong>{grade(on.min)}</strong>
            </div>
            <div className="contrast-rows">
              <span>WORST SPOT</span>
              <span>{on.min.toFixed(2)} : 1</span>
              <span>TYPICAL</span>
              <span>{on.median.toFixed(2)} : 1</span>
              <span>WHITE / DARK MIN</span>
              <span>
                {contrast.light.min.toFixed(1)} / {contrast.dark.min.toFixed(1)}
              </span>
            </div>
            {on.min < 4.5 && <p className="hint">Some parts of this gradient fall below AA for body text. Try the other text tone, add DUSK, or darken a stop.</p>}
          </div>
        ) : (
          <p className="hint">Unavailable.</p>
        )}
      </Section>

      <Section title="COMPONENT STYLE">
        <Field label="TEXT ON GRADIENT">
          <Seg options={['auto', 'light', 'dark'] as const} value={style.textTone} onChange={(textTone) => setStyle({ textTone })} />
        </Field>
        <Field label="SURFACE">
          <Seg options={['light', 'dark'] as const} value={style.surface} onChange={(surface) => setStyle({ surface })} />
        </Field>
        <Field label="TYPE">
          <Seg options={['sans', 'serif', 'mono'] as const} value={style.font} onChange={(font) => setStyle({ font })} />
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

function StyleSlider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span className="slider-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} style={{ '--p': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="slider-value">{unit ? `${value}${unit}` : Math.round(((value - min) / (max - min)) * 100)}</span>
    </label>
  );
}
