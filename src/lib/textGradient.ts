// Text → gradient. Tries the Claude-backed /api/generate endpoint first; when it's not
// available (local dev, no API key, offline) a keyword-based generator answers instead.
import { nameForColor, PLACES } from '../data/names';
import type { Gradient } from '../types';
import { clamp, oklch } from './color';
import { makeGradient } from './gradient';
import { sanitizeAi, type AiGradient } from './aiSchema';

export interface TextResult {
  gradient: Gradient;
  source: 'ai' | 'local';
  note: string;
  notice?: string; // why the local generator was used
}

export function fromAi(a: AiGradient): Gradient {
  return makeGradient({
    name: a.name,
    place: a.place,
    time: a.time,
    coords: a.coords || undefined,
    type: a.type,
    angle: a.angle,
    colors: a.colors,
    background: a.colors[a.colors.length - 1],
    composition: { symmetry: a.symmetry, count: 3, softness: 0.85 },
    weather: { fog: a.fog, haze: a.haze, frost: a.frost, clouds: a.clouds, heat: a.heat, dusk: a.dusk },
    motion: { mode: a.motion, speed: 0.5, duration: 10 },
  });
}

export async function generateFromText(prompt: string, signal?: AbortSignal): Promise<TextResult> {
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal,
    });
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : null;
    if (res.ok && data?.gradient) {
      const a = sanitizeAi(data.gradient);
      if (a) return { gradient: fromAi(a), source: 'ai', note: a.note };
    }
    // Errors worth showing (rate limit, refusal). Everything else falls back quietly.
    if (res.status === 429 || res.status === 422) throw new Error(data?.error ?? 'Try again in a moment.');
    const local = localTextGradient(prompt);
    const why = data?.error ?? `HTTP ${res.status}`;
    return { ...local, notice: res.status === 503 ? `AI is not configured on this site (${why}) — used the built-in generator.` : `AI unavailable (${why}) — used the built-in generator.` };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    if (e instanceof Error && !(e instanceof TypeError)) throw e;
    return { ...localTextGradient(prompt), notice: 'Offline — used the built-in generator.' };
  }
}

// ---------------------------------------------------------------- built-in generator

// word → [hue, chroma, lightness bias]
const WORDS: Record<string, [number, number, number]> = {
  red: [25, 0.18, 0], crimson: [15, 0.18, -0.1], rose: [0, 0.1, 0.1], pink: [355, 0.12, 0.15], blush: [10, 0.07, 0.2],
  orange: [55, 0.16, 0.05], amber: [70, 0.15, 0.05], gold: [85, 0.13, 0.08], yellow: [100, 0.16, 0.15], lemon: [105, 0.15, 0.2],
  green: [145, 0.13, 0], mint: [165, 0.09, 0.15], sage: [135, 0.05, 0.05], olive: [115, 0.08, -0.1], emerald: [160, 0.14, -0.05],
  teal: [195, 0.1, -0.05], cyan: [205, 0.12, 0.1], turquoise: [190, 0.12, 0.05], aqua: [195, 0.1, 0.12],
  blue: [255, 0.14, -0.05], navy: [265, 0.1, -0.25], cobalt: [262, 0.17, -0.1], sky: [240, 0.08, 0.15], azure: [245, 0.11, 0.08],
  purple: [305, 0.14, -0.05], violet: [295, 0.15, -0.02], lilac: [310, 0.08, 0.15], lavender: [300, 0.07, 0.18], magenta: [340, 0.2, 0],
  brown: [55, 0.07, -0.2], earth: [60, 0.06, -0.15], sand: [80, 0.06, 0.15], cream: [90, 0.03, 0.25], white: [250, 0.01, 0.3],
  grey: [250, 0.01, 0], gray: [250, 0.01, 0], black: [270, 0.02, -0.35], silver: [240, 0.02, 0.15],
};

const MOODS: { match: RegExp; hues: number[]; L: [number, number]; C: number; type?: Gradient['type']; weather?: Partial<Gradient['weather']>; place?: string }[] = [
  // Most specific moods first: 'neon at 2am' should read as neon, not just night.
  { match: /neon|cyber|synth|80s|retro|arcade|tokyo/, hues: [330, 290, 200], L: [0.2, 0.75], C: 0.22, type: 'mesh', weather: { haze: 0.35 }, place: 'TOKYO' },
  { match: /sunset|dusk|golden|evening|sundown/, hues: [260, 320, 20, 60], L: [0.35, 0.88], C: 0.13, type: 'linear', place: 'BIG SUR' },
  { match: /sunrise|dawn|morning|first light/, hues: [250, 330, 40, 80], L: [0.55, 0.95], C: 0.09, type: 'linear', place: 'PATAGONIA' },
  { match: /night|midnight|dark|2am|3am|star|space|galaxy|cosmic/, hues: [270, 290, 250], L: [0.1, 0.45], C: 0.1, type: 'mesh', weather: { haze: 0.4 }, place: 'MAUNA KEA' },
  { match: /rain|storm|fog|mist|cloud|grey|overcast/, hues: [240, 220, 250], L: [0.4, 0.85], C: 0.03, type: 'mesh', weather: { fog: 0.5, haze: 0.3 }, place: 'LOFOTEN' },
  { match: /ocean|sea|lagoon|reef|beach|wave|water/, hues: [200, 185, 225], L: [0.3, 0.92], C: 0.1, type: 'linear', place: 'MALDIVES' },
  { match: /forest|jungle|moss|leaf|garden|spring/, hues: [140, 120, 160], L: [0.25, 0.85], C: 0.1, type: 'mesh', place: 'YAKUSHIMA FOREST' },
  { match: /desert|dune|sand|canyon|mesa/, hues: [55, 40, 75], L: [0.45, 0.92], C: 0.1, type: 'linear', weather: { heat: 0.3 }, place: 'SAHARA' },
  { match: /fire|lava|volcano|ember|flame/, hues: [30, 15, 55], L: [0.12, 0.8], C: 0.2, type: 'radial', place: 'ETNA' },
  { match: /ice|snow|glacier|winter|frost|arctic/, hues: [230, 210, 250], L: [0.55, 0.98], C: 0.05, type: 'linear', weather: { haze: 0.25 }, place: 'SVALBARD' },
  { match: /aurora|northern lights/, hues: [160, 300, 270], L: [0.12, 0.8], C: 0.18, type: 'mesh', weather: { fog: 0.3, haze: 0.35 }, place: 'TROMSØ' },
  { match: /flower|bloom|blossom|cherry|petal|pastel|candy/, hues: [350, 320, 20], L: [0.75, 0.95], C: 0.08, type: 'mesh', weather: { fog: 0.3 }, place: 'PROVENCE' },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function localTextGradient(prompt: string): Omit<TextResult, 'notice'> {
  const text = prompt.toLowerCase();
  let s = hash(text) || 1;
  const rand = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0), (s % 10000) / 10000);
  const mood = MOODS.find((m) => m.match.test(text));
  const words = Object.keys(WORDS).filter((w) => new RegExp(`\\b${w}\\b`).test(text));
  const n = 4;
  let colors: string[];
  if (words.length) {
    // Named colours, spread from light to dark around their hues.
    colors = Array.from({ length: n }, (_, i) => {
      const [H, C, bias] = WORDS[words[i % words.length]];
      const L = clamp(0.88 - (i / (n - 1)) * 0.5 + bias * 0.6 + (rand() - 0.5) * 0.06, 0.08, 0.97);
      return oklch(L, C * (0.8 + rand() * 0.4), H + (rand() - 0.5) * 20);
    });
  } else {
    const m = mood ?? { hues: [rand() * 360, rand() * 360 + 60], L: [0.3, 0.9] as [number, number], C: 0.1 };
    colors = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      const H = m.hues[Math.min(m.hues.length - 1, Math.floor(t * m.hues.length))] + (rand() - 0.5) * 16;
      const L = m.L[1] - t * (m.L[1] - m.L[0]);
      return oklch(L, m.C * (0.8 + rand() * 0.4), H);
    });
    if (text.includes('sunset') || text.includes('sunrise') || text.includes('dawn')) colors.reverse();
  }
  const place = mood?.place ?? PLACES[Math.floor(rand() * PLACES.length)].place;
  const hh = /(\d{1,2})\s*(am|pm)/.exec(text);
  const hour = hh ? (parseInt(hh[1], 10) % 12) + (hh[2] === 'pm' ? 12 : 0) : Math.floor(rand() * 24);
  const gradient = makeGradient({
    name: nameForColor(colors[1]),
    place,
    time: `${String(hour).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}`,
    coords: PLACES.find((p) => p.place === place)?.coords,
    type: mood?.type ?? (rand() < 0.5 ? 'mesh' : 'linear'),
    angle: 180,
    colors,
    background: colors[colors.length - 1],
    weather: { haze: 0.22, ...mood?.weather },
  });
  return { gradient, source: 'local', note: `Keyword match: ${[mood ? mood.match.source.split('|')[0] : null, ...words].filter(Boolean).join(', ') || 'mood from the words you used'}.` };
}
