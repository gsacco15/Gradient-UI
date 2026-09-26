// Live Sky: the gradient of the real sky right now (or any minute of today).
import { useEffect, useMemo, useState } from 'react';
import { download } from '../lib/exportCode';
import { formatCoords, guessLocation, skyGradient, solarElevation } from '../lib/sky';
import { canEncode, exportVideo } from '../lib/video';
import { useStore } from '../store';
import { Thumb } from './Thumb';

const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

function dateAt(minutes: number): Date {
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), Math.round(minutes % 60), 0, 0);
  return d;
}

export function LiveSky() {
  const [loc, setLoc] = useState(guessLocation);
  const [label, setLabel] = useState('YOUR SKY · APPROX');
  const [minutes, setMinutes] = useState(minutesNow);
  const [live, setLive] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setMinutes(minutesNow()), 30000);
    return () => clearInterval(t);
  }, [live]);

  const g = useMemo(() => skyGradient(dateAt(minutes), loc.lat, loc.lon, label), [minutes, loc, label]);
  const elevation = solarElevation(dateAt(minutes), loc.lat, loc.lon);

  const locate = () => {
    if (!navigator.geolocation) return useStore.getState().notify('LOCATION UNAVAILABLE');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lon: p.coords.longitude });
        setLabel('YOUR SKY');
      },
      () => useStore.getState().notify('LOCATION DENIED — USING TIME ZONE'),
      { timeout: 8000 },
    );
  };

  const exportDay = async () => {
    const fps = 30, seconds = 20, frames = fps * seconds;
    setProgress(0);
    try {
      const format = canEncode() ? 'mp4' : 'webm';
      const blob = await exportVideo({
        format,
        width: 1080,
        height: 1920,
        fps,
        frames,
        onProgress: setProgress,
        draw: (r, i) => r.render(skyGradient(dateAt((i / frames) * 1440), loc.lat, loc.lon, label), { pxScale: 2, seed: i % 8 }),
      });
      download(`atmos-24h-sky.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`, blob);
    } catch (e) {
      useStore.getState().notify(`EXPORT FAILED · ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');

  return (
    <div className="pad stack">
      <p className="hint">The sky's colour from the sun's real position — no network needed.</p>
      <div className="sky-preview">
        <Thumb g={g} w={240} h={300} />
        <div className="sky-overlay">
          <span>{g.name}</span>
          <span>
            {hh}:{mm} · SUN {elevation.toFixed(1)}°
          </span>
        </div>
      </div>
      <label className="slider">
        <span className="slider-label">TIME</span>
        <input
          type="range"
          min={0}
          max={1439}
          value={minutes}
          style={{ '--p': `${(minutes / 1439) * 100}%` } as React.CSSProperties}
          onChange={(e) => {
            setLive(false);
            setMinutes(parseInt(e.target.value, 10));
          }}
        />
        <span className="slider-value">
          {hh}:{mm}
        </span>
      </label>
      <div className="row">
        <button className={`btn ghost ${live ? 'on' : ''}`} onClick={() => { setLive(true); setMinutes(minutesNow()); }}>
          NOW
        </button>
        <button className="btn ghost" onClick={locate}>
          USE MY LOCATION
        </button>
      </div>
      <p className="muted tiny">{formatCoords(loc.lat, loc.lon)}</p>
      <button className="btn" onClick={() => useStore.getState().load(g)}>
        OPEN IN EDITOR
      </button>
      <button className="btn ghost" disabled={progress !== null} onClick={exportDay}>
        {progress === null ? 'EXPORT 24H LOOP · 20S VIDEO' : `RENDERING ${Math.round(progress * 100)}%`}
      </button>
    </div>
  );
}
