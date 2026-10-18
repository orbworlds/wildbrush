/**
 * Additive light columns for elites: the beacon over an arena's hoard, erupting geysers and the pillars over dropped hearts, with swirling colour ribbons.
 */
import {
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OneFactor,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';
import { PALETTE } from '../core/config.js';
export const COLUMN_MODE = {
  beacon: 0,
  geyser: 1,
  pillar: 2,
};
const COLUMN_VERTEX = `
#include <wb_common>
attribute vec4 aA; // base xyz, birth
attribute vec4 aB; // radius, height, mode, intensity
attribute vec4 aC; // rgb, seed
varying vec2 vUv;
varying vec3 vCol;
varying float vI;
varying float vMode;
varying float vSeed;
varying float vT;
varying float vFacing;
varying float vDist;
void main() {
  float t = uTime - aA.w;
  float mode = aB.z;
  float h = aB.y;
  float r = aB.x;
  float I = aB.w;
  if (mode > 0.5 && mode < 1.5) {
    // geyser: erupts tall and fat, then settles into a lingering fountain
    float erupt = smoothstep(0.0, 0.35, t);
    float settle = smoothstep(0.8, 5.0, t);
    h *= erupt * mix(1.0, 0.32, settle);
    r *= mix(1.0 + 0.6 * (1.0 - smoothstep(0.0, 0.6, t)), 0.45, settle);
    I *= mix(3.0, 0.55, settle);
  }
  vec3 p = vec3(position.x * r, position.y * h, position.z * r);
  // gentle sway, flaring at the top
  float flare = 1.0 + position.y * position.y * (mode > 0.5 && mode < 1.5 ? 1.4 : 0.35);
  p.xz *= flare;
  p.x += sin(uTime * 0.7 + position.y * 3.0 + aC.w * 10.0) * 0.25 * position.y * r;
  vec3 wp = aA.xyz + p;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = vec2(atan(position.z, position.x) / 6.2832 + 0.5, position.y);
  vCol = aC.rgb;
  vI = I;
  vMode = mode;
  vSeed = aC.w;
  vT = t;
  vec3 n = normalize((viewMatrix * vec4(position.x, 0.0, position.z, 0.0)).xyz);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  vDist = -mv.z;
}
`;
const COLUMN_FRAGMENT = `
#include <wb_common>
varying vec2 vUv;
varying vec3 vCol;
varying float vI;
varying float vMode;
varying float vSeed;
varying float vT;
varying float vFacing;
varying float vDist;
void main() {
  float y = vUv.y;
  float speed = vMode > 0.5 && vMode < 1.5 ? 2.2 : 0.55;
  // swirling ribbons of colour climbing the column
  float a = vUv.x * 6.2832;
  float rib = wbNoise2(vec2(vUv.x * 5.0 + y * 1.6, y * 3.0 - uTime * speed + vSeed * 7.0));
  float rib2 = wbNoise2(vec2(vUv.x * 11.0 - y * 2.2, y * 7.0 - uTime * speed * 1.7 + vSeed * 3.0));
  float band = smoothstep(0.45, 0.8, rib) * 0.8 + smoothstep(0.55, 0.9, rib2) * 0.6;
  float core = pow(vFacing, 1.6);
  float fadeY = smoothstep(0.0, 0.06, y) * (1.0 - smoothstep(0.55, 1.0, y));
  float alpha = (0.18 + band * 0.9) * core * fadeY;
  // stay visible from afar (a signpost), but soften up close
  alpha *= smoothstep(1.5, 9.0, vDist) * mix(0.6, 1.0, smoothstep(9.0, 40.0, vDist));
  vec3 col = mix(vCol, vec3(1.0), 0.25 * band) * vI;
  if (alpha * vI < 0.002) discard;
  gl_FragColor = vec4(col * alpha, 0.0);
}
`;
export class EliteColumns {
  capacity;
  mesh;
  geo;
  aA;
  aB;
  aC;
  slots = [];
  c = new Color();
  constructor(ctx, capacity = 12) {
    this.capacity = capacity;
    const cylinder = new CylinderGeometry(1, 1, 1, 28, 12, true);
    cylinder.translate(0, 0.5, 0);
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', cylinder.getAttribute('position'));
    geometry.setIndex(cylinder.index);
    this.aA = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aB = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aC = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    geometry.setAttribute('aA', this.aA);
    geometry.setAttribute('aB', this.aB);
    geometry.setAttribute('aC', this.aC);
    geometry.instanceCount = capacity;
    geometry.boundingSphere = new Sphere(new Vector3(), 100000);
    this.geo = geometry;
    const material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
      },
      vertexShader: COLUMN_VERTEX,
      fragmentShader: COLUMN_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneFactor,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.name = 'elite-columns';
    for (let i = 0; i < capacity; i++) {
      this.slots.push({
        active: false,
        slot: i,
      });
      this.aB.setXYZW(i, 0, 0, 0, 0);
    }
    this.mesh.visible = false;
  }
  add(time, pos, radius, height, mode, intensity, color) {
    const free = this.slots.find((slot) => !slot.active);
    if (!free) return -1;
    free.active = true;
    const slot = free.slot;
    if (color instanceof Color) this.c.copy(color);
    else this.c.set(PALETTE[color].hex);
    this.aA.setXYZW(slot, pos.x, pos.y, pos.z, time);
    this.aB.setXYZW(slot, radius, height, mode, intensity);
    this.aC.setXYZW(slot, this.c.r, this.c.g, this.c.b, Math.random());
    this.dirty();
    return slot;
  }
  setIntensity(slot, intensity) {
    if (!(slot < 0 || slot >= this.capacity || !this.slots[slot].active)) {
      this.aB.setW(slot, intensity);
      this.dirty();
    }
  }
  remove(slot) {
    if (!(slot < 0 || slot >= this.capacity)) {
      this.slots[slot].active = false;
      this.aB.setXYZW(slot, 0, 0, 0, 0);
      this.dirty();
    }
  }
  dirty() {
    this.aA.needsUpdate = true;
    this.aB.needsUpdate = true;
    this.aC.needsUpdate = true;
    this.mesh.visible = this.slots.some((slot) => slot.active);
  }
}
