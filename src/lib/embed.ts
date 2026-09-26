// Live embed: a self-contained <div> + <script> that renders the gradient with the same
// shader as the studio — including motion loops and cursor reactivity.
import { FRAG, VERT } from '../render/shader';
import { gradientUniforms } from '../render/uniforms';
import type { Gradient } from '../types';
import { cssBackground, slug } from './exportCode';

const round = (v: number) => Math.round(v * 1e5) / 1e5;

export function toEmbed(g: Gradient, height = '480px'): string {
  const uniforms = Object.fromEntries(Object.entries(gradientUniforms(g)).map(([k, [t, v]]) => [k, [t, v.map(round)]]));
  const cfg = {
    u: uniforms,
    loop: g.motion.mode === 'none' ? 0 : g.motion.duration,
    react: g.interact.mode !== 'none',
  };
  const fallback = cssBackground(g).replace(/\s*\n\s*/g, ' ').replace(/"/g, "'");
  const runtime = `(() => {
  const root = document.currentScript.previousElementSibling;
  const canvas = root.querySelector('canvas');
  const cfg = ${JSON.stringify(cfg)};
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) return;
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, ${JSON.stringify(VERT)}));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, ${JSON.stringify(FRAG)}));
  gl.linkProgram(p); gl.useProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return;
  canvas.style.opacity = 1;
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(p, 'a_pos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const L = (n) => gl.getUniformLocation(p, n);
  for (const [n, [t, v]] of Object.entries(cfg.u)) {
    const l = L(n);
    if (t === '1i') gl.uniform1i(l, v[0]); else if (t === '1f') gl.uniform1f(l, v[0]);
    else if (t === '2f') gl.uniform2f(l, v[0], v[1]); else if (t === '3fv') gl.uniform3fv(l, v);
    else if (t === '2fv') gl.uniform2fv(l, v); else gl.uniform1fv(l, v);
  }
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const m = { x: .5, y: .5, tx: .5, ty: .5, pr: 0, inside: false };
  if (cfg.react) {
    root.addEventListener('pointermove', (e) => { const r = root.getBoundingClientRect(); m.tx = (e.clientX - r.left) / r.width; m.ty = (e.clientY - r.top) / r.height; m.inside = true; });
    root.addEventListener('pointerleave', () => { m.inside = false; });
  }
  let dirty = true;
  new ResizeObserver(() => { dirty = true; }).observe(root);
  const frame = (t) => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(root.clientWidth * dpr), h = Math.round(root.clientHeight * dpr);
    const live = !still && (cfg.loop || cfg.react);
    if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; dirty = true; }
    if (dirty || live) {
      m.x += (m.tx - m.x) * .12; m.y += (m.ty - m.y) * .12; m.pr += ((m.inside ? 1 : 0) - m.pr) * .06;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(L('u_res'), w, h);
      gl.uniform1f(L('u_pxScale'), Math.max(1, Math.round(Math.min(w, h) / 700)));
      gl.uniform1f(L('u_phase'), cfg.loop && !still ? (t / 1000 / cfg.loop) % 1 : 0);
      gl.uniform2f(L('u_mouse'), m.x, m.y);
      gl.uniform1f(L('u_presence'), cfg.react ? m.pr : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      dirty = false;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();`;
  return [
    `<!-- ${g.name} · ${g.place} · ${g.time} — live gradient made with Atmos -->`,
    `<div class="atmos-live atmos-${slug(g.name)}" style="position:relative;width:100%;height:${height};overflow:hidden;background:${fallback}">`,
    `  <canvas style="position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .4s"></canvas>`,
    `</div>`,
    `<script>`,
    runtime,
    `</script>`,
  ].join('\n');
}
