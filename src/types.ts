export type GradientType = 'linear' | 'radial' | 'conic' | 'mesh' | 'frame';
export type Symmetry = 'none' | 'mirror' | 'quadrant' | 'kaleido';
export type FrameShape = 'square' | 'circle' | 'arch';
export type MotionMode = 'none' | 'drift' | 'rotate' | 'pulse' | 'flow';

/** One colour in a gradient. Every point carries both a stop position (for ramps) and an x/y (for mesh). */
export interface ColorPoint {
  id: string;
  color: string; // #rrggbb
  pos: number; // 0..1 along the ramp
  x: number; // 0..1 canvas space (mesh)
  y: number;
  size: number; // mesh spread, 0.05..1
  locked?: boolean;
}

export interface Composition {
  symmetry: Symmetry;
  slices: number; // kaleido slices
  shape: FrameShape;
  count: number; // frame bands
  softness: number; // 0..1
  rotation: number; // degrees
}

/** Weather layers — our names for blur, grain, dither and friends. All 0..1. */
export interface Weather {
  fog: number; // blur
  haze: number; // grain
  frost: number; // ordered dither
  heat: number; // shimmer distortion
  clouds: number; // noise warp
  pixel: number; // pixelate
  dusk: number; // vignette
}

export interface Motion {
  mode: MotionMode;
  speed: number; // 0..1 intensity
  duration: number; // loop length in seconds
}

export interface Gradient {
  id: string;
  name: string; // e.g. "GLACIER HOUR"
  place: string; // e.g. "ICELAND FJORD"
  time: string; // e.g. "03:12"
  coords?: string; // e.g. "64.14° N · 21.94° W"
  collection?: string;
  type: GradientType;
  angle: number; // degrees, linear/conic
  center: { x: number; y: number };
  background: string; // mesh base colour
  points: ColorPoint[];
  composition: Composition;
  weather: Weather;
  motion: Motion;
}

export interface Project {
  id: string;
  title: string;
  updated: number;
  gradient: Gradient;
}

export type UiTarget = 'background' | 'border' | 'text' | 'none';

export interface UiStyle {
  radius: number;
  shadow: number;
  glass: number;
  spacing: number;
  borderWidth: number;
  font: 'mono' | 'sans' | 'serif';
  textTone: 'auto' | 'light' | 'dark';
  surface: 'light' | 'dark';
}
