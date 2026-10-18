/**
 * Greymaw's GPU effects: ring-buffer instance pools animated in the vertex shader (ink droplets, glows, smoke puffs, shards, ground decals, shockwave walls, colour streams and spikes). BossFx wraps them in helpers for ink and paint splashes, sparks, dust, smoke, ice shatters, landing markers, puddles and shockwaves.
 */
import {
  AddEquation,
  BufferGeometry,
  Color,
  ConeGeometry,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  OctahedronGeometry,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Sphere,
  UniformsLib,
  Vector3,
} from 'three';
import { PALETTE } from '../core/config.js';
const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
class InstancePool {
  capacity;
  stride;
  geo;
  data;
  buffer;
  head = 0;
  aliveUntil = -1;
  dMin = Infinity;
  dMax = -1;
  wrapped = false;
  constructor(capacity, stride, layout, base) {
    this.capacity = capacity;
    this.stride = stride;
    const geometry = new InstancedBufferGeometry();
    for (const [key, attribute] of Object.entries(base.attributes)) geometry.setAttribute(key, attribute);
    if (base.index) geometry.setIndex(base.index);
    this.data = new Float32Array(capacity * stride);
    for (let i = 0; i < capacity; i++) this.data[i * stride + 3] = -1000000;
    this.buffer = new InstancedInterleavedBuffer(this.data, stride, 1);
    this.buffer.setUsage(DynamicDrawUsage);
    let offset = 0;
    for (const [key, size] of layout) {
      geometry.setAttribute(key, new InterleavedBufferAttribute(this.buffer, size, offset));
      offset += size;
    }
    geometry.instanceCount = capacity;
    geometry.boundingSphere = new Sphere(new Vector3(), 100000);
    this.geo = geometry;
  }
  alloc() {
    const head = this.head;
    this.head = (this.head + 1) % this.capacity;
    if (this.head === 0) this.wrapped = true;
    if (head < this.dMin) this.dMin = head;
    if (head > this.dMax) this.dMax = head;
    return head * this.stride;
  }
  keepAlive(aliveUntil) {
    if (aliveUntil > this.aliveUntil) this.aliveUntil = aliveUntil;
  }
  flush() {
    if (this.dMax < 0) return;
    const stride = this.stride;
    if (this.wrapped) {
      this.buffer.addUpdateRange(0, this.head * stride);
      this.buffer.addUpdateRange(this.dMin * stride, (this.capacity - this.dMin) * stride);
    } else this.buffer.addUpdateRange(this.dMin * stride, (this.dMax - this.dMin + 1) * stride);
    this.buffer.needsUpdate = true;
    this.dMin = Infinity;
    this.dMax = -1;
    this.wrapped = false;
  }
}
const QUAD = (() => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
})();
const MOTION_GLSL = `
// analytic ballistic motion with linear drag; returns position, writes landed (0/1) and flight time
vec3 wbMotion(vec3 p0, vec3 v0, float t, float g, float drag, float groundY, out float landed, out float tl, out vec3 vel) {
  float k = max(drag, 1e-3);
  float e = exp(-k * t);
  vec3 p = p0 + v0 * (1.0 - e) / k;
  p.y -= 0.5 * g * t * t;
  vel = v0 * e;
  vel.y -= g * t;
  landed = 0.0;
  tl = t;
  if (p.y < groundY && g > 0.0) {
    // approximate landing time by bisection (few steps)
    float lo = 0.0, hi = t;
    for (int i = 0; i < 7; i++) {
      float m = 0.5 * (lo + hi);
      float em = exp(-k * m);
      float y = p0.y + v0.y * (1.0 - em) / k - 0.5 * g * m * m;
      if (y < groundY) hi = m; else lo = m;
    }
    tl = hi;
    float el = exp(-k * tl);
    p = p0 + v0 * (1.0 - el) / k;
    p.y = groundY;
    landed = 1.0;
    vel = vec3(0.0);
  }
  return p;
}
`;
function fxUniforms(ctx) {
  const uniforms = {};
  const fog = UniformsLib.fog;
  for (const key of Object.keys(fog)) uniforms[key] = fog[key];
  Object.assign(uniforms, ctx.globals);
  return uniforms;
}
const DROPLET_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aA; // p0.xyz, birth
attribute vec4 aB; // v0.xyz, life
attribute vec4 aC; // size, gravity, groundY, drag
attribute vec4 aD; // rgb, emissive
varying vec2 vUv;
varying vec4 vCol;
varying float vLanded;
varying float vFade;
varying float vSeed;
${MOTION_GLSL}
void main() {
  float t = uTime - aA.w;
  if (t < 0.0 || t > aB.w) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float landed, tl; vec3 vel;
  vec3 p = wbMotion(aA.xyz, aB.xyz, t, aC.y, aC.w, aC.z, landed, tl, vel);
  float life = t / aB.w;
  float size = aC.x;
  vec2 q = position.xy;
  vec4 mvPosition;
  if (landed > 0.5) {
    // flattened splat on the ground, spreading then shrinking away
    float since = t - tl;
    float sz = size * (1.3 + 0.9 * (1.0 - exp(-since * 14.0))) * (1.0 - smoothstep(0.6, 1.0, life));
    vec3 wp = p + vec3(q.x * sz * 1.6, 0.02, -q.y * sz * 1.6);
    mvPosition = viewMatrix * vec4(wp, 1.0);
  } else {
    mvPosition = viewMatrix * vec4(p, 1.0);
    vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
    float sp = length(vv.xy);
    vec2 dir = sp > 1e-3 ? vv.xy / sp : vec2(0.0, 1.0);
    vec2 side = vec2(dir.y, -dir.x);
    float stretch = 1.0 + min(sp * 0.06, 1.8);
    float sz = size * (1.0 - smoothstep(0.75, 1.0, life) * 0.6);
    mvPosition.xy += (side * q.x + dir * (q.y * stretch)) * sz;
  }
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
  vUv = q * 2.0;
  vCol = aD;
  vLanded = landed;
  vFade = 1.0 - smoothstep(0.7, 1.0, life);
  vSeed = fract(aA.w * 13.37 + aA.x);
}
`;
const DROPLET_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec4 vCol;
varying float vLanded;
varying float vFade;
varying float vSeed;
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  return mod(q.x * 8.0 + q.y * 4.0 + q.x * q.y * 3.0, 16.0) / 16.0;
}
void main() {
  float r = length(vUv);
  if (vLanded > 0.5) {
    float a = atan(vUv.y, vUv.x);
    float edge = 0.8 + 0.09 * sin(a * 3.0 + vSeed * 30.0) + 0.07 * sin(a * 7.0 + vSeed * 7.0) + 0.05 * sin(a * 13.0 + vSeed * 3.0);
    if (r > edge) discard;
  } else if (r > 1.0) discard;
  if (vFade < 0.999 && vFade <= bayer(gl_FragCoord.xy) + 0.03) discard;
  vec3 col = vCol.rgb;
  vec3 light;
  if (vLanded > 0.5) {
    light = uSunColor * max(uSunDir.y, 0.0) * 0.8 + uSkyColor * 0.45;
    col *= light;
    col += vec3(1.0) * 0.06 * smoothstep(0.5, 0.0, abs(r - 0.35));
  } else {
    vec3 n = vec3(vUv, sqrt(max(0.0, 1.0 - r * r)));
    vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    float ndl = max(dot(n, sunV), 0.0);
    light = uSunColor * (0.35 + 0.65 * ndl) * 0.9 + uSkyColor * 0.4;
    col *= light;
    float spec = pow(max(dot(reflect(-sunV, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
    col += uSunColor * spec * 0.8;
    col += vec3(1.0) * pow(1.0 - n.z, 3.0) * 0.12;
  }
  col += vCol.rgb * vCol.a;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;
class DropletPool extends InstancePool {
  mesh;
  constructor(ctx, capacity) {
    super(
      capacity,
      16,
      [
        ['aA', 4],
        ['aB', 4],
        ['aC', 4],
        ['aD', 4],
      ],
      QUAD,
    );
    const material = new ShaderMaterial({
      uniforms: fxUniforms(ctx),
      vertexShader: DROPLET_VERTEX,
      fragmentShader: DROPLET_FRAGMENT,
      fog: true,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = 'boss-droplets';
  }
  spawn(birth, x, y, z, vx, vy, vz, size, life, groundY, color, emissive = 0, gravity = 18, drag = 0.6) {
    this.keepAlive(birth + life + 0.1);
    const off = this.alloc();
    const data = this.data;
    data[off] = x;
    data[off + 1] = y;
    data[off + 2] = z;
    data[off + 3] = birth;
    data[off + 4] = vx;
    data[off + 5] = vy;
    data[off + 6] = vz;
    data[off + 7] = life;
    data[off + 8] = size;
    data[off + 9] = gravity;
    data[off + 10] = groundY;
    data[off + 11] = drag;
    data[off + 12] = color.r;
    data[off + 13] = color.g;
    data[off + 14] = color.b;
    data[off + 15] = emissive;
  }
}
const GLOW_VERTEX = `
#include <wb_common>
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC; // size, gravity, groundY, drag
attribute vec4 aD; // rgb (HDR), streak
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
${MOTION_GLSL}
void main() {
  float t = uTime - aA.w;
  if (t < 0.0 || t > aB.w) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float landed, tl; vec3 vel;
  vec3 p = wbMotion(aA.xyz, aB.xyz, t, aC.y, aC.w, aC.z, landed, tl, vel);
  float life = t / aB.w;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
  float sp = length(vv.xy);
  vec2 dir = sp > 1e-3 ? vv.xy / sp : vec2(0.0, 1.0);
  vec2 side = vec2(dir.y, -dir.x);
  float stretch = 1.0 + min(sp * aD.w * 0.08, 4.0);
  float s = aC.x * (1.0 - life * life);
  mv.xy += (side * position.x + dir * position.y * stretch) * s;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 2.0;
  vCol = aD.rgb;
  vA = (1.0 - smoothstep(0.55, 1.0, life)) * smoothstep(0.0, 0.04, t);
}
`;
const GLOW_FRAGMENT = `
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(vUv);
  float a = smoothstep(1.0, 0.0, r);
  a = a * a * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * a, a);
}
`;
class GlowPool extends InstancePool {
  mesh;
  constructor(ctx, capacity) {
    super(
      capacity,
      16,
      [
        ['aA', 4],
        ['aB', 4],
        ['aC', 4],
        ['aD', 4],
      ],
      QUAD,
    );
    const material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
      },
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      blendEquation: AddEquation,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'boss-glows';
  }
  spawn(
    birth,
    x,
    y,
    z,
    vx,
    vy,
    vz,
    size,
    life,
    color,
    intensity,
    gravity = 0,
    drag = 1.5,
    streak = 1,
    groundY = -10000,
  ) {
    this.keepAlive(birth + life + 0.1);
    const off = this.alloc();
    const data = this.data;
    data[off] = x;
    data[off + 1] = y;
    data[off + 2] = z;
    data[off + 3] = birth;
    data[off + 4] = vx;
    data[off + 5] = vy;
    data[off + 6] = vz;
    data[off + 7] = life;
    data[off + 8] = size;
    data[off + 9] = gravity;
    data[off + 10] = groundY;
    data[off + 11] = drag;
    data[off + 12] = color.r * intensity;
    data[off + 13] = color.g * intensity;
    data[off + 14] = color.b * intensity;
    data[off + 15] = streak;
  }
}
const PUFF_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC; // size0, size1, rise, drag
attribute vec4 aD; // rgb, opacity
varying vec2 vUv;
varying vec4 vCol;
varying float vLife;
varying float vSeed;
void main() {
  float t = uTime - aA.w;
  if (t < 0.0 || t > aB.w) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float life = t / aB.w;
  float k = max(aC.w, 1e-3);
  vec3 p = aA.xyz + aB.xyz * (1.0 - exp(-k * t)) / k + vec3(0.0, aC.z * t, 0.0);
  float s = mix(aC.x, aC.y, 1.0 - pow(1.0 - life, 2.2));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float seed = fract(aA.w * 7.31 + aA.x * 0.37);
  float a = seed * 6.283 + t * (seed - 0.5) * 1.2;
  vec2 q = vec2(cos(a) * position.x - sin(a) * position.y, sin(a) * position.x + cos(a) * position.y);
  mv.xy += q * s;
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
  vUv = position.xy * 2.0;
  vCol = aD;
  vLife = life;
  vSeed = seed;
}
`;
const PUFF_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec4 vCol;
varying float vLife;
varying float vSeed;
void main() {
  float r = length(vUv);
  float n = wbNoise2(vUv * 2.2 + vSeed * 17.0) * 0.5 + wbNoise2(vUv * 5.0 - vSeed * 9.0) * 0.25;
  float a = smoothstep(1.0, 0.35, r + (n - 0.35) * 0.6);
  a *= smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.45, 1.0, vLife)) * vCol.a;
  if (a < 0.004) discard;
  vec3 light = uSunColor * (0.55 + 0.35 * (vUv.y * 0.5 + 0.5)) + uSkyColor * 0.35;
  vec3 col = vCol.rgb * light;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;
class PuffPool extends InstancePool {
  mesh;
  constructor(ctx, capacity) {
    super(
      capacity,
      16,
      [
        ['aA', 4],
        ['aB', 4],
        ['aC', 4],
        ['aD', 4],
      ],
      QUAD,
    );
    const material = new ShaderMaterial({
      uniforms: fxUniforms(ctx),
      vertexShader: PUFF_VERTEX,
      fragmentShader: PUFF_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'boss-puffs';
  }
  spawn(birth, x, y, z, vx, vy, vz, size0, size1, life, color, opacity, rise = 0.3, drag = 3) {
    this.keepAlive(birth + life + 0.1);
    const off = this.alloc();
    const data = this.data;
    data[off] = x;
    data[off + 1] = y;
    data[off + 2] = z;
    data[off + 3] = birth;
    data[off + 4] = vx;
    data[off + 5] = vy;
    data[off + 6] = vz;
    data[off + 7] = life;
    data[off + 8] = size0;
    data[off + 9] = size1;
    data[off + 10] = rise;
    data[off + 11] = drag;
    data[off + 12] = color.r;
    data[off + 13] = color.g;
    data[off + 14] = color.b;
    data[off + 15] = opacity;
  }
}
const SHARD_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC; // size, gravity, groundY, spin
attribute vec4 aD; // rgb, kind (0 ice, 1 ink, 2 paint)
varying vec3 vN;
varying vec3 vCol;
varying float vKind;
varying vec3 vView;
${MOTION_GLSL}
mat3 rotAxis(vec3 a, float ang) {
  float s = sin(ang), c = cos(ang), oc = 1.0 - c;
  return mat3(oc * a.x * a.x + c, oc * a.x * a.y + a.z * s, oc * a.z * a.x - a.y * s,
              oc * a.x * a.y - a.z * s, oc * a.y * a.y + c, oc * a.y * a.z + a.x * s,
              oc * a.z * a.x + a.y * s, oc * a.y * a.z - a.x * s, oc * a.z * a.z + c);
}
void main() {
  float t = uTime - aA.w;
  if (t < 0.0 || t > aB.w) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float landed, tl; vec3 vel;
  vec3 p = wbMotion(aA.xyz, aB.xyz, t, aC.y, 0.4, aC.z, landed, tl, vel);
  float life = t / aB.w;
  float seed = fract(aA.w * 3.17 + aA.z * 0.71);
  vec3 axis = normalize(vec3(seed - 0.5, 0.6, fract(seed * 7.3) - 0.5));
  float ang = aC.w * min(t, tl) + seed * 6.28;
  mat3 R = rotAxis(axis, ang);
  float s = aC.x * (1.0 - smoothstep(0.7, 1.0, life));
  vec3 lp = R * (position * s);
  if (landed > 0.5) lp.y = max(lp.y, -s * 0.2) + s * 0.1;
  vec3 wp = p + lp;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vN = normalize((viewMatrix * vec4(R * normal, 0.0)).xyz);
  vView = -mvPosition.xyz;
  vCol = aD.rgb;
  vKind = aD.w;
  #include <fog_vertex>
}
`;
const SHARD_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec3 vN;
varying vec3 vCol;
varying float vKind;
varying vec3 vView;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vView);
  vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float ndl = max(dot(n, sunV), 0.0);
  float fres = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 3.0);
  vec3 h = normalize(sunV + v);
  float spec = pow(max(dot(n, h), 0.0), 60.0);
  vec3 col = vCol * (uSunColor * (0.3 + 0.7 * ndl) + uSkyColor * 0.45);
  if (vKind < 0.5) {
    col = mix(col, vec3(0.85, 0.97, 1.0), 0.25) + vec3(0.6, 0.85, 1.0) * fres * 0.9;
    col += uSunColor * spec * 2.0;
  } else if (vKind < 1.5) {
    col += uSkyColor * fres * 0.4 + uSunColor * spec * 1.2;
  } else {
    col += vCol * 0.6 + uSunColor * spec;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;
class ShardPool extends InstancePool {
  mesh;
  constructor(ctx, capacity) {
    const geometry = new OctahedronGeometry(1, 0);
    geometry.scale(0.55, 1, 0.4);
    const shard = geometry.index ? geometry.toNonIndexed() : geometry;
    shard.computeVertexNormals();
    shard.deleteAttribute('uv');
    super(
      capacity,
      16,
      [
        ['aA', 4],
        ['aB', 4],
        ['aC', 4],
        ['aD', 4],
      ],
      shard,
    );
    const material = new ShaderMaterial({
      uniforms: fxUniforms(ctx),
      vertexShader: SHARD_VERTEX,
      fragmentShader: SHARD_FRAGMENT,
      fog: true,
      side: DoubleSide,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = 'boss-shards';
  }
  spawn(birth, x, y, z, vx, vy, vz, size, life, groundY, color, kind, spin = 9) {
    this.keepAlive(birth + life + 0.1);
    const off = this.alloc();
    const data = this.data;
    data[off] = x;
    data[off + 1] = y;
    data[off + 2] = z;
    data[off + 3] = birth;
    data[off + 4] = vx;
    data[off + 5] = vy;
    data[off + 6] = vz;
    data[off + 7] = life;
    data[off + 8] = size;
    data[off + 9] = 18;
    data[off + 10] = groundY;
    data[off + 11] = spin;
    data[off + 12] = color.r;
    data[off + 13] = color.g;
    data[off + 14] = color.b;
    data[off + 15] = kind;
  }
}
const DECAL_KIND = {
  ring: 0,
  marker: 1,
  puddle: 2,
  splat: 3,
  rootRing: 4,
  dust: 5,
};
const DECAL_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aA; // center.xyz, birth
attribute vec4 aB; // radius0, radius1, life, kind
attribute vec4 aC; // rgb, intensity
attribute vec4 aD; // normal.xz, rotation, param (eta for markers)
varying vec2 vUv;
varying vec4 vCol;
varying float vKind;
varying float vLife;
varying float vT;
varying float vParam;
varying float vSeed;
void main() {
  float t = uTime - aA.w;
  if (t < 0.0 || t > aB.z) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float life = t / aB.z;
  float kind = aB.w;
  float r = aB.x;
  if (kind < 0.5 || abs(kind - 5.0) < 0.5) r = mix(aB.x, aB.y, 1.0 - pow(1.0 - life, 2.6));
  else if (abs(kind - 2.0) < 0.5 || abs(kind - 3.0) < 0.5) r = mix(aB.x, aB.y, 1.0 - exp(-t * 9.0));
  else r = aB.y;
  vec3 n = normalize(vec3(aD.x, 1.0, aD.y));
  vec3 tx = normalize(cross(vec3(0.0, 0.0, 1.0), n));
  vec3 tz = cross(n, tx);
  float c = cos(aD.z), s = sin(aD.z);
  vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * 2.0 * r;
  vec3 wp = aA.xyz + tx * q.x + tz * q.y + n * 0.06;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  // pull slightly toward the camera to beat z-fighting with the terrain
  mvPosition.xyz *= 0.997;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
  vUv = position.xy * 2.0;
  vCol = aC;
  vKind = kind;
  vLife = life;
  vT = t;
  vParam = aD.w;
  vSeed = fract(aA.w * 5.13 + aA.x * 0.17);
}
`;
const DECAL_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec4 vCol;
varying float vKind;
varying float vLife;
varying float vT;
varying float vParam;
varying float vSeed;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);
  vec3 col = vCol.rgb;
  float a = 0.0;
  vec3 emit = vec3(0.0);
  if (vKind < 0.5) {
    // expanding shock ring
    float w = 0.16 + 0.1 * (1.0 - vLife);
    float ring = smoothstep(1.0, 1.0 - w * 0.4, r) * smoothstep(1.0 - w * 1.8, 1.0 - w * 0.4, r);
    float n = wbNoise2(vec2(ang * 3.0, vT * 2.0) + vSeed * 11.0);
    a = ring * (0.65 + 0.35 * n) * (1.0 - vLife);
    emit = col * vCol.a * a;
  } else if (vKind < 1.5) {
    // landing marker: static outer ring + a ring closing in as impact nears + pulsing core
    float closeIn = clamp(1.0 - vT / max(vParam, 0.05), 0.0, 1.0);
    float outer = smoothstep(1.0, 0.93, r) * smoothstep(0.8, 0.93, r);
    float inner = 1.0 - smoothstep(0.0, 0.06, abs(r - (0.15 + closeIn * 0.8)));
    float core = smoothstep(0.22, 0.0, r) * (0.5 + 0.5 * sin(vT * 18.0));
    float dash = step(0.5, fract(ang / 6.2832 * 12.0 + vT * 0.5));
    a = outer * (0.55 + 0.45 * dash) + inner * 0.9 + core * 0.6;
    a *= smoothstep(0.0, 0.1, vT) * (vT < vParam ? 1.0 : 0.0);
    emit = col * vCol.a * a;
  } else if (vKind < 2.5 || vKind > 2.5 && vKind < 3.5) {
    // puddle / splat: irregular blob with droplets around, glossy
    float wob = 0.72 + 0.12 * sin(ang * 5.0 + vSeed * 40.0) + 0.08 * sin(ang * 9.0 + vSeed * 13.0) + 0.05 * sin(ang * 17.0);
    float body = smoothstep(wob, wob - 0.04, r);
    vec2 dp = vec2(cos(ang), sin(ang));
    float drops = 0.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float da = fi * 1.047 + vSeed * 20.0;
      vec2 c = vec2(cos(da), sin(da)) * (0.82 + 0.1 * fract(vSeed * 7.0 + fi * 0.37));
      drops = max(drops, smoothstep(0.075, 0.05, length(vUv - c)));
    }
    float m = max(body, drops);
    float fade = 1.0 - smoothstep(0.55, 1.0, vLife);
    a = m * fade * vCol.a;
    vec3 light = uSunColor * max(uSunDir.y, 0.2) * 0.75 + uSkyColor * 0.5;
    col = col * light;
    // glossy sheen
    col += vec3(1.0) * 0.12 * smoothstep(0.35, 0.0, length(vUv - vec2(-0.2, 0.25))) * body;
    if (vKind > 2.5) emit = vCol.rgb * 0.35 * a;
  } else if (vKind < 4.5) {
    // root ring: green vines circle
    float ring = smoothstep(0.08, 0.0, abs(r - 0.8 - 0.05 * sin(ang * 7.0 + vT * 3.0)));
    a = ring * (1.0 - smoothstep(0.6, 1.0, vLife)) * smoothstep(0.0, 0.15, vT);
    col *= uSunColor * 0.7 + uSkyColor * 0.4;
  } else {
    // dust ring (soft)
    float n = wbNoise2(vUv * 3.0 + vSeed * 9.0);
    a = smoothstep(1.0, 0.6, r) * smoothstep(0.2, 0.8, r) * (1.0 - vLife) * (0.5 + 0.5 * n) * vCol.a;
    col *= uSunColor * 0.6 + uSkyColor * 0.5;
  }
  if (a < 0.004) discard;
  if (vKind < 1.5) {
    gl_FragColor = vec4(emit, a * 0.3);
  } else {
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
    gl_FragColor.rgb = gl_FragColor.rgb * a + emit;
  }
}
`;
class DecalPool extends InstancePool {
  mesh;
  constructor(ctx, capacity) {
    super(
      capacity,
      16,
      [
        ['aA', 4],
        ['aB', 4],
        ['aC', 4],
        ['aD', 4],
      ],
      QUAD,
    );
    const material = new ShaderMaterial({
      uniforms: fxUniforms(ctx),
      vertexShader: DECAL_VERTEX,
      fragmentShader: DECAL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'boss-decals';
  }
  spawn(birth, x, y, z, r0, r1, life, kind, color, intensity, nx = 0, nz = 0, param = 0, rot = Math.random() * 6.283) {
    this.keepAlive(birth + life + 0.1);
    const off = this.alloc();
    const data = this.data;
    data[off] = x;
    data[off + 1] = y;
    data[off + 2] = z;
    data[off + 3] = birth;
    data[off + 4] = r0;
    data[off + 5] = r1;
    data[off + 6] = life;
    data[off + 7] = kind;
    data[off + 8] = color.r;
    data[off + 9] = color.g;
    data[off + 10] = color.b;
    data[off + 11] = intensity;
    data[off + 12] = nx;
    data[off + 13] = nz;
    data[off + 14] = rot;
    data[off + 15] = param;
  }
}
const WAVE_VERTEX = `
#include <wb_common>
attribute vec4 aA; // center, birth
attribute vec4 aB; // r0, r1, life, height
attribute vec4 aC; // rgb, intensity
varying vec2 vUv;
varying vec4 vCol;
varying float vLife;
void main() {
  float t = uTime - aA.w;
  if (t < 0.0 || t > aB.z) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float life = t / aB.z;
  // linear expansion: the gameplay ring (hazards.ts) expands at constant speed and must match
  float r = mix(aB.x, aB.y, life);
  float h = aB.w * (1.0 - life * 0.35);
  float a = position.x;
  vec3 wp = aA.xyz + vec3(cos(a) * r, position.y * h - 0.1, sin(a) * r);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vUv = vec2(a, position.y);
  vCol = aC;
  vLife = life;
}
`;
const WAVE_FRAGMENT = `
#include <wb_common>
varying vec2 vUv;
varying vec4 vCol;
varying float vLife;
void main() {
  float n = wbNoise2(vec2(vUv.x * 6.0, vUv.y * 2.0 - vLife * 3.0));
  float fade = 1.0 - smoothstep(0.78, 1.0, vLife);
  float a = (1.0 - vUv.y) * (1.0 - vUv.y) * smoothstep(0.0, 0.15, vUv.y + 0.1) * fade * (0.55 + 0.6 * n);
  // bright crest along the top so the height reads (jump over it)
  float crest = (1.0 - smoothstep(0.0, 0.12, abs(vUv.y - 0.55))) * fade * 0.8;
  a = max(a, crest * 0.8);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * vCol.a * (a + crest), a * 0.7);
}
`;
class WavePool extends InstancePool {
  mesh;
  constructor(ctx, capacity) {
    const positions = [];
    const indices = [];
    for (let i = 0; i <= 48; i++) {
      const angle = (i / 48) * Math.PI * 2;
      positions.push(angle, 0, 0, angle, 1, 0);
    }
    for (let i = 0; i < 48; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    super(
      capacity,
      12,
      [
        ['aA', 4],
        ['aB', 4],
        ['aC', 4],
      ],
      geometry,
    );
    const material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
      },
      vertexShader: WAVE_VERTEX,
      fragmentShader: WAVE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'boss-waves';
  }
  spawn(birth, x, y, z, r0, r1, life, height, color, intensity) {
    this.keepAlive(birth + life + 0.1);
    const off = this.alloc();
    const data = this.data;
    data[off] = x;
    data[off + 1] = y;
    data[off + 2] = z;
    data[off + 3] = birth;
    data[off + 4] = r0;
    data[off + 5] = r1;
    data[off + 6] = life;
    data[off + 7] = height;
    data[off + 8] = color.r;
    data[off + 9] = color.g;
    data[off + 10] = color.b;
    data[off + 11] = intensity;
  }
}
const STREAM_VERTEX = `
#include <wb_common>
attribute vec4 aA; // start.xyz, birth
attribute vec4 aB; // end.xyz, life
attribute vec4 aC; // rgb (HDR), size
attribute vec4 aD; // arc height, spiral radius, spiral turns, ease power
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
vec3 streamPos(float u) {
  float e = 1.0 - pow(1.0 - clamp(u, 0.0, 1.0), aD.w);
  vec3 p = mix(aA.xyz, aB.xyz, e);
  vec3 ax = aB.xyz - aA.xyz;
  float L = max(length(ax), 1e-3);
  ax /= L;
  vec3 s1 = cross(ax, abs(ax.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0));
  s1 = dot(s1, s1) > 1e-8 ? normalize(s1) : vec3(1.0, 0.0, 0.0);
  vec3 s2 = cross(ax, s1);
  float ang = aD.z * 6.2832 * e + fract(aA.w * 3.7) * 6.2832;
  float rr = aD.y * sin(3.14159 * e);
  p += (s1 * cos(ang) + s2 * sin(ang)) * rr;
  p.y += aD.x * sin(3.14159 * e);
  return p;
}
void main() {
  float t = uTime - aA.w;
  if (t < 0.0 || t > aB.w) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float u = t / aB.w;
  vec3 p = streamPos(u);
  vec3 p2 = streamPos(u + 0.02);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec3 vv = (viewMatrix * vec4(p2 - p, 0.0)).xyz;
  float sp = length(vv.xy);
  vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(0.0, 1.0);
  vec2 side = vec2(dir.y, -dir.x);
  float stretch = 1.0 + min(sp * 6.0, 5.0);
  float s = aC.w * (0.6 + 0.4 * sin(3.14159 * u));
  mv.xy += (side * position.x + dir * position.y * stretch) * s;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 2.0;
  vCol = aC.rgb;
  vA = smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.85, 1.0, u));
}
`;
class StreamPool extends InstancePool {
  mesh;
  constructor(ctx, capacity) {
    super(
      capacity,
      16,
      [
        ['aA', 4],
        ['aB', 4],
        ['aC', 4],
        ['aD', 4],
      ],
      QUAD,
    );
    const material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
      },
      vertexShader: STREAM_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      blendEquation: AddEquation,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'boss-streams';
  }
  spawn(birth, from, to, life, color, intensity, size, arc = 2, spiral = 1, turns = 1, ease = 2) {
    this.keepAlive(birth + life + 0.1);
    const off = this.alloc();
    const data = this.data;
    data[off] = from.x;
    data[off + 1] = from.y;
    data[off + 2] = from.z;
    data[off + 3] = birth;
    data[off + 4] = to.x;
    data[off + 5] = to.y;
    data[off + 6] = to.z;
    data[off + 7] = life;
    data[off + 8] = color.r * intensity;
    data[off + 9] = color.g * intensity;
    data[off + 10] = color.b * intensity;
    data[off + 11] = size;
    data[off + 12] = arc;
    data[off + 13] = spiral;
    data[off + 14] = turns;
    data[off + 15] = ease;
  }
}
const SPIKE_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aA; // base.xyz, birth
attribute vec4 aB; // height, radius, life, kind (0 ice, 1 thorn)
attribute vec4 aC; // rgb, yaw
attribute vec4 aD; // tiltX, tiltZ, delay(rise time), seed
varying vec3 vN;
varying vec3 vCol;
varying float vKind;
varying vec3 vView;
varying float vH;
varying vec3 vWp;
void main() {
  float t = uTime - aA.w;
  if (t < 0.0 || t > aB.z) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float rise = max(aD.z, 0.04);
  float up = t < rise ? t / rise : 1.0;
  // overshoot then settle
  float grow = up < 1.0 ? up * up * (3.0 - 2.0 * up) * 1.12 : 1.0 + 0.12 * exp(-(t - rise) * 14.0) * cos((t - rise) * 30.0);
  float sink = 1.0 - smoothstep(aB.z - 0.35, aB.z, t);
  float h = aB.x * grow * sink;
  float r = aB.y * (0.6 + 0.4 * sink);
  vec3 p = position;
  float kind = aB.w;
  // bend thorns into a hooked curve
  float along = clamp(p.y, 0.0, 1.0);
  vec3 lp = vec3(p.x * r * (1.0 - along * 0.85), p.y * h, p.z * r * (1.0 - along * 0.85));
  if (kind > 0.5) lp.x += along * along * h * 0.28 * sin(aD.w * 6.28);
  lp.x += aD.x * lp.y;
  lp.z += aD.y * lp.y;
  float c = cos(aC.w), s = sin(aC.w);
  lp = vec3(c * lp.x + s * lp.z, lp.y, -s * lp.x + c * lp.z);
  vec3 n = normal;
  n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
  vec3 wp = aA.xyz + lp;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vN = normalize((viewMatrix * vec4(n, 0.0)).xyz);
  vView = -mvPosition.xyz;
  vCol = aC.rgb;
  vKind = kind;
  vH = along;
  vWp = wp;
  #include <fog_vertex>
}
`;
const SPIKE_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec3 vN;
varying vec3 vCol;
varying float vKind;
varying vec3 vView;
varying float vH;
varying vec3 vWp;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vView);
  vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float ndl = max(dot(n, sunV), 0.0);
  float fres = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 2.5);
  vec3 h = normalize(sunV + v);
  float spec = pow(max(dot(n, h), 0.0), 50.0);
  vec3 col;
  if (vKind < 0.5) {
    vec3 base = mix(vCol * 0.55, vec3(0.86, 0.97, 1.0), vH * 0.7);
    col = base * (uSunColor * (0.45 + 0.55 * ndl) + uSkyColor * 0.55);
    col += vec3(0.55, 0.85, 1.0) * fres * 1.1 + uSunColor * spec * 2.2;
    col += vCol * 0.25 * (1.0 - vH);
  } else {
    float band = wbNoise2(vec2(vH * 9.0, vWp.x + vWp.z));
    vec3 base = mix(vec3(0.16, 0.12, 0.08), vCol, 0.55 + 0.35 * band);
    base = mix(base, vCol * 1.3, smoothstep(0.75, 1.0, vH));
    col = base * (uSunColor * (0.35 + 0.65 * ndl) + uSkyColor * 0.4);
    col += uSunColor * spec * 0.6 + vCol * fres * 0.5;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;
class SpikePool extends InstancePool {
  mesh;
  constructor(ctx, capacity) {
    const geometry = new ConeGeometry(1, 1, 6, 3, false);
    geometry.translate(0, 0.5, 0);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const bulge = 1 + 0.18 * Math.sin(i * 1.7) * (1 - y);
      position.setXYZ(i, position.getX(i) * bulge, y, position.getZ(i) * bulge);
    }
    const cone = geometry.toNonIndexed();
    cone.deleteAttribute('uv');
    cone.computeVertexNormals();
    super(
      capacity,
      16,
      [
        ['aA', 4],
        ['aB', 4],
        ['aC', 4],
        ['aD', 4],
      ],
      cone,
    );
    const material = new ShaderMaterial({
      uniforms: fxUniforms(ctx),
      vertexShader: SPIKE_VERTEX,
      fragmentShader: SPIKE_FRAGMENT,
      fog: true,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.castShadow = false;
    this.mesh.name = 'boss-spikes';
  }
  spawn(birth, x, y, z, height, radius, life, kind, color, rise = 0.12, tiltX = 0, tiltZ = 0) {
    this.keepAlive(birth + life + 0.1);
    const off = this.alloc();
    const data = this.data;
    data[off] = x;
    data[off + 1] = y;
    data[off + 2] = z;
    data[off + 3] = birth;
    data[off + 4] = height;
    data[off + 5] = radius;
    data[off + 6] = life;
    data[off + 7] = kind;
    data[off + 8] = color.r;
    data[off + 9] = color.g;
    data[off + 10] = color.b;
    data[off + 11] = Math.random() * 6.283;
    data[off + 12] = tiltX;
    data[off + 13] = tiltZ;
    data[off + 14] = rise;
    data[off + 15] = Math.random();
  }
}
export const INK_COLOR = new Color(0x2c2a33);
const INK_LIGHT = new Color(0x5a5566);
const SPARK_WHITE = new Color(1, 1, 1);
const DUST_COLOR = new Color(0xb9ad95);
const ICE_COLOR = new Color(0xa8e4ff);
const FLASH_COLOR = new Color(1, 0.85, 0.55);
const _tint = new Color();
const _paint = new Color();
export function paintColor(color, out) {
  return out.set(PALETTE[color].hex);
}
function fxBudget(quality) {
  return quality === 'low'
    ? {
        drops: 1000,
        glows: 800,
        puffs: 300,
        shards: 220,
        decals: 110,
        waves: 10,
        streams: 400,
        spikes: 96,
      }
    : quality === 'medium'
      ? {
          drops: 1600,
          glows: 1200,
          puffs: 450,
          shards: 320,
          decals: 150,
          waves: 14,
          streams: 700,
          spikes: 128,
        }
      : {
          drops: 2400,
          glows: 1800,
          puffs: 650,
          shards: 420,
          decals: 200,
          waves: 16,
          streams: 1000,
          spikes: 160,
        };
}
export class BossFx {
  ctx;
  ground;
  flat;
  drops;
  glows;
  puffs;
  shards;
  decals;
  waves;
  streams;
  spikes;
  group = new Group();
  time = 0;
  nrm = new Vector3();
  constructor(ctx, ground, flat = () => false) {
    this.ctx = ctx;
    this.ground = ground;
    this.flat = flat;
    const budget = fxBudget(ctx.settings?.quality ?? 'high');
    this.drops = new DropletPool(ctx, budget.drops);
    this.glows = new GlowPool(ctx, budget.glows);
    this.puffs = new PuffPool(ctx, budget.puffs);
    this.shards = new ShardPool(ctx, budget.shards);
    this.decals = new DecalPool(ctx, budget.decals);
    this.waves = new WavePool(ctx, budget.waves);
    this.streams = new StreamPool(ctx, budget.streams);
    this.spikes = new SpikePool(ctx, budget.spikes);
    this.group.name = 'boss-fx';
    this.group.add(
      this.decals.mesh,
      this.drops.mesh,
      this.shards.mesh,
      this.puffs.mesh,
      this.glows.mesh,
      this.waves.mesh,
      this.streams.mesh,
      this.spikes.mesh,
    );
  }
  setTime(time) {
    this.time = time;
  }
  flush() {
    const time = this.time;
    const pools = [
      [this.drops, this.drops.mesh],
      [this.glows, this.glows.mesh],
      [this.puffs, this.puffs.mesh],
      [this.shards, this.shards.mesh],
      [this.decals, this.decals.mesh],
      [this.waves, this.waves.mesh],
      [this.streams, this.streams.mesh],
      [this.spikes, this.spikes.mesh],
    ];
    for (const [pool, mesh] of pools) {
      pool.flush();
      mesh.visible = time <= pool.aliveUntil;
    }
  }
  groundAt(x, z) {
    return this.ground(x, z);
  }
  get now() {
    return this.time;
  }
  normalXZ(x, z) {
    if (this.flat(x, z)) return this.nrm.set(0, 1, 0);
    try {
      this.ctx.terrain.normalAt(x, z, this.nrm);
      if (!Number.isFinite(this.nrm.x) || this.nrm.y < 0.3) this.nrm.set(0, 1, 0);
    } catch {
      this.nrm.set(0, 1, 0);
    }
    return this.nrm.multiplyScalar(1 / Math.max(0.3, this.nrm.y));
  }
  inkSplash(pos, dir, count, speed, size = 0.07, color = INK_COLOR) {
    const groundY = this.ground(pos.x, pos.z);
    for (let i = 0; i < count; i++) {
      let dx = rnd(-1, 1);
      let dy = rnd(0.3, 1.2);
      let dz = rnd(-1, 1);
      if (dir) {
        dx = dx * 0.6 + dir.x * 1.2;
        dz = dz * 0.6 + dir.z * 1.2;
        dy += Math.max(0, dir.y);
      }
      const spd = speed * rnd(0.4, 1.1);
      _tint.copy(color).lerp(INK_LIGHT, Math.random() * 0.3);
      this.drops.spawn(
        this.time,
        pos.x,
        pos.y,
        pos.z,
        dx * spd,
        dy * spd,
        dz * spd,
        size * rnd(0.6, 1.3),
        rnd(0.9, 2.2),
        groundY,
        _tint,
        0,
        18,
        0.5,
      );
    }
  }
  paintSplash(pos, color, count, speed, size = 0.09) {
    const groundY = this.ground(pos.x, pos.z);
    paintColor(color, _paint);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const up = rnd(0.4, 1.4);
      const spd = speed * rnd(0.35, 1.1);
      this.drops.spawn(
        this.time,
        pos.x,
        pos.y,
        pos.z,
        Math.cos(angle) * spd,
        up * spd,
        Math.sin(angle) * spd,
        size * rnd(0.6, 1.5),
        rnd(1.2, 2.6),
        groundY,
        _paint,
        0.35,
        16,
        0.5,
      );
    }
  }
  sparks(pos, color, count, speed, intensity = 3, size = 0.07, gravity = 4) {
    for (let i = 0; i < count; i++) {
      const dx = rnd(-1, 1);
      const dy = rnd(-0.2, 1);
      const dz = rnd(-1, 1);
      const spd = speed * rnd(0.4, 1.1);
      this.glows.spawn(
        this.time,
        pos.x,
        pos.y,
        pos.z,
        dx * spd,
        dy * spd,
        dz * spd,
        size * rnd(0.6, 1.4),
        rnd(0.25, 0.6),
        color,
        intensity,
        gravity,
        2.5,
        1.2,
      );
    }
  }
  hitSpark(pos, dir, color) {
    const tint = color ? paintColor(color, _tint) : _tint.copy(SPARK_WHITE);
    for (let i = 0; i < 10; i++) {
      const vx = dir.x * 6 + rnd(-4, 4);
      const vy = rnd(0, 5);
      const vz = dir.z * 6 + rnd(-4, 4);
      this.glows.spawn(
        this.time,
        pos.x,
        pos.y,
        pos.z,
        vx,
        vy,
        vz,
        rnd(0.05, 0.1),
        rnd(0.18, 0.35),
        tint,
        color ? 3.2 : 2.4,
        6,
        4,
        1.6,
      );
    }
    this.glows.spawn(this.time, pos.x, pos.y, pos.z, 0, 0, 0, 0.9, 0.12, color ? tint : FLASH_COLOR, 2.2, 0, 1, 0);
  }
  dust(pos, count, radius, size = 0.5, color = DUST_COLOR, opacity = 0.5) {
    const groundY = this.ground(pos.x, pos.z);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = radius * Math.sqrt(Math.random());
      const x = pos.x + Math.cos(angle) * dist;
      const z = pos.z + Math.sin(angle) * dist;
      this.puffs.spawn(
        this.time,
        x,
        groundY + 0.15,
        z,
        Math.cos(angle) * rnd(1, 3),
        rnd(0.2, 1.2),
        Math.sin(angle) * rnd(1, 3),
        size * 0.5,
        size * rnd(1.2, 2),
        rnd(0.7, 1.4),
        color,
        opacity,
        0.35,
        3.5,
      );
    }
  }
  smoke(pos, count, color, size = 0.4, opacity = 0.45) {
    for (let i = 0; i < count; i++)
      this.puffs.spawn(
        this.time,
        pos.x + rnd(-0.2, 0.2),
        pos.y + rnd(-0.1, 0.2),
        pos.z + rnd(-0.2, 0.2),
        rnd(-0.4, 0.4),
        rnd(0.4, 1.2),
        rnd(-0.4, 0.4),
        size * 0.5,
        size * rnd(1.5, 2.4),
        rnd(0.8, 1.5),
        color,
        opacity,
        0.8,
        2,
      );
  }
  iceShatter(pos, dir, scale) {
    const groundY = this.ground(pos.x, pos.z);
    const count = Math.round(22 * Math.min(2, scale));
    for (let i = 0; i < count; i++) {
      const spd = rnd(3, 9);
      const dx = rnd(-1, 1) + dir.x * 0.8;
      const dy = rnd(0.3, 1.4);
      const dz = rnd(-1, 1) + dir.z * 0.8;
      this.shards.spawn(
        this.time,
        pos.x + rnd(-0.3, 0.3) * scale,
        pos.y + rnd(-0.3, 0.5) * scale,
        pos.z + rnd(-0.3, 0.3) * scale,
        dx * spd,
        dy * spd,
        dz * spd,
        rnd(0.06, 0.16) * Math.sqrt(scale),
        rnd(1.2, 2.2),
        groundY,
        ICE_COLOR,
        0,
        rnd(6, 16),
      );
    }
    this.sparks(pos, ICE_COLOR, 16, 7, 2.5, 0.08, 6);
    this.puffs.spawn(
      this.time,
      pos.x,
      pos.y,
      pos.z,
      0,
      0.5,
      0,
      0.5 * scale,
      1.6 * scale,
      0.9,
      _tint.set(15136511),
      0.55,
      0.4,
      2,
    );
    this.puffs.spawn(
      this.time,
      pos.x,
      pos.y + 0.3,
      pos.z,
      0,
      0.5,
      0,
      0.4 * scale,
      1.3 * scale,
      1.1,
      _tint.set(15136511),
      0.4,
      0.4,
      2,
    );
  }
  ring(pos, r0, r1, life, color, intensity) {
    const nrm = this.normalXZ(pos.x, pos.z);
    this.decals.spawn(
      this.time,
      pos.x,
      this.ground(pos.x, pos.z),
      pos.z,
      r0,
      r1,
      life,
      DECAL_KIND.ring,
      color,
      intensity,
      nrm.x,
      nrm.z,
    );
  }
  marker(pos, radius, eta, color, intensity) {
    const nrm = this.normalXZ(pos.x, pos.z);
    this.decals.spawn(
      this.time,
      pos.x,
      pos.y,
      pos.z,
      radius,
      radius,
      eta + 0.05,
      DECAL_KIND.marker,
      color,
      intensity,
      nrm.x,
      nrm.z,
      eta,
    );
  }
  puddle(pos, radius, life, color = INK_COLOR, opacity = 0.9) {
    const nrm = this.normalXZ(pos.x, pos.z);
    this.decals.spawn(
      this.time,
      pos.x,
      this.ground(pos.x, pos.z),
      pos.z,
      radius * 0.3,
      radius,
      life,
      DECAL_KIND.puddle,
      color,
      opacity,
      nrm.x,
      nrm.z,
    );
  }
  splat(pos, radius, life, color) {
    const nrm = this.normalXZ(pos.x, pos.z);
    this.decals.spawn(
      this.time,
      pos.x,
      this.ground(pos.x, pos.z),
      pos.z,
      radius * 0.3,
      radius,
      life,
      DECAL_KIND.splat,
      paintColor(color, _tint),
      0.95,
      nrm.x,
      nrm.z,
    );
  }
  shockwave(pos, radius, color) {
    const groundY = this.ground(pos.x, pos.z);
    this.waves.spawn(this.time, pos.x, groundY, pos.z, 0.4, radius, 0.5, 0.9, color, 1.6);
    this.ring(pos, 0.4, radius, 0.55, color, 2.2);
    const nrm = this.normalXZ(pos.x, pos.z);
    this.decals.spawn(
      this.time,
      pos.x,
      groundY,
      pos.z,
      0.5,
      radius * 1.1,
      0.9,
      DECAL_KIND.dust,
      DUST_COLOR,
      0.7,
      nrm.x,
      nrm.z,
    );
  }
}
