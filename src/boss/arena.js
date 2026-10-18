/**
 * Greymaw's arena in the north: a stone platform levelled above the terrain with stairs facing the summit, ruined walls with faded colour murals, pillars, braziers and rubble, merged into one stone mesh with a procedural shader. Also the swirling ink pool, the barrier wall, the storm vortex and cloud, the creeping edge ink and the arena's colliders.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  TorusGeometry,
  UniformsLib,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { BOSS_ARENA, COLLISION_GROUPS, COLORS, PALETTE } from '../core/config.js';
import { makeRng } from '../core/math.js';
import { colorize, mergeStatic, rockGeometry } from './geometry.js';
import { clamp, TAU } from './math.js';
export const POOL_RADIUS = 6.2;
const FLOOR_RADIUS = 21.7;
const RIM_RADIUS = 22.6;
const BARRIER_RADIUS = 23.1;
const PILLAR_RADIUS = 19.2;
const WALL_RADIUS = 20.9;
const KIND_PLAIN = 0;
const KIND_FLOOR = 1;
const KIND_FOUNDATION = 2;
const KIND_TRIM = 3;
const STONE = 10130571;
const STONE_DARK = 8354419;
const STONE_PALE = 10721932;
function fogUniforms(ctx) {
  const uniforms = {};
  const fog = UniformsLib.fog;
  for (const key of Object.keys(fog)) uniforms[key] = fog[key];
  Object.assign(uniforms, ctx.globals);
  return uniforms;
}
const STONE_COMMON_VERTEX = `
attribute float aKind;
varying vec3 vBsPos;
varying vec3 vBsNrm;
varying float vBsKind;
`;
const STONE_WORLDPOS_VERTEX = `
{
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vBsPos = wp.xyz;
  vBsNrm = normalize(mat3(modelMatrix) * objectNormal);
  vBsKind = aKind;
}
`;
const STONE_COMMON_FRAGMENT = `
#include <wb_common>
varying vec3 vBsPos;
varying vec3 vBsNrm;
varying float vBsKind;
uniform vec3 uArenaC;
uniform float uVictory;
uniform float uStain;
uniform vec4 uInlayCol[4];
uniform float uStairAng;
vec3 bsPerturb(vec3 surfPos, vec3 surfNorm, float h) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
float bsVor(vec2 x) {
  vec2 n = floor(x); vec2 f = fract(x);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = wbHash22(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(f2) - sqrt(f1);
}
`;
const STONE_COLOR_FRAGMENT = `
float bsH = 0.0;
float bsGlow = 0.0;
vec3 bsGlowCol = vec3(0.0);
{
  vec3 p = vBsPos;
  vec3 n = normalize(vBsNrm);
  float big = wbNoise3(p * 0.31);
  float mid = wbNoise3(p * 1.27 + 7.1);
  float fine = wbNoise3(p * 4.9 - 3.3);
  bsH = mid * 0.55 + fine * 0.35 + wbNoise3(p * 13.0) * 0.1;
  vec3 col = diffuseColor.rgb;
  col *= 0.82 + 0.22 * big + 0.1 * mid + 0.07 * fine;
  col = mix(col, col * vec3(1.06, 0.97, 0.88), smoothstep(0.3, 0.75, wbNoise3(p * 0.08 + 3.0)));
  vec2 d = p.xz - uArenaC.xz;
  float r = length(d);
  float ang = atan(d.y, d.x);
  float kind = vBsKind;
  float groove = 0.0;
  if (kind > 0.5 && kind < 1.5) {
    // concentric rings of flagstones, staggered joints
    float ringW = 1.65;
    float ri = floor(r / ringW);
    float rf = fract(r / ringW);
    float circ = 6.2832 * (ri + 0.5) * ringW;
    float nseg = max(5.0, floor(circ / 2.3));
    float aa = (ang / 6.2832 + 0.5) * nseg + wbHash12(vec2(ri, 3.1)) * 7.0;
    float si = floor(aa);
    float sf = fract(aa);
    float jr = min(rf, 1.0 - rf) * ringW;
    float ja = min(sf, 1.0 - sf) * (circ / nseg);
    float wob = (fine - 0.5) * 0.05 + (mid - 0.5) * 0.04;
    float joint = min(jr, ja) + wob;
    groove = 1.0 - smoothstep(0.035, 0.1, joint);
    float sh = wbHash12(vec2(ri * 7.3, si + ri * 31.0));
    col *= 0.84 + 0.26 * sh;
    col = mix(col, col * vec3(0.92, 0.95, 1.06), step(0.62, fract(sh * 7.1)) * 0.6);
    // chipped edges + cracks
    float cr = bsVor(p.xz * 0.9 + sh * 11.0);
    float crack = (1.0 - smoothstep(0.02, 0.06, cr)) * smoothstep(0.55, 0.75, wbNoise3(p * 0.7 + sh * 5.0));
    groove = max(groove, crack * 0.8);
    // the centre basin under the ink pool: smooth, darker, ink-stained
    float basin = 1.0 - smoothstep(${POOL_RADIUS.toFixed(2)} - 0.1, ${POOL_RADIUS.toFixed(2)} + 0.05, r);
    col = mix(col, vec3(0.2, 0.19, 0.23) * (0.8 + 0.4 * mid), basin * (1.0 - uVictory * 0.55));
    // compass inlay ring: four coloured-glass sectors around the pool
    float ringD = abs(r - 9.6);
    float band = 1.0 - smoothstep(0.34, 0.42, ringD);
    float edge = (1.0 - smoothstep(0.0, 0.05, abs(ringD - 0.42))) * 0.8;
    float sectorF = (ang - uStairAng) / 6.2832 * 4.0 + 0.5;
    float sectorI = mod(floor(sectorF), 4.0);
    float sectorE = min(fract(sectorF), 1.0 - fract(sectorF));
    float glass = band * smoothstep(0.03, 0.06, sectorE);
    vec3 gcol = uInlayCol[0].rgb;
    if (sectorI > 0.5) gcol = uInlayCol[1].rgb;
    if (sectorI > 1.5) gcol = uInlayCol[2].rgb;
    if (sectorI > 2.5) gcol = uInlayCol[3].rgb;
    float shimmer = 0.75 + 0.25 * sin(uTime * 1.7 + ang * 3.0);
    col = mix(col, mix(vec3(0.34, 0.33, 0.36), gcol * 0.8, 0.25 + 0.75 * uVictory), glass);
    bsGlow = glass * (0.05 + uVictory * 1.1 * shimmer);
    bsGlowCol = gcol;
    groove = max(groove, edge);
    // grey ink veins crawling out from the pool (the stolen colour's wake)
    float vein = bsVor(vec2(ang * 3.0, r * 0.35) + vec2(0.0, -uTime * 0.02));
    float veinM = (1.0 - smoothstep(0.03, 0.12, vein)) * smoothstep(${(23).toFixed(1)}, 7.0, r) * smoothstep(0.35, 0.65, wbNoise3(p * 0.21));
    float stain = smoothstep(0.52, 0.72, wbNoise3(p * 0.33 + 17.0) + big * 0.2) * 0.6;
    float ink = max(veinM, stain * smoothstep(${(24).toFixed(1)}, 4.0, r)) * uStain;
    col = mix(col, vec3(0.17, 0.16, 0.2), ink * 0.72);
  } else if (kind > 1.5 && kind < 2.5) {
    // foundation courses: staggered ashlar blocks
    float ch = 0.95;
    float ci = floor(p.y / ch);
    float cf = fract(p.y / ch);
    float arc = (ang + 3.14159) * max(r, 1.0);
    float bw = 1.9;
    float bi = floor(arc / bw + ci * 0.5);
    float bf = fract(arc / bw + ci * 0.5);
    float joint = min(min(cf, 1.0 - cf) * ch, min(bf, 1.0 - bf) * bw) + (fine - 0.5) * 0.04;
    groove = 1.0 - smoothstep(0.03, 0.09, joint);
    float sh = wbHash12(vec2(ci, bi));
    col *= 0.85 + 0.22 * sh;
    // ink stains dripping down from the rim
    float drip = smoothstep(0.62, 0.8, wbNoise2(vec2(arc * 0.6, p.y * 0.05)) ) * smoothstep(uArenaC.y - 7.0, uArenaC.y, p.y);
    col = mix(col, vec3(0.19, 0.18, 0.22), drip * 0.55 * uStain);
  } else if (kind > 2.5) {
    // carved trim: engraved brush-stroke band
    float t = fract((ang + 3.14159) * 3.0 + p.y * 0.2);
    groove = (1.0 - smoothstep(0.0, 0.05, abs(t - 0.5))) * 0.5;
  }
  col *= 1.0 - groove * 0.42;
  // ground contact grime + moss low down
  float above = p.y - wbTerrainHeight(p.xz);
  float dirt = 1.0 - smoothstep(-0.2, 0.6 + 0.8 * big, above);
  col = mix(col, col * vec3(0.6, 0.56, 0.46), dirt * 0.65);
  float up = smoothstep(0.4, 0.9, n.y);
  float lich = wbNoise3(p * 2.7 + 5.0) * 0.6 + fine * 0.4;
  float moss = (1.0 - up * 0.7) * smoothstep(0.62, 0.82, lich + big * 0.15) * (kind > 0.5 && kind < 1.5 ? 0.25 : 0.7);
  moss = max(moss, (1.0 - smoothstep(0.2, 2.0, above)) * smoothstep(0.4, 0.7, lich) * 0.8);
  vec3 mossCol = mix(vec3(0.08, 0.14, 0.04), vec3(0.22, 0.3, 0.08), fine);
  col = mix(col, mossCol, moss * 0.75);
  // old painter's stains on vertical stone
  float vert = 1.0 - abs(n.y);
  float sn = wbNoise3(vec3(p.x * 2.1, p.y * 0.6 + p.x * 0.2, p.z * 2.1) + 40.0);
  float stainC = smoothstep(0.8, 0.83, sn + fine * 0.05) * vert * smoothstep(0.35, 0.6, wbNoise3(p * 0.3 + 7.0));
  float which = wbNoise3(p * 0.045 + 90.0);
  vec3 sc = which < 0.42 ? vec3(0.95, 0.28, 0.16) : which < 0.5 ? vec3(0.22, 0.6, 0.95) : which < 0.58 ? vec3(1.0, 0.78, 0.18) : vec3(0.3, 0.78, 0.32);
  col = mix(col, sc * (0.5 + 0.25 * big), stainC * (0.25 + 0.4 * uVictory));
  bsH = bsH * (1.0 - groove) - groove * 0.4;
  diffuseColor.rgb = col;
}
`;
const POOL_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
varying vec3 vWp;
varying vec2 vQ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vQ = position.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const POOL_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
uniform float uAgit;
uniform float uDrain;
uniform float uRadius;
uniform vec3 uBossPos;
uniform float uBossR;
uniform float uHue;
varying vec3 vWp;
varying vec2 vQ;
vec3 hue4(float h) {
  vec3 R = vec3(1.0, 0.16, 0.06), Y = vec3(1.0, 0.7, 0.1), G = vec3(0.15, 0.7, 0.2), B = vec3(0.1, 0.55, 1.0);
  h = fract(h) * 4.0;
  vec3 c = mix(R, Y, clamp(h, 0.0, 1.0));
  c = mix(c, G, clamp(h - 1.0, 0.0, 1.0));
  c = mix(c, B, clamp(h - 2.0, 0.0, 1.0));
  return mix(c, R, clamp(h - 3.0, 0.0, 1.0));
}
void main() {
  float r = length(vQ);
  float R = uRadius * (1.0 - uDrain * 0.999);
  float edgeN = (wbNoise2(vec2(atan(vQ.y, vQ.x) * 4.0, uTime * 0.3)) - 0.5) * 0.35;
  if (r > R + edgeN * (0.3 + uDrain)) discard;
  float a = atan(vQ.y, vQ.x);
  float t = uTime;
  // swirling marbled ink
  vec2 sw = vec2(a * 2.0 + t * 0.12 + r * 0.25, r * 0.9 - t * 0.2);
  float m1 = wbNoise2(sw * 1.3);
  float m2 = wbNoise2(sw * 3.1 + m1 * 2.0 + 9.0);
  vec3 col = mix(vec3(0.02, 0.019, 0.028), vec3(0.06, 0.056, 0.075), m1);
  // stolen colours glinting in the marbling
  float veins = smoothstep(0.55, 0.8, m2) * (0.35 + uAgit * 0.8);
  col += hue4(m1 * 1.5 + t * 0.03 + uHue) * veins * 0.22;
  // ripples around the boss body
  float db = length(vWp.xz - uBossPos.xz);
  float rip = sin(db * 4.0 - t * (3.0 + uAgit * 5.0)) * 0.5 + 0.5;
  rip *= smoothstep(uBossR + 3.5, uBossR, db) * smoothstep(uBossR - 0.3, uBossR + 0.3, db);
  // bubbles
  vec2 cell = floor(vQ * 1.4);
  vec2 f = fract(vQ * 1.4) - 0.5;
  float bh = wbHash12(cell);
  float bt = fract(t * (0.35 + bh * 0.4 + uAgit * 0.9) + bh * 7.0);
  vec2 bo = (wbHash22(cell + floor(t * 0.3 + bh)) - 0.5) * 0.5;
  float bub = smoothstep(0.1 + bt * 0.25, 0.06 + bt * 0.25, length(f - bo)) * step(0.82 - uAgit * 0.5, bh) * (1.0 - bt);
  float ring = (1.0 - smoothstep(0.0, 0.03, abs(length(f - bo) - bt * 0.45))) * step(0.82 - uAgit * 0.5, bh) * (1.0 - bt) * step(0.6, bt);
  // glossy reflection
  vec3 V = normalize(uCameraPos - vWp);
  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
  vec3 sky = mix(uSkyColor * 0.4, uSkyColor * 0.9, fres);
  col += sky * (0.04 + 0.28 * fres);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(H.y, 0.0), 180.0) * 1.5;
  col += uSunColor * spec * (0.6 + m1);
  col += vec3(0.12, 0.11, 0.14) * rip * (0.4 + uAgit);
  col += vec3(0.12, 0.11, 0.15) * bub + vec3(0.22) * ring;
  // rim darkening + wet edge
  col *= 0.8 + 0.2 * smoothstep(R, R - 0.6, r);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;
const BARRIER_VERTEX = `
#include <wb_common>
varying vec2 vUv;
varying vec3 vWp;
uniform float uRaise;
uniform float uH;
void main() {
  vec3 p = position;
  p.y *= uRaise;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWp = wp.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const BARRIER_FRAGMENT = `
#include <wb_common>
varying vec2 vUv;
varying vec3 vWp;
uniform float uRaise;
uniform float uFlash;
uniform vec3 uHitP;
void main() {
  float u = vUv.x * 6.2832;
  float y = vUv.y;
  float t = uTime;
  vec2 q = vec2(vUv.x * 42.0, y * 7.0);
  float n1 = wbNoise2(q + vec2(t * 0.9, -t * 1.3));
  float n2 = wbNoise2(q * 2.3 + vec2(-t * 1.6, -t * 2.2) + n1 * 1.5);
  float streak = smoothstep(0.45, 0.85, wbNoise2(vec2(vUv.x * 90.0, y * 2.0 - t * 1.4)));
  float dens = (0.35 + 0.65 * n1) * (1.0 - smoothstep(0.35, 1.0, y + (n2 - 0.5) * 0.35));
  dens += (1.0 - smoothstep(0.0, 0.12, y)) * 0.6;
  float a = clamp(dens, 0.0, 1.0) * 0.62 * smoothstep(0.0, 0.2, uRaise);
  vec3 col = mix(vec3(0.05, 0.045, 0.07), vec3(0.28, 0.25, 0.34), n2 * 0.7 + streak * 0.5);
  col += vec3(0.45, 0.4, 0.62) * streak * (1.0 - y) * 0.45;
  // ripple where the hero bumps into it
  float dh = length(vWp - uHitP);
  float rip = uFlash * (1.0 - smoothstep(0.0, 3.5, dh)) * (0.5 + 0.5 * sin(dh * 6.0 - t * 18.0));
  col += vec3(0.7, 0.62, 0.95) * rip;
  a = max(a, rip * 0.6);
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * a, a);
}
`;
const VORTEX_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vWp;
varying vec3 vN;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const VORTEX_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec3 vWp;
varying vec3 vN;
uniform float uClear;
uniform float uCloud;
uniform float uSpin;
void main() {
  float t = uTime * uSpin;
  vec2 q;
  float a;
  vec3 col;
  if (uCloud > 0.5) {
    // storm disc: uv centred, radius 1 at the rim
    vec2 c = vUv * 2.0 - 1.0;
    float r = length(c);
    if (r > 1.0) discard;
    float ang = atan(c.y, c.x);
    vec2 sw = vec2(ang * 3.0 + t * 0.05 + r * 4.0, r * 3.0 - t * 0.03);
    float n1 = wbNoise2(sw * 1.4);
    float n2 = wbNoise2(sw * 3.7 + n1 * 1.8 + 4.0);
    float d = (0.55 + 0.45 * n1) * smoothstep(1.0, 0.45, r + (n2 - 0.5) * 0.3);
    a = d * 0.85;
    col = mix(vec3(0.19, 0.18, 0.22), vec3(0.42, 0.41, 0.46), n2 * 0.8 + (1.0 - r) * 0.2);
    // dissolving with golden edges
    float dis = uClear * 1.25 - (n1 * 0.6 + (1.0 - r) * 0.4);
    col += vec3(1.2, 0.9, 0.5) * (1.0 - smoothstep(0.0, 0.12, abs(dis))) * step(0.001, uClear) * 1.5;
    a *= 1.0 - smoothstep(-0.02, 0.05, dis);
  } else {
    float y = vUv.y;
    float ang = vUv.x * 6.2832;
    // twisting smoke bands spiralling up into the storm
    q = vec2(vUv.x * 6.0 + y * 3.2 - t * 0.14, y * 2.6 - t * 0.2);
    float n1 = wbNoise2(q * vec2(3.0, 2.0));
    float n2 = wbNoise2(q * vec2(8.0, 5.0) + n1 * 2.2);
    float streak = smoothstep(0.55, 0.85, wbNoise2(vec2(vUv.x * 40.0 + y * 14.0 - t * 0.6, y * 3.0)));
    float d = (0.35 + 0.65 * n1) * smoothstep(0.0, 0.18, y) * (1.0 - smoothstep(0.8, 1.0, y) * 0.5);
    d *= 0.5 + 0.5 * smoothstep(0.25, 0.7, n2);
    // soft volumetric silhouette: faces seen edge-on fade out
    vec3 V = normalize(uCameraPos - vWp);
    float facing = abs(dot(normalize(vN), V));
    d *= smoothstep(0.05, 0.55, facing);
    a = clamp(d * 0.85 + streak * 0.15 * d, 0.0, 0.8);
    col = mix(vec3(0.09, 0.085, 0.12), vec3(0.36, 0.34, 0.42), n2 * 0.8 + streak * 0.4);
    float dis = uClear * 1.3 - (n1 * 0.7 + y * 0.3);
    col += vec3(1.2, 0.95, 0.55) * (1.0 - smoothstep(0.0, 0.1, abs(dis))) * step(0.001, uClear) * 1.4;
    a *= 1.0 - smoothstep(-0.02, 0.05, dis);
  }
  vec3 light = uSunColor * 0.55 + uSkyColor * 0.45;
  col *= light;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;
const EDGE_INK_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
uniform float uEdgeR;
uniform float uFade;
varying vec3 vWp;
varying vec2 vQ;
void main() {
  float r = length(vQ);
  float a = atan(vQ.y, vQ.x);
  float n = wbNoise2(vec2(a * 6.0, uTime * 0.25)) * 1.2 + wbNoise2(vec2(a * 17.0, r * 0.8)) * 0.5;
  float front = uEdgeR - n;
  if (r < front) discard;
  float m1 = wbNoise2(vQ * 0.8 + uTime * 0.1);
  vec3 col = mix(vec3(0.03, 0.03, 0.04), vec3(0.1, 0.095, 0.12), m1);
  float lip = 1.0 - smoothstep(0.0, 0.5, r - front);
  col += vec3(0.25, 0.22, 0.32) * lip * (0.5 + 0.5 * sin(uTime * 3.0 + a * 11.0));
  vec3 V = normalize(uCameraPos - vWp);
  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
  col += uSkyColor * (0.03 + 0.22 * fres);
  vec3 H = normalize(uSunDir + V);
  col += uSunColor * pow(max(H.y, 0.0), 160.0) * 1.2;
  float alpha = uFade * (0.9 + 0.1 * smoothstep(0.0, 0.6, r - front));
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
  gl_FragColor.rgb *= alpha;
}
`;
const MURAL_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute float aPanel;
varying vec2 vUv;
varying float vPanel;
varying vec3 vWp;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vUv = uv;
  vPanel = aPanel;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const MURAL_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform float uVictory;
varying vec2 vUv;
varying float vPanel;
varying vec3 vWp;
void main() {
  vec2 uv = vec2((vUv.x + vPanel) * 0.25, vUv.y);
  vec4 tex = texture2D(uMap, uv);
  // flaking: patches of lost paint
  float flake = smoothstep(0.42, 0.58, wbNoise2(vWp.xz * 0.9 + vWp.y * 1.3) * 0.7 + wbNoise2(vWp.xy * 3.1) * 0.3);
  float keep = mix(0.45 + 0.55 * flake, 0.85 + 0.15 * flake, uVictory);
  float a = tex.a * keep * (0.55 + 0.45 * uVictory);
  if (a < 0.02) discard;
  vec3 c = tex.rgb;
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  c = mix(vec3(l) * vec3(0.9, 0.88, 0.92), c, 0.12 + 0.88 * uVictory);
  vec3 light = uSunColor * 0.7 + uSkyColor * 0.45;
  vec3 col = c * light * 0.95 + c * uVictory * 0.25;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}
`;
function muralTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 384;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const rng = makeRng('greymaw-murals');
  const range = (lo, hi) => lo + (hi - lo) * rng();
  const figure = (x, y, scale, tilt, color, withBrush = true) => {
    g.save();
    g.translate(x, y);
    g.rotate(tilt);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineCap = 'round';
    g.lineWidth = 9 * scale;
    g.beginPath();
    g.arc(0, -58 * scale, 12 * scale, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(0, -44 * scale);
    g.quadraticCurveTo(4 * scale, -20 * scale, 0, 0);
    g.moveTo(0, 0);
    g.lineTo(-12 * scale, 26 * scale);
    g.moveTo(0, 0);
    g.lineTo(13 * scale, 25 * scale);
    g.moveTo(0, -36 * scale);
    g.lineTo(-18 * scale, -18 * scale);
    g.moveTo(0, -36 * scale);
    g.lineTo(20 * scale, -58 * scale);
    g.stroke();
    if (withBrush) {
      g.lineWidth = 5 * scale;
      g.beginPath();
      g.moveTo(14 * scale, -48 * scale);
      g.lineTo(44 * scale, -92 * scale);
      g.stroke();
      g.beginPath();
      g.ellipse(48 * scale, -100 * scale, 7 * scale, 14 * scale, 0.6, 0, TAU);
      g.fill();
    }
    g.restore();
  };
  const strokes = (color, count, x0, x1, y0, y1, width) => {
    g.strokeStyle = color;
    g.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      g.lineWidth = range(width * 0.5, width);
      g.globalAlpha = range(0.5, 0.9);
      const x = range(x0, x1);
      const y = range(y0, y1);
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + range(-30, 30), y + range(-20, 20), x + range(-60, 60), y + range(-25, 25));
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  const ink = '#2c2833';
  COLORS.forEach((color, i) => {
    const ox = i * 512;
    g.save();
    g.translate(ox, 0);
    g.beginPath();
    g.rect(6, 6, 500, 372);
    g.clip();
    const css = PALETTE[color].css;
    g.globalAlpha = 0.28;
    g.fillStyle = css;
    g.fillRect(14, 20, 484, 344);
    g.globalAlpha = 1;
    strokes(css, 26, 20, 492, 30, 344, 26);
    if (color === 'red') {
      g.strokeStyle = css;
      g.lineWidth = 16;
      g.beginPath();
      for (let i = 0; i <= 80; i++) {
        const angle = (i / 80) * 3.2 * TAU;
        const rad = 8 + i * 1.25;
        const x = 256 + Math.cos(angle) * rad;
        const y = 150 + Math.sin(angle) * rad * 0.8;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      for (let i = 0; i < 7; i++) {
        g.fillStyle = css;
        g.beginPath();
        const x = 70 + i * 62;
        const y = 300 + Math.sin(i) * 8;
        g.moveTo(x - 16, y);
        g.quadraticCurveTo(x, y - 60 - range(0, 30), x + 16, y);
        g.fill();
      }
      figure(90, 318, 1, -0.2, ink);
      figure(420, 318, 1, 0.25, ink);
    } else if (color === 'blue') {
      g.strokeStyle = css;
      g.lineWidth = 12;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        for (let x = 10; x <= 502; x += 8) {
          const y = 200 + i * 42 + Math.sin(x * 0.03 + i) * 16;
          if (x === 10) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.fillStyle = '#dff3ff';
      for (let i = 0; i < 5; i++) {
        const x = 60 + i * 95;
        const y = 190 + (i % 2) * 30;
        g.beginPath();
        g.moveTo(x - 36, y);
        g.lineTo(x - 20, y - 22);
        g.lineTo(x + 30, y - 18);
        g.lineTo(x + 40, y + 2);
        g.closePath();
        g.fill();
      }
      figure(250, 172, 1.05, -0.5, ink);
      g.strokeStyle = '#e8f8ff';
      g.lineWidth = 6;
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * TAU;
        g.beginPath();
        g.moveTo(410, 70);
        g.lineTo(410 + Math.cos(angle) * 42, 70 + Math.sin(angle) * 42);
        g.stroke();
      }
    } else if (color === 'yellow') {
      g.fillStyle = css;
      for (let i = 0; i < 3; i++) {
        const x0 = 40 + i * 150;
        for (let j = 0; j < 9; j++) {
          const u = j / 8;
          const x = x0 + u * 140;
          const y = 320 - Math.sin(u * Math.PI) * (160 + i * 30);
          g.beginPath();
          g.arc(x, y, 7 + (1 - Math.abs(u - 0.5) * 2) * 6, 0, TAU);
          g.fill();
        }
      }
      figure(115, 150, 0.95, -0.4, ink);
      figure(260, 120, 0.95, 0.1, ink);
      figure(410, 160, 0.95, 0.45, ink);
      g.strokeStyle = css;
      g.lineWidth = 10;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.arc(60 + i * 100, 345, 26, Math.PI, TAU);
        g.stroke();
      }
    } else {
      g.fillStyle = '#7b6a55';
      g.fillRect(216, 120, 80, 250);
      g.strokeStyle = '#5a4a3a';
      g.lineWidth = 22;
      g.beginPath();
      g.moveTo(126, 380);
      g.bezierCurveTo(106, 250, 216, 200, 196, 60);
      g.stroke();
      g.fillStyle = css;
      for (let i = 0; i < 16; i++) {
        g.beginPath();
        g.ellipse(196 + range(-120, 120), range(40, 150), range(26, 48), range(18, 30), range(0, 3), 0, TAU);
        g.fill();
      }
      g.strokeStyle = css;
      g.lineWidth = 7;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        let x = 216 + range(0, 80);
        let y = 370;
        g.moveTo(x, y);
        for (let j = 0; j < 8; j++) {
          x += range(-18, 18);
          y -= range(18, 32);
          g.lineTo(x, y);
        }
        g.stroke();
      }
      figure(400, 320, 1, 0.15, ink);
      figure(120, 318, 0.9, -0.15, ink, false);
    }
    g.strokeStyle = css;
    g.globalAlpha = 0.85;
    g.lineWidth = 12;
    g.strokeRect(16, 18, 480, 348);
    g.globalAlpha = 1;
    g.restore();
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
function flatRing(r0, r1, segments, rings) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= rings; i++) {
    const rad = r0 + ((r1 - r0) * i) / rings;
    for (let j = 0; j <= segments; j++) {
      const angle = (j / segments) * TAU;
      positions.push(Math.cos(angle) * rad, 0, Math.sin(angle) * rad);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function cylinderBand(rBottom, rTop, y0, y1, radial, rows) {
  const geometry = new CylinderGeometry(rTop, rBottom, y1 - y0, radial, rows, true);
  geometry.translate(0, (y0 + y1) / 2, 0);
  geometry.deleteAttribute('uv');
  return geometry;
}
function pillarGeometry(height, radius, broken, seed) {
  const rng = makeRng(seed);
  const profile = [];
  const topY = height;
  profile.push(new Vector2(0.001, 0));
  profile.push(new Vector2(radius * 1.45, 0));
  profile.push(new Vector2(radius * 1.45, 0.35));
  profile.push(new Vector2(radius * 1.25, 0.45));
  profile.push(new Vector2(radius * 1.12, 0.6));
  const shaftTop = broken ? topY : topY - 0.9;
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    const y = 0.6 + (shaftTop - 0.6) * u;
    profile.push(new Vector2(radius * (1 + 0.05 * Math.sin(u * Math.PI) - 0.1 * u), y));
  }
  if (broken) profile.push(new Vector2(0.001, topY));
  else {
    profile.push(new Vector2(radius * 1.05, topY - 0.8));
    profile.push(new Vector2(radius * 1.35, topY - 0.45));
    profile.push(new Vector2(radius * 1.55, topY - 0.35));
    profile.push(new Vector2(radius * 1.55, topY));
    profile.push(new Vector2(0.001, topY));
  }
  const geometry = new LatheGeometry(profile, 14);
  geometry.deleteAttribute('uv');
  const position = geometry.getAttribute('position');
  const phaseA = rng() * TAU;
  const phaseB = rng() * TAU;
  for (let j = 0; j < position.count; j++) {
    const x = position.getX(j);
    const y = position.getY(j);
    const z = position.getZ(j);
    const angle = Math.atan2(z, x);
    const dist = Math.hypot(x, z);
    let flute = 1;
    if (y > 0.65 && y < shaftTop - 0.05 && dist > radius * 0.7) flute = 1 - 0.035 * (0.5 + 0.5 * Math.cos(angle * 14));
    let ny = y;
    if (broken && y > topY - 0.001)
      ny = topY - 0.2 - Math.abs(Math.sin(angle * 1.5 + phaseA)) * 0.85 * (0.6 + 0.4 * Math.sin(angle * 3 + phaseB));
    position.setXYZ(j, x * flute, ny, z * flute);
  }
  geometry.computeVertexNormals();
  return geometry;
}
function ruinedWall(width, height, depth, seed) {
  const rng = makeRng(seed);
  const phase = rng() * TAU;
  const dir = rng() < 0.5 ? 1 : -1;
  const geometry = new BoxGeometry(width, height, depth, 12, 6, 1);
  geometry.translate(0, height / 2, 0);
  const position = geometry.getAttribute('position');
  for (let j = 0; j < position.count; j++) {
    const x = position.getX(j);
    const y = position.getY(j);
    const z = position.getZ(j);
    let ny = y;
    if (y > height - 0.001) {
      const u = (dir * x) / width + 0.5;
      let crest = 1 - 0.12 * Math.abs(Math.sin(u * 7 + phase)) - 0.05 * Math.abs(Math.sin(u * 19 + phase * 2));
      if (u > 0.9) crest -= (u - 0.9) * 3.2;
      if (u < 0.06) crest -= (0.06 - u) * 2.5;
      ny = height * clamp(crest, 0.35, 1);
    }
    const sway = Math.abs(x) > width / 2 - 0.001 ? Math.sin(y * 3.1 + phase) * 0.12 : 0;
    position.setXYZ(j, x + sway, ny, z);
  }
  geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();
  return geometry;
}
export class Arena {
  ctx;
  center;
  floorY;
  stairYaw;
  stairDir = new Vector3();
  stairFoot = new Vector3();
  group = new Group();
  stoneMat;
  stoneUni = {
    uArenaC: {
      value: new Vector3(),
    },
    uVictory: {
      value: 0,
    },
    uStain: {
      value: 1,
    },
    uInlayCol: {
      value: [],
    },
    uStairAng: {
      value: 0,
    },
  };
  pool;
  poolUni;
  barrier;
  barrierUni;
  vortex;
  cloud;
  vortexUni;
  cloudUni;
  edge;
  edgeUni;
  murals = null;
  muralUni = null;
  barrierColliders = [];
  bodyCollider = null;
  braziers = [];
  pillarTops = [];
  barrierOn = 0;
  barrierTarget = 0;
  constructor(ctx) {
    this.ctx = ctx;
    const terrain = ctx.terrain;
    const cx = BOSS_ARENA.x;
    const cz = BOSS_ARENA.z;
    let maxH = -1000000000;
    let minH = 1000000000;
    for (let r2 = 0; r2 <= 23; r2 += 1.5)
      for (let j = 0; j < 48; j++) {
        const h = terrainHeight(ctx, cx + Math.sin((j / 48) * TAU) * r2, cz + Math.cos((j / 48) * TAU) * r2);
        maxH = Math.max(maxH, h);
        minH = Math.min(minH, h);
      }
    if (!Number.isFinite(maxH)) maxH = 44;
    if (!Number.isFinite(minH)) minH = maxH - 10;
    this.floorY = Math.round((maxH + 0.95) * 10) / 10;
    this.center = new Vector3(cx, this.floorY, cz);
    const baseY = Math.min(minH, this.floorY - 4) - 2.5;
    const summit = terrain.landmarks?.summit ?? new Vector3(10, 68, -40);
    const summitYaw = Math.atan2(summit.x - cx, summit.z - cz);
    const slope = 0.42;
    let best = {
      yaw: summitYaw,
      len: 9,
      score: 1000000000,
    };
    for (let i = 0; i < 72; i++) {
      const ang = (i / 72) * TAU - Math.PI;
      const dx = Math.sin(ang);
      const dz = Math.cos(ang);
      let len = 14;
      for (let d = 0.5; d <= 14; d += 0.5) {
        const dist = RIM_RADIUS + d;
        const h = terrainHeight(ctx, cx + dx * dist, cz + dz * dist);
        if (this.floorY - slope * d <= h + 0.05) {
          len = d;
          break;
        }
      }
      const footR = RIM_RADIUS + len;
      const h0 = terrainHeight(ctx, cx + dx * footR, cz + dz * footR);
      const h1 = terrainHeight(ctx, cx + dx * (footR + 3), cz + dz * (footR + 3));
      const grade = Math.abs(h1 - h0) / 3;
      const off = Math.abs(wrapPi(ang - summitYaw));
      const score = Math.max(len, 3) + (1 - Math.cos(off)) * 9 + (grade > 0.7 ? 20 : 0) + (len >= 14 ? 30 : 0);
      if (score < best.score)
        best = {
          yaw: ang,
          len,
          score,
        };
    }
    this.stairYaw = best.yaw;
    this.stairDir.set(Math.sin(best.yaw), 0, Math.cos(best.yaw));
    const run = clamp(Math.max(best.len, 5.5), 5.5, 12);
    const drop = run * slope;
    this.stairFoot.set(
      cx + this.stairDir.x * (RIM_RADIUS + run + 1.2),
      0,
      cz + this.stairDir.z * (RIM_RADIUS + run + 1.2),
    );
    this.stairFoot.y = terrainHeight(ctx, this.stairFoot.x, this.stairFoot.z);
    this.stoneUni.uArenaC.value.copy(this.center);
    this.stoneUni.uStairAng.value = Math.atan2(this.stairDir.z, this.stairDir.x);
    this.stoneUni.uInlayCol.value = COLORS.map((color) => {
      const c = new Color(PALETTE[color].hex);
      return new Vector4(c.r, c.g, c.b, 1);
    });
    const globals = ctx.globals;
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
    });
    material.name = 'boss-arena-stone';
    const stoneUni = this.stoneUni;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, globals, stoneUni);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `${STONE_COMMON_VERTEX}\nvoid main() {`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${STONE_WORLDPOS_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${STONE_COMMON_FRAGMENT}\nvoid main() {`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${STONE_COLOR_FRAGMENT}`)
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - (1.0 - bsH) * 0.06, 0.35, 1.0);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
normal = bsPerturb(-vViewPosition, normal, bsH * 0.05);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
totalEmissiveRadiance += bsGlowCol * bsGlow;`,
        );
    };
    material.customProgramCacheKey = () => 'wb-boss-arena-stone-v1';
    try {
      ctx.paint.patchMaterial(material, {
        paint: true,
        vitality: true,
      });
    } catch (err) {
      console.warn('[boss] patchMaterial failed', err);
    }
    this.stoneMat = material;
    const parts = [];
    const add = (geometry, color, kind, matrix) => {
      if (matrix) geometry.applyMatrix4(matrix);
      if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
      parts.push(
        colorize(geometry.index ? geometry.toNonIndexed() : geometry, color, {
          aKind: kind,
        }),
      );
    };
    const trs = (x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, pitch = 0, roll = 0) =>
      new Matrix4().compose(
        new Vector3(x, y, z),
        new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, 'YXZ')),
        new Vector3(sx, sy, sz),
      );
    const center = this.center;
    const floorY = this.floorY;
    const rng = makeRng('greymaw-arena');
    add(flatRing(0, FLOOR_RADIUS, 128, 22), STONE, KIND_FLOOR, trs(center.x, floorY, center.z));
    add(
      new LatheGeometry(
        [
          new Vector2(RIM_RADIUS, -0.12),
          new Vector2(RIM_RADIUS, 0.2),
          new Vector2(22.5, 0.28),
          new Vector2(21.8, 0.28),
          new Vector2(FLOOR_RADIUS, 0.2),
          new Vector2(FLOOR_RADIUS, -0.05),
        ],
        160,
      ),
      STONE_PALE,
      KIND_TRIM,
      trs(center.x, floorY, center.z),
    );
    add(
      cylinderBand(23.5, 22.55, baseY, floorY - 0.08, 96, 8),
      STONE_DARK,
      KIND_FOUNDATION,
      trs(center.x, 0, center.z),
    );
    add(
      new TorusGeometry(6.45, 0.32, 6, 72),
      STONE_PALE,
      KIND_TRIM,
      trs(center.x, floorY - 0.12, center.z, 0, 1, 1, 1, Math.PI / 2),
    );
    const stairDir = this.stairDir;
    const yaw = best.yaw;
    const steps = Math.max(6, Math.round(drop / 0.3));
    const stepH = drop / steps;
    const stepD = run / steps;
    const stairW = 7.2;
    for (let j = 0; j < steps; j++) {
      const d = 22.200000000000003 + (j + 0.5) * stepD;
      const y = floorY - (j + 1) * stepH + 0.02;
      const h = y - (floorY - drop - 3);
      const geometry = new BoxGeometry(stairW - rng() * 0.1, h, stepD + 0.06);
      geometry.translate(0, -h / 2, 0);
      add(
        geometry,
        j % 2 ? STONE : STONE_PALE,
        KIND_PLAIN,
        trs(center.x + stairDir.x * d, y, center.z + stairDir.z * d, yaw),
      );
    }
    for (const side of [-1, 1]) {
      const ox = Math.cos(yaw) * side * 4.15;
      const oz = -Math.sin(yaw) * side * 4.15;
      const railH = 1.3;
      const railLen = run + 0.8;
      const geometry = new BoxGeometry(1.1, railH + drop + 3, railLen, 1, 3, 4);
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);
        const z = position.getZ(i);
        if (y > 0) position.setY(i, y - ((z + railLen / 2) / railLen) * drop);
      }
      geometry.computeVertexNormals();
      const d = 22.3 + railLen / 2;
      add(
        geometry,
        STONE_DARK,
        KIND_PLAIN,
        trs(
          center.x + stairDir.x * d + ox,
          floorY + railH - (railH + drop + 3) / 2,
          center.z + stairDir.z * d + oz,
          yaw,
        ),
      );
      const gatePost = pillarGeometry(side < 0 ? 9.5 : 6.2, 0.95, side > 0, `gate-${side}`);
      const px = center.x + stairDir.x * 22 + ox * 1.05;
      const pz = center.z + stairDir.z * 22 + oz * 1.05;
      add(gatePost, STONE_PALE, KIND_PLAIN, trs(px, floorY - 0.02, pz, rng() * 3));
      this.makeCylinder(px, floorY + 3, pz, 3, 1.1);
    }
    {
      const ox = Math.cos(yaw) * -4.15;
      const oz = -Math.sin(yaw) * -4.15;
      const x = center.x + stairDir.x * 20 + ox * 1.75;
      const z = center.z + stairDir.z * 20 + oz * 1.75;
      add(new BoxGeometry(5.2, 0.9, 1.3), STONE, KIND_PLAIN, trs(x, floorY + 0.42, z, yaw + 1.35, 1, 1, 1, 0, 0.08));
      this.makeBox(x, floorY + 0.45, z, 2.6, 0.45, 0.65, yaw + 1.35);
    }
    const wallYaws = [];
    for (let i = 1; i <= 4; i++) wallYaws.push(yaw + (i / 5) * TAU);
    const muralGeos = [];
    wallYaws.forEach((wallYaw, i) => {
      const dx = Math.sin(wallYaw);
      const dz = Math.cos(wallYaw);
      const x = center.x + dx * WALL_RADIUS;
      const z = center.z + dz * WALL_RADIUS;
      const wallW = 7.6;
      const wallH = 5.6 + rng() * 1.2;
      const wallD = 1.1;
      const face = wallYaw + Math.PI;
      add(ruinedWall(wallW, wallH, wallD, `wall-${i}`), STONE, KIND_PLAIN, trs(x, floorY - 0.05, z, face));
      this.makeBox(x, floorY + wallH / 2, z, wallW / 2, wallH / 2, wallD / 2, face);
      const panel = new PlaneGeometry(wallW * 0.84, wallH * 0.62);
      const color = COLORS[i % 4];
      const panelIds = new Float32Array(panel.getAttribute('position').count).fill(i % 4);
      panel.setAttribute('aPanel', new BufferAttribute(panelIds, 1));
      panel.applyMatrix4(trs(x - dx * 0.5800000000000001, floorY + wallH * 0.44, z - dz * 0.5800000000000001, face));
      muralGeos.push(panel);
      const bx = center.x + dx * 18.5;
      const bz = center.z + dz * 18.5;
      const column = new CylinderGeometry(0.42, 0.62, 1.2, 10);
      add(column, STONE_DARK, KIND_PLAIN, trs(bx, floorY + 0.6, bz));
      const bowl = new LatheGeometry(
        [
          new Vector2(0.001, 0),
          new Vector2(0.55, 0.02),
          new Vector2(0.95, 0.35),
          new Vector2(1.05, 0.6),
          new Vector2(0.9, 0.62),
          new Vector2(0.75, 0.45),
          new Vector2(0.001, 0.4),
        ],
        14,
      );
      add(bowl, STONE_PALE, KIND_TRIM, trs(bx, floorY + 1.18, bz));
      this.makeCylinder(bx, floorY + 0.9, bz, 0.9, 0.8);
      this.braziers.push({
        pos: new Vector3(bx, floorY + 1.7, bz),
        color,
      });
    });
    const bounds = [yaw, ...wallYaws, yaw + TAU];
    let stumpPlaced = false;
    for (let i = 0; i < 5; i++)
      for (const frac of [0.34, 0.66]) {
        const ang = bounds[i] + (bounds[i + 1] - bounds[i]) * frac;
        const dx = Math.sin(ang);
        const dz = Math.cos(ang);
        const x = center.x + dx * PILLAR_RADIUS;
        const z = center.z + dz * PILLAR_RADIUS;
        const roll = rng();
        if (!stumpPlaced && i === 2) {
          stumpPlaced = true;
          add(pillarGeometry(1.6, 0.9, true, `stump-${i}`), STONE, KIND_PLAIN, trs(x, floorY - 0.02, z, rng() * 3));
          this.makeCylinder(x, floorY + 0.8, z, 0.8, 1.15);
          for (let j = 0; j < 3; j++) {
            const d = 2.2 + j * 2.1;
            const lx = x - dx * d + Math.cos(ang) * (j - 1) * 0.5;
            const lz = z - dz * d - Math.sin(ang) * (j - 1) * 0.5;
            add(
              new CylinderGeometry(0.88, 0.88, 1.9, 14),
              STONE,
              KIND_PLAIN,
              trs(lx, floorY + 0.8, lz, ang + 0.3 * (j - 1), 1, 1, 1, 0, Math.PI / 2),
            );
            this.makeBox(lx, floorY + 0.8, lz, 0.95, 0.8, 0.8, ang + 0.3 * (j - 1));
          }
          continue;
        }
        const broken = roll < 0.6;
        const h = broken ? 2.8 + rng() * 3.4 : 8.2 + rng() * 1.6;
        add(
          pillarGeometry(h, 0.82, broken, `pillar-${i}-${frac}`),
          STONE,
          KIND_PLAIN,
          trs(x, floorY - 0.02, z, rng() * 3),
        );
        this.makeCylinder(x, floorY + h / 2, z, h / 2, 0.95);
        this.pillarTops.push(new Vector3(x, floorY + h, z));
      }
    for (let i = 0; i < 44; i++) {
      const ang = rng() * TAU;
      const inner = i < 18;
      const dist = inner ? 16.5 + rng() * 4.2 : 23.400000000000002 + rng() * 4;
      if (Math.abs(wrapPi(ang - yaw)) < 0.35) continue;
      const x = center.x + Math.sin(ang) * dist;
      const z = center.z + Math.cos(ang) * dist;
      const y = inner ? floorY : terrainHeight(ctx, x, z);
      const size = inner ? 0.3 + rng() * 0.45 : 0.5 + rng() * 1.1;
      if (rng() < 0.5)
        add(rockGeometry(`rub-${i}`, size, 0.7), STONE_DARK, KIND_PLAIN, trs(x, y + size * 0.2, z, rng() * 6));
      else
        add(
          new BoxGeometry(size * 2.2, size * 1.1, size * 1.5),
          STONE,
          KIND_PLAIN,
          trs(x, y + size * 0.35, z, rng() * 6, 1, 1, 1, rng() * 0.3, rng() * 0.3),
        );
    }
    const merged = mergeStatic(parts);
    const mesh = new Mesh(merged, material);
    mesh.name = 'boss-arena';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    try {
      const tex = muralTexture();
      if (tex && muralGeos.length) {
        const geo = mergeStatic(muralGeos.map((g) => g.toNonIndexed()));
        this.muralUni = {
          ...fogUniforms(ctx),
          uMap: {
            value: tex,
          },
          uVictory: {
            value: 0,
          },
        };
        const material = new ShaderMaterial({
          uniforms: this.muralUni,
          vertexShader: MURAL_VERTEX,
          fragmentShader: MURAL_FRAGMENT,
          transparent: true,
          depthWrite: false,
          fog: true,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
        this.murals = new Mesh(geo, material);
        this.murals.name = 'boss-murals';
        this.murals.matrixAutoUpdate = false;
        this.murals.renderOrder = 1;
        this.group.add(this.murals);
      }
    } catch (err) {
      console.warn('[boss] murals failed', err);
    }
    this.poolUni = {
      ...fogUniforms(ctx),
      uAgit: {
        value: 0.1,
      },
      uDrain: {
        value: 0,
      },
      uRadius: {
        value: POOL_RADIUS,
      },
      uBossPos: {
        value: this.center.clone(),
      },
      uBossR: {
        value: 3.2,
      },
      uHue: {
        value: 0,
      },
    };
    const poolMat = new ShaderMaterial({
      uniforms: this.poolUni,
      vertexShader: POOL_VERTEX,
      fragmentShader: POOL_FRAGMENT,
      fog: true,
    });
    this.pool = new Mesh(flatRing(0, 6.5, 72, 8), poolMat);
    this.pool.position.set(center.x, floorY + 0.035, center.z);
    this.pool.updateMatrix();
    this.pool.matrixAutoUpdate = false;
    this.pool.name = 'boss-pool';
    this.pool.receiveShadow = false;
    this.group.add(this.pool);
    this.edgeUni = {
      ...fogUniforms(ctx),
      uEdgeR: {
        value: 30,
      },
      uFade: {
        value: 0,
      },
    };
    const edgeMat = new ShaderMaterial({
      uniforms: this.edgeUni,
      vertexShader: POOL_VERTEX.replace('varying vec2 vQ;', 'varying vec2 vQ;'),
      fragmentShader: EDGE_INK_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.edge = new Mesh(flatRing(12, 22.8, 128, 6), edgeMat);
    this.edge.position.set(center.x, floorY + 0.06, center.z);
    this.edge.updateMatrix();
    this.edge.matrixAutoUpdate = false;
    this.edge.visible = false;
    this.edge.renderOrder = 2;
    this.edge.name = 'boss-edge-ink';
    this.group.add(this.edge);
    this.barrierUni = {
      ...globals,
      uRaise: {
        value: 0,
      },
      uH: {
        value: 16,
      },
      uFlash: {
        value: 0,
      },
      uHitP: {
        value: new Vector3(),
      },
    };
    const barrierGeo = new CylinderGeometry(BARRIER_RADIUS, BARRIER_RADIUS, 16, 96, 1, true);
    barrierGeo.translate(0, 8, 0);
    const barrierMat = new ShaderMaterial({
      uniforms: this.barrierUni,
      vertexShader: BARRIER_VERTEX,
      fragmentShader: BARRIER_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    this.barrier = new Mesh(barrierGeo, barrierMat);
    this.barrier.position.set(center.x, floorY - 0.3, center.z);
    this.barrier.updateMatrix();
    this.barrier.matrixAutoUpdate = false;
    this.barrier.visible = false;
    this.barrier.renderOrder = 7;
    this.barrier.name = 'boss-barrier';
    this.group.add(this.barrier);
    for (let i = 0; i < 32; i++) {
      const ang = (i / 32) * TAU;
      const r2 = 22.900000000000002;
      const x = center.x + Math.sin(ang) * r2;
      const z = center.z + Math.cos(ang) * r2;
      const collider = this.makeBox(x, floorY + 15, z, (TAU * r2) / 64 + 0.3, 20, 0.5, ang, 'other');
      if (collider) {
        collider.setEnabled(false);
        this.barrierColliders.push(collider);
      }
    }
    this.vortexUni = {
      ...fogUniforms(ctx),
      uClear: {
        value: 0,
      },
      uCloud: {
        value: 0,
      },
      uSpin: {
        value: 1,
      },
    };
    const vortexGeo = new CylinderGeometry(18, 6.5, 72, 48, 10, true);
    vortexGeo.translate(0, 48, 0);
    const vortexMat = new ShaderMaterial({
      uniforms: this.vortexUni,
      vertexShader: VORTEX_VERTEX,
      fragmentShader: VORTEX_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    this.vortex = new Mesh(vortexGeo, vortexMat);
    this.vortex.position.set(center.x, floorY, center.z);
    this.vortex.updateMatrix();
    this.vortex.matrixAutoUpdate = false;
    this.vortex.renderOrder = 8;
    this.vortex.name = 'boss-vortex';
    this.group.add(this.vortex);
    this.cloudUni = {
      ...fogUniforms(ctx),
      uClear: this.vortexUni.uClear,
      uCloud: {
        value: 1,
      },
      uSpin: {
        value: 1,
      },
    };
    const cloudMat = vortexMat.clone();
    cloudMat.uniforms = this.cloudUni;
    const cloudGeo = new PlaneGeometry(150, 150, 1, 1);
    cloudGeo.rotateX(Math.PI / 2);
    this.cloud = new Mesh(cloudGeo, cloudMat);
    this.cloud.position.set(center.x, floorY + 82, center.z);
    this.cloud.updateMatrix();
    this.cloud.matrixAutoUpdate = false;
    this.cloud.renderOrder = 8;
    this.cloud.name = 'boss-cloud';
    this.group.add(this.cloud);
    const halfH = (floorY - baseY) / 2;
    this.makeCylinder(center.x, floorY - halfH, center.z, halfH, 21.9);
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * TAU;
      if (Math.abs(wrapPi(ang - yaw)) < 0.24) continue;
      const r = 44.3 / 2;
      this.makeBox(
        center.x + Math.sin(ang) * r,
        floorY + 0.1,
        center.z + Math.cos(ang) * r,
        (TAU * r) / 80 + 0.08,
        0.17,
        0.5000000000000011,
        ang,
      );
    }
    {
      const rise = drop / run;
      const pitch = Math.atan(rise);
      const len = run + 0.6;
      const mid = 22.200000000000003 + len / 2;
      const y = floorY - stepH * 0.5 - (len / 2) * rise - 0.02;
      const halfT = 0.35;
      const cd = mid - Math.sin(pitch) * halfT;
      const cy = y - Math.cos(pitch) * halfT;
      const rot = new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, 'YXZ'));
      this.makeBoxQ(
        center.x + stairDir.x * cd,
        cy,
        center.z + stairDir.z * cd,
        stairW / 2,
        halfT,
        Math.hypot(len, len * rise) / 2,
        rot,
      );
      const landing = 43.3 / 2;
      this.makeBox(
        center.x + stairDir.x * landing,
        floorY - 0.3,
        center.z + stairDir.z * landing,
        stairW / 2,
        0.3,
        1.100000000000005 / 2,
        yaw,
      );
      for (const side of [-1, 1]) {
        const ox = Math.cos(yaw) * side * 4.15;
        const oz = -Math.sin(yaw) * side * 4.15;
        const len = run + 0.8;
        const d = 22.3 + len / 2;
        const y = floorY + 1.3 - drop / 2;
        this.makeBoxQ(
          center.x + stairDir.x * d + ox,
          y - 1.1 * Math.cos(pitch),
          center.z + stairDir.z * d + oz,
          0.55,
          1.1,
          Math.hypot(len, len * rise) / 2,
          rot,
        );
      }
    }
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * TAU;
      const r = 6.45;
      this.makeBox(
        center.x + Math.sin(ang) * r,
        floorY + 0.02,
        center.z + Math.cos(ang) * r,
        (TAU * r) / 56 + 0.05,
        0.17,
        0.3,
        ang,
      );
    }
    this.bodyCollider = this.makeCylinder(center.x, floorY + 6, center.z, 7, 3.35, 'enemy');
    ctx.scene.add(this.group);
    try {
      ctx.vegetation.clearGrass(this.center, 23.5);
      for (let d = 0; d <= run + 2; d += 3)
        ctx.vegetation.clearGrass(
          new Vector3(center.x + stairDir.x * (RIM_RADIUS + d), 0, center.z + stairDir.z * (RIM_RADIUS + d)),
          4.8,
        );
    } catch (err) {
      console.warn('[boss] clearGrass failed', err);
    }
  }
  get bodyHandle() {
    return this.bodyCollider?.handle ?? -1;
  }
  setBodyTop(bodyTop) {
    try {
      const bodyCollider = this.bodyCollider;
      if (!bodyCollider) return;
      const topY = Math.max(this.floorY + 1.2, bodyTop);
      bodyCollider.setTranslation({
        x: this.center.x,
        y: topY - 7,
        z: this.center.z,
      });
    } catch {}
  }
  setBodyCollider(enabled) {
    try {
      this.bodyCollider?.setEnabled(enabled);
    } catch {}
  }
  makeCylinder(x, y, z, halfHeight, radius, kind = 'structure') {
    try {
      const desc = this.ctx.RAPIER.ColliderDesc.cylinder(halfHeight, radius)
        .setTranslation(x, y, z)
        .setCollisionGroups(COLLISION_GROUPS.static)
        .setFriction(0.9);
      const collider = this.ctx.physics.createCollider(desc);
      this.ctx.colliders.register(collider, {
        kind,
        surface: 'stone',
        object: this.group,
        data: {
          boss: true,
        },
      });
      return collider;
    } catch (err) {
      console.warn('[boss] collider failed', err);
      return null;
    }
  }
  makeBox(x, y, z, hx, hy, hz, yaw, kind = 'structure') {
    const rot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    return this.makeBoxQ(x, y, z, hx, hy, hz, rot, kind);
  }
  makeBoxQ(x, y, z, hx, hy, hz, rot, kind = 'structure') {
    try {
      const desc = this.ctx.RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(x, y, z)
        .setRotation({
          x: rot.x,
          y: rot.y,
          z: rot.z,
          w: rot.w,
        })
        .setCollisionGroups(COLLISION_GROUPS.static)
        .setFriction(0.9);
      const collider = this.ctx.physics.createCollider(desc);
      this.ctx.colliders.register(collider, {
        kind,
        surface: 'stone',
        object: this.group,
        data: {
          boss: true,
        },
      });
      return collider;
    } catch (err) {
      console.warn('[boss] collider failed', err);
      return null;
    }
  }
  inside(x, z, margin = 0) {
    return Math.hypot(x - this.center.x, z - this.center.z) < 22 - margin;
  }
  groundAt(x, z) {
    return Math.hypot(x - this.center.x, z - this.center.z) < RIM_RADIUS ? this.floorY : terrainHeight(this.ctx, x, z);
  }
  setBarrier(on) {
    this.barrierTarget = +!!on;
    for (const collider of this.barrierColliders)
      try {
        collider.setEnabled(on);
      } catch {}
  }
  get barrierUp() {
    return this.barrierTarget > 0.5;
  }
  bump(point) {
    this.barrierUni.uHitP.value.copy(point);
    this.barrierUni.uFlash.value = 1;
  }
  setPool(agitation, drain, bossPos, bossRadius) {
    this.poolUni.uAgit.value = agitation;
    this.poolUni.uDrain.value = drain;
    this.poolUni.uBossPos.value.copy(bossPos);
    this.poolUni.uBossR.value = bossRadius;
    this.pool.visible = drain < 0.995;
  }
  setVictory(victory) {
    this.stoneUni.uVictory.value = victory;
    this.stoneUni.uStain.value = 1 - victory;
    if (this.muralUni) this.muralUni.uVictory.value = victory;
  }
  setClear(clear) {
    this.vortexUni.uClear.value = clear;
    const visible = clear < 0.999;
    this.vortex.visible = visible;
    this.cloud.visible = visible;
  }
  setEdge(radius, fade) {
    this.edgeUni.uEdgeR.value = radius;
    this.edgeUni.uFade.value = fade;
    this.edge.visible = fade > 0.001;
  }
  update(dt, near) {
    this.barrierOn += (this.barrierTarget - this.barrierOn) * Math.min(1, dt * (this.barrierTarget > 0 ? 2.2 : 1.6));
    if (Math.abs(this.barrierOn - this.barrierTarget) < 0.002) this.barrierOn = this.barrierTarget;
    this.barrierUni.uRaise.value = this.barrierOn;
    this.barrier.visible = this.barrierOn > 0.002;
    this.barrierUni.uFlash.value = Math.max(0, this.barrierUni.uFlash.value - dt * 1.8);
    if (this.murals) this.murals.visible = near;
    this.pool.visible = near && this.poolUni.uDrain.value < 0.995;
  }
  get barrierLevel() {
    return this.barrierOn;
  }
}
function terrainHeight(ctx, x, z) {
  try {
    const h = ctx.terrain.heightAt(x, z);
    return Number.isFinite(h) ? h : 0;
  } catch {
    return 0;
  }
}
function wrapPi(a) {
  for (; a > Math.PI;) a -= TAU;
  for (; a < -Math.PI;) a += TAU;
  return a;
}
