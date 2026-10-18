/**
 * Procedural geometry for Greymaw and his arena: smooth lathes, blobs, tapered tubes, rocks and crystals. The model builder bakes vertex colour, bone skinning, drip and roughness data into one merged mesh, and small helpers compose matrices and merge or colour static parts.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DodecahedronGeometry,
  Euler,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../core/math.js';
import { TAU } from './math.js';
const _vec3 = new Vector3();
export function smoothLathe(profile, rings, segments, warp) {
  const spacedPoints = new CatmullRomCurve3(
    profile.map(([y, r]) => new Vector3(r, y, 0)),
    false,
    'centripetal',
  ).getSpacedPoints(rings);
  spacedPoints[0].x = 0;
  spacedPoints[spacedPoints.length - 1].x = 0;
  const positions = [];
  const indices = [];
  const p = new Vector3();
  const vert = (x, y, z, v, angle) => {
    p.set(x, y, z);
    warp?.(p, v, angle);
    positions.push(p.x, p.y, p.z);
  };
  vert(0, spacedPoints[0].y, 0, 0, 0);
  for (let i = 1; i < rings; i++) {
    const v = i / rings;
    for (let j = 0; j < segments; j++) {
      const angle = (j / segments) * TAU;
      vert(Math.sin(angle) * spacedPoints[i].x, spacedPoints[i].y, Math.cos(angle) * spacedPoints[i].x, v, angle);
    }
  }
  vert(0, spacedPoints[rings].y, 0, 1, 0);
  const idx = (ring, seg) => 1 + (ring - 1) * segments + (((seg % segments) + segments) % segments);
  const tip = positions.length / 3 - 1;
  for (let i = 0; i < segments; i++) indices.push(0, idx(1, i + 1), idx(1, i));
  for (let i = 1; i < rings - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a2 = idx(i, j);
      const b = idx(i, j + 1);
      const c = idx(i + 1, j);
      const d = idx(i + 1, j + 1);
      indices.push(a2, b, d, a2, d, c);
    }
  for (let i = 0; i < segments; i++) indices.push(idx(rings - 1, i), idx(rings - 1, i + 1), tip);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function blob(widthSegments, heightSegments, shape) {
  let geometry = new SphereGeometry(1, widthSegments, heightSegments);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry, 0.0001);
  if (shape) {
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      _vec3.fromBufferAttribute(position, i);
      shape(_vec3);
      position.setXYZ(i, _vec3.x, _vec3.y, _vec3.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}
export function taperedTube(points, radiusAt, segments = 12, radial = 8) {
  const curve = new CatmullRomCurve3(points, false, 'centripetal');
  const frenet = curve.computeFrenetFrames(segments, false);
  const positions = [];
  const indices = [];
  const start = curve.getPointAt(0);
  const end = curve.getPointAt(1);
  positions.push(start.x, start.y, start.z);
  for (let i = 0; i <= segments; i++) {
    const u2 = i / segments;
    const p = curve.getPointAt(u2);
    const radius = Math.max(0.0001, radiusAt(u2));
    const normal = frenet.normals[i];
    const binormal = frenet.binormals[i];
    for (let j = 0; j < radial; j++) {
      const angle = (j / radial) * TAU;
      const cosR = Math.cos(angle) * radius;
      const sinR = Math.sin(angle) * radius;
      positions.push(
        p.x + normal.x * cosR + binormal.x * sinR,
        p.y + normal.y * cosR + binormal.y * sinR,
        p.z + normal.z * cosR + binormal.z * sinR,
      );
    }
  }
  positions.push(end.x, end.y, end.z);
  const idx = (ring, seg) => 1 + ring * radial + (((seg % radial) + radial) % radial);
  const tip = positions.length / 3 - 1;
  for (let i = 0; i < radial; i++) indices.push(0, idx(0, i), idx(0, i + 1));
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < radial; j++) {
      const a2 = idx(i, j);
      const b = idx(i, j + 1);
      const c = idx(i + 1, j);
      const d = idx(i + 1, j + 1);
      indices.push(a2, c, d, a2, d, b);
    }
  for (let i = 0; i < radial; i++) indices.push(idx(segments, i + 1), idx(segments, i), tip);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function rockGeometry(seed, radius, squash = 0.62) {
  const rng = makeRng(`boss-rock-${seed}`);
  let geometry = new DodecahedronGeometry(radius, 0);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry, 0.0001);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    _vec3.fromBufferAttribute(position, i);
    _vec3.multiplyScalar(0.8 + rng() * 0.35);
    _vec3.y *= squash;
    position.setXYZ(i, _vec3.x, _vec3.y, _vec3.z);
  }
  geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();
  return mergeVertices(geometry, 0.000001);
}
export function crystalGeometry(height, radius, seed) {
  const rng = makeRng(seed);
  const positions = [];
  const indices = [];
  const shoulder = height - height * (0.28 + rng() * 0.1);
  const twist = rng() * TAU;
  for (let i = 0; i < 2; i++) {
    const y = i === 0 ? -radius * 0.4 : shoulder;
    const ringR = radius * (i === 0 ? 0.92 : 1);
    for (let j = 0; j < 6; j++) {
      const angle = twist + (j / 6) * TAU;
      const wobble = 0.9 + rng() * 0.2;
      positions.push(Math.cos(angle) * ringR * wobble, y, Math.sin(angle) * ringR * wobble);
    }
  }
  positions.push((rng() - 0.5) * radius * 0.3, height, (rng() - 0.5) * radius * 0.3);
  positions.push(0, -radius * 0.5, 0);
  for (let i = 0; i < 6; i++) {
    const a = i;
    const b = (i + 1) % 6;
    indices.push(a, b + 6, b, a, a + 6, b + 6);
    indices.push(a + 6, 12, b + 6);
    indices.push(13, a, b);
  }
  let geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();
  return geometry;
}
export class ModelBuilder {
  parts = [];
  _c = new Color();
  add(geometry, opts) {
    let geo = geometry.index ? geometry : mergeVertices(geometry, 0.00001);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const position = geo.getAttribute('position');
    const count = position.count;
    const uvs = new Float32Array(count * 2);
    const fx = new Float32Array(count * 4);
    if (opts.uv || opts.drip)
      for (let i = 0; i < count; i++) {
        _vec3.fromBufferAttribute(position, i);
        if (opts.uv) {
          const [u, v] = opts.uv(_vec3);
          uvs[i * 2] = u;
          uvs[i * 2 + 1] = v;
        }
        if (opts.drip) fx[i * 4 + 1] = MathUtils.clamp(-_vec3.y / opts.drip.bodyLen, 0, 1);
      }
    geo = geo.clone();
    if (opts.matrix) geo.applyMatrix4(opts.matrix);
    const placed = geo.getAttribute('position');
    const colors = new Float32Array(count * 3);
    const skin = new Float32Array(count * 4);
    const colorA = new Color(opts.color);
    const colorB = new Color(opts.color2 ?? opts.color);
    for (let i = 0; i < count; i++) {
      _vec3.fromBufferAttribute(placed, i);
      const shade = opts.shade ? MathUtils.clamp(opts.shade(_vec3), 0, 1) : 0;
      this._c.copy(colorA).lerp(colorB, shade);
      colors[i * 3] = this._c.r;
      colors[i * 3 + 1] = this._c.g;
      colors[i * 3 + 2] = this._c.b;
      skin[i * 4] = opts.bone;
      skin[i * 4 + 1] = opts.bone2 ?? opts.bone;
      skin[i * 4 + 2] = opts.weight ? MathUtils.clamp(opts.weight(_vec3), 0, 1) : 0;
      skin[i * 4 + 3] = opts.part;
      fx[i * 4] = opts.drip ? opts.drip.phase : 0;
      fx[i * 4 + 2] = opts.rough;
      fx[i * 4 + 3] = opts.drip ? opts.drip.len : 0;
    }
    for (const key of Object.keys(geo.attributes)) if (key !== 'position' && key !== 'normal') geo.deleteAttribute(key);
    geo.setAttribute('uv', new BufferAttribute(uvs, 2));
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.setAttribute('aSkin', new BufferAttribute(skin, 4));
    geo.setAttribute('aFx', new BufferAttribute(fx, 4));
    geo.morphAttributes = {};
    if (!geo.index) {
      const indices = [];
      for (let i = 0; i < placed.count; i++) indices.push(i);
      geo.setIndex(indices);
    }
    this.parts.push(geo);
  }
  build() {
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw Error('[boss] model merge failed');
    merged.computeBoundingSphere();
    return merged;
  }
}
export const compose = (pos, rot, scale) => new Matrix4().compose(pos, new Quaternion().setFromEuler(rot), scale);
export const v3 = (x, y, z) => new Vector3(x, y, z);
export const euler = (x = 0, y = 0, z = 0) => new Euler(x, y, z, 'YXZ');
export function mergeStatic(geometries) {
  const prepared = geometries.map((geometry) => {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    return geo;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw Error('[boss] static merge failed');
  merged.computeBoundingSphere();
  return merged;
}
export function colorize(geometry, hex, attrs) {
  const count = geometry.getAttribute('position').count;
  const color = new Color(hex);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  if (attrs)
    for (const [key, value] of Object.entries(attrs)) {
      const values = new Float32Array(count).fill(value);
      geometry.setAttribute(key, new BufferAttribute(values, 1));
    }
  return geometry;
}
