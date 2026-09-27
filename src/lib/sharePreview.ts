// The image shown when a share link is posted in messages and social apps (1200×630).
import { GradientRenderer, grainScale } from '../render/renderer';
import type { Gradient } from '../types';
import { luminance } from './color';
import { MONO, posterFontsReady } from './poster';

export const PREVIEW_W = 1200;
export const PREVIEW_H = 630;

export async function renderSharePreview(g: Gradient): Promise<Blob | null> {
  await posterFontsReady();
  const gl = document.createElement('canvas');
  const r = new GradientRenderer(gl, true);
  r.setSize(PREVIEW_W, PREVIEW_H);
  r.render(g, { pxScale: grainScale(PREVIEW_W, PREVIEW_H), phase: 0.15 });

  const out = document.createElement('canvas');
  out.width = PREVIEW_W;
  out.height = PREVIEW_H;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(gl, 0, 0);
  gl.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();

  // Pick light or dark type from the bottom-left corner, where the title sits.
  const d = ctx.getImageData(40, PREVIEW_H - 170, 500, 130).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 64) sum += luminance([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]);
  const ink = sum / (d.length / 64) > 0.42 ? '#141414' : '#FFFFFF';

  const text = (t: string, x: number, y: number, size: number, weight = 400, alpha = 1, align: CanvasTextAlign = 'left') => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ink;
    ctx.textAlign = align;
    ctx.font = `${weight} ${size}px ${MONO}`;
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${size * 0.06}px`;
    ctx.fillText(t, x, y);
  };
  text('ATMOS [ STUDIO ]', 56, 76, 20, 500, 0.9);
  text(g.coords ?? '', PREVIEW_W - 56, 76, 18, 400, 0.75, 'right');
  text(g.name.toUpperCase().slice(0, 28), 56, PREVIEW_H - 92, 54, 500);
  text(`${g.place} · ${g.time}`.toUpperCase().slice(0, 48), 56, PREVIEW_H - 52, 22, 400, 0.8);
  ctx.globalAlpha = 1;

  return new Promise((res) => out.toBlob(res, 'image/jpeg', 0.88));
}
