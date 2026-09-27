// Landing page: a live sky, what Atmos does, the community wall, and a way in.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALL_PRESETS } from '../data/collections';
import { useRenderLoop, usePointer } from '../components/Canvas';
import { Thumb } from '../components/Thumb';
import { luminance } from '../lib/color';
import { cloneGradient } from '../lib/gradient';
import { encodeGradient } from '../lib/share';
import { generateFromText } from '../lib/textGradient';
import { accountsEnabled, displayName, getShared, listCommunity, myLikes, requireAccount, setLike, shareUrl, signOut, useAuth, type SharedGradient, type Sort } from '../lib/supabase';
import { grainScale, renderPixels } from '../render/renderer';
import { linkTo, navigate } from '../router';
import type { Gradient } from '../types';
import horizonSample from './horizon-sample.webp';
import { LedPiece } from '../led/LedLab';
import './landing.css';

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

const TRY = ['Tokyo rain at 2am', 'Iceland glacier at first light', 'Lavender field in a heat haze', 'Deep sea bioluminescence'];

export function openInStudio(g: Gradient) {
  navigate(`/studio#g=${encodeGradient(g)}`);
}

export default function Landing({ slug }: { slug?: string }) {
  if (slug) return <SharedViewer slug={slug} />;
  return <Home />;
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
            <a href="#features">Features</a>
            <a href="#community">Community</a>
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
        <a className="l-pill dark" {...linkTo('/studio')}>
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
      <TryStrip sky={sky} />
      <Features />
      <LabSection g={sky.sky.g} />
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
        <a {...linkTo('/led')} className="l-foot-link">
          ATMOS [ LAB ] · LED LIGHT PIECES
        </a>
        <span>MADE WITH WEBGL, OKLAB AND CLAUDE</span>
      </footer>
    </div>
  );
}

/** The LED Lab: your sky as a real light piece on the wall. */
function LabSection({ g: heroSky }: { g: Gradient }) {
  // The hero pushes apertures and halos aside to make room for the headline; a light piece wants them centred.
  const g = useMemo(() => (heroSky.type === 'aperture' || heroSky.type === 'halo' ? { ...heroSky, center: { x: 0.5, y: 0.5 } } : heroSky), [heroSky]);
  return (
    <section className="l-lab" id="lab">
      <div className="l-lab-card">
        <div className="l-lab-art">
          <LedPiece g={g} className="l-lab-canvas" />
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
      {error && <div className="l-hero-fallback" />}
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

function TryStrip({ sky }: { sky: Sky }) {
  const [text, setText] = useState('');
  return (
    <section className="l-try">
      <form
        className="l-try-box"
        onSubmit={(e) => {
          e.preventDefault();
          sky.generate(text);
        }}
      >
        <span className="l-try-label">Describe a sky</span>
        <span className="l-exp" title="Generated by Claude. Experimental.">
          <span className="exp-dot" />
          Experimental
        </span>
        <input id="landing-describe" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tokyo rain at 2am, neon on wet asphalt" maxLength={200} aria-label="Describe a sky" readOnly={sky.busy} enterKeyHint="go" />
        <button className="l-pill dark" disabled={!text.trim() || sky.busy}>
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
      <p className="l-try-hint">Claude paints it right onto the sky above. Like it? Press “Open this sky”.</p>
    </section>
  );
}

const FEATURES: { title: string; body: string; g: string; tag: string; wide?: boolean; img?: string }[] = [
  { tag: 'AI', title: 'Say it, see it', body: 'Type “moss after a storm” and Claude picks the colours, the place and the hour.', g: 'WET CANOPY', wide: true },
  { tag: 'EDIT', title: 'Shape it by hand', body: 'Drag colour points, add fog, grain and dither, make it move or follow the cursor.', g: 'QUADRANT NEBULA' },
  { tag: 'UI', title: 'See it on real screens', body: 'Paint buttons, cards and headers, check contrast, copy the code.', g: 'CORONA' },
  { tag: 'PRINT', title: 'Posters at 300 DPI', body: 'Field-note typography, bone or ink paper, ready for the print shop.', g: 'RED MESA' },
  { tag: 'FILM', title: 'Photos into horizons', body: 'Scan any photo line by line into a slow moving film. Save stills or MP4.', g: 'TIDE LINE', img: horizonSample },
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
            {f.img ? (
              <img src={f.img} alt="A photo scanned into horizontal bands of sea, sand and sky" className="l-tile-art l-tile-img" loading="lazy" />
            ) : (
              <Thumb g={preset(f.g)} w={f.wide ? 640 : 320} h={320} className="l-tile-art" />
            )}
            <div className="l-tile-text">
              <span className="l-tag">{f.tag}</span>
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
        <a className="l-pill dark" {...linkTo('/studio')}>
          Make one and share it →
        </a>
      </div>
    </section>
  );
}
