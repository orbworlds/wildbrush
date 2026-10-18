/**
 * The terrain material: a standard material patched with painterly splat shading for grass, golden grass, dirt, sand, paths, rock strata, sandstone and snow, plus relief bumps, underwater caustics and burn marks.
 */
import { MeshStandardMaterial } from 'three';
const TERRAIN_VARYINGS_GLSL = `
varying vec3 vWbtWorld;
varying vec3 vWbtNormal;
varying vec4 vWbtSplatA; // dirt, sand, rock, lush
varying vec4 vWbtSplatB; // path, dry, snow, sandstone
varying vec2 vWbtMacro;
`;
const TERRAIN_PARS_VERTEX = `
#include <wb_common>
attribute vec4 aSplatA;
attribute vec4 aSplatB;
${TERRAIN_VARYINGS_GLSL}
`;
const TERRAIN_VERTEX = `
vWbtWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWbtNormal = normalize(mat3(modelMatrix) * objectNormal);
vWbtSplatA = aSplatA;
vWbtSplatB = aSplatB;
vWbtMacro = vec2(wbFbm2(vWbtWorld.xz * 0.02), wbFbm2(vWbtWorld.xz * 0.005 + 31.0));
`;
const TERRAIN_PARS_FRAGMENT = `
#include <wb_common>
#include <wb_burn_pars>
${TERRAIN_VARYINGS_GLSL}
#define WBT_SRGB(r, g, b) pow(vec3(r, g, b) / 255.0, vec3(2.2))
float wbtBumpH = 0.0;   // painterly relief height (m), consumed by the normal stage
float wbtBumpW = 0.0;   // how much of the relief applies here

// Derivative bump mapping in world space (same maths as three's perturbNormalArb).
vec3 wbtPerturb(vec3 p, vec3 n, float h) {
  vec3 sx = dFdx(p);
  vec3 sy = dFdy(p);
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g);
}

vec3 wbtAlbedo(vec3 wp, vec3 wn, out float rockW, out float wet) {
  vec2 xz = wp.xz;
  vec4 sa = vWbtSplatA;
  vec4 sb = vWbtSplatB;
  float m = vWbtMacro.x;
  float big = vWbtMacro.y;
  float n1 = wbNoise2(xz * 0.13);
  float n2 = wbNoise2(xz * 0.55 + 7.3);
  float n3 = wbNoise2(xz * 2.3 - 3.1);
  // Painterly variation from the shared noise octaves (no extra noise taps).
  float stroke = clamp(n2 * 0.55 + n3 * 0.45 + (big - 0.5) * 0.4, 0.0, 1.0);
  float edge = (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.3 + (n3 - 0.5) * 0.14;

  float dirt = smoothstep(0.28, 0.72, sa.x + edge);
  float sand = smoothstep(0.3, 0.7, sa.y + edge * 0.6);
  float rock = smoothstep(0.3, 0.66, sa.z + ((n1 - 0.5) * 0.6 + (n2 - 0.5) * 0.25));
  float path = smoothstep(0.32, 0.68, sb.x + edge * 0.45);
  float dry = smoothstep(0.15, 0.85, sb.y + edge * 0.9);
  float snow = smoothstep(0.35, 0.65, sb.z + edge);
  float sst = sb.w;
  // Per-triangle slope keeps tall cliff triangles fully rock (no grass tongues up the walls)
  vec3 faceN = normalize(cross(dFdx(wp), dFdy(wp)));
  rock = max(rock, smoothstep(0.55, 0.42, abs(faceN.y) + (n2 - 0.5) * 0.08) * (1.0 - snow));

  // ── Grass: macro greens + sunlit patches + cool clumps
  float gv = clamp((m - 0.48) * 2.4 + 0.5 + (n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.12, 0.0, 1.0);
  vec3 grass = mix(WBT_SRGB(74.0, 124.0, 48.0), WBT_SRGB(148.0, 188.0, 84.0), gv);
  grass = mix(grass, WBT_SRGB(186.0, 206.0, 112.0), smoothstep(0.5, 0.95, n2) * 0.22);
  grass = mix(grass, WBT_SRGB(62.0, 104.0, 60.0), smoothstep(0.55, 0.95, 1.0 - n1) * 0.28);
  grass = mix(grass, grass * vec3(0.92, 0.95, 0.9), 1.0 - sa.w); // less lush → a touch drier
  vec3 golden = mix(WBT_SRGB(184.0, 142.0, 60.0), WBT_SRGB(228.0, 198.0, 112.0), clamp(gv + (n2 - 0.5) * 0.5, 0.0, 1.0));
  vec3 col = mix(grass, golden, dry);

  // ── Dirt
  vec3 dirtC = mix(WBT_SRGB(118.0, 88.0, 60.0), WBT_SRGB(156.0, 124.0, 86.0), n2);
  dirtC = mix(dirtC, WBT_SRGB(176.0, 138.0, 98.0), sst * 0.6);
  col = mix(col, dirtC, dirt);

  // ── Sand (+ darker wet band at the waterline)
  vec3 sandC = mix(WBT_SRGB(220.0, 198.0, 148.0), WBT_SRGB(238.0, 224.0, 186.0), clamp(m + (stroke - 0.5) * 0.5, 0.0, 1.0));
  float above = wp.y - uWaterLevel;
  wet = (1.0 - smoothstep(0.05, 0.75, above)) * sand;
  sandC = mix(sandC, WBT_SRGB(178.0, 158.0, 118.0), wet * 0.75);
  col = mix(col, sandC, sand);
  // Wind ripples in dry sand
  float ripple = sin(dot(xz, vec2(0.83, 0.55)) * 2.6 + n2 * 5.0 + n1 * 3.0) * 0.035 * (1.0 - wet);

  // ── Path (packed earth with pebbles, wheel-rut darkening at the edges)
  vec3 pathC = mix(WBT_SRGB(168.0, 140.0, 100.0), WBT_SRGB(204.0, 180.0, 136.0), n2 * 0.7 + n3 * 0.3);
  pathC *= 0.9 + 0.22 * smoothstep(0.58, 0.8, n3);
  pathC *= 0.9 + 0.1 * smoothstep(0.35, 0.95, sb.x);
  col = mix(col, pathC, path);

  // ── Rock with strata bands (tighter, warmer sandstone on the mesa)
  float tilt = mix(dot(xz, vec2(0.12, 0.2)), 0.0, sst);
  float y = wp.y + tilt + (wbNoise2(xz * 0.045) - 0.5) * mix(6.0, 2.0, sst) + (n2 - 0.5) * 0.7;
  float b = y / mix(3.4, 1.9, sst) + 0.32 * sin(y * 0.37 + 1.3) + 0.18 * sin(y * 0.91);
  float bi = floor(b);
  float bf = fract(b);
  float bh = wbHash12(vec2(bi, 7.13));
  float bhs = mix(0.5 + (bh - 0.5) * 0.45, bh, sst); // granite: gentle bands; sandstone: strong
  vec3 rockC = mix(WBT_SRGB(132.0, 122.0, 108.0), WBT_SRGB(174.0, 162.0, 142.0), clamp(bhs + (n1 - 0.5) * 0.6, 0.0, 1.0));
  rockC = mix(rockC, WBT_SRGB(150.0, 138.0, 120.0), smoothstep(0.55, 0.85, n2) * 0.35 * (1.0 - sst));
  vec3 sandstoneC = mix(WBT_SRGB(186.0, 126.0, 90.0), WBT_SRGB(226.0, 180.0, 130.0), bh);
  sandstoneC = mix(sandstoneC, WBT_SRGB(160.0, 98.0, 78.0), smoothstep(0.78, 1.0, bh));
  rockC = mix(rockC, sandstoneC, sst);
  rockC *= mix(0.93, 0.88, sst) + mix(0.07, 0.12, sst) * smoothstep(0.0, 0.16, bf) * (1.0 - 0.3 * smoothstep(0.85, 1.0, bf));
  // Streaks running down the rock face: 2-plane triplanar (x-y and z-y), blended by facing,
  // falling back to top-down on flat rock. Stable anywhere in the world (no swirls).
  vec2 hn = abs(wn.xz) / max(abs(wn.x) + abs(wn.z), 1e-3);
  float steep = smoothstep(0.2, 0.75, 1.0 - wn.y);
  float sA = wbNoise2(vec2(wp.x * 1.1, wp.y * 0.055)) * 0.6 + wbNoise2(vec2(wp.x * 2.9, wp.y * 0.11) + 5.0) * 0.4;
  float sB = wbNoise2(vec2(wp.z * 1.1, wp.y * 0.055) + 13.0) * 0.6 + wbNoise2(vec2(wp.z * 2.9, wp.y * 0.11) + 21.0) * 0.4;
  float sWall = mix(sA, sB, smoothstep(0.3, 0.7, hn.x));
  float streak = mix(n1 * 0.6 + n2 * 0.4, sWall, steep) * 0.85 + n3 * 0.15;
  rockC *= mix(0.84, 0.95, sst) + mix(0.3, 0.08, sst) * streak;
  // Desert varnish on sandstone: long, sparse dark stains running down from the rim
  float vA = wbNoise2(vec2(wp.x * 0.42 + 3.0, wp.y * 0.018));
  float vB = wbNoise2(vec2(wp.z * 0.42 + 9.0, wp.y * 0.018));
  float varnish = smoothstep(0.62, 0.82, mix(vA, vB, smoothstep(0.3, 0.7, hn.x))) * steep * sst;
  rockC = mix(rockC, rockC * vec3(0.62, 0.55, 0.52), varnish * 0.7);
  // Relief: a soft lip at the top of each stratum + streak grooves
  float lip = smoothstep(0.55, 0.9, bf) * (1.0 - smoothstep(0.9, 1.0, bf));
  wbtBumpH = streak * mix(0.45, 0.1, sst) + lip * mix(0.07, 0.2, sst) * steep;
  // Lavender cool tint in overhanging / downward-facing recesses
  rockC = mix(rockC, rockC * vec3(0.84, 0.8, 1.04), smoothstep(0.45, -0.1, wn.y) * 0.7);
  // Moss/grass creeps onto the flatter tops of rock (not on the mesa rim)
  float mossy = smoothstep(0.88, 0.96, wn.y) * (1.0 - sst) * smoothstep(0.5, 0.75, n2) * (1.0 - snow) * (1.0 - smoothstep(30.0, 42.0, wp.y));
  rock *= 1.0 - mossy * 0.8;
  col = mix(col, rockC, rock);
  rockW = rock;
  wbtBumpH = mix(ripple * sand, wbtBumpH, rock);
  wbtBumpW = max(rock, sand * 0.8);

  // ── Snow dusting on the summit
  col = mix(col, WBT_SRGB(236.0, 240.0, 248.0), snow);

  // Painterly luminance modulation (stronger on rock than on soft ground)
  col *= mix(0.97 + 0.06 * n3, 0.94 + 0.12 * stroke, path * 0.5 * (1.0 - rock));

  // ── Underwater: absorption + caustics
  float depth = -above;
  if (depth > 0.0) {
    col *= mix(vec3(1.0), vec3(0.42, 0.76, 0.8), smoothstep(0.0, 5.0, depth));
#ifndef WBT_LOW
    vec2 cp = xz * 0.45;
    float t = uTime;
    float c1 = wbNoise2(cp + vec2(t * 0.31, t * 0.17));
    float c2 = wbNoise2(cp * 1.37 + vec2(-t * 0.23, t * 0.29) + 17.0);
    float caust = pow(1.0 - abs(c1 - c2), 9.0);
    col += WBT_SRGB(200.0, 245.0, 236.0) * caust * 0.45 * smoothstep(0.0, 0.35, depth) * exp(-depth * 0.3);
#endif
  }
  return col;
}
`;
const TERRAIN_COLOR_FRAGMENT = `
float wbtRock = 0.0;
float wbtWet = 0.0;
vec3 wbtN = normalize(vWbtNormal);
vec3 wbtAlb = wbtAlbedo(vWbtWorld, wbtN, wbtRock, wbtWet);
float wbtBurnt = clamp(wbBurnt(vWbtWorld.xz), 0.0, 1.0) * step(uWaterLevel - 0.05, vWbtWorld.y);
float wbtBurning = clamp(wbBurning(vWbtWorld.xz), 0.0, 1.0) * step(uWaterLevel, vWbtWorld.y);
{
  float an = wbNoise2(vWbtWorld.xz * 1.7);
  vec3 ash = mix(vec3(0.018, 0.016, 0.015), vec3(0.075, 0.066, 0.06), an);
  wbtAlb = mix(wbtAlb, ash, wbtBurnt * mix(0.94, 0.55, wbtRock));
}
diffuseColor.rgb = wbtAlb;
`;
const TERRAIN_NORMAL_FRAGMENT = `
{
  float wbtFade = 1.0 - smoothstep(30.0, 110.0, length(vWbtWorld - cameraPosition));
  vec3 wbtNB = wbtPerturb(vWbtWorld, wbtN, wbtBumpH * wbtFade);
  vec3 wbtNV = normalize((viewMatrix * vec4(wbtNB, 0.0)).xyz);
  normal = normalize(mix(normal, wbtNV, clamp(wbtBumpW, 0.0, 1.0)));
}
`;
const TERRAIN_ROUGHNESS_FRAGMENT = `
roughnessFactor = mix(roughnessFactor, 0.42, wbtWet);
`;
const TERRAIN_EMISSIVE_FRAGMENT = `
if (wbtBurning > 0.001) {
  vec2 ep = vWbtWorld.xz;
  float e1 = wbNoise2(ep * 2.2 + vec2(0.0, uTime * 0.7));
  float e2 = wbNoise2(ep * 5.0 - vec2(uTime * 0.9, 0.0));
  float cracks = smoothstep(0.5, 0.85, e1 * 0.65 + e2 * 0.35);
  float flicker = 0.75 + 0.25 * sin(uTime * 9.0 + e2 * 12.0);
  totalEmissiveRadiance += vec3(1.0, 0.34, 0.07) * wbtBurning * (0.25 + cracks * 2.6) * flicker;
}
`;
const TERRAIN_LIGHTS_FRAGMENT = `
// Lavender-tinted shadows on rock, warm bounce on sand
reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(1.06, 0.95, 1.22), wbtRock * 0.85);
`;
export function createTerrainMaterial(ctx) {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
  });
  material.name = 'terrain';
  if (ctx.settings.quality === 'low')
    material.defines = {
      WBT_LOW: '',
    };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ctx.globals);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${TERRAIN_PARS_VERTEX}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${TERRAIN_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TERRAIN_PARS_FRAGMENT}`)
      .replace('#include <map_fragment>', `${TERRAIN_COLOR_FRAGMENT}\n#include <map_fragment>`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${TERRAIN_ROUGHNESS_FRAGMENT}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${TERRAIN_NORMAL_FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${TERRAIN_EMISSIVE_FRAGMENT}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${TERRAIN_LIGHTS_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => 'wb-terrain-v2' + (ctx.settings.quality === 'low' ? '-low' : '');
  return material;
}
