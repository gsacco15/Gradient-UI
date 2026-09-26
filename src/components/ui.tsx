// Small, restrained controls in the Atmos style.
import { useState, type ReactNode } from 'react';
import { useStore } from '../store';

export function Section({ title, children, right, defaultOpen = true }: { title: string; children: ReactNode; right?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section">
      <header className="section-head">
        <button className="section-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="caret">{open ? '−' : '+'}</span> {title}
        </button>
        {right}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
}

/** A slider that records a single undo step per drag. */
export function Slider({ label, value, min = 0, max = 1, step = 0.01, onChange, format, hint }: SliderProps) {
  const fmt = format ?? ((v: number) => (max <= 1 ? `${Math.round(v * 100)}` : `${Math.round(v)}`));
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider" title={hint}>
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${pct}%` } as React.CSSProperties}
        onPointerDown={() => useStore.getState().checkpoint()}
        onKeyDown={() => useStore.getState().checkpoint()}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="slider-value">{fmt(value)}</span>
    </label>
  );
}

export function Seg<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={o} role="radio" aria-checked={o === value} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>
          {labels?.[o] ?? o.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}
