/**
 * Building blocks for the Aerie's ruins: stone, paint and pastel palettes, and geometry for faceted tiers, tapered blocks, crystals, gems and voussoir arches.
 */
import { BoxGeometry, LatheGeometry, OctahedronGeometry, Quaternion, Vector2, Vector3 } from 'three';
import { PALETTE } from '../core/config.js';
import { displace, roundedBox } from '../shared/util.js';
import { toQuat } from './builder.js';
export const TWO_PI = Math.PI * 2;
export const v3 = (x2, y, z) => new Vector3(x2, y, z);
export const UP = v3(0, 1, 0);
export const STONE = {
  pale: 14471869,
  marble: 15262680,
  rose: 14468790,
  sky: 0xd2d4dc,
  warm: 14008991,
};
export const STONE_TINTS = [STONE.pale, STONE.marble, STONE.rose, STONE.sky, STONE.pale];
export const PAINT_COLORS = [PALETTE.red.hex, PALETTE.blue.hex, PALETTE.yellow.hex, PALETTE.green.hex];
export const PASTELS = [12577023, 14862591, 16769960, 16762076, 13172708];
export function faceted(geometry) {
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}
export function tierGeometry(radius, height, seed) {
  const profile = [
    [0.001, 0],
    [radius + 0.06, 0],
    [radius + 0.06, 0.14],
    [radius, 0.2],
    [radius, height - 0.22],
    [radius + 0.14, height - 0.16],
    [radius + 0.14, height],
    [0.001, height],
  ].map(([x, y]) => new Vector2(x, y));
  const geometry = faceted(new LatheGeometry(profile, 8, -Math.PI / 8));
  return displace(geometry, 0.025, 1.3, seed);
}
export function taperedBox(bottomX, bottomZ, topX, topZ, height) {
  const geometry = new BoxGeometry(1, height, 1, 1, 3, 1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i) / height + 0.5;
    position.setXYZ(
      i,
      position.getX(i) * (bottomX + (topX - bottomX) * t),
      position.getY(i) + height / 2,
      position.getZ(i) * (bottomZ + (topZ - bottomZ) * t),
    );
  }
  return faceted(geometry);
}
export function crystalGeometry(height, radius, tip = 0.28, sides = 6) {
  const profile = [
    [0.001, -0.2],
    [radius * 0.9, -0.2],
    [radius, 0],
    [radius * 0.92, height * (1 - tip)],
    [0.001, height],
  ].map(([x, y]) => new Vector2(x, y));
  return faceted(new LatheGeometry(profile, sides, 0));
}
export function gemGeometry(radius, stretch = 1.3) {
  const geometry = new OctahedronGeometry(radius, 0);
  geometry.scale(1, stretch, 1);
  return faceted(geometry);
}
export function buildArch(b, center, rotation, span, thickness, depth, stones, rng, color) {
  const radius = span / 2;
  const quat = toQuat(rotation);
  for (let i = 0; i < stones; i++) {
    const a0 = (i / stones) * Math.PI;
    const a1 = ((i + 1) / stones) * Math.PI;
    const mid = (a0 + a1) / 2;
    const len = (a1 - a0) * (radius + thickness / 2) * 0.97;
    const block = roundedBox(len, thickness, depth, 0.05, 1);
    displace(block, 0.02, 1.4, rng() * 50);
    const offset = v3(Math.cos(mid) * (radius + thickness / 2), Math.sin(mid) * (radius + thickness / 2), 0);
    const tilt = new Quaternion().setFromAxisAngle(v3(0, 0, 1), mid - Math.PI / 2);
    const pos = offset.applyQuaternion(quat).add(center);
    b.stone(block, pos, quat.clone().multiply(tilt), STONE_TINTS[Math.floor(rng() * STONE_TINTS.length)]);
  }
}
