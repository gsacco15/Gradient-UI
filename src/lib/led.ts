// LED Lab: map a gradient onto a grid of addressable LEDs (strips laid in rows, or panels)
// behind a diffuser in a frame. Pure maths here; the page draws and streams it.

export type LedShape = 'rect' | 'circle' | 'oval';
export type Wiring = 'serpentine' | 'rows';

export interface LedSettings {
  frameW: number; // inside of the frame, mm
  frameH: number;
  shape: LedShape;
  pitch: number; // mm between LEDs, both ways
  margin: number; // mm kept clear inside the frame edge
  wiring: Wiring;
  start: 'top' | 'bottom'; // where the data line comes in (always from the left)
}

export interface Led {
  i: number; // index along the data line
  col: number;
  row: number;
  x: number; // mm from the frame's top-left
  y: number;
}

export interface LedLayout {
  cols: number;
  rows: number;
  leds: Led[];
  runs: number; // rows that hold at least one LED (= strip pieces to cut)
}

const IN = 25.4;

/** Standard picture frames (inches, as sold) plus a couple of square ones for Turrell-style pieces. */
export const FRAMES = [
  { id: '8x10', label: '8 × 10 in', w: 8 * IN, h: 10 * IN },
  { id: '11x14', label: '11 × 14 in', w: 11 * IN, h: 14 * IN },
  { id: '12x12', label: '12 × 12 in', w: 12 * IN, h: 12 * IN },
  { id: '16x20', label: '16 × 20 in', w: 16 * IN, h: 20 * IN },
  { id: '20x20', label: '20 × 20 in', w: 20 * IN, h: 20 * IN },
  { id: '18x24', label: '18 × 24 in', w: 18 * IN, h: 24 * IN },
  { id: '24x36', label: '24 × 36 in', w: 24 * IN, h: 36 * IN },
];

/** Common addressable LEDs (WS2812B / SK6812 class, 5 V). Pitch is the spacing between LEDs. */
export const LED_TYPES = [
  { id: 's30', label: 'Strip · 30 LEDs/m', pitch: 1000 / 30, kind: 'strip' as const },
  { id: 's60', label: 'Strip · 60 LEDs/m', pitch: 1000 / 60, kind: 'strip' as const },
  { id: 's96', label: 'Strip · 96 LEDs/m', pitch: 1000 / 96, kind: 'strip' as const },
  { id: 's144', label: 'Strip · 144 LEDs/m', pitch: 1000 / 144, kind: 'strip' as const },
  { id: 'p10', label: 'Panel · 10 mm pitch (16×16)', pitch: 10, kind: 'panel' as const },
];

export const DEFAULT_LED: LedSettings = { frameW: 12 * IN, frameH: 12 * IN, shape: 'rect', pitch: 1000 / 30, margin: 15, wiring: 'serpentine', start: 'top' };

export const mmToIn = (mm: number) => mm / IN;
export const inToMm = (inch: number) => inch * IN;

/** Is a point (mm, frame space) inside the lit shape? Circles use the largest one that fits. */
export function insideShape(s: LedSettings, x: number, y: number): boolean {
  if (s.shape === 'rect') return x >= s.margin && x <= s.frameW - s.margin && y >= s.margin && y <= s.frameH - s.margin;
  const cx = s.frameW / 2, cy = s.frameH / 2;
  const rx = (s.shape === 'circle' ? Math.min(s.frameW, s.frameH) / 2 : s.frameW / 2) - s.margin;
  const ry = (s.shape === 'circle' ? Math.min(s.frameW, s.frameH) / 2 : s.frameH / 2) - s.margin;
  if (rx <= 0 || ry <= 0) return false;
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

/** Lay LEDs on a grid centred in the frame, keep the ones inside the shape, and number them along the wiring. */
export function buildLayout(s: LedSettings): LedLayout {
  const pitch = Math.max(2, s.pitch);
  const usableW = Math.max(0, s.frameW - 2 * s.margin), usableH = Math.max(0, s.frameH - 2 * s.margin);
  const cols = Math.max(1, Math.floor(usableW / pitch) + 1);
  const rows = Math.max(1, Math.floor(usableH / pitch) + 1);
  const x0 = (s.frameW - (cols - 1) * pitch) / 2, y0 = (s.frameH - (rows - 1) * pitch) / 2;
  const leds: Led[] = [];
  let runs = 0;
  for (let k = 0; k < rows; k++) {
    const row = s.start === 'top' ? k : rows - 1 - k;
    const reverse = s.wiring === 'serpentine' && runs % 2 === 1;
    const inRow: Led[] = [];
    for (let c = 0; c < cols; c++) {
      const col = reverse ? cols - 1 - c : c;
      const x = x0 + col * pitch, y = y0 + row * pitch;
      if (insideShape(s, x, y)) inRow.push({ i: 0, col, row, x, y });
    }
    if (!inRow.length) continue;
    runs++;
    for (const l of inRow) leds.push({ ...l, i: leds.length });
  }
  return { cols, rows, leds, runs };
}

export interface LedStats {
  count: number;
  stripMeters: number; // LED strip to buy (strips only)
  maxAmps: number; // every LED full white
  typicalAmps: number; // a gradient at full brightness, roughly
  psu: string;
  maxFps: number; // WS2812 on one data pin
}

/** Rough build numbers for 5 V WS2812B-class LEDs (60 mA per LED at full white). */
export function ledStats(layout: LedLayout, s: LedSettings, brightness = 1): LedStats {
  const count = layout.leds.length;
  const maxAmps = count * 0.06 * brightness;
  const typicalAmps = maxAmps * 0.4;
  const need = maxAmps * 0.6; // gradients never light every LED full white
  const sizes = [2, 3, 4, 6, 8, 10, 15, 20, 30, 40, 60];
  const pick = sizes.find((a) => a >= need);
  return {
    count,
    stripMeters: Math.ceil(((count * s.pitch) / 1000) * 10) / 10,
    maxAmps,
    typicalAmps,
    psu: pick ? `5 V ${pick} A` : `5 V ${Math.ceil(need)} A (split across supplies)`,
    maxFps: count ? Math.min(60, Math.floor(1e6 / (count * 30 + 300))) : 60,
  };
}

/** Screen colour → LED drive value. LEDs are linear; screens are not, so dim values need gamma. */
export function toLed(v: number, brightness: number, gamma: number): number {
  return Math.round(255 * Math.pow(v / 255, gamma) * brightness);
}

/**
 * Pick each LED's colour out of a cols×rows RGBA image of the gradient, in data-line order.
 * `screen` is what to show on a monitor; `drive` is the gamma-corrected value to send to the LEDs.
 */
export function sampleLeds(layout: LedLayout, rgba: Uint8ClampedArray, brightness: number, gamma: number) {
  const n = layout.leds.length;
  const screen = new Uint8Array(n * 3), drive = new Uint8Array(n * 3);
  for (const l of layout.leds) {
    const p = (l.row * layout.cols + l.col) * 4;
    for (let c = 0; c < 3; c++) {
      screen[l.i * 3 + c] = Math.round(rgba[p + c] * brightness);
      drive[l.i * 3 + c] = toLed(rgba[p + c], brightness, gamma);
    }
  }
  return { screen, drive };
}

/** Adalight frame: "Ada", count-1 (hi, lo), checksum, then RGB. Understood by WLED and most serial LED firmware. */
export function adalight(rgb: Uint8Array): Uint8Array {
  const n = rgb.length / 3 - 1;
  const hi = (n >> 8) & 0xff, lo = n & 0xff;
  const out = new Uint8Array(6 + rgb.length);
  out.set([0x41, 0x64, 0x61, hi, lo, hi ^ lo ^ 0x55]);
  out.set(rgb, 6);
  return out;
}

/** An Arduino / FastLED sketch that plays the frames on a loop. Colours are already gamma-corrected. */
export function fastLedSketch(frames: Uint8Array[], count: number, fps: number, name: string): string {
  const rows = frames.map((f) => '  {' + Array.from(f, (v) => v).join(',') + '}').join(',\n');
  return `// ${name} — exported from Atmos LED Lab
// ${count} LEDs, ${frames.length} frame${frames.length === 1 ? '' : 's'} at ${fps} fps. Colours are RGB and already gamma-corrected.
// Wire: 5 V supply to the strip, GND shared with the board, data through a ~330 Ω resistor.
#include <FastLED.h>

#define DATA_PIN 6        // change to your data pin
#define NUM_LEDS ${count}
#define NUM_FRAMES ${frames.length}
#define FPS ${fps}

CRGB leds[NUM_LEDS];
const uint8_t frames[NUM_FRAMES][NUM_LEDS * 3] PROGMEM = {
${rows}
};

void setup() {
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS); // GRB is the usual order for WS2812B
  FastLED.setMaxPowerInVoltsAndMilliamps(5, ${Math.max(500, Math.round(count * 60 * 0.6))});
}

void loop() {
  for (int f = 0; f < NUM_FRAMES; f++) {
    for (int i = 0; i < NUM_LEDS; i++) {
      leds[i] = CRGB(pgm_read_byte(&frames[f][i * 3]), pgm_read_byte(&frames[f][i * 3 + 1]), pgm_read_byte(&frames[f][i * 3 + 2]));
    }
    FastLED.show();
    delay(1000 / FPS);
  }
}
`;
}

/** The physical map: where every LED sits, in data-line order. */
export function layoutJson(layout: LedLayout, s: LedSettings, name: string) {
  return JSON.stringify(
    {
      name,
      units: 'mm',
      frame: { width: +s.frameW.toFixed(1), height: +s.frameH.toFixed(1), shape: s.shape, margin: s.margin },
      pitch: +s.pitch.toFixed(2),
      wiring: { mode: s.wiring, start: `${s.start}-left` },
      grid: { cols: layout.cols, rows: layout.rows },
      count: layout.leds.length,
      leds: layout.leds.map((l) => [l.i, l.col, l.row, +l.x.toFixed(1), +l.y.toFixed(1)]),
      ledFormat: ['index', 'col', 'row', 'x', 'y'],
    },
    null,
    1,
  );
}
