import { create } from 'zustand';
import { ALL_PRESETS } from './data/collections';
import { forecastShuffle, randomGradient } from './lib/generate';
import { cloneGradient, hydrateGradient, uid } from './lib/gradient';
import { idbSet } from './lib/idb';
import { load, save } from './lib/storage';
import type { Gradient, PosterSettings, Project, UiScreen, UiStyle, UiTarget } from './types';

export type View = 'gradient' | 'horizon' | 'interface' | 'poster';
export type LeftTab = 'library' | 'describe' | 'sky' | 'photo' | 'saved';

export interface HorizonState {
  image: string | null; // data URL
  imageName: string;
  width: number; // source columns
  height: number;
  dir: 'columns' | 'rows';
  pos: number; // 0..1
  fps: 24 | 30 | 60;
  step: number; // source pixels per frame
  playing: boolean;
}

interface State {
  gradient: Gradient;
  baseline: Gradient;
  past: Gradient[];
  future: Gradient[];
  selected: string | null;
  view: View;
  leftTab: LeftTab;
  favourites: string[];
  projects: Project[];
  projectId: string | null;
  playing: boolean;
  showLabels: boolean;
  exportOpen: boolean;
  remixOpen: boolean;
  toast: string | null;
  horizon: HorizonState;
  ui: { assign: Record<string, UiTarget>; picked: string | null; style: UiStyle; screen: UiScreen; tried: boolean };
  poster: PosterSettings;
  welcomeOpen: boolean;

  update: (fn: (d: Gradient) => void, history?: boolean) => void;
  checkpoint: () => void;
  load: (g: Gradient, keepId?: boolean) => void;
  undo: () => void;
  redo: () => void;
  shuffle: (full?: boolean) => void;
  select: (id: string | null) => void;
  setView: (v: View) => void;
  setLeftTab: (t: LeftTab) => void;
  toggleFavourite: (id: string) => void;
  saveProject: (title?: string) => void;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  renameProject: (id: string, title: string) => void;
  set: (p: Partial<State>) => void;
  setHorizon: (p: Partial<HorizonState>) => void;
  setUi: (p: Partial<State['ui']>) => void;
  setUiStyle: (p: Partial<UiStyle>) => void;
  setPoster: (p: Partial<PosterSettings>) => void;
  notify: (msg: string) => void;
}

const HISTORY_LIMIT = 80;
const initial = hydrateGradient(load<Partial<Gradient>>('atmos.current', cloneGradient(ALL_PRESETS[0], false)));

const DEFAULT_ASSIGN: Record<string, UiTarget> = {
  hero: 'background',
  'hero-title': 'none',
  'btn-primary': 'background',
  'card-1': 'background',
  'card-2': 'border',
  'card-3': 'none',
  'price-title': 'text',
  'login-panel': 'none',
  'login-btn': 'background',
  nav: 'none',
  logo: 'text',
  'app-header': 'background',
  'app-temp': 'none',
  'app-card': 'border',
  'app-fab': 'background',
  'app-tabbar': 'none',
  'dash-side': 'none',
  'dash-title': 'text',
  'dash-stat-1': 'background',
  'dash-stat-2': 'none',
  'dash-stat-3': 'border',
  'dash-chart': 'background',
  'dash-btn': 'background',
};

const DEFAULT_POSTER: PosterSettings = { size: 'a3', paper: 'white', layout: 'framed', margin: 0.1, title: '', subtitle: '', notes: true, edition: '001 / 100' };

const DEFAULT_STYLE: UiStyle = { radius: 14, shadow: 0.3, glass: 0.5, spacing: 1, borderWidth: 2, font: 'sans', textTone: 'auto', surface: 'light' };

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  gradient: initial,
  baseline: initial,
  past: [],
  future: [],
  selected: null,
  view: 'gradient',
  leftTab: 'library',
  favourites: load<string[]>('atmos.favourites', []),
  projects: load<Project[]>('atmos.projects', []).map((p) => ({ ...p, gradient: hydrateGradient(p.gradient) })),
  projectId: null,
  playing: true,
  showLabels: true,
  exportOpen: false,
  remixOpen: false,
  toast: null,
  horizon: { image: null, imageName: '', width: 0, height: 0, dir: 'columns', pos: 0, fps: 30, step: 1, playing: true },
  ui: {
    assign: { ...DEFAULT_ASSIGN, ...load<Record<string, UiTarget>>('atmos.ui.assign', {}) },
    picked: null,
    style: { ...DEFAULT_STYLE, ...load<Partial<UiStyle>>('atmos.ui.style', {}) },
    screen: 'landing',
    tried: load<boolean>('atmos.ui.tried', false),
  },
  poster: { ...DEFAULT_POSTER, ...load<Partial<PosterSettings>>('atmos.poster', {}) },
  welcomeOpen: !load<boolean>('atmos.welcomed', false),

  update: (fn, history = true) => {
    const { gradient, past } = get();
    const draft = cloneGradient(gradient, false);
    fn(draft);
    set(history ? { gradient: draft, past: [...past, gradient].slice(-HISTORY_LIMIT), future: [] } : { gradient: draft });
  },
  // Call at the start of a drag: records one undo step, then stream updates with history=false.
  checkpoint: () => {
    const { gradient, past } = get();
    set({ past: [...past, gradient].slice(-HISTORY_LIMIT), future: [] });
  },
  load: (g, keepId = false) => {
    const next = cloneGradient(g, !keepId);
    const { gradient, past } = get();
    set({ gradient: next, baseline: next, past: [...past, gradient].slice(-HISTORY_LIMIT), future: [], selected: null });
  },
  undo: () => {
    const { past, future, gradient } = get();
    if (!past.length) return;
    set({ gradient: past[past.length - 1], past: past.slice(0, -1), future: [gradient, ...future] });
  },
  redo: () => {
    const { past, future, gradient } = get();
    if (!future.length) return;
    set({ gradient: future[0], future: future.slice(1), past: [...past, gradient] });
  },
  shuffle: (full = false) => {
    const { gradient, past } = get();
    const next = full ? randomGradient(gradient) : forecastShuffle(gradient);
    set({ gradient: next, past: [...past, gradient].slice(-HISTORY_LIMIT), future: [] });
  },
  select: (id) => set({ selected: id }),
  setView: (view) => set({ view }),
  setLeftTab: (leftTab) => set({ leftTab }),
  toggleFavourite: (id) => {
    const f = get().favourites;
    set({ favourites: f.includes(id) ? f.filter((x) => x !== id) : [...f, id] });
  },
  saveProject: (title) => {
    const { gradient, projects, projectId } = get();
    const existing = projects.find((p) => p.id === projectId);
    if (existing) {
      set({ projects: projects.map((p) => (p.id === existing.id ? { ...p, gradient: cloneGradient(gradient, false), updated: Date.now() } : p)) });
      get().notify(`SAVED · ${existing.title}`);
      return;
    }
    const p: Project = { id: uid('proj'), title: title ?? `${gradient.name} · ${gradient.place}`, updated: Date.now(), gradient: cloneGradient(gradient, false) };
    set({ projects: [p, ...projects], projectId: p.id });
    get().notify(`SAVED · ${p.title}`);
  },
  duplicateProject: (id) => {
    const { projects } = get();
    const src = projects.find((p) => p.id === id);
    if (!src) return;
    const copy: Project = { ...src, id: uid('proj'), title: `${src.title} (COPY)`, updated: Date.now(), gradient: cloneGradient(src.gradient, true) };
    set({ projects: [copy, ...projects] });
  },
  deleteProject: (id) => {
    const { projects, projectId } = get();
    set({ projects: projects.filter((p) => p.id !== id), projectId: projectId === id ? null : projectId });
  },
  renameProject: (id, title) => set({ projects: get().projects.map((p) => (p.id === id ? { ...p, title } : p)) }),
  set: (p) => set(p),
  setHorizon: (p) => set({ horizon: { ...get().horizon, ...p } }),
  setUi: (p) => set({ ui: { ...get().ui, ...p } }),
  setUiStyle: (p) => set({ ui: { ...get().ui, style: { ...get().ui.style, ...p } } }),
  setPoster: (p) => set({ poster: { ...get().poster, ...p } }),
  notify: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 2200);
  },
}));

// Persist the bits worth keeping between visits.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.favourites !== prev.favourites) save('atmos.favourites', s.favourites);
  if (s.projects !== prev.projects) save('atmos.projects', s.projects);
  if (s.ui.assign !== prev.ui.assign) save('atmos.ui.assign', s.ui.assign);
  if (s.ui.style !== prev.ui.style) save('atmos.ui.style', s.ui.style);
  if (s.ui.tried !== prev.ui.tried) save('atmos.ui.tried', s.ui.tried);
  if (s.poster !== prev.poster) save('atmos.poster', s.poster);
  if (!s.welcomeOpen && prev.welcomeOpen) save('atmos.welcomed', true);
  // Remember the photo behind Horizon (IndexedDB — photos are too big for localStorage).
  const hz = s.horizon;
  if (hz.image && hz.image !== prev.horizon.image && hz.imageName !== 'DEMO LANDSCAPE') {
    idbSet('horizon-source', { image: hz.image, imageName: hz.imageName, width: hz.width, height: hz.height });
  }
  if (s.gradient !== prev.gradient) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save('atmos.current', s.gradient), 400);
  }
});

export const selectedPoint = (s: State) => s.gradient.points.find((p) => p.id === s.selected) ?? null;
