/**
 * Elite arenas: for each Hoarder a ring of standing stones, masked totems, banners, crystals and the hoard pile with its beacon, painted ground and colliders. Spawns the elite and its escorts, warps the hero there for testing and celebrates when it falls.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  UniformsLib,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLLISION_GROUPS, PALETTE } from '../core/config.js';
import { makeRng } from '../core/math.js';
import { COLUMN_MODE } from './elite-columns.js';
function arenaRng(id) {
  return makeRng(`elite-arena-${id}`);
}
export const ELITE_ARENAS = [
  {
    id: 'bounder',
    element: 'yellow',
    kind: 'smudgeling',
    name: 'Bounder',
    x: 28,
    z: 35,
    from: [8, 48],
    escorts: ['smudgeling', 'smudgeling', 'smudgeling'],
    clear: 8,
  },
  {
    id: 'rimecaller',
    element: 'blue',
    kind: 'spitter',
    name: 'Rimecaller',
    x: 70,
    z: 120,
    from: [44, 112],
    escorts: ['smudgeling', 'smudgeling'],
    clear: 11,
  },
  {
    id: 'cinderjaw',
    element: 'red',
    kind: 'brute',
    name: 'Cinderjaw',
    x: -108,
    z: -72,
    from: [-92, -40],
    escorts: ['smudgeling', 'spitter', 'smudgeling'],
    clear: 12.5,
  },
];
const ARENA_GROUND = {
  red: 0,
  blue: 1,
  yellow: 2,
  green: 3,
};
const ROCK_LIGHT = new Color(0x8f877c);
const ROCK_DARK = new Color(0x6c6670);
const HOARD_ROCK = new Color(0x2b2a33);
const POLE_WOOD = new Color(0x4a3f37);
const TOTEM_PAPER = new Color(0xefe9dc);
const CINDER_DARK = new Color(0x221e1d);
const _arenaFxPos = new Vector3();
const _arenaColor = new Color();
function colorize(geometry, paint, glow = 0) {
  let geo = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const key of Object.keys(geo.attributes)) if (key !== 'position') geo.deleteAttribute(key);
  geo.computeVertexNormals();
  geo = geo.clone();
  const position = geo.getAttribute('position');
  const normal = geo.getAttribute('normal');
  const colors = new Float32Array(position.count * 3);
  const glows = new Float32Array(position.count).fill(glow);
  const p = new Vector3();
  const nrm = new Vector3();
  const color = new Color();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    nrm.fromBufferAttribute(normal, i);
    paint(p, nrm, color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.setAttribute('aGlow', new BufferAttribute(glows, 1));
  return geo;
}
function roughen(geometry, rng, amount) {
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  const merged = mergeVertices(geometry, 0.0001);
  const position = merged.getAttribute('position');
  for (let i = 0; i < position.count; i++)
    position.setXYZ(
      i,
      position.getX(i) * (1 + (rng() - 0.5) * amount),
      position.getY(i) * (1 + (rng() - 0.5) * amount * 0.5),
      position.getZ(i) * (1 + (rng() - 0.5) * amount),
    );
  return merged;
}
function hash3(x, y, z) {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return h - Math.floor(h);
}
function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const corner = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), ux), lerp(corner(0, 1, 0), corner(1, 1, 0), ux), uy),
    lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), ux), lerp(corner(0, 1, 1), corner(1, 1, 1), ux), uy),
    uz,
  );
}
function crystal(height, radius) {
  const profile = [
    new Vector2(0.0001, -radius * 0.6),
    new Vector2(radius * 0.8, -radius * 0.1),
    new Vector2(radius, height * 0.55),
    new Vector2(radius * 0.55, height * 0.8),
    new Vector2(0.0001, height),
  ];
  return new LatheGeometry(profile, 5);
}
function arenaPropMaterial(ctx) {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
  });
  const globals = ctx.globals;
  material.onBeforeCompile = (shader) => {
    for (const key of Object.keys(globals)) shader.uniforms[key] = globals[key];
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aGlow;
varying float vGlow;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vGlow = aGlow;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
#include <wb_common>
varying float vGlow;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vGlow * (0.85 + 0.15 * sin(uTime * 2.4 + vGlow * 7.0));`,
      );
  };
  material.customProgramCacheKey = () => 'wb-elite-arena-props-v1';
  try {
    ctx.paint?.patchMaterial?.(material, {
      paint: true,
      vitality: false,
    });
  } catch {}
  return material;
}
function arenaUniforms(ctx) {
  const uniforms = {};
  const fog = UniformsLib.fog;
  for (const key of Object.keys(fog)) uniforms[key] = fog[key];
  Object.assign(uniforms, ctx.globals);
  return uniforms;
}
const ARENA_GROUND_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec2 aLocal;
attribute float aEl;
varying vec2 vL;
varying float vEl;
void main() {
  vec4 mvPosition = viewMatrix * vec4(position, 1.0);
  mvPosition.xyz *= 0.998;
  gl_Position = projectionMatrix * mvPosition;
  vL = aLocal;
  vEl = aEl;
  #include <fog_vertex>
}
`;
const ARENA_GROUND_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec2 vL;
varying float vEl;
float vor(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + wbHash22(n + g) - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(f2) - sqrt(f1);
}
void main() {
  vec2 q = vL;
  float r = length(q);
  float n = wbNoise2(q * 3.0) * 0.6 + wbNoise2(q * 9.0) * 0.4;
  float edge = 1.0 - smoothstep(0.6, 1.0, r + (n - 0.5) * 0.45);
  vec3 col = vec3(0.0);
  vec3 emit = vec3(0.0);
  float a = 0.0;
  if (vEl < 0.5) {
    // scorched earth, split by glowing cinder cracks
    col = mix(vec3(0.05, 0.045, 0.04), vec3(0.2, 0.17, 0.14), n);
    float cr = 1.0 - smoothstep(0.0, 0.06, vor(q * 7.0 + n * 0.8));
    float pulse = 0.6 + 0.4 * sin(uTime * 1.8 + q.x * 6.0 + q.y * 4.0);
    emit = vec3(1.0, 0.33, 0.06) * cr * pulse * (1.0 - smoothstep(0.3, 0.85, r)) * 1.4;
    col = mix(col, vec3(0.35, 0.1, 0.03), cr);
    a = edge * 0.93;
  } else if (vEl < 1.5) {
    // rime: frosted ground with crystalline veins and glints
    col = mix(vec3(0.72, 0.84, 0.92), vec3(0.93, 0.97, 1.0), n);
    float cr = 1.0 - smoothstep(0.0, 0.035, vor(q * 9.0 + n * 0.5));
    col = mix(col, vec3(0.45, 0.72, 0.95), cr * 0.7);
    float gl = step(0.985, wbHash12(floor(q * 90.0))) * (0.5 + 0.5 * sin(uTime * 3.0 + wbHash12(floor(q * 90.0)) * 40.0));
    emit = vec3(0.7, 0.9, 1.0) * gl * 0.9 + vec3(0.2, 0.5, 0.9) * cr * 0.25;
    a = edge * 0.82;
  } else if (vEl < 2.5) {
    // bounce rings: concentric strokes of Spring paint with splats
    float rr = r + (wbNoise2(q * 5.0) - 0.5) * 0.06;
    float ring = smoothstep(0.08, 0.02, abs(fract(rr * 4.5) - 0.5) - 0.28);
    float splat = smoothstep(0.62, 0.7, wbNoise2(q * 6.0 + 3.0));
    float m = max(ring * step(0.12, r), splat);
    col = mix(vec3(0.95, 0.72, 0.1), vec3(1.0, 0.86, 0.35), n);
    emit = vec3(1.0, 0.75, 0.15) * m * 0.2;
    a = m * edge * 0.88;
  } else {
    float v = smoothstep(0.55, 0.6, wbNoise2(q * vec2(14.0, 3.0) + wbNoise2(q * 3.0) * 3.0));
    col = vec3(0.16, 0.42, 0.12);
    a = v * edge * 0.9;
  }
  if (a < 0.01) discard;
  vec3 light = uSunColor * (0.5 + 0.5 * max(uSunDir.y, 0.0)) + uSkyColor * 0.45;
  gl_FragColor = vec4(col * light, a);
  #include <fog_fragment>
  gl_FragColor.rgb = gl_FragColor.rgb * a + emit * a;
}
`;
const BANNER_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec3 aCol;
attribute float aSeed;
attribute vec3 aNrm;
varying vec2 vUv;
varying vec3 vCol;
varying float vSeed;
varying vec3 vN;
void main() {
  vec3 p = position;
  float hang = 1.0 - uv.y;
  float w = uWindStrength * 0.7 + 0.3;
  float wave = sin(uTime * 2.2 + uv.x * 3.0 + aSeed * 7.0 - uv.y * 2.0) * 0.55 + sin(uTime * 3.6 - uv.y * 3.0 + aSeed) * 0.3;
  p += aNrm * wave * 0.22 * hang * w;
  vec4 mvPosition = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  vCol = aCol;
  vSeed = aSeed;
  vN = aNrm;
  #include <fog_vertex>
}
`;
const BANNER_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec3 vCol;
varying float vSeed;
varying vec3 vN;
void main() {
  vec2 uv = vUv;
  float tear = 0.08 + 0.1 * wbNoise2(vec2(uv.x * 9.0, vSeed * 3.0)) + 0.05 * sin(uv.x * 21.0 + vSeed);
  if (uv.y < tear) discard;
  if (wbNoise2(uv * vec2(5.0, 7.0) + vSeed * 5.0) > 0.82 && uv.y < 0.75) discard;
  vec3 col = vCol * (0.8 + 0.3 * wbNoise2(uv * vec2(30.0, 4.0)));
  // darker hem
  col *= 0.75 + 0.25 * smoothstep(0.0, 0.08, min(uv.x, 1.0 - uv.x)) * smoothstep(0.98, 0.9, uv.y);
  // emblem: a white paper mask wearing a crown of crystals
  vec2 q = (uv - vec2(0.5, 0.6)) * vec2(1.0, 1.9);
  float mask = length(q * vec2(1.0, 0.85)) - 0.24;
  float eyes = min(length((q - vec2(0.095, 0.03)) * vec2(1.0, 0.75)) - 0.05, length((q - vec2(-0.095, 0.03)) * vec2(1.0, 0.75)) - 0.05);
  float crown = 1e5;
  for (int i = 0; i < 3; i++) {
    float fi = float(i) - 1.0;
    vec2 c = q - vec2(fi * 0.12, 0.3 + (1.0 - abs(fi)) * 0.05);
    crown = min(crown, max(abs(c.x) * 2.4 + c.y * 0.9 - 0.12, -c.y - 0.02));
  }
  float em = 1.0 - smoothstep(-0.01, 0.01, mask);
  col = mix(col, vec3(0.9, 0.87, 0.8), em * 0.95);
  col = mix(col, vec3(0.05), (1.0 - smoothstep(-0.01, 0.01, eyes)) * em);
  float cm = 1.0 - smoothstep(-0.01, 0.01, crown);
  col = mix(col, vec3(0.08, 0.07, 0.09), cm);
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float ndl = abs(dot(n, uSunDir));
  vec3 light = uSunColor * (0.4 + 0.6 * ndl) + uSkyColor * 0.45;
  gl_FragColor = vec4(col * light + vCol * 0.18, 1.0);
  #include <fog_fragment>
}
`;
export class EliteArenas {
  ctx;
  d;
  group = new Group();
  list = [];
  spawned = false;
  warpFrames = 0;
  warpTo = null;
  propMat;
  groundMat;
  clothMat;
  constructor(ctx, d) {
    this.ctx = ctx;
    this.d = d;
    this.group.name = 'elite-arenas';
    this.propMat = arenaPropMaterial(ctx);
    this.groundMat = new ShaderMaterial({
      uniforms: arenaUniforms(ctx),
      vertexShader: ARENA_GROUND_VERTEX,
      fragmentShader: ARENA_GROUND_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    this.clothMat = new ShaderMaterial({
      uniforms: arenaUniforms(ctx),
      vertexShader: BANNER_VERTEX,
      fragmentShader: BANNER_FRAGMENT,
      side: DoubleSide,
      fog: true,
    });
    for (const def of ELITE_ARENAS)
      try {
        this.list.push(this.build(def));
      } catch (err) {
        console.warn(`[enemies] arena ${def.id} failed`, err);
      }
    const warp = (ctx.params.get('elitewarp') ?? '').toLowerCase();
    if (warp) {
      const element =
        {
          ember: 'red',
          frost: 'blue',
          spring: 'yellow',
          bloom: 'green',
        }[warp] ?? warp;
      this.warpTo =
        this.list.find(
          (arena) => arena.def.element === element || arena.def.id === warp || arena.def.name.toLowerCase() === warp,
        ) ?? null;
      if (this.warpTo) {
        this.warpFrames = 4;
        ctx.events.on('game:start', () => this.doWarp());
      }
    }
  }
  refY = -1000000000;
  ground(x, z) {
    return this.d.fxFloor(x, z, this.refY);
  }
  okAt(def, x, z, margin = 1.2) {
    return !def.sky || this.d.skyGroundOk(x, z, def.y ?? this.ground(def.x, def.z), margin);
  }
  build(def) {
    const ctx = this.ctx;
    const rng = arenaRng(def.id);
    this.refY = def.sky && def.y !== undefined ? def.y + 0.5 : -1000000000;
    const cx = def.x;
    const cz = def.z;
    const cy = this.ground(cx, cz);
    const sky = !!def.sky;
    const approach = Math.atan2(def.from[0] - cx, def.from[1] - cz);
    const color = new Color(PALETTE[def.element].hex);
    const parts = [];
    const solids = [];
    const trees = (() => {
      if (sky) return [];
      try {
        return ctx.vegetation.treesNear(new Vector3(cx, cy, cz), 18);
      } catch {
        return [];
      }
    })();
    const nearTree = (x, z, pad) =>
      trees.some((tree) => Math.hypot(tree.position.x - x, tree.position.z - z) < tree.radius + pad);
    const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const stonePaint = (ox, oz, fx, fz, seed) => (p2, nrm, out) => {
      const grain =
        noise3(p2.x * 1.3 + seed, p2.y * 1.1, p2.z * 1.3) * 0.7 + noise3(p2.x * 4 + seed, p2.y * 4, p2.z * 4) * 0.3;
      out
        .copy(grain > 0.55 ? ROCK_LIGHT : ROCK_DARK)
        .lerp(ROCK_LIGHT, grain)
        .multiplyScalar(0.85 + 0.3 * grain);
      if (nrm.y < -0.2) out.lerp(ROCK_DARK, 0.4);
      const facing = nrm.x * fx + nrm.z * fz;
      const dx = p2.x - ox;
      const dz = p2.z - oz;
      const height = p2.y - this.ground(p2.x, p2.z);
      const mottle = noise3(p2.x * 2.2 + seed * 3, height * 0.5, p2.z * 2.2);
      const radial = noise3(Math.atan2(dx, dz) * 9 + seed, 0, 0);
      const patch = noise3(p2.x * 0.9 + seed * 5, height * 0.7 + seed, p2.z * 0.9);
      const streak = radial > 0.62 && patch > 0.42 && height > 0.25;
      if (facing > 0.15 && (patch * 0.8 + mottle * 0.35 > 0.66 || streak))
        out.copy(color).multiplyScalar(0.75 + 0.35 * mottle);
    };
    const stoneCount = sky ? 0 : 9;
    const ringR = sky ? 7.5 : 11;
    for (let i = 0; i < stoneCount; i++) {
      const ang = approach + Math.PI / stoneCount + (i / stoneCount) * Math.PI * 2 + (rng() - 0.5) * 0.18;
      if (angleDiff(ang, approach) < 0.42) continue;
      const dist = ringR + (rng() - 0.5) * 1.4;
      const sx = cx + Math.sin(ang) * dist;
      const sz = cz + Math.cos(ang) * dist;
      if (nearTree(sx, sz, 1.5)) continue;
      const broken = rng() < 0.4;
      const height = broken ? 1.3 + rng() * 0.9 : 2.4 + rng() * 1.5;
      const width = 0.9 + rng() * 0.5;
      const depth = 0.55 + rng() * 0.25;
      let geometry = new BoxGeometry(width, height, depth, 2, 4, 1);
      geometry = roughen(geometry, rng, 0.22);
      const position = geometry.getAttribute('position');
      for (let j = 0; j < position.count; j++) {
        const along = position.getY(j) / height + 0.5;
        position.setX(j, position.getX(j) * (1 - along * 0.28));
        position.setZ(j, position.getZ(j) * (1 - along * 0.2));
        if (broken && along > 0.9)
          position.setY(j, position.getY(j) + (position.getX(j) / width) * 0.5 * (rng() - 0.3));
      }
      geometry.translate(0, height / 2 - 0.35, 0);
      geometry.rotateX((rng() - 0.5) * 0.18);
      geometry.rotateZ((rng() - 0.5) * 0.18);
      geometry.rotateY(ang + Math.PI);
      const gy = this.ground(sx, sz);
      geometry.translate(sx, gy, sz);
      parts.push(colorize(geometry, stonePaint(cx, cz, -Math.sin(ang), -Math.cos(ang), i * 3.1)));
      solids.push({
        x: sx,
        y: gy + height * 0.5 - 0.2,
        z: sz,
        h: height * 0.5,
        r: Math.max(width, depth) * 0.45,
        kind: 'rock',
      });
      if (broken) {
        let geometry = new BoxGeometry(width * 0.8, 1.1 + rng(), depth * 0.9, 1, 2, 1);
        geometry = roughen(geometry, rng, 0.3);
        geometry.rotateZ(Math.PI / 2 - 0.2);
        geometry.rotateY(ang + (rng() - 0.5) * 1.2);
        const px = sx + Math.cos(ang) * 1.4 * (rng() < 0.5 ? 1 : -1);
        const pz = sz - Math.sin(ang) * 1.4;
        geometry.translate(px, this.ground(px, pz) + depth * 0.3, pz);
        parts.push(colorize(geometry, stonePaint(cx, cz, -Math.sin(ang), -Math.cos(ang), i * 5.7)));
      }
    }
    for (const side of sky ? [] : [-1, 1]) {
      const ang = approach + side * 0.5;
      const tx = cx + Math.sin(ang) * (ringR + 1.2);
      const tz = cz + Math.cos(ang) * (ringR + 1.2);
      let ty = this.ground(tx, tz) - 0.1;
      const facing = Math.atan2(def.from[0] - tx, def.from[1] - tz);
      for (let i = 0; i < 4; i++) {
        const size = 0.55 - i * 0.07;
        let geometry = new DodecahedronGeometry(size, 0);
        geometry = roughen(geometry, rng, 0.25);
        geometry.scale(1, 0.72, 1);
        geometry.rotateY(rng() * 6);
        geometry.translate(tx, ty + size * 0.55, tz);
        ty += size * 1;
        parts.push(colorize(geometry, stonePaint(cx, cz, Math.sin(facing), Math.cos(facing), i + side * 9)));
      }
      const mask = new SphereGeometry(0.34, 18, 12);
      mask.scale(1, 1.1, 0.4);
      mask.rotateY(facing);
      mask.translate(tx, ty + 0.3, tz);
      const fx = Math.sin(facing);
      const fz = Math.cos(facing);
      const rx = Math.cos(facing);
      const rz = -Math.sin(facing);
      parts.push(
        colorize(mask, (p, nrm, out) => {
          const u = (p.x - tx) * rx + (p.z - tz) * rz;
          const v = p.y - (ty + 0.3);
          out.copy(TOTEM_PAPER);
          if (!(nrm.x * fx + nrm.z * fz < 0.2))
            if (Math.min(Math.hypot(u - 0.12, (v - 0.05) * 0.8), Math.hypot(u + 0.12, (v - 0.05) * 0.8)) < 0.06)
              out.set(920851);
            else if (
              (Math.abs(v - 0.2 + Math.abs(u) * 0.4) < 0.035 && Math.abs(u) > 0.05) ||
              (Math.abs(u) > 0.08 && Math.abs(u) < 0.12 && v < -0.02 && v > -0.22)
            )
              out.copy(color);
        }),
      );
      for (let i = 0; i < 3; i++) {
        const shard = crystal(0.55 + rng() * 0.3, 0.09);
        shard.rotateZ((i - 1) * 0.45);
        shard.rotateY(facing);
        shard.translate(tx, ty + 0.62, tz);
        parts.push(colorize(shard, (p, nrm, out) => out.copy(color), 0.9));
      }
      solids.push({
        x: tx,
        y: this.ground(tx, tz) + 1,
        z: tz,
        h: 1.1,
        r: 0.45,
        kind: 'rock',
      });
    }
    const hoardAng = approach + Math.PI + (rng() - 0.5) * 0.4;
    let hoardDist = 5.5;
    for (
      ;
      hoardDist > 1.5 && !this.okAt(def, cx + Math.sin(hoardAng) * hoardDist, cz + Math.cos(hoardAng) * hoardDist, 1.8);
    )
      --hoardDist;
    const hx = cx + Math.sin(hoardAng) * hoardDist;
    const hz = cz + Math.cos(hoardAng) * hoardDist;
    const hy = this.ground(hx, hz);
    for (let i = 0; i < 6; i++) {
      const ang = rng() * Math.PI * 2;
      const dist = i === 0 ? 0 : 0.7 + rng() * 0.6;
      const size = i === 0 ? 1 : 0.45 + rng() * 0.35;
      let geometry = new DodecahedronGeometry(size, 0);
      geometry = roughen(geometry, rng, 0.3);
      geometry.scale(1, 0.7, 1);
      geometry.translate(hx + Math.cos(ang) * dist, hy + size * 0.35, hz + Math.sin(ang) * dist);
      parts.push(
        colorize(geometry, (p, nrm, out) => {
          const grain = noise3(p.x * 3, p.y * 3, p.z * 3);
          out.copy(HOARD_ROCK).multiplyScalar(0.8 + 0.5 * grain);
          if (grain > 0.7) out.lerp(color, 0.5);
        }),
      );
    }
    for (let i = 0; i < 11; i++) {
      const ang = rng() * Math.PI * 2;
      const dist = rng() * 1.3;
      const shard = crystal(0.7 + rng() * 1.3 * (1 - dist / 1.6), 0.1 + rng() * 0.08);
      shard.rotateZ((rng() - 0.5) * 0.9);
      shard.rotateX((rng() - 0.5) * 0.9);
      shard.translate(hx + Math.cos(ang) * dist, hy + 0.3 + rng() * 0.4, hz + Math.sin(ang) * dist);
      parts.push(colorize(shard, (p, nrm, out) => out.copy(color).lerp(new Color(1, 1, 1), 0.1), 0.85));
    }
    solids.push({
      x: hx,
      y: hy + 0.5,
      z: hz,
      h: 0.6,
      r: 1.2,
      kind: 'rock',
    });
    const banners = [];
    const addPole = (x, z, height, yaw, bannerW, bannerH) => {
      const gy = this.ground(x, z);
      const pole = new CylinderGeometry(0.06, 0.09, height, 7);
      pole.translate(x, gy + height / 2 - 0.2, z);
      parts.push(colorize(pole, (p, nrm, out) => out.copy(POLE_WOOD)));
      const bar = new CylinderGeometry(0.045, 0.045, bannerW + 0.25, 6);
      bar.rotateZ(Math.PI / 2);
      bar.rotateY(yaw + Math.PI / 2);
      bar.translate(x, gy + height - 0.45, z);
      parts.push(colorize(bar, (p, nrm, out) => out.copy(POLE_WOOD)));
      const finial = crystal(0.45, 0.09);
      finial.translate(x, gy + height - 0.2, z);
      parts.push(colorize(finial, (p, nrm, out) => out.copy(color), 0.9));
      banners.push({
        x,
        y: gy + height - 0.47,
        z,
        yaw,
        w: bannerW,
        h: bannerH,
      });
      solids.push({
        x,
        y: gy + height / 2,
        z,
        h: height / 2,
        r: 0.1,
        kind: 'structure',
      });
    };
    for (const offset of sky ? [-0.8, 0, 0.8] : [-0.6, 0, 0.6]) {
      const ang = approach + Math.PI + offset;
      let dist = ringR + 1.8;
      for (; dist > 4 && !this.okAt(def, cx + Math.sin(ang) * dist, cz + Math.cos(ang) * dist, 1);) --dist;
      const px = cx + Math.sin(ang) * dist;
      const pz = cz + Math.cos(ang) * dist;
      if (!nearTree(px, pz, 1) && this.okAt(def, px, pz, 1))
        addPole(px, pz, offset === 0 ? 6.4 : 5.4, Math.atan2(cx - px, cz - pz), 1.3, offset === 0 ? 3.2 : 2.6);
    }
    for (const side of sky ? [] : [-1, 1]) {
      const ang = approach + side * 0.17;
      const px = cx + Math.sin(ang) * 23;
      const pz = cz + Math.cos(ang) * 23;
      if (!nearTree(px, pz, 1)) addPole(px, pz, 4.2, Math.atan2(def.from[0] - px, def.from[1] - pz), 1, 2);
    }
    for (let i = 0; i < (sky ? 0 : 7); i++) {
      const ang = rng() * Math.PI * 2;
      const dist = 6.5 + rng() * 3.5;
      const px = cx + Math.sin(ang) * dist;
      const pz = cz + Math.cos(ang) * dist;
      if (angleDiff(ang, approach) < 0.5 || nearTree(px, pz, 1)) continue;
      const gy = this.ground(px, pz);
      if (def.element === 'red') {
        if (i < 3) {
          const geometry = new CylinderGeometry(0.22 + rng() * 0.1, 0.32, 0.7 + rng() * 0.6, 7);
          geometry.translate(px, gy + 0.3, pz);
          parts.push(
            colorize(geometry, (p, nrm, out) =>
              out.copy(CINDER_DARK).multiplyScalar(0.8 + 0.4 * noise3(p.x * 5, p.y * 5, p.z * 5)),
            ),
          );
        } else {
          let geometry = new DodecahedronGeometry(0.25 + rng() * 0.2, 0);
          geometry = roughen(geometry, rng, 0.3);
          geometry.translate(px, gy + 0.1, pz);
          parts.push(
            colorize(
              geometry,
              (p, nrm, out) =>
                noise3(p.x * 6, p.y * 6, p.z * 6) > 0.55 ? out.setRGB(1, 0.35, 0.06) : out.copy(CINDER_DARK),
              0.7,
            ),
          );
        }
      } else if (def.element === 'blue')
        for (let j = 0; j < 3; j++) {
          const shard = crystal(0.5 + rng() * 0.9, 0.14 + rng() * 0.08);
          shard.rotateZ((rng() - 0.5) * 0.8);
          shard.rotateX((rng() - 0.5) * 0.8);
          shard.translate(px + (rng() - 0.5) * 0.6, gy - 0.05, pz + (rng() - 0.5) * 0.6);
          parts.push(colorize(shard, (p, nrm, out) => out.setRGB(0.55, 0.85, 1), 0.35));
        }
      else {
        let geometry = new IcosahedronGeometry(0.4 + rng() * 0.35, 1);
        geometry = roughen(geometry, rng, 0.25);
        geometry.scale(1, 0.7, 1);
        geometry.translate(px, gy + 0.15, pz);
        parts.push(colorize(geometry, stonePaint(cx, cz, 0, 1, i * 13)));
      }
    }
    const group = new Group();
    group.name = `arena-${def.id}`;
    const merged = mergeGeometries(parts, false);
    if (merged) {
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, this.propMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `arena-${def.id}-props`;
      group.add(mesh);
    }
    const cloth = this.buildCloth(banners, color, def.id);
    if (cloth) group.add(cloth);
    group.add(this.buildGround(cx, cz, def.clear + 1.5, ARENA_GROUND[def.element], sky ? cy : null));
    this.group.add(group);
    for (const solid of solids)
      try {
        const RAPIER = ctx.RAPIER;
        const body = ctx.physics.createRigidBody(
          RAPIER.RigidBodyDesc.fixed().setTranslation(solid.x, solid.y, solid.z),
        );
        const collider = ctx.physics.createCollider(
          RAPIER.ColliderDesc.cylinder(Math.max(0.1, solid.h), solid.r).setCollisionGroups(COLLISION_GROUPS.static),
          body,
        );
        ctx.colliders.register(collider, {
          kind: solid.kind,
          surface: solid.kind === 'rock' ? 'stone' : 'wood',
        });
      } catch {}
    try {
      if (!sky) {
        ctx.vegetation?.clearGrass?.(new Vector3(cx, cy, cz), def.clear);
        ctx.vegetation?.clearGrass?.(new Vector3(hx, hy, hz), 2.4);
      }
    } catch {}
    const center = new Vector3(cx, cy, cz);
    const hoard = new Vector3(hx, hy, hz);
    const beacon = this.d.elite.columns.add(0, hoard, 0.85, 42, COLUMN_MODE.beacon, 0.55, def.element);
    const escorts = def.escorts.map((escort, i) => {
      const ang = approach + (i - (def.escorts.length - 1) / 2) * 0.9;
      let dist = escort === 'spitter' ? 6.5 : 4.2 + (i % 2) * 0.8;
      for (; dist > 2.5 && !this.okAt(def, cx + Math.sin(ang) * dist, cz + Math.cos(ang) * dist, 1.4);) dist -= 0.8;
      const px = cx + Math.sin(ang) * dist;
      const pz = cz + Math.cos(ang) * dist;
      return {
        kind: escort,
        pos: new Vector3(px, this.ground(px, pz), pz),
        facing: ang + Math.PI + (rng() - 0.5) * 0.8,
        id: -1,
      };
    });
    let warpDist = sky ? 14 : 22;
    for (
      ;
      sky &&
      warpDist > 6 &&
      !this.okAt(def, cx + Math.sin(approach) * warpDist, cz + Math.cos(approach) * warpDist, 1.5);
    )
      warpDist -= 1.5;
    const wx = cx + Math.sin(approach) * warpDist;
    const wz = cz + Math.cos(approach) * warpDist;
    return {
      def,
      center,
      approach,
      hoard,
      beacon,
      eliteId: -1,
      escorts,
      defeated: false,
      warp: {
        pos: new Vector3(wx, Math.max(this.ground(wx, wz), 0) + 0.3, wz),
        facing: Math.atan2(cx - wx, cz - wz),
      },
      spawned: false,
    };
  }
  addSkyArena(def) {
    if (this.list.some((existing) => existing.def.id === def.id)) return null;
    let arena = null;
    try {
      arena = this.build({
        ...def,
        sky: true,
      });
      this.list.push(arena);
    } catch (err) {
      console.warn(`[enemies] sky arena ${def.id} failed`, err);
      return null;
    }
    const warp = (this.ctx.params.get('elitewarp') ?? '').toLowerCase();
    if (warp && (warp === def.id || warp === def.name.toLowerCase() || (warp === 'bloom' && def.element === 'green'))) {
      this.warpTo = arena;
      this.warpFrames = 6;
    }
    return arena;
  }
  spawnArena(arena) {
    if (arena.spawned || arena.defeated) return;
    arena.spawned = true;
    const nocombat = this.ctx.params.get('nocombat');
    if (!(nocombat && nocombat !== '0'))
      try {
        arena.eliteId = this.d.spawn(arena.def.kind, arena.center.clone(), {
          facing: arena.approach + Math.PI,
          elite: {
            name: arena.def.name,
            element: arena.def.element,
          },
        });
        const elite = this.d.byId.get(arena.eliteId);
        if (elite?.ex) elite.ex.arenaId = arena.def.id;
        for (const escort of arena.escorts)
          escort.id = this.d.spawn(escort.kind, escort.pos.clone(), {
            facing: escort.facing,
            tier: arena.def.tier,
          });
      } catch (err) {
        console.warn(`[enemies] arena ${arena.def.id} spawn failed`, err);
      }
  }
  buildCloth(banners, color, id) {
    if (!banners.length) return null;
    const geos = [];
    banners.forEach((banner, index) => {
      const geometry = new PlaneGeometry(banner.w, banner.h, 6, 12);
      geometry.translate(0, -banner.h / 2, 0);
      geometry.rotateY(banner.yaw);
      geometry.translate(banner.x, banner.y, banner.z);
      const count = geometry.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      const seeds = new Float32Array(count).fill(index * 1.7 + id.length);
      const normals = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        normals[i * 3] = Math.sin(banner.yaw);
        normals[i * 3 + 1] = 0;
        normals[i * 3 + 2] = Math.cos(banner.yaw);
      }
      geometry.deleteAttribute('normal');
      geometry.setAttribute('aCol', new BufferAttribute(colors, 3));
      geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
      geometry.setAttribute('aNrm', new BufferAttribute(normals, 3));
      geos.push(geometry);
    });
    const merged = mergeGeometries(geos, false);
    if (!merged) return null;
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, this.clothMat);
    mesh.castShadow = true;
    mesh.name = `arena-${id}-banners`;
    return mesh;
  }
  buildGround(cx, cz, radius, groundKind, skyY = null) {
    const positions = [];
    const locals = [];
    const indices = [];
    const addVertex = (x, z) => {
      if (skyY !== null) {
        const y = this.d.skyAt(x, z);
        if (y === null || Math.abs(y - skyY) > 2.5) {
          positions.push(x, skyY - 0.4, z);
          locals.push(3, 3);
          return;
        }
        positions.push(x, y + 0.05, z);
        locals.push((x - cx) / radius, (z - cz) / radius);
        return;
      }
      positions.push(x, this.ground(x, z) + 0.05, z);
      locals.push((x - cx) / radius, (z - cz) / radius);
    };
    addVertex(cx, cz);
    for (let ring = 1; ring <= 18; ring++) {
      const dist = (ring / 18) * radius;
      for (let seg = 0; seg < 56; seg++) {
        const ang = (seg / 56) * Math.PI * 2;
        addVertex(cx + Math.cos(ang) * dist, cz + Math.sin(ang) * dist);
      }
    }
    const vi = (ring, seg) => 1 + (ring - 1) * 56 + (seg % 56);
    for (let i = 0; i < 56; i++) indices.push(0, vi(1, i + 1), vi(1, i));
    for (let ring = 1; ring < 18; ring++)
      for (let seg = 0; seg < 56; seg++) {
        const a2 = vi(ring, seg);
        const b = vi(ring, seg + 1);
        const c = vi(ring + 1, seg);
        const d = vi(ring + 1, seg + 1);
        indices.push(a2, b, d, a2, d, c);
      }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aLocal', new Float32BufferAttribute(locals, 2));
    geometry.setAttribute(
      'aEl',
      new Float32BufferAttribute(new Float32Array(positions.length / 3).fill(groundKind), 1),
    );
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, this.groundMat);
    mesh.renderOrder = 1;
    mesh.name = 'arena-ground';
    return mesh;
  }
  spawnAll() {
    if (!this.spawned) {
      this.spawned = true;
      for (const arena of this.list) if (!arena.def.sky) this.spawnArena(arena);
    }
  }
  onDefeated(enemy) {
    const arena = this.list.find((a) => a.eliteId === enemy.id || (enemy.ex && a.def.id === enemy.ex.arenaId));
    if (!arena || arena.defeated) return;
    arena.defeated = true;
    this.d.elite.columns.remove(arena.beacon);
    arena.beacon = -1;
    try {
      this.ctx.paint.bloomVitality(arena.center.clone(), 26, 3.5);
    } catch {}
    const color = _arenaColor.set(PALETTE[arena.def.element].hex);
    this.d.fx.sparks(_arenaFxPos.copy(arena.hoard).setY(arena.hoard.y + 1), color, 40, 8, 4, 0.12, 2);
    this.d.fx.paintSplash(_arenaFxPos, arena.def.element, 40, 8, 0.14);
  }
  onPlayerRespawn() {
    for (const arena of this.list) {
      if (arena.defeated || arena.eliteId < 0) continue;
      const elite = this.d.byId.get(arena.eliteId);
      if (elite && elite.alive)
        for (const escort of arena.escorts) {
          const enemy = this.d.byId.get(escort.id);
          if (!enemy || (!enemy.alive && enemy.state !== 'dying'))
            escort.id = this.d.spawn(escort.kind, escort.pos.clone(), {
              facing: escort.facing,
              rise: true,
              tier: arena.def.tier,
            });
        }
    }
  }
  doWarp() {
    const warpTo = this.warpTo;
    if (warpTo)
      try {
        this.ctx.player.teleport(warpTo.warp.pos.clone(), warpTo.warp.facing);
      } catch {}
  }
  update() {
    if (!this.spawned) this.spawnAll();
    if (this.warpFrames > 0) {
      this.warpFrames--;
      this.doWarp();
    }
  }
}
