/**
 * Rock decoration geometry: wobbly stalactite and stalagmite cones, lumpy boulders, vertex welding, and the seeded random generator for the caverns.
 */
import { BufferGeometry, Float32BufferAttribute, IcosahedronGeometry } from 'three';
import { makeNoise3D, makeRng } from '../core/math.js';
const decoNoise = makeNoise3D('glowcap-deco');
export function dripstoneGeometry(radius, height, hanging, seed) {
  const pos = [];
  const index = [];
  for (let i = 0; i <= 7; i++) {
    const f = i / 7;
    const ring = radius * (1 - f) ** 1.15 * (1 + 0.12 * Math.sin(f * 9 + seed));
    const y = f * height;
    for (let j = 0; j < 9; j++) {
      const ang = (j / 9) * Math.PI * 2;
      const wob = 1 + 0.22 * decoNoise(Math.cos(ang) * 1.3 + seed, y * 0.8, Math.sin(ang) * 1.3);
      pos.push(Math.cos(ang) * ring * wob, hanging ? -y : y, Math.sin(ang) * ring * wob);
    }
  }
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 9; j++) {
      const i0 = i * 9 + j;
      const i1 = i * 9 + ((j + 1) % 9);
      const i2 = i0 + 9;
      const i3 = i1 + 9;
      if (hanging) index.push(i0, i2, i1, i1, i2, i3);
      else index.push(i0, i1, i2, i1, i3, i2);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
export function boulderGeometry(radius, seed, squash = 0.7) {
  const geometry = new IcosahedronGeometry(radius, 2);
  geometry.deleteAttribute('uv');
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const k = 1 + 0.3 * decoNoise((x / radius) * 1.1 + seed, (y / radius) * 1.1, (z / radius) * 1.1 - seed);
    position.setXYZ(i, x * k, y * k * squash, z * k);
  }
  const welded = weldGeometry(geometry);
  welded.computeVertexNormals();
  return welded;
}
function weldGeometry(source) {
  const position = source.attributes.position;
  const seen = new Map();
  const pos = [];
  const index = [];
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
    let vi = seen.get(key);
    if (vi === undefined) {
      vi = pos.length / 3;
      seen.set(key, vi);
      pos.push(position.getX(i), position.getY(i), position.getZ(i));
    }
    index.push(vi);
  }
  source.dispose();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  return geometry;
}
export const caveRng = (tag) => makeRng(`glowcap-${tag}`);
