// Landing page: a live sky, what Atmos does, the community wall, and a way in.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALL_PRESETS } from '../data/collections';
import { useOnScreen, usePointer, useRenderLoop } from '../render/loop';
import { Thumb } from '../components/Thumb';
import { hexToOklab, hexToRgb, luminance } from '../lib/color';
import { cloneGradient } from '../lib/gradient';
import { cssBackground } from '../lib/exportCode';
import { encodeGradient } from '../lib/share';
import { generateFromText } from '../lib/textGradient';
import { accountsEnabled, displayName, getShared, listCommunity, myLikes, requireAccount, setLike, shareUrl, signOut, useAuth, type SharedGradient, type Sort } from '../lib/supabase';
import { grainScale, renderPixels } from '../render/renderer';
import { linkTo, navigate } from '../router';
import type { Gradient } from '../types';
import horizonSample from './horizon-sample.webp';
import lencoisPalette from './lencois-palette.webp';
import lencoisPhoto from './lencois-photo.webp';
import './landing.css';

// The Lab piece loads with the Lab's code, only when its section is near the screen.
const LedPiece = lazy(() => import('../led/LedLab').then((m) => ({ default: m.LedPiece })));

const preset = (name: string) => ALL_PRESETS.find((g) => g.name === name) ?? ALL_PRESETS[0];

// Hero skies: the Light Works pieces, Turrell-style windows and rings of light that slowly breathe.
// On wide screens the light sits to the right of the headline; on phones it sits low, under the type.
const HERO_NAMES = ['SKYSPACE', 'GANZFELD', 'APERTURE VIOLET', 'TOTALITY', 'CHAPEL LIGHT', 'MOON RING'];
const wideHero = () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 861px)').matches;
const HERO = HERO_NAMES.map((n) => {
  const g = cloneGradient(preset(n), false);
  const wide = wideHero();
  g.center = wide ? { x: 0.7, y: 0.5 } : { x: 0.5, y: 0.66 };
  g.composition = { ...g.composition, size: Math.min(g.composition.size, wide ? 0.72 : 0.6) };
  g.motion = { mode: 'pulse', speed: 0.45, duration: 12 };
  g.interact = { mode: 'follow', strength: 0.5 };
  g.weather = { ...g.weather, haze: Math.max(g.weather.haze, 0.25) };
  return g;
});

const TRY = ['Tokyo rain at 2am', 'Iceland glacier at first light', 'A Turrell skyspace at dusk', 'Lavender field in a heat haze'];

/** The sky someone painted on the home page this visit; "Open studio" links carry it in. */
let painted: Gradient | null = null;
const studioHref = () => (painted ? `/studio#g=${encodeGradient(painted)}` : '/studio');
const studioLink = () => ({
  href: '/studio',
  onClick: (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(studioHref());
  },
});

export function openInStudio(g: Gradient) {
  navigate(`/studio#g=${encodeGradient(g)}`);
}

export default function Landing({ slug }: { slug?: string }) {
  if (slug) return <SharedViewer slug={slug} />;
  return <Home />;
}

/** In-page link to a home page section, from any page. */
function jumpHome(e: React.MouseEvent, id: string) {
  e.preventDefault();
  if (location.pathname !== '/') navigate('/');
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), location.pathname === '/' ? 0 : 60);
}

/** Top bar. `bare` drops the in-page links, for pages without those sections. */
function LandingNav({ bare = false }: { bare?: boolean }) {
  const session = useAuth((s) => s.session);
  return (
    <nav className="l-nav">
      <a className="l-logo" {...linkTo('/')}>
        Atmos<span>[ studio ]</span>
      </a>
      <div className="l-links">
        {!bare && (
          <>
            <a href="/#how" onClick={(e) => jumpHome(e, 'how')}>
              How it works
            </a>
            <a {...linkTo('/community')}>Community</a>
            <a {...linkTo('/led')}>Lab</a>
          </>
        )}
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
        <a className="l-pill dark" {...studioLink()}>
          Open studio
        </a>
      </div>
    </nav>
  );
}

function Home() {
  const session = useAuth((s) => s.session);
  const sky = useHeroSky();
  return (
    <div className="landing">
      <LandingNav />

      <Hero sky={sky} />
      <HowItWorks />
      <LabSection g={sky.sky.g} />
      <CommunityWall limit={8} />

      <section className="l-final">
        <h2>Your sky is waiting.</h2>
        <p>Free, in your browser, nothing to install.</p>
        <div className="l-final-actions">
          <a className="l-pill dark big" {...studioLink()}>
            Open the studio →
          </a>
          {!session && accountsEnabled && (
            <button className="l-pill ghost big" onClick={() => useAuth.getState().open('signup')}>
              Create free account
            </button>
          )}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/** The LED Lab: your sky as a real light piece on the wall. */
function LabSection({ g: heroSky }: { g: Gradient }) {
  // The hero pushes apertures and halos aside to make room for the headline; a light piece wants them centred.
  const g = useMemo(() => (heroSky.type === 'aperture' || heroSky.type === 'halo' ? { ...heroSky, center: { x: 0.5, y: 0.5 } } : heroSky), [heroSky]);
  // The glow behind the text takes the piece's two most luminous, colourful tones.
  const glow = useMemo(() => {
    const ranked = [...new Set(g.points.map((p) => p.color.toUpperCase()))]
      .map((c) => {
        const [L, a, b] = hexToOklab(c);
        return { c, score: Math.hypot(a, b) * 2 + L * 0.35 };
      })
      .sort((x, y) => y.score - x.score);
    const rgb = (i: number) => hexToRgb((ranked[Math.min(i, ranked.length - 1)] ?? { c: '#C24DF0' }).c).map((v) => Math.round(v * 255)).join(', ');
    return { '--lab-a': rgb(0), '--lab-b': rgb(1) } as React.CSSProperties;
  }, [g]);
  return (
    <section className="l-lab" id="lab">
      <div className="l-lab-card" style={glow}>
        <div className="l-lab-art">
          <Suspense fallback={null}>
            <LedPiece g={g} className="l-lab-canvas" />
          </Suspense>
          <span className="l-lab-sky">{g.name} · AS A LIGHT PIECE</span>
        </div>
        <div className="l-lab-text">
          <span className="l-lab-tag">
            <i /> NEW · ATMOS [ LAB ]
          </span>
          <h2>
            Put your sky
            <br />
            on the wall.
          </h2>
          <p>Turn any gradient into a real LED light piece, in the spirit of James Turrell. Pick a frame and a shape, see it glow on your wall, and get everything you need to build it.</p>
          <ul className="l-lab-points">
            <li>
              <strong>Any frame</strong>Picture-frame sizes, square, circle or oval, with or without a bezel.
            </li>
            <li>
              <strong>See the light</strong>Bare LEDs or diffused glow, forward, bounce or edge-lit, day or night.
            </li>
            <li>
              <strong>Build sheet</strong>LED count, strip length, power supply and box depth, worked out for you.
            </li>
            <li>
              <strong>Send it</strong>Stream to your LEDs over USB, or export for WLED and Arduino.
            </li>
          </ul>
          <div className="l-lab-actions">
            <a className="l-pill light big" {...linkTo(`/led#g=${encodeGradient(g)}`)}>
              Open the Lab with this sky →
            </a>
            <span className="l-lab-note">Free · works with WS2812B strips and WLED</span>
          </div>
        </div>
      </div>
    </section>
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
    // Close the phone keyboard first, so the page isn't left in its keyboard-open layout.
    (document.activeElement as HTMLElement | null)?.blur();
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const r = await generateFromText(p, abort.current.signal);
      setSky({ g: heroize(r.gradient), note: r.note || null, source: r.source, prompt: p });
      painted = r.gradient;
      const hero = document.querySelector('.l-hero');
      if (hero && hero.getBoundingClientRect().top < 0) hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const onScreen = useOnScreen(wrap);
  const [text, setText] = useState('');

  const { error } = useRenderLoop(
    canvas,
    (r, t) => r.render(g, { phase: still ? 0 : ((t / 1000) / g.motion.duration) % 1, pxScale: grainScale(r.canvas.width, r.canvas.height), seed: 0, mouse: pointer.step() }),
    [g],
    !still && onScreen,
  );

  return (
    <header className={`l-hero ink-${ink} ${h.busy ? 'is-busy' : ''}`} ref={wrap}>
      <canvas ref={canvas} className="l-hero-canvas" aria-hidden />
      {error && <div className="l-hero-fallback" style={{ background: cssBackground(g) }} />}
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
        <p className="l-lede">Describe any sky and Atmos paints it. Shape it by hand, then use it as a wallpaper, in your designs, as a poster or film, or as light on your wall.</p>
      </div>
      <div className="l-hero-ask">
          <form
            className="l-ask"
            onSubmit={(e) => {
              e.preventDefault();
              h.generate(text.trim() || 'Tokyo rain at 2am');
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe any sky…" maxLength={200} aria-label="Describe a sky" readOnly={h.busy} enterKeyHint="go" />
            <button className="l-pill dark" disabled={h.busy}>
              {h.busy ? 'Painting…' : 'Paint it →'}
            </button>
          </form>
          <div className="l-ask-chips">
            {TRY.map((t) => (
              <button
                key={t}
                disabled={h.busy}
                onClick={() => {
                  setText(t);
                  h.generate(t);
                }}
              >
                {t}
              </button>
            ))}
          </div>
          {h.error && <p className="l-ask-error">{h.error}</p>}
          <p className="l-ask-alt">
            {h.sky.source === 'preset' ? (
              <>
                Or{' '}
                <a {...linkTo('/studio')}>open the studio</a> and start from scratch.
              </>
            ) : (
              <>
                Like it?{' '}
                <button onClick={() => openInStudio(g)}>Open this sky in the studio →</button>
              </>
            )}
          </p>
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

/** A share link (/g/<code>) on its own: the gradient exactly as its creator made it, full screen. */
function SharedViewer({ slug }: { slug: string }) {
  const [shared, setShared] = useState<SharedGradient | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    (accountsEnabled ? getShared(slug) : Promise.resolve(null))
      .then((row) => {
        if (!alive) return;
        if (!row) return setMissing(true);
        setShared(row);
        document.title = `${row.name} · Atmos`;
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
      document.title = 'Atmos Studio';
    };
  }, [slug]);
  const g = shared?.gradient;
  const ink = useMemo(() => (g ? inkFor(g) : 'light'), [g]);
  const wrap = useRef<HTMLDivElement>(null);
  return (
    <div className="landing l-viewer">
      <LandingNav bare />
      <div className={`l-hero ink-${ink}`} ref={wrap}>
        {g ? <ViewerCanvas g={g} wrap={wrap} /> : <div className="l-hero-fallback l-viewer-wait" />}
        <div className="l-hero-notes" aria-hidden>
          <span>{g?.place}</span>
          <span>{g?.coords}</span>
        </div>
        <div className="l-hero-body">
          {shared && g ? (
            <SharedIntro shared={shared} g={g} />
          ) : missing ? (
            <>
              <p className="l-eyebrow">That share link has expired or was removed</p>
              <h1 className="l-shared-title">Nothing here.</h1>
              <div className="l-hero-actions">
                <a className="l-pill light big" {...linkTo('/')}>
                  Go to Atmos →
                </a>
              </div>
            </>
          ) : (
            <p className="l-eyebrow l-reading">Opening a shared sky…</p>
          )}
        </div>
        <div className="l-hero-foot">
          <span className="l-hero-caption">{g && `${g.name} · ${g.time}`}</span>
        </div>
      </div>
    </div>
  );
}

function ViewerCanvas({ g, wrap }: { g: Gradient; wrap: React.RefObject<HTMLDivElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = usePointer(wrap);
  const still = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const { error } = useRenderLoop(
    canvas,
    (r, t) => r.render(g, { phase: still ? 0 : ((t / 1000) / g.motion.duration) % 1, pxScale: grainScale(r.canvas.width, r.canvas.height), seed: 0, mouse: pointer.step() }),
    [g],
    !still,
  );
  return (
    <>
      <canvas ref={canvas} className="l-hero-canvas" aria-hidden />
      {error && <div className="l-hero-fallback" style={{ background: cssBackground(g) }} />}
    </>
  );
}

/** Who made it, its colours, and what you can do with it. */
function SharedIntro({ shared, g }: { shared: SharedGradient; g: Gradient }) {
  const session = useAuth((s) => s.session);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(shared.likes);
  useEffect(() => {
    myLikes().then((set) => setLiked(set.has(shared.id)));
  }, [session, shared.id]);
  const like = () =>
    requireAccount(async () => {
      const on = !liked;
      setLiked(on);
      setLikes((n) => n + (on ? 1 : -1));
      try {
        await setLike(shared.id, on);
      } catch {
        setLiked(!on);
        setLikes((n) => n + (on ? -1 : 1));
      }
    });
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      /* clipboard blocked */
    }
  };
  const stops = g.type === 'mesh' ? g.points : [...g.points].sort((a, b) => a.pos - b.pos);
  return (
    <>
      <p className="l-eyebrow">Shared by {shared.author} · {g.place} · {g.time}</p>
      <h1 className="l-shared-title">{shared.name.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}</h1>
      <div className="l-swatches">
        {stops.map((p) => (
          <button key={p.id} className="l-swatch" onClick={() => copy(p.color, p.color)} title={`Copy ${p.color}`}>
            <span style={{ background: p.color }} />
            {copied === p.color ? 'Copied' : p.color}
          </button>
        ))}
      </div>
      <div className="l-hero-actions">
        <button className="l-pill light big" onClick={() => openInStudio(g)}>
          Open in studio →
        </button>
        <button className="l-pill glass big" onClick={() => copy(shareUrl(shared.slug), 'link')}>
          {copied === 'link' ? 'Link copied' : 'Copy link'}
        </button>
        <button className={`l-pill glass big l-like-hero ${liked ? 'on' : ''}`} onClick={like} aria-pressed={liked}>
          {liked ? '♥' : '♡'} {likes}
        </button>
      </div>
    </>
  );
}

/** How it works: three quiet steps, each with a small live picture. */
function HowItWorks() {
  const sky = preset('SKYSPACE');
  const steps: { n: string; title: string; body: string; g: string; art: React.ReactNode }[] = [
    {
      n: '01',
      title: 'Describe',
      body: 'Name a place, a mood or a moment. Claude chooses the colours, the place and the hour.',
      g: 'GLACIER HOUR',
      art: (
        <>
          {/* The place on the left, the sky Atmos drew from it on the right. */}
          <span className="l-how-split" aria-hidden>
            <img src={lencoisPhoto} alt="" loading="lazy" />
            <img src={lencoisPalette} alt="" loading="lazy" />
            <em className="l-how-cap l">THE PLACE</em>
            <em className="l-how-cap r">THE PALETTE</em>
          </span>
          <span className="l-how-ask" aria-hidden>
            <span className="l-how-field">
              <span className="l-how-typed">Lençóis dunes from above</span>
              <b>Paint it →</b>
            </span>
            <span className="l-how-by">
              <i /> BY CLAUDE · LENÇÓIS MARANHENSES · 06:40
            </span>
          </span>
        </>
      ),
    },
    {
      n: '02',
      title: 'Shape',
      body: 'Move the colours, add fog and grain, let it breathe or follow your cursor.',
      g: 'ALPENGLOW',
      art: (
        <>
          <span className="l-how-dots" aria-hidden>
            <i style={{ left: '14%', top: '26%' }} />
            <i style={{ left: '40%', top: '20%' }} />
            <i style={{ left: '26%', top: '70%' }} />
          </span>
          <span className="l-how-panel" aria-hidden>
            {[
              ['FOG', 62],
              ['GRAIN', 34],
              ['MOTION', 78],
            ].map(([k, v]) => (
              <span key={k} className="l-how-slider">
                <em>{k}</em>
                <span>
                  <span style={{ width: `${v}%` }} />
                  <i style={{ left: `${v}%` }} />
                </span>
              </span>
            ))}
          </span>
        </>
      ),
    },
    {
      n: '03',
      title: 'Use it',
      body: 'A phone wallpaper, code for your site, a print, a film, or a light piece for your wall.',
      g: 'MOON RING',
      art: (
        <span className="l-how-uses" aria-hidden>
          <span className="l-how-obj">
            <span className="l-how-phone">
              <Thumb g={sky} w={90} h={190} />
              <span className="l-how-island" />
              <span className="l-how-lock">
                <small>Sunday 21</small>
                9:41
              </span>
              <span className="l-how-home" />
            </span>
            <em>Wallpaper</em>
          </span>
          <span className="l-how-obj">
            <span className="l-how-web">
              <span className="l-how-bar">
                <i />
                <i />
                <i />
              </span>
              <span className="l-how-page">
                <span className="l-how-hero">
                  <Thumb g={sky} w={120} h={50} />
                </span>
                <span className="l-how-line" />
                <span className="l-how-line short" />
                <span className="l-how-btn">
                  <Thumb g={preset('ALPENGLOW')} w={60} h={16} />
                </span>
                <code>{'linear-gradient(…)'}</code>
              </span>
            </span>
            <em>Web · CSS</em>
          </span>
          <span className="l-how-obj">
            <span className="l-how-poster">
              <img src={horizonSample} alt="" loading="lazy" />
              <u />
            </span>
            <em>Print · Film</em>
          </span>
          <span className="l-how-obj">
            <span className="l-how-oval">
              <Thumb g={sky} w={110} h={140} />
            </span>
            <em>LED light</em>
          </span>
        </span>
      ),
    },
  ];
  return (
    <section className="l-how" id="how">
      <div className="l-section-head">
        <h2>How it works.</h2>
        <p>Three steps, no design skills needed.</p>
      </div>
      <ol className="l-how-steps">
        {steps.map((st) => (
          <li key={st.n}>
            <div className="l-how-art">
              <Thumb g={preset(st.g)} w={480} h={300} className="l-how-thumb" />
              {st.art}
            </div>
            <span className="l-how-n">{st.n}</span>
            <h3>{st.title}</h3>
            <p>{st.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const PAGE = 24;

/** The community wall: a few on the home page, everything (a page at a time) on /community. */
function CommunityWall({ limit = PAGE, full = false }: { limit?: number; full?: boolean }) {
  const session = useAuth((s) => s.session);
  const [sort, setSort] = useState<Sort>('new');
  const [items, setItems] = useState<SharedGradient[] | null>(null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    if (!accountsEnabled) return;
    setError(null);
    try {
      const rows = await listCommunity(sort, limit + 1);
      setMore(rows.length > limit);
      setItems(rows.slice(0, limit));
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }, [sort, limit]);

  const loadMore = async () => {
    if (!items || loadingMore) return;
    setLoadingMore(true);
    try {
      const rows = await listCommunity(sort, PAGE + 1, items.length);
      setMore(rows.length > PAGE);
      setItems([...items, ...rows.slice(0, PAGE)]);
    } catch {
      /* keep what we have */
    } finally {
      setLoadingMore(false);
    }
  };

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
    <section className={`l-community ${full ? 'full' : ''}`} id="community">
      <div className="l-section-head row">
        <div>
          {full ? <h1>Community skies.</h1> : <h2>From the community.</h2>}
          <p>{accountsEnabled ? 'Gradients people made and shared. Tap one to see it full size, then remix it in the studio.' : 'Featured skies. Sharing opens when accounts are switched on.'}</p>
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
              <button className="l-card-art" onClick={() => navigate(`/g/${it.slug}`)} aria-label={`Open ${it.name}`}>
                <Thumb g={it.gradient} w={300} h={360} />
                <span className="l-card-open">View →</span>
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
        {full ? (
          more && (
            <button className="l-pill ghost" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )
        ) : (
          accountsEnabled &&
          items &&
          items.length > 0 && (
            <a className="l-pill ghost" {...linkTo('/community')}>
              See all community skies →
            </a>
          )
        )}
        <a className="l-pill dark" {...linkTo('/studio')}>
          Make one and share it →
        </a>
      </div>
    </section>
  );
}

/** /community: every shared sky, newest or most liked, a page at a time. */
export function CommunityPage() {
  useEffect(() => {
    document.title = 'Community · Atmos';
    return () => {
      document.title = 'Atmos — gradients drawn from the sky';
    };
  }, []);
  return (
    <div className="landing">
      <LandingNav />
      <CommunityWall full />
      <SiteFooter />
    </div>
  );
}

/** The footer on every public page. */
export function SiteFooter() {
  return (
    <footer className="l-foot">
      <span>ATMOS [ STUDIO ]</span>
      <span className="l-foot-links">
        <a {...linkTo('/community')}>COMMUNITY</a>
        <a {...linkTo('/led')}>ATMOS [ LAB ]</a>
        <a {...linkTo('/privacy')}>PRIVACY</a>
      </span>
    </footer>
  );
}

/** Any address we don't know: a quiet sky and a way back. */
export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Not found · Atmos';
    return () => {
      document.title = 'Atmos — gradients drawn from the sky';
    };
  }, []);
  return (
    <div className="landing">
      <LandingNav />
      <section className="l-404">
        <Thumb g={preset('MOON RING')} w={1200} h={700} className="l-404-art" priority />
        <div className="l-404-body">
          <p className="l-eyebrow">404 · Somewhere past the horizon</p>
          <h1>This sky drifted off.</h1>
          <p>The page you’re looking for isn’t here. It may have moved, or the link was mistyped.</p>
          <div className="l-hero-actions">
            <a className="l-pill light big" {...linkTo('/')}>
              Back home →
            </a>
            <a className="l-pill glass big" {...linkTo('/community')}>
              Browse the community
            </a>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}

/** A plain-language privacy note. */
export function PrivacyPage() {
  useEffect(() => {
    document.title = 'Privacy · Atmos';
    return () => {
      document.title = 'Atmos — gradients drawn from the sky';
    };
  }, []);
  return (
    <div className="landing">
      <LandingNav />
      <article className="l-doc">
        <p className="l-eyebrow">Privacy</p>
        <h1>What Atmos keeps, and why.</h1>
        <p className="l-doc-lede">Short version: only what’s needed to run your account and the community. No ads, no selling data, no tracking cookies.</p>
        <h2>Your account</h2>
        <p>When you sign up we store your email address, your display name and a securely hashed password with our database provider, Supabase. We use your email only to sign you in and to send account emails like password resets.</p>
        <h2>What you share</h2>
        <p>Gradients you share, their preview images and your likes are stored so they can appear on your share link and, if you choose, on the community page. Link-only shares aren’t listed publicly, but anyone with the link can open them.</p>
        <h2>Describing a sky</h2>
        <p>When you use “Describe a sky”, the text you type is sent to Anthropic’s Claude to create the gradient. We don’t store what you type.</p>
        <h2>On your device</h2>
        <p>Your current sky, saved projects, Lab settings and uploaded photos stay in your browser’s own storage. They aren’t uploaded unless you share something.</p>
        <h2>Analytics</h2>
        <p>We use Vercel Web Analytics to count page visits. It uses no cookies and doesn’t identify you personally.</p>
        <h2>Your choices</h2>
        <p>You can delete anything you’ve shared, and you can ask us to delete your account and everything linked to it at any time.</p>
        <p className="l-doc-date">Last updated {new Date(2026, 8, 27).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </article>
      <SiteFooter />
    </div>
  );
}
