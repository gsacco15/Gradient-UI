// Gradient → shader uniform values. Shared by the live renderer and the embed snippet
// so both draw exactly the same picture.
import { hexToOklab } from '../lib/color';
import { MAX_POINTS, sortedStops } from '../lib/gradient';
import type { Gradient } from '../types';

const TYPE_ID = { linear: 0, radial: 1, conic: 2, mesh: 3, frame: 4, aperture: 6, bands: 7, halo: 8 } as const;
const SYM_ID = { none: 0, mirror: 1, quadrant: 2, kaleido: 3 } as const;
const SHAPE_ID = { square: 0, circle: 1, arch: 2 } as const;
const MODE_ID = { none: 0, drift: 1, rotate: 2, pulse: 3, flow: 4 } as const;

export type UniformKind = '1i' | '1f' | '2f' | '3fv' | '1fv' | '2fv';
export type Uniforms = Record<string, [UniformKind, number[]]>;

export interface UniformOptions {
  scan?: boolean;
}

/** Everything that depends only on the gradient (not on size, time or the pointer). */
export function gradientUniforms(g: Gradient, o: UniformOptions = {}): Uniforms {
  const ramp = g.type !== 'mesh';
  const pts = (ramp ? sortedStops(g) : g.points).slice(0, MAX_POINTS);
  const col = new Array(MAX_POINTS * 3).fill(0);
  const pos = new Array(MAX_POINTS).fill(0);
  const xy = new Array(MAX_POINTS * 2).fill(0);
  const size = new Array(MAX_POINTS).fill(0);
  pts.forEach((p, i) => {
    const lab = hexToOklab(p.color);
    col[i * 3] = lab[0];
    col[i * 3 + 1] = lab[1];
    col[i * 3 + 2] = lab[2];
    pos[i] = p.pos;
    xy[i * 2] = p.x;
    xy[i * 2 + 1] = p.y;
    size[i] = p.size;
  });
  const c = g.composition, w = g.weather, it = g.interact;
  const react = it.mode === 'none' ? 0 : it.mode === 'repel' ? -it.strength : it.strength;
  return {
    u_type: ['1i', [o.scan ? 5 : TYPE_ID[g.type]]],
    u_n: ['1i', [pts.length]],
    u_col: ['3fv', col],
    u_pos: ['1fv', pos],
    u_xy: ['2fv', xy],
    u_size: ['1fv', size],
    u_bg: ['3fv', hexToOklab(g.background)],
    u_angle: ['1f', [(g.angle * Math.PI) / 180]],
    u_center: ['2f', [g.center.x, g.center.y]],
    u_sym: ['1i', [o.scan ? 0 : SYM_ID[c.symmetry]]],
    u_slices: ['1f', [c.slices]],
    u_shape: ['1i', [SHAPE_ID[c.shape]]],
    u_count: ['1f', [c.count]],
    u_soft: ['1f', [c.softness]],
    u_apSize: ['1f', [c.size ?? 0.62]],
    u_glow: ['1f', [c.glow ?? 0.45]],
    u_ratio: ['1f', [c.ratio ?? 1]],
    u_rot: ['1f', [o.scan ? 0 : (c.rotation * Math.PI) / 180]],
    u_fog: ['1f', [w.fog]],
    u_haze: ['1f', [w.haze]],
    u_frost: ['1f', [w.frost]],
    u_heat: ['1f', [w.heat]],
    u_clouds: ['1f', [w.clouds]],
    u_pixel: ['1f', [w.pixel]],
    u_dusk: ['1f', [w.dusk]],
    u_mode: ['1i', [o.scan ? 0 : MODE_ID[g.motion.mode]]],
    u_speed: ['1f', [g.motion.speed]],
    u_react: ['1f', [o.scan ? 0 : react]],
    u_lens: ['1i', [it.mode === 'lens' ? 1 : 0]],
  };
}
