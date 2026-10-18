/**
 * Temple stone material: the surface kinds (ashlar, smooth, metal, basalt, ice, wood, glass, rough) and the shader chunks that give a standard material sixteen temple point lights, glyph glow channels, frost and soot themes and the glow once the temple is lit.
 */
import { Color, MeshStandardMaterial, Vector3, Vector4 } from 'three';
export const KIND = {
  ashlar: 0,
  smooth: 1,
  metal: 2,
  basalt: 3,
  ice: 4,
  wood: 5,
  glass: 6,
  rough: 7,
};
const STONE_COMMON_VERTEX = `
attribute vec4 aMat;
varying vec4 vTMat;
varying vec3 vTPos;
varying vec3 vTPat;
varying vec3 vTNrm;
`;
const STONE_WORLDPOS_VERTEX = `
{
  vec4 tW = modelMatrix * vec4(transformed, 1.0);
  vTPos = tW.xyz;
  vTNrm = normalize(mat3(modelMatrix) * objectNormal);
  vTPat = aMat.w > 0.5 ? transformed : tW.xyz;
  vTMat = aMat;
}
`;
const STONE_COMMON_FRAGMENT = `
#include <wb_common>
uniform vec4 uTLP[16];
uniform vec3 uTLC[16];
uniform float uTChan[16];
uniform vec3 uTTheme;
uniform vec3 uTLitCol;
uniform float uTFloorY;
varying vec4 vTMat;
varying vec3 vTPos;
varying vec3 vTPat;
varying vec3 vTNrm;

float tBlocks(vec2 uv, vec2 size, out float rnd, out float edge) {
  vec2 g = uv / size;
  float row = floor(g.y);
  g.x += fract(row * 0.5) + wbHash12(vec2(row, 3.7)) * 0.3;
  vec2 id = floor(g);
  vec2 f = fract(g);
  rnd = wbHash12(id * 1.37 + row * 7.13);
  vec2 e = min(f, 1.0 - f) * size;
  edge = min(e.x, e.y);
  return 1.0 - smoothstep(0.012, 0.045, edge);
}
vec3 tPerturb(vec3 surfPos, vec3 surfNorm, float h) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;
const STONE_COLOR_FRAGMENT = `
float tRough = 0.86;
float tMetal = 0.0;
float tHeight = 0.5;
float tIce = 0.0;
float tGlass = 0.0;
{
  float kind = floor(vTMat.x + 0.5);
  vec3 p = vTPat;
  vec3 n = normalize(vTNrm);
  vec3 col = diffuseColor.rgb;
  float big = wbNoise3(p * 0.33);
  float mid = wbNoise3(p * 1.35 + 3.1);
  float fine = wbNoise3(p * 5.7 - 1.7);
  if (kind < 0.5) {
    float rnd, edge, grout;
    if (abs(n.y) > 0.6) {
      grout = tBlocks(p.xz + vec2(0.37, 0.11), vec2(1.7, 1.3), rnd, edge);
    } else {
      vec2 uv = vec2(abs(n.x) > abs(n.z) ? p.z : p.x, p.y + 0.05);
      grout = tBlocks(uv, vec2(1.45, 0.66), rnd, edge);
    }
    col *= 0.8 + 0.3 * rnd;
    col = mix(col, col * vec3(1.08, 0.98, 0.9), smoothstep(0.55, 0.95, fract(rnd * 7.13)) * 0.8);
    col = mix(col, col * vec3(0.92, 0.98, 1.08), smoothstep(0.6, 0.95, fract(rnd * 3.71)) * 0.7);
    col *= mix(0.7, 1.0, smoothstep(0.0, 0.16, edge));
    col = mix(col, col * 0.42, grout);
    tHeight = (1.0 - grout) * (0.55 + 0.45 * smoothstep(0.0, 0.12, edge)) + fine * 0.08;
    tRough = 0.9;
  } else if (kind < 1.5) {
    tHeight = mid * 0.6 + fine * 0.4;
    tRough = 0.78;
  } else if (kind < 2.5) {
    col *= 0.78 + 0.4 * fine;
    col = mix(col, col * vec3(0.55, 0.75, 0.6), smoothstep(0.62, 0.8, mid) * 0.5);
    tMetal = 0.75;
    tRough = 0.32 + 0.25 * mid;
    tHeight = fine;
  } else if (kind < 3.5) {
    col *= 0.7 + 0.45 * mid;
    col *= 0.9 + 0.2 * smoothstep(0.55, 0.9, wbNoise3(vec3(p.x * 3.0, p.y * 0.4, p.z * 3.0)));
    tRough = 0.92;
    tHeight = mid * 0.5 + fine * 0.5;
  } else if (kind < 4.5) {
    tIce = 1.0;
    float cr = smoothstep(0.47, 0.5, wbNoise3(p * 2.2)) - smoothstep(0.5, 0.53, wbNoise3(p * 2.2));
    col = mix(col, vec3(0.9, 0.97, 1.0), fine * 0.35 + cr * 0.4);
    tRough = 0.14 + 0.2 * mid;
    tHeight = fine * 0.3;
  } else if (kind < 5.5) {
    float grain = wbNoise3(vec3(p.x * 18.0, p.y * 1.6, p.z * 18.0));
    col *= 0.75 + 0.35 * grain;
    tRough = 0.7;
    tHeight = grain;
  } else if (kind < 6.5) {
    tGlass = 1.0;
    col *= 0.28 + 0.1 * fine;
    tRough = 0.1;
    tHeight = 0.5;
  } else {
    col *= 0.72 + 0.4 * mid + 0.12 * fine;
    tRough = 0.95;
    tHeight = mid * 0.5 + fine * 0.5;
  }
  if (kind < 3.5 || kind > 6.5) col *= 0.88 + 0.16 * big + 0.07 * mid;
  // contact shadow where walls meet the floor, soft lift toward the vault
  if (uTFloorY > -9000.0 && abs(n.y) < 0.6) {
    float hy = vTPos.y - uTFloorY;
    col *= mix(0.62, 1.0, smoothstep(0.0, 1.4, hy)) * (0.96 + 0.06 * smoothstep(2.0, 9.0, hy));
  }
  // Kiln: soot creeping over walls, darker up high where the smoke gathered
  if (uTTheme.y > 0.0 && (kind < 3.5 || kind > 6.5)) {
    float s = smoothstep(0.42, 0.8, wbNoise3(p * vec3(0.45, 0.22, 0.45) + 9.0) + fine * 0.15);
    s *= (1.0 - abs(n.y) * 0.6);
    col = mix(col, col * vec3(0.32, 0.27, 0.25), s * 0.65 * uTTheme.y);
  }
  // Cistern: rime on everything facing up, frost blooming from the joints
  if (uTTheme.x > 0.0 && (kind < 3.5 || kind > 6.5)) {
    float up = smoothstep(0.35, 0.95, n.y);
    float fr = up * smoothstep(0.4, 0.75, big * 0.75 + mid * 0.35);
    fr = max(fr, (1.0 - abs(n.y)) * smoothstep(0.66, 0.9, mid * 0.8 + big * 0.3) * 0.6);
    fr *= uTTheme.x;
    col = mix(col, vec3(0.84, 0.92, 1.0), fr * 0.8);
    tRough = mix(tRough, 0.45, fr);
    tHeight = mix(tHeight, 0.5, fr * 0.6);
  }
  diffuseColor.rgb = col;
}
`;
const STONE_ROUGHNESS_FRAGMENT = `
roughnessFactor = tRough;
`;
const STONE_METALNESS_FRAGMENT = `
metalnessFactor = tMetal;
`;
const STONE_NORMAL_FRAGMENT = `
normal = tPerturb(-vViewPosition, normal, tHeight * 0.05);
`;
const STONE_EMISSIVE_FRAGMENT = `
{
  int tch = int(vTMat.y + 0.5);
  float tg = 0.0;
  for (int i = 0; i < 16; i++) { if (i == tch) tg = uTChan[i]; }
  float shimmer = 0.88 + 0.12 * sin(uTime * 2.1 + vTPos.x * 0.6 + vTPos.z * 0.45 + vTPos.y * 0.3);
  totalEmissiveRadiance += vColor.rgb * vTMat.z * tg * shimmer;
  vec3 tV = normalize(vViewPosition);
  float tFr = pow(1.0 - clamp(abs(dot(normal, tV)), 0.0, 1.0), 3.0);
  if (tIce > 0.5) totalEmissiveRadiance += vec3(0.35, 0.62, 0.9) * (tFr * 0.55 + 0.05);
  if (tGlass > 0.5) totalEmissiveRadiance += vColor.rgb * tFr * 0.35;
  // the temple wakes: a soft coloured breath over the whole interior
  totalEmissiveRadiance += uTLitCol * uTTheme.z * (0.02 + tFr * 0.08) * (0.5 + 0.5 * wbNoise3(vTPos * 0.2 + uTime * 0.15));
}
`;
const STONE_LIGHTS_FRAGMENT = `
{
  vec3 tWN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 tAcc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    vec4 L = uTLP[i];
    if (L.w <= 0.0) continue;
    vec3 d = L.xyz - vTPos;
    float dist = length(d);
    if (dist >= L.w) continue;
    vec3 l = d / max(dist, 1e-3);
    float ndl = clamp((dot(tWN, l) + 0.3) / 1.3, 0.0, 1.0);
    float x = dist / L.w;
    float att = 1.0 - x * x;
    att = att * att / (1.0 + dist * dist * 0.06);
    tAcc += uTLC[i] * ndl * att;
  }
  reflectedLight.directDiffuse += tAcc * BRDF_Lambert(material.diffuseColor);
  reflectedLight.directSpecular += tAcc * 0.04 * (1.0 - roughnessFactor) + tAcc * metalnessFactor * 0.05;
}
`;
export function makeStoneMaterial(ctx, opts) {
  const lightPos = [];
  const lightCol = [];
  for (let i = 0; i < 16; i++) {
    lightPos.push(new Vector4(0, -9999, 0, 0));
    lightCol.push(new Color(0, 0, 0));
  }
  const chan = Array(16).fill(0);
  chan[0] = 1;
  const theme = new Vector3(opts.frost, opts.soot, 0);
  const uniforms = {
    uTLP: {
      value: lightPos,
    },
    uTLC: {
      value: lightCol,
    },
    uTChan: {
      value: chan,
    },
    uTTheme: {
      value: theme,
    },
    uTLitCol: {
      value: new Color(opts.litColor),
    },
    uTFloorY: {
      value: opts.floorY ?? -9999,
    },
  };
  const globals = ctx.globals;
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
  });
  material.name = `temple-stone-${opts.name}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${STONE_COMMON_VERTEX}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${STONE_WORLDPOS_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${STONE_COMMON_FRAGMENT}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${STONE_COLOR_FRAGMENT}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${STONE_ROUGHNESS_FRAGMENT}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${STONE_METALNESS_FRAGMENT}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${STONE_NORMAL_FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${STONE_EMISSIVE_FRAGMENT}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${STONE_LIGHTS_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => 'wb-temple-stone-v4';
  try {
    ctx.paint.patchMaterial(material, {
      paint: true,
      vitality: opts.vitality,
    });
  } catch (err) {
    console.warn('[temples] patchMaterial failed', err);
  }
  return {
    material,
    lightPos,
    lightCol,
    chan,
    theme,
  };
}
