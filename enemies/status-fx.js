/**
 * Status visuals drawn over Smudges, each as one instanced batch: flame tongues while burning, a cracking ice shell while frozen, and vines that grow around them while rooted.
 */
import {
  BufferAttribute,
  CatmullRomCurve3,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  OctahedronGeometry,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Sphere,
  TubeGeometry,
  UniformsLib,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../core/math.js';
function statusUniforms(ctx) {
  const uniforms = {};
  const fog = UniformsLib.fog;
  for (const key of Object.keys(fog)) uniforms[key] = fog[key];
  Object.assign(uniforms, ctx.globals);
  return uniforms;
}
const FLAME_VERTEX = `
#include <wb_common>
attribute vec4 aF; // base.xyz, seed
attribute vec4 aG; // width, height, intensity, pull
varying vec2 vUv;
varying float vSeed;
varying float vInt;
void main() {
  vec4 mv = viewMatrix * vec4(aF.xyz, 1.0);
  float breathe = 1.0 + 0.12 * sin(uTime * (9.0 + aF.w * 5.0) + aF.w * 40.0);
  vec2 q = position.xy; // x -0.5..0.5, y 0..1
  mv.xy += vec2(q.x * aG.x, q.y * aG.y * breathe);
  mv.z += aG.w;
  gl_Position = projectionMatrix * mv;
  vUv = vec2(q.x * 2.0, q.y);
  vSeed = aF.w;
  vInt = aG.z;
}
`;
const FLAME_FRAGMENT = `
#include <wb_common>
varying vec2 vUv;
varying float vSeed;
varying float vInt;
void main() {
  float y = vUv.y;
  float t = uTime * 2.4 + vSeed * 10.0;
  float n = wbNoise2(vec2(vUv.x * 2.2 + vSeed * 7.0, y * 3.2 - t * 1.9));
  float n2 = wbNoise2(vec2(vUv.x * 5.0 - vSeed * 3.0, y * 6.0 - t * 3.1));
  float w = pow(sin(3.14159 * pow(clamp(y, 0.0, 1.0), 0.55)), 0.8) * (1.0 - y * 0.55);
  float x = vUv.x + (n - 0.5) * 0.5 * y;
  float d = abs(x) / max(w, 0.02) + (n2 - 0.5) * 0.5 * y + y * y * 0.4;
  float outer = 1.0 - smoothstep(0.78, 0.98, d);
  float mid = 1.0 - smoothstep(0.45, 0.62, d + y * 0.25);
  float core = 1.0 - smoothstep(0.18, 0.34, d + y * 0.45);
  if (outer < 0.01) discard;
  vec3 col = vec3(1.0, 0.24, 0.05) * 1.6;
  col = mix(col, vec3(1.0, 0.55, 0.1) * 2.4, mid);
  col = mix(col, vec3(1.0, 0.92, 0.6) * 3.4, core);
  float a = outer * vInt;
  gl_FragColor = vec4(col * a, a * 0.85);
}
`;
export class Flames {
  capacity;
  mesh;
  aF;
  aG;
  geo;
  n = 0;
  constructor(ctx, capacity) {
    this.capacity = capacity;
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.aF = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aG = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aF.setUsage(DynamicDrawUsage);
    this.aG.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aF', this.aF);
    geometry.setAttribute('aG', this.aG);
    geometry.instanceCount = 0;
    geometry.boundingSphere = new Sphere(new Vector3(), 100000);
    this.geo = geometry;
    const material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
      },
      vertexShader: FLAME_VERTEX,
      fragmentShader: FLAME_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 7;
    this.mesh.name = 'enemy-flames';
  }
  begin() {
    this.n = 0;
  }
  add(pos, width, height, intensity, seed, pull) {
    if (this.n >= this.capacity) return;
    const index = this.n++;
    this.aF.setXYZW(index, pos.x, pos.y, pos.z, seed);
    this.aG.setXYZW(index, width, height, intensity, pull);
  }
  end() {
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) {
      this.aF.clearUpdateRanges();
      this.aG.clearUpdateRanges();
      this.aF.addUpdateRange(0, this.n * 4);
      this.aG.addUpdateRange(0, this.n * 4);
      this.aF.needsUpdate = true;
      this.aG.needsUpdate = true;
    }
  }
}
function iceShellGeometry() {
  const rng = makeRng('smudge-ice');
  const parts = [];
  const core = new IcosahedronGeometry(0.62, 0);
  core.scale(1, 0.95, 1);
  core.translate(0, 0.48, 0);
  parts.push(core);
  for (let i = 0; i < 13; i++) {
    const spike = new OctahedronGeometry(1, 0);
    const len = 0.25 + rng() * 0.35;
    const width = 0.1 + rng() * 0.09;
    spike.scale(width, len, width * 0.85);
    const yaw = rng() * Math.PI * 2;
    const elevation = 0.2 + rng() * 1.1;
    const dir = new Vector3(
      Math.cos(yaw) * Math.cos(elevation),
      Math.sin(elevation),
      Math.sin(yaw) * Math.cos(elevation),
    );
    const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
    spike.applyQuaternion(quat);
    const base = dir
      .clone()
      .multiplyScalar(0.45)
      .add(new Vector3(0, 0.42 + rng() * 0.2, 0));
    spike.translate(base.x + dir.x * len * 0.6, base.y + dir.y * len * 0.6, base.z + dir.z * len * 0.6);
    parts.push(spike);
  }
  for (let i = 0; i < 6; i++) {
    const shard = new OctahedronGeometry(1, 0);
    const angle = (i / 6) * Math.PI * 2 + rng();
    shard.scale(0.16 + rng() * 0.08, 0.2 + rng() * 0.15, 0.14);
    shard.rotateY(angle);
    shard.rotateZ((rng() - 0.5) * 0.8);
    shard.translate(Math.cos(angle) * 0.62, 0.08, Math.sin(angle) * 0.62);
    parts.push(shard);
  }
  const prepared = parts.map((part) => {
    const geo = part.index ? part.toNonIndexed() : part;
    geo.deleteAttribute('uv');
    geo.computeVertexNormals();
    return geo;
  });
  return mergeGeometries(prepared, false);
}
const ICE_SHELL_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aS; // grow, crack, seed, _
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;
varying float vCrack;
void main() {
  float g = aS.x;
  vec3 p = position * g;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  vN = normalize((viewMatrix * modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);
  vView = -mvPosition.xyz;
  vLocal = position;
  vCrack = aS.y;
  #include <fog_vertex>
}
`;
const ICE_SHELL_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;
varying float vCrack;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  float ndv = abs(dot(n, v));
  float fres = pow(1.0 - ndv, 2.5);
  vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  vec3 h = normalize(sunV + v);
  float spec = pow(max(dot(n, h), 0.0), 90.0) * 3.0 + pow(max(dot(n, h), 0.0), 12.0) * 0.25;
  vec3 deep = vec3(0.16, 0.5, 0.78);
  vec3 lite = vec3(0.75, 0.94, 1.0);
  vec3 col = mix(deep, lite, fres * 0.8 + 0.2 * max(dot(n, sunV), 0.0));
  col *= uSunColor * 0.6 + uSkyColor * 0.6;
  col += uSunColor * spec;
  // internal frost streaks
  float fr = wbNoise3(vLocal * 9.0);
  col += vec3(0.9, 0.97, 1.0) * smoothstep(0.62, 0.8, fr) * 0.35;
  // cracks before breaking
  float cr = 1.0 - smoothstep(0.0, 0.05, abs(wbNoise3(vLocal * 6.0) - 0.5));
  col += vec3(1.0) * cr * vCrack * 1.5;
  float a = clamp(0.42 + fres * 0.5 + spec * 0.3 + cr * vCrack, 0.0, 0.95);
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}
`;
export class IceShells {
  mesh;
  aS;
  n = 0;
  m = new Matrix4();
  q = new Quaternion();
  s = new Vector3();
  e = new Euler();
  constructor(ctx, capacity) {
    const geometry = iceShellGeometry();
    this.aS = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aS.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aS', this.aS);
    const material = new ShaderMaterial({
      uniforms: statusUniforms(ctx),
      vertexShader: ICE_SHELL_VERTEX,
      fragmentShader: ICE_SHELL_FRAGMENT,
      transparent: true,
      fog: true,
      depthWrite: true,
    });
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'enemy-ice';
  }
  begin() {
    this.n = 0;
  }
  add(pos, facing, radius, height, grow, crack, seed) {
    if (!(this.n >= this.mesh.instanceMatrix.count)) {
      this.e.set(0, facing + seed * 6.28, 0);
      this.q.setFromEuler(this.e);
      this.s.set(radius, height, radius);
      this.m.compose(pos, this.q, this.s);
      this.mesh.setMatrixAt(this.n, this.m);
      this.aS.setXYZW(this.n, grow, crack, seed, 0);
      this.n++;
    }
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.aS.needsUpdate = true;
    }
  }
}
function vineWrapGeometry() {
  const rng = makeRng('smudge-vines');
  const parts = [];
  const tagVine = (geometry, lenAt, isLeaf) => {
    const position = geometry.getAttribute('position');
    const lens = new Float32Array(position.count);
    const leafFlags = new Float32Array(position.count).fill(isLeaf);
    const point = new Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      lens[i] = lenAt(i, point);
    }
    geometry.setAttribute('aLen', new BufferAttribute(lens, 1));
    geometry.setAttribute('aLeaf', new BufferAttribute(leafFlags, 1));
  };
  for (let i = 0; i < 5; i++) {
    const start = (i / 5) * Math.PI * 2 + rng() * 0.5;
    const turns = 0.55 + rng() * 0.35;
    const spin = i % 2 == 0 ? 1 : -1;
    const points = [];
    for (let j = 0; j <= 9; j++) {
      const t2 = j / 9;
      const angle = start + spin * t2 * turns * Math.PI * 2;
      const radius =
        1.18 -
        0.2 * Math.sin(Math.min(1, t2 * 1.15) * Math.PI) -
        (t2 < 0.12 ? 0 : 0.05) +
        (t2 > 0.88 ? (t2 - 0.88) * 1.2 : 0);
      points.push(new Vector3(Math.cos(angle) * radius, -0.04 + t2 * (0.72 + rng() * 0.2), Math.sin(angle) * radius));
    }
    const curve = new CatmullRomCurve3(points);
    const tube = new TubeGeometry(curve, 28, 0.075, 6, false);
    const uv = tube.getAttribute('uv');
    const position = tube.getAttribute('position');
    const center = new Vector3();
    const vertex = new Vector3();
    for (let j = 0; j < position.count; j++) {
      const along = uv.getX(j);
      vertex.fromBufferAttribute(position, j);
      curve.getPointAt(Math.min(1, along), center);
      vertex
        .sub(center)
        .multiplyScalar(1 - along * 0.75)
        .add(center);
      position.setXYZ(j, vertex.x, vertex.y, vertex.z);
    }
    tube.computeVertexNormals();
    tagVine(tube, (i) => uv.getX(i), 0);
    tube.deleteAttribute('uv');
    parts.push(tube);
    for (let j = 0; j < 4; j++) {
      const at = 0.2 + j * 0.2 + rng() * 0.08;
      const point = curve.getPointAt(at);
      const tangent = curve.getTangentAt(at);
      const leaf = new PlaneGeometry(0.2, 0.12, 1, 1);
      leaf.translate(0.1, 0, 0);
      const outward = new Vector3(point.x, 0, point.z).normalize();
      const side = new Vector3().crossVectors(tangent, outward).normalize();
      const basis = new Matrix4().makeBasis(side.clone().multiplyScalar(j % 2 ? 1 : -1), outward, tangent);
      leaf.applyMatrix4(basis);
      leaf.rotateY(0);
      leaf.translate(point.x, point.y, point.z);
      leaf.deleteAttribute('uv');
      tagVine(leaf, () => at, 1);
      parts.push(leaf);
    }
  }
  return mergeGeometries(
    parts.map((part) => (part.index ? part.toNonIndexed() : part)),
    false,
  );
}
const VINE_WRAP_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute float aLen;
attribute float aLeaf;
attribute vec4 aS; // grow, wither, seed, _
varying vec3 vN;
varying float vLen;
varying float vLeaf;
varying float vGrow;
varying vec3 vWorld;
void main() {
  float grow = aS.x;
  vec3 p = position;
  // leaves unfurl as the vine passes them
  float lg = aLeaf > 0.5 ? smoothstep(aLen, aLen + 0.15, grow) : 1.0;
  p *= mix(1.0, lg, aLeaf);
  float sway = sin(uTime * 7.0 + aS.z * 20.0 + aLen * 6.0) * 0.03 * aLen * (1.0 - aS.y);
  p.x += sway;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  vN = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);
  vLen = aLen;
  vLeaf = aLeaf;
  vGrow = grow;
  vWorld = wp.xyz;
  #include <fog_vertex>
}
`;
const VINE_WRAP_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec3 vN;
varying float vLen;
varying float vLeaf;
varying float vGrow;
varying vec3 vWorld;
void main() {
  if (vLen > vGrow) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float ndl = max(dot(n, uSunDir), 0.0);
  vec3 base = mix(vec3(0.13, 0.36, 0.1), vec3(0.3, 0.78, 0.25), vLeaf * 0.8 + vLen * 0.3);
  vec3 col = base * (uSunColor * (0.35 + 0.65 * ndl) + uSkyColor * 0.4);
  // fresh growing tip glows with bloom paint
  float tip = smoothstep(0.12, 0.0, vGrow - vLen) * step(vLen, vGrow);
  col += vec3(0.35, 0.95, 0.4) * tip * 1.2;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;
export class VineWraps {
  mesh;
  aS;
  n = 0;
  m = new Matrix4();
  q = new Quaternion();
  s = new Vector3();
  e = new Euler();
  constructor(ctx, capacity) {
    const geometry = vineWrapGeometry();
    this.aS = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aS.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aS', this.aS);
    const material = new ShaderMaterial({
      uniforms: statusUniforms(ctx),
      vertexShader: VINE_WRAP_VERTEX,
      fragmentShader: VINE_WRAP_FRAGMENT,
      fog: true,
      side: DoubleSide,
    });
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'enemy-vines';
  }
  begin() {
    this.n = 0;
  }
  add(pos, facing, radius, height, grow, seed) {
    if (!(this.n >= this.mesh.instanceMatrix.count)) {
      this.e.set(0, facing + seed * 6.28, 0);
      this.q.setFromEuler(this.e);
      this.s.set(radius, height, radius);
      this.m.compose(pos, this.q, this.s);
      this.mesh.setMatrixAt(this.n, this.m);
      this.aS.setXYZW(this.n, grow, 0, seed, 0);
      this.n++;
    }
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.aS.needsUpdate = true;
    }
  }
}
