/**
 * Realm materials: the dyn feature material (per-part roughness, metalness and glow with vitality), lava with freezable sections and a curtain, the ice shell that cracks and shatters, and swaying painterly leaves.
 */
import { Color, DoubleSide, MeshStandardMaterial, ShaderMaterial, UniformsLib } from 'three';
import { SKY_VITALITY_GLSL } from './vitality.js';
const DYN_PARS_VERTEX = `
#include <wb_common>
attribute vec2 aFd;
varying vec2 vFd;
varying vec3 vDW;
varying vec3 vDN;
`;
const DYN_WORLD_VERTEX = `
vDW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vDN = normalize(mat3(modelMatrix) * objectNormal);
vFd = aFd;
`;
const DYN_PARS_FRAGMENT = `
${SKY_VITALITY_GLSL}
varying vec2 vFd;
varying vec3 vDW;
varying vec3 vDN;
float fdRough = -1.0;
float fdMetal = 0.0;
vec3 fdEmit = vec3(0.0);
`;
export function createDynMaterial(ctx, vit, opts) {
  const globals = ctx.globals;
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: opts.roughness ?? 0.75,
    metalness: 0,
    side: opts.side ?? 0,
  });
  material.name = opts.key;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, vit.uniforms, opts.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DYN_PARS_VERTEX}\n${opts.vertPars ?? ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${opts.vertPos ?? ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${DYN_WORLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DYN_PARS_FRAGMENT}\n${opts.fragPars ?? ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${opts.fragColor}`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
if (fdRough >= 0.0) roughnessFactor = fdRough;`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor = max(metalnessFactor, fdMetal);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += fdEmit + skyVitGlow(vDW) * 0.4;`,
      );
  };
  material.customProgramCacheKey = () => `wb-sky-dyn-${opts.key}`;
  if (opts.paint !== false)
    try {
      ctx.paint.patchMaterial(material, {
        paint: true,
        vitality: false,
      });
    } catch (err) {
      console.warn('[sky] dyn patchMaterial failed', err);
    }
  return material;
}
function baseUniforms(ctx) {
  const uniforms = {};
  const fog = UniformsLib.fog;
  for (const key of Object.keys(fog)) uniforms[key] = fog[key];
  Object.assign(uniforms, ctx.globals);
  return uniforms;
}
const LAVA_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aLava; // x along (m), y across (0..1), z section id, w kind (0 flat, 1 fall, 2 curtain)
uniform float uFrz[48];
varying vec4 vLava;
varying vec3 vW;
varying vec3 vN;
varying float vFrz;
void main() {
  vLava = aLava;
  int sid = int(aLava.z + 0.5);
  float f = 0.0;
  for (int i = 0; i < 48; i++) { if (i == sid) f = uFrz[i]; }
  vFrz = f;
  vec3 p = position;
  // falling sheets flutter; a frozen curtain stands still
  if (aLava.w > 0.5) {
    float w = sin(uTime * 2.0 + aLava.x * 0.6 + aLava.y * 5.0) * 0.08 * (1.0 - f);
    p += normal * w;
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const LAVA_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
uniform float uCurtainOpen;
varying vec4 vLava;
varying vec3 vW;
varying vec3 vN;
varying float vFrz;
vec2 lvVor(vec2 x) {
  vec2 n = floor(x); vec2 f = fract(x);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = wbHash22(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2));
}
void main() {
  float kind = vLava.w;
  float along = vLava.x;
  float across = vLava.y;
  float t = uTime;
  float speed = kind > 0.5 ? 2.2 : 0.3;
  vec2 q = vec2(across * (kind > 0.5 ? 3.0 : 2.2), along * (kind > 0.5 ? 3.0 : 0.45) - t * speed);
  // molten: cooling plates drifting on a glowing flow
  vec2 vd = lvVor(q + vec2(wbNoise2(q * 0.7 + t * 0.05), wbNoise2(q * 0.7 + 3.0)) * 0.6);
  float seam = 1.0 - smoothstep(0.0, 0.16, vd.y - vd.x);
  float n = wbNoise2(q * 2.3 + t * 0.2);
  vec3 hot = mix(vec3(1.0, 0.24, 0.03), vec3(1.0, 0.62, 0.12), n);
  vec3 crust = mix(vec3(0.09, 0.03, 0.02), vec3(0.22, 0.06, 0.03), n);
  float plate = smoothstep(0.22, 0.55, wbNoise2(q * 0.9 + 11.0)) * (1.0 - seam);
  if (kind > 0.5) plate *= 0.5;
  vec3 molten = mix(hot * 1.7, crust, plate * 0.9);
  molten += mix(hot, vec3(1.0, 0.85, 0.45), 0.4) * seam * 1.5;
  // edges of rivers run darker, cooler
  float edge = kind < 0.5 ? smoothstep(0.0, 0.18, min(across, 1.0 - across)) : 1.0;
  molten = mix(crust * 0.7, molten, 0.35 + 0.65 * edge);
  // frozen: obsidian crust with faint glowing cracks that brighten before it re-melts
  float warn = smoothstep(0.55, 0.2, vFrz) * step(0.02, vFrz);
  float cr = 1.0 - smoothstep(0.0, 0.05 + warn * 0.05, vd.y - vd.x);
  vec3 N = normalize(vN);
  vec3 V = normalize(uCameraPos - vW);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 obs = mix(vec3(0.07, 0.07, 0.09), vec3(0.2, 0.2, 0.24), wbNoise2(vW.xz * 1.7)) * (uSkyColor * 0.8 + uSunColor * (0.3 + 0.6 * ndl));
  obs += pow(1.0 - abs(dot(N, V)), 4.0) * 0.12;
  obs += vec3(1.0, 0.3, 0.06) * cr * (0.35 + warn * 2.2 * (0.6 + 0.4 * sin(t * 9.0)));
  vec3 col = mix(molten, obs, smoothstep(0.0, 0.25, vFrz));
  float a = 1.0;
  if (kind > 1.5) {
    // the vault's curtain: once frozen it crumbles away (bottom first); it pours back from the top
    float cn = wbNoise2(vec2(across * 9.0, along * 7.0));
    if ((1.0 - along) * 0.7 + cn * 0.3 < uCurtainOpen * 1.05) discard;
  }
  if (kind > 0.5 && kind < 1.5) {
    // falls break up toward the bottom
    float fall = clamp(along, 0.0, 1.0);
    float br = smoothstep(0.2, 0.6, wbNoise2(vec2(across * 6.0, along * 4.0 - t * 1.5)) + (1.0 - fall) * 0.5);
    a = mix(1.0, br, smoothstep(0.55, 0.95, fall)) * (1.0 - smoothstep(0.85, 1.0, fall));
    float eg = smoothstep(0.0, 0.14, across) * smoothstep(1.0, 0.86, across);
    a *= eg;
    if (a < 0.03) discard;
  }
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}
`;
export function createLavaMaterial(ctx, isFall) {
  const frz = Array(48).fill(0);
  const uniforms = {
    ...baseUniforms(ctx),
    uFrz: {
      value: frz,
    },
    uCurtainOpen: {
      value: 0,
    },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: LAVA_VERTEX,
    fragmentShader: LAVA_FRAGMENT,
    fog: true,
    transparent: isFall,
    depthWrite: !isFall,
    side: DoubleSide,
  });
  material.name = isFall ? 'sky-lava-fall' : 'sky-lava';
  return {
    mat: material,
    frz,
    uniforms,
  };
}
const ICE_SHELL_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aFacet;
uniform float uShatter;
uniform vec3 uShellC;
varying vec3 vW;
varying vec3 vN;
varying float vSeed;
void main() {
  vec3 p = position;
  float s = uShatter;
  vSeed = aFacet.w;
  if (s > 0.0) {
    vec3 fc = aFacet.xyz;
    vec3 dir = normalize(fc - uShellC + vec3(0.0, 0.6, 0.0));
    float sp = 4.0 + aFacet.w * 7.0;
    vec3 off = dir * sp * s + vec3(0.0, 3.0 * s - 14.0 * s * s, 0.0);
    // shards shrink and tumble as they fly
    float a = s * (4.0 + aFacet.w * 10.0);
    vec3 rel = (p - fc) * (1.0 - smoothstep(0.3, 1.0, s));
    vec3 ax = normalize(vec3(aFacet.w - 0.5, 0.7, 0.3 - aFacet.w));
    rel = rel * cos(a) + cross(ax, rel) * sin(a) + ax * dot(ax, rel) * (1.0 - cos(a));
    p = fc + rel + off;
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const ICE_SHELL_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
uniform float uShatter;
uniform float uCrack;
uniform vec3 uCrackCol;
varying vec3 vW;
varying vec3 vN;
varying float vSeed;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uCameraPos - vW);
  if (dot(N, V) < 0.0) N = -N;
  float fr = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 body = mix(vec3(0.55, 0.78, 0.95), vec3(0.85, 0.95, 1.0), vSeed);
  vec3 col = body * (uSkyColor * 0.55 + uSunColor * (0.25 + 0.6 * ndl));
  // frosted streaks and trapped bubbles
  float st = wbNoise3(vW * vec3(1.2, 0.35, 1.2));
  col += vec3(0.9, 0.97, 1.0) * smoothstep(0.62, 0.8, st) * 0.35;
  // glints
  vec3 H = normalize(uSunDir + V);
  col += uSunColor * pow(max(dot(N, H), 0.0), 60.0) * 1.4;
  // cracks of light, one more for every seal that melts
  float cn = wbNoise3(vW * 0.9 + 3.0);
  float cw = 0.012 + uCrack * 0.012;
  float crack = (1.0 - smoothstep(0.0, cw, abs(cn - 0.5))) * smoothstep(0.0, 0.25, uCrack);
  col += uCrackCol * crack * (1.2 + uCrack * 1.5);
  float a = 0.28 + fr * 0.55 + crack * 0.6 + smoothstep(0.62, 0.8, st) * 0.12;
  a *= 1.0 - smoothstep(0.55, 1.0, uShatter);
  gl_FragColor = vec4(col + vec3(0.25, 0.45, 0.6) * fr * 0.6, clamp(a, 0.0, 1.0));
  #include <fog_fragment>
}
`;
export function createIceShellMaterial(ctx, center) {
  const material = new ShaderMaterial({
    uniforms: {
      ...baseUniforms(ctx),
      uShatter: {
        value: 0,
      },
      uCrack: {
        value: 0,
      },
      uCrackCol: {
        value: new Color(0.7, 0.9, 1),
      },
      uShellC: {
        value: center.clone(),
      },
    },
    vertexShader: ICE_SHELL_VERTEX,
    fragmentShader: ICE_SHELL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: DoubleSide,
  });
  material.name = 'sky-ice-shell';
  return material;
}
const LEAF_PARS_VERTEX = `
#include <wb_common>
attribute vec4 aLeaf; // xyz clump centre, w sway weight
varying vec3 vLW;
varying vec3 vLN;
varying float vLS;
`;
const LEAF_SWAY_VERTEX = `
{
  vec2 wd = length(uWindDir) > 1e-4 ? normalize(uWindDir) : vec2(1.0, 0.0);
  float ph = dot(aLeaf.xyz, vec3(0.31, 0.17, 0.23));
  float sw = aLeaf.w * (0.12 + uWindStrength * 0.3);
  transformed.xz += wd * sin(uTime * 0.9 + ph) * sw + vec2(sin(uTime * 2.3 + ph * 3.0 + position.y), cos(uTime * 2.1 + ph * 2.0)) * sw * 0.25;
  vLS = aLeaf.w;
}
`;
const LEAF_WORLD_VERTEX = `
vLW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vLN = normalize(mat3(modelMatrix) * objectNormal);
`;
const LEAF_PARS_FRAGMENT = `
${SKY_VITALITY_GLSL}
varying vec3 vLW;
varying vec3 vLN;
varying float vLS;
vec3 lfEmit = vec3(0.0);
`;
const LEAF_COLOR_FRAGMENT = `
{
  vec3 p = vLW;
  // dissolve leaves the camera pushes into (no walls of foliage in your face)
  float camD = distance(p, cameraPosition);
  if (camD < 4.5 && wbHash12(gl_FragCoord.xy) > smoothstep(1.2, 4.5, camD)) discard;
  vec3 N = normalize(vLN);
  // painterly leaf dabs: clusters of cells, lighter on top, deep in the gaps
  float c1 = wbNoise3(p * 1.6);
  float c2 = wbNoise3(p * 4.2 + 7.0);
  float dab = smoothstep(0.35, 0.75, c1 * 0.6 + c2 * 0.4);
  vec3 base = diffuseColor.rgb;
  vec3 col = mix(base * 0.55, base * 1.2, dab);
  col = mix(col, col * vec3(1.15, 1.12, 0.75), smoothstep(0.3, 0.9, N.y) * 0.35);
  // blossoms scattered through the crown
  float bl = smoothstep(0.86, 0.9, wbNoise3(p * 2.4 + 31.0));
  col = mix(col, vec3(1.0, 0.78, 0.86), bl * 0.8);
  diffuseColor.rgb = skyApplyVitRaw(col, p);
  // light through the leaves at the rim
  vec3 V = normalize(uCameraPos - p);
  float fr = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0);
  lfEmit = diffuseColor.rgb * uSunColor * fr * 0.25 + skyVitGlow(p) * 0.4;
}
`;
export function createLeafMaterial(ctx, vit) {
  const globals = ctx.globals;
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  });
  material.name = 'sky-leaves';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, vit.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${LEAF_PARS_VERTEX}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LEAF_SWAY_VERTEX}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${LEAF_WORLD_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${LEAF_PARS_FRAGMENT}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${LEAF_COLOR_FRAGMENT}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += lfEmit;`,
      );
  };
  material.customProgramCacheKey = () => 'wb-sky-leaves-v1';
  try {
    ctx.paint.patchMaterial(material, {
      paint: true,
      vitality: false,
    });
  } catch {}
  return material;
}
