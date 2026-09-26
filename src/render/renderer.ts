import type { Gradient } from '../types';
import { FRAG, VERT } from './shader';
import { gradientUniforms, type UniformKind } from './uniforms';

export interface RenderOptions {
  phase?: number; // 0..1 animation loop phase
  seed?: number; // grain seed
  pxScale?: number; // size of one grain/dither "pixel" in device pixels
  scan?: { pos: number; dir: 'columns' | 'rows' };
  mouse?: { x: number; y: number; presence: number }; // pointer in canvas uv (y down), presence 0..1
}

export class GradientRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private loc = new Map<string, WebGLUniformLocation | null>();
  private tex: WebGLTexture;
  hasImage = false;

  constructor(canvas: HTMLCanvasElement, preserve = false) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: preserve, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.prog = this.build();
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(this.prog, 'a_pos');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.texParams();
  }

  private build(): WebGLProgram {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
    gl.useProgram(p);
    return p;
  }

  private texParams() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private u(name: string) {
    if (!this.loc.has(name)) this.loc.set(name, this.gl.getUniformLocation(this.prog, name));
    return this.loc.get(name)!;
  }

  /** Upload an image used by the Horizon (scan) mode. */
  setImage(img: TexImageSource | null) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (img) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.texParams();
    this.hasImage = !!img;
  }

  setSize(w: number, h: number) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  render(g: Gradient, o: RenderOptions = {}) {
    const gl = this.gl;
    const { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.prog);

    for (const [name, [kind, v]] of Object.entries(gradientUniforms(g, { scan: !!o.scan }))) this.set(name, kind, v);
    gl.uniform2f(this.u('u_res'), width, height);
    gl.uniform1f(this.u('u_phase'), o.phase ?? 0);
    gl.uniform1f(this.u('u_seed'), o.seed ?? 0);
    gl.uniform1f(this.u('u_pxScale'), o.pxScale ?? 1);
    gl.uniform2f(this.u('u_mouse'), o.mouse?.x ?? 0.5, o.mouse?.y ?? 0.5);
    gl.uniform1f(this.u('u_presence'), o.mouse?.presence ?? 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u('u_img'), 0);
    gl.uniform1f(this.u('u_scanPos'), o.scan?.pos ?? 0);
    gl.uniform1i(this.u('u_scanDir'), o.scan?.dir === 'rows' ? 1 : 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private set(name: string, kind: UniformKind, v: number[]) {
    const gl = this.gl, l = this.u(name);
    if (kind === '1i') gl.uniform1i(l, v[0]);
    else if (kind === '1f') gl.uniform1f(l, v[0]);
    else if (kind === '2f') gl.uniform2f(l, v[0], v[1]);
    else if (kind === '3fv') gl.uniform3fv(l, v);
    else if (kind === '2fv') gl.uniform2fv(l, v);
    else gl.uniform1fv(l, v);
  }
}

// A shared off-screen renderer for thumbnails, UI snapshots and exports.
let shared: GradientRenderer | null = null;
export function sharedRenderer(): GradientRenderer {
  if (!shared) shared = new GradientRenderer(document.createElement('canvas'), true);
  return shared;
}

const thumbCache = new Map<string, string>();

/** Render a gradient to a data URL (cached by content + size). */
export function renderDataURL(g: Gradient, w: number, h: number, key: string, o: RenderOptions = {}): string {
  const k = `${key}|${w}x${h}|${o.phase ?? 0}`;
  const hit = thumbCache.get(k);
  if (hit) return hit;
  const r = sharedRenderer();
  r.setSize(w, h);
  r.render(g, { pxScale: 1, ...o });
  const url = r.canvas.toDataURL('image/png');
  if (thumbCache.size > 400) thumbCache.clear();
  thumbCache.set(k, url);
  return url;
}

/** Read back pixels of a gradient at a small size (for contrast checks). */
export function renderPixels(g: Gradient, w: number, h: number): Uint8ClampedArray {
  const r = sharedRenderer();
  r.setSize(w, h);
  r.render(g, { pxScale: 1 });
  const c2 = document.createElement('canvas');
  c2.width = w;
  c2.height = h;
  const ctx = c2.getContext('2d')!;
  ctx.drawImage(r.canvas, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

/** Grain and dither "pixel" size, so texture looks the same at any output resolution. */
export const grainScale = (w: number, h: number) => Math.max(1, Math.round(Math.min(w, h) / 700));
