/**
 * Shaders and materials for the sky isles, their stonework and their stained glass: meadow, snow, volcanic and lush ground, bump detail and glowing veins, all faded by vitality.
 */
import { MeshStandardMaterial } from 'three';
import { SKY_VITALITY_GLSL } from './vitality.js';
const SK_COMMON_GLSL = `
vec3 skPerturb(vec3 p, vec3 n, float h) {
  vec3 sx = dFdx(p);
  vec3 sy = dFdy(p);
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g);
}
#define SK_SRGB(r, g, b) pow(vec3(r, g, b) / 255.0, vec3(2.2))
`;
const ISLE_PARS_VERTEX = `
#include <wb_common>
attribute vec4 aSky;
attribute float aFloat;
varying vec3 vSkW;
varying vec3 vSkN;
varying vec4 vSkS;
`;
const ISLE_FLOAT_VERTEX = `
if (aFloat > 0.0) {
  float ph = aFloat * 6.2831;
  transformed.y += sin(uTime * 0.45 + ph) * 0.45 + sin(uTime * 0.21 + ph * 2.3) * 0.25;
  transformed.x += sin(uTime * 0.17 + ph * 1.7) * 0.3;
}
`;
const ISLE_WORLD_VERTEX = `
vSkW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSkN = normalize(mat3(modelMatrix) * objectNormal);
vSkS = aSky;
`;
const ISLE_PARS_FRAGMENT = `
${SKY_VITALITY_GLSL}
#include <wb_burn_pars>
varying vec3 vSkW;
varying vec3 vSkN;
varying vec4 vSkS;
uniform float uSkyVeins;
${SK_COMMON_GLSL}
float skBumpH = 0.0;
float skBumpW = 0.0;
float skRockW = 0.0;
vec3 skVeinE = vec3(0.0);

vec2 skVoronoi(vec2 x, out vec2 cellId) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float d1 = 8.0, d2 = 8.0;
  cellId = n;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = wbHash22(n + g) * 0.95 + 0.025;
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; cellId = n + g; }
    else if (d < d2) { d2 = d; }
  }
  return vec2(sqrt(d1), sqrt(d2));
}

`;
const MEADOW_ALBEDO_GLSL = `
vec3 skIsleAlbedo(vec3 wp, vec3 wn, vec4 sp) {
  vec2 xz = wp.xz;
  float n1 = wbNoise2(xz * 0.13);
  float n2 = wbNoise2(xz * 0.55 + 7.3);
  float n3 = wbNoise2(xz * 2.3 - 3.1);
  float m = wbFbm2(xz * 0.02);
  float edge = (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.3 + (n3 - 0.5) * 0.14;
  vec3 faceN = normalize(cross(dFdx(wp), dFdy(wp)));

  // meadow
  float gv = clamp((m - 0.48) * 2.4 + 0.5 + (n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.12, 0.0, 1.0);
  vec3 grass = mix(SK_SRGB(74.0, 124.0, 48.0), SK_SRGB(148.0, 188.0, 84.0), gv);
  grass = mix(grass, SK_SRGB(190.0, 210.0, 118.0), smoothstep(0.5, 0.95, n2) * 0.25);
  grass = mix(grass, SK_SRGB(62.0, 104.0, 66.0), smoothstep(0.55, 0.95, 1.0 - n1) * 0.28);
  // meadow speckles of tiny wildflowers (read as painterly dabs from afar)
  float spk = smoothstep(0.84, 0.9, wbNoise2(xz * 3.1 + 11.0)) * smoothstep(0.4, 0.7, n1);
  grass = mix(grass, mix(SK_SRGB(236.0, 214.0, 250.0), SK_SRGB(255.0, 236.0, 150.0), step(0.5, n3)), spk * 0.55);
  vec3 col = grass;

  // earth band (under the lip) and worn earth on the flats
  float earthMask = smoothstep(0.3, 0.7, sp.z + edge * 0.5);
  vec3 earth = mix(SK_SRGB(112.0, 84.0, 60.0), SK_SRGB(150.0, 118.0, 84.0), n2);
  float fib = wbNoise2(vec2(wp.x * 2.0 + wp.z * 1.3, wp.y * 7.0));
  earth *= 0.86 + 0.24 * fib;
  col = mix(col, earth, earthMask);

  // flagstones: irregular worn slabs, grass creeping through the joints
  float paveMask = smoothstep(0.35, 0.65, sp.y + edge * 0.35);
  if (paveMask > 0.001) {
    vec2 cid;
    vec2 q = xz * 0.85 + vec2(wbNoise2(xz * 0.4), wbNoise2(xz * 0.4 + 7.0)) * 0.7;
    vec2 vd = skVoronoi(q, cid);
    float gap = vd.y - vd.x;
    float groove = 1.0 - smoothstep(0.02, 0.09, gap + (n3 - 0.5) * 0.04);
    float th = wbHash12(cid);
    vec3 stone = mix(SK_SRGB(150.0, 142.0, 128.0), SK_SRGB(190.0, 180.0, 160.0), th);
    stone = mix(stone, SK_SRGB(178.0, 160.0, 150.0), step(0.78, th) * 0.5);
    stone = mix(stone, SK_SRGB(160.0, 164.0, 170.0), step(th, 0.18) * 0.5);
    // wear: darker toward the joints, lichen speckles, hairline cracks
    stone *= 0.8 + 0.22 * smoothstep(0.0, 0.35, gap) + 0.1 * (n3 - 0.5);
    float lich = smoothstep(0.72, 0.8, wbNoise2(xz * 5.3 + cid)) * 0.5;
    stone = mix(stone, SK_SRGB(170.0, 170.0, 120.0), lich);
    float crack = 1.0 - smoothstep(0.0, 0.025, abs(wbNoise2(xz * 1.9 + cid * 3.1) - 0.5));
    stone *= 1.0 - crack * 0.25;
    vec3 grout = mix(SK_SRGB(96.0, 110.0, 70.0), grass * 0.85, 0.6);
    vec3 fl = mix(stone, grout, groove);
    float missing = step(0.9, wbHash12(cid + 17.0)) * (1.0 - step(0.95, sp.y));
    vec3 hollow = mix(grass * 0.72, earth, 0.35) * (0.85 + 0.3 * n3);
    fl = mix(fl, hollow, missing);
    col = mix(col, fl, paveMask);
    skBumpH += (1.0 - groove) * 0.06 * paveMask;
    skBumpW = max(skBumpW, paveMask * 0.8);
  }

  // rock (strata), from splat + steep faces
  float rock = smoothstep(0.3, 0.66, sp.x + (n1 - 0.5) * 0.6 + (n2 - 0.5) * 0.25);
  rock = max(rock, smoothstep(0.55, 0.4, abs(faceN.y) + (n2 - 0.5) * 0.08) * (1.0 - earthMask * 0.7));
  float yb = wp.y + (wbNoise2(xz * 0.045) - 0.5) * 5.0 + (n2 - 0.5) * 0.7;
  float b = yb / 2.8 + 0.32 * sin(yb * 0.37 + 1.3) + 0.18 * sin(yb * 0.91);
  float bf = fract(b);
  float bh = wbHash12(vec2(floor(b), 7.13));
  vec3 rockC = mix(SK_SRGB(122.0, 114.0, 104.0), SK_SRGB(186.0, 174.0, 156.0), clamp(0.5 + (bh - 0.5) * 0.9 + (n1 - 0.5) * 0.5, 0.0, 1.0));
  rockC = mix(rockC, rockC * vec3(1.08, 1.0, 0.9), smoothstep(0.4, 0.8, wbNoise2(vec2(wp.x + wp.z, wp.y) * 0.05)) * 0.6);
  rockC = mix(rockC, SK_SRGB(160.0, 150.0, 164.0), smoothstep(0.65, 0.9, bh) * 0.25); // lavender strata
  rockC *= 0.93 + 0.07 * smoothstep(0.0, 0.3, bf);
  vec2 hn = abs(wn.xz) / max(abs(wn.x) + abs(wn.z), 1e-3);
  float steep = smoothstep(0.2, 0.75, 1.0 - abs(wn.y));
  float sA = wbNoise2(vec2(wp.x * 1.1, wp.y * 0.055)) * 0.6 + wbNoise2(vec2(wp.x * 2.9, wp.y * 0.11) + 5.0) * 0.4;
  float sB = wbNoise2(vec2(wp.z * 1.1, wp.y * 0.055) + 13.0) * 0.6 + wbNoise2(vec2(wp.z * 2.9, wp.y * 0.11) + 21.0) * 0.4;
  float streak = mix(n1 * 0.6 + n2 * 0.4, mix(sA, sB, smoothstep(0.3, 0.7, hn.x)), steep) * 0.85 + n3 * 0.15;
  rockC *= 0.9 + 0.18 * streak;
  // lavender cool in overhangs, darker toward the tip
  rockC = mix(rockC, rockC * vec3(0.86, 0.83, 0.98), smoothstep(0.3, -0.6, wn.y) * 0.6);
  float lip = smoothstep(0.45, 0.85, bf) * (1.0 - smoothstep(0.85, 1.0, bf)) * 0.5;
  float moss = smoothstep(0.86, 0.95, wn.y) * smoothstep(0.5, 0.75, n2);
  rock *= 1.0 - moss * 0.8;
  col = mix(col, rockC, rock);
  skBumpH = mix(skBumpH, streak * 0.3 + lip * 0.05 * steep, rock);
  skBumpW = max(skBumpW, rock);
  skRockW = rock;

  // root bark
  if (sp.w > 0.01) {
    float g2 = wbNoise2(vec2(wp.x * 5.0 + wp.z * 3.0, wp.y * 1.3));
    vec3 bark = mix(SK_SRGB(138.0, 108.0, 80.0), SK_SRGB(180.0, 146.0, 106.0), g2);
    col = mix(col, bark, clamp(sp.w, 0.0, 1.0));
    skRockW *= 1.0 - sp.w;
  }

  // luminous veins in the underside rock (the sky's old colour, trapped in stone)
  float under = smoothstep(0.1, -0.4, wn.y) * rock;
  if (under > 0.01) {
    float vn = wbNoise3(wp * vec3(0.13, 0.07, 0.13));
    float vn2 = wbNoise3(wp * vec3(0.4, 0.18, 0.4) + 9.0);
    float fw = fwidth(vn) * 1.2 + 0.004;
    float vein = (1.0 - smoothstep(0.0, fw + 0.01, abs(vn - 0.5))) * smoothstep(0.5, 0.7, vn2);
    float hue = fract(wp.y * 0.013 + vn2 * 0.4 + wp.x * 0.004);
    vec3 prism = 0.7 + 0.3 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
    skVeinE = prism * vein * under;
  }

  col *= 0.97 + 0.06 * n3;
  return col;
}
`;
const MEADOW_PARS_FRAGMENT = ISLE_PARS_FRAGMENT + MEADOW_ALBEDO_GLSL;
const ISLE_COLOR_FRAGMENT = `
vec3 skN0 = normalize(vSkN);
vec3 skAlb = skIsleAlbedo(vSkW, skN0, vSkS);
{
  float burnt = clamp(wbBurnt(vSkW.xz), 0.0, 1.0) * (1.0 - skRockW) * step(0.5, skN0.y);
  skAlb = mix(skAlb, mix(vec3(0.02, 0.018, 0.017), vec3(0.075, 0.066, 0.06), wbNoise2(vSkW.xz * 1.7)), burnt * 0.9);
}
float skVit = skyVitality(vSkW);
diffuseColor.rgb = skyApplyVitRaw(skAlb, vSkW);
`;
const ISLE_NORMAL_FRAGMENT = `
{
  float fade = 1.0 - smoothstep(25.0, 90.0, length(vSkW - cameraPosition));
  vec3 nb = skPerturb(vSkW, skN0, skBumpH * fade);
  vec3 nv = normalize((viewMatrix * vec4(nb, 0.0)).xyz);
  normal = normalize(mix(normal, nv, clamp(skBumpW, 0.0, 1.0)));
}
`;
const ISLE_EMISSIVE_FRAGMENT = `
totalEmissiveRadiance += skVeinE * uSkyVeins * (0.12 + 0.55 * skVit) * (0.8 + 0.2 * sin(uTime * 1.3 + vSkW.y * 0.2));
totalEmissiveRadiance += skyVitGlow(vSkW) * (0.25 + diffuseColor.rgb);
`;
const ISLE_LIGHTS_FRAGMENT = `
reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(1.06, 0.95, 1.24), skRockW * 0.85);
{
  // sea + cloud bounce light on the undersides: keeps them luminous instead of a dark mass
  float skDown = clamp(-normalize(vSkN).y, 0.0, 1.0);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * (uSkyColor * 0.3 + uSunColor * 0.12 + vec3(0.06, 0.06, 0.07)) * skDown * 0.5;
}
`;
const SNOW_ALBEDO_GLSL = `
vec3 skExtraE = vec3(0.0);
vec3 skIsleAlbedo(vec3 wp, vec3 wn, vec4 sp) {
  vec2 xz = wp.xz;
  float n1 = wbNoise2(xz * 0.13);
  float n2 = wbNoise2(xz * 0.55 + 7.3);
  float n3 = wbNoise2(xz * 2.3 - 3.1);
  float edge = (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.3 + (n3 - 0.5) * 0.14;
  vec3 faceN = normalize(cross(dFdx(wp), dFdy(wp)));
  vec3 V = normalize(uCameraPos - wp);

  // snowfield: soft drifts, wind ripples, cool blue in the hollows
  float drift = wbNoise2(xz * 0.07 + 3.0);
  float rip = sin(dot(xz, vec2(0.83, 0.55)) * 3.4 + wbNoise2(xz * 0.35) * 6.0) * 0.5 + 0.5;
  vec3 snow = mix(SK_SRGB(200.0, 216.0, 238.0), SK_SRGB(248.0, 249.0, 252.0), smoothstep(0.15, 0.85, drift * 0.65 + n2 * 0.35));
  snow *= 0.955 + 0.06 * rip;
  snow = mix(snow, SK_SRGB(208.0, 222.0, 250.0), smoothstep(0.55, 0.95, 1.0 - n1) * 0.4);
  // footprints of old paint: faint pastel stains under the snow
  float stain = smoothstep(0.82, 0.9, wbNoise2(xz * 0.21 + 40.0)) * 0.12;
  snow = mix(snow, mix(SK_SRGB(255.0, 200.0, 210.0), SK_SRGB(200.0, 230.0, 255.0), n3), stain);
  vec3 col = snow;
  skBumpH = rip * 0.06 + n3 * 0.04;
  skBumpW = 0.55;
  // diamond-dust glints that twinkle as the view moves
  vec2 gq = xz * 5.0;
  vec2 gc = floor(gq);
  float gl = step(0.975, wbHash12(gc + floor(dot(V, vec3(4.0, 2.0, 5.0)) * 1.5))) * (1.0 - smoothstep(0.05, 0.14, length(fract(gq) - 0.5)));
  skExtraE += vec3(0.85, 0.93, 1.0) * gl * 0.9 * smoothstep(0.55, 0.9, wn.y) * smoothstep(40.0, 6.0, length(uCameraPos - wp));

  // earth band → a layer of old blue ice under the lip
  float earthMask = smoothstep(0.3, 0.7, sp.z + edge * 0.5);
  vec3 ice = mix(SK_SRGB(110.0, 162.0, 212.0), SK_SRGB(186.0, 222.0, 246.0), n2);
  float layers = fract(wp.y * 0.85 + n2 * 0.7);
  ice *= 0.88 + 0.14 * smoothstep(0.35, 0.65, layers);
  col = mix(col, ice, earthMask);
  skExtraE += SK_SRGB(80.0, 160.0, 230.0) * earthMask * 0.08;

  // snowy flagstones
  float paveMask = smoothstep(0.35, 0.65, sp.y + edge * 0.35);
  if (paveMask > 0.001) {
    vec2 cid;
    vec2 q = xz * 0.85 + vec2(wbNoise2(xz * 0.4), wbNoise2(xz * 0.4 + 7.0)) * 0.7;
    vec2 vd = skVoronoi(q, cid);
    float gap = vd.y - vd.x;
    float groove = 1.0 - smoothstep(0.02, 0.1, gap + (n3 - 0.5) * 0.04);
    float th = wbHash12(cid);
    vec3 stone = mix(SK_SRGB(138.0, 146.0, 160.0), SK_SRGB(186.0, 190.0, 200.0), th);
    stone *= 0.85 + 0.2 * smoothstep(0.0, 0.35, gap);
    float dust = smoothstep(0.45, 0.8, wbNoise2(xz * 1.7 + cid * 3.0));
    vec3 fl = mix(stone, snow, max(groove, dust * 0.7));
    col = mix(col, fl, paveMask);
    skBumpH += (1.0 - groove) * 0.06 * paveMask;
    skBumpW = max(skBumpW, paveMask * 0.8);
  }

  // rock: blue-grey granite with frozen streaks; snow settles on anything facing up
  float rock = smoothstep(0.3, 0.66, sp.x + (n1 - 0.5) * 0.6 + (n2 - 0.5) * 0.25);
  rock = max(rock, smoothstep(0.55, 0.4, abs(faceN.y) + (n2 - 0.5) * 0.08) * (1.0 - earthMask * 0.7));
  float cap = smoothstep(0.52, 0.78, wn.y + (n2 - 0.5) * 0.35) * (1.0 - earthMask);
  float yb = wp.y + (wbNoise2(xz * 0.045) - 0.5) * 5.0 + (n2 - 0.5) * 0.7;
  float b = yb / 2.6 + 0.3 * sin(yb * 0.37 + 1.3);
  float bh = wbHash12(vec2(floor(b), 3.71));
  vec3 rockC = mix(SK_SRGB(84.0, 92.0, 112.0), SK_SRGB(150.0, 158.0, 176.0), clamp(0.5 + (bh - 0.5) * 0.45 + (n1 - 0.5) * 0.6, 0.0, 1.0));
  rockC = mix(rockC, SK_SRGB(150.0, 146.0, 176.0), smoothstep(0.65, 0.9, bh) * 0.3);
  vec2 hn = abs(wn.xz) / max(abs(wn.x) + abs(wn.z), 1e-3);
  float steep = smoothstep(0.2, 0.75, 1.0 - abs(wn.y));
  float sA = wbNoise2(vec2(wp.x * 1.3, wp.y * 0.06)) * 0.6 + wbNoise2(vec2(wp.x * 3.1, wp.y * 0.13) + 5.0) * 0.4;
  float sB = wbNoise2(vec2(wp.z * 1.3, wp.y * 0.06) + 13.0) * 0.6 + wbNoise2(vec2(wp.z * 3.1, wp.y * 0.13) + 21.0) * 0.4;
  float streak = mix(n1 * 0.6 + n2 * 0.4, mix(sA, sB, smoothstep(0.3, 0.7, hn.x)), steep);
  rockC *= 0.88 + 0.2 * streak;
  // sheets of glassy ice down the cliffs
  float glaze = smoothstep(0.55, 0.8, streak + (n3 - 0.5) * 0.2) * steep;
  rockC = mix(rockC, SK_SRGB(168.0, 214.0, 240.0), glaze * 0.7);
  skExtraE += SK_SRGB(90.0, 170.0, 240.0) * glaze * pow(1.0 - abs(dot(wn, V)), 2.0) * 0.35 * rock;
  rockC = mix(rockC, rockC * vec3(0.86, 0.9, 1.06), smoothstep(0.3, -0.6, wn.y) * 0.6);
  rock *= 1.0 - cap;
  col = mix(col, rockC, rock);
  skBumpH = mix(skBumpH, streak * 0.3, rock);
  skBumpW = max(skBumpW, rock);
  skRockW = rock * (1.0 - glaze * 0.5);

  // pine bark / timber
  if (sp.w > 0.01) {
    float g2 = wbNoise2(vec2(wp.x * 5.0 + wp.z * 3.0, wp.y * 1.3));
    vec3 bark = mix(SK_SRGB(104.0, 78.0, 62.0), SK_SRGB(150.0, 116.0, 88.0), g2);
    bark = mix(bark, snow, smoothstep(0.6, 0.9, wn.y) * 0.8);
    col = mix(col, bark, clamp(sp.w, 0.0, 1.0));
    skRockW *= 1.0 - sp.w;
  }

  // frozen light in the underside: cold cyan crystal veins
  float under = smoothstep(0.1, -0.4, wn.y) * max(rock, earthMask);
  if (under > 0.01) {
    float vn = wbNoise3(wp * vec3(0.13, 0.07, 0.13));
    float vn2 = wbNoise3(wp * vec3(0.4, 0.18, 0.4) + 9.0);
    float fw = fwidth(vn) * 1.2 + 0.004;
    float vein = (1.0 - smoothstep(0.0, fw + 0.01, abs(vn - 0.5))) * smoothstep(0.45, 0.7, vn2);
    skVeinE = mix(vec3(0.45, 0.85, 1.0), vec3(0.85, 0.95, 1.0), vn2) * vein * under * 1.3;
  }
  col *= 0.97 + 0.06 * n3;
  return col;
}
`;
const VOLCANIC_ALBEDO_GLSL = `
vec3 skExtraE = vec3(0.0);
vec3 skIsleAlbedo(vec3 wp, vec3 wn, vec4 sp) {
  vec2 xz = wp.xz;
  float n1 = wbNoise2(xz * 0.13);
  float n2 = wbNoise2(xz * 0.55 + 7.3);
  float n3 = wbNoise2(xz * 2.3 - 3.1);
  float edge = (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.3 + (n3 - 0.5) * 0.14;
  vec3 faceN = normalize(cross(dFdx(wp), dFdy(wp)));

  // ash plain: dark cinders, rust and ochre drifts, glassy obsidian specks
  float m = wbFbm2(xz * 0.03);
  vec3 ash = mix(SK_SRGB(44.0, 38.0, 38.0), SK_SRGB(92.0, 80.0, 74.0), smoothstep(0.3, 0.75, m + (n2 - 0.5) * 0.3));
  ash = mix(ash, SK_SRGB(122.0, 70.0, 44.0), smoothstep(0.62, 0.85, n1) * 0.45);
  ash = mix(ash, SK_SRGB(150.0, 128.0, 70.0), smoothstep(0.8, 0.93, wbNoise2(xz * 0.5 + 21.0)) * 0.35);
  float grit = wbNoise2(xz * 7.0);
  ash *= 0.86 + 0.24 * grit;
  float obs = smoothstep(0.86, 0.92, wbNoise2(xz * 3.3 + 11.0));
  ash = mix(ash, SK_SRGB(20.0, 18.0, 26.0), obs * 0.7);
  vec3 col = ash;
  skBumpH = grit * 0.05 + n3 * 0.05;
  skBumpW = 0.6;
  // hairline fissures with a faint ember glow
  float fis = 1.0 - smoothstep(0.0, 0.028, abs(wbNoise2(xz * 0.7 + vec2(n2 * 0.6)) - 0.5));
  fis *= smoothstep(0.58, 0.8, n1) * smoothstep(0.5, 0.9, wn.y);
  col = mix(col, SK_SRGB(60.0, 22.0, 12.0), fis * 0.6);
  skExtraE += vec3(1.0, 0.36, 0.08) * fis * (0.55 + 0.45 * sin(uTime * 1.3 + n1 * 12.0));

  // earth band → layered ash strata (ochre, rust, charcoal)
  float earthMask = smoothstep(0.3, 0.7, sp.z + edge * 0.5);
  float st = fract(wp.y * 0.55 + n2 * 0.5);
  vec3 strata = mix(SK_SRGB(130.0, 72.0, 46.0), SK_SRGB(170.0, 120.0, 70.0), smoothstep(0.3, 0.7, st));
  strata = mix(strata, SK_SRGB(52.0, 44.0, 42.0), step(0.78, st));
  col = mix(col, strata * (0.85 + 0.2 * n3), earthMask);

  // basalt paving: dark hexes, rust in the joints
  float paveMask = smoothstep(0.35, 0.65, sp.y + edge * 0.35);
  if (paveMask > 0.001) {
    vec2 cid;
    vec2 vd = skVoronoi(xz * 0.9, cid);
    float gap = vd.y - vd.x;
    float groove = 1.0 - smoothstep(0.02, 0.08, gap);
    float th = wbHash12(cid);
    vec3 tile = mix(SK_SRGB(46.0, 44.0, 50.0), SK_SRGB(84.0, 78.0, 80.0), th);
    tile *= 0.8 + 0.25 * smoothstep(0.0, 0.3, gap);
    vec3 fl = mix(tile, SK_SRGB(110.0, 56.0, 34.0), groove);
    col = mix(col, fl, paveMask);
    skBumpH += (1.0 - groove) * 0.07 * paveMask;
    skBumpW = max(skBumpW, paveMask * 0.8);
  }

  // basalt columns / cliffs
  float rock = smoothstep(0.3, 0.66, sp.x + (n1 - 0.5) * 0.6 + (n2 - 0.5) * 0.25);
  rock = max(rock, smoothstep(0.55, 0.4, abs(faceN.y) + (n2 - 0.5) * 0.08) * (1.0 - earthMask * 0.7));
  float colsN = wbNoise2(vec2((wp.x - wp.z) * 0.9, wp.y * 0.05)) * 0.6 + wbNoise2(vec2((wp.x + wp.z) * 0.7, wp.y * 0.07) + 9.0) * 0.4;
  float colEdge = 0.0;
  vec3 rockC = mix(SK_SRGB(40.0, 38.0, 46.0), SK_SRGB(92.0, 86.0, 92.0), clamp(0.5 + (colsN - 0.5) * 0.9 + (n1 - 0.5) * 0.4, 0.0, 1.0));
  rockC = mix(rockC, SK_SRGB(120.0, 62.0, 40.0), smoothstep(0.6, 0.85, wbNoise2(vec2(wp.x * 0.7 + wp.z * 0.5, wp.y * 0.12))) * 0.5);
  rockC *= 1.0 - colEdge * 0.35;
  float steep = smoothstep(0.2, 0.75, 1.0 - abs(wn.y));
  col = mix(col, rockC, rock);
  skBumpH = mix(skBumpH, colsN * 0.25 + colEdge * 0.08 * steep, rock);
  skBumpW = max(skBumpW, rock);
  skRockW = rock;

  // charred timber
  if (sp.w > 0.01) {
    float g2 = wbNoise2(vec2(wp.x * 5.0 + wp.z * 3.0, wp.y * 1.3));
    vec3 bark = mix(SK_SRGB(26.0, 22.0, 22.0), SK_SRGB(62.0, 50.0, 44.0), g2);
    col = mix(col, bark, clamp(sp.w, 0.0, 1.0));
    float crack = smoothstep(0.78, 0.9, wbNoise2(vec2(wp.x * 3.0 + wp.z * 2.0, wp.y * 4.0)));
    skExtraE += vec3(1.0, 0.35, 0.08) * crack * sp.w * 0.6;
    skRockW *= 1.0 - sp.w;
  }

  // magma veins in the underside (always alight)
  float under = smoothstep(0.15, -0.4, wn.y) * rock;
  if (under > 0.01) {
    float vn = wbNoise3(wp * vec3(0.12, 0.06, 0.12));
    float vn2 = wbNoise3(wp * vec3(0.4, 0.18, 0.4) + 9.0);
    float fw = fwidth(vn) * 1.4 + 0.006;
    float vein = (1.0 - smoothstep(0.0, fw + 0.014, abs(vn - 0.5))) * smoothstep(0.4, 0.68, vn2);
    skExtraE += mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.62, 0.18), vn2) * vein * under * (1.4 + 0.5 * sin(uTime * 0.9 + wp.y * 0.3));
  }
  col *= 0.97 + 0.06 * n3;
  return col;
}
`;
const LUSH_ALBEDO_GLSL = MEADOW_ALBEDO_GLSL.replace('vec3 skIsleAlbedo(', 'vec3 skMeadowBase(').concat(`
vec3 skExtraE = vec3(0.0);
vec3 skIsleAlbedo(vec3 wp, vec3 wn, vec4 sp) {
  vec3 c = skMeadowBase(wp, wn, sp);
  vec2 xz = wp.xz;
  float n = wbNoise2(xz * 0.09 + 5.0);
  float n2 = wbNoise2(xz * 0.8 + 2.0);
  // lusher: deeper greens, clover patches and moss creeping over the rock
  c = mix(c, c * vec3(0.86, 1.06, 0.8), (1.0 - skRockW) * 0.5);
  float moss = skRockW * smoothstep(0.35, 0.85, wn.y + (n2 - 0.5) * 0.5);
  c = mix(c, mix(SK_SRGB(64.0, 104.0, 44.0), SK_SRGB(112.0, 150.0, 60.0), n2), moss * 0.85);
  skRockW *= 1.0 - moss;
  float clover = smoothstep(0.62, 0.8, n) * (1.0 - skRockW) * smoothstep(0.7, 0.95, wn.y);
  c = mix(c, SK_SRGB(70.0, 128.0, 60.0), clover * 0.35);
  skVeinE *= vec3(0.7, 1.1, 0.5);
  return c;
}
`);
const STONE_SNOW_FRAGMENT = `
{
  // snow settles on the ledges and tops of every stone
  float capN = wbNoise3(vStW * 1.1 + 4.0);
  float cap = smoothstep(0.55, 0.8, normalize(vStN).y + (capN - 0.5) * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, skyApplyVitRaw(vec3(0.93, 0.95, 0.99), vStW), cap * 0.92);
  stMoss *= 1.0 - cap;
}
`;
const STONE_SOOT_FRAGMENT = `
{
  // soot and heat: darker toward the ground, warm ember-brown in the crevices
  float soot = smoothstep(0.6, 0.2, wbNoise3(vStW * 0.35 + 2.0)) * 0.5;
  diffuseColor.rgb *= 1.0 - soot;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 0.86, 0.72), 0.4);
  stMoss = 0.0;
}
`;
const STONE_PARS_VERTEX = `
varying vec3 vStW;
varying vec3 vStN;
`;
const STONE_WORLD_VERTEX = `
{
  vec4 wp4 = vec4(transformed, 1.0);
  vec3 n0 = objectNormal;
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
    n0 = mat3(instanceMatrix) * n0;
  #endif
  wp4 = modelMatrix * wp4;
  vStW = wp4.xyz;
  vStN = normalize(mat3(modelMatrix) * n0);
}
`;
const STONE_PARS_FRAGMENT = `
${SKY_VITALITY_GLSL}
varying vec3 vStW;
varying vec3 vStN;
${SK_COMMON_GLSL}
float stH = 0.0;
float stMoss = 0.0;
`;
const STONE_COLOR_FRAGMENT = `
{
  vec3 p = vStW;
  vec3 n = normalize(vStN);
  float big = wbNoise3(p * 0.31);
  float mid = wbNoise3(p * 1.27 + 7.1);
  float fine = wbNoise3(p * 4.9 - 3.3);
  stH = mid * 0.55 + fine * 0.35 + wbNoise3(p * 13.0) * 0.1;
  vec3 col = diffuseColor.rgb;
  col *= 0.8 + 0.24 * big + 0.1 * mid + 0.07 * fine;
  col = mix(col, col * vec3(1.05, 0.97, 0.9), smoothstep(0.3, 0.75, wbNoise3(p * 0.08 + 3.0)));
  float vert = 1.0 - abs(n.y);
  float streak = wbNoise2(vec2((p.x + p.z) * 2.1, p.y * 0.16 + big));
  col *= 1.0 - vert * smoothstep(0.52, 0.9, streak) * 0.2;
  col *= 0.88 + 0.16 * smoothstep(0.2, 0.7, stH);
  float up = smoothstep(0.35, 0.9, n.y);
  float lich = wbNoise3(p * 2.7 + 5.0) * 0.6 + fine * 0.4;
  float speck = smoothstep(0.3, 0.7, wbNoise3(p * 12.0 + 3.0));
  float moss = up * smoothstep(0.6, 0.85, lich + big * 0.22 - 0.1) * mix(0.35, 1.0, speck) * 0.8;
  moss = max(moss, vert * smoothstep(0.66, 0.82, wbNoise3(p * vec3(1.7, 0.7, 1.7) + 11.0)) * 0.4);
  vec3 mossCol = mix(vec3(0.1, 0.17, 0.05), vec3(0.24, 0.33, 0.1), fine);
  col = mix(col, mossCol, moss * 0.7);
  // faded paint drips of the first painters
  float sn = wbNoise3(vec3(p.x * 2.6, p.y * 0.75 + p.x * 0.2, p.z * 2.6) + 40.0);
  float stain = smoothstep(0.8, 0.83, sn + fine * 0.05) * (1.0 - moss) * smoothstep(0.35, 0.6, wbNoise3(p * 0.3 + 7.0));
  float which = wbNoise3(p * 0.045 + 90.0);
  vec3 sc = which < 0.42 ? vec3(0.95, 0.28, 0.16) : which < 0.5 ? vec3(0.22, 0.6, 0.95) : which < 0.58 ? vec3(1.0, 0.78, 0.18) : vec3(0.3, 0.78, 0.32);
  col = mix(col, sc * (0.5 + 0.25 * big), stain * 0.45);
  // cool lavender in the undersides of overhangs
  col = mix(col, col * vec3(0.86, 0.82, 1.05), smoothstep(0.0, -0.8, n.y) * 0.7);
  diffuseColor.rgb = skyApplyVitRaw(col, p);
  stMoss = moss;
}
`;
const STONE_ROUGHNESS_FRAGMENT = `
roughnessFactor = clamp(mix(roughnessFactor, 1.0, stMoss) - (1.0 - stH) * 0.08, 0.3, 1.0);
`;
const STONE_NORMAL_FRAGMENT = `
normal = skPerturb(-vViewPosition, normal, stH * (0.035 + 0.03 * stMoss));
`;
const STONE_EMISSIVE_FRAGMENT = `
totalEmissiveRadiance += skyVitGlow(vStW) * (0.25 + diffuseColor.rgb);
`;
const STONE_LIGHTS_FRAGMENT = `
reflectedLight.indirectDiffuse *= vec3(1.03, 0.98, 1.1);
`;
const GLASS_PARS_VERTEX = `
#include <wb_common>
attribute vec4 aSway;
attribute float aGlow;
varying vec3 vGlW;
varying float vGlGlow;
`;
const GLASS_SWAY_VERTEX = `
if (aSway.w > 0.0) {
  vec3 pv = aSway.xyz;
  vec3 rel = transformed - pv;
  float ph = dot(pv.xz, vec2(0.71, 1.31));
  vec2 wd = length(uWindDir) > 1e-4 ? normalize(uWindDir) : vec2(1.0, 0.0);
  float ang = aSway.w * (sin(uTime * 1.9 + ph) * 0.55 + sin(uTime * 3.3 + ph * 1.7) * 0.25 + 0.3 + uWindStrength * 0.6);
  vec3 ax = normalize(vec3(-wd.y, 0.0, wd.x));
  float c = cos(ang), s = sin(ang);
  rel = rel * c + cross(ax, rel) * s + ax * dot(ax, rel) * (1.0 - c);
  transformed = pv + rel;
}
`;
const GLASS_WORLD_VERTEX = `
vGlW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vGlGlow = aGlow;
`;
const GLASS_PARS_FRAGMENT = `
${SKY_VITALITY_GLSL}
varying vec3 vGlW;
varying float vGlGlow;
uniform float uGlassBoost;
vec3 glBase = vec3(0.0);
float glVit = 0.0;
`;
const GLASS_COLOR_FRAGMENT = `
{
  glBase = diffuseColor.rgb;
  glVit = skyVitShaped(vGlW);
  float n = wbNoise3(vGlW * 1.7);
  vec3 dull = mix(vec3(wbLuma(glBase)), glBase, 0.18) * vec3(0.95, 0.92, 1.1) * 0.8 + vec3(0.05, 0.05, 0.08);
  diffuseColor.rgb = mix(dull, glBase, glVit) * (0.85 + 0.3 * n);
}
`;
const GLASS_EMISSIVE_FRAGMENT = `
{
  vec3 V = normalize(vViewPosition);
  float fr = pow(1.0 - clamp(abs(dot(normalize(normal), V)), 0.0, 1.0), 2.5);
  float pulse = 0.85 + 0.15 * sin(uTime * 1.7 + dot(vGlW, vec3(0.3, 0.5, 0.2)));
  vec3 lit = mix(vec3(wbLuma(glBase)) * vec3(0.9, 0.88, 1.1), glBase, 0.25 + 0.75 * glVit);
  totalEmissiveRadiance += lit * vGlGlow * (0.18 + 1.25 * glVit + uGlassBoost) * pulse;
  totalEmissiveRadiance += (uSkyColor * 0.4 + lit * 0.5) * fr * (0.35 + 0.6 * glVit);
  totalEmissiveRadiance += skyVitGlow(vGlW) * 0.6;
}
`;
function patchPaint(ctx, material) {
  try {
    ctx.paint.patchMaterial(material, {
      paint: true,
      vitality: false,
    });
  } catch (err) {
    console.warn('[sky] patchMaterial failed', err);
  }
}
export function createSkyMaterials(ctx, vit, biome = 0) {
  const globals = ctx.globals;
  const uniforms = {
    uSkyVeins: {
      value: 1,
    },
    uGlassBoost: {
      value: 0,
    },
  };
  const isle = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.93,
    metalness: 0,
  });
  isle.name = 'sky-isle';
  isle.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, vit.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ISLE_PARS_VERTEX}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${ISLE_FLOAT_VERTEX}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${ISLE_WORLD_VERTEX}`);
    const pars =
      biome === 1
        ? ISLE_PARS_FRAGMENT + SNOW_ALBEDO_GLSL
        : biome === 2
          ? ISLE_PARS_FRAGMENT + VOLCANIC_ALBEDO_GLSL
          : biome === 3
            ? ISLE_PARS_FRAGMENT + LUSH_ALBEDO_GLSL
            : MEADOW_PARS_FRAGMENT;
    const emissive =
      biome === 0 ? ISLE_EMISSIVE_FRAGMENT : `${ISLE_EMISSIVE_FRAGMENT}\ntotalEmissiveRadiance += skExtraE;`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${pars}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${ISLE_COLOR_FRAGMENT}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${ISLE_NORMAL_FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissive}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${ISLE_LIGHTS_FRAGMENT}`);
  };
  isle.customProgramCacheKey = () => (biome === 0 ? 'wb-sky-isle-v1' : `wb-sky-isle-v1-b${biome}`);
  patchPaint(ctx, isle);
  const stone = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
  });
  stone.name = 'sky-stone';
  stone.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, vit.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${STONE_PARS_VERTEX}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${STONE_WORLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${STONE_PARS_FRAGMENT}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${STONE_COLOR_FRAGMENT}${biome === 1 ? STONE_SNOW_FRAGMENT : biome === 2 ? STONE_SOOT_FRAGMENT : ''}`,
      )
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${STONE_ROUGHNESS_FRAGMENT}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${STONE_NORMAL_FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${STONE_EMISSIVE_FRAGMENT}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${STONE_LIGHTS_FRAGMENT}`);
  };
  stone.customProgramCacheKey = () => (biome === 1 || biome === 2 ? `wb-sky-stone-v1-b${biome}` : 'wb-sky-stone-v1');
  patchPaint(ctx, stone);
  const glass = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.16,
    metalness: 0.05,
  });
  glass.name = 'sky-glass';
  glass.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, vit.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLASS_PARS_VERTEX}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${GLASS_SWAY_VERTEX}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${GLASS_WORLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLASS_PARS_FRAGMENT}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GLASS_COLOR_FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${GLASS_EMISSIVE_FRAGMENT}`);
  };
  glass.customProgramCacheKey = () => 'wb-sky-glass-v1';
  return {
    isle,
    stone,
    glass,
    uniforms,
    dispose() {
      isle.dispose();
      stone.dispose();
      glass.dispose();
    },
  };
}
