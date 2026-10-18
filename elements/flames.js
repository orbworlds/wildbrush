/**
 * Instanced billboard flames with a noise-carved flame-tongue shader, refilled every fire tick from burning ground and trees, plus fixed slots for burning props.
 */
import {
  CustomBlending,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Sphere,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';
import { FOG_AMOUNT_GLSL, getNoiseTexture } from './util.js';
const FLAME_STRIDE = 12;
const FLAME_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aP; // base.xyz, seed
attribute vec4 aS; // width, height, intensity, kind (0 grass, 1 big/tree, 2 prop)
attribute vec4 aT; // igniteTime, endTime, lean, speed
varying vec2 vUv;
varying float vSeed;
varying float vEnv;
varying float vInt;
varying float vKind;
varying float vSpeed;
void main() {
  float t = uTime;
  float env = smoothstep(aT.x, aT.x + 0.35, t) * (1.0 - smoothstep(aT.y - 1.4, aT.y, t));
  if (env <= 0.002 || aS.x <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float seed = aP.w;
  // grass flames are tallest at the fire front and settle down as the patch burns out
  float age = clamp((t - aT.x) / max(aT.y - aT.x, 0.1), 0.0, 1.0);
  float settle = aS.w < 0.5 ? mix(1.12, 0.5, pow(age, 0.8)) : 1.0;
  float breathe = 1.0 + 0.09 * sin(t * (4.0 + seed * 3.0) + seed * 40.0) + 0.05 * sin(t * 11.0 + seed * 17.0);
  float w = aS.x * (0.6 + 0.4 * env) * mix(1.0, settle, 0.6);
  float h = aS.y * (0.3 + 0.7 * env) * breathe * settle;
  vec4 mvPosition = modelViewMatrix * vec4(aP.xyz, 1.0);
  vec3 U = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 V = normalize(-mvPosition.xyz);
  vec3 R = cross(U, V);
  float rl = length(R);
  R = rl > 0.05 ? R / rl : vec3(1.0, 0.0, 0.0);
  vec3 up = normalize(mix(U, cross(V, R), 0.45));
  vec3 windV = (viewMatrix * vec4(uWindDir.x, 0.0, uWindDir.y, 0.0)).xyz * (uWindStrength * 0.3 + aT.z);
  vec2 q = position.xy; // x -0.5..0.5, y 0..1
  mvPosition.xyz += R * q.x * w + up * q.y * h + windV * q.y * q.y * h * 0.45;
  mvPosition.xyz += V * min(0.45, w * 0.3);
  gl_Position = projectionMatrix * mvPosition;
  vUv = vec2(q.x * 2.0, q.y);
  vSeed = seed;
  vEnv = env;
  vInt = aS.z;
  vKind = aS.w;
  vSpeed = aT.w;
  #include <fog_vertex>
}
`;
const FLAME_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
uniform sampler2D uNoiseTex;
varying vec2 vUv;
varying float vSeed;
varying float vEnv;
varying float vInt;
varying float vKind;
varying float vSpeed;
${FOG_AMOUNT_GLSL}
void main() {
  float t = uTime * vSpeed;
  float y = vUv.y;
  // travelling wiggle: the tip swings more than the base
  float wave = texture2D(uNoiseTex, vec2(vSeed * 3.7, y * 0.32 - t * 0.5)).b - 0.5;
  float x = vUv.x - wave * 1.3 * y * y;
  // silhouette: rounded belly (ellipse) flowing into a tapered tongue
  const float BY = 0.3;
  float f;
  if (y < BY) {
    f = 1.0 - length(vec2(x / 0.8, (y - BY) / BY));
  } else {
    float w = 0.8 * pow(1.0 - (y - BY) / (1.0 - BY), 0.95);
    f = 1.0 - abs(x) / max(w, 1e-3);
  }
  // rising noise carves the top into licking tongues
  float n1 = texture2D(uNoiseTex, vec2(x * 0.3 + vSeed, y * 0.45 - t * 1.05)).r;
  float n2 = texture2D(uNoiseTex, vec2(x * 0.62 - vSeed * 2.3, y * 0.95 - t * 1.9)).g;
  float n = n1 * 0.6 + n2 * 0.4;
  float v = f - (n - 0.42) * (0.3 + 1.45 * y) - 0.12 * y;
  v -= (1.0 - vEnv) * 0.5;
  float a = smoothstep(0.0, 0.045, v);
  // soft additive glow hugging the silhouette
  float halo = pow(smoothstep(-0.3, 0.02, v), 2.0) * (1.0 - smoothstep(0.55, 1.0, y)) * vEnv;
  if (a < 0.01 && halo < 0.01) discard;
  float mid = smoothstep(0.26, 0.31, v);
  float core = smoothstep(0.6, 0.66, v + (0.5 - y) * 0.25);
  float hot = smoothstep(0.82, 0.9, v + (0.35 - y) * 0.5);
  vec3 cOuter = vec3(0.9, 0.14, 0.03);
  vec3 cMid = vec3(1.0, 0.36, 0.045) * 1.3;
  vec3 cCore = vec3(1.0, 0.6, 0.14) * 1.75;
  vec3 cHot = vec3(1.0, 0.82, 0.42) * 2.3;
  vec3 col = mix(mix(mix(cOuter, cMid, mid), cCore, core), cHot, hot);
  // deeper red licks at the very top
  col = mix(col, vec3(0.62, 0.06, 0.025), smoothstep(0.55, 0.95, y) * (1.0 - mid) * 0.7);
  col *= 0.8 + 0.3 * vInt;
  float alpha = a * mix(0.8, 1.0, mid) * smoothstep(0.0, 0.05, y + 0.02);
  vec3 haloC = vec3(1.0, 0.32, 0.05) * halo * (vKind > 0.5 && vKind < 1.5 ? 0.14 : 0.3) * (0.8 + 0.3 * vInt);
  #ifdef USE_FOG
    float fg = wbFogAmount();
    col = mix(col, fogColor, fg * 0.7);
    alpha *= 1.0 - fg * 0.5;
    haloC *= 1.0 - fg;
  #endif
  gl_FragColor = vec4(col * alpha + haloC * (1.0 - a), alpha * 0.88);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export class Flames {
  capacity;
  mesh;
  data;
  buffer;
  geo;
  propSlots;
  simCount = 0;
  propDirty = false;
  constructor(ctx, capacity, propSlots = 48) {
    this.capacity = capacity;
    this.propSlots = propSlots;
    const total = capacity + propSlots;
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.data = new Float32Array(total * FLAME_STRIDE);
    this.buffer = new InstancedInterleavedBuffer(this.data, FLAME_STRIDE, 1);
    this.buffer.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aP', new InterleavedBufferAttribute(this.buffer, 4, 0));
    geometry.setAttribute('aS', new InterleavedBufferAttribute(this.buffer, 4, 4));
    geometry.setAttribute('aT', new InterleavedBufferAttribute(this.buffer, 4, 8));
    geometry.instanceCount = propSlots;
    geometry.boundingSphere = new Sphere(new Vector3(), 100000);
    this.geo = geometry;
    const material = new ShaderMaterial({
      uniforms: {
        ...UniformsUtils.clone(UniformsLib.fog),
        ...ctx.globals,
        uNoiseTex: {
          value: getNoiseTexture(),
        },
      },
      vertexShader: FLAME_VERTEX,
      fragmentShader: FLAME_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: 201,
      blendDstAlpha: 205,
      fog: true,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'elements-flames';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 10;
  }
  beginSim() {
    this.simCount = 0;
  }
  add(x, y, z, seed, width, height, intensity, kind, igniteTime, endTime, lean = 0, speed = 1) {
    if (this.simCount >= this.capacity) return false;
    const off = (this.propSlots + this.simCount) * FLAME_STRIDE;
    const data = this.data;
    data[off] = x;
    data[off + 1] = y;
    data[off + 2] = z;
    data[off + 3] = seed;
    data[off + 4] = width;
    data[off + 5] = height;
    data[off + 6] = intensity;
    data[off + 7] = kind;
    data[off + 8] = igniteTime;
    data[off + 9] = endTime;
    data[off + 10] = lean;
    data[off + 11] = speed;
    this.simCount++;
    return true;
  }
  get full() {
    return this.simCount >= this.capacity;
  }
  get count() {
    return this.simCount;
  }
  endSim() {
    this.geo.instanceCount = this.propSlots + this.simCount;
    if (this.simCount > 0) this.buffer.addUpdateRange(this.propSlots * FLAME_STRIDE, this.simCount * FLAME_STRIDE);
    this.buffer.needsUpdate = true;
  }
  setPropFlame(slot, x, y, z, seed, width, height, intensity, igniteTime, endTime) {
    if (slot < 0 || slot >= this.propSlots) return;
    const off = slot * FLAME_STRIDE;
    const data = this.data;
    data[off] = x;
    data[off + 1] = y;
    data[off + 2] = z;
    data[off + 3] = seed;
    data[off + 4] = width;
    data[off + 5] = height;
    data[off + 6] = intensity;
    data[off + 7] = 2;
    data[off + 8] = igniteTime;
    data[off + 9] = endTime;
    data[off + 10] = 0;
    data[off + 11] = 1.25;
    this.propDirty = true;
  }
  clearPropFlame(slot) {
    if (slot < 0 || slot >= this.propSlots) return;
    const off = slot * FLAME_STRIDE;
    if (this.data[off + 4] !== 0) {
      this.data[off + 4] = 0;
      this.propDirty = true;
    }
  }
  flushProps() {
    this.propDirty &&=
      (this.buffer.addUpdateRange(0, this.propSlots * FLAME_STRIDE), (this.buffer.needsUpdate = true), false);
  }
}
