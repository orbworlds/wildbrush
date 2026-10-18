/**
 * Cloud, mist, smoke and steam puffs around the sky isles, drawn as one billboard mesh whose shader drifts, swells and fades them, and thins them out near the camera.
 */
import { BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, Sphere, UniformsLib, Vector3 } from 'three';
import { makeRng } from '../core/math.js';
const CLOUD_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec3 aCenter;
attribute vec4 aPuff; // size, seed, kind (0 cloud, 1 mist), opacity
varying vec2 vQ;
varying vec4 vPuff;
varying vec3 vWc;
varying float vNear;
varying float vLife;
void main() {
  vec3 c = aCenter;
  vLife = aPuff.z > 1.5 ? fract(uTime * (aPuff.z > 2.5 ? 0.16 : 0.055) + aPuff.y) : 0.5;
  float seed = aPuff.y;
  float t = uTime;
  vec3 drift;
  float size = aPuff.x;
  if (aPuff.z < 0.5) {
    drift = vec3(sin(t * 0.05 + seed * 6.0) * 3.0, sin(t * 0.11 + seed * 4.0) * 0.8, cos(t * 0.04 + seed * 5.0) * 3.0);
    size *= 1.0 + 0.06 * sin(t * 0.2 + seed * 9.0);
  } else if (aPuff.z > 1.5) {
    // smoke (2) / steam (3): a column that rises, swells and leans with the wind
    float rate = aPuff.z > 2.5 ? 0.16 : 0.055;
    float ph = fract(t * rate + seed);
    float rise = aPuff.z > 2.5 ? 7.0 : 30.0;
    vec2 wd = length(uWindDir) > 1e-4 ? normalize(uWindDir) : vec2(1.0, 0.0);
    drift = vec3(wd.x * ph * ph * rise * 0.45 + sin(t * 0.3 + seed * 5.0) * 0.8, ph * rise, wd.y * ph * ph * rise * 0.45 + cos(t * 0.27 + seed * 3.0) * 0.8);
    size *= 0.45 + 1.1 * ph;
  } else {
    // mist churns and rises gently
    float ph = fract(t * 0.08 + seed);
    drift = vec3(sin(t * 0.7 + seed * 5.0) * 0.8, ph * size * 0.35, cos(t * 0.6 + seed * 3.0) * 0.8);
    size *= 0.8 + 0.5 * ph;
  }
  c += drift;
  vWc = c;
  // thin out puffs the camera flies into (no white-outs), fade them in with distance
  float camD = distance(c, uCameraPos);
  vNear = smoothstep(size * 0.35, size * 1.1, camD);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  mv.xy += position.xy * size;
  vQ = position.xy;
  vPuff = aPuff;
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}
`;
const CLOUD_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec2 vQ;
varying vec4 vPuff;
varying vec3 vWc;
varying float vNear;
varying float vLife;
void main() {
  float seed = vPuff.y;
  vec2 q = vQ;
  float t = uTime * (vPuff.z > 0.5 ? 0.35 : 0.04);
  float n = wbNoise2(q * 2.2 + seed * 17.0 + vec2(t, -t * 0.7)) * 0.6 + wbNoise2(q * 5.1 - seed * 9.0 + vec2(-t, t)) * 0.4;
  float r = length(q * vec2(1.0, 1.35));
  float body = 1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.7);
  if (body <= 0.003) discard;
  // lit from above/the sun side, lavender in the belly
  float up = clamp(q.y * 0.5 + 0.5 + (n - 0.5) * 0.4, 0.0, 1.0);
  vec3 lit = mix(vec3(0.72, 0.72, 0.86), vec3(1.0, 0.98, 0.95), up);
  vec3 col = lit * (uSkyColor * 0.55 + uSunColor * 0.5);
  float a = body * vPuff.w * vNear;
  if (vPuff.z > 2.5) {
    // steam: bright, thins out as it rises
    col = mix(vec3(0.86, 0.9, 0.96), vec3(1.0), up) * (uSkyColor * 0.5 + uSunColor * 0.55) + 0.08;
    a *= smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.45, 1.0, vLife));
  } else if (vPuff.z > 1.5) {
    // volcanic smoke: sooty, lit ember-orange from below near the vent
    vec3 soot = mix(vec3(0.16, 0.14, 0.15), vec3(0.46, 0.43, 0.44), up);
    col = soot * (uSkyColor * 0.6 + uSunColor * 0.55);
    col += vec3(1.0, 0.38, 0.1) * (1.0 - smoothstep(0.0, 0.3, vLife)) * (1.0 - up) * 0.9;
    a *= smoothstep(0.0, 0.08, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
  }
  if (a <= 0.002) discard;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}
`;
export function createClouds(ctx, isles, mistPoints, quality, extraPuffs = [], seed = 'aerie-clouds') {
  const rng = makeRng(seed);
  const rand = (lo, hi) => lo + (hi - lo) * rng();
  const puffs = [];
  const density = quality === 'low' ? 0.5 : quality === 'medium' ? 0.8 : 1;
  for (const isle of isles) {
    const def = isle.def;
    const count = Math.round((4 + def.r * 0.45) * density);
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = isle.maxR * rand(0.55, 1.25);
      const y = def.y - def.depth * rand(0.4, 0.85);
      puffs.push({
        c: new Vector3(isle.cx + Math.cos(angle) * dist, y, isle.cz + Math.sin(angle) * dist),
        size: def.r * rand(0.35, 0.7) + 3,
        kind: 0,
        op: rand(0.28, 0.5),
      });
    }
  }
  for (const mist of mistPoints)
    for (let i = 0; i < 5 * density + 1; i++)
      puffs.push({
        c: mist.pos.clone().add(new Vector3(rand(-1.5, 1.5), rand(-1, 2), rand(-1.5, 1.5))),
        size: mist.size * rand(0.6, 1.1),
        kind: 1,
        op: rand(0.4, 0.65),
      });
  for (const puff of extraPuffs) puffs.push(puff);
  const len = puffs.length;
  const positions = new Float32Array(len * 4 * 3);
  const centers = new Float32Array(len * 4 * 3);
  const puffData = new Float32Array(len * 4 * 4);
  const indices = [];
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  puffs.forEach((puff, i) => {
    const puffSeed = rng();
    for (let j = 0; j < 4; j++) {
      const vi = i * 4 + j;
      positions.set([corners[j][0], corners[j][1], 0], vi * 3);
      centers.set([puff.c.x, puff.c.y, puff.c.z], vi * 3);
      puffData.set([puff.size, puffSeed, puff.kind, puff.op], vi * 4);
    }
    const base = i * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aCenter', new BufferAttribute(centers, 3));
  geometry.setAttribute('aPuff', new BufferAttribute(puffData, 4));
  geometry.setIndex(indices);
  geometry.boundingSphere = new Sphere(new Vector3(), 100000);
  const uniforms = {};
  const fog = UniformsLib.fog;
  for (const key of Object.keys(fog)) uniforms[key] = fog[key];
  Object.assign(uniforms, ctx.globals);
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = 'sky-clouds';
  const mesh = new Mesh(geometry, material);
  mesh.name = 'sky-clouds';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.matrixAutoUpdate = false;
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
