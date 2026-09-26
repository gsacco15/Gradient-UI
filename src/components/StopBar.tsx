// Stop bar under the canvas: drag stops, click to add, drag off the bar to delete.
import { useEffect, useRef } from 'react';
import { mixHex } from '../lib/color';
import { expandStops } from '../lib/exportCode';
import { MAX_POINTS, sortedStops, uid } from '../lib/gradient';
import { useStore } from '../store';

export function StopBar() {
  const g = useStore((s) => s.gradient);
  const selected = useStore((s) => s.selected);
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; removing: boolean } | null>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || !barRef.current) return;
      const r = barRef.current.getBoundingClientRect();
      const pos = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const away = Math.abs(e.clientY - (r.top + r.height / 2)) > 48;
      d.removing = away && useStore.getState().gradient.points.length > 2;
      barRef.current.classList.toggle('removing', d.removing);
      useStore.getState().update((gr) => {
        const p = gr.points.find((q) => q.id === d.id);
        if (p) p.pos = pos;
      }, false);
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      barRef.current?.classList.remove('removing');
      if (d?.removing) {
        useStore.getState().update((gr) => {
          gr.points = gr.points.filter((q) => q.id !== d.id);
        }, false);
        useStore.getState().select(null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  const addAt = (e: React.MouseEvent) => {
    if (e.target !== barRef.current) return;
    const s = useStore.getState();
    if (s.gradient.points.length >= MAX_POINTS) return s.notify(`MAX ${MAX_POINTS} COLOURS`);
    const r = barRef.current!.getBoundingClientRect();
    const pos = (e.clientX - r.left) / r.width;
    const stops = sortedStops(s.gradient);
    const after = stops.findIndex((p) => p.pos >= pos);
    const a = stops[Math.max(0, after - 1)] ?? stops[0];
    const b = stops[after] ?? stops[stops.length - 1];
    const t = b.pos > a.pos ? (pos - a.pos) / (b.pos - a.pos) : 0;
    const id = uid('pt');
    s.update((gr) => gr.points.push({ id, color: mixHex(a.color, b.color, Math.min(1, Math.max(0, t))), pos, x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6, size: 0.35 }));
    s.select(id);
  };

  const bg = `linear-gradient(90deg, ${expandStops(g, 3).map((s) => `${s.color} ${s.pos * 100}%`).join(', ')})`;

  return (
    <div className="stopbar-wrap">
      <div className="stopbar" ref={barRef} style={{ background: bg }} onClick={addAt} title="Click to add a colour · drag a stop off the bar to remove it">
        {g.points.map((p) => (
          <button
            key={p.id}
            className={`stop ${selected === p.id ? 'sel' : ''}`}
            style={{ left: `${p.pos * 100}%`, background: p.color }}
            onPointerDown={(e) => {
              e.preventDefault();
              useStore.getState().checkpoint();
              useStore.getState().select(p.id);
              drag.current = { id: p.id, removing: false };
            }}
            aria-label={`Stop ${p.color} at ${Math.round(p.pos * 100)}%`}
          />
        ))}
      </div>
    </div>
  );
}
