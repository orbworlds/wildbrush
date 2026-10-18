/**
 * Glow palette and geometry builders for glowing mushrooms (stalk, cap, gills, spots) and crystal clusters, merged into single meshes with per-vertex part, cluster and glow attributes.
 */
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix3,
  Matrix4,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
export const HUES = {
  cyan: new Color(0.2, 0.95, 0.82),
  teal: new Color(0.12, 0.72, 0.95),
  violet: new Color(0.5, 0.45, 1),
  amber: new Color(1, 0.66, 0.28),
  pink: new Color(1, 0.45, 0.78),
};
const _nrm = new Vector3();
const _pos = new Vector3();
const _nrmMat = new Matrix3();
export class FungusBuilder {
  pos = [];
  nrm = [];
  col = [];
  fung = [];
  glow = [];
  piv = [];
  idx = [];
  add(geo, matrix, color, part, cluster, glow, glowColor, pivot, sway = 0) {
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const position = geo.getAttribute('position');
    const normal = geo.getAttribute('normal');
    _nrmMat.getNormalMatrix(matrix);
    const base = this.pos.length / 3;
    const count = position.count;
    for (let i = 0; i < count; i++) {
      _pos.fromBufferAttribute(position, i).applyMatrix4(matrix);
      _nrm.fromBufferAttribute(normal, i).applyMatrix3(_nrmMat).normalize();
      this.pos.push(_pos.x, _pos.y, _pos.z);
      this.nrm.push(_nrm.x, _nrm.y, _nrm.z);
      this.col.push(color.r, color.g, color.b);
      const glowW = typeof glow == 'number' ? glow : glow(i, count);
      const swayW = typeof sway == 'number' ? sway : sway(i, count);
      this.fung.push(part, cluster, glowW, swayW);
      this.glow.push(glowColor.r, glowColor.g, glowColor.b);
      this.piv.push(pivot.x, pivot.y, pivot.z);
    }
    if (geo.index) {
      const array = geo.index.array;
      for (let i = 0; i < array.length; i++) this.idx.push(array[i] + base);
    } else for (let i = 0; i < count; i++) this.idx.push(base + i);
    geo.dispose();
  }
  geometry() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    geometry.setAttribute('aFung', new Float32BufferAttribute(this.fung, 4));
    geometry.setAttribute('aGlowCol', new Float32BufferAttribute(this.glow, 3));
    geometry.setAttribute('aPivot', new Float32BufferAttribute(this.piv, 3));
    geometry.setIndex(this.idx);
    geometry.computeBoundingSphere();
    return geometry;
  }
}
export const UP = new Vector3(0, 1, 0);
const STALK_COLOR = new Color(0.8, 0.78, 0.86);
export function addMushroom(acc, spec) {
  const segs = spec.segments ?? 12;
  const height = spec.height;
  const stalkR = Math.max(0.03, spec.capR * 0.16);
  const bend = spec.bend ?? 0;
  const glow = spec.glow ?? 1;
  const rot = new Quaternion().setFromUnitVectors(UP, spec.up.clone().normalize());
  rot.multiply(new Quaternion().setFromAxisAngle(UP, spec.yaw));
  const matrix = new Matrix4().compose(spec.base, rot, new Vector3(1, 1, 1));
  const bendAt = (y) => (y / height) * bend * (y / height) * height;
  const stalkProfile = [];
  for (let i = 0; i <= 5; i++) {
    const k = i / 5;
    const rad = stalkR * (1.35 - 0.5 * k + 0.25 * (1 - k) ** 4);
    stalkProfile.push(new Vector2(rad, k * height));
  }
  const stalk = new LatheGeometry(stalkProfile, Math.max(6, segs - 2));
  stalk.deleteAttribute('uv');
  bendGeometry(stalk, bendAt);
  const capColor = new Color().copy(spec.hue).lerp(new Color(0.8, 0.86, 0.9), 0.32);
  const gillColor = new Color().copy(spec.hue).multiplyScalar(0.7).addScalar(0.15);
  acc.add(stalk, matrix, STALK_COLOR, 0, spec.cluster, 0.35 * glow, spec.hue, spec.pivot);
  const capR = spec.capR;
  const capH = capR * (0.42 + 0.12 * Math.sin(spec.seed * 3.1));
  const droop = spec.droop ?? 0.18;
  const capProfile = [];
  for (let i = 0; i <= 7; i++) {
    const k = i / 7;
    const ang = k * Math.PI * 0.5;
    const rad = Math.sin(ang) * capR;
    const y = Math.cos(ang) * capH - droop * capR * k * k * k;
    capProfile.push(new Vector2(Math.max(0.001, rad), y));
  }
  capProfile.reverse();
  const cap = new LatheGeometry(capProfile, segs);
  cap.deleteAttribute('uv');
  const capY = height - capH * 0.25;
  cap.translate(bendAt(height), capY, 0);
  acc.add(cap, matrix, capColor, 1, spec.cluster, 0.8 * glow, spec.hue, spec.pivot);
  const gillProfile = [];
  const gillDrop = capH - droop * capR - capH;
  for (let i = 0; i <= 3; i++) {
    const k = i / 3;
    gillProfile.push(
      new Vector2(
        Math.max(0.001, capR * 0.98 * (1 - k) + stalkR * 0.9 * k),
        -droop * capR * (1 - k) + capH * 0.15 * k + gillDrop * 0,
      ),
    );
  }
  gillProfile.reverse();
  const gills = new LatheGeometry(gillProfile, segs);
  gills.deleteAttribute('uv');
  gills.translate(bendAt(height), capY, 0);
  acc.add(gills, matrix, gillColor, 2, spec.cluster, 1 * glow, spec.hue, spec.pivot);
  const spots = spec.spots ?? 0;
  for (let i = 0; i < spots; i++) {
    const ang = (i / spots) * Math.PI * 2 + spec.seed;
    const lat = 0.35 + 0.4 * ((i * 0.37 + spec.seed) % 1);
    const phi = lat * Math.PI * 0.5;
    const rad = Math.sin(phi) * capR * 0.97;
    const y2 = Math.cos(phi) * capH - droop * capR * lat * lat * lat + 0.01;
    const spot = new IcosahedronGeometry(capR * (0.07 + 0.04 * ((i * 0.61) % 1)), 0);
    spot.deleteAttribute('uv');
    spot.scale(1, 0.5, 1);
    spot.translate(Math.cos(ang) * rad + bendAt(height), capY + y2, Math.sin(ang) * rad);
    acc.add(spot, matrix, new Color(1, 1, 1), 3, spec.cluster, 1 * glow, spec.hue, spec.pivot);
  }
}
function bendGeometry(geo, offsetAt) {
  const position = geo.getAttribute('position');
  for (let i = 0; i < position.count; i++) position.setX(i, position.getX(i) + offsetAt(position.getY(i)));
  geo.computeVertexNormals();
}
export class CrystalBuilder {
  pos = [];
  col = [];
  glow = [];
  add(geo, matrix, color, glow) {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    const position = flat.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      _pos.fromBufferAttribute(position, i).applyMatrix4(matrix);
      this.pos.push(_pos.x, _pos.y, _pos.z);
      this.col.push(color.r, color.g, color.b);
      this.glow.push(glow);
    }
    if (flat !== geo) flat.dispose();
    geo.dispose();
  }
  geometry() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    geometry.setAttribute('aGlow', new Float32BufferAttribute(this.glow, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
function crystalGeometry(radius, height) {
  const prism = new CylinderGeometry(radius * 0.92, radius, height, 6, 1, true);
  prism.translate(0, height / 2, 0);
  const tip = new ConeGeometry(radius * 0.92, radius * 2.2, 6, 1, true);
  tip.translate(0, height + radius * 1.1, 0);
  return mergePositions([prism, tip]);
}
function mergePositions(geos) {
  const pos = [];
  for (const geo of geos) {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    const position = flat.getAttribute('position');
    for (let i = 0; i < position.count; i++) pos.push(position.getX(i), position.getY(i), position.getZ(i));
    if (flat !== geo) flat.dispose();
    geo.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return geometry;
}
const CRYSTAL_HUES = [
  new Color(0.55, 0.42, 1),
  new Color(0.35, 0.62, 1),
  new Color(0.75, 0.5, 1),
  new Color(0.3, 0.85, 1),
];
export function addCrystalCluster(acc, pos, up, size, rng, hueIndex = -1) {
  const tilt = new Quaternion().setFromUnitVectors(UP, up.clone().normalize());
  const hue = CRYSTAL_HUES[hueIndex >= 0 ? hueIndex : Math.floor(rng() * CRYSTAL_HUES.length)];
  const count = 3 + Math.floor(rng() * 5);
  for (let i = 0; i < count; i++) {
    const len = size * (0.5 + rng() * 0.9) * (i === 0 ? 1.35 : 1);
    const radius = size * (0.12 + rng() * 0.1) * (i === 0 ? 1.3 : 1);
    const geo = crystalGeometry(radius, len);
    const euler = new Euler(
      (rng() - 0.5) * 0.9 * (i === 0 ? 0.3 : 1),
      rng() * Math.PI * 2,
      (rng() - 0.5) * 0.9 * (i === 0 ? 0.3 : 1),
      'YXZ',
    );
    const spin = new Quaternion().setFromEuler(euler);
    const offset = new Vector3((rng() - 0.5) * size * 0.5, -radius * 0.5, (rng() - 0.5) * size * 0.5).applyQuaternion(
      tilt,
    );
    const matrix = new Matrix4().compose(pos.clone().add(offset), tilt.clone().multiply(spin), new Vector3(1, 1, 1));
    const tint = hue.clone().lerp(new Color(1, 1, 1), rng() * 0.25);
    acc.add(geo, matrix, tint, 0.6 + rng() * 0.6);
  }
  return hue;
}
