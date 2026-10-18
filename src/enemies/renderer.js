/**
 * Smudge rendering: skinning, face, crack and toon-lighting GLSL, the body, shadow and outline materials, and the per-kind instanced renderer that reads bones and look parameters from a float texture.
 */
import {
  BackSide,
  DataTexture,
  FloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NearestFilter,
  RGBADepthPacking,
  RGBAFormat,
  Sphere,
  Vector3,
} from 'three';
export const PARAM_TEXEL = 24;
const KIND_INDEX = {
  smudgeling: 0,
  spitter: 1,
  brute: 2,
};
const ENEMY_SKIN_GLSL = `
uniform highp sampler2D uEnemyTex;
uniform float uDripRate;
uniform float uWobble;
attribute vec4 aSkin;
attribute vec4 aFx;
attribute float aSlot;
flat varying vec4 vP0;
flat varying vec4 vP1;
flat varying vec4 vP2;
flat varying vec4 vP3;
flat varying vec4 vP4;
flat varying vec4 vP5;
flat varying vec4 vP6;
flat varying vec4 vP7;
flat varying float vPart;
varying vec3 vRest;
varying vec2 vFaceUv;
varying float vRough;
varying float vDripTip;

mat4 wbBoneMat(int row, int b) {
  vec4 r0 = texelFetch(uEnemyTex, ivec2(b * 3, row), 0);
  vec4 r1 = texelFetch(uEnemyTex, ivec2(b * 3 + 1, row), 0);
  vec4 r2 = texelFetch(uEnemyTex, ivec2(b * 3 + 2, row), 0);
  return mat4(r0.x, r1.x, r2.x, 0.0, r0.y, r1.y, r2.y, 0.0, r0.z, r1.z, r2.z, 0.0, r0.w, r1.w, r2.w, 1.0);
}
vec3 wbCof(mat4 m, vec3 n) {
  vec3 c0 = m[0].xyz; vec3 c1 = m[1].xyz; vec3 c2 = m[2].xyz;
  return n.x * cross(c1, c2) + n.y * cross(c2, c0) + n.z * cross(c0, c1);
}
void wbSkin(out vec3 P, out vec3 N) {
  int row = int(aSlot + 0.5);
  vP0 = texelFetch(uEnemyTex, ivec2(${PARAM_TEXEL}, row), 0);
  vP1 = texelFetch(uEnemyTex, ivec2(${PARAM_TEXEL + 1}, row), 0);
  vP2 = texelFetch(uEnemyTex, ivec2(${PARAM_TEXEL + 2}, row), 0);
  vP3 = texelFetch(uEnemyTex, ivec2(${PARAM_TEXEL + 3}, row), 0);
  vP4 = texelFetch(uEnemyTex, ivec2(${PARAM_TEXEL + 4}, row), 0);
  vP5 = texelFetch(uEnemyTex, ivec2(${PARAM_TEXEL + 5}, row), 0);
  vP6 = texelFetch(uEnemyTex, ivec2(${PARAM_TEXEL + 6}, row), 0);
  vP7 = texelFetch(uEnemyTex, ivec2(${PARAM_TEXEL + 7}, row), 0);
  float part = aSkin.w;
  vec3 p = position;
  float seed = vP4.x;
  // elite-only crown: collapsed to a point (no fragments) on regular Smudges
  if (part > 9.5 && part < 10.5 && vP5.w < 0.5) p = vec3(0.0);
  // cloud mantle: billows in the wind; collapsed unless this Smudge wears one
  if (part > 10.5) {
    float bil = sin(uTime * 2.3 + p.y * 9.0 + p.x * 5.0 + seed * 6.283) * 0.55 + sin(uTime * 3.7 - p.z * 8.0 + seed * 3.0) * 0.45;
    p += normal * bil * uWobble * 3.5;
    if (vP7.w < 0.5) p = vec3(0.0);
  }
  float ink = (part < 0.5 || abs(part - 3.0) < 0.5 || abs(part - 5.0) < 0.5 || abs(part - 6.0) < 0.5) ? 1.0 : 0.0;
  float wob = sin(uTime * 3.1 + p.y * 11.0 + seed * 6.283) * 0.55 + sin(uTime * 4.3 + p.x * 13.0 - p.z * 9.0 + seed * 3.0) * 0.45;
  p += normal * wob * uWobble * ink * (1.0 + vP0.x * 3.0 + vP0.w * 2.0 + vP6.x * 2.0) * (1.0 - vP0.y);
  mat4 A = wbBoneMat(row, int(aSkin.x + 0.5));
  mat4 B = wbBoneMat(row, int(aSkin.y + 0.5));
  vec3 pa = (A * vec4(p, 1.0)).xyz;
  vec3 pb = (B * vec4(p, 1.0)).xyz;
  P = mix(pa, pb, aSkin.z);
  vec3 na = normalize(wbCof(A, normal));
  vec3 nb = normalize(wbCof(B, normal));
  N = normalize(mix(na, nb, aSkin.z));
  vDripTip = 0.0;
  if (aFx.w > 0.0) {
    float rate = uDripRate * (0.65 + 0.7 * fract(aFx.x * 7.13));
    float c = fract(uTime * rate + aFx.x + seed);
    float s = smoothstep(0.0, 0.82, c) * (1.0 - smoothstep(0.82, 0.87, c));
    s *= (1.0 - vP0.y);
    float tip = aFx.y * aFx.y;
    P.y -= s * aFx.w * tip * (1.0 + vP0.z * 1.5 + vP0.w * 2.0 + vP5.w * 0.9) * max(vP6.w, 0.01);
    vDripTip = aFx.y;
  }
  vRest = position;
  vPart = part;
  vFaceUv = uv;
  vRough = aFx.z;
}
`;
const ENEMY_FRAGMENT_GLSL = `
#include <wb_common>
flat varying vec4 vP0;
flat varying vec4 vP1;
flat varying vec4 vP2;
flat varying vec4 vP3;
flat varying vec4 vP4;
flat varying vec4 vP5;
flat varying vec4 vP6;
flat varying vec4 vP7;
flat varying float vPart;
varying vec3 vRest;
varying vec2 vFaceUv;
varying float vRough;
varying float vDripTip;
uniform float uKindScale;

float wbBayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  if (i < 0.5) return 0.0; if (i < 1.5) return 8.0; if (i < 2.5) return 2.0; if (i < 3.5) return 10.0;
  if (i < 4.5) return 12.0; if (i < 5.5) return 4.0; if (i < 6.5) return 14.0; if (i < 7.5) return 6.0;
  if (i < 8.5) return 3.0; if (i < 9.5) return 11.0; if (i < 10.5) return 1.0; if (i < 11.5) return 9.0;
  if (i < 12.5) return 15.0; if (i < 13.5) return 7.0; if (i < 14.5) return 13.0; return 5.0;
}

float wbEllipse(vec2 q, vec2 c, vec2 r) {
  vec2 d = (q - c) / r;
  return (length(d) - 1.0) * min(r.x, r.y);
}
float wbBox(vec2 q, vec2 c, vec2 h) {
  vec2 d = abs(q - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
vec2 wbRot(vec2 q, float a) { float s = sin(a), c = cos(a); return vec2(c * q.x - s * q.y, s * q.x + c * q.y); }

// Paint palette (linear) for the trapped colour.
vec3 wbPaintHue(float h) {
  vec3 R = vec3(1.0, 0.105, 0.04);
  vec3 B = vec3(0.07, 0.55, 1.0);
  vec3 Y = vec3(1.0, 0.66, 0.06);
  vec3 G = vec3(0.1, 0.68, 0.14);
  h = fract(h) * 4.0;
  vec3 c = mix(R, Y, clamp(h, 0.0, 1.0));
  c = mix(c, G, clamp(h - 1.0, 0.0, 1.0));
  c = mix(c, B, clamp(h - 2.0, 0.0, 1.0));
  c = mix(c, R, clamp(h - 3.0, 0.0, 1.0));
  return c;
}

// 2D voronoi edge distance (F2 - F1)
float wbVoronoiEdge(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = wbHash22(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(f2) - sqrt(f1);
}

float wbCrackMask(vec3 p, float width) {
  vec2 cyl = vec2(atan(p.x, p.z) * 1.5, p.y * 3.2 / uKindScale) * 1.8;
  float n = wbNoise3(p * 7.0 / uKindScale + vP4.x * 3.0);
  float e = wbVoronoiEdge(cyl + vec2(vP4.x * 13.0, 0.0) + (n - 0.5) * 0.6);
  // only some cell edges crack open → broken, branching lines instead of a tiled pattern
  float keep = smoothstep(0.5, 0.64, wbNoise3(p * 2.2 / uKindScale + 11.0 + vP4.x));
  return (1.0 - smoothstep(width * 0.3, width, e)) * keep;
}

// Elite veins: glowing channels of hoarded colour running through the ink (iso-lines of a
// warped 3D noise, so they wrap limbs and bodies alike without any seams or tiling).
float wbVeins(vec3 p) {
  vec3 q = p * 3.4 / uKindScale + vP4.x * 5.0;
  q += (vec3(wbNoise3(q * 0.6), wbNoise3(q * 0.6 + 7.1), wbNoise3(q * 0.6 + 3.3)) - 0.5) * 1.6;
  float n1 = abs(wbNoise3(q + vec3(0.0, uTime * 0.05, 0.0)) - 0.5);
  float n2 = abs(wbNoise3(q * 2.3 + 11.0) - 0.5);
  float v = 1.0 - smoothstep(0.012, 0.05, n1);
  v = max(v, (1.0 - smoothstep(0.008, 0.032, n2)) * 0.6 * smoothstep(0.35, 0.6, wbNoise3(q * 0.5 + 2.0)));
  return v;
}

// Stormborne: thin, sparse electric veins (steady), and bolts re-seeded several times a second
// so they flicker like lightning.
float wbStormVeins(vec3 p) {
  vec3 q = p * 3.2 / uKindScale + vP4.x * 5.0;
  q += (vec3(wbNoise3(q * 0.6), wbNoise3(q * 0.6 + 7.1), wbNoise3(q * 0.6 + 3.3)) - 0.5) * 1.8;
  float n = abs(wbNoise3(q + vec3(0.0, uTime * 0.06, 0.0)) - 0.5);
  return (1.0 - smoothstep(0.004, 0.015, n)) * smoothstep(0.42, 0.62, wbNoise3(q * 0.45 + 4.0));
}
float wbStormBolts(vec3 p) {
  float k = floor(uTime * 7.0 + vP4.x * 3.0);
  vec3 q = p * 2.6 / uKindScale + vP4.x * 5.0 + vec3(k * 1.7, k * 0.9, -k * 1.3);
  q += (vec3(wbNoise3(q * 0.7), wbNoise3(q * 0.7 + 5.2), wbNoise3(q * 0.7 + 9.1)) - 0.5) * 1.6;
  float n = abs(wbNoise3(q) - 0.5);
  return (1.0 - smoothstep(0.003, 0.012, n)) * smoothstep(0.35, 0.6, wbNoise3(q * 0.5 + 9.0));
}
float wbFlick(float rate, float salt) {
  return fract(sin(floor(uTime * rate + salt) * 12.9898 + salt * 78.233) * 43758.5453);
}

// Mask face. q in [-1,1]. Writes albedo + emissive. Expression: P1 = glow, open, anger, mouth; P2.xy = pupils.
void wbFace(inout vec3 col, inout vec3 emit, vec2 q) {
  float glow = vP1.x;
  float open = vP1.y;
  float anger = vP1.z;
  float mouth = vP1.w;
  vec2 pup = vP2.xy;
  float elite = vP5.w;
  vec3 hole = vec3(0.028, 0.024, 0.035);
  // elites wear war paint in their hoarded colour and their eyes burn with it
  vec3 paint = mix(vec3(0.5, 0.33, 0.33), vP5.rgb * 0.85, elite);
  vec3 glowCol = mix(vec3(1.0, 0.93, 0.7), mix(vP5.rgb, vec3(1.0), 0.18), elite);
  glow = max(glow, elite * (0.55 + 0.15 * sin(uTime * 4.0 + vP4.x * 9.0)));
  // Stormborne: eyes burn electric violet-white, war paint turns storm-violet
  float storm = vP7.x;
  paint = mix(paint, vec3(0.42, 0.26, 0.85), storm);
  glowCol = mix(glowCol, vec3(0.8, 0.74, 1.0), storm);
  glow = max(glow, storm * (0.6 + 0.2 * sin(uTime * 11.0 + vP4.x * 7.0)));
  // paper fibres & ink stains bleeding in from the rim
  float fib = wbNoise2(q * vec2(40.0, 9.0) + vP4.x * 9.0) * 0.5 + wbNoise2(q * 90.0) * 0.5;
  col *= 0.94 + 0.08 * fib;
  float rim = length(q * vec2(1.0, 1.05));
  float stain = smoothstep(0.62, 1.0, rim + (wbNoise2(q * 5.0 + vP4.x * 3.0) - 0.5) * 0.35);
  col = mix(col, vec3(0.26, 0.25, 0.3), stain * 0.55);

  float eyes = 1e5;
  float pupils = 1e5;
  float marks = 1e5;
  float mouthD = 1e5;
#if WB_KIND == 0
  // Smudgeling: big round-ish eye holes, thin crescent smile, tear stripes.
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? 1.0 : -1.0;
    vec2 c = vec2(0.37 * sx, 0.14);
    vec2 lq = q - c;
    lq.x *= sx;
    float e = wbEllipse(lq, vec2(0.0), vec2(0.2, 0.25 * open + 0.02));
    // anger: slice the inner-top of the eye with a slanted line
    float cut = dot(lq - vec2(0.0, 0.27 - anger * 0.2), normalize(vec2(-anger * 0.9, 1.0)));
    e = max(e, cut);
    eyes = min(eyes, e);
    pupils = min(pupils, length(lq * vec2(1.0, 0.85) - pup * vec2(0.08 * sx, 0.07) + vec2(0.0, 0.02)) - (0.055 + glow * 0.05));
    marks = min(marks, wbBox(q, vec2(0.37 * sx, -0.3), vec2(0.028, 0.14)));
  }
  marks = min(marks, length(q - vec2(0.0, 0.62)) - 0.06);
  // mouth: crescent smile → open oval when attacking
  vec2 mq = q - vec2(0.0, -0.5);
  float arc = abs(length(mq - vec2(0.0, 0.3)) - 0.36) - 0.022;
  arc = max(arc, mq.y - 0.02);
  arc = max(arc, abs(mq.x) - 0.24);
  float oval = wbEllipse(mq, vec2(0.0, 0.0), vec2(0.13 + mouth * 0.04, 0.02 + mouth * 0.14));
  mouthD = mix(arc, oval, step(0.15, mouth));
#elif WB_KIND == 1
  // Spitter: tall slit eyes, forehead dots, whisker marks; the spout is its mouth.
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? 1.0 : -1.0;
    vec2 lq = q - vec2(0.36 * sx, 0.24);
    lq.x *= sx;
    lq = wbRot(lq, 0.12 + anger * 0.22);
    float e = wbEllipse(lq, vec2(0.0), vec2(0.1 + glow * 0.02, 0.3 * open + 0.02));
    eyes = min(eyes, e);
    pupils = min(pupils, length(lq - pup * vec2(0.03 * sx, 0.1)) - (0.04 + glow * 0.04));
    marks = min(marks, wbBox(wbRot(q - vec2(0.55 * sx, -0.2), 0.5 * sx), vec2(0.0), vec2(0.13, 0.022)));
    marks = min(marks, wbBox(wbRot(q - vec2(0.52 * sx, -0.36), 0.35 * sx), vec2(0.0), vec2(0.11, 0.02)));
  }
  marks = min(marks, length(q - vec2(0.0, 0.72)) - 0.05);
  marks = min(marks, length(q - vec2(0.13, 0.6)) - 0.035);
  marks = min(marks, length(q - vec2(-0.13, 0.6)) - 0.035);
  // ring painted around the spout
  mouthD = abs(length((q - vec2(0.0, -0.42)) * vec2(1.0, 1.25)) - 0.36) - 0.03;
  mouthD = max(mouthD, -1.0);
  marks = min(marks, mouthD);
  mouthD = 1e5;
#else
  // Brute: angular scowling eyes under a painted brow, war-paint slashes.
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? 1.0 : -1.0;
    vec2 lq = q - vec2(0.36 * sx, 0.02);
    lq.x *= sx;
    float e = wbEllipse(lq, vec2(0.0), vec2(0.24, 0.18 * open + 0.02));
    float cut = dot(lq - vec2(0.0, 0.09 - anger * 0.06), normalize(vec2(-(0.35 + anger * 0.6), 1.0)));
    e = max(e, cut);
    eyes = min(eyes, e);
    pupils = min(pupils, length(lq - pup * vec2(0.08 * sx, 0.04) + vec2(0.02, 0.03)) - (0.045 + glow * 0.05));
    // brow stroke
    vec2 bq = wbRot(lq - vec2(-0.02, 0.2), 0.3 + anger * 0.25);
    marks = min(marks, wbBox(bq, vec2(0.0), vec2(0.27, 0.035 + 0.01 * sin(bq.x * 20.0))));
    // cheek slashes
    marks = min(marks, wbBox(wbRot(q - vec2(0.6 * sx, -0.35), 1.1 * sx), vec2(0.0), vec2(0.16, 0.03)));
  }
  marks = min(marks, wbBox(q, vec2(0.0, 0.52), vec2(0.03, 0.14)));
#endif
  // the mask cracks as the Smudge takes damage: jagged lines radiating from a knock point
  float dmg = vP4.z;
  if (dmg > 0.05) {
    vec2 o = vec2(0.35 - vP4.x * 0.7, 0.35 + 0.2 * fract(vP4.x * 7.0));
    vec2 cq = q - o;
    float cr = length(cq);
    float ang = atan(cq.y, cq.x) + (wbNoise2(q * 7.0 + vP4.x * 11.0) - 0.5) * 0.5;
    float spokes = abs(fract(ang * 0.954 + vP4.x * 3.0) - 0.5) * 2.0; // ~6 spokes
    float width = 0.05 / max(cr, 0.08) * (0.7 + 0.6 * wbNoise2(q * 12.0));
    float crack = (1.0 - smoothstep(0.0, width, 1.0 - spokes)) * (1.0 - smoothstep(dmg * 1.5, dmg * 1.5 + 0.05, cr));
    col = mix(col, vec3(0.12, 0.11, 0.14), crack * 0.85);
  }
  // painted markings (faded; vivid and glowing on elites)
  float mk = 1.0 - smoothstep(-0.01, 0.01, marks);
  col = mix(col, paint * (0.9 + 0.2 * fib), mk * mix(0.5, 0.95, max(elite, storm)));
  emit += vP5.rgb * mk * elite * 0.45;
  // elites: fierce slashes of colour across the brow / under the eyes
  if (elite > 0.5) {
    float sl = 1e5;
    for (int s = 0; s < 2; s++) {
      float sx = s == 0 ? 1.0 : -1.0;
      sl = min(sl, wbBox(wbRot(q - vec2(0.33 * sx, 0.46), -0.55 * sx), vec2(0.0), vec2(0.2, 0.045)));
      sl = min(sl, wbBox(wbRot(q - vec2(0.3 * sx, -0.12), 1.35 * sx), vec2(0.0), vec2(0.11, 0.028)));
    }
    float sm = (1.0 - smoothstep(-0.01, 0.01, sl)) * (0.75 + 0.25 * fib);
    col = mix(col, vP5.rgb, sm);
    emit += vP5.rgb * sm * 0.6;
  }
  emit += vec3(0.42, 0.26, 0.85) * mk * storm * 0.5;
  if (storm > 0.5) {
    // a lightning bolt painted down one side of the mask
    float tri = abs(fract(q.y * 2.2 + 0.25) - 0.5) * 2.0;
    float bolt = max(abs(q.x - (-0.58 + tri * 0.17)) - 0.05, abs(q.y - 0.02) - 0.55);
    float bm = (1.0 - smoothstep(-0.01, 0.01, bolt)) * (0.8 + 0.2 * fib);
    col = mix(col, vec3(0.45, 0.28, 0.95), bm);
    emit += vec3(0.6, 0.42, 1.0) * bm * (0.45 + vP7.y * 0.8);
  }
  // carved holes: dark interior with a lit lower lip
  float eh = 1.0 - smoothstep(-0.012, 0.008, eyes);
  float lip = (1.0 - smoothstep(0.0, 0.035, abs(eyes + 0.0))) * (1.0 - eh);
  col *= 1.0 - lip * 0.25;
  vec3 holeCol = mix(hole, glowCol * 1.4, glow);
  float pu = (1.0 - smoothstep(-0.01, 0.012, pupils)) * eh;
  holeCol = mix(holeCol, vec3(0.95, 0.93, 0.85), pu * (1.0 - glow * 0.4));
  col = mix(col, holeCol, eh);
  emit += eh * (glowCol * glow * 5.0 + vec3(0.8, 0.8, 0.7) * pu * (0.35 + glow * 2.0));
  // mouth
  float mh = 1.0 - smoothstep(-0.01, 0.01, mouthD);
  col = mix(col, hole, mh);
  emit += mh * glowCol * glow * 1.2 * step(0.15, mouth);
}

void wbJaw(inout vec3 col, inout vec3 emit, vec2 q) {
  float glow = vP1.x;
  // teeth: zig-zag band along the top edge
  float tx = fract(q.x * 3.2 + 0.5);
  float tooth = abs(tx - 0.5) * 2.0;
  float band = q.y - (0.35 - tooth * 0.45);
  float gap = 1.0 - smoothstep(0.0, 0.05, abs(band));
  col = mix(col, vec3(0.05, 0.045, 0.06), gap * step(-0.3, q.y));
  float fib = wbNoise2(q * vec2(30.0, 8.0)) * 0.1;
  col *= 0.92 + fib;
  col = mix(col, vec3(0.5, 0.33, 0.33), (1.0 - smoothstep(-0.01, 0.01, wbBox(q, vec2(0.0, -0.45), vec2(0.35, 0.04)))) * 0.5);
  emit += gap * vec3(1.0, 0.8, 0.5) * glow * 1.5;
}
`;
const ENEMY_LIGHTING_GLSL = `
float wbEnemyRamp(float ndl) {
  float band = smoothstep(-0.06, 0.24, ndl);
  float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  return mix(band, wrap * band, 0.3);
}
void RE_Direct_WBEnemy( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  float ndl = dot( geometryNormal, directLight.direction );
  vec3 irradiance = wbEnemyRamp( ndl ) * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
  vec3 H = normalize( directLight.direction + geometryViewDir );
  float nh = max( dot( geometryNormal, H ), 0.0 );
  float r = material.roughness;
  float gloss = 1.0 - r;
  // crisp stylised highlight: wide soft lobe + tight wet glint
  float lobe = smoothstep( 0.95, 0.99, nh ) * 0.05 + smoothstep( 0.9965 - r * 0.01, 0.9985, nh ) * 1.4;
  reflectedLight.directSpecular += directLight.color * lobe * gloss * gloss * smoothstep( -0.05, 0.25, ndl );
}
#undef RE_Direct
#define RE_Direct RE_Direct_WBEnemy
`;
function createEnemyMaterials(ctx, kind, enemyTex, kindScale) {
  const globals = ctx.globals;
  const kindDefine = String(KIND_INDEX[kind]);
  const uniforms = {
    uEnemyTex: enemyTex,
    uDripRate: {
      value: kind === 'brute' ? 0.22 : 0.32,
    },
    uWobble: {
      value: 0.006 * kindScale,
    },
    uKindScale: {
      value: kindScale,
    },
  };
  const body = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.3,
    metalness: 0,
  });
  body.name = `enemy-${kind}`;
  body.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uniforms);
    shader.defines = {
      ...(shader.defines ?? {}),
      WB_KIND: kindDefine,
    };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
` + ENEMY_SKIN_GLSL,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 wbSkP; vec3 objectNormal; wbSkin(wbSkP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = wbSkP;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
` + ENEMY_FRAGMENT_GLSL,
      )
      .replace(
        '#include <lights_physical_pars_fragment>',
        `#include <lights_physical_pars_fragment>
` + ENEMY_LIGHTING_GLSL,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if ( vP4.y < 0.999 && vP4.y * 16.0 <= wbBayer4( gl_FragCoord.xy ) + 0.5 ) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 wbEmit = vec3(0.0);
        float wbInk = 0.0;
        float wbPaper = 0.0;
        float wbCrown = 0.0;
        float wbMantle = 0.0;
        float wbElite = vP5.w;
        {
          float part = vPart;
          if (part > 10.5) {
            float n = wbNoise3(vRest * 9.0 / uKindScale + vec3(0.0, uTime * 0.15, vP4.x * 4.0));
            float n2 = wbNoise3(vRest * 22.0 / uKindScale - vec3(uTime * 0.3, 0.0, 0.0));
            float up = clamp((diffuseColor.b - 0.06) / 0.32, 0.0, 1.0);
            if (vP7.w > 1.5) {
              // Galecaller: a bright wind-cloud, sunlit cream with its colour caught in the folds
              diffuseColor.rgb = mix(vec3(0.5, 0.5, 0.56), vec3(0.97, 0.95, 0.88), clamp(up * 1.2 + n * 0.25, 0.0, 1.0));
              float fold = smoothstep(0.55, 0.8, n2);
              diffuseColor.rgb = mix(diffuseColor.rgb, vP5.rgb, fold * 0.45);
              wbEmit += vP5.rgb * fold * 0.3 + vec3(1.0, 0.98, 0.9) * up * 0.12;
            } else {
              // storm cloud: dark slate, sunlit on top, lightning flickering inside it
              diffuseColor.rgb = mix(vec3(0.05, 0.048, 0.07), vec3(0.32, 0.32, 0.38), clamp(up + (n - 0.5) * 0.5, 0.0, 1.0));
              diffuseColor.rgb *= 0.8 + 0.4 * n;
              float fl = step(0.8, wbFlick(5.0, vP4.x * 13.0));
              float inner = smoothstep(0.35, 0.75, n) * fl;
              wbEmit += vec3(0.55, 0.4, 1.0) * inner * (0.9 + 1.6 * vP7.y) + vec3(0.2, 0.14, 0.42) * (0.06 + 0.25 * vP7.y) * up;
            }
            wbMantle = 1.0;
          }
          else if (part > 9.5) {
            // crystallised hoarded colour
            float n = wbNoise3(vRest * 11.0 + vP4.x * 3.0);
            diffuseColor.rgb = mix(vP5.rgb * 0.8, vec3(1.0), 0.1 + 0.25 * n);
            float beat = 0.55 + 0.45 * sin(uTime * 3.2 - vRest.y * 5.0 / uKindScale + vP4.x * 6.0);
            wbEmit += vP5.rgb * (0.12 + 0.16 * beat + vP6.x * 0.9 + vP6.y * 2.0) + vec3(0.35) * vP6.y;
            wbCrown = 1.0;
          }
          else if (abs(part - 1.0) < 0.5) { wbFace(diffuseColor.rgb, wbEmit, vFaceUv * 2.0 - 1.0); wbPaper = 1.0; }
          else if (abs(part - 4.0) < 0.5) { wbJaw(diffuseColor.rgb, wbEmit, vFaceUv * 2.0 - 1.0); wbPaper = 1.0; }
          else if (abs(part - 8.0) < 0.5) { wbPaper = 1.0; }
          else if (abs(part - 7.0) < 0.5) {
            float n = wbNoise3(vRest * 7.0);
            diffuseColor.rgb *= 0.85 + 0.3 * n;
          } else if (abs(part - 9.0) < 0.5) {
            wbEmit += vec3(0.25, 0.2, 0.3) * vP1.x;
          } else {
            wbInk = 1.0;
            // sac: lighter, sloshing ink with an inner glow when inflated
            if (abs(part - 6.0) < 0.5) {
              float n = wbNoise3(vRest * 14.0 + vec3(0.0, uTime * 1.8, 0.0));
              float n2 = wbNoise3(vRest * 7.0 - vec3(uTime * 0.9, 0.0, 0.0) + 3.0);
              diffuseColor.rgb *= 0.7 + 0.3 * n;
              // stolen colour sloshing inside, lit up as it fills
              float swirl = smoothstep(0.45, 0.8, n2);
              diffuseColor.rgb *= 1.0 - 0.35 * vP2.w;
              wbEmit += wbPaintHue(n2 * 1.3 + uTime * 0.15 + vP4.x) * swirl * vP2.w * 0.45;
              wbEmit += vec3(1.0, 0.8, 0.55) * pow(vP2.w, 3.0) * 0.08 * (0.5 + n);
            }
            // drip tips are a touch darker and wetter
            diffuseColor.rgb *= 1.0 - vDripTip * 0.35;
            // ink-wash: vertical runs + darker, heavier bottom
            float hN = clamp(vRest.y / (0.85 * uKindScale), 0.0, 1.0);
            float runs = wbNoise3(vRest * vec3(16.0, 2.5, 16.0) / uKindScale + vec3(0.0, uTime * 0.04, vP4.x * 3.0));
            diffuseColor.rgb *= (0.8 + 0.34 * hN) * (0.86 + 0.26 * runs);
            if (wbElite > 0.5) {
              // glazed in the hoarded colour, veined with it, dripping it
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.45 + 1.5 * vP5.rgb), 0.45);
              float vein = wbVeins(vRest);
              float beat = 0.6 + 0.4 * sin(uTime * 2.6 + vRest.y * 3.0 / uKindScale + vP4.x * 5.0);
              float surge = vP6.x + vP6.y * 1.5;
              wbEmit += vP5.rgb * vein * (1.0 * beat + 2.2 * surge);
              diffuseColor.rgb = mix(diffuseColor.rgb, vP5.rgb, vein * 0.8);
              float dripC = smoothstep(0.15, 0.7, vDripTip) + (abs(part - 3.0) < 0.5 ? 0.35 : 0.0);
              diffuseColor.rgb = mix(diffuseColor.rgb, vP5.rgb, clamp(dripC, 0.0, 1.0));
              wbEmit += vP5.rgb * clamp(dripC, 0.0, 1.0) * 0.9;
            }
            if (vP7.x > 0.5) {
              // Stormborne: indigo-black ink with crackling violet-white veins
              diffuseColor.rgb = vec3(0.008, 0.006, 0.024) * (0.7 + 0.6 * hN) * (0.85 + 0.3 * runs);
              float sv = wbStormVeins(vRest);
              float bolts = wbStormBolts(vRest) * step(0.3, wbFlick(7.0, vP4.x * 3.0));
              float cr = clamp(vP7.y, 0.0, 2.0);
              vec3 violet = vec3(0.45, 0.25, 1.0);
              wbEmit += violet * sv * (0.7 + 1.1 * cr) + mix(violet, vec3(0.9, 0.9, 1.0), 0.65) * bolts * (1.2 + 3.0 * cr);
              wbEmit += vec3(0.9, 0.9, 1.0) * (sv + bolts) * vP7.z * 3.5;
              diffuseColor.rgb = mix(diffuseColor.rgb, violet * 0.35, max(sv, bolts) * 0.6);
            }
          }
          // paper glows softly so masks read even in shade
          wbEmit += diffuseColor.rgb * wbPaper * 0.16;
          // paint coat splotches (element hits) — also the full-body colour at death
          float coatN = wbNoise3(vRest * 6.5 / uKindScale + vP4.x * 5.0) * 0.7 + wbNoise3(vRest * 17.0 / uKindScale) * 0.3;
          float coatT = 0.78 - vP3.w * 0.8;
          float coat = smoothstep(coatT, coatT + 0.05, coatN) * (1.0 - wbPaper * 0.35) * (1.0 - max(wbCrown, wbMantle));
          diffuseColor.rgb = mix(diffuseColor.rgb, vP3.rgb, coat);
          // death: vivid cracks in the paint colours
          float death = vP0.w;
          if (death > 0.001) {
            float cr = wbCrackMask(vRest, 0.06 + death * 0.16);
            vec3 hue = mix(wbPaintHue(vRest.y * 0.6 + atan(vRest.x, vRest.z) * 0.3 + vP4.x), vP3.rgb, step(0.01, vP3.w) * 0.85);
            wbEmit += hue * cr * death * 6.0;
            diffuseColor.rgb = mix(diffuseColor.rgb, hue, cr * death);
          }
          // brute telegraph: glowing cracks
          if (vP2.z > 0.001 && wbInk > 0.5) {
            // cracks spread down from the shoulders as the wind-up builds
            float reach = smoothstep(1.0 - vP2.z * 1.1, 1.05 - vP2.z * 1.1, clamp(vRest.y / (0.85 * uKindScale), 0.0, 1.0) + 0.15);
            float cr = wbCrackMask(vRest, 0.06) * reach;
            wbEmit += mix(vec3(1.0, 0.62, 0.28), vec3(0.72, 0.58, 1.0), vP7.x) * cr * vP2.z * 5.0;
            diffuseColor.rgb *= 1.0 - cr * 0.6;
          }
          // burning: charred with pulsing embers
          float charr = vP0.z;
          if (charr > 0.001) {
            float n = wbNoise3(vRest * 10.0 / uKindScale + vec3(0.0, -uTime * 1.6, 0.0));
            diffuseColor.rgb *= 1.0 - charr * 0.45;
            float em = smoothstep(0.55, 0.9, n) * charr * (0.6 + 0.4 * sin(uTime * 13.0 + n * 20.0));
            wbEmit += vec3(1.0, 0.36, 0.08) * em * 2.4 * (1.0 - wbPaper * 0.5);
          }
          // frozen: frosty pale blue
          float fr = vP0.y;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.82, 0.97), fr * (0.55 + 0.25 * wbInk));
        }`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix( vRough, 0.1, vP0.y );')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += wbEmit;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `
        {
          vec3 wbV = normalize( vViewPosition );
          vec3 wbN = normalize( normal );
          float ndv = clamp( dot( wbN, wbV ), 0.0, 1.0 );
          float fres = pow( 1.0 - ndv, 3.0 );
          vec3 Rw = ( vec4( reflect( -wbV, wbN ), 0.0 ) * viewMatrix ).xyz;
          vec3 env = mix( uGroundColor * 0.55, uSkyColor * 1.05, smoothstep( -0.25, 0.35, Rw.y ) );
          float gloss = 1.0 - roughnessFactor;
          outgoingLight += env * ( 0.035 + 0.55 * fres ) * gloss * gloss;
          // sun-side rim light like the hero (keeps dark ink readable against grass)
          vec3 sunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
          float sunSide = clamp( dot( wbN, sunV ) * 0.7 + 0.45, 0.0, 1.0 );
          outgoingLight += ( uSunColor * 0.5 * sunSide + uSkyColor * 0.25 ) * fres * ( 0.35 + 0.6 * wbPaper + vP4.w );
          // the island's stolen colour, trapped in the ink, glimmering at grazing angles
          if ( wbInk > 0.5 ) {
            float n1 = wbNoise3( vRest * 3.2 / uKindScale + vec3( 0.0, uTime * 0.25, vP4.x * 7.0 ) );
            float n2 = wbNoise3( vRest * 6.0 / uKindScale - vec3( uTime * 0.18, 0.0, 0.0 ) );
            vec3 hue = mix( wbPaintHue( n1 * 1.6 + n2 * 0.5 + uTime * 0.02 + vP4.x ), vP5.rgb, wbElite );
            hue = mix( hue, vec3( 0.55, 0.35, 1.0 ), vP7.x );
            float veins = smoothstep( 0.45, 0.75, n2 );
            outgoingLight += hue * veins * ( fres * 0.4 + vP4.z * 0.08 ) * ( 0.45 + vP4.z * 0.25 );
            // elites: a rim of their colour so the silhouette reads from far away
            outgoingLight += vP5.rgb * wbElite * ( fres * ( 0.5 + 0.25 * sin( uTime * 2.6 + vP4.x * 4.0 ) ) + vP6.y * 0.9 + vP6.z * 0.5 );
          }
          outgoingLight += ( vec3( 0.9, 1.0, 1.0 ) * 0.5 + vP5.rgb * 0.6 ) * wbCrown * pow( fres, 1.5 );
          // Stormborne: an electric violet rim that brightens as they crackle
          outgoingLight += vec3( 0.32, 0.18, 0.9 ) * vP7.x * fres * ( 0.3 + 0.55 * vP7.y + 1.5 * vP7.z ) * ( 1.0 - wbPaper * 0.7 );
          // frost rim
          outgoingLight += vec3( 0.7, 0.9, 1.0 ) * fres * vP0.y * 0.8;
          // hit flash (HDR white so bloom catches it)
          outgoingLight = mix( outgoingLight, vec3( 1.6, 1.55, 1.5 ), clamp( vP0.x, 0.0, 1.0 ) );
        }
        #include <opaque_fragment>`,
      );
  };
  body.customProgramCacheKey = () => `wb-enemy-body-v3-${kind}`;
  const depth = new MeshDepthMaterial({
    depthPacking: RGBADepthPacking,
  });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
` + ENEMY_SKIN_GLSL,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed; vec3 wbSkN; wbSkin(transformed, wbSkN);');
  };
  depth.customProgramCacheKey = () => `wb-enemy-depth-v3-${kind}`;
  const outline = new MeshBasicMaterial({
    color: 0x17151c,
    side: BackSide,
  });
  outline.name = `enemy-outline-${kind}`;
  const outlineWidth = {
    value: 0.011 * Math.sqrt(kindScale),
  };
  outline.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uniforms);
    shader.uniforms.uOutline = outlineWidth;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform float uOutline;
` + ENEMY_SKIN_GLSL,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed; vec3 wbSkN; wbSkin(transformed, wbSkN);
        float wbOw = uOutline * (1.0 + vP0.x * 1.5) * (abs(aSkin.w - 3.0) < 0.5 ? 0.6 : 1.0);
        vec4 wbMv = modelViewMatrix * vec4(transformed, 1.0);
        wbOw *= clamp(-wbMv.z / 6.0, 1.0, 3.0);
        if (aSkin.w > 9.5 && aSkin.w < 10.5 && vP5.w < 0.5) wbOw = 0.0;
        if (aSkin.w > 10.5 && vP7.w < 0.5) wbOw = 0.0;
        transformed += wbSkN * wbOw * (1.0 - vP0.y);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        flat varying vec4 vP0;
        flat varying vec4 vP4;
        flat varying vec4 vP5;
        flat varying vec4 vP7;
        float wbBayer4(vec2 p) {
          vec2 q = mod(floor(p), 4.0);
          float i = q.x + q.y * 4.0;
          if (i < 0.5) return 0.0; if (i < 1.5) return 8.0; if (i < 2.5) return 2.0; if (i < 3.5) return 10.0;
          if (i < 4.5) return 12.0; if (i < 5.5) return 4.0; if (i < 6.5) return 14.0; if (i < 7.5) return 6.0;
          if (i < 8.5) return 3.0; if (i < 9.5) return 11.0; if (i < 10.5) return 1.0; if (i < 11.5) return 9.0;
          if (i < 12.5) return 15.0; if (i < 13.5) return 7.0; if (i < 14.5) return 13.0; return 5.0;
        }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if ( vP4.y < 0.999 && vP4.y * 16.0 <= wbBayer4( gl_FragCoord.xy ) + 0.5 ) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vP5.rgb * 0.4, vP5.w * 0.65);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.12, 0.5), vP7.x * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.4), clamp(vP0.x, 0.0, 1.0) * 0.6);`,
      );
  };
  outline.customProgramCacheKey = () => `wb-enemy-outline-v3-${kind}`;
  return {
    body,
    depth,
    outline,
  };
}
export class EnemyRenderer {
  kind;
  capacity;
  mesh;
  outlineMesh;
  data;
  texture;
  geometry;
  mats;
  count = 0;
  constructor(ctx, kind, model, capacity, kindScale) {
    this.kind = kind;
    this.capacity = capacity;
    this.data = new Float32Array(32 * capacity * 4);
    this.texture = new DataTexture(this.data, 32, capacity, RGBAFormat, FloatType);
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    const source = model.geometry;
    const instanced = new InstancedBufferGeometry();
    for (const [key, attribute] of Object.entries(source.attributes)) instanced.setAttribute(key, attribute);
    instanced.setIndex(source.index);
    const slots = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) slots[i] = i;
    instanced.setAttribute('aSlot', new InstancedBufferAttribute(slots, 1));
    instanced.instanceCount = 0;
    instanced.boundingSphere = new Sphere(new Vector3(), 100000);
    this.geometry = instanced;
    this.mats = createEnemyMaterials(
      ctx,
      kind,
      {
        value: this.texture,
      },
      kindScale,
    );
    this.mesh = new Mesh(instanced, this.mats.body);
    this.mesh.name = `enemies-${kind}`;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.customDepthMaterial = this.mats.depth;
    this.mesh.matrixAutoUpdate = false;
    this.outlineMesh = new Mesh(instanced, this.mats.outline);
    this.outlineMesh.name = `enemies-${kind}-outline`;
    this.outlineMesh.frustumCulled = false;
    this.outlineMesh.matrixAutoUpdate = false;
    this.outlineMesh.renderOrder = -1;
    this.mesh.visible = false;
    this.outlineMesh.visible = false;
  }
  begin() {
    this.count = 0;
  }
  push() {
    return this.count >= this.capacity ? -1 : this.count++ * 32 * 4;
  }
  end() {
    this.geometry.instanceCount = this.count;
    const visible = this.count > 0;
    this.mesh.visible = visible;
    this.outlineMesh.visible = visible;
    if (visible) this.texture.needsUpdate = true;
  }
}
export function writeBone(data, offset, matrix) {
  const elements = matrix.elements;
  data[offset] = elements[0];
  data[offset + 1] = elements[4];
  data[offset + 2] = elements[8];
  data[offset + 3] = elements[12];
  data[offset + 4] = elements[1];
  data[offset + 5] = elements[5];
  data[offset + 6] = elements[9];
  data[offset + 7] = elements[13];
  data[offset + 8] = elements[2];
  data[offset + 9] = elements[6];
  data[offset + 10] = elements[10];
  data[offset + 11] = elements[14];
}
