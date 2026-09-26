// Live Sky: the colour of the sky at a place and time, from the sun's real elevation.
import type { Gradient } from '../types';
import { mixHex } from './color';
import { makeGradient } from './gradient';

const RAD = Math.PI / 180;

/** Solar elevation in degrees (accurate to well under a degree — plenty for colour). */
export function solarElevation(date: Date, lat: number, lon: number): number {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const g = ((357.529 + 0.98560028 * d) % 360) * RAD;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const lst = gmst * 15 + lon;
  const H = (lst - ra) * RAD;
  const el = Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(H));
  return el / RAD;
}

// zenith → horizon, keyed by solar elevation
const KEYS: [number, string[], string][] = [
  [-18, ['#05081A', '#0B1026', '#141B3A', '#1E2A5A'], 'NIGHT'],
  [-12, ['#0B1026', '#141B3A', '#2C3E7A', '#3F5A8C'], 'NAUTICAL TWILIGHT'],
  [-6, ['#141B3A', '#2C3E7A', '#8E6FB5', '#E89AB8'], 'CIVIL TWILIGHT'],
  [-2, ['#2C3E7A', '#5E4B8B', '#C77DB0', '#F9C79A'], 'BLUE HOUR'],
  [2, ['#3F5A8C', '#8E6FB5', '#F4B6C2', '#F6B47A'], 'GOLDEN HOUR'],
  [8, ['#4F74B0', '#A9C8EC', '#F4D6C4', '#FFE3C4'], 'LOW SUN'],
  [20, ['#3F6FB8', '#7FA6D9', '#CFE2F5', '#EAF1F8'], 'MORNING SKY'],
  [45, ['#2F62B0', '#5B8FD4', '#A9C8EC', '#E4EEF8'], 'HIGH SUN'],
];

export function skyColors(elevation: number): { colors: string[]; phase: string } {
  if (elevation <= KEYS[0][0]) return { colors: KEYS[0][1], phase: KEYS[0][2] };
  for (let i = 1; i < KEYS.length; i++) {
    const [e1, c1, n1] = KEYS[i];
    const [e0, c0, n0] = KEYS[i - 1];
    if (elevation <= e1) {
      const t = (elevation - e0) / (e1 - e0);
      return { colors: c0.map((c, k) => mixHex(c, c1[k], t)), phase: t < 0.5 ? n0 : n1 };
    }
  }
  const last = KEYS[KEYS.length - 1];
  return { colors: last[1], phase: last[2] };
}

export function formatCoords(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

/** Longitude guess from the browser's time zone, so Live Sky works without a location prompt. */
export function guessLocation(): { lat: number; lon: number } {
  const offset = new Date().getTimezoneOffset();
  return { lat: 40, lon: Math.max(-180, Math.min(180, -offset / 4)) };
}

export function skyGradient(date: Date, lat: number, lon: number, placeLabel = 'YOUR SKY'): Gradient {
  const el = solarElevation(date, lat, lon);
  const { colors, phase } = skyColors(el);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const g = makeGradient({
    name: phase,
    place: placeLabel,
    time: `${hh}:${mm}`,
    coords: formatCoords(lat, lon),
    type: 'linear',
    angle: 180,
    colors,
    weather: { haze: 0.22, fog: 0.15 },
  });
  // A sun (or moon) glow sits near the horizon.
  g.points[g.points.length - 1].pos = 1;
  g.points[1].pos = 0.45;
  g.points[2].pos = 0.8;
  return g;
}
