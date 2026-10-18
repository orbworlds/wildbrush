/**
 * GPU particle pools animated in the vertex shader: soft, sun-lit puffs for smoke and steam, and additive glows for embers, sparks and glitter.
 */
import {
  AdditiveBlending,
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
class ParticlePool {
  ctx;
  capacity;
  stride;
  mesh;
  data;
  buffer;
  head = 0;
  dMin = Infinity;
  dMax = -1;
  wrapped = false;
  constructor(ctx, capacity, stride, attributes, material) {
    this.ctx = ctx;
    this.capacity = capacity;
    this.stride = stride;
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.data = new Float32Array(capacity * stride);
    for (let i = 0; i < capacity; i++) this.data[i * stride + 3] = -1000000;
    this.buffer = new InstancedInterleavedBuffer(this.data, stride, 1);
    this.buffer.setUsage(DynamicDrawUsage);
    let offset = 0;
    for (const [attr, size] of attributes) {
      geometry.setAttribute(attr, new InterleavedBufferAttribute(this.buffer, size, offset));
      offset += size;
    }
    geometry.instanceCount = capacity;
    geometry.boundingSphere = new Sphere(new Vector3(), 100000);
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
  }
  alloc() {
    const head = this.head;
    this.head = (this.head + 1) % this.capacity;
    if (this.head === 0) this.wrapped = true;
    if (head < this.dMin) this.dMin = head;
    if (head > this.dMax) this.dMax = head;
    return head * this.stride;
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
const PUFF_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aA; // origin.xyz, birth
attribute vec4 aB; // velocity.xyz, life
attribute vec4 aC; // size0, size1, drag, buoyancy (m/s^2)
attribute vec4 aD; // color.rgb, alpha
attribute vec4 aE; // heat, seed, windResponse, spin
varying vec2 vUv;
varying vec2 vQ;
varying vec4 vColor;
varying float vAge;
varying float vHeat;
varying float vSeed;
void main() {
  float t = uTime - aA.w;
  float life = aB.w;
  if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float age = t / life;
  float drag = max(aC.z, 0.001);
  vec3 disp = aB.xyz * (1.0 - exp(-drag * t)) / drag;
  disp.y += 0.5 * aC.w * t * t;
  float seed = aE.y;
  float wr = aE.z;
  disp.xz += uWindDir * (0.35 + uWindStrength * 2.0) * wr * t;
  float tw = t * 0.8 + seed * 6.2831;
  disp.x += sin(tw * 1.3) * 0.28 * t * wr;
  disp.z += cos(tw * 1.1) * 0.28 * t * wr;
  vec3 center = aA.xyz + disp;
  float grow = 1.0 - (1.0 - age) * (1.0 - age);
  float size = mix(aC.x, aC.y, grow);
  float ang = seed * 6.2831 + aE.w * t;
  float c = cos(ang), s = sin(ang);
  vec2 q = position.xy;
  vec2 rq = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
  mvPosition.xy += rq * size;
  gl_Position = projectionMatrix * mvPosition;
  vUv = q + 0.5;
  vQ = rq * 2.0;
  vColor = aD;
  vAge = age;
  vHeat = aE.x;
  vSeed = seed;
  #include <fog_vertex>
}
`;
const PUFF_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
uniform sampler2D uNoiseTex;
varying vec2 vUv;
varying vec2 vQ;
varying vec4 vColor;
varying float vAge;
varying float vHeat;
varying float vSeed;
${FOG_AMOUNT_GLSL}
void main() {
  float r = length(vQ);
  if (r > 1.0) discard;
  float n = texture2D(uNoiseTex, vUv * 0.5 + vec2(vSeed * 3.7, vSeed * 1.3 - vAge * 0.3)).r;
  float n2 = texture2D(uNoiseTex, vUv * 1.2 + vec2(vSeed * 5.1, vAge * 0.25)).g;
  float edge = r + (n - 0.5) * 0.6 + (n2 - 0.5) * 0.3;
  float shape = (1.0 - smoothstep(0.38, 0.95, edge)) * (1.0 - smoothstep(0.72, 1.0, r));
  float fade = smoothstep(0.0, 0.1, vAge) * (1.0 - smoothstep(0.5, 1.0, vAge));
  float alpha = shape * vColor.a * fade;
  if (alpha < 0.004) discard;
  vec2 p = vQ * 0.92;
  vec3 N = normalize(vec3(p, sqrt(max(0.0, 1.0 - dot(p, p))) + 0.2));
  vec3 L = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  vec3 U = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float ndl = clamp(dot(N, L) * 0.55 + 0.45, 0.0, 1.0);
  float sunUp = smoothstep(-0.12, 0.2, uSunDir.y);
  float up = dot(N, U) * 0.5 + 0.5;
  vec3 amb = mix(uGroundColor * 0.9, uSkyColor, up) * 0.62;
  vec3 lit = (amb + uSunColor * (ndl * 0.85 + 0.3) * sunUp) * 1.3;
  vec3 col = vColor.rgb * lit * (0.82 + 0.36 * n2);
  float below = clamp(0.5 - dot(N, U) * 0.6, 0.0, 1.0);
  float h = vHeat * (1.0 - vAge) * (1.0 - vAge);
  col += vec3(1.0, 0.36, 0.09) * h * below * (1.25 - 0.8 * sunUp);
  #ifdef USE_FOG
    col = mix(col, fogColor, wbFogAmount());
  #endif
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;
export class Puffs extends ParticlePool {
  constructor(ctx, capacity) {
    const material = new ShaderMaterial({
      uniforms: {
        ...UniformsUtils.clone(UniformsLib.fog),
        ...ctx.globals,
        uNoiseTex: {
          value: getNoiseTexture(),
        },
      },
      vertexShader: PUFF_VERTEX,
      fragmentShader: PUFF_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: 201,
      blendDstAlpha: 205,
      fog: true,
    });
    super(
      ctx,
      capacity,
      20,
      [
        ['aA', 4],
        ['aB', 4],
        ['aC', 4],
        ['aD', 4],
        ['aE', 4],
      ],
      material,
    );
    this.mesh.name = 'elements-puffs';
    this.mesh.renderOrder = 11;
  }
  spawn(
    x,
    y2,
    z,
    vx,
    vy,
    vz,
    life,
    size0,
    size1,
    drag,
    buoyancy,
    r,
    g2,
    b,
    alpha,
    heat = 0,
    windResponse = 1,
    spin = 0.2,
  ) {
    const off = this.alloc();
    const data = this.data;
    data[off] = x;
    data[off + 1] = y2;
    data[off + 2] = z;
    data[off + 3] = this.ctx.time.elapsed;
    data[off + 4] = vx;
    data[off + 5] = vy;
    data[off + 6] = vz;
    data[off + 7] = life;
    data[off + 8] = size0;
    data[off + 9] = size1;
    data[off + 10] = drag;
    data[off + 11] = buoyancy;
    data[off + 12] = r;
    data[off + 13] = g2;
    data[off + 14] = b;
    data[off + 15] = alpha;
    data[off + 16] = heat;
    data[off + 17] = Math.random();
    data[off + 18] = windResponse;
    data[off + 19] = (Math.random() - 0.5) * 2 * spin;
  }
}
const GLOW_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aA; // origin.xyz, birth
attribute vec4 aB; // velocity.xyz, life
attribute vec4 aC; // size, drag, accelY, seed
attribute vec4 aD; // color.rgb, intensity
attribute vec4 aE; // streak, flickerSpeed, turbulence, cooling
varying vec2 vUv;
varying vec3 vColor;
void main() {
  float t = uTime - aA.w;
  float life = aB.w;
  if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float age = t / life;
  float drag = max(aC.y, 0.001);
  float seed = aC.w;
  float e = exp(-drag * t);
  vec3 disp = aB.xyz * (1.0 - e) / drag;
  disp.y += 0.5 * aC.z * t * t;
  float tur = aE.z;
  disp.x += (sin(t * 2.1 + seed * 40.0) + 0.5 * sin(t * 5.3 + seed * 13.0)) * tur * t * 0.6;
  disp.z += (cos(t * 1.7 + seed * 23.0) + 0.5 * cos(t * 4.7 + seed * 7.0)) * tur * t * 0.6;
  disp.xz += uWindDir * uWindStrength * 1.6 * tur * t;
  vec3 center = aA.xyz + disp;
  vec3 vel = aB.xyz * e + vec3(0.0, aC.z * t, 0.0);
  vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
  vec2 vv = (modelViewMatrix * vec4(vel, 0.0)).xy;
  float dist = max(-mvPosition.z, 0.1);
  float size = aC.x;
  float minSize = dist * 0.0026;
  float energy = 1.0;
  if (size < minSize) { energy = (size * size) / (minSize * minSize); size = minSize; }
  float sp = length(vv);
  vec2 ax = sp > 0.001 ? vv / sp : vec2(0.0, 1.0);
  vec2 ay = vec2(-ax.y, ax.x);
  float len = size + aE.x * sp * 0.045;
  vec2 q = position.xy;
  mvPosition.xy += ax * q.y * len + ay * q.x * size;
  gl_Position = projectionMatrix * mvPosition;
  vUv = q * 2.0;
  float fade = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.55, 1.0, age));
  float flick = 0.62 + 0.38 * sin(uTime * aE.y + seed * 60.0);
  vec3 col = mix(aD.rgb, vec3(1.0, 0.16, 0.03) * 0.7, clamp(age * aE.w, 0.0, 1.0));
  vColor = col * aD.w * energy * fade * flick * (size / len);
  #include <fog_vertex>
}
`;
const GLOW_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec3 vColor;
${FOG_AMOUNT_GLSL}
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 5.0) + 0.6 * exp(-r2 * 28.0);
  vec3 col = vColor * a;
  #ifdef USE_FOG
    col *= 1.0 - wbFogAmount();
  #endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export class Glows extends ParticlePool {
  constructor(ctx, capacity) {
    const material = new ShaderMaterial({
      uniforms: {
        ...UniformsUtils.clone(UniformsLib.fog),
        ...ctx.globals,
      },
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
    });
    super(
      ctx,
      capacity,
      20,
      [
        ['aA', 4],
        ['aB', 4],
        ['aC', 4],
        ['aD', 4],
        ['aE', 4],
      ],
      material,
    );
    this.mesh.name = 'elements-glows';
    this.mesh.renderOrder = 12;
  }
  spawn(
    x,
    y2,
    z,
    vx,
    vy,
    vz,
    life,
    size,
    drag,
    accelY,
    r,
    g2,
    b,
    intensity,
    streak = 0.5,
    flickerSpeed = 14,
    turbulence = 0.5,
    cooling = 1,
  ) {
    const off = this.alloc();
    const data = this.data;
    data[off] = x;
    data[off + 1] = y2;
    data[off + 2] = z;
    data[off + 3] = this.ctx.time.elapsed;
    data[off + 4] = vx;
    data[off + 5] = vy;
    data[off + 6] = vz;
    data[off + 7] = life;
    data[off + 8] = size;
    data[off + 9] = drag;
    data[off + 10] = accelY;
    data[off + 11] = Math.random();
    data[off + 12] = r;
    data[off + 13] = g2;
    data[off + 14] = b;
    data[off + 15] = intensity;
    data[off + 16] = streak;
    data[off + 17] = flickerSpeed;
    data[off + 18] = turbulence;
    data[off + 19] = cooling;
  }
}
