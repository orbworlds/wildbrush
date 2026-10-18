/**
 * Shared cave uniforms and the GLSL chunks patched into the cave materials: live glow lights and the awakening wave, painterly rock with lichen and crystal veins, glowing fungus, crystals, the pool and carved stone.
 */
import { Vector4 } from 'three';
export function makeUniforms() {
  return {
    uGlowP: {
      value: new Float32Array(96),
    },
    uGlowC: {
      value: new Float32Array(96),
    },
    uGlowN: {
      value: 0,
    },
    uBake: {
      value: 1,
    },
    uWake: {
      value: new Vector4(0, -1000, 0, 0),
    },
    uWakeAmt: {
      value: 1,
    },
    uMushB: {
      value: new Float32Array(128).fill(0.6),
    },
    uVein: {
      value: new Vector4(0, 0, 0, 1),
    },
    uFill: {
      value: 0,
    },
  };
}
const GLOW_GLSL = `
#ifndef CV_GLOW
#define CV_GLOW
uniform vec4 uGlowP[24];
uniform vec4 uGlowC[24];
uniform int uGlowN;
uniform float uBake;
uniform vec4 uWake;
uniform float uWakeAmt;
uniform float uFill;
// Soft glow light from the live sources (rgb irradiance-ish, multiply by albedo).
vec3 cvGlow(vec3 p, vec3 n) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= uGlowN) break;
    vec4 P = uGlowP[i];
    vec3 L = P.xyz - p;
    float d2 = dot(L, L);
    if (d2 >= P.w * P.w) continue;
    float d = sqrt(d2);
    float x = 1.0 - d / P.w;
    float att = x * x * (0.55 + 1.6 / (1.0 + d2 * 0.35));
    float ndl = dot(n, L) / max(d, 1e-3);
    float wrap = clamp(ndl * 0.62 + 0.38, 0.0, 1.0);
    vec4 C = uGlowC[i];
    float fi = float(i);
    float fl = 1.0 + C.w * (sin(uTime * 8.7 + fi * 1.7) * 0.07 + sin(uTime * 21.3 + fi * 3.1) * 0.05 + sin(uTime * 2.3 + fi) * 0.05);
    acc += C.rgb * att * wrap * fl;
  }
  return acc;
}
// Wake: baked glowcap light swells behind an expanding front (plus a bright band on the front).
float cvWakeK(vec3 p) {
  if (uWake.w <= 0.0) return 1.0;
  float d = length(p - uWake.xyz);
  float behind = smoothstep(uWake.w, uWake.w - 10.0, d);
  float band = exp(-pow((d - uWake.w) / 2.2, 2.0));
  return mix(1.0, uWakeAmt, behind) + band * 2.5;
}
#endif
`;
const PERTURB_GLSL = `
#define CV_SRGB(r, g, b) pow(vec3(r, g, b) / 255.0, vec3(2.2))
vec3 cvPerturb(vec3 p, vec3 n, float hgt) {
  vec3 sx = dFdx(p);
  vec3 sy = dFdy(p);
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2);
  return normalize(abs(det) * n - g);
}
`;
export const ROCK_PARS_VERTEX = `
attribute vec4 aBake;
varying vec3 vCvW;
varying vec3 vCvN;
varying vec4 vCvBake;
`;
export const ROCK_PROJECT_VERTEX = `
vCvW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vCvN = normalize(mat3(modelMatrix) * objectNormal);
vCvBake = aBake;
`;
export const ROCK_PARS_FRAGMENT = `
#include <wb_common>
${GLOW_GLSL}
${PERTURB_GLSL}
uniform vec4 uVein;
varying vec3 vCvW;
varying vec3 vCvN;
varying vec4 vCvBake;
float cvBumpH = 0.0;
float cvRough = 0.9;
vec3 cvEm = vec3(0.0);

vec3 cvRockAlbedo(vec3 p, vec3 n) {
  float up = n.y;
  float big = wbNoise3(p * 0.16);
  float mid = wbNoise3(p * 0.62 + 3.1);
  float fine = wbNoise3(p * 2.4 - 1.7);
  float grain = wbNoise3(p * 7.3 + 5.5);
  // warm grey rock, broken lavender / ochre strata that wander with the stone
  float warp = (wbNoise3(p * vec3(0.07, 0.03, 0.07) + 9.0) - 0.5) * 7.0 + (big - 0.5) * 3.0 + (mid - 0.5) * 0.9;
  float yb = p.y * 0.55 + warp;
  float band = fract(yb);
  float bh = wbHash12(vec2(floor(yb), 3.7));
  float breakup = smoothstep(0.35, 0.65, wbNoise3(p * vec3(0.18, 0.5, 0.18) + 2.0));
  vec3 dark = CV_SRGB(96.0, 90.0, 88.0);
  vec3 lite = CV_SRGB(166.0, 156.0, 142.0);
  vec3 rock = mix(dark, lite, clamp(0.45 + (big - 0.5) * 0.9 + (mid - 0.5) * 0.35, 0.0, 1.0));
  vec3 strata = mix(CV_SRGB(132.0, 118.0, 156.0), CV_SRGB(158.0, 130.0, 104.0), step(0.55, bh));
  rock = mix(rock, strata, smoothstep(0.62, 0.9, bh) * breakup * 0.45);
  rock *= 1.0 - 0.07 * smoothstep(0.88, 1.0, band) * breakup;
  rock *= 0.88 + 0.18 * fine + 0.07 * grain;
  // hairline cracks (short, broken)
  float ck = abs(wbNoise3(p * vec3(1.6, 0.8, 1.6) + 13.0) - 0.5);
  float ckM = smoothstep(0.55, 0.75, wbNoise3(p * 0.9 + 31.0)) * smoothstep(0.3, 0.7, mid);
  rock *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.014, ck)) * ckM;
  // cool lavender in overhangs / ceilings
  rock = mix(rock, rock * vec3(0.8, 0.78, 1.04), smoothstep(0.15, -0.75, up) * 0.75);
  // floors: dark loam, teal moss patches, small pale pebbles
  float floorW = smoothstep(0.5, 0.82, up + (mid - 0.5) * 0.25);
  vec3 soil = mix(CV_SRGB(62.0, 55.0, 50.0), CV_SRGB(88.0, 77.0, 66.0), mid);
  float mossM = smoothstep(0.45, 0.68, mid * 0.7 + big * 0.5 - 0.1);
  vec3 moss = mix(CV_SRGB(30.0, 62.0, 58.0), CV_SRGB(62.0, 100.0, 76.0), fine);
  vec3 fl = mix(soil, moss, mossM);
  float peb = smoothstep(0.8, 0.86, wbNoise3(p * 7.5 + 17.0)) * (1.0 - mossM);
  fl = mix(fl, CV_SRGB(132.0, 124.0, 114.0), peb * 0.45);
  vec3 col = mix(rock, fl, floorW);
  // moss creeping over ledges and down the tops of walls
  float ledge = smoothstep(0.25, 0.55, up) * (1.0 - floorW) * smoothstep(0.55, 0.75, mid + fine * 0.3);
  col = mix(col, moss * 0.9, ledge * 0.7);
  // damp dark band at the foot of the walls
  col *= 1.0 - 0.18 * (1.0 - floorW) * smoothstep(0.35, 0.0, abs(up)) * smoothstep(0.6, 0.3, big);
  cvBumpH = mix(mid * 1.4 + fine * 0.7 + grain * 0.3, fine * 0.4 + peb * 0.8, floorW) + (1.0 - smoothstep(0.0, 0.02, ck)) * 0.12 * ckM * (1.0 - floorW);
  cvRough = mix(0.93, 0.8, mossM * floorW);
  // glowing lichen specks: a faint starry field on walls and ceilings (clustered in patches)
  vec3 cell = floor(p * 5.5);
  float hs = wbHash13(cell);
  vec3 fp = fract(p * 5.5) - 0.5;
  float dotM = smoothstep(0.18, 0.05, length(fp)) * step(0.955, hs);
  float patchM = smoothstep(0.52, 0.75, wbNoise3(p * 0.33 + 21.0)) * (1.0 - floorW * 0.8);
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + hs * 2.0) + hs * 40.0);
  vec3 lichen = mix(vec3(0.25, 0.95, 0.85), vec3(0.55, 0.6, 1.0), step(0.985, hs));
  cvEm += lichen * dotM * patchM * tw * 0.55;
  // crystal veins in the Crystal Gallery
  float vr = 1.0 - smoothstep(uVein.w * 0.6, uVein.w, length(p - uVein.xyz));
  if (vr > 0.0) {
    float vn = wbNoise3(p * vec3(0.35, 0.22, 0.35));
    float fw = fwidth(vn) * 1.3 + 0.006;
    float vein = (1.0 - smoothstep(0.0, fw + 0.012, abs(vn - 0.5))) * smoothstep(0.45, 0.65, wbNoise3(p * 0.9 + 4.0));
    float pulse = 0.7 + 0.3 * sin(uTime * 1.1 + p.y * 0.8);
    cvEm += vec3(0.55, 0.35, 1.0) * vein * vr * pulse * 0.9;
    col = mix(col, vec3(0.3, 0.2, 0.55), vein * vr * 0.6);
  }
  return col;
}
`;
export const ROCK_COLOR_FRAGMENT = `
vec3 cvN0 = normalize(vCvN);
diffuseColor.rgb = cvRockAlbedo(vCvW, cvN0);
`;
export const ROCK_ROUGHNESS_FRAGMENT = `
roughnessFactor = cvRough;
`;
export const ROCK_NORMAL_FRAGMENT = `
{
  float fade = 1.0 - smoothstep(18.0, 45.0, length(vCvW - cameraPosition));
  vec3 nb = cvPerturb(vCvW, cvN0, cvBumpH * 0.15 * fade);
  normal = normalize((viewMatrix * vec4(nb, 0.0)).xyz);
}
`;
export const ROCK_EMISSIVE_FRAGMENT = `
totalEmissiveRadiance += cvEm;
`;
export const ROCK_LIGHTS_FRAGMENT = `
{
  vec3 cvNW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float cvAo = vCvBake.a;
  vec3 cvL = cvGlow(vCvW, cvNW) + vCvBake.rgb * uBake * cvWakeK(vCvW) + vec3(0.55, 0.62, 0.8) * uFill;
  reflectedLight.indirectDiffuse *= mix(0.45, 1.0, cvAo);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * cvL * mix(0.6, 1.0, cvAo);
}
`;
export const FUNGUS_PARS_VERTEX = `
#include <wb_common>
attribute vec4 aFung;   // part, cluster, glow weight, sway
attribute vec3 aGlowCol;
attribute vec3 aPivot;
uniform vec4 uMushB[32];
varying vec3 vFgW;
varying vec3 vFgN;
varying vec4 vFung;
varying vec3 vFgGlow;
varying float vFgB;
varying vec3 vFgLocal;
`;
export const FUNGUS_BEGIN_VERTEX = `
{
  int ci = int(aFung.y + 0.5);
  float b = uMushB[ci >> 2][ci & 3];
  vFgB = b;
  vFgLocal = transformed - aPivot;
  // blooming glowcaps swell and breathe
  float swell = 1.0 + 0.1 * max(b - 1.0, 0.0) * (0.6 + 0.4 * sin(uTime * 5.0 + aFung.y));
  float breathe = 1.0 + 0.018 * sin(uTime * 1.3 + aFung.y * 2.7) * step(0.5, aFung.x) * step(aFung.x, 3.5);
  transformed = aPivot + (transformed - aPivot) * swell * breathe;
  // hanging moss / root tips sway
  if (aFung.w > 0.0) {
    float ph = dot(aPivot, vec3(0.37, 0.11, 0.53));
    transformed.x += sin(uTime * 1.1 + ph) * 0.12 * aFung.w;
    transformed.z += cos(uTime * 0.9 + ph * 1.3) * 0.1 * aFung.w;
  }
}
`;
export const FUNGUS_PROJECT_VERTEX = `
vFgW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vFgN = normalize(mat3(modelMatrix) * objectNormal);
vFung = aFung;
vFgGlow = aGlowCol;
`;
export const FUNGUS_PARS_FRAGMENT = `
${GLOW_GLSL}
${PERTURB_GLSL}
varying vec3 vFgW;
varying vec3 vFgN;
varying vec4 vFung;
varying vec3 vFgGlow;
varying float vFgB;
varying vec3 vFgLocal;
vec3 fgEm = vec3(0.0);
`;
export const FUNGUS_COLOR_FRAGMENT = `
{
  float part = vFung.x;
  vec3 c = diffuseColor.rgb;
  float n1 = wbNoise3(vFgW * 3.1);
  float b = vFgB;
  float pulse = 0.82 + 0.18 * sin(uTime * 1.6 + vFung.y * 1.9);
  float gw = vFung.z;
  if (part < 0.5) {
    // stalk: pale, faint vertical fibres, glowing a little near the gills
    c *= 0.85 + 0.2 * wbNoise3(vec3(vFgW.x * 9.0, vFgW.y * 1.2, vFgW.z * 9.0));
    fgEm += vFgGlow * gw * b * 0.25 * pulse;
  } else if (part < 1.5) {
    // cap top: soft mottling + a glowing rim
    c *= 0.82 + 0.3 * n1;
    fgEm += vFgGlow * gw * b * (0.55 + 0.45 * n1) * pulse;
  } else if (part < 2.5) {
    // gills / underside: the brightest part
    float gill = 0.6 + 0.4 * sin(atan(vFgLocal.z, vFgLocal.x) * 38.0);
    fgEm += vFgGlow * gw * b * (1.0 + 0.9 * gill) * pulse;
    c *= 0.7 + 0.3 * gill;
  } else if (part < 3.5) {
    // spots: little lanterns
    fgEm += mix(vFgGlow, vec3(1.0), 0.45) * gw * b * 1.7 * pulse;
  } else if (part < 4.5) {
    // roots / bark: fibrous, tips glow faintly
    c *= 0.75 + 0.35 * wbNoise3(vec3(vFgW.x * 5.0, vFgW.y * 14.0, vFgW.z * 5.0));
    fgEm += vFgGlow * gw * b * 0.7 * pulse;
  } else {
    // hanging moss strands
    c *= 0.8 + 0.3 * n1;
    fgEm += vFgGlow * gw * b * 0.5 * pulse;
  }
  diffuseColor.rgb = c;
}
`;
export const FUNGUS_EMISSIVE_FRAGMENT = `
totalEmissiveRadiance += fgEm;
`;
export const FUNGUS_LIGHTS_FRAGMENT = `
{
  vec3 fgNW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * (cvGlow(vFgW, fgNW) * 0.9 + vec3(0.55, 0.62, 0.8) * uFill);
}
`;
export const CRYSTAL_PARS_VERTEX = `
attribute float aGlow;
varying vec3 vCrW;
varying float vCrGlow;
`;
export const CRYSTAL_PROJECT_VERTEX = `
vCrW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vCrGlow = aGlow;
`;
export const CRYSTAL_PARS_FRAGMENT = `
#include <wb_common>
${GLOW_GLSL}
varying vec3 vCrW;
varying float vCrGlow;
`;
export const CRYSTAL_EMISSIVE_FRAGMENT = `
{
  vec3 V = normalize(vViewPosition);
  float fr = pow(1.0 - clamp(abs(dot(normalize(normal), V)), 0.0, 1.0), 2.2);
  float inner = wbNoise3(vCrW * 1.3 + vec3(0.0, uTime * 0.15, 0.0));
  float pulse = 0.78 + 0.22 * sin(uTime * 1.4 + dot(vCrW, vec3(0.4, 0.9, 0.3)));
  vec3 base = diffuseColor.rgb;
  totalEmissiveRadiance += base * vCrGlow * (0.35 + 0.65 * inner) * pulse * 1.1 * mix(1.0, uWakeAmt, 0.35);
  totalEmissiveRadiance += mix(base, vec3(1.0), 0.5) * fr * vCrGlow * 0.9;
}
`;
export const CRYSTAL_LIGHTS_FRAGMENT = `
{
  vec3 crNW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * cvGlow(vCrW, crNW) * 1.2;
}
`;
export const POOL_PARS_VERTEX = `
varying vec3 vPlW;
`;
export const POOL_PROJECT_VERTEX = `
vPlW = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;
export const POOL_PARS_FRAGMENT = `
#include <wb_common>
${GLOW_GLSL}
varying vec3 vPlW;
uniform vec3 uPoolGlow;
`;
export const POOL_NORMAL_FRAGMENT = `
{
  vec2 q = vPlW.xz;
  float t = uTime;
  float hgt = wbNoise2(q * 1.3 + vec2(t * 0.25, -t * 0.18)) * 0.5 + wbNoise2(q * 3.1 - vec2(t * 0.3, t * 0.22)) * 0.25;
  vec3 sx = dFdx(vPlW), sy = dFdy(vPlW);
  vec3 n0 = vec3(0.0, 1.0, 0.0);
  vec3 r1 = cross(sy, n0), r2 = cross(n0, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(hgt * 0.05) * r1 + dFdy(hgt * 0.05) * r2);
  vec3 nb = normalize(abs(det) * n0 - g);
  normal = normalize((viewMatrix * vec4(nb, 0.0)).xyz);
}
`;
export const POOL_EMISSIVE_FRAGMENT = `
{
  vec3 V = normalize(cameraPosition - vPlW);
  vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float fr = 0.04 + 0.96 * pow(1.0 - clamp(dot(nW, V), 0.0, 1.0), 5.0);
  // reflected glow: sample the glow field a little above the surface along the reflection
  vec3 R = reflect(-V, nW);
  vec3 refl = cvGlow(vPlW + R * 1.5 + vec3(0.0, 0.4, 0.0), -R) * 0.8;
  float ca = wbNoise2(vPlW.xz * 1.6 + vec2(uTime * 0.15, -uTime * 0.1)) * 0.6 + wbNoise2(vPlW.xz * 3.3 - vec2(uTime * 0.2, 0.0)) * 0.4;
  float caust = (1.0 - smoothstep(0.0, 0.06, abs(ca - 0.5))) * 0.55;
  float depthK = 0.25 + 0.35 * wbNoise2(vPlW.xz * 0.4);
  totalEmissiveRadiance += (uPoolGlow * (depthK + caust) * uBake * mix(1.0, uWakeAmt, 0.5) + refl) * (0.35 + fr * 1.1);
}
`;
export const STONE_PARS_VERTEX = `
attribute float aEmit;
varying vec3 vStW;
varying vec3 vStN;
varying float vStEmit;
`;
export const STONE_PROJECT_VERTEX = `
vStW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vStN = normalize(mat3(modelMatrix) * objectNormal);
vStEmit = aEmit;
`;
export const STONE_PARS_FRAGMENT = `
#include <wb_common>
${GLOW_GLSL}
${PERTURB_GLSL}
varying vec3 vStW;
varying vec3 vStN;
varying float vStEmit;
uniform vec3 uStoneEmit;
float stH = 0.0;
`;
export const STONE_COLOR_FRAGMENT = `
{
  vec3 p = vStW;
  float big = wbNoise3(p * 0.9);
  float fine = wbNoise3(p * 4.3 + 2.0);
  stH = fine * 0.7 + wbNoise3(p * 11.0) * 0.3;
  diffuseColor.rgb *= 0.78 + 0.26 * big + 0.1 * fine;
  // lavender cool in the undersides
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.84, 0.82, 1.06), smoothstep(0.1, -0.7, normalize(vStN).y) * 0.6);
  // moss on the tops
  float moss = smoothstep(0.6, 0.95, normalize(vStN).y) * smoothstep(0.55, 0.75, big + fine * 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb, CV_SRGB(46.0, 86.0, 70.0), moss * 0.6);
}
`;
export const STONE_NORMAL_FRAGMENT = `
normal = cvPerturb(-vViewPosition, normal, stH * 0.02);
`;
export const STONE_EMISSIVE_FRAGMENT = `
totalEmissiveRadiance += diffuseColor.rgb * uStoneEmit * vStEmit * (0.85 + 0.15 * sin(uTime * 2.0 + vStW.y));
`;
export const STONE_LIGHTS_FRAGMENT = `
{
  vec3 stNW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * (cvGlow(vStW, stNW) + vec3(0.55, 0.62, 0.8) * uFill);
}
`;
