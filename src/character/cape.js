/**
 * The Sky Mantle cape: a painted-sky shader with stars, drifting clouds, a sunset hem and the gold sun crest, on a Verlet cloth hung from the shoulders that blows in the wind, billows on demand and collides with capsules around the hero's body.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { patchToonMaterial } from './toon-material.js';
const CAPE_LENGTH = 1;
const CAPE_GLSL = `
uniform float uCapeTime;
uniform float uCapeGlow;
varying vec2 vCapeUv;
varying vec3 vCapeAcross;
float capeH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float capeN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(capeH(i), capeH(i + vec2(1.0, 0.0)), u.x), mix(capeH(i + vec2(0.0, 1.0)), capeH(i + vec2(1.0, 1.0)), u.x), u.y);
}
float capeF(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * capeN(p); p = p * 2.07 + 11.3; a *= 0.5; } return s; }
vec3 capeSunset(float u) {
  vec3 a = vec3(1.0, 0.824, 0.369), b = vec3(1.0, 0.64, 0.36), c = vec3(1.0, 0.435, 0.47), d = vec3(0.79, 0.39, 0.72);
  u = clamp(u, 0.0, 1.0) * 3.0;
  return u < 1.0 ? mix(a, b, u) : u < 2.0 ? mix(b, c, u - 1.0) : mix(c, d, u - 2.0);
}
/** Sparse twinkling four-point stars. */
float capeStars(vec2 uv, vec2 dens, float t, float thresh) {
  vec2 g = uv * dens;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = capeH(id);
  if (h > thresh) return 0.0;
  vec2 o = (vec2(capeH(id + 3.1), capeH(id + 7.7)) - 0.5) * 0.5;
  vec2 d = f - o;
  float r = length(d);
  float tw = 0.5 + 0.5 * sin(t * (1.3 + h * 3.1) + h * 40.0);
  tw *= tw;
  float core = smoothstep(0.11, 0.0, r);
  float rays = smoothstep(0.035, 0.0, abs(d.x)) * smoothstep(0.32, 0.0, abs(d.y)) + smoothstep(0.035, 0.0, abs(d.y)) * smoothstep(0.32, 0.0, abs(d.x));
  return (core + rays * 0.55) * tw * (0.6 + h * 1.4);
}
const vec3 capeGold = vec3(0.95, 0.74, 0.28);
void capeShade(vec2 uv, bool outside, out vec3 col, out vec3 glow) {
  float t = uCapeTime;
  float u = uv.x, v = uv.y;
  float w = (capeF(uv * vec2(3.0, 4.0) + 2.0) - 0.5) * 0.12;
  // scalloped hem: gold piping follows the scallops
  float edge = 0.978 - 0.03 * abs(sin(u * 3.14159 * 6.0));
  float trim = max(smoothstep(0.03, 0.018, u), smoothstep(0.97, 0.982, u));
  trim = max(trim, smoothstep(edge - 0.024, edge - 0.012, v));
  if (outside) {
    // a painted sky from dawn at the shoulders to dusk at the hem
    vec3 top = vec3(0.93, 0.95, 0.97);
    vec3 pale = vec3(0.55, 0.78, 0.97);
    vec3 az = vec3(0.24, 0.5, 0.9);
    vec3 dusk = vec3(0.28, 0.3, 0.72);
    col = mix(top, pale, smoothstep(0.0, 0.26, v + w));
    col = mix(col, az, smoothstep(0.26, 0.56, v + w));
    col = mix(col, dusk, smoothstep(0.56, 0.76, v + w));
    // drifting painted clouds
    float cl = capeF(vec2(u * 3.4 + t * 0.025, v * 4.2 - t * 0.01));
    cl = smoothstep(0.5, 0.7, cl) * smoothstep(0.1, 0.3, v) * (1.0 - smoothstep(0.62, 0.74, v));
    col = mix(col, vec3(1.0, 0.99, 0.97), cl * 0.85);
    // the sunset band at the hem, with a gold line above it
    float hem = smoothstep(0.76, 0.8, v + w * 0.3);
    col = mix(col, capeSunset((v - 0.79) / 0.17 + w * 0.8), hem);
    trim = max(trim, smoothstep(0.011, 0.0, abs(v - 0.775 - w * 0.1)));
    // a slow sheen sweeping across the fabric (the mantle "breathes" light)
    float sh = fract(u * 0.55 - v * 0.35 - t * 0.09);
    float sheen = smoothstep(0.0, 0.08, sh) * smoothstep(0.2, 0.08, sh);
    col += vec3(0.1, 0.09, 0.06) * sheen * (1.0 - hem * 0.6);
    float st = capeStars(uv, vec2(15.0, 19.0), t, 0.36) * (1.0 - hem) * smoothstep(0.3, 0.6, v);
    glow = vec3(1.0, 0.95, 0.78) * st * 0.55;
    // the first painters' crest between the shoulders: an eight-pointed gold sun
    vec2 e = vec2((u - 0.5) * 0.5, v - 0.15);
    float er = length(e);
    float ea = atan(e.y, e.x);
    float rim = 0.047 + 0.03 * pow(abs(cos(ea * 4.0)), 10.0) + 0.012 * pow(abs(sin(ea * 4.0)), 10.0);
    float emb = smoothstep(rim + 0.003, rim - 0.002, er);
    float outl = smoothstep(rim + 0.011, rim + 0.005, er) * (1.0 - emb);
    col = mix(col, vec3(0.5, 0.34, 0.12), outl * 0.75);
    float core = smoothstep(0.024, 0.02, er);
    float ring = smoothstep(0.004, 0.0, abs(er - 0.031));
    col = mix(col, capeGold * (1.0 + 0.15 * sin(ea * 8.0 + t)), emb);
    col = mix(col, vec3(1.0, 0.96, 0.8), core * 0.75);
    col = mix(col, capeGold * 0.62, ring);
    glow += capeGold * emb * (0.1 + 0.06 * sin(t * 2.0));
  } else {
    // twilight lining: indigo to violet, a faint milky band and bright stars
    col = mix(vec3(0.1, 0.13, 0.33), vec3(0.23, 0.16, 0.4), v);
    float band = exp(-pow((u - 0.35 - v * 0.3 + w) * 3.2, 2.0)) * capeF(uv * vec2(6.0, 5.0));
    col += vec3(0.16, 0.14, 0.26) * band;
    col = mix(col, capeSunset(0.9), smoothstep(0.86, 0.97, v) * 0.45);
    float st = capeStars(uv, vec2(16.0, 20.0), t, 0.5) + capeStars(uv + 0.37, vec2(31.0, 37.0), t * 1.3, 0.3) * 0.6;
    glow = vec3(0.95, 0.93, 1.0) * st * 0.9;
  }
  col = mix(col, capeGold, trim);
  glow += capeGold * trim * 0.08;
  glow *= 1.0 + uCapeGlow * 2.0;
  glow += col * uCapeGlow * 0.35;
}
`;
export function createCapeMaterial(ctx) {
  const glow = {
    value: 0,
  };
  const material = new MeshStandardMaterial({
    roughness: 0.7,
    metalness: 0,
    side: DoubleSide,
    shadowSide: DoubleSide,
  });
  material.name = 'sky-mantle';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCapeTime = ctx.globals.uTime;
    shader.uniforms.uCapeGlow = glow;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aUv;
attribute vec3 aAcross;
varying vec2 vCapeUv;
varying vec3 vCapeAcross;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCapeUv = aUv;
        vCapeAcross = dot(aAcross, aAcross) > 1e-6 ? normalize(normalMatrix * aAcross) : vec3(0.0);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
` + CAPE_GLSL,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vCapeUv.y > 0.978 - 0.03 * abs(sin(vCapeUv.x * 3.14159 * 6.0))) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 wbCapeCol; vec3 wbCapeGlow;
        capeShade(vCapeUv, gl_FrontFacing, wbCapeCol, wbCapeGlow);
        diffuseColor.rgb = wbCapeCol;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // painted pleats: the normal rocks across the cloth in soft vertical folds, deeper at the hem
        {
          float pl = sin(vCapeUv.x * 31.4 + sin(vCapeUv.y * 3.0) * 1.2) * (0.18 + 0.32 * vCapeUv.y);
          normal = normalize(normal + vCapeAcross * pl);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight += wbCapeGlow;
#include <opaque_fragment>`,
      );
  };
  patchToonMaterial(material, ctx, {
    key: 'wb-sky-mantle-v1',
    translucency: 0.28,
    rim: 1.2,
  });
  return {
    material,
    glow,
  };
}
export const CAPE_ANCHORS = (() => {
  const points = [];
  for (let i = 0; i < 9; i++) {
    const angle = Math.PI * (0.69 + (i / 8) * 0.62);
    const x = 0.248 * Math.sin(angle);
    const z = -0.004 + 0.18000000000000002 * Math.cos(angle);
    points.push(new Vector3(x, 1.232 + 0.02 * Math.abs(Math.sin(angle)) ** 6, z));
  }
  return points;
})();
const _capeA = new Vector3();
const _capeB = new Vector3();
const _capeC = new Vector3();
const _capeD = new Vector3();
export class CapeCloth {
  ctx;
  mesh;
  mat;
  anchors = [];
  center = new Vector3();
  back = new Vector3(0, 0, -1);
  colliders = [];
  colliderCount = 0;
  groundY = -1000000000;
  n = 117;
  p;
  q;
  geo;
  pos;
  nrm;
  acr;
  la;
  lb;
  lr;
  ls;
  lw;
  lCount;
  init = false;
  time = 0;
  kick = new Vector3();
  kickPending = false;
  constructor(ctx) {
    this.ctx = ctx;
    this.p = new Float32Array(this.n * 3);
    this.q = new Float32Array(this.n * 3);
    for (let i = 0; i < 9; i++) this.anchors.push(new Vector3());
    const anchorGaps = [];
    for (let i = 0; i < 8; i++) anchorGaps.push(CAPE_ANCHORS[i].distanceTo(CAPE_ANCHORS[i + 1]));
    const downRest = (col) => (CAPE_LENGTH * (1 + 0.07 * (1 - ((col / 8) * 2 - 1) ** 2))) / 12;
    const acrossRest = (row, col) => anchorGaps[col] * (1 + 0.44999999999999996 * (row / 12) ** 0.85);
    const linkA = [];
    const linkB = [];
    const linkRest = [];
    const linkStiff = [];
    const linkWeight = [];
    const idx = (row, col) => row * 9 + col;
    const addLink = (ia, ib, rest, stiffness) => {
      linkA.push(ia);
      linkB.push(ib);
      linkRest.push(rest);
      linkStiff.push(stiffness);
      const aPinned = ia < 9;
      const bPinned = ib < 9;
      linkWeight.push(aPinned ? 0 : bPinned ? 1 : 0.5);
    };
    for (let i = 0; i < 13; i++)
      for (let j = 0; j < 9; j++) {
        if (j < 8 && i > 0) addLink(idx(i, j), idx(i, j + 1), acrossRest(i, j), 1);
        if (i < 12) addLink(idx(i, j), idx(i + 1, j), (downRest(j) + downRest(j)) / 2, 1);
        if (i < 12 && j < 8) {
          const across = (acrossRest(i, j) + acrossRest(i + 1, j)) / 2;
          const diag = Math.hypot(across, downRest(j));
          addLink(idx(i, j), idx(i + 1, j + 1), diag, 0.6);
          addLink(idx(i, j + 1), idx(i + 1, j), diag, 0.6);
        }
        if (i < 11) addLink(idx(i, j), idx(i + 2, j), downRest(j) * 2, 0.16);
        if (j < 7 && i > 0) addLink(idx(i, j), idx(i, j + 2), acrossRest(i, j) + acrossRest(i, j + 1), 0.1);
      }
    this.la = Int32Array.from(linkA);
    this.lb = Int32Array.from(linkB);
    this.lr = Float32Array.from(linkRest);
    this.ls = Float32Array.from(linkStiff);
    this.lw = Float32Array.from(linkWeight);
    this.lCount = linkA.length;
    this.geo = new BufferGeometry();
    this.pos = new BufferAttribute(new Float32Array(this.n * 3), 3);
    this.pos.setUsage(DynamicDrawUsage);
    this.nrm = new BufferAttribute(new Float32Array(this.n * 3), 3);
    this.nrm.setUsage(DynamicDrawUsage);
    this.acr = new BufferAttribute(new Float32Array(this.n * 3), 3);
    this.acr.setUsage(DynamicDrawUsage);
    const uvs = new Float32Array(this.n * 2);
    const indices = [];
    for (let i = 0; i < 13; i++)
      for (let j = 0; j < 9; j++) {
        uvs[idx(i, j) * 2] = j / 8;
        uvs[idx(i, j) * 2 + 1] = i / 12;
        if (i < 12 && j < 8) {
          const i00 = idx(i, j);
          const i01 = idx(i, j + 1);
          const i10 = idx(i + 1, j);
          const i11 = idx(i + 1, j + 1);
          indices.push(i00, i10, i01, i01, i10, i11);
        }
      }
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('normal', this.nrm);
    this.geo.setAttribute('aUv', new BufferAttribute(uvs, 2));
    this.geo.setAttribute('aAcross', this.acr);
    this.geo.setIndex(indices);
    this.mat = createCapeMaterial(ctx);
    this.mesh = new Mesh(this.geo, this.mat.material);
    this.mesh.name = 'hero-cape';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }
  reset() {
    this.init = false;
  }
  billow(x, y, z) {
    this.kick.set(x, y, z);
    this.kickPending = true;
  }
  layout() {
    const seg = CAPE_LENGTH / 12;
    for (let i = 0; i < 13; i++)
      for (let j = 0; j < 9; j++) {
        const anchor = this.anchors[j];
        _capeA.subVectors(anchor, this.center).setY(0);
        _capeB.copy(this.back).setY(0);
        if (_capeB.lengthSq() < 0.000001) _capeB.set(0, 0, -1);
        _capeB.normalize();
        const lateral = _capeA.x * -_capeB.z + _capeA.z * _capeB.x;
        const latX = -_capeB.z;
        const latZ = _capeB.x;
        const spread = lateral * 0.44999999999999996 * (i / 12);
        const off = (i * 9 + j) * 3;
        const x = anchor.x + _capeB.x * i * seg * 0.28 + latX * spread;
        const z = anchor.z + _capeB.z * i * seg * 0.28 + latZ * spread;
        const y = anchor.y - i * seg * 0.95;
        this.p[off] = this.q[off] = x;
        this.p[off + 1] = this.q[off + 1] = y;
        this.p[off + 2] = this.q[off + 2] = z;
      }
  }
  update(dt) {
    if (dt <= 0 || !this.mesh.visible) return;
    this.init ||= (this.layout(), true);
    const midAnchor = this.anchors[4];
    if (Math.hypot(this.p[12] - midAnchor.x, this.p[13] - midAnchor.y, this.p[14] - midAnchor.z) > 2) this.layout();
    const lowQuality = this.ctx.settings.quality === 'low';
    const substeps = lowQuality ? 1 : dt > 1 / 45 ? 3 : 2;
    const iterations = lowQuality ? 3 : 5;
    const h = Math.min(dt, 1 / 30) / substeps;
    for (let i = 0; i < substeps; i++) {
      this.time += h;
      this.step(h, iterations);
    }
    this.writeGeometry();
  }
  step(h2, iterations) {
    const cur = this.p;
    const old = this.q;
    const globals = this.ctx.globals;
    const uWindDir = globals.uWindDir.value;
    const uWindStrength = globals.uWindStrength.value;
    const time = this.time;
    const gust = 0.6 + 0.4 * Math.sin(time * 1.3) * Math.sin(time * 0.47 + 1);
    const windX = uWindDir.x * uWindStrength * 2.2 * gust;
    const windZ = uWindDir.y * uWindStrength * 2.2 * gust;
    const drag = 1.35;
    const normals = this.nrm.array;
    if (this.kickPending) {
      this.kickPending = false;
      for (let j = 1; j < 13; j++) {
        const amount = 0.35 + (j / 12) * 0.65;
        for (let k = 0; k < 9; k++) {
          const off = (j * 9 + k) * 3;
          old[off] -= this.kick.x * h2 * amount;
          old[off + 1] -= this.kick.y * h2 * amount;
          old[off + 2] -= this.kick.z * h2 * amount;
        }
      }
    }
    for (let i = 1; i < 13; i++) {
      const along = i / 12;
      for (let j = 0; j < 9; j++) {
        const off = (i * 9 + j) * 3;
        const px = cur[off];
        const py = cur[off + 1];
        const pz = cur[off + 2];
        const vx = (px - old[off]) / h2;
        const vy = (py - old[off + 1]) / h2;
        const vz = (pz - old[off + 2]) / h2;
        const relX = windX - vx;
        const relZ = windZ - vz;
        const relY = -vy;
        const relSpeed = Math.hypot(relX, relY, relZ);
        const nx = normals[off];
        const ny = normals[off + 1];
        const nz = normals[off + 2];
        const flutter = Math.sin(time * 9.5 - i * 0.85 + j * 0.55) * Math.min(relSpeed, 10) * 0.7 * along;
        const excess = relSpeed > 9 ? Math.min(relSpeed - 9, 22) : 0;
        const flap =
          flutter +
          (excess > 0 ? Math.sin(time * (13 + excess * 0.45) - i * 1.05 + j * 0.4) * excess * 1.25 * along : 0);
        const ax = relX * drag + nx * flap;
        const ay = -9.8 + relY * drag * 0.55 + ny * flap;
        const az = relZ * drag + nz * flap;
        const damping = 0.99;
        old[off] = px;
        old[off + 1] = py;
        old[off + 2] = pz;
        cur[off] = px + vx * h2 * damping + ax * h2 * h2;
        cur[off + 1] = py + vy * h2 * damping + ay * h2 * h2;
        cur[off + 2] = pz + vz * h2 * damping + az * h2 * h2;
      }
    }
    for (let i = 0; i < 9; i++) {
      const off = i * 3;
      const anchor = this.anchors[i];
      cur[off] = old[off] = anchor.x;
      cur[off + 1] = old[off + 1] = anchor.y;
      cur[off + 2] = old[off + 2] = anchor.z;
    }
    for (let i = 0; i < iterations; i++) {
      for (let j = 0; j < this.lCount; j++) this.link(this.la[j], this.lb[j], this.lr[j], this.lw[j], this.ls[j]);
      this.collide();
    }
  }
  link(ia, ib, rest, wa, stiffness) {
    const pos = this.p;
    const oa = ia * 3;
    const ob = ib * 3;
    const dx = pos[ob] - pos[oa];
    const dy = pos[ob + 1] - pos[oa + 1];
    const dz = pos[ob + 2] - pos[oa + 2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.000001;
    let k = ((len - rest) / len) * stiffness;
    if (stiffness < 0.5 && len > rest) k *= 0.2;
    const wb = 1 - wa;
    pos[oa] += dx * k * wa;
    pos[oa + 1] += dy * k * wa;
    pos[oa + 2] += dz * k * wa;
    pos[ob] -= dx * k * wb;
    pos[ob + 1] -= dy * k * wb;
    pos[ob + 2] -= dz * k * wb;
  }
  collide() {
    const colliders = this.colliders;
    const p = this.p;
    for (let i = 9; i < this.n; i++) {
      const off = i * 3;
      _capeA.set(p[off], p[off + 1], p[off + 2]);
      for (let j = 0; j < this.colliderCount; j++) {
        const cap = colliders[j];
        _capeB.subVectors(cap.b, cap.a);
        const lenSq = _capeB.lengthSq();
        let t2 = lenSq > 1e-8 ? _capeC.subVectors(_capeA, cap.a).dot(_capeB) / lenSq : 0;
        t2 = t2 < 0 ? 0 : t2 > 1 ? 1 : t2;
        _capeD.copy(cap.a).addScaledVector(_capeB, t2);
        _capeC.subVectors(_capeA, _capeD);
        const dist = _capeC.length();
        const minDist = cap.r + 0.014;
        if (dist < minDist) {
          if (dist < 0.00001) _capeC.subVectors(_capeA, this.center).setY(0).normalize();
          else _capeC.divideScalar(dist);
          _capeA.copy(_capeD).addScaledVector(_capeC, minDist);
        }
      }
      if (_capeA.y < this.groundY + 0.02) _capeA.y = this.groundY + 0.02;
      p[off] = _capeA.x;
      p[off + 1] = _capeA.y;
      p[off + 2] = _capeA.z;
    }
  }
  writeGeometry() {
    const posArr = this.pos.array;
    const nrmArr = this.nrm.array;
    const acrArr = this.acr.array;
    const pts = this.p;
    posArr.set(pts);
    for (let j = 0; j < 13; j++)
      for (let k = 0; k < 9; k++) {
        const j0 = Math.max(0, j - 1);
        const j1 = Math.min(12, j + 1);
        const k0 = Math.max(0, k - 1);
        const k1 = Math.min(8, k + 1);
        const above = (j0 * 9 + k) * 3;
        const below = (j1 * 9 + k) * 3;
        const before = (j * 9 + k0) * 3;
        const after = (j * 9 + k1) * 3;
        _capeA.set(pts[below] - pts[above], pts[below + 1] - pts[above + 1], pts[below + 2] - pts[above + 2]);
        _capeB.set(pts[after] - pts[before], pts[after + 1] - pts[before + 1], pts[after + 2] - pts[before + 2]);
        _capeC.crossVectors(_capeA, _capeB);
        const len = _capeC.length();
        if (len > 1e-8) _capeC.divideScalar(len);
        else _capeC.set(0, 0, -1);
        const off = (j * 9 + k) * 3;
        nrmArr[off] = _capeC.x;
        nrmArr[off + 1] = _capeC.y;
        nrmArr[off + 2] = _capeC.z;
        const acrossLen = _capeB.length() || 1;
        acrArr[off] = _capeB.x / acrossLen;
        acrArr[off + 1] = _capeB.y / acrossLen;
        acrArr[off + 2] = _capeB.z / acrossLen;
      }
    this.pos.needsUpdate = true;
    this.nrm.needsUpdate = true;
    this.acr.needsUpdate = true;
  }
}
