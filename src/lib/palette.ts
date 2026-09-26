// Photo → palette: k-means in Oklab on a downsampled image.
import { hexToOklab, oklabToHex, rgbToOklab, type Lab } from './color';

export function extractPalette(data: Uint8ClampedArray, k = 6, seed = 1): string[] {
  const pts: Lab[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    pts.push(rgbToOklab([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]));
  }
  if (!pts.length) return [];
  k = Math.min(k, pts.length);

  // k-means++ style init, deterministic
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const centers: Lab[] = [pts[Math.floor(rand() * pts.length)]];
  while (centers.length < k) {
    let best = pts[0], bestD = -1;
    for (let i = 0; i < pts.length; i += 7) {
      const p = pts[i];
      const d = Math.min(...centers.map((c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2));
      if (d > bestD) { bestD = d; best = p; }
    }
    centers.push(best);
  }

  const assign = new Int32Array(pts.length);
  const counts = new Array(k).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts.fill(0);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let bi = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const C = centers[c];
        const d = (p[0] - C[0]) ** 2 + (p[1] - C[1]) ** 2 + (p[2] - C[2]) ** 2;
        if (d < bd) { bd = d; bi = c; }
      }
      assign[i] = bi;
      counts[bi]++;
      sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2];
    }
    for (let c = 0; c < k; c++) if (counts[c]) centers[c] = [sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]];
  }

  // Most common first, then drop near-duplicates.
  const order = centers.map((c, i) => ({ c, n: counts[i] })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const out: string[] = [];
  for (const { c } of order) {
    const hex = oklabToHex(c);
    const lab = hexToOklab(hex);
    if (out.every((h) => { const o = hexToOklab(h); return Math.hypot(o[0] - lab[0], o[1] - lab[1], o[2] - lab[2]) > 0.04; })) out.push(hex);
  }
  return out;
}

export function byLightness(colors: string[]): string[] {
  return [...colors].sort((a, b) => hexToOklab(b)[0] - hexToOklab(a)[0]);
}

/** Load a File into an HTMLImageElement and a small pixel sample. */
export async function readImageFile(file: File, maxSide = 2048): Promise<{ url: string; img: HTMLImageElement; sample: Uint8ClampedArray; width: number; height: number }> {
  const src = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Could not read that image.'));
    i.src = src;
  });
  // Downscale very large images so textures and data URLs stay manageable.
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const url = scale < 1 ? c.toDataURL('image/jpeg', 0.92) : src;
  const sc = document.createElement('canvas');
  const ss = Math.min(1, 96 / Math.max(w, h));
  sc.width = Math.max(1, Math.round(w * ss));
  sc.height = Math.max(1, Math.round(h * ss));
  const sctx = sc.getContext('2d')!;
  sctx.drawImage(c, 0, 0, sc.width, sc.height);
  const finalImg = scale < 1 ? await new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.src = url; }) : img;
  return { url, img: finalImg, sample: sctx.getImageData(0, 0, sc.width, sc.height).data, width: w, height: h };
}
