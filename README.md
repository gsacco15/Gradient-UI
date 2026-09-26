# Atmos Studio

A sky and nature gradient studio. Every colour is a place and a moment — *GLACIER HOUR · ICELAND FJORD · 03:12* — and every gradient can be dropped straight onto a real interface.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ — host anywhere
npm test         # unit tests
```

No backend. Projects, favourites and settings are saved in the browser.

## What's in v0.2

| Area | Features |
| --- | --- |
| **Library** | 87 curated gradients across 10 collections (Sky Hours, Weather, Aurora, Deep Space, Ocean, Desert, Forest, Volcanic, Bloom, Ice), tone filters, favourites |
| **Editor** | Linear, radial, conic, mesh and frame (nested soft squares / circles / arches). Drag mesh points, centres and angles on the canvas; scroll a point to resize it; double-click to add a colour sampled from the canvas; stop bar with drag-off-to-delete |
| **Composition** | Mirror, quadrant and kaleidoscope symmetry, rotation, frame bands and softness |
| **Weather layers** | Fog (blur), Haze (grain), Frost (ordered dither), Clouds (noise warp), Heat (shimmer), Pixel, Dusk (vignette) |
| **Motion** | Drift, rotate, pulse, flow — all loops are seamless |
| **Live Sky** | The sky's colour from the sun's real position at your location and time; scrub the day; export a 24-hour loop video |
| **Photo → Place** | Drop a photo, get a named palette (k-means in Oklab) and six gradient combinations |
| **Horizon** | Scans an image one pixel line at a time and turns it into a moving horizon film (columns or rows, 24/30/60 fps) |
| **Interface** | Three sample screens (landing page, mobile app, dashboard). Click any outlined element to use the gradient as its background, border or text, then copy that component's HTML/CSS. Corners, shadow, glass, spacing, four typefaces, light/dark page, and a live WCAG contrast check |
| **Poster** | The gradient as a print with field-note typography: A3, 4:5, square or landscape at 300 DPI; white, bone or ink paper; framed or full-bleed; custom title and edition |
| **Cursor** | Follow, repel or lens — colours react to the mouse, in the studio and in the live embed |
| **Search** | Find gradients by mood (sunset, fog, neon), place, colour name, hex or type |
| **Tools** | Welcome guide, forecast shuffle (locks respected; shift for a totally new gradient), remix variations, hold-to-compare, undo/redo, named projects with duplicate |
| **Export** | PNG (up to 8K), SVG, CSS (Oklab-matched stops + grain overlay + tokens), Tailwind v3/v4, MP4/WebM video, live WebGL embed snippet, project JSON, share links |

### Shortcuts

`⌘Z` / `⌘⇧Z` undo/redo · `⌘S` save · `R` shuffle (`⇧R` full) · `E` export · hold `C` compare · `L` labels · `/` search · `?` help · `Space` play/pause · `Delete` remove selected colour

## How it works

- **One shader renders everything** (`src/render/shader.ts`). Colours blend in Oklab; the canvas, thumbnails, PNG and video exports all use the same WebGL2 program, so exports match the preview exactly.
- **CSS can't do everything.** Linear, radial and conic export as exact CSS; mesh and frame are approximated; blur, dither, warp and motion are listed as caveats in the Code tab and should use PNG or video.
- **Video** uses WebCodecs + `mp4-muxer` / `webm-muxer` (faster than real time). MP4 is H.264 where the browser has an encoder, VP9-in-MP4 otherwise. Browsers without WebCodecs fall back to real-time `MediaRecorder`.

## Layout

```
src/
  App.tsx                 top bar, three-panel layout, shortcuts, remix
  store.ts                zustand state, undo/redo history, persistence
  render/                 WebGL2 renderer + shader
  components/             Canvas (handles), StopBar, Inspector, Library,
                          LiveSky, PhotoPanel, SavedPanel, HorizonView,
                          InterfaceView, ExportDialog
  lib/                    colour maths, exports, generators, sun position,
                          palette extraction, video, share links
  data/                   collections + field-note colour names and places
```

## Next ideas

Animation timelines, video-in → gradient film, audio-reactive Horizon, poster mode with print-ready PDF, camera palette, cursor-reactive mesh, dark/light twin, design-token export for Figma/SwiftUI/Flutter, accounts and cloud sync.
