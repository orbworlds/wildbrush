/**
 * Geometry helpers shared by the realms: paint colours, lathed peaks from a height profile, paths with closest-point and height queries, profile sweeps, fall sheets, icicles, shatter facets, ropes and paint runes, plus tagging parts for the dyn material.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  QuadraticBezierCurve3,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { PALETTE } from '../core/config.js';
import { makeNoise3D } from '../core/math.js';
export const PAINT = {
  red: new Color(PALETTE.red.hex),
  blue: new Color(PALETTE.blue.hex),
  yellow: new Color(PALETTE.yellow.hex),
  green: new Color(PALETTE.green.hex),
};
const KIT_TAU = Math.PI * 2;
const kitV3 = (x2, y, z) => new Vector3(x2, y, z);
export function profileHeightAt(profile, r2) {
  let best = null;
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, y0] = profile[i];
    const [r1, y1] = profile[i + 1];
    const lo = Math.min(r0, r1);
    const hi = Math.max(r0, r1);
    if (r2 < lo - 0.000001 || r2 > hi + 0.000001) continue;
    const t = Math.abs(r1 - r0) < 0.000001 ? 1 : (r2 - r0) / (r1 - r0);
    const y = y0 + (y1 - y0) * MathUtils.clamp(t, 0, 1);
    if (best === null || y > best) best = y;
  }
  return best;
}
export function profileRadiusAt(profile, y) {
  if (y <= profile[0][1]) return profile[0][0];
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, y0] = profile[i];
    const [r1, y1] = profile[i + 1];
    if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / Math.max(0.000001, y1 - y0));
  }
  return profile[profile.length - 1][0];
}
export function peakGeometry(cx, baseY, cz, profile, segs, seed, rough, roughAt, step = 3, options = {}) {
  const noise3D = makeNoise3D(seed);
  const samples = [];
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, y0] = profile[i];
    const [r1, y1] = profile[i + 1];
    const steps = Math.max(1, Math.round((Math.abs(y1 - y0) + Math.abs(r1 - r0)) / step));
    for (let j = 0; j < steps; j++) samples.push([r0 + ((r1 - r0) * j) / steps, y0 + ((y1 - y0) * j) / steps]);
  }
  samples.push(profile[profile.length - 1]);
  const positions = [];
  const indices = [];
  const cols = segs + 1;
  for (let i = 0; i < samples.length; i++) {
    const [radius, y] = samples[i];
    for (let j = 0; j <= segs; j++) {
      const angle = (j / segs) * KIT_TAU;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);
      let rad = radius;
      if (radius > 0.05) {
        const bump =
          noise3D(dirX * 2.4, dirZ * 2.4, y * 0.05) * 0.55 + noise3D(dirX * 6.5, dirZ * 6.5, y * 0.09 + 3) * 0.3;
        const flute = (0.5 - Math.abs(noise3D(dirX * 9, dirZ * 9, y * 0.02 + 11))) * (options.flute ?? 0);
        const phase = y / (options.ledgeStep ?? 3.1) + noise3D(dirX * 1.5, dirZ * 1.5, 5) * 0.35;
        const frac = phase - Math.floor(phase);
        const ledge = options.ledge
          ? (frac < 0.22 ? (0.22 - frac) / 0.22 : 0) * options.ledge
          : Math.sin(y * 1.1 + noise3D(dirX, dirZ, 7) * 3) * 0.15;
        const amp = roughAt ? roughAt(angle, y, radius) : 1;
        rad = Math.max(0.02, radius + (bump * rough + flute + ledge) * amp);
      }
      positions.push(cx + dirX * rad, baseY + y, cz + dirZ * rad);
    }
  }
  for (let i = 0; i + 1 < samples.length; i++)
    for (let j = 0; j < segs; j++) {
      const i0 = i * cols + j;
      const i1 = i0 + 1;
      const i2 = i0 + cols;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function buildPath(pts) {
  const tan = [];
  const len = [0];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    tan.push(kitV3(next.x - prev.x, next.y - prev.y, next.z - prev.z).normalize());
    if (i > 0) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
  }
  return {
    pts,
    tan,
    len,
    total: len[len.length - 1],
  };
}
export function closestPathPoint(path, x, z, stride = 1) {
  let i = 0;
  let bestD2 = Infinity;
  for (let j = 0; j < path.pts.length; j += stride) {
    const p = path.pts[j];
    const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d2 < bestD2) {
      bestD2 = d2;
      i = j;
    }
  }
  return {
    i,
    d: Math.sqrt(bestD2),
  };
}
export function pathHeightAt(path, x, z, halfWidth, stride = 2) {
  let best = null;
  const pts = path.pts;
  for (let i = 0; i + stride < pts.length + stride - 1; i += stride) {
    const p0 = pts[i];
    const p1 = pts[Math.min(pts.length - 1, i + stride)];
    if (p0 === p1) break;
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-8) continue;
    const t = ((x - p0.x) * dx + (z - p0.z) * dz) / lenSq;
    if (t < -0.02 || t > 1.02 || Math.abs((x - p0.x) * dz - (z - p0.z) * dx) / Math.sqrt(lenSq) > halfWidth) continue;
    const y = p0.y + (p1.y - p0.y) * MathUtils.clamp(t, 0, 1);
    if (best === null || y > best) best = y;
  }
  return best;
}
export function sweepPath(path, stripsAt, fdAt, colorAt) {
  const positions = [];
  const colors = [];
  const fds = [];
  const indices = [];
  const count = path.pts.length;
  const strips = stripsAt(0);
  const side = kitV3(0, 0, 0);
  const up = kitV3(0, 1, 0);
  const offsets = [];
  let total = 0;
  for (const strip of strips) {
    offsets.push(total);
    total += strip.length * count;
  }
  const pos = Array(total * 3).fill(0);
  const col = Array(total * 3).fill(0);
  const fd = Array(total * 2).fill(0);
  for (let i = 0; i < count; i++) {
    const pt = path.pts[i];
    const tan = path.tan[i];
    side.set(tan.x, 0, tan.z).normalize().cross(up).normalize();
    stripsAt(i).forEach((strip, si) => {
      const [fdX, fdY] = fdAt(i, si);
      strip.forEach(([across, lift], vi) => {
        const v = offsets[si] + vi * count + i;
        pos[v * 3] = pt.x + side.x * across;
        pos[v * 3 + 1] = pt.y + lift;
        pos[v * 3 + 2] = pt.z + side.z * across;
        const color = colorAt(i, si, vi);
        col[v * 3] = color.r;
        col[v * 3 + 1] = color.g;
        col[v * 3 + 2] = color.b;
        fd[v * 2] = fdX;
        fd[v * 2 + 1] = fdY;
      });
    });
  }
  strips.forEach((strip, si) => {
    for (let i = 0; i + 1 < strip.length; i++)
      for (let j = 0; j + 1 < count; j++) {
        const i0 = offsets[si] + i * count + j;
        const i1 = i0 + 1;
        const i2 = offsets[si] + (i + 1) * count + j;
        const i3 = i2 + 1;
        indices.push(i0, i2, i1, i1, i2, i3);
      }
  });
  positions.push(...pos);
  colors.push(...col);
  fds.push(...fd);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aFd', new Float32BufferAttribute(fds, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function fallSheetGeometry(lip, dir, width, drop, rows = 28, cols = 7, speed = 2.4, spread = 0.9) {
  const fwd = dir.clone().setY(0).normalize();
  const side = kitV3(-fwd.z, 0, fwd.x);
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < rows; i++) {
    const t2 = (i / (rows - 1)) ** 1.35;
    const dy = t2 * drop;
    const reach = speed * Math.sqrt((2 * dy) / 9.8) + 0.25;
    const w = width * (1 + t2 * spread);
    const center = lip
      .clone()
      .addScaledVector(fwd, reach)
      .add(kitV3(0, -dy + 0.05, 0));
    for (let j = 0; j < cols; j++) {
      const u = j / (cols - 1);
      const across = (u - 0.5) * 2;
      const bulge = (1 - across * across) * w * 0.28;
      const p = center
        .clone()
        .addScaledVector(side, across * w * 0.5)
        .addScaledVector(fwd, bulge);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, i / (rows - 1));
    }
  }
  for (let i = 0; i + 1 < rows; i++)
    for (let j = 0; j + 1 < cols; j++) {
      const i0 = i * cols + j;
      indices.push(i0, i0 + cols, i0 + 1, i0 + 1, i0 + cols, i0 + cols + 1);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function icicleGeometry(radius, len, phase = 0) {
  const geometry = new ConeGeometry(radius, len, 5, 3);
  geometry.rotateX(Math.PI);
  geometry.translate(0, -len / 2, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const wiggle = Math.sin(y * 3.1 + phase) * 0.08 * radius;
    position.setX(i, position.getX(i) + wiggle);
  }
  geometry.computeVertexNormals();
  return geometry;
}
export function addFacets(geometry, rng) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  geo.computeVertexNormals();
  const position = geo.getAttribute('position');
  const facets = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i += 3) {
    const cx = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
    const cy = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    const cz = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
    const seed = rng();
    for (let j = 0; j < 3; j++) facets.set([cx, cy, cz, seed], (i + j) * 4);
  }
  geo.setAttribute('aFacet', new BufferAttribute(facets, 4));
  return geo;
}
export function dynPart(geometry, color, part, param = 0) {
  const geo = geometry;
  if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const count = geo.getAttribute('position').count;
  const col = color instanceof Color ? color : new Color(color);
  const colors = new Float32Array(count * 3);
  const fds = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
    fds[i * 2] = part;
    fds[i * 2 + 1] = param;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.setAttribute('aFd', new BufferAttribute(fds, 2));
  return geo;
}
export function xform(geometry, pos, rot, scale) {
  const quat = new Quaternion();
  if (typeof rot == 'number') quat.setFromAxisAngle(kitV3(0, 1, 0), rot);
  else if (rot && rot.isQuaternion) quat.copy(rot);
  else if (rot) quat.setFromEuler(rot);
  const scaleVec = scale === undefined ? kitV3(1, 1, 1) : typeof scale == 'number' ? kitV3(scale, scale, scale) : scale;
  geometry.applyMatrix4(new Matrix4().compose(pos, quat, scaleVec));
  return geometry;
}
export function ropeGeometry(from, to, sag, radius = 0.035, segs = 12) {
  const mid = from
    .clone()
    .lerp(to, 0.5)
    .add(kitV3(0, -sag, 0));
  const curve = new QuadraticBezierCurve3(from.clone(), mid, to.clone());
  return new TubeGeometry(curve, segs, radius, 4, false);
}
export function runeParts(color, ring = true) {
  const parts = [];
  const depth = 0.07;
  if (color === 'red') {
    const flame = new ConeGeometry(0.22, 0.62, 6);
    flame.translate(0, 0.05, 0);
    parts.push(flame);
    for (const side of [-1, 1]) {
      const lick = new ConeGeometry(0.11, 0.36, 5);
      lick.rotateZ(side * -0.35);
      lick.translate(side * 0.19, -0.03, 0);
      parts.push(lick);
    }
    for (const part of parts) part.scale(1, 1, depth / 0.22);
  } else if (color === 'blue')
    for (let i = 0; i < 3; i++) {
      const arm = new BoxGeometry(0.08, 0.7, depth);
      arm.rotateZ((i * Math.PI) / 3);
      parts.push(arm);
      for (const side of [-1, 1]) {
        const branchL = new BoxGeometry(0.06, 0.2, depth);
        branchL.rotateZ(0.7);
        branchL.translate(0.05, 0.24 * side, 0);
        branchL.rotateZ((i * Math.PI) / 3);
        const branchR = new BoxGeometry(0.06, 0.2, depth);
        branchR.rotateZ(-0.7);
        branchR.translate(-0.05, 0.24 * side, 0);
        branchR.rotateZ((i * Math.PI) / 3);
        parts.push(branchL, branchR);
      }
    }
  else if (color === 'yellow') {
    const coil = [];
    for (let i = 0; i <= 5; i++) coil.push(kitV3(i % 2 == 0 ? -0.2 : 0.2, -0.32 + i * 0.13, 0));
    for (let i = 0; i + 1 < coil.length; i++) {
      const p0 = coil[i];
      const p1 = coil[i + 1];
      const len = p0.distanceTo(p1);
      const seg = new BoxGeometry(0.08, len + 0.06, depth);
      seg.rotateZ(Math.atan2(-(p1.x - p0.x), p1.y - p0.y));
      seg.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, 0);
      parts.push(seg);
    }
    const plate = new CylinderGeometry(0.2, 0.2, depth, 10);
    plate.rotateX(Math.PI / 2);
    plate.scale(1, 0.4, 1);
    plate.translate(0, 0.36, 0);
    parts.push(plate);
  } else {
    const leaf = new SphereGeometry(0.3, 12, 8);
    leaf.scale(0.62, 1.1, depth / 0.3);
    leaf.rotateZ(-0.35);
    parts.push(leaf);
    const stem = new BoxGeometry(0.05, 0.32, depth);
    stem.rotateZ(-0.35);
    stem.translate(0.09, -0.35, 0);
    parts.push(stem);
  }
  if (ring) {
    const hoop = new TorusGeometry(0.48, 0.045, 5, 28);
    parts.push(hoop);
  }
  return parts;
}
