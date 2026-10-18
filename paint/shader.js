/**
 * The wb_paint_pars GLSL chunk that lets any material show paint: volume lookup, the four ink surface styles (Ember cracks, Frost facets, Spring ripples, Bloom leaves and vines), splatter droplets and relief, and the vitality fade and bloom-wave glow. Also builds the tiling 3D noise texture the chunk samples.
 */
import { Data3DTexture, LinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three';
import { makeRng } from '../core/math.js';
import { ATLAS_DEPTH, glslColor, GRID_X, GRID_Y, GRID_Z, PAINT_COLORS, VOXEL_SIZE } from './constants.js';
export function buildNoiseTexture() {
  const bytes = new Uint8Array(1048576);
  const rng = makeRng('wb-paint-noise3d');
  const grads = [];
  for (let ch = 0; ch < 4; ch++) {
    const grad = new Float32Array(12288);
    for (let j = 0; j < 4096; j++) {
      let gx = 0;
      let gy = 0;
      let gz = 0;
      let len = 0;
      do {
        gx = rng() * 2 - 1;
        gy = rng() * 2 - 1;
        gz = rng() * 2 - 1;
        len = gx * gx + gy * gy + gz * gz;
      } while (len > 1 || len < 0.001);
      len = Math.sqrt(len);
      grad[j * 3] = gx / len;
      grad[j * 3 + 1] = gy / len;
      grad[j * 3 + 2] = gz / len;
    }
    grads.push(grad);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const scale = 16 / 64;
  for (let z = 0; z < 64; z++) {
    const pz = (z + 0.5) * scale;
    const z0 = Math.floor(pz);
    const fz = pz - z0;
    const wz = fade(fz);
    for (let y = 0; y < 64; y++) {
      const py = (y + 0.5) * scale;
      const y0 = Math.floor(py);
      const fy = py - y0;
      const wy = fade(fy);
      for (let x = 0; x < 64; x++) {
        const px = (x + 0.5) * scale;
        const x0 = Math.floor(px);
        const fx = px - x0;
        const wx = fade(fx);
        const idx = ((z * 64 + y) * 64 + x) * 4;
        for (let ch = 0; ch < 4; ch++) {
          const grad = grads[ch];
          let sum = 0;
          for (let corner = 0; corner < 8; corner++) {
            const cx = corner & 1;
            const cy = (corner >> 1) & 1;
            const cz = (corner >> 2) & 1;
            const gi = ((((z0 + cz) % 16) * 16 + ((y0 + cy) % 16)) * 16 + ((x0 + cx) % 16)) * 3;
            const dot = grad[gi] * (fx - cx) + grad[gi + 1] * (fy - cy) + grad[gi + 2] * (fz - cz);
            const weight = (cx ? wx : 1 - wx) * (cy ? wy : 1 - wy) * (cz ? wz : 1 - wz);
            sum += dot * weight;
          }
          const value = Math.max(-1, Math.min(1, sum * 1.65));
          bytes[idx + ch] = Math.round((value * 0.5 + 0.5) * 255);
        }
      }
    }
  }
  const texture = new Data3DTexture(bytes, 64, 64, 64);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.name = 'wb-paint-noise3d';
  texture.needsUpdate = true;
  return texture;
}
export function buildPaintParsGlsl(defines = '') {
  return `
#ifndef WB_PAINT_PARS
#define WB_PAINT_PARS
${defines}
#include <wb_common>

// Stage detection: three.js defines gl_FragDepthEXT only in (non-raw) fragment shaders.
// Custom raw fragment shaders may #define WB_FRAGMENT_STAGE before including this chunk.
#if defined( gl_FragDepthEXT ) || defined( WB_FRAGMENT_STAGE )
  #define WB_PAINT_FRAG 1
#endif

uniform highp sampler3D uPaintVolume;
uniform vec3 uPaintVolumeMin;
uniform vec3 uPaintVolumeSize;
uniform sampler2D uVitalityMap;
uniform vec4 uVitalityBounds;
// Active vitality bloom waves: xy = centre (x,z), z = current radius, w = intensity (0 = off).
uniform vec4 uWbBloomWaves[4];
// Tiling 4-channel gradient noise (paint detail).
uniform highp sampler3D uWbNoise3D;

#define WB_PV_VOXEL ${VOXEL_SIZE.toFixed(4)}
#define WB_PV_BRICK ${(8).toFixed(1)}
#define WB_PV_PAD ${(10).toFixed(1)}
#define WB_PV_GX ${GRID_X}
#define WB_PV_GY ${GRID_Y}
#define WB_PV_GZ ${GRID_Z}
#define WB_PV_TW 160
#define WB_PV_TH 160
#define WB_PV_INDZ 240
#define WB_PV_TEX vec3(${(160).toFixed(1)}, ${(160).toFixed(1)}, ${ATLAS_DEPTH.toFixed(1)})
#define WB_NOISE_INV_PERIOD ${(1 / 16).toFixed(6)}
#define WB_NOISE_TEXELS_PER_CELL ${(4).toFixed(1)}

// Surface albedos (linear) derived from PAINT_COLORS, scaled to sit well under sunlight.
#define WB_PAINT_RED (${glslColor(PAINT_COLORS.red)} * 0.52)
#define WB_PAINT_BLUE (${glslColor(PAINT_COLORS.blue)} * 0.58)
#define WB_PAINT_YELLOW (${glslColor(PAINT_COLORS.yellow)} * vec3(0.92, 0.9, 0.8))
#define WB_PAINT_GREEN (${glslColor(PAINT_COLORS.green)} * 0.6)

// World-space size of one pixel (derivatives only exist in fragment shaders).
float wbPaintFootprint(vec3 wp) {
#ifdef WB_PAINT_FRAG
  vec3 fw = fwidth(wp);
  return max(max(fw.x, fw.y), fw.z) + 1e-5;
#else
  return length(uCameraPos - wp) * 0.0015 + 1e-4;
#endif
}

// Gradient noise at frequency f (cycles per metre): 4 decorrelated channels in about -1..1.
// Explicit LOD from the pixel footprint (fades to 0 when sub-pixel instead of aliasing).
vec4 wbPN(vec3 p, float f, float fp) {
  float lod = log2(max(fp * f * WB_NOISE_TEXELS_PER_CELL, 1.0));
  return textureLod(uWbNoise3D, p * (f * WB_NOISE_INV_PERIOD), lod) * 2.0 - 1.0;
}

vec3 wbPHash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

// 2D Voronoi: x = F1, y = F2-F1 (edge distance), z = cell hash, w = second hash
vec4 wbVoronoi2(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0, f2 = 8.0;
  vec2 id = n;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = wbHash22(n + g) * 0.85 + 0.075;
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; id = n + g; }
      else if (d < f2) { f2 = d; }
    }
  }
  f1 = sqrt(f1);
  f2 = sqrt(f2);
  return vec4(f1, f2 - f1, wbHash12(id), wbHash12(id + 7.31));
}

// Planar projection for patterns: top (xz) or side (vertical walls, uv.y = world up).
vec2 wbPaintSideUV(vec3 p, vec3 n) {
  vec3 an = abs(n);
  return an.x > an.z ? vec2(p.z * sign(n.x), p.y) : vec2(-p.x * sign(n.z), p.y);
}
vec3 wbPaintSideAxis(vec3 n) {
  vec3 an = abs(n);
  return an.x > an.z ? vec3(0.0, 0.0, sign(n.x)) : vec3(-sign(n.z), 0.0, 0.0);
}

// ── Volume lookup ───────────────────────────────────────────────────────────
// Coverage r=red(Ember) g=blue(Frost) b=yellow(Spring) a=green(Bloom), trilinear, 0..1.
vec4 wbPaintSample(vec3 worldPos) {
  vec3 c = (worldPos - uPaintVolumeMin) * (1.0 / WB_PV_VOXEL);
  vec3 bf = floor(c * (1.0 / WB_PV_BRICK));
  if (bf.x < 0.0 || bf.y < 0.0 || bf.z < 0.0 ||
      bf.x >= float(WB_PV_GX) || bf.y >= float(WB_PV_GY) || bf.z >= float(WB_PV_GZ)) return vec4(0.0);
  ivec3 b = ivec3(bf);
  int li = b.x + WB_PV_GX * (b.z + WB_PV_GZ * b.y);
  ivec3 ic = ivec3(li % WB_PV_TW, (li / WB_PV_TW) % WB_PV_TH, WB_PV_INDZ + li / (WB_PV_TW * WB_PV_TH));
  vec4 ind = texelFetch(uPaintVolume, ic, 0);
  if (ind.a < 0.5) return vec4(0.0);
  vec3 slot = floor(ind.rgb * 255.0 + 0.5);
  vec3 tc = slot * WB_PV_PAD + 1.0 + (c - bf * WB_PV_BRICK);
  return textureLod(uPaintVolume, tc / WB_PV_TEX, 0.0);
}

float wbPaintTotal(vec4 c) { return min(1.0, c.r + c.g + c.b + c.a); }

// Spring ripples: concentric rings following the dome-shaped coverage of each splat, expanding.
float wbSpringRing(float cov, float nz) {
  float s = 0.5 + 0.5 * sin(cov * 22.0 + uTime * 4.5 + nz * 2.6);
  return s * s * s;
}

// Paint thickness (for the fake relief) from coverage, edge threshold and yellow ripples.
float wbPaintBodyOf(vec4 c, float e, float nz) {
  float a = wbPaintTotal(c);
  float body = smoothstep(e, e + 0.11, a) * 0.8 + 0.5 * smoothstep(e + 0.04, 1.0, a);
  float yw = c.b / max(a, 1e-3);
  if (yw > 0.05) body += yw * wbSpringRing(c.b, nz) * 0.1 * smoothstep(e, e + 0.2, a);
  return body;
}

// Procedural splatter droplets around paint edges (3D jittered grid, sphere ∩ surface = dots).
float wbPaintDroplets(vec3 p, float density, float fp, out vec3 dropDir) {
  dropDir = vec3(0.0);
  const float S = 0.24;
  vec3 q = p / S;
  vec3 base = floor(q - 0.5);
  float best = 0.0;
  float aa = fp / S * 0.8 + 0.02;
  for (int i = 0; i < 8; i++) {
    vec3 cell = base + vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1));
    vec3 hh = wbPHash33(cell * 1.37 + 0.51);
    if (hh.x > density) continue;
    vec3 jit = wbPHash33(cell + 17.13) - 0.5;
    vec3 fpnt = cell + 0.5 + jit * 0.55;
    float r = mix(0.12, 0.42, hh.y * hh.y) * mix(0.55, 1.0, density);
    vec3 d = q - fpnt;
    float dist = length(d);
    float cov = 1.0 - smoothstep(r - aa, r + aa, dist);
    if (cov > best) { best = cov; dropDir = d / max(r, 1e-3); }
  }
  return best;
}

// ── Bloom (vines + leaves) ──────────────────────────────────────────────────
float wbBloomLeaves(vec2 uv, float dens, float steep, float fp, out vec3 col, out vec2 tilt) {
  const float S = 0.2;
  vec2 g = uv / S;
  vec2 ci = floor(g);
  float best = -1.0;
  float cov = 0.0;
  col = vec3(0.0);
  tilt = vec2(0.0);
  float aa = fp / S * 1.1 + 0.015;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = ci + vec2(float(i), float(j));
      vec2 h1 = wbHash22(c + 19.19);
      if (h1.x > dens) continue;
      vec2 rnd = wbHash22(c);
      vec2 ctr = c + 0.5 + (rnd - 0.5) * 0.85;
      float ang = mix(rnd.x * 6.2831, -1.5708 + (rnd.y - 0.5) * 2.2, steep * 0.85);
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 d = g - ctr;
      float len = mix(0.85, 1.35, h1.y);
      float u = dot(d, dir) + len * 0.12;
      float v = dot(d, vec2(-dir.y, dir.x));
      float t = u / len;
      if (t < -0.05 || t > 1.05) continue;
      float tc = clamp(t, 0.0, 1.0);
      float prof = len * 0.4 * sqrt(sin(3.14159 * tc)) * (1.0 - 0.3 * tc);
      float sd = abs(v) - prof;
      float c0 = 1.0 - smoothstep(-aa, aa, sd);
      if (c0 <= 0.001) continue;
      vec2 h2 = wbHash22(c + 3.3);
      if (h2.x > best) {
        best = h2.x;
        cov = c0;
        float hv = h2.y;
        vec3 leaf = mix(WB_PAINT_GREEN * vec3(0.6, 0.78, 0.5), WB_PAINT_GREEN * vec3(1.3, 1.12, 0.75), hv);
        leaf = mix(leaf, vec3(0.34, 0.6, 0.06), smoothstep(0.55, 1.0, tc) * 0.35 * hv);
        float rib = 1.0 - smoothstep(0.0, 0.035 + aa * 0.5, abs(v));
        leaf *= 1.0 - rib * 0.35 * step(0.08, tc);
        leaf *= mix(0.74, 1.0, smoothstep(0.0, prof * 0.8 + 1e-3, prof - abs(v)));
        col = leaf;
        float across = v / max(prof, 1e-3);
        tilt = vec2(-dir.y, dir.x) * across * 0.55 + dir * (tc - 0.4) * 0.35;
      }
    }
  }
  return cov;
}

vec3 wbBloomStyle(vec3 p, vec3 wn, float fp, vec4 n1, inout vec3 nrmTilt, out float leafCov) {
  float steep = 1.0 - smoothstep(0.55, 0.85, abs(wn.y));
  float dens = mix(0.8, 0.97, steep);
  vec3 an = abs(wn);
  vec3 base = WB_PAINT_GREEN * vec3(0.32, 0.45, 0.32);
  vec2 uvTop = p.xz;
  vec2 uvSide = wbPaintSideUV(p, wn);
  vec2 uvS = mix(uvTop, uvSide, steep);
  // vine stems: meandering noise contours, stretched vertically on walls
  float vn = wbPN(vec3(uvS.x, uvS.y * mix(1.0, 0.27, steep), 3.7), 1.5, fp).r;
  float stem = 1.0 - smoothstep(0.035, 0.07 + fp * 0.8, abs(vn));
  base = mix(base, vec3(0.1, 0.16, 0.04), stem * 0.85);
  float lod = 1.0 - smoothstep(0.035, 0.09, fp);
  vec3 col = base;
  leafCov = 0.0;
  if (lod > 0.0) {
    vec3 lc1 = vec3(0.0), lc2 = vec3(0.0);
    vec2 t1 = vec2(0.0), t2 = vec2(0.0);
    float wTop = smoothstep(0.45, 0.8, an.y);
    float c1 = 0.0, c2 = 0.0;
    if (wTop > 0.0) c1 = wbBloomLeaves(uvTop, dens, 0.0, fp, lc1, t1) * wTop;
    if (wTop < 1.0) c2 = wbBloomLeaves(uvSide + 37.0, dens, steep, fp, lc2, t2) * (1.0 - wTop * 0.6);
    if (c1 >= c2) {
      col = mix(col, lc1, c1);
      leafCov = c1;
      nrmTilt += (vec3(1.0, 0.0, 0.0) * t1.x + vec3(0.0, 0.0, 1.0) * t1.y) * c1;
    } else {
      col = mix(col, lc2, c2);
      leafCov = c2;
      nrmTilt += (wbPaintSideAxis(wn) * t2.x + vec3(0.0, 1.0, 0.0) * t2.y) * c2;
    }
    col = mix(base * 0.5 + WB_PAINT_GREEN * 0.55, col, lod);
    leafCov *= lod;
  } else {
    col = mix(base, WB_PAINT_GREEN * 0.8, 0.65);
  }
  col *= 0.88 + 0.12 * n1.g;
  return col;
}

// ── Ember ───────────────────────────────────────────────────────────────────
vec3 wbEmberStyle(vec3 p, float amt, float e, float fp, out float rough, out vec3 em) {
  vec3 base = WB_PAINT_RED;
  base = mix(base, WB_PAINT_RED * vec3(0.62, 0.3, 0.35), smoothstep(e + 0.1, 1.0, amt) * 0.45);
  // domain-warped ridged noise → branching cracks
  vec4 w = wbPN(p + 3.0, 0.7, fp);
  vec3 pw = p + w.rgb * 0.45;
  float n1 = wbPN(pw, 1.15, fp).r;
  float n2 = wbPN(pw + 4.1, 2.6, fp).g;
  float lod = 1.0 - smoothstep(0.04, 0.14, fp);
  float w1 = 0.028 + fp * 0.7;
  float veins = 1.0 - smoothstep(w1 * 0.25, w1, abs(n1));
  veins = max(veins, (1.0 - smoothstep(w1 * 0.15, w1 * 0.55, abs(n2))) * 0.45 * smoothstep(0.35, 0.0, abs(n1)));
  float inner = smoothstep(e + 0.02, e + 0.2, amt);
  veins *= inner * lod;
  float charred = (1.0 - smoothstep(w1, w1 * 4.0, abs(n1))) * inner * lod;
  base *= 1.0 - charred * 0.45;
  base = mix(base, vec3(0.06, 0.012, 0.004), veins * 0.8);
  float pulse = 0.5 + 0.5 * sin(uTime * 2.1 + w.a * 7.0);
  float flick = 0.85 + 0.15 * sin(uTime * 11.0 + n2 * 17.0);
  vec3 glow = mix(vec3(1.0, 0.12, 0.01), vec3(1.0, 0.38, 0.05), veins * pulse);
  em = glow * veins * (0.3 + 0.7 * pulse) * flick * 1.6;
  em += vec3(1.0, 0.12, 0.01) * charred * (0.1 + 0.25 * pulse);
  em += vec3(1.0, 0.08, 0.01) * (0.035 + 0.035 * pulse) * inner;
  // far away: warm average glow instead of sub-pixel veins
  em += vec3(1.0, 0.3, 0.05) * 0.14 * (1.0 - lod) * inner * (0.5 + 0.5 * pulse);
  rough = 0.24;
  return base;
}

// ── Frost ───────────────────────────────────────────────────────────────────
vec3 wbFrostStyle(vec3 p, vec3 wn, float amt, float e, float fp, out float rough, out vec3 em, inout vec3 nrmTilt) {
  vec3 ice = mix(WB_PAINT_BLUE, vec3(0.5, 0.72, 0.86), 0.3);
  vec3 deep = mix(WB_PAINT_BLUE, vec3(0.3, 0.55, 0.85), 0.2);
  vec3 base = mix(ice, deep, smoothstep(e + 0.12, 1.0, amt) * 0.5);
  float lod = 1.0 - smoothstep(0.03, 0.1, fp);
  float innerF = smoothstep(e + 0.03, e + 0.15, amt);
  float crack = 0.0;
  if (lod > 0.0) {
    // crystalline facets (Voronoi in the dominant plane)
    vec3 an = abs(wn);
    bool top = an.y > 0.6;
    vec2 uv = top ? p.xz : wbPaintSideUV(p, wn);
    vec4 vor = wbVoronoi2(uv * 2.6);
    base *= mix(1.0, mix(0.9, 1.1, vor.z), lod);
    vec2 ft = (vec2(vor.z, vor.w) - 0.5) * 0.5 * lod;
    vec3 axU = top ? vec3(1.0, 0.0, 0.0) : wbPaintSideAxis(wn);
    vec3 axV = top ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    nrmTilt += (axU * ft.x + axV * ft.y) * innerF;
    crack = (1.0 - smoothstep(0.01, 0.025 + fp * 2.6, vor.y)) * lod;
    base = mix(base, vec3(0.86, 0.95, 1.0), crack * 0.5 * innerF);
  }
  // frost feathers near the rim (ridged noise)
  float fr = 1.0 - abs(wbPN(p + 2.0, 5.5, fp).b);
  float frostRim = 1.0 - smoothstep(e, e + 0.22, amt);
  float feathers = smoothstep(0.78, 0.95, fr) * lod * (0.35 + frostRim);
  base = mix(base, vec3(0.9, 0.96, 1.0), clamp(feathers * 0.7 + frostRim * 0.8, 0.0, 1.0));
  rough = mix(0.04, 0.55, clamp(max(frostRim, feathers * 0.6 + crack * 0.3), 0.0, 1.0));
  // crystalline sparkle
  em = vec3(0.05, 0.14, 0.26) * 0.18;
  float spLod = 1.0 - smoothstep(0.012, 0.035, fp);
  if (spLod > 0.0) {
    vec3 sp = p * 20.0;
    vec3 cell = floor(sp);
    vec3 hh = wbPHash33(cell);
    vec3 fn = normalize(wn + (wbPHash33(cell + 1.3) - 0.5) * 1.7);
    vec3 V = normalize(uCameraPos - p);
    vec3 H = normalize(uSunDir + V);
    float glint = pow(max(dot(fn, H), 0.0), 140.0) * step(0.45, hh.x);
    glint *= smoothstep(0.5, 0.12, length(fract(sp) - 0.5));
    float tw = 0.55 + 0.45 * sin(uTime * 5.0 + hh.y * 50.0);
    em += vec3(0.92, 0.98, 1.0) * glint * tw * 8.0 * spLod * max(uSunDir.y, 0.15);
  }
  return base;
}

// ── Spring ──────────────────────────────────────────────────────────────────
vec3 wbSpringStyle(float cov, float amt, float e, float nz, out float rough, out vec3 em) {
  vec3 gold = WB_PAINT_YELLOW;
  vec3 deep = WB_PAINT_YELLOW * vec3(1.0, 0.84, 0.5);
  vec3 base = mix(gold, deep, smoothstep(e + 0.12, 1.0, amt) * 0.25);
  float ring = wbSpringRing(cov, nz) * smoothstep(e, e + 0.2, amt);
  // warm inner glow so Spring reads as energised / bouncy even in shade
  em = vec3(1.0, 0.82, 0.4) * ring * 0.24 + WB_PAINT_YELLOW * vec3(0.14, 0.1, 0.0);
  base = mix(base, gold * 1.15, ring * 0.15);
  rough = 0.09;
  return base;
}

// Full paint surface. nrm (world space) is perturbed for relief; envAmt scales the fake
// sky reflection (use ~0.3 when the material has a real env map). Returns paint mask (0..1).
// Call in uniform control flow in fragment shaders (uses screen-space derivatives).
float wbPaintSurfaceN(inout vec3 albedo, inout float roughness, inout vec3 emissive, inout vec3 nrm,
                      vec3 wp, vec3 wn, float envAmt) {
  float fp = wbPaintFootprint(wp);
#ifdef WBP_NO_PAINT
  return 0.0;
#endif
  vec4 cov = wbPaintSample(wp);
  float amt = wbPaintTotal(cov);
  if (amt < 0.02) return 0.0;

  // Noise: n1 = low-frequency field (edge, lumps, ripple phase), n2 = detail
  vec4 n1 = wbPN(wp, 1.6, fp);
  vec4 n2 = wbPN(wp + 7.1, 4.6, fp);
  float e = 0.42 + (n1.r * 0.62 + n2.g * 0.38) * 0.2;
  if (fp < 0.03) e += wbPN(wp + 3.7, 12.0, fp).b * 0.035;

  vec3 T = normalize(abs(wn.y) < 0.95 ? cross(wn, vec3(0.0, 1.0, 0.0)) : cross(wn, vec3(1.0, 0.0, 0.0)));
  vec3 Bv = cross(wn, T);

  // Relief taps (skipped when far away): coverage gradient → rounded paint lip
  float relief = 1.0 - smoothstep(0.06, 0.2, fp);
#ifdef WBP_NO_RELIEF
  relief = 0.0;
#endif
  float tap = clamp(fp * 1.5, 0.025, 0.2);
  vec2 grad = vec2(0.0);
  float aw = fp * 2.2 + 0.01;
  if (relief > 0.0) {
    vec4 cT = wbPaintSample(wp + T * tap);
    vec4 cB = wbPaintSample(wp + Bv * tap);
    float body = wbPaintBodyOf(cov, e, n1.a);
    grad = vec2(wbPaintBodyOf(cT, e, n1.a) - body, wbPaintBodyOf(cB, e, n1.a) - body) / tap;
    aw = length(vec2(wbPaintTotal(cT) - amt, wbPaintTotal(cB) - amt)) / tap * fp * 0.9 + 0.006;
  }

  float m = smoothstep(e - aw, e + aw, amt);
  vec4 w4 = cov * cov;
  w4 *= w4;
  w4 /= max(dot(w4, vec4(1.0)), 1e-6);

  // Splatter droplets in the fringe (Bloom grows leaves instead)
  vec3 dropDir = vec3(0.0);
  float fringe = smoothstep(0.03, e, amt) * (1.0 - m);
  float dLod = 1.0 - smoothstep(0.05, 0.12, fp);
#ifdef WBP_NO_DROPS
  dLod = 0.0;
#endif
  float dens = fringe * 0.6 * (1.0 - w4.a * 0.7);
  float drop = (dLod > 0.0 && dens > 0.001) ? wbPaintDroplets(wp, dens, fp, dropDir) * dLod : 0.0;
  float mask = max(m, drop);

  vec3 tilt = vec3(0.0);
  vec3 pAlb = vec3(0.0);
  vec3 pEm = vec3(0.0);
  float pRough = 0.0;
  float gloss = 0.0;
#ifdef WBP_FLAT_STYLE
  pAlb = cov.rgb + vec3(cov.a * 0.2); pRough = 0.3; w4 = vec4(0.0);
#endif
  if (w4.r > 0.01) {
    float r; vec3 em;
    pAlb += w4.r * wbEmberStyle(wp, amt, e, fp, r, em);
    pEm += w4.r * em; pRough += w4.r * r; gloss += w4.r * 0.75;
  }
  if (w4.g > 0.01) {
    float r; vec3 em; vec3 tt = vec3(0.0);
    pAlb += w4.g * wbFrostStyle(wp, wn, amt, e, fp, r, em, tt);
    pEm += w4.g * em; pRough += w4.g * r; gloss += w4.g * 1.0;
    tilt += tt * w4.g;
  }
  if (w4.b > 0.01) {
    float r; vec3 em;
    pAlb += w4.b * wbSpringStyle(cov.b, amt, e, n1.a, r, em);
    pEm += w4.b * em; pRough += w4.b * r; gloss += w4.b * 1.0;
  }
  if (w4.a > 0.01) {
    float lc;
    vec3 tt = vec3(0.0);
    pAlb += w4.a * wbBloomStyle(wp, wn, fp, n1, tt, lc);
    float leafMask = smoothstep(e - 0.12 - aw, e - 0.12 + aw, amt) * lc;
    mask = max(mask, leafMask * w4.a);
    tilt += tt * w4.a;
    pRough += w4.a * mix(0.6, 0.4, lc); gloss += w4.a * 0.3;
  }

  // Rim: slightly darker, thicker lip where the paint ends (coffee-ring)
  float rim = m * (1.0 - smoothstep(e, e + 0.12, amt));
  pAlb *= 1.0 - rim * 0.3 * (1.0 - w4.a);
  pAlb *= 1.0 - 0.1 * (1.0 - m) * drop;

  // Contact shadow on the surface just outside the paint: makes it read as raised
  float ao = smoothstep(e - 0.16, e, amt) * (1.0 - mask) * relief;
  albedo *= 1.0 - 0.3 * ao;

  // Normal perturbation: paint relief + gentle lumps + droplet domes + facet/leaf tilt
  const float kH = 0.065;
  vec3 pn = wn - (T * grad.x + Bv * grad.y) * kH * relief;
  pn += (T * n2.r + Bv * n2.b) * 0.07 * m * relief;
  vec3 dropTan = dropDir - wn * dot(dropDir, wn);
  pn += dropTan * 0.9 * drop * (1.0 - m);
  pn += tilt * relief;
  pn = normalize(pn);

  // Wet sky reflection (fresnel), strongest on glossy paint
  vec3 V = normalize(uCameraPos - wp);
  vec3 R = reflect(-V, pn);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(pn, V), 0.0, 1.0), 5.0);
  vec3 sky = mix(uGroundColor * 0.45, uSkyColor * 1.1, smoothstep(-0.2, 0.45, R.y));
  pEm += sky * fres * gloss * envAmt * 0.6;

  albedo = mix(albedo, pAlb, mask);
  roughness = mix(roughness, pRough, mask);
  emissive += pEm * mask;
  nrm = normalize(mix(nrm, pn, mask));
  return mask;
}

// Contract version (no normal output): relief is baked into the albedo as sun-facing shading.
void wbPaintSurface(inout vec3 albedo, inout float roughness, inout vec3 emissive, vec3 worldPos, vec3 worldNormal) {
  vec3 n = worldNormal;
  float m = wbPaintSurfaceN(albedo, roughness, emissive, n, worldPos, worldNormal, 1.0);
  if (m > 0.0) {
    float l0 = max(dot(worldNormal, uSunDir), 0.0) * 0.75 + 0.25;
    float l1 = max(dot(n, uSunDir), 0.0) * 0.75 + 0.25;
    albedo *= mix(1.0, clamp(l1 / l0, 0.55, 1.6), m);
    // stylised wet highlight for custom (non-PBR) shaders
    vec3 V = normalize(uCameraPos - worldPos);
    vec3 H = normalize(uSunDir + V);
    float sp = pow(max(dot(n, H), 0.0), mix(20.0, 160.0, 1.0 - roughness)) * (1.0 - roughness);
    emissive += uSunColor * sp * 0.6 * m;
  }
}

// ── Vitality ────────────────────────────────────────────────────────────────
float wbVitality(vec3 worldPos) {
  vec2 uv = (worldPos.xz - uVitalityBounds.xy) / uVitalityBounds.zw;
  return textureLod(uVitalityMap, uv, 0.0).r;
}

// Vitality with an organic, watercolour-bleed boundary.
float wbVitalityShaped(vec3 p) {
  float v = wbVitality(p);
  if (v > 0.995) return 1.0;
  float n = wbNoise2(p.xz * 0.09) * 0.6 + wbNoise2(p.xz * 0.37 + 3.1) * 0.28 + wbNoise2(p.xz * 1.9 + 7.7) * 0.12;
  return smoothstep(0.14, 0.86, v + (n - 0.5) * 0.5);
}

// Bloom wave fronts (magical prismatic glow sweeping outward). Emissive-ish colour.
vec3 wbVitalityGlow(vec3 p) {
  vec3 g = vec3(0.0);
#ifdef WBP_NO_VIT
  return g;
#endif
  for (int i = 0; i < 4; i++) {
    vec4 w = uWbBloomWaves[i];
    if (w.w <= 0.0) continue;
    vec2 dv = p.xz - w.xy;
    float d = length(dv);
    if (d > w.z + 12.0) continue;
    float width = 0.55 + w.z * 0.022;
    float wob = (wbNoise2(p.xz * 0.21 + w.xy) - 0.5) * (1.5 + w.z * 0.08);
    float x = (d + wob - w.z) / width;
    float front = exp(-x * x);
    // thin bright core on the leading edge
    float core = exp(-x * x * 6.0);
    float hue = fract(d * 0.018 + atan(dv.y, dv.x) * 0.159 + uTime * 0.15);
    vec3 prism = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
    prism *= prism;
    g += (prism * front * 1.1 + vec3(1.0, 0.95, 0.82) * core * 0.8) * w.w;
  }
  return g * 0.6;
}

// 0..1 just behind an active wave front: colours overshoot (extra vivid) then settle.
float wbBloomBoost(vec3 p) {
  float b = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 w = uWbBloomWaves[i];
    if (w.w <= 0.0) continue;
    float d = length(p.xz - w.xy);
    float behind = w.z - d;
    b = max(b, smoothstep(0.0, 1.5, behind) * smoothstep(9.0 + w.z * 0.1, 0.0, behind) * w.w);
  }
  return b;
}

vec3 wbFadeColor(vec3 color, vec3 p) {
  float l = wbLuma(color);
  vec3 faded = mix(vec3(l), color, 0.4);
  // cool the hue slightly (greens drift toward sage/teal, warm tones toward dusty rose)
  faded = mix(faded, faded * vec3(0.92, 1.0, 1.12), 0.6);
  // lifted blacks and gentle paper granulation, like an old watercolour
  float gran = wbNoise2(p.xz * 0.31) * 0.6 + wbNoise2(p.xz * 1.7 + 5.0) * 0.4;
  faded = faded * (0.86 + 0.1 * gran) + vec3(0.03, 0.036, 0.05) * (0.7 + l);
  return faded;
}

vec3 wbApplyVitalityRaw(vec3 color, vec3 worldPos) {
#ifdef WBP_NO_VIT
  return color;
#endif
  float vv = wbVitalityShaped(worldPos);
  float boost = wbBloomBoost(worldPos);
  vec3 rich = max(wbSaturation(color, 1.1 + boost * 0.45) * (1.0 + boost * 0.12), vec3(0.0));
  if (vv >= 1.0) return rich;
  return mix(wbFadeColor(color, worldPos), rich, vv);
}

vec3 wbApplyVitality(vec3 color, vec3 worldPos) {
  vec3 c = wbApplyVitalityRaw(color, worldPos);
  // custom shaders get the wave glow as an albedo boost
  return c + wbVitalityGlow(worldPos) * (0.35 + c);
}
#endif
`;
}
