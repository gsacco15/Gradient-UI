// Landing page: a live sky, what Atmos does, the community wall, and a way in.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALL_PRESETS } from '../data/collections';
import { useRenderLoop, usePointer } from '../components/Canvas';
import { Thumb } from '../components/Thumb';
import { luminance } from '../lib/color';
import { cloneGradient } from '../lib/gradient';
import { encodeGradient } from '../lib/share';
import { generateFromText } from '../lib/textGradient';
import { accountsEnabled, displayName, listCommunity, myLikes, requireAccount, setLike, signOut, useAuth, type SharedGradient, type Sort } from '../lib/supabase';
import { grainScale, renderPixels } from '../render/renderer';
import { linkTo, navigate } from '../router';
import type { Gradient } from '../types';
import './landing.css';

const preset = (name: string) => ALL_PRESETS.find((g) => g.name === name) ?? ALL_PRESETS[0];

// Hero skies: dark enough for white type, each made to drift and follow the cursor.
const HERO = ['SOLAR WIND', 'ORION DUST', 'AFTERGLOW', 'LAVA FLOW', 'KELP FOREST', 'NEBULA DUSK'].map((n) => {
  const g = cloneGradient(preset(n), false);
  if (g.type !== 'mesh') {
    g.type = 'mesh';
    g.background = g.points[g.points.length - 1].color;
  }
  g.motion = { mode: 'drift', speed: 0.7, duration: 14 };
  g.interact = { mode: 'follow', strength: 0.7 };
  g.weather = { ...g.weather, fog: Math.max(g.weather.fog, 0.25), haze: Math.max(g.weather.haze, 0.3) };
  return g;
});

const TRY = ['Tokyo rain at 2am', 'Iceland glacier at first light', 'Lavender field in a heat haze', 'Deep sea bioluminescence'];

export function openInStudio(g: Gradient) {
  navigate(`/studio#g=${encodeGradient(g)}`);
}

export default function Landing() {
  const session = useAuth((s) => s.session);
  const sky = useHeroSky();
  return (
    <div className="landing">
      <nav className="l-nav">
        <a className="l-logo" {...linkTo('/')}>
          Atmos<span>[ studio ]</span>
        </a>
        <div className="l-links">
          <a href="#features">Features</a>
          <a href="#community">Community</a>
        </div>
        <div className="l-actions">
          {session ? (
            <>
              <span className="l-hello">Hi, {displayName(session)}</span>
              <button className="l-textbtn" onClick={() => signOut()}>
                Sign out
              </button>
            </>
          ) : (
            accountsEnabled && (
              <button className="l-textbtn" onClick={() => useAuth.getState().open('signin')}>
                Sign in
              </button>
            )
          )}
          <a className="l-pill dark" {...linkTo('/studio')}>
            Open studio
          </a>
        </div>
      </nav>

      <Hero sky={sky} />
      <TryStrip sky={sky} />
      <Features />
      <Community />

      <section className="l-final">
        <h2>Your sky is waiting.</h2>
        <p>Free, in your browser, nothing to install.</p>
        <div className="l-final-actions">
          <a className="l-pill dark big" {...linkTo('/studio')}>
            Open the studio →
          </a>
          {!session && accountsEnabled && (
            <button className="l-pill ghost big" onClick={() => useAuth.getState().open('signup')}>
              Create free account
            </button>
          )}
        </div>
      </section>

      <footer className="l-foot">
        <span>ATMOS [ STUDIO ] · SKY & NATURE GRADIENTS</span>
        <span>MADE WITH WEBGL, OKLAB AND CLAUDE</span>
      </footer>
    </div>
  );
}

/** Make any gradient hero-ready: drifting, cursor-following, with a little grain. */
function heroize(src: Gradient): Gradient {
  const g = cloneGradient(src, false);
  if (g.motion.mode === 'none') g.motion = { mode: 'drift', speed: 0.7, duration: 14 };
  g.interact = { mode: 'follow', strength: 0.7 };
  g.weather = { ...g.weather, haze: Math.max(g.weather.haze, 0.25) };
  return g;
}

/** Light skies get dark type. Samples the left half of the hero, where the headline sits. */
function inkFor(g: Gradient): 'light' | 'dark' {
  try {
    const px = renderPixels(g, 16, 10);
    let sum = 0, n = 0;
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 9; x++) {
        const i = (y * 16 + x) * 4;
        sum += luminance([px[i] / 255, px[i + 1] / 255, px[i + 2] / 255]);
        n++;
      }
    return sum / n > 0.4 ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

interface HeroSky {
  g: Gradient;
  note: string | null; // what Claude said about the scene
  source: 'preset' | 'ai' | 'local';
  prompt?: string;
}

function useHeroSky() {
  const [sky, setSky] = useState<HeroSky>({ g: HERO[0], note: null, source: 'preset' });
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const next = () => {
    const n = (i + 1) % HERO.length;
    setI(n);
    setSky({ g: HERO[n], note: null, source: 'preset' });
  };

  const generate = async (prompt: string) => {
    const p = prompt.trim().slice(0, 200);
    if (!p || busy) return;
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const r = await generateFromText(p, abort.current.signal);
      setSky({ g: heroize(r.gradient), note: r.note || null, source: r.source, prompt: p });
      document.querySelector('.l-hero')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return { sky, busy, error, next, generate };
}

type Sky = ReturnType<typeof useHeroSky>;

function Hero({ sky: h }: { sky: Sky }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const g = h.sky.g;
  const pointer = usePointer(wrap);
  const still = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const ink = useMemo(() => inkFor(g), [g]);

  const { error } = useRenderLoop(
    canvas,
    (r, t) => r.render(g, { phase: still ? 0 : ((t / 1000) / g.motion.duration) % 1, pxScale: grainScale(r.canvas.width, r.canvas.height), seed: 0, mouse: pointer.step() }),
    [g],
    !still,
  );

  return (
    <header className={`l-hero ink-${ink} ${h.busy ? 'is-busy' : ''}`} ref={wrap}>
      <canvas ref={canvas} className="l-hero-canvas" aria-hidden />
      {error && <div className="l-hero-fallback" />}
      <div className="l-hero-notes" aria-hidden>
        <span>{g.place}</span>
        <span>{g.coords}</span>
      </div>
      <div className="l-hero-body">
        <p className="l-eyebrow">A gradient studio · every colour is a place and a moment</p>
        <h1>
          Gradients
          <br />
          drawn from the sky.
        </h1>
        <p className="l-lede">Describe a mood, shape it by hand, then drop it straight into your interface, a poster or a moving film.</p>
        <div className="l-hero-actions">
          <a className="l-pill light big" {...linkTo('/studio')}>
            Start creating →
          </a>
          <button className="l-pill glass big" onClick={() => openInStudio(g)}>
            Open this sky
          </button>
        </div>
      </div>
      <div className="l-hero-foot">
        <span className="l-hero-caption">
          {h.busy ? (
            <span className="l-reading">READING THE SKY…</span>
          ) : h.sky.source === 'preset' ? (
            `${g.name} · ${g.time}`
          ) : (
            <>
              <span className="l-badge">{h.sky.source === 'ai' ? 'GENERATED BY CLAUDE' : 'BUILT-IN GENERATOR'}</span>
              {g.name} · {g.time}
              {h.sky.note && <em> — {h.sky.note}</em>}
            </>
          )}
        </span>
        <button className="l-shuffle" onClick={h.next} disabled={h.busy} aria-label="Show another sky">
          Another sky ↻
        </button>
      </div>
    </header>
  );
}

function TryStrip({ sky }: { sky: Sky }) {
  const [text, setText] = useState('');
  return (
    <section className="l-try">
      <form
        className={`l-try-box ${sky.busy ? 'is-busy' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          sky.generate(text);
        }}
      >
        <span className="ai-chip l-try-chip">✦ AI</span>
        <span className="l-try-label">Describe a sky</span>
        <input id="landing-describe" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tokyo rain at 2am, neon on wet asphalt" maxLength={200} aria-label="Describe a sky" disabled={sky.busy} />
        <button className="l-pill l-ai-btn" disabled={!text.trim() || sky.busy}>
          {sky.busy ? 'Painting…' : 'Generate'}
        </button>
      </form>
      <div className="l-try-chips">
        {TRY.map((t) => (
          <button
            key={t}
            disabled={sky.busy}
            onClick={() => {
              setText(t);
              sky.generate(t);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {sky.error && <p className="l-try-error">{sky.error}</p>}
      <p className="l-try-hint">
        <span className="ai-text">Claude</span> paints it right onto the sky above. Like it? Press “Open this sky”.
      </p>
    </section>
  );
}

const FEATURES: { title: string; body: string; g: string; tag: string; wide?: boolean }[] = [
  { tag: 'AI', title: 'Say it, see it', body: 'Type “moss after a storm” and Claude picks the colours, the place and the hour.', g: 'WET CANOPY', wide: true },
  { tag: 'EDIT', title: 'Shape it by hand', body: 'Drag colour points, add fog, grain and dither, make it move or follow the cursor.', g: 'QUADRANT NEBULA' },
  { tag: 'UI', title: 'See it on real screens', body: 'Paint buttons, cards and headers, check contrast, copy the code.', g: 'CORONA' },
  { tag: 'PRINT', title: 'Posters at 300 DPI', body: 'Field-note typography, bone or ink paper, ready for the print shop.', g: 'RED MESA' },
  { tag: 'FILM', title: 'Photos into horizons', body: 'Scan any photo line by line into a slow moving film. Save stills or MP4.', g: 'TIDE LINE' },
];

function Features() {
  return (
    <section className="l-features" id="features">
      <div className="l-section-head">
        <h2>Everything a gradient can be.</h2>
        <p>Eighty-seven skies to start from, and the tools to make your own.</p>
      </div>
      <div className="l-bento">
        {FEATURES.map((f) => (
          <article key={f.title} className={`l-tile ${f.wide ? 'wide' : ''}`}>
            <Thumb g={preset(f.g)} w={f.wide ? 640 : 320} h={320} className="l-tile-art" />
            <div className="l-tile-text">
              <span className={f.tag === 'AI' ? 'ai-chip' : 'l-tag'}>{f.tag === 'AI' ? '✦ AI' : f.tag}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Community() {
  const session = useAuth((s) => s.session);
  const [sort, setSort] = useState<Sort>('new');
  const [items, setItems] = useState<SharedGradient[] | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountsEnabled) return;
    setError(null);
    try {
      setItems(await listCommunity(sort));
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }, [sort]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    myLikes().then(setLiked);
  }, [session]);

  const toggle = (item: SharedGradient) =>
    requireAccount(async () => {
      const on = !liked.has(item.id);
      setLiked((s) => {
        const n = new Set(s);
        if (on) n.add(item.id);
        else n.delete(item.id);
        return n;
      });
      setItems((xs) => xs?.map((x) => (x.id === item.id ? { ...x, likes: x.likes + (on ? 1 : -1) } : x)) ?? null);
      try {
        await setLike(item.id, on);
      } catch {
        load();
      }
    });

  const featured = useMemo(() => ['ALPENGLOW', 'SOLAR WIND', 'LAGOON', 'DUNE EMBER', 'CHERRY RAIN', 'CREVASSE', 'MAGMA VEIN', 'LAVENDER ROW'].map(preset), []);

  return (
    <section className="l-community" id="community">
      <div className="l-section-head row">
        <div>
          <h2>From the community.</h2>
          <p>{accountsEnabled ? 'Gradients people made and shared. Open any of them in the studio to remix.' : 'Featured skies. Sharing opens when accounts are switched on.'}</p>
        </div>
        {accountsEnabled && (
          <div className="l-sort" role="tablist">
            {(['new', 'top'] as Sort[]).map((s) => (
              <button key={s} role="tab" aria-selected={sort === s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)}>
                {s === 'new' ? 'Newest' : 'Most liked'}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="l-muted">The community wall is resting right now. Here are some featured skies instead.</p>}

      <div className="l-wall">
        {accountsEnabled && items === null && Array.from({ length: 8 }, (_, i) => <div key={i} className="l-card skeleton" />)}
        {accountsEnabled &&
          items?.map((it) => (
            <article key={it.id} className="l-card">
              <button className="l-card-art" onClick={() => openInStudio(it.gradient)} aria-label={`Open ${it.name} in the studio`}>
                <Thumb g={it.gradient} w={300} h={360} />
                <span className="l-card-open">Remix in studio →</span>
              </button>
              <div className="l-card-meta">
                <div>
                  <strong>{it.name}</strong>
                  <span>by {it.author}</span>
                </div>
                <button className={`l-like ${liked.has(it.id) ? 'on' : ''}`} onClick={() => toggle(it)} aria-pressed={liked.has(it.id)} aria-label={liked.has(it.id) ? 'Unlike' : 'Like'}>
                  {liked.has(it.id) ? '♥' : '♡'} {it.likes}
                </button>
              </div>
            </article>
          ))}
        {(!accountsEnabled || error || (items && items.length === 0)) &&
          featured.map((g) => (
            <article key={g.id} className="l-card">
              <button className="l-card-art" onClick={() => openInStudio(g)} aria-label={`Open ${g.name} in the studio`}>
                <Thumb g={g} w={300} h={360} />
                <span className="l-card-open">Open in studio →</span>
              </button>
              <div className="l-card-meta">
                <div>
                  <strong>{g.name}</strong>
                  <span>{g.place}</span>
                </div>
              </div>
            </article>
          ))}
      </div>
      {accountsEnabled && items && items.length === 0 && !error && <p className="l-muted">Nothing shared yet. Be the first: make something in the studio and press SHARE.</p>}
      <div className="l-community-cta">
        <a className="l-pill dark" {...linkTo('/studio')}>
          Make one and share it →
        </a>
      </div>
    </section>
  );
}
