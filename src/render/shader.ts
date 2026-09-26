// One fragment shader renders every gradient type, composition and weather layer,
// so the canvas, thumbnails, PNG and video exports all match exactly.

export const VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export const FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;

#define MAXP 8
#define TAU 6.28318530718

uniform vec2 u_res;
uniform int u_type;          // 0 linear 1 radial 2 conic 3 mesh 4 frame 5 scan
uniform int u_n;
uniform vec3 u_col[MAXP];    // Oklab, sorted by pos for ramp types
uniform float u_pos[MAXP];
uniform vec2 u_xy[MAXP];
uniform float u_size[MAXP];
uniform vec3 u_bg;           // Oklab
uniform float u_angle;       // radians
uniform vec2 u_center;

uniform int u_sym;           // 0 none 1 mirror 2 quadrant 3 kaleido
uniform float u_slices;
uniform int u_shape;         // 0 square 1 circle 2 arch
uniform float u_count;
uniform float u_soft;
uniform float u_rot;         // radians

uniform float u_fog;
uniform float u_haze;
uniform float u_frost;
uniform float u_heat;
uniform float u_clouds;
uniform float u_pixel;
uniform float u_dusk;

uniform int u_mode;          // 0 none 1 drift 2 rotate 3 pulse 4 flow
uniform float u_speed;
uniform float u_phase;       // 0..1 loop phase
uniform float u_seed;
uniform float u_pxScale;     // device-independent grain / dither size

uniform vec2 u_mouse;         // pointer, uv space (y down)
uniform float u_presence;     // 0..1, eases in and out as the pointer enters/leaves
uniform float u_react;        // + follow, - repel
uniform int u_lens;           // 1 = lens bulge instead of pull/push

uniform sampler2D u_img;
uniform float u_scanPos;
uniform int u_scanDir;       // 0 columns -> horizontal bands, 1 rows -> vertical bands

float aspect() { return u_res.x / u_res.y; }

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

vec3 srgbToOklab(vec3 c) {
  c = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0); m = pow(max(m, 0.0), 1.0 / 3.0); s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
              1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
}

vec3 oklabToSrgb(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.291485548 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  vec3 lin = vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                  -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                  -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  lin = clamp(lin, 0.0, 1.0);
  return mix(lin * 12.92, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}

vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = u_col[0];
  for (int i = 1; i < MAXP; i++) {
    if (i >= u_n) break;
    float a = u_pos[i - 1], b = u_pos[i];
    float k = b > a ? clamp((t - a) / (b - a), 0.0, 1.0) : step(b, t);
    c = mix(c, u_col[i], k);
  }
  return c;
}

vec2 rotateAround(vec2 uv, vec2 c, float a) {
  vec2 p = (uv - c) * vec2(aspect(), 1.0);
  float s = sin(a), co = cos(a);
  p = vec2(co * p.x - s * p.y, s * p.x + co * p.y);
  return c + p / vec2(aspect(), 1.0);
}

float frameDist(vec2 uv) {
  vec2 d = uv - u_center;
  if (u_shape == 0) return max(abs(d.x), abs(d.y)) / 0.5;
  if (u_shape == 1) return length(d) / 0.5;
  vec2 q = uv - vec2(u_center.x, u_center.y + 0.1);
  if (q.y < 0.0) return length(q * vec2(1.0, 0.9)) / 0.42;
  return max(abs(q.x) / 0.42, q.y / 0.4);
}

// Evaluate the gradient at uv (0..1, y down). Returns Oklab.
vec3 evalLab(vec2 uv) {
  float T = u_phase * TAU;
  float flip = 0.0;

  if (u_rot != 0.0) uv = rotateAround(uv, vec2(0.5), u_rot);
  if (u_mode == 2) uv = rotateAround(uv, vec2(0.5), T);

  if (u_sym == 1) {
    uv.x = abs(uv.x - 0.5) * 2.0;
  } else if (u_sym == 2) {
    vec2 q = uv * 2.0;
    vec2 cell = floor(clamp(q, 0.0, 1.999));
    vec2 f = fract(q);
    f = mix(f, 1.0 - f, cell);
    uv = f;
    flip = mod(cell.x + cell.y, 2.0);
  } else if (u_sym == 3) {
    vec2 p = (uv - 0.5) * vec2(aspect(), 1.0);
    float r = length(p);
    float sector = TAU / max(u_slices, 2.0);
    float a = mod(atan(p.y, p.x), sector);
    a = abs(a - sector * 0.5);
    uv = 0.5 + vec2(cos(a), sin(a)) * r / vec2(aspect(), 1.0);
  }

  if (u_mode == 1 && u_type != 3) {
    uv += vec2(sin(T + uv.y * 6.0), cos(T + uv.x * 6.0)) * 0.035 * u_speed;
  }
  if (u_mode == 4) {
    vec2 circ = vec2(cos(T), sin(T)) * 1.2;
    uv += (vec2(fbm(uv * 2.5 + circ), fbm(uv * 2.5 - circ + 7.3)) - 0.5) * 0.35 * u_speed;
  }

  if (u_type == 5) {
    vec2 st = u_scanDir == 0 ? vec2(u_scanPos, clamp(uv.y, 0.0, 1.0)) : vec2(clamp(uv.x, 0.0, 1.0), u_scanPos);
    return srgbToOklab(texture(u_img, st).rgb);
  }

  if (u_type == 3) {
    vec2 p = uv * vec2(aspect(), 1.0);
    vec3 acc = u_bg * 0.04;
    float wsum = 0.04;
    for (int i = 0; i < MAXP; i++) {
      if (i >= u_n) break;
      float fi = float(i);
      vec2 xy = u_xy[i];
      float sz = u_size[i];
      if (u_mode == 1) xy += vec2(sin(T + fi * 1.7), cos(T + fi * 2.3)) * 0.12 * u_speed;
      if (u_mode == 3) sz *= 1.0 + 0.35 * u_speed * sin(T + fi * 1.3);
      if (u_presence > 0.001 && u_lens == 0) {
        vec2 dm = (u_mouse - xy) * vec2(aspect(), 1.0);
        float f = exp(-dot(dm, dm) / 0.09);
        xy += (u_mouse - xy) * f * u_react * u_presence * 0.75;
        sz *= 1.0 + f * abs(u_react) * u_presence * 0.25;
      }
      vec2 d = p - xy * vec2(aspect(), 1.0);
      float w = exp(-dot(d, d) / max(sz * sz * 0.5, 1e-4));
      acc += u_col[i] * w;
      wsum += w;
    }
    return acc / wsum;
  }

  float t;
  if (u_type == 0) {
    vec2 dir = vec2(sin(u_angle), -cos(u_angle));
    vec2 p = (uv - 0.5) * vec2(aspect(), 1.0);
    float len = abs(aspect() * dir.x) + abs(dir.y);
    t = dot(p, dir) / len + 0.5;
  } else if (u_type == 1) {
    t = length(uv - u_center) / 0.70710678;
  } else if (u_type == 2) {
    vec2 d = (uv - u_center) * vec2(aspect(), 1.0);
    t = fract((atan(d.x, -d.y) - u_angle) / TAU);
  } else {
    float r = clamp(frameDist(uv), 0.0, 1.0);
    float n = max(u_count, 1.0);
    float b = (1.0 - r) * n;
    float e0 = 1.0 - max(u_soft, 0.02);
    float edge = smoothstep(e0, 1.0, fract(b));
    t = n > 1.0 ? (floor(b) + edge) / (n - 1.0) : 1.0 - r;
  }

  if (flip > 0.5) t = 1.0 - t;
  if (u_mode == 3) t *= 1.0 + 0.15 * u_speed * sin(T);
  if (u_mode == 4) t += 0.12 * u_speed * sin(T + t * TAU);
  return ramp(t);
}

float bayer8(vec2 p) {
  ivec2 q = ivec2(mod(p, 8.0));
  int m[64] = int[64](0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,
                      3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21);
  return float(m[q.y * 8 + q.x]) / 64.0;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = vec2(frag.x / u_res.x, 1.0 - frag.y / u_res.y);
  float T = u_phase * TAU;

  if (u_pixel > 0.001) {
    float cells = mix(160.0, 8.0, pow(u_pixel, 0.6));
    vec2 grid = vec2(cells * aspect(), cells);
    uv = (floor(uv * grid) + 0.5) / grid;
  }
  if (u_presence > 0.001 && (u_type != 3 || u_lens == 1)) {
    // Pointer warp: pinch toward / push away from the cursor, or a soft lens bulge.
    vec2 d = (uv - u_mouse) * vec2(aspect(), 1.0);
    float f = exp(-dot(d, d) / 0.06);
    float k = u_lens == 1 ? -0.45 * abs(u_react) : 0.5 * u_react;
    uv -= (uv - u_mouse) * f * k * u_presence;
  }
  if (u_clouds > 0.001) {
    vec2 w = vec2(fbm(uv * 3.0 + 1.7), fbm(uv * 3.0 + 9.2)) - 0.5;
    uv += w * 0.3 * u_clouds;
  }
  if (u_heat > 0.001) {
    uv.x += sin(uv.y * 70.0 + T * 3.0) * 0.006 * u_heat + (noise(vec2(uv.y * 30.0, T * 2.0)) - 0.5) * 0.02 * u_heat;
  }

  vec3 lab;
  if (u_fog > 0.001) {
    float r = u_fog * 0.14;
    float jitter = hash(frag + 7.31) * TAU; // rotate the sample spiral per pixel: noise instead of banding
    vec3 acc = evalLab(uv);
    float wsum = 1.0;
    for (int i = 1; i < 24; i++) {
      float fi = float(i);
      float a = fi * 2.39996323 + jitter;
      float rr = r * sqrt(fi / 24.0);
      vec2 o = vec2(cos(a), sin(a)) * rr / vec2(aspect(), 1.0);
      acc += evalLab(uv + o);
      wsum += 1.0;
    }
    lab = acc / wsum;
  } else {
    lab = evalLab(uv);
  }

  vec3 c = oklabToSrgb(lab);

  if (u_dusk > 0.001) {
    vec2 d = (uv - 0.5) * vec2(aspect(), 1.0) / max(aspect(), 1.0);
    c *= 1.0 - u_dusk * 0.75 * smoothstep(0.25, 0.85, length(d) * 1.35);
  }

  vec2 gp = floor(frag / max(u_pxScale, 1.0));
  if (u_haze > 0.001) {
    float g = hash(gp + u_seed * 17.0) - 0.5;
    float g2 = hash(gp * 1.7 + u_seed * 31.0 + 3.1) - 0.5;
    c += (g * 0.85 + g2 * 0.15) * u_haze * 0.28;
  }
  if (u_frost > 0.001) {
    float levels = mix(28.0, 2.5, pow(u_frost, 0.8));
    vec2 dp = floor(frag / (max(u_pxScale, 1.0) * mix(1.0, 3.0, u_frost)));
    c = floor(c * levels + bayer8(dp)) / levels;
  }

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;
