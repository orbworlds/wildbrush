/**
 * Meshes and shaders for the brush arts: comet-tailed fireballs, faceted ice lances, jiggling bounce orbs, ribbon trails, leafy vine lashes and their thorns, and the dashed line that previews an art's flight path. Also the colours, random helpers and scratch objects the art effects share.
 */
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { PALETTE } from '../core/config.js';
const PREMULT_BLEND = {
  transparent: true,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: 201,
  blendDstAlpha: 205,
};
const _fwd = new Vector3(0, 0, 1);
const _dir = new Vector3();
const _side = new Vector3();
const _lift = new Vector3();
const _worldUp = new Vector3();
const _leafOut = new Vector3();
const _leafDir = new Vector3();
const _leafSide = new Vector3();
const _leafBase = new Vector3();
const _leafNormal = new Vector3();
const FIREBALL_VERTEX = `
#include <wb_common>
uniform float uAge;
uniform float uSeed;
uniform float uTail;
uniform float uPulse;
varying vec3 vN;
varying vec3 vW;
varying vec3 vP;
varying float vBack;
void main() {
  vec3 p = normalize(position);
  float back = max(0.0, -p.z);
  // boiling surface: noise streams backward along the flight axis
  vec3 q = p * 2.8 + vec3(uSeed * 7.0, uSeed * 3.0, uAge * 9.0);
  float n = wbNoise3(q);
  float n2 = wbNoise3(p * 5.5 + vec3(uSeed * 11.0, 0.0, uAge * 15.0));
  float rad = 1.0 + (n - 0.5) * 0.26 + (n2 - 0.5) * 0.14 + uPulse;
  vec3 pos = p * rad;
  // comet: the back half is drawn out into tongues of flame
  float lick = pow(back, 1.4) * uTail * (0.5 + 1.3 * n * n2 * 2.0);
  pos.z -= lick;
  pos.xy *= 1.0 - 0.55 * pow(back, 1.6) * clamp(uTail, 0.0, 1.0);
  vec4 w = modelMatrix * vec4(pos, 1.0);
  vW = w.xyz;
  vP = p;
  vN = normalize(mat3(modelMatrix) * normalize(p + vec3(0.0, 0.0, -back * 0.7)));
  vBack = back;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FIREBALL_FRAGMENT = `
#include <wb_common>
uniform float uAge;
uniform float uSeed;
uniform float uFade;
uniform float uHeat;
varying vec3 vN;
varying vec3 vW;
varying vec3 vP;
varying float vBack;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float facing = abs(dot(normalize(vN), V));
  // flowing flame texture in object space (streams toward the tail)
  vec3 fp = vP * 3.2 + vec3(uSeed * 5.0, uSeed * 9.0, uAge * 7.0);
  float n = wbNoise3(fp);
  float n2 = wbNoise3(fp * 2.3 + 11.0);
  float fl = n * 0.65 + n2 * 0.35;
  float heat = facing * 1.05 - vBack * 0.7 + (fl - 0.5) * 0.75 + uHeat * 0.1;
  vec3 cOut = vec3(0.95, 0.2, 0.03);
  vec3 cMid = vec3(1.0, 0.36, 0.04) * 1.15;
  vec3 cCore = vec3(1.0, 0.6, 0.12) * 1.4;
  vec3 cHot = vec3(1.0, 0.85, 0.45) * 1.8;
  vec3 c = mix(cOut, cMid, smoothstep(0.22, 0.27, heat));
  c = mix(c, cCore, smoothstep(0.5, 0.55, heat));
  c = mix(c, cHot, smoothstep(0.86, 0.91, heat));
  // ragged, fading rim: flame tongues instead of a hard silhouette
  float edge = facing * 1.2 - vBack * 0.3 + (fl - 0.5) * 0.9;
  float a = smoothstep(0.02, 0.26, edge);
  a *= 1.0 - smoothstep(0.45, 0.8, vBack + (n2 - 0.5) * 0.6);
  a *= uFade * smoothstep(0.5, 1.4, length(cameraPosition - vW));
  if (a < 0.02) discard;
  gl_FragColor = vec4(c * a, a * 0.95);
}
`;
export class FireballMesh {
  mesh;
  mat;
  constructor(geometry, material) {
    this.mat = material.clone();
    this.mat.uniforms.uSeed.value = Math.random() * 10;
    this.mesh = new Mesh(geometry, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
  }
  static material(ctx) {
    return new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
        uAge: {
          value: 0,
        },
        uSeed: {
          value: 0,
        },
        uTail: {
          value: 1,
        },
        uPulse: {
          value: 0,
        },
        uFade: {
          value: 1,
        },
        uHeat: {
          value: 0,
        },
      },
      vertexShader: FIREBALL_VERTEX,
      fragmentShader: FIREBALL_FRAGMENT,
      ...PREMULT_BLEND,
    });
  }
  set(pos, dir, size, age, tail, fade) {
    const mesh = this.mesh;
    mesh.visible = true;
    mesh.position.copy(pos);
    if (dir.lengthSq() > 0.000001) mesh.quaternion.setFromUnitVectors(_fwd, _dir.copy(dir).normalize());
    mesh.scale.setScalar(size);
    const uniforms = this.mat.uniforms;
    uniforms.uAge.value = age;
    uniforms.uTail.value = tail;
    uniforms.uPulse.value = 0.06 * Math.sin(age * 31) + 0.04 * Math.sin(age * 53 + 1);
    uniforms.uFade.value = fade;
    uniforms.uHeat.value = Math.max(0, 1 - age * 4);
  }
  hide() {
    this.mesh.visible = false;
  }
}
const ICE_LANCE_VERTEX = `
#include <wb_common>
attribute float aFacet;
varying vec3 vN;
varying vec3 vW;
varying float vFacet;
varying float vZ;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vFacet = aFacet;
  vZ = position.z;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const ICE_LANCE_FRAGMENT = `
#include <wb_common>
uniform float uGlow;
varying vec3 vN;
varying vec3 vW;
varying float vFacet;
varying float vZ;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 2.0);
  float sun = max(dot(N, uSunDir), 0.0);
  // luminous glacier ice: pale facets, a cold inner light, white-hot edges
  vec3 deep = vec3(0.3, 0.66, 0.95);
  vec3 pale = vec3(0.8, 0.95, 1.05);
  vec3 c = mix(deep, pale, clamp(0.25 + 0.5 * vFacet + 0.3 * sun, 0.0, 1.0));
  c += vec3(0.25, 0.55, 0.9) * (0.5 + 0.5 * ndv) * (0.7 + 0.6 * smoothstep(-0.4, 0.9, vZ)) * uGlow;
  c += vec3(0.85, 0.97, 1.1) * fres * 1.8;
  vec3 H = normalize(uSunDir + V);
  c += pow(max(dot(N, H), 0.0), 60.0) * uSunColor * 3.0;
  // facet edges catch the light
  c += vec3(0.6, 0.85, 1.0) * smoothstep(0.85, 1.0, vFacet) * 0.35;
  gl_FragColor = vec4(c, 1.0);
}
`;
function addShard(positions, facets, profile, matrix, sides, phase) {
  const rings = [];
  for (const [z, radius] of profile) {
    const ring = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2 + phase;
      ring.push(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.86, z).applyMatrix4(matrix));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const ringA = rings[i];
    const ringB = rings[i + 1];
    for (let j = 0; j < sides; j++) {
      const next = (j + 1) % sides;
      const facet = 0.25 + 0.75 * Math.abs(Math.sin(j * 2.3 + i * 1.7 + phase * 3));
      const quad = [ringA[j], ringB[j], ringB[next], ringA[j], ringB[next], ringA[next]];
      for (const vert of quad) {
        positions.push(vert.x, vert.y, vert.z);
        facets.push(facet);
      }
    }
  }
}
export function createIceLanceGeometry() {
  const positions = [];
  const facets = [];
  addShard(
    positions,
    facets,
    [
      [1.05, 0],
      [0.55, 0.16],
      [0.35, 0.13],
      [-0.4, 0.1],
      [-0.72, 0],
    ],
    new Matrix4(),
    6,
    0,
  );
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.5;
    const radial = new Vector3(Math.cos(angle), Math.sin(angle) * 0.86, 0);
    const dir = new Vector3(0, 0, -1).multiplyScalar(0.9).addScaledVector(radial, 0.35).normalize();
    addShard(
      positions,
      facets,
      [
        [0.3, 0],
        [0.08, 0.05],
        [-0.02, 0.04],
        [-0.1, 0],
      ],
      new Matrix4().compose(
        new Vector3(0, 0, -0.22).addScaledVector(radial, 0.07),
        new Quaternion().setFromUnitVectors(_fwd, dir),
        new Vector3(1, 1, 1),
      ),
      5,
      angle,
    );
  }
  for (let i = 0; i < 2; i++) {
    const angle = i === 0 ? 1.9 : -1.2;
    const radial = new Vector3(Math.cos(angle), Math.sin(angle), 0);
    const dir = new Vector3(0, 0, 1).multiplyScalar(0.55).addScaledVector(radial, 0.8).normalize();
    addShard(
      positions,
      facets,
      [
        [0.2, 0],
        [0.05, 0.04],
        [-0.05, 0],
      ],
      new Matrix4().compose(
        new Vector3(0, 0, 0.3).addScaledVector(radial, 0.07),
        new Quaternion().setFromUnitVectors(_fwd, dir),
        new Vector3(1, 1, 1),
      ),
      4,
      angle,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aFacet', new Float32BufferAttribute(facets, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
export function createIceLanceMaterial(ctx) {
  return new ShaderMaterial({
    uniforms: {
      ...ctx.globals,
      uGlow: {
        value: 1,
      },
    },
    vertexShader: ICE_LANCE_VERTEX,
    fragmentShader: ICE_LANCE_FRAGMENT,
    ...PREMULT_BLEND,
  });
}
const BOUNCE_ORB_VERTEX = `
#include <wb_common>
uniform float uAge;
uniform float uJiggle;
varying vec3 vN;
varying vec3 vW;
varying vec3 vP;
void main() {
  vec3 p = position;
  float j = uJiggle;
  float wob = sin(p.y * 3.1 + uAge * 23.0) * 0.06 + sin(p.x * 3.7 - uAge * 19.0) * 0.05 + sin(p.z * 2.9 + uAge * 29.0) * 0.04;
  p += normal * wob * j;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vP = position;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const BOUNCE_ORB_FRAGMENT = `
#include <wb_common>
uniform float uAge;
uniform float uCharge;
varying vec3 vN;
varying vec3 vW;
varying vec3 vP;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 2.5);
  float wrap = dot(N, uSunDir) * 0.5 + 0.5;
  vec3 base = vec3(1.0, 0.78, 0.18) * 0.95;
  vec3 shade = vec3(0.9, 0.42, 0.06);
  vec3 c = mix(shade, base, smoothstep(0.3, 0.55, wrap));
  // a coiled spring spiralling inside the glass
  float ang = atan(vP.z, vP.x) / 6.2831853;
  float coil = fract(ang * 2.0 + vP.y * 1.6 - uAge * 2.4);
  float band = smoothstep(0.38, 0.46, coil) * (1.0 - smoothstep(0.54, 0.62, coil));
  c = mix(c, vec3(1.0, 0.95, 0.66) * 1.25, band * (0.55 + 0.45 * ndv));
  // inner glow, rim, a big glossy highlight
  c += vec3(1.0, 0.8, 0.3) * (1.0 - fres) * (0.12 + 0.35 * uCharge);
  c += vec3(1.0, 0.92, 0.6) * fres * 1.1;
  vec3 H = normalize(uSunDir + V);
  c += pow(max(dot(N, H), 0.0), 90.0) * vec3(1.0) * 2.5;
  float hl = smoothstep(0.93, 0.97, dot(N, normalize(V + vec3(-0.35, 0.45, 0.0))));
  c += hl * vec3(1.0) * 1.2;
  gl_FragColor = vec4(c, 1.0);
}
`;
export function createBounceOrbMaterial(ctx) {
  return new ShaderMaterial({
    uniforms: {
      ...ctx.globals,
      uAge: {
        value: 0,
      },
      uJiggle: {
        value: 1,
      },
      uCharge: {
        value: 0,
      },
    },
    vertexShader: BOUNCE_ORB_VERTEX,
    fragmentShader: BOUNCE_ORB_FRAGMENT,
    ...PREMULT_BLEND,
  });
}
const TRAIL_VERTEX = `
#include <wb_common>
attribute vec4 aColor;
attribute vec3 aInfo; // u (0 head → 1 tail), v (-1..1 across), style
varying vec4 vColor;
varying vec3 vInfo;
varying vec3 vW;
void main() {
  vColor = aColor;
  vInfo = aInfo;
  vW = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;
const TRAIL_FRAGMENT = `
#include <wb_common>
varying vec4 vColor;
varying vec3 vInfo;
varying vec3 vW;
void main() {
  float u = vInfo.x;
  float v = abs(vInfo.y);
  float style = vInfo.z;
  float edge = 1.0 - smoothstep(0.55, 1.0, v);
  float core = 1.0 - smoothstep(0.0, 0.45, v);
  float a = edge * vColor.a;
  vec3 c = vColor.rgb * (1.0 + core * 1.3);
  float occl = 0.0;
  if (style > 0.5 && style < 1.5) {
    // frost: breaks into dry-brush streaks toward the tail
    float n = wbNoise2(vec2(u * 9.0 + uTime * 0.5, vInfo.y * 3.5 + 7.0));
    a *= smoothstep(u * 0.9, u * 0.9 + 0.25, n + 0.15);
    occl = 0.25;
  } else if (style > 1.5) {
    // spring: a candy stripe
    float s = step(0.5, fract(u * 6.0 - uTime * 3.0));
    c = mix(c, vec3(1.0, 0.98, 0.8) * 2.0, s * core * 0.6);
    occl = 0.35;
  }
  if (a < 0.004) discard;
  gl_FragColor = vec4(c * a, a * occl);
}
`;
const MAX_TRAILS = 12;
const TRAIL_POINTS = 28;
export class RibbonTrails {
  mesh;
  trails = [];
  pos;
  col;
  info;
  geo;
  constructor(ctx) {
    for (let i = 0; i < MAX_TRAILS; i++)
      this.trails.push({
        alive: false,
        live: false,
        n: 0,
        pts: new Float32Array(84),
        ages: new Float32Array(TRAIL_POINTS),
        width: 0.3,
        life: 0.3,
        r: 1,
        g: 1,
        b: 1,
        alpha: 1,
        style: 0,
        minStep: 0.3,
      });
    this.geo = new BufferGeometry();
    this.pos = new BufferAttribute(new Float32Array(2016), 3).setUsage(DynamicDrawUsage);
    this.col = new BufferAttribute(new Float32Array(2688), 4).setUsage(DynamicDrawUsage);
    this.info = new BufferAttribute(new Float32Array(2016), 3).setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('aColor', this.col);
    this.geo.setAttribute('aInfo', this.info);
    const indices = [];
    for (let i = 0; i < MAX_TRAILS; i++)
      for (let j = 0; j < 27; j++) {
        const base = (i * TRAIL_POINTS + j) * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    this.geo.setIndex(indices);
    this.geo.setDrawRange(0, 0);
    const material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
      },
      vertexShader: TRAIL_VERTEX,
      fragmentShader: TRAIL_FRAGMENT,
      side: DoubleSide,
      ...PREMULT_BLEND,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }
  begin(width, life, red, green, blue, alpha, style, minStep = 0.25) {
    let slot = -1;
    for (let i = 0; i < MAX_TRAILS; i++)
      if (!this.trails[i].alive) {
        slot = i;
        break;
      }
    if (slot < 0) return -1;
    const trail = this.trails[slot];
    Object.assign(trail, {
      alive: true,
      live: true,
      n: 0,
      width,
      life,
      r: red,
      g: green,
      b: blue,
      alpha,
      style,
      minStep,
    });
    return slot;
  }
  push(id, point) {
    const trail = this.trails[id];
    if (!trail || !trail.alive || !trail.live) return;
    const pts = trail.pts;
    if (trail.n > 0) {
      const dx = point.x - pts[0];
      const dy = point.y - pts[1];
      const dz = point.z - pts[2];
      if (trail.n > 1 && dx * dx + dy * dy + dz * dz < trail.minStep * trail.minStep) {
        pts[0] = point.x;
        pts[1] = point.y;
        pts[2] = point.z;
        trail.ages[0] = 0;
        return;
      }
    }
    const kept = Math.min(trail.n, 27);
    pts.copyWithin(3, 0, kept * 3);
    trail.ages.copyWithin(1, 0, kept);
    pts[0] = point.x;
    pts[1] = point.y;
    pts[2] = point.z;
    trail.ages[0] = 0;
    trail.n = kept + 1;
  }
  end(id) {
    const trail = this.trails[id];
    if (trail) trail.live = false;
  }
  update(dt, camPos) {
    const posArr = this.pos.array;
    const colArr = this.col.array;
    const infoArr = this.info.array;
    let drawCount = 0;
    for (let i = 0; i < MAX_TRAILS; i++) {
      const trail = this.trails[i];
      const base = i * TRAIL_POINTS * 2;
      if (!trail.alive) {
        for (let j = 0; j < 56; j++) colArr[(base + j) * 4 + 3] = 0;
        continue;
      }
      for (let j = 0; j < trail.n; j++) trail.ages[j] += dt;
      for (; trail.n > 0 && trail.ages[trail.n - 1] > trail.life;) trail.n--;
      if (trail.n === 0 && !trail.live) {
        trail.alive = false;
        for (let j = 0; j < 56; j++) colArr[(base + j) * 4 + 3] = 0;
        continue;
      }
      const pts = trail.pts;
      for (let j = 0; j < TRAIL_POINTS; j++) {
        const pIdx = (base + j * 2) * 3;
        const cIdx = (base + j * 2) * 4;
        if (j >= trail.n || trail.n < 2) {
          colArr[cIdx + 3] = 0;
          colArr[cIdx + 7] = 0;
          const src = Math.max(0, Math.min(trail.n - 1, j)) * 3;
          posArr[pIdx] = posArr[pIdx + 3] = pts[src];
          posArr[pIdx + 1] = posArr[pIdx + 4] = pts[src + 1];
          posArr[pIdx + 2] = posArr[pIdx + 5] = pts[src + 2];
          continue;
        }
        const prev = Math.max(0, j - 1) * 3;
        const next = Math.min(trail.n - 1, j + 1) * 3;
        const tx = pts[prev] - pts[next];
        const ty = pts[prev + 1] - pts[next + 1];
        const tz = pts[prev + 2] - pts[next + 2];
        const px = pts[j * 3];
        const py = pts[j * 3 + 1];
        const pz = pts[j * 3 + 2];
        const vx = camPos.x - px;
        const vy = camPos.y - py;
        const vz = camPos.z - pz;
        let sx = ty * vz - tz * vy;
        let sy = tz * vx - tx * vz;
        let sz = tx * vy - ty * vx;
        const len = Math.hypot(sx, sy, sz) || 1;
        const u = j / Math.max(1, trail.n - 1);
        const lifeLeft = 1 - trail.ages[j] / trail.life;
        const halfW = trail.width * (0.25 + 0.75 * (1 - u) ** 0.7) * (0.5 + 0.5 * lifeLeft);
        sx = (sx / len) * halfW;
        sy = (sy / len) * halfW;
        sz = (sz / len) * halfW;
        posArr[pIdx] = px + sx;
        posArr[pIdx + 1] = py + sy;
        posArr[pIdx + 2] = pz + sz;
        posArr[pIdx + 3] = px - sx;
        posArr[pIdx + 4] = py - sy;
        posArr[pIdx + 5] = pz - sz;
        const alpha = trail.alpha * lifeLeft * lifeLeft * (j === 0 ? 0.6 : 1);
        for (let k = 0; k < 2; k++) {
          const ci = cIdx + k * 4;
          colArr[ci] = trail.r;
          colArr[ci + 1] = trail.g;
          colArr[ci + 2] = trail.b;
          colArr[ci + 3] = alpha;
          const ii = (base + j * 2 + k) * 3;
          infoArr[ii] = u;
          infoArr[ii + 1] = k === 0 ? 1 : -1;
          infoArr[ii + 2] = trail.style;
        }
      }
      drawCount = (i + 1) * 27 * 6;
    }
    this.geo.setDrawRange(0, drawCount);
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
    this.info.needsUpdate = true;
    this.mesh.visible = drawCount > 0;
  }
}
const VINE_SEGMENTS = 40;
const VINE_SIDES = 6;
const VINE_LEAVES = 16;
const VINE_VERTEX = `
#include <wb_common>
attribute vec3 aInfo; // kind (0 tube, 1 leaf), u / leaf x, v / leaf y
varying vec3 vN;
varying vec3 vW;
varying vec3 vInfo;
void main() {
  vN = normal;
  vW = position;
  vInfo = aInfo;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;
const VINE_FRAGMENT = `
#include <wb_common>
uniform float uFade;
uniform float uFlash;
varying vec3 vN;
varying vec3 vW;
varying vec3 vInfo;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  if (dot(N, V) < 0.0) N = -N;
  float wrap = dot(N, uSunDir) * 0.5 + 0.5;
  vec3 light = uSkyColor * 0.55 + uSunColor * 0.9 * smoothstep(0.25, 0.6, wrap);
  vec3 c;
  if (vInfo.x < 0.5) {
    // twisted stem: two greens spiralling, a living glow along it
    float s = fract(vInfo.y * 7.0 + vInfo.z);
    vec3 dark = vec3(0.16, 0.46, 0.12);
    vec3 lite = vec3(0.42, 0.85, 0.28);
    c = mix(dark, lite, smoothstep(0.3, 0.45, s) * (1.0 - smoothstep(0.7, 0.85, s)));
    c *= light;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
    c += vec3(0.35, 0.95, 0.3) * rim * 0.9 + vec3(0.1, 0.3, 0.06);
  } else {
    vec2 p = vInfo.yz;
    float y = p.y;
    float w = 0.55 * sqrt(max(0.0, 1.0 - y * y)) * (1.0 - 0.2 * y);
    if (abs(p.x) > w) discard;
    float rib = 1.0 - smoothstep(0.0, 0.08, abs(p.x));
    c = mix(vec3(0.2, 0.62, 0.16), vec3(0.46, 0.86, 0.3), 0.5 + 0.5 * y);
    c = mix(c, c * 0.6, rib * 0.6);
    c *= light;
    c += vec3(0.25, 0.6, 0.15) * pow(1.0 - abs(dot(N, V)), 2.0) * 0.6;
  }
  c += vec3(0.6, 1.4, 0.5) * uFlash;
  gl_FragColor = vec4(c, 1.0);
  if (uFade < 0.999) {
    // wither: dissolve from the tip back
    float n = wbNoise2(vW.xz * 7.0 + vW.y * 3.0);
    if (n > uFade) discard;
  }
}
`;
export class VineMesh {
  mesh;
  geo;
  pos;
  nrm;
  info;
  mat;
  P = [];
  T = [];
  N = [];
  Bn = [];
  leafU = [];
  leafA = [];
  leafS = [];
  constructor(ctx) {
    this.geo = new BufferGeometry();
    this.pos = new BufferAttribute(new Float32Array(930), 3).setUsage(DynamicDrawUsage);
    this.nrm = new BufferAttribute(new Float32Array(930), 3).setUsage(DynamicDrawUsage);
    this.info = new BufferAttribute(new Float32Array(930), 3);
    const info = this.info.array;
    for (let i = 0; i <= VINE_SEGMENTS; i++)
      for (let j = 0; j < VINE_SIDES; j++) {
        const i3 = (i * VINE_SIDES + j) * 3;
        info[i3] = 0;
        info[i3 + 1] = i / VINE_SEGMENTS;
        info[i3 + 2] = j / VINE_SIDES;
      }
    for (let i = 0; i < VINE_LEAVES; i++) {
      const base = 246 + i * 4;
      const corners = [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ];
      for (let j = 0; j < 4; j++) {
        const i3 = (base + j) * 3;
        info[i3] = 1;
        info[i3 + 1] = corners[j][0];
        info[i3 + 2] = corners[j][1];
      }
      this.leafU.push(0.1 + (i / VINE_LEAVES) * 0.85 + (Math.random() - 0.5) * 0.03);
      this.leafA.push(i * 2.4 + Math.random() * 0.6);
      this.leafS.push(0.75 + Math.random() * 0.5);
    }
    const indices = [];
    for (let i = 0; i < VINE_SEGMENTS; i++)
      for (let j = 0; j < VINE_SIDES; j++) {
        const a0 = i * VINE_SIDES + j;
        const b0 = i * VINE_SIDES + ((j + 1) % VINE_SIDES);
        const a1 = a0 + VINE_SIDES;
        const b1 = b0 + VINE_SIDES;
        indices.push(a0, a1, b0, b0, a1, b1);
      }
    for (let i = 0; i < VINE_LEAVES; i++) {
      const base = 246 + i * 4;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    this.geo.setIndex(indices);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('normal', this.nrm);
    this.geo.setAttribute('aInfo', this.info);
    this.mat = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
        uFade: {
          value: 1,
        },
        uFlash: {
          value: 0,
        },
      },
      vertexShader: VINE_VERTEX,
      fragmentShader: VINE_FRAGMENT,
      side: DoubleSide,
    });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.castShadow = false;
    for (let i = 0; i <= VINE_SEGMENTS; i++) {
      this.P.push(new Vector3());
      this.T.push(new Vector3());
      this.N.push(new Vector3());
      this.Bn.push(new Vector3());
    }
  }
  set(from, to, amp, phase, sag, grow, thickness, fade, flash) {
    const dir = _dir.subVectors(to, from);
    const len = dir.length();
    if (len < 0.001) {
      this.mesh.visible = false;
      return;
    }
    dir.divideScalar(len);
    const side = _side.set(-dir.z, 0, dir.x);
    if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
    side.normalize();
    const lift = _lift.crossVectors(side, dir).normalize();
    const pts = this.P;
    const waves = Math.min(3.5, 1.2 + len * 0.12);
    for (let i = 0; i <= VINE_SEGMENTS; i++) {
      const u = i / VINE_SEGMENTS;
      const env = Math.sin(Math.PI * Math.min(1, u * 1.02)) ** 0.8;
      const sway = Math.sin(u * Math.PI * 2 * waves - phase) * amp * env;
      const bob = Math.sin(u * Math.PI * 2 * waves * 0.7 - phase * 1.3 + 1.3) * amp * 0.45 * env;
      pts[i]
        .copy(from)
        .addScaledVector(dir, len * u)
        .addScaledVector(side, sway)
        .addScaledVector(lift, bob - sag * Math.sin(Math.PI * u));
    }
    const up = _worldUp.set(0, 1, 0);
    for (let i = 0; i <= VINE_SEGMENTS; i++) {
      const prev = Math.max(0, i - 1);
      const next = Math.min(VINE_SEGMENTS, i + 1);
      const tangent = this.T[i].subVectors(pts[next], pts[prev]);
      if (tangent.lengthSq() < 1e-8) tangent.copy(dir);
      tangent.normalize();
      const normal = this.N[i].crossVectors(tangent, Math.abs(tangent.y) > 0.95 ? side : up);
      if (normal.lengthSq() < 1e-8) normal.copy(side);
      normal.normalize();
      this.Bn[i].crossVectors(tangent, normal).normalize();
    }
    const posArr = this.pos.array;
    const nrmArr = this.nrm.array;
    const radius = 0.1 * thickness;
    for (let i = 0; i <= VINE_SEGMENTS; i++) {
      const t = i / VINE_SEGMENTS;
      let ringR = radius * (1 - 0.55 * t) * (t > 0.93 ? Math.max(0, (1 - t) / 0.07) : 1);
      ringR *= 1 + 0.35 * Math.exp(-(((t - 0.88) / 0.035) ** 2));
      for (let j = 0; j < VINE_SIDES; j++) {
        const angle = (j / VINE_SIDES) * Math.PI * 2 + t * 9;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const nx = this.N[i].x * cos + this.Bn[i].x * sin;
        const ny = this.N[i].y * cos + this.Bn[i].y * sin;
        const nz = this.N[i].z * cos + this.Bn[i].z * sin;
        const i3 = (i * VINE_SIDES + j) * 3;
        posArr[i3] = pts[i].x + nx * ringR;
        posArr[i3 + 1] = pts[i].y + ny * ringR;
        posArr[i3 + 2] = pts[i].z + nz * ringR;
        nrmArr[i3] = nx;
        nrmArr[i3 + 1] = ny;
        nrmArr[i3 + 2] = nz;
      }
    }
    for (let i = 0; i < VINE_LEAVES; i++) {
      const leafU = this.leafU[i];
      const seg = Math.min(VINE_SEGMENTS, Math.round(leafU * VINE_SEGMENTS));
      const grown = Math.max(0, Math.min(1, (grow - leafU * 0.6) * 3));
      const size = this.leafS[i] * grown * thickness;
      const angle = this.leafA[i];
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const out = _leafOut.set(
        this.N[seg].x * cos + this.Bn[seg].x * sin,
        this.N[seg].y * cos + this.Bn[seg].y * sin,
        this.N[seg].z * cos + this.Bn[seg].z * sin,
      );
      const tangent = this.T[seg];
      const leafDir = _leafDir.copy(out).multiplyScalar(0.8).addScaledVector(tangent, -0.45).normalize();
      const leafSide = _leafSide.crossVectors(leafDir, tangent).normalize();
      const base = _leafBase.copy(pts[seg]).addScaledVector(out, radius * 0.7);
      const leafLen = 0.4 * size;
      const halfW = 0.2 * size;
      const leafNormal = _leafNormal.crossVectors(leafDir, leafSide).normalize();
      for (let j = 0; j < 4; j++) {
        const across = j === 0 || j === 2 ? -halfW : halfW;
        const along = j >= 2 ? leafLen : 0;
        const i3 = (246 + i * 4 + j) * 3;
        posArr[i3] = base.x + leafSide.x * across + leafDir.x * along;
        posArr[i3 + 1] = base.y + leafSide.y * across + leafDir.y * along;
        posArr[i3 + 2] = base.z + leafSide.z * across + leafDir.z * along;
        nrmArr[i3] = leafNormal.x;
        nrmArr[i3 + 1] = leafNormal.y;
        nrmArr[i3 + 2] = leafNormal.z;
      }
    }
    this.pos.needsUpdate = true;
    this.nrm.needsUpdate = true;
    this.mat.uniforms.uFade.value = fade;
    this.mat.uniforms.uFlash.value = flash;
    this.mesh.visible = fade > 0.01;
  }
  pointAt(u, out) {
    const idx = Math.max(0, Math.min(VINE_SEGMENTS, Math.round(u * VINE_SEGMENTS)));
    return out.copy(this.P[idx]);
  }
  hide() {
    this.mesh.visible = false;
  }
}
export function createThornGeometry() {
  const positions = [];
  const colors = [];
  const indices = [];
  const baseColor = new Color(0x3f7a26);
  const tipColor = new Color(0xe8e0a8);
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    const radius = 0.12 * (1 - t) ** 1.2 + 0.003;
    const y = t * 0.7;
    const bend = 0.2 * t * t;
    const col = baseColor.clone().lerp(tipColor, t ** 1.6);
    for (let j = 0; j < 6; j++) {
      const angle = (j / 6) * Math.PI * 2;
      positions.push(bend + Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      colors.push(col.r, col.g, col.b);
    }
  }
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 6; j++) {
      const v0 = i * 6 + j;
      const v1 = i * 6 + ((j + 1) % 6);
      indices.push(v0, v1, v0 + 6, v1, v1 + 6, v0 + 6);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
const TRAJECTORY_VERTEX = `
#include <wb_common>
attribute vec2 aInfo; // along (m), across (-1..1)
varying vec2 vInfo;
varying float vCam;
void main() {
  vInfo = aInfo;
  vCam = length(cameraPosition - position);
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;
const TRAJECTORY_FRAGMENT = `
#include <wb_common>
uniform vec3 uColor;
uniform float uAlpha;
uniform float uLen;
uniform float uDash;
varying vec2 vInfo;
varying float vCam;
void main() {
  float s = vInfo.x;
  float v = abs(vInfo.y);
  float dash = fract(s / uDash - uTime * 2.2);
  float a = smoothstep(0.0, 0.08, dash) * (1.0 - smoothstep(0.5, 0.62, dash));
  a *= 1.0 - smoothstep(0.45, 1.0, v);
  a *= smoothstep(0.0, 1.2, s) * (1.0 - smoothstep(uLen - 1.5, uLen, s) * 0.5);
  a *= uAlpha * smoothstep(1.2, 3.0, vCam);
  if (a < 0.004) discard;
  vec3 c = uColor * (1.2 + 1.2 * (1.0 - v));
  gl_FragColor = vec4(c * a, a * 0.35);
}
`;
const TRAJECTORY_POINTS = 64;
export class TrajectoryPreview {
  mesh;
  geo;
  pos;
  info;
  mat;
  shown = false;
  constructor(ctx) {
    this.geo = new BufferGeometry();
    this.pos = new BufferAttribute(new Float32Array(384), 3).setUsage(DynamicDrawUsage);
    this.info = new BufferAttribute(new Float32Array(256), 2).setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('aInfo', this.info);
    const indices = [];
    for (let i = 0; i < 63; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    this.geo.setIndex(indices);
    this.mat = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
        uColor: {
          value: new Color(),
        },
        uAlpha: {
          value: 1,
        },
        uLen: {
          value: 10,
        },
        uDash: {
          value: 0.9,
        },
      },
      vertexShader: TRAJECTORY_VERTEX,
      fragmentShader: TRAJECTORY_FRAGMENT,
      side: DoubleSide,
      ...PREMULT_BLEND,
      depthTest: false,
    });
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
  }
  show(pts, count, color, alpha, width, camPos) {
    count = Math.min(count, TRAJECTORY_POINTS);
    if (count < 2) {
      this.mesh.visible = false;
      return;
    }
    const posArr = this.pos.array;
    const infoArr = this.info.array;
    let along = 0;
    for (let i = 0; i < TRAJECTORY_POINTS; i++) {
      const idx = Math.min(i, count - 1);
      const prev = Math.max(0, idx - 1) * 3;
      const next = Math.min(count - 1, idx + 1) * 3;
      const px = pts[idx * 3];
      const py = pts[idx * 3 + 1];
      const pz = pts[idx * 3 + 2];
      if (i > 0 && i < count)
        along += Math.hypot(px - pts[(idx - 1) * 3], py - pts[(idx - 1) * 3 + 1], pz - pts[(idx - 1) * 3 + 2]);
      const tx = pts[next] - pts[prev];
      const ty = pts[next + 1] - pts[prev + 1];
      const tz = pts[next + 2] - pts[prev + 2];
      const vx = camPos.x - px;
      const vy = camPos.y - py;
      const vz = camPos.z - pz;
      let sx = ty * vz - tz * vy;
      let sy = tz * vx - tx * vz;
      let sz = tx * vy - ty * vx;
      const len = Math.hypot(sx, sy, sz) || 1;
      const halfW = width * Math.max(0.6, Math.min(2.2, Math.hypot(vx, vy, vz) * 0.08));
      sx = (sx / len) * halfW;
      sy = (sy / len) * halfW;
      sz = (sz / len) * halfW;
      const pIdx = i * 6;
      posArr[pIdx] = px + sx;
      posArr[pIdx + 1] = py + sy;
      posArr[pIdx + 2] = pz + sz;
      posArr[pIdx + 3] = px - sx;
      posArr[pIdx + 4] = py - sy;
      posArr[pIdx + 5] = pz - sz;
      infoArr[i * 4] = along;
      infoArr[i * 4 + 1] = 1;
      infoArr[i * 4 + 2] = along;
      infoArr[i * 4 + 3] = -1;
    }
    this.pos.needsUpdate = true;
    this.info.needsUpdate = true;
    this.mat.uniforms.uColor.value.copy(color);
    this.mat.uniforms.uAlpha.value = alpha;
    this.mat.uniforms.uLen.value = Math.max(1, along);
    this.mesh.visible = true;
    this.shown = true;
  }
  endFrame() {
    if (!this.shown) this.mesh.visible = false;
    this.shown = false;
  }
}
export function quatFromDir(dir, out) {
  _dir.copy(dir);
  return _dir.lengthSq() < 1e-8 ? out.identity() : out.setFromUnitVectors(_fwd, _dir.normalize());
}
export const MAX_PROJECTILES = 12;
export const ART_TAU = Math.PI * 2;
export const rand = Math.random;
export const randRange = (min, max) => min + (max - min) * rand();
export const _v1 = new Vector3();
export const _v2 = new Vector3();
export const _v3 = new Vector3();
export const _basisU = new Vector3();
export const _basisV = new Vector3();
export const _thornMatrix = new Matrix4();
export const _alignQuat = new Quaternion();
export const _thornScale = new Vector3();
export const _greyColor = new Color();
export const _yAxis = new Vector3(0, 1, 0);
export const _zAxis = new Vector3(0, 0, 1);
export const _yawQuat = new Quaternion();
export const _tiltQuat = new Quaternion();
export const _thornQuat = new Quaternion();
export const PAINT_COLORS = {
  red: new Color(PALETTE.red.hex),
  blue: new Color(PALETTE.blue.hex),
  yellow: new Color(PALETTE.yellow.hex),
  green: new Color(PALETTE.green.hex),
};
export function orthoBasis(dir, outU, outV) {
  outU.set(dir.y, -dir.x, 0);
  if (outU.lengthSq() < 0.0001) outU.set(0, dir.z, -dir.y);
  outU.normalize();
  outV.crossVectors(dir, outU).normalize();
}
