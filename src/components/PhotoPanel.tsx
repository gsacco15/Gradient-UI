// Photo → Place: drop a photo, get a named palette and gradient combinations.
import { useMemo, useRef, useState } from 'react';
import { nameForColor } from '../data/names';
import { makeGradient } from '../lib/gradient';
import { byLightness, extractPalette, readImageFile } from '../lib/palette';
import { useStore } from '../store';
import type { Gradient } from '../types';
import { Thumb } from './Thumb';

type Seed = Omit<Parameters<typeof makeGradient>[0], 'place' | 'time'>;

export function combinations(colors: string[], place: string, time: string): Gradient[] {
  if (colors.length < 2) return [];
  const light = byLightness(colors);
  const last = light[light.length - 1];
  const mk = (seed: Seed) => makeGradient({ ...seed, place, time });
  return [
    mk({ name: nameForColor(light[0]), type: 'linear', angle: 180, colors: light, weather: { haze: 0.2 } }),
    mk({ name: nameForColor(colors[0]), type: 'mesh', colors, background: colors[0], weather: { fog: 0.3, haze: 0.25 } }),
    mk({ name: nameForColor(light[Math.floor(light.length / 2)]), type: 'frame', colors: [light[0], colors[0], colors[1]], composition: { count: 3, softness: 0.9 }, weather: { fog: 0.45, haze: 0.35 } }),
    mk({ name: nameForColor(colors[1]), type: 'radial', colors: [colors[1], colors[0]], center: { x: 0.5, y: 0.8 }, weather: { haze: 0.3 } }),
    mk({ name: nameForColor(last), type: 'linear', angle: 0, colors: [last, light[0]], weather: { frost: 0.35 } }),
    mk({ name: nameForColor(colors[1]), type: 'frame', colors: [light[0], colors[1], last], composition: { symmetry: 'quadrant', count: 2, softness: 0.95 }, weather: { fog: 0.5, haze: 0.45 } }),
  ];
}

export function PhotoPanel() {
  const [photo, setPhoto] = useState<{ url: string; name: string; colors: string[]; img: HTMLImageElement; w: number; h: number } | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handle = async (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      const r = await readImageFile(file);
      setPhoto({ url: r.url, name: file.name, colors: extractPalette(r.sample, 6), img: r.img, w: r.width, h: r.height });
    } catch (e) {
      useStore.getState().notify((e as Error).message.toUpperCase());
    } finally {
      setBusy(false);
    }
  };

  const time = useMemo(() => new Date().toTimeString().slice(0, 5), []);
  const combos = useMemo(() => (photo ? combinations(photo.colors, 'YOUR PHOTO', time) : []), [photo, time]);

  const toHorizon = () => {
    if (!photo) return;
    useStore.getState().setHorizon({ image: photo.url, imageName: photo.name, width: photo.w, height: photo.h, pos: 0, playing: true });
    useStore.getState().setView('horizon');
  };

  return (
    <div className="pad stack">
      <div
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
      >
        {photo ? <img src={photo.url} alt="" /> : <span>{busy ? 'READING…' : 'DROP A PHOTO\nOR CLICK TO CHOOSE'}</span>}
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files?.[0])} />
      </div>
      {photo && (
        <>
          <div className="palette">
            {photo.colors.map((c) => (
              <div key={c} className="pal-row">
                <span className="pal-swatch" style={{ background: c }} />
                <span className="pal-name">{nameForColor(c)}</span>
                <span className="muted">{c}</span>
              </div>
            ))}
          </div>
          <div className="collection-head">
            <span>COMBINATIONS FROM THIS PHOTO</span>
          </div>
          <div className="grid">
            {combos.map((g) => (
              <button key={g.id} className="card card-hit" onClick={() => useStore.getState().load(g)}>
                <Thumb g={g} />
                <span className="card-name">{g.name}</span>
                <span className="card-place">{g.type.toUpperCase()}</span>
              </button>
            ))}
          </div>
          <button className="btn" onClick={toHorizon}>
            SCAN INTO A HORIZON FILM →
          </button>
        </>
      )}
    </div>
  );
}
