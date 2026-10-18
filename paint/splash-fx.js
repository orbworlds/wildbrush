/**
 * Splash effects: an instanced droplet mesh (wobbling teardrops, landing pancakes, glassy water spray), the simulation that moves and recycles the droplets, and the ripple, foam and dye rings left on water.
 */
import {
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';
const _mat4 = new Matrix4();
const _quat = new Quaternion();
const _scale = new Vector3();
const _yAxis = new Vector3(0, 1, 0);
const _pos = new Vector3();
const DROPLET_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aDrop;   // x wobble amount, y phase, z whiteness, w teardrop tail length (in radii)
attribute vec3 aColor;
varying vec3 vN;
varying vec3 vWP;
varying vec3 vCol;
varying vec2 vDrop;
void main() {
  vec3 p = position;
  vec3 nrm = normal;
  float taper = aDrop.w;
  if (taper > 0.0 && p.y < 0.0) {
    // teardrop: the back half narrows into a tail (local +Y = direction of travel)
    float k = pow(-p.y, 1.4);
    float w = mix(1.0, 0.1, k);
    p.xz *= w;
    p.y *= 1.0 + taper;
    nrm = normalize(vec3(nrm.x, nrm.y * w / (1.0 + taper) - 0.35 * k, nrm.z));
  }
  float t = uTime * 16.0 + aDrop.y;
  float wob = aDrop.x;
  p += nrm * wob * (sin(t + position.y * 5.0) * 0.55 + sin(t * 0.71 + position.x * 6.0 + 1.3) * 0.3
                       + sin(t * 1.37 + position.z * 4.0) * 0.15);
  mat4 mm = modelMatrix * instanceMatrix;
  vec4 wp = mm * vec4(p, 1.0);
  mat3 m3 = mat3(mm);
  vN = normalize(transpose(inverse(m3)) * nrm);
  vWP = wp.xyz;
  vCol = aColor;
  vDrop = aDrop.zw;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const DROPLET_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec3 vN;
varying vec3 vWP;
varying vec3 vCol;
varying vec2 vDrop;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWP);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(uSunDir);
  vec3 base = vCol;
  float ndl = dot(N, L);
  float wrap = max((ndl + 0.4) / 1.4, 0.0);
  vec3 amb = mix(uGroundColor * 0.8, uSkyColor, N.y * 0.5 + 0.5) * 0.6;
  vec3 col = base * (uSunColor * wrap * 1.05 + amb);
  // light scattering through the thin droplet
  float sss = pow(max(dot(V, -L), 0.0), 3.0) * 0.7 + (1.0 - abs(dot(N, V))) * 0.25;
  col += base * uSunColor * sss * 0.6;
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float spec = pow(nh, 140.0) * 3.2 + pow(nh, 16.0) * 0.22;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 R = reflect(-V, N);
  vec3 env = mix(uGroundColor * 0.6, uSkyColor * 1.25, smoothstep(-0.2, 0.5, R.y));
  col += uSunColor * spec * max(sign(ndl + 0.1), 0.0) + env * fres * 0.75;
  // water spray: whitish, glassy
  col = mix(col, vec3(0.85, 0.94, 1.0) * (0.55 + wrap * 0.6) + env * fres * 0.6 + uSunColor * spec, vDrop.x);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
export class DropletRenderer {
  mesh;
  cap;
  count = 0;
  aDrop;
  aColor;
  constructor(ctx, cap = 640) {
    this.cap = cap;
    const geometry = new IcosahedronGeometry(1, 3);
    this.aDrop = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.aDrop.setUsage(DynamicDrawUsage);
    this.aColor.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aDrop', this.aDrop);
    geometry.setAttribute('aColor', this.aColor);
    const material = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog]),
      vertexShader: DROPLET_VERTEX,
      fragmentShader: DROPLET_FRAGMENT,
      fog: true,
    });
    Object.assign(material.uniforms, ctx.globals);
    this.mesh = new InstancedMesh(geometry, material, cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.name = 'paint-droplets';
    this.mesh.renderOrder = 2;
  }
  begin() {
    this.count = 0;
  }
  push(pos, dir, width, len, color, wobble, phase, white = 0, taper = 0) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    _quat.setFromUnitVectors(_yAxis, dir);
    _scale.set(width, len, width);
    _mat4.compose(pos, _quat, _scale);
    this.mesh.setMatrixAt(i, _mat4);
    this.aDrop.setXYZW(i, wobble, phase, white, taper);
    this.aColor.setXYZ(i, color.r, color.g, color.b);
  }
  end() {
    this.mesh.count = this.count;
    if (this.count > 0) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, this.count * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.aDrop.clearUpdateRanges();
      this.aDrop.addUpdateRange(0, this.count * 4);
      this.aDrop.needsUpdate = true;
      this.aColor.clearUpdateRanges();
      this.aColor.addUpdateRange(0, this.count * 3);
      this.aColor.needsUpdate = true;
    }
    this.mesh.visible = this.count > 0;
  }
}
export const DropKind = {
  Drop: 0,
  Pancake: 1,
  Water: 2,
};
export class DropletSim {
  cap;
  n = 0;
  px;
  py;
  pz;
  vx;
  vy;
  vz;
  life;
  maxLife;
  rad;
  kind;
  nx;
  ny;
  nz;
  floorD;
  colors;
  tmpP = new Vector3();
  tmpA = new Vector3();
  constructor(cap = 420) {
    this.cap = cap;
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.pz = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.vz = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.rad = new Float32Array(cap);
    this.kind = new Uint8Array(cap);
    this.nx = new Float32Array(cap);
    this.ny = new Float32Array(cap);
    this.nz = new Float32Array(cap);
    this.floorD = new Float32Array(cap);
    this.colors = Array.from(
      {
        length: cap,
      },
      () => new Color(),
    );
  }
  get count() {
    return this.n;
  }
  spawn(kind, pos, vel, radius, life, color, floorNormal, floorPoint) {
    let slot = this.n;
    if (slot >= this.cap) {
      let oldest = 0;
      let oldestAge = -1;
      for (let i = 0; i < this.cap; i++) {
        const age = this.life[i] / this.maxLife[i];
        if (age > oldestAge) {
          oldestAge = age;
          oldest = i;
        }
      }
      slot = oldest;
    } else this.n++;
    this.px[slot] = pos.x;
    this.py[slot] = pos.y;
    this.pz[slot] = pos.z;
    this.vx[slot] = vel.x;
    this.vy[slot] = vel.y;
    this.vz[slot] = vel.z;
    this.life[slot] = 0;
    this.maxLife[slot] = Math.max(0.05, life);
    this.rad[slot] = radius;
    this.kind[slot] = kind;
    this.colors[slot].copy(color);
    if (floorNormal && floorPoint) {
      this.nx[slot] = floorNormal.x;
      this.ny[slot] = floorNormal.y;
      this.nz[slot] = floorNormal.z;
      this.floorD[slot] = floorNormal.dot(floorPoint) - 0.02;
    } else {
      this.nx[slot] = 0;
      this.ny[slot] = 1;
      this.nz[slot] = 0;
      this.floorD[slot] = -1000000000;
    }
  }
  update(dt, gravity, onLand) {
    let i2 = 0;
    for (; i2 < this.n;) {
      this.life[i2] += dt;
      const kind = this.kind[i2];
      if (kind !== DropKind.Pancake) {
        this.vy[i2] += gravity * dt;
        const drag = Math.exp(-0.6 * dt);
        this.vx[i2] *= drag;
        this.vz[i2] *= drag;
        this.px[i2] += this.vx[i2] * dt;
        this.py[i2] += this.vy[i2] * dt;
        this.pz[i2] += this.vz[i2] * dt;
        if (
          this.px[i2] * this.nx[i2] + this.py[i2] * this.ny[i2] + this.pz[i2] * this.nz[i2] < this.floorD[i2] &&
          this.life[i2] > 0.04
        ) {
          if (onLand && kind === DropKind.Drop)
            onLand(this.px[i2], this.py[i2], this.pz[i2], this.colors[i2], this.rad[i2]);
          this.life[i2] = this.maxLife[i2] + 1;
        }
      }
      if (this.life[i2] >= this.maxLife[i2]) {
        this.swapRemove(i2);
        continue;
      }
      i2++;
    }
  }
  render(renderer, time) {
    const tmpP = this.tmpP;
    const tmpA = this.tmpA;
    for (let i = 0; i < this.n; i++) {
      const age = this.life[i] / this.maxLife[i];
      tmpP.set(this.px[i], this.py[i], this.pz[i]);
      const kind = this.kind[i];
      if (kind === DropKind.Pancake) {
        tmpA.set(this.nx[i], this.ny[i], this.nz[i]);
        const grow = 1 - (1 - Math.min(1, age * 1.6)) ** 3;
        const spread = this.rad[i] * (0.3 + 0.7 * grow);
        const thickness = this.rad[i] * 0.28 * (1 - age) * (1 - age) * (1 - age) + 0.005;
        renderer.push(tmpP, tmpA, spread, thickness, this.colors[i], 0.02 * (1 - age), i * 1.7, 0);
        continue;
      }
      const speed = Math.hypot(this.vx[i], this.vy[i], this.vz[i]);
      if (speed > 0.001) tmpA.set(this.vx[i] / speed, this.vy[i] / speed, this.vz[i] / speed);
      else tmpA.set(0, 1, 0);
      const fade = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
      const radius = this.rad[i] * fade;
      const stretch = 1 + Math.min(2.2, speed * 0.09);
      renderer.push(
        tmpP,
        tmpA,
        radius / Math.sqrt(stretch),
        radius * stretch,
        this.colors[i],
        0.06,
        i * 2.3 + time,
        kind === DropKind.Water ? 0.85 : 0,
      );
    }
  }
  swapRemove(i) {
    const last = --this.n;
    if (i !== last) {
      this.px[i] = this.px[last];
      this.py[i] = this.py[last];
      this.pz[i] = this.pz[last];
      this.vx[i] = this.vx[last];
      this.vy[i] = this.vy[last];
      this.vz[i] = this.vz[last];
      this.life[i] = this.life[last];
      this.maxLife[i] = this.maxLife[last];
      this.rad[i] = this.rad[last];
      this.kind[i] = this.kind[last];
      this.nx[i] = this.nx[last];
      this.ny[i] = this.ny[last];
      this.nz[i] = this.nz[last];
      this.floorD[i] = this.floorD[last];
      this.colors[i].copy(this.colors[last]);
    }
  }
}
const RING_VERTEX = `
attribute vec4 aRing;  // x age 0..1, y style (0 ripple, 1 paint shock), z,w unused
attribute vec3 aColor;
varying vec2 vUv;
varying vec4 vRing;
varying vec3 vCol;
void main() {
  vUv = uv * 2.0 - 1.0;
  vRing = aRing;
  vCol = aColor;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;
const RING_FRAGMENT = `
varying vec2 vUv;
varying vec4 vRing;
varying vec3 vCol;
float rHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), u.x), mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float r = length(vUv);
  float age = vRing.x;
  float a;
  vec3 col;
  if (vRing.y < 0.5) {
    // ripple: a bright thin crest with a soft trough behind it
    float rad = mix(0.15, 0.95, 1.0 - pow(1.0 - age, 2.2));
    float w = mix(0.03, 0.012, age);
    float crest = exp(-pow((r - rad) / w, 2.0));
    float trail = exp(-pow((r - rad * 0.82) / (w * 2.5), 2.0)) * 0.12;
    float wobble = 0.85 + 0.15 * rNoise(vec2(atan(vUv.y, vUv.x) * 4.0, age * 3.0));
    a = (crest + trail) * wobble * pow(1.0 - age, 1.5) * smoothstep(1.0, 0.94, r);
    col = mix(vec3(0.92, 0.97, 1.0), vCol, 0.3);
    a *= 0.55;
  } else if (vRing.y > 1.5) {
    // paint dye dissolving into the water
    float n = rNoise(vUv * 3.0 + vRing.z * 5.0) * 0.55 + rNoise(vUv * 8.0 + vRing.z) * 0.45;
    float rad = mix(0.35, 0.95, sqrt(age));
    float cloud = smoothstep(rad, rad * 0.35, r + (n - 0.5) * 0.35);
    a = cloud * smoothstep(0.0, 0.06, age) * pow(1.0 - age, 0.8) * 0.62;
    col = vCol * (0.8 + 0.4 * n);
  } else {
    // foam burst: broken white disc that thins out
    float n = rNoise(vUv * 7.0 + vRing.z * 13.0) * 0.6 + rNoise(vUv * 15.0 - vRing.z * 7.0) * 0.4;
    float rad = mix(0.3, 0.8, sqrt(age));
    float disc = smoothstep(rad, rad * 0.6, r);
    float holes = smoothstep(0.25 + age * 0.55, 0.45 + age * 0.55, n);
    a = disc * holes * (1.0 - age) * 0.9;
    col = mix(vec3(0.95, 0.98, 1.0), vCol, 0.2);
  }
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export class SplashRings {
  mesh;
  cap = 48;
  items = [];
  aRing;
  aColor;
  constructor() {
    const geometry = new PlaneGeometry(2, 2);
    geometry.rotateX(-Math.PI / 2);
    this.aRing = new InstancedBufferAttribute(new Float32Array(this.cap * 4), 4);
    this.aColor = new InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    this.aRing.setUsage(DynamicDrawUsage);
    this.aColor.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aRing', this.aRing);
    geometry.setAttribute('aColor', this.aColor);
    const material = new ShaderMaterial({
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new InstancedMesh(geometry, material, this.cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'paint-rings';
  }
  spawn(pos, normal, size, duration, color, delay = 0, style = 0) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push({
      p: pos.clone(),
      n: normal.clone(),
      size,
      t: 0,
      dur: duration,
      delay,
      c: color.clone(),
      style,
      seed: Math.random() * 10,
    });
  }
  update(dt) {
    let count = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const ring = this.items[i];
      ring.t += dt;
      if (ring.t - ring.delay >= ring.dur) this.items.splice(i, 1);
    }
    for (const ring of this.items) {
      const age = (ring.t - ring.delay) / ring.dur;
      if (age < 0) continue;
      _quat.setFromUnitVectors(_yAxis, ring.n);
      const size = ring.size;
      _scale.set(size, 1, size);
      _pos.copy(ring.p).addScaledVector(ring.n, 0.03);
      _mat4.compose(_pos, _quat, _scale);
      this.mesh.setMatrixAt(count, _mat4);
      this.aRing.setXYZW(count, age, ring.style, ring.seed, 0);
      this.aColor.setXYZ(count, ring.c.r, ring.c.g, ring.c.b);
      count++;
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.aRing.needsUpdate = true;
      this.aColor.needsUpdate = true;
    }
  }
}
