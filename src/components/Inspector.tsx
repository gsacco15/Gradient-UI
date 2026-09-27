// Right panel for the gradient editor.
import { nameForColor } from '../data/names';
import { normalizeHex } from '../lib/color';
import { MAX_POINTS, uid } from '../lib/gradient';
import { selectedPoint, useStore } from '../store';
import type { FrameShape, Gradient, GradientType, InteractMode, MotionMode, Symmetry, Weather } from '../types';
import { Field, Section, Seg, Slider } from './ui';

const TYPES: GradientType[] = ['linear', 'radial', 'conic', 'mesh', 'frame', 'aperture', 'bands', 'halo'];

const TYPE_HINTS: Partial<Record<GradientType, string>> = {
  aperture: 'One window of light in a wall, like a James Turrell piece. Colours run wall → edge → inner light.',
  bands: 'Stacked fields of colour with soft seams, like a horizon or a Rothko. Colours run in band order.',
  halo: 'A ring of light with a corona, like an eclipse. Colours run sky → ring.',
};
const SYMS: Symmetry[] = ['none', 'mirror', 'quadrant', 'kaleido'];
const SHAPES: FrameShape[] = ['square', 'circle', 'arch'];
const MODES: MotionMode[] = ['none', 'drift', 'rotate', 'pulse', 'flow'];
const REACTS: InteractMode[] = ['none', 'follow', 'repel', 'lens'];

const WEATHER: { key: keyof Weather; label: string; hint: string }[] = [
  { key: 'fog', label: 'FOG', hint: 'Soft atmospheric blur' },
  { key: 'haze', label: 'HAZE', hint: 'Film grain' },
  { key: 'frost', label: 'FROST', hint: 'Ordered dither' },
  { key: 'clouds', label: 'CLOUDS', hint: 'Soft noise warp' },
  { key: 'heat', label: 'HEAT', hint: 'Shimmer distortion' },
  { key: 'pixel', label: 'PIXEL', hint: 'Pixelate into blocks' },
  { key: 'dusk', label: 'DUSK', hint: 'Vignette' },
];

export function Inspector() {
  const g = useStore((s) => s.gradient);
  const update = useStore((s) => s.update);
  const sel = useStore(selectedPoint);
  const playing = useStore((s) => s.playing);

  return (
    <div className="inspector">
      <div className="insp-title">
        <input
          className="name-input"
          value={g.name}
          onFocus={() => useStore.getState().checkpoint()}
          onChange={(e) => update((d) => void (d.name = e.target.value.toUpperCase()), false)}
          aria-label="Gradient name"
        />
        <div className="insp-meta">
          <input value={g.place} onFocus={() => useStore.getState().checkpoint()} onChange={(e) => update((d) => void (d.place = e.target.value.toUpperCase()), false)} aria-label="Place" />
          <span>·</span>
          <input className="time-input" value={g.time} onFocus={() => useStore.getState().checkpoint()} onChange={(e) => update((d) => void (d.time = e.target.value), false)} aria-label="Time" />
        </div>
      </div>

      <Section title="TYPE">
        <Seg
          options={TYPES}
          value={g.type}
          onChange={(t) =>
            update((d) => {
              d.type = t;
              // A single aperture or halo is the point; mirrored copies would hide it.
              if (t === 'aperture' || t === 'halo') d.composition.symmetry = 'none';
              if (t === 'bands' && d.composition.count < 2) d.composition.count = 3;
            })
          }
        />
        {TYPE_HINTS[g.type] && <p className="hint">{TYPE_HINTS[g.type]}</p>}
        {(g.type === 'linear' || g.type === 'conic' || g.type === 'bands') && (
          <Slider label="ANGLE" value={g.angle} min={0} max={360} step={1} format={(v) => `${Math.round(v)}°`} onChange={(v) => update((d) => void (d.angle = v), false)} />
        )}
        {(g.type === 'radial' || g.type === 'conic' || g.type === 'frame' || g.type === 'aperture' || g.type === 'halo') && (
          <>
            <Slider label="CENTRE X" value={g.center.x} min={-0.2} max={1.2} onChange={(v) => update((d) => void (d.center.x = v), false)} format={(v) => `${Math.round(v * 100)}`} />
            <Slider label="CENTRE Y" value={g.center.y} min={-0.2} max={1.2} onChange={(v) => update((d) => void (d.center.y = v), false)} format={(v) => `${Math.round(v * 100)}`} />
          </>
        )}
        {g.type === 'mesh' && <p className="hint">Drag colour points on the canvas. Scroll a point to resize it.</p>}
      </Section>

      <Section
        title={`COLOURS · ${g.points.length}`}
        right={
          <button
            className="mini"
            disabled={g.points.length >= MAX_POINTS}
            onClick={() => {
              const last = g.points[g.points.length - 1];
              const id = uid('pt');
              update((d) => d.points.push({ ...last, id, locked: false, pos: Math.min(1, last.pos + 0.1), x: 0.3 + Math.random() * 0.4, y: 0.3 + Math.random() * 0.4 }));
              useStore.getState().select(id);
            }}
          >
            + ADD
          </button>
        }
      >
        <ul className="colour-list">
          {g.points.map((p) => (
            <li key={p.id} className={sel?.id === p.id ? 'sel' : ''} onClick={() => useStore.getState().select(p.id)}>
              <label className="swatch" style={{ background: p.color }} title="Pick colour">
                <input
                  type="color"
                  value={p.color.toLowerCase()}
                  onFocus={() => useStore.getState().checkpoint()}
                  onChange={(e) => update((d) => { const q = d.points.find((x) => x.id === p.id); if (q) q.color = e.target.value.toUpperCase(); }, false)}
                />
              </label>
              <div className="colour-text">
                <span className="colour-name">{nameForColor(p.color)}</span>
                <HexInput value={p.color} onCommit={(hex) => update((d) => { const q = d.points.find((x) => x.id === p.id); if (q) q.color = hex; })} />
              </div>
              <button
                className={`icon ${p.locked ? 'on' : ''}`}
                title={p.locked ? 'Unlock (shuffle will change it)' : 'Lock (shuffle keeps it)'}
                aria-pressed={!!p.locked}
                onClick={(e) => { e.stopPropagation(); update((d) => { const q = d.points.find((x) => x.id === p.id); if (q) q.locked = !q.locked; }); }}
              >
                {p.locked ? '■' : '□'}
              </button>
              <button
                className="icon"
                title="Remove colour"
                disabled={g.points.length <= 2}
                onClick={(e) => { e.stopPropagation(); update((d) => void (d.points = d.points.filter((x) => x.id !== p.id))); }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {sel && (
          <div className="sel-controls">
            <Slider label="POSITION" value={sel.pos} onChange={(v) => update((d) => { const q = d.points.find((x) => x.id === sel.id); if (q) q.pos = v; }, false)} />
            {g.type === 'mesh' && (
              <Slider label="SPREAD" value={sel.size} min={0.05} max={1} onChange={(v) => update((d) => { const q = d.points.find((x) => x.id === sel.id); if (q) q.size = v; }, false)} />
            )}
          </div>
        )}
        {g.type === 'mesh' && (
          <Field label="BASE">
            <label className="swatch small" style={{ background: g.background }}>
              <input type="color" value={g.background.toLowerCase()} onFocus={() => useStore.getState().checkpoint()} onChange={(e) => update((d) => void (d.background = e.target.value.toUpperCase()), false)} />
            </label>
            <span className="muted">{g.background}</span>
          </Field>
        )}
      </Section>

      <Section title="COMPOSITION">
        <Field label="SYMMETRY">
          <Seg options={SYMS} value={g.composition.symmetry} onChange={(v) => update((d) => void (d.composition.symmetry = v))} />
        </Field>
        {g.composition.symmetry !== 'none' && (g.type === 'frame' || g.type === 'aperture' || g.type === 'halo') && (
          <p className="hint">
            Symmetry is repeating this into copies.{' '}
            <button className="link" onClick={() => update((d) => void (d.composition.symmetry = 'none'))}>
              Show a single one
            </button>
          </p>
        )}
        {g.composition.symmetry === 'kaleido' && (
          <Slider label="SLICES" value={g.composition.slices} min={2} max={16} step={1} onChange={(v) => update((d) => void (d.composition.slices = v), false)} />
        )}
        {g.type === 'frame' && (
          <>
            <Field label="SHAPE">
              <Seg options={SHAPES} value={g.composition.shape} onChange={(v) => update((d) => void (d.composition.shape = v))} />
            </Field>
            <Slider label="BANDS" value={g.composition.count} min={1} max={10} step={1} onChange={(v) => update((d) => void (d.composition.count = v), false)} />
            <Slider label="SOFTNESS" value={g.composition.softness} onChange={(v) => update((d) => void (d.composition.softness = v), false)} />
          </>
        )}
        {g.type === 'aperture' && (
          <>
            <Field label="SHAPE">
              <Seg options={SHAPES} value={g.composition.shape} onChange={(v) => update((d) => void (d.composition.shape = v))} />
            </Field>
            <Slider label="SIZE" value={g.composition.size} min={0.1} max={1.2} onChange={(v) => update((d) => void (d.composition.size = v), false)} format={(v) => `${Math.round(v * 100)}`} />
            <ProportionSlider g={g} update={update} />
            <Slider label="EDGE" hint="How soft the aperture's edge is" value={g.composition.softness} onChange={(v) => update((d) => void (d.composition.softness = v), false)} />
            <Slider label="WALL GLOW" hint="Light spilling onto the wall around it" value={g.composition.glow} onChange={(v) => update((d) => void (d.composition.glow = v), false)} />
          </>
        )}
        {g.type === 'bands' && (
          <>
            <Slider label="BANDS" value={g.composition.count} min={2} max={8} step={1} onChange={(v) => update((d) => void (d.composition.count = v), false)} />
            <Slider label="SEAMS" hint="Soft, painterly edges between bands" value={g.composition.softness} onChange={(v) => update((d) => void (d.composition.softness = v), false)} />
          </>
        )}
        {g.type === 'halo' && (
          <>
            <Slider label="SIZE" value={g.composition.size} min={0.1} max={1.2} onChange={(v) => update((d) => void (d.composition.size = v), false)} format={(v) => `${Math.round(v * 100)}`} />
            <ProportionSlider g={g} update={update} />
            <Slider label="RING" hint="Ring thickness" value={g.composition.softness} onChange={(v) => update((d) => void (d.composition.softness = v), false)} />
            <Slider label="CORONA" hint="Glow outside the ring" value={g.composition.glow} onChange={(v) => update((d) => void (d.composition.glow = v), false)} />
          </>
        )}
        <Slider label="ROTATE" value={g.composition.rotation} min={-180} max={180} step={1} format={(v) => `${Math.round(v)}°`} onChange={(v) => update((d) => void (d.composition.rotation = v), false)} />
      </Section>

      <Section title="WEATHER LAYERS">
        {WEATHER.map((w) => (
          <Slider key={w.key} label={w.label} hint={w.hint} value={g.weather[w.key]} onChange={(v) => update((d) => void (d.weather[w.key] = v), false)} />
        ))}
      </Section>

      <Section
        title="MOTION"
        right={
          g.motion.mode !== 'none' ? (
            <button className="mini" onClick={() => useStore.getState().set({ playing: !playing })}>
              {playing ? 'PAUSE' : 'PLAY'}
            </button>
          ) : undefined
        }
      >
        <Seg options={MODES} value={g.motion.mode} onChange={(v) => update((d) => void (d.motion.mode = v))} />
        {g.motion.mode !== 'none' && (
          <>
            {g.motion.mode !== 'rotate' && <Slider label="AMOUNT" value={g.motion.speed} onChange={(v) => update((d) => void (d.motion.speed = v), false)} />}
            <Slider label="LOOP" value={g.motion.duration} min={2} max={30} step={1} format={(v) => `${v}S`} onChange={(v) => update((d) => void (d.motion.duration = v), false)} />
            <p className="hint">Loops are seamless — export as video from EXPORT.</p>
          </>
        )}
      </Section>

      <Section title="CURSOR">
        <Seg options={REACTS} value={g.interact.mode} onChange={(v) => update((d) => void (d.interact.mode = v))} />
        {g.interact.mode !== 'none' ? (
          <>
            <Slider label="STRENGTH" value={g.interact.strength} onChange={(v) => update((d) => void (d.interact.strength = v), false)} />
            <p className="hint">Move your mouse over the canvas. Export → CODE → EMBED gives you a live snippet for your own site.</p>
          </>
        ) : (
          <p className="hint">Make the gradient react to the mouse — colours follow it, flee it, or swell under it.</p>
        )}
      </Section>
    </div>
  );
}

function HexInput({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  return (
    <input
      key={value}
      className="hex-input"
      defaultValue={value}
      spellCheck={false}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const h = normalizeHex(e.target.value);
        if (h && h !== value) onCommit(h);
        else e.target.value = value;
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Hex colour"
    />
  );
}

/**
 * Shape of an aperture or halo, on a log scale so tall and wide feel even.
 * 1:1 is a true circle or square on any canvas, poster or LED frame.
 */
function ProportionSlider({ g, update }: { g: Gradient; update: (fn: (d: Gradient) => void, history?: boolean) => void }) {
  // Slider right = taller, left = wider. ratio stays width ÷ height underneath.
  const v = -Math.log2(g.composition.ratio ?? 1);
  const fmt = (x: number) => {
    if (Math.abs(x) < 0.02) return '1:1';
    const k = 2 ** Math.abs(x);
    return x > 0 ? `TALL ${k.toFixed(1)}×` : `WIDE ${k.toFixed(1)}×`;
  };
  return (
    <Slider
      label="PROPORTION"
      hint="1:1 is a true circle or square everywhere. Slide right for taller, left for wider."
      value={v}
      min={-1.5}
      max={1.5}
      step={0.01}
      format={fmt}
      onChange={(x) => update((d) => void (d.composition.ratio = Math.abs(x) < 0.06 ? 1 : 2 ** -x), false)}
    />
  );
}
