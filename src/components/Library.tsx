// Left panel: collections, Live Sky, Photo → Place, saved projects.
import { useMemo, useState } from 'react';
import { COLLECTIONS, ALL_PRESETS } from '../data/collections';
import { hexToOklch } from '../lib/color';
import { useStore, type LeftTab } from '../store';
import type { Gradient } from '../types';
import { LiveSky } from './LiveSky';
import { PhotoPanel } from './PhotoPanel';
import { SavedPanel } from './SavedPanel';
import { Thumb } from './Thumb';

const TABS: { id: LeftTab; label: string }[] = [
  { id: 'library', label: 'LIBRARY' },
  { id: 'sky', label: 'LIVE SKY' },
  { id: 'photo', label: 'PHOTO' },
  { id: 'saved', label: 'SAVED' },
];

type Tone = 'all' | 'light' | 'dark' | 'warm' | 'cool' | 'green' | 'violet';
const TONES: Tone[] = ['all', 'light', 'dark', 'warm', 'cool', 'green', 'violet'];

function toneOf(g: Gradient): Set<Tone> {
  const out = new Set<Tone>(['all']);
  const lch = g.points.map((p) => hexToOklch(p.color));
  const L = lch.reduce((a, c) => a + c[0], 0) / lch.length;
  if (L > 0.8) out.add('light');
  if (L < 0.42) out.add('dark');
  for (const [, C, H] of lch) {
    if (C < 0.04) continue;
    if (H < 95 || H > 345) out.add('warm');
    else if (H < 175) out.add('green');
    else if (H < 275) out.add('cool');
    else out.add('violet');
  }
  return out;
}

export function Library() {
  const tab = useStore((s) => s.leftTab);
  return (
    <div className="library">
      <nav className="tabs small">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => useStore.getState().setLeftTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="library-body">
        {tab === 'library' && <Collections />}
        {tab === 'sky' && <LiveSky />}
        {tab === 'photo' && <PhotoPanel />}
        {tab === 'saved' && <SavedPanel />}
      </div>
    </div>
  );
}

function Collections() {
  const favourites = useStore((s) => s.favourites);
  const [coll, setColl] = useState<string>('all');
  const [tone, setTone] = useState<Tone>('all');
  const tones = useMemo(() => new Map(ALL_PRESETS.map((g) => [g.id, toneOf(g)])), []);

  const groups =
    coll === 'favourites'
      ? [{ id: 'favourites', title: 'FAVOURITES', blurb: 'Your starred field notes.', gradients: ALL_PRESETS.filter((g) => favourites.includes(g.id)) }]
      : COLLECTIONS.filter((c) => coll === 'all' || c.id === coll);

  return (
    <>
      <div className="filters">
        <select value={coll} onChange={(e) => setColl(e.target.value)} aria-label="Collection">
          <option value="all">ALL COLLECTIONS · {ALL_PRESETS.length}</option>
          <option value="favourites">♥ FAVOURITES · {favourites.length}</option>
          {COLLECTIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {c.gradients.length}
            </option>
          ))}
        </select>
        <div className="chips">
          {TONES.map((t) => (
            <button key={t} className={`chip ${tone === t ? 'on' : ''}`} onClick={() => setTone(t)}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {groups.map((c) => {
        const items = c.gradients.filter((g) => tones.get(g.id)?.has(tone));
        if (!items.length) return coll === 'favourites' ? <p key="empty" className="hint pad">Tap ♡ on any gradient to keep it here.</p> : null;
        return (
          <div key={c.id} className="collection">
            <div className="collection-head">
              <span>{c.title}</span>
              <span className="muted">{items.length}</span>
            </div>
            <p className="collection-blurb">{c.blurb}</p>
            <div className="grid">
              {items.map((g) => (
                <PresetCard key={g.id} g={g} fav={favourites.includes(g.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function PresetCard({ g, fav }: { g: Gradient; fav: boolean }) {
  const current = useStore((s) => s.gradient.name === g.name && s.gradient.place === g.place);
  return (
    <div className={`card ${current ? 'current' : ''}`}>
      <button className="card-hit" onClick={() => useStore.getState().load(g)} title={`${g.name} · ${g.place} · ${g.time}`}>
        <Thumb g={g} />
        <span className="card-name">{g.name}</span>
        <span className="card-place">
          {g.place} · {g.time}
        </span>
      </button>
      <button className={`fav ${fav ? 'on' : ''}`} onClick={() => useStore.getState().toggleFavourite(g.id)} aria-label={fav ? 'Remove favourite' : 'Add favourite'} aria-pressed={fav}>
        {fav ? '♥' : '♡'}
      </button>
    </div>
  );
}
