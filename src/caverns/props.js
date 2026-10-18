/**
 * Carved stone props built from lathe and primitive shapes: braziers, the round brazier door with gem sockets, hint stones, the lantern altar, the Spring spiral and the root tangle, plus the ink veil material.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix3,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { taperedTube } from '../shared/util.js';
import { boulderGeometry } from './deco.js';
const _stonePos = new Vector3();
const _stoneNrm = new Vector3();
const _stoneNrmMat = new Matrix3();
export class StoneBuilder {
  pos = [];
  nrm = [];
  col = [];
  emit = [];
  idx = [];
  add(geo, matrix, color, emit = 0) {
    const rgb = color instanceof Color ? color : new Color(color);
    if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const position = geo.getAttribute('position');
    const normal = geo.getAttribute('normal');
    _stoneNrmMat.getNormalMatrix(matrix);
    const base = this.pos.length / 3;
    for (let i = 0; i < position.count; i++) {
      _stonePos.fromBufferAttribute(position, i).applyMatrix4(matrix);
      _stoneNrm.fromBufferAttribute(normal, i).applyMatrix3(_stoneNrmMat).normalize();
      this.pos.push(_stonePos.x, _stonePos.y, _stonePos.z);
      this.nrm.push(_stoneNrm.x, _stoneNrm.y, _stoneNrm.z);
      this.col.push(rgb.r, rgb.g, rgb.b);
      this.emit.push(emit);
    }
    if (geo.index) {
      const array = geo.index.array;
      for (let i = 0; i < array.length; i++) this.idx.push(array[i] + base);
    } else for (let i = 0; i < position.count; i++) this.idx.push(base + i);
    geo.dispose();
  }
  get empty() {
    return this.pos.length === 0;
  }
  geometry() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    geometry.setAttribute('aEmit', new Float32BufferAttribute(this.emit, 1));
    geometry.setIndex(this.idx);
    geometry.computeBoundingSphere();
    return geometry;
  }
}
const trs = (x, y, z, rx = 0, ry = 0, rz = 0, scale = 1) =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'YXZ')),
    typeof scale == 'number' ? new Vector3(scale, scale, scale) : scale,
  );
const STONE = 9406332;
const STONE_DARK = 7300959;
const STONE_LIGHT = 11840152;
function lathe(profile, segments = 16) {
  const geometry = new LatheGeometry(
    profile.map(([r, y]) => new Vector2(Math.max(0.001, r), y)),
    segments,
  );
  geometry.deleteAttribute('uv');
  return geometry;
}
export const BRAZIER_BOWL_Y = 1.32;
export function addBrazier(stones, pos, yaw, seed) {
  const matrix = trs(pos.x, pos.y, pos.z, 0, yaw, 0);
  stones.add(
    lathe(
      [
        [0, 0],
        [0.62, 0],
        [0.64, 0.08],
        [0.56, 0.2],
        [0.42, 0.26],
        [0.3, 0.3],
      ],
      12,
    ),
    matrix,
    STONE_DARK,
  );
  stones.add(
    lathe(
      [
        [0.3, 0.28],
        [0.24, 0.5],
        [0.21, 0.8],
        [0.24, 0.98],
        [0.32, 1.06],
      ],
      10,
    ),
    matrix,
    STONE,
  );
  stones.add(
    lathe(
      [
        [0.32, 1.04],
        [0.5, 1.12],
        [0.7, 1.28],
        [0.82, 1.42],
        [0.84, 1.5],
        [0.76, 1.52],
        [0.64, 1.42],
        [0.4, 1.3],
        [0.001, 1.26],
      ],
      16,
    ),
    matrix,
    STONE_LIGHT,
  );
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.4;
    const spike = new ConeGeometry(0.1, 0.34, 5);
    stones.add(
      spike,
      trs(
        pos.x + Math.cos(ang + yaw) * 0.8,
        pos.y + 1.52,
        pos.z + Math.sin(ang + yaw) * 0.8,
        0.5 * Math.sin(ang),
        0,
        -0.5 * Math.cos(ang),
      ),
      STONE,
    );
  }
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + seed;
    const rad = i === 0 ? 0 : 0.34;
    const coal = boulderGeometry(0.15 + (i % 3) * 0.03, seed + i, 0.7);
    stones.add(
      coal,
      trs(pos.x + Math.cos(ang) * rad, pos.y + BRAZIER_BOWL_Y + 0.06, pos.z + Math.sin(ang) * rad),
      6956050,
      1,
    );
  }
}
export function buildDoor(radius) {
  const stones = new StoneBuilder();
  const slab = new CylinderGeometry(radius, radius, 0.7, 36, 1);
  slab.rotateX(Math.PI / 2);
  stones.add(slab, new Matrix4(), STONE);
  for (const side of [1, -1]) {
    for (const [ringR, tubeR] of [
      [radius * 0.93, 0.13],
      [radius * 0.62, 0.1],
      [radius * 0.3, 0.09],
    ]) {
      const ring = new TorusGeometry(ringR, tubeR, 6, 40);
      stones.add(ring, trs(0, 0, side * 0.36), STONE_LIGHT);
    }
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const rib = new BoxGeometry(0.16, radius * 0.26, 0.12);
      stones.add(
        rib,
        trs(Math.cos(ang) * radius * 0.46, Math.sin(ang) * radius * 0.46, side * 0.37, 0, 0, ang - Math.PI / 2),
        STONE_LIGHT,
      );
    }
  }
  const gems = [];
  for (let i = 0; i < 3; i++) {
    const ang = Math.PI / 2 + ((i - 1) * Math.PI * 2) / 3;
    gems.push(new Vector3(Math.cos(ang) * radius * 0.46, Math.sin(ang) * radius * 0.46, 0.42));
  }
  return {
    door: stones.geometry(),
    gems,
  };
}
export function addHintStone(stones, pos, yaw, seed) {
  const slab = boulderGeometry(0.55, seed, 1);
  slab.scale(0.75, 1.9, 0.5);
  stones.add(slab, trs(pos.x, pos.y + 0.75, pos.z, 0.06, yaw, 0.05), STONE);
  const ring = new TorusGeometry(0.2, 0.035, 5, 20);
  const facing = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const glyph = pos
    .clone()
    .addScaledVector(facing, 0.32)
    .add(new Vector3(0, 1.05, 0));
  stones.add(ring, trs(glyph.x, glyph.y, glyph.z, 0, yaw, 0), 16777215, 1);
  const orb = new SphereGeometry(0.06, 8, 6);
  stones.add(orb, trs(glyph.x, glyph.y, glyph.z, 0, yaw, 0), 16777215, 1);
  return glyph;
}
export function addAltar(stones, pos, height) {
  stones.add(
    lathe(
      [
        [0, 0],
        [2.5, 0],
        [2.55, height * 0.5],
        [2.35, height],
        [0.001, height],
      ],
      28,
    ),
    trs(pos.x, pos.y - 0.05, pos.z),
    STONE_LIGHT,
  );
  stones.add(
    new TorusGeometry(2.45, 0.1, 5, 40),
    trs(pos.x, pos.y + height * 0.55, pos.z, Math.PI / 2, 0, 0),
    15260072,
    1,
  );
}
export function addSpiral(stones, pos) {
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const k = i / 60;
    const ang = k * Math.PI * 2 * 2.5;
    const rad = 0.15 + k * 1.05;
    pts.push(new Vector3(pos.x + Math.cos(ang) * rad, pos.y + 0.04, pos.z + Math.sin(ang) * rad));
  }
  const tube = taperedTube(new CatmullRomCurve3(pts), 90, 4, () => 0.055);
  stones.add(tube, new Matrix4(), 16766023, 1);
}
export function buildRoots(center, dir, radius, seed) {
  const stones = new StoneBuilder();
  const side = new Vector3(-dir.z, 0, dir.x).normalize();
  let state = seed;
  const rand = () => {
    state = (state * 16807) % 2147483647;
    return (state % 10000) / 10000;
  };
  for (let i = 0; i < 16; i++) {
    const a0 = rand() * Math.PI * 2;
    const a1 = a0 + Math.PI * (0.6 + rand() * 0.8);
    const p0 = center
      .clone()
      .addScaledVector(side, Math.cos(a0) * radius)
      .add(new Vector3(0, Math.sin(a0) * radius, 0));
    const p1 = center
      .clone()
      .addScaledVector(side, Math.cos(a1) * radius)
      .add(new Vector3(0, Math.sin(a1) * radius, 0));
    const mid = p0
      .clone()
      .lerp(p1, 0.5)
      .addScaledVector(dir, (rand() - 0.5) * 1.2);
    mid.y -= 0.3 + rand() * 0.5;
    p0.addScaledVector(dir, (rand() - 0.5) * 0.8);
    p1.addScaledVector(dir, (rand() - 0.5) * 0.8);
    const curve = new CatmullRomCurve3([p0, mid, p1]);
    const thick = 0.12 + rand() * 0.16;
    const tube = taperedTube(curve, 14, 6, (t) => thick * (0.7 + 0.5 * Math.sin(t * Math.PI)));
    stones.add(tube, new Matrix4(), i % 3 == 0 ? 6968388 : 5127732, i % 4 == 0 ? 0.35 : 0);
  }
  return stones.geometry();
}
export function makeVeilMaterial(globals) {
  return new ShaderMaterial({
    uniforms: {
      ...globals,
      uVeil: {
        value: 1,
      },
      uBreak: {
        value: 0,
      },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      #include <wb_common>
      uniform float uVeil;
      uniform float uBreak;
      varying vec2 vUv;
      varying vec3 vW;
      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c) * 2.0;
        float t = uTime;
        // slow twisting ink (rotate by an angle that grows toward the centre: no polar seam)
        float tw = (1.0 - r) * 2.2 + t * 0.18;
        mat2 R = mat2(cos(tw), -sin(tw), sin(tw), cos(tw));
        vec2 q = R * c;
        float ink = wbNoise2(q * 5.0 + 3.0) * 0.55 + wbNoise2(q * 11.0 - vec2(t * 0.2, 0.0)) * 0.3 + wbNoise2(q * 23.0) * 0.15;
        float streak = smoothstep(0.55, 0.8, ink);
        float edge = smoothstep(1.0, 0.8, r);
        float n = wbNoise2(vUv * 9.0 + 3.0);
        float vis = smoothstep(n - 0.08, n + 0.08, uVeil * 1.15 - r * 0.15);
        vec3 col = mix(vec3(0.02, 0.015, 0.045), vec3(0.16, 0.1, 0.3), streak);
        // round, twinkling motes of stolen colour caught in the ink
        vec2 g = q * 26.0;
        vec2 cell = floor(g);
        float hs = wbHash12(cell);
        float dotM = smoothstep(0.22, 0.05, length(fract(g) - 0.5)) * step(0.93, hs);
        float tws = 0.5 + 0.5 * sin(t * (1.5 + hs * 3.0) + hs * 30.0);
        col += mix(vec3(0.55, 0.4, 1.0), vec3(0.9, 0.8, 1.0), hs) * dotM * tws * 1.6;
        // violet rim where the veil meets the rock
        col += vec3(0.45, 0.3, 0.95) * smoothstep(0.75, 0.97, r) * edge * 0.8;
        col += vec3(0.7, 0.55, 1.0) * uBreak * 2.0 * (1.0 - vis * 0.5);
        float a = edge * vis * (0.86 + 0.14 * ink);
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}
export function mergeGeometries(geos) {
  let vertCount = 0;
  let indexCount = 0;
  for (const geo of geos) {
    vertCount += geo.getAttribute('position').count;
    indexCount += geo.index ? geo.index.count : geo.getAttribute('position').count;
  }
  const pos = new Float32Array(vertCount * 3);
  const nrm = new Float32Array(vertCount * 3);
  const index = new Uint32Array(indexCount);
  let vOffset = 0;
  let iOffset = 0;
  for (const geo of geos) {
    const position = geo.getAttribute('position');
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const normal = geo.getAttribute('normal');
    for (let i = 0; i < position.count; i++) {
      pos.set([position.getX(i), position.getY(i), position.getZ(i)], (vOffset + i) * 3);
      nrm.set([normal.getX(i), normal.getY(i), normal.getZ(i)], (vOffset + i) * 3);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) index[iOffset++] = geo.index.getX(i) + vOffset;
    else for (let i = 0; i < position.count; i++) index[iOffset++] = vOffset + i;
    vOffset += position.count;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nrm, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
