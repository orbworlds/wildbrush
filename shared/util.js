/**
 * Shared content helpers: seeded randomness, procedural geometry (rounded boxes, lathes, temple columns, rocks, tapered tubes, vertex colours, merging), terrain placement queries, a soft glow sprite texture and a guard that logs failed build steps.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  MathUtils,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise3D, makeRng } from '../core/math.js';
export const TAU = Math.PI * 2;
export const rng = (key) => makeRng(`content-${key}`);
export const randRange = (rand, min, max) => min + (max - min) * rand();
export const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];
const weatherNoise = makeNoise3D('content-weather');
export function roundedBox(w, h2, d2, radius, density = 1.2) {
  radius = Math.min(radius, w / 2, h2 / 2, d2 / 2);
  const segs = (size) => Math.max(2, Math.min(14, Math.round(size * density) + 2));
  const geometry = new BoxGeometry(w, h2, d2, segs(w), segs(h2), segs(d2));
  const position = geometry.attributes.position;
  const hx = w / 2 - radius;
  const hy = h2 / 2 - radius;
  const hz = d2 / 2 - radius;
  const v = new Vector3();
  const core = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    core.set(MathUtils.clamp(v.x, -hx, hx), MathUtils.clamp(v.y, -hy, hy), MathUtils.clamp(v.z, -hz, hz));
    v.sub(core);
    if (v.lengthSq() > 1e-9) v.setLength(radius);
    v.add(core);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  return weld(geometry);
}
export function weld(geometry, tolerance = 0.001) {
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  if (geometry.attributes.uv1) geometry.deleteAttribute('uv1');
  if (geometry.attributes.normal) geometry.deleteAttribute('normal');
  const merged = mergeVertices(geometry, tolerance);
  geometry.dispose();
  merged.computeVertexNormals();
  return merged;
}
export function lathe(profile, segments = 20) {
  const points = profile.map(([r, y]) => new Vector2(Math.max(0.0001, r), y));
  return weld(new LatheGeometry(points, segments));
}
export function displace(geometry, amount, freq, seed = 0) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = x * freq + seed * 7.13;
    const ny = y * freq + seed * 3.7;
    const nz = z * freq - seed * 5.1;
    position.setXYZ(
      i,
      x + weatherNoise(nx, ny, nz) * amount,
      y + weatherNoise(nx + 31.7, ny - 11.3, nz + 5.9) * amount,
      z + weatherNoise(nx - 17.1, ny + 23.3, nz - 41.7) * amount,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}
export function columnGeometry(radius, height, options = {}) {
  const profile = [[0, 0]];
  let baseH = 0;
  if (options.base === false) profile.push([radius, 0]);
  else {
    profile.push(
      [radius * 1.42, 0],
      [radius * 1.45, 0.06],
      [radius * 1.45, 0.24],
      [radius * 1.38, 0.3],
      [radius * 1.22, 0.36],
      [radius * 1.2, 0.46],
      [radius * 1.05, 0.54],
    );
    baseH = 0.56;
  }
  const shaftTop = options.capital ? height - 0.55 : height;
  const steps = Math.max(2, Math.ceil((shaftTop - baseH) / 0.45));
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const y = baseH + (shaftTop - baseH) * u;
    profile.push([radius * (1 - 0.1 * u * u), y]);
  }
  const topR = radius * 0.9;
  if (options.capital)
    profile.push(
      [topR * 1.08, height - 0.5],
      [topR * 1.12, height - 0.42],
      [topR * 1.3, height - 0.3],
      [topR * 1.5, height - 0.2],
      [topR * 1.55, height - 0.12],
      [topR * 1.55, height],
      [0, height],
    );
  else profile.push([topR * 0.93, height], [topR * 0.5, height + 0.02], [0, height + 0.02]);
  const geometry = lathe(profile, options.segments ?? 22);
  const position = geometry.attributes.position;
  const flutes = options.flutes ?? 12;
  const seed = options.seed ?? 0;
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i);
    let y = position.getY(i);
    let z = position.getZ(i);
    const dist = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    if (flutes > 0 && y > baseH + 0.1 && y < shaftTop - 0.05 && dist > radius * 0.5) {
      const flute = 1 - 0.045 * (0.5 + 0.5 * Math.cos(angle * flutes)) ** 2;
      x *= flute;
      z *= flute;
    }
    if (options.broken && y > height - 0.3) {
      const drop =
        (0.5 + 0.5 * weatherNoise(Math.cos(angle) * 1.3 + seed, Math.sin(angle) * 1.3, seed * 3.1)) * options.broken;
      const inner = 1 - Math.min(1, dist / (radius * 0.95));
      y = y - drop * (0.6 + 0.4 * (1 - inner)) - inner * options.broken * 0.25 * weatherNoise(x * 3 + seed, z * 3, 1);
    }
    position.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  return displace(geometry, radius * 0.05, 1.6, seed);
}
export function rockGeometry(radius, seed, squash = 0.7) {
  const geometry = weld(new IcosahedronGeometry(radius, 2));
  geometry.scale(1, squash, 1);
  displace(geometry, radius * 0.28, 1.1 / radius, seed);
  return geometry;
}
export function taperedTube(curve, segments, radialSegments, radiusAt) {
  const frenetFrames = curve.computeFrenetFrames(segments, false);
  const positions = [];
  const normals = [];
  const indices = [];
  const point = new Vector3();
  const normal = new Vector3();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, point);
    const radius = radiusAt(u);
    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * TAU;
      normal
        .copy(frenetFrames.normals[i])
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(frenetFrames.binormals[i], Math.sin(angle))
        .normalize();
      positions.push(point.x + normal.x * radius, point.y + normal.y * radius, point.z + normal.z * radius);
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j;
      const b = a + radialSegments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}
export function colorize(geometry, color, jitter = 0, rand) {
  const col = color instanceof Color ? color : new Color(color);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const shade = jitter && rand ? 1 + (rand() - 0.5) * jitter : 1;
    colors[i * 3] = col.r * shade;
    colors[i * 3 + 1] = col.g * shade;
    colors[i * 3 + 2] = col.b * shade;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}
export function fillAttribute(geometry, attr, itemSize, value) {
  const count = geometry.attributes.position.count;
  const data = new Float32Array(count * itemSize);
  const values = Array.isArray(value) ? value : [value];
  for (let i = 0; i < count; i++) for (let j = 0; j < itemSize; j++) data[i * itemSize + j] = values[j % values.length];
  geometry.setAttribute(attr, new BufferAttribute(data, itemSize));
  return geometry;
}
export function mergeGeometries(geometries) {
  const merged = new BufferGeometry();
  if (!geometries.length) return merged;
  const keys = Object.keys(geometries[0].attributes);
  let vertexCount = 0;
  let indexCount = 0;
  for (const geo of geometries) {
    vertexCount += geo.attributes.position.count;
    indexCount += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  for (const key of keys) {
    const itemSize = geometries[0].attributes[key].itemSize;
    const data = new Float32Array(vertexCount * itemSize);
    let offset = 0;
    for (const geo of geometries) {
      const attr = geo.attributes[key];
      const count = geo.attributes.position.count;
      if (attr && attr.itemSize === itemSize) {
        if (attr.array instanceof Float32Array && !attr.isInterleavedBufferAttribute)
          data.set(attr.array.subarray(0, count * itemSize), offset * itemSize);
        else
          for (let i = 0; i < count; i++)
            for (let j = 0; j < itemSize; j++) data[(offset + i) * itemSize + j] = attr.getComponent(i, j);
      }
      offset += count;
    }
    merged.setAttribute(key, new BufferAttribute(data, itemSize));
  }
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let cursor = 0;
  let base = 0;
  for (const geo of geometries) {
    const count = geo.attributes.position.count;
    if (geo.index) {
      const array = geo.index.array;
      for (let i = 0; i < array.length; i++) index[cursor++] = array[i] + base;
    } else for (let i = 0; i < count; i++) index[cursor++] = i + base;
    base += count;
  }
  merged.setIndex(new BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}
export function slopeAt(ctx, x, z, step = 1.5) {
  const terrain = ctx.terrain;
  const gx = terrain.heightAt(x + step, z) - terrain.heightAt(x - step, z);
  const gz = terrain.heightAt(x, z + step) - terrain.heightAt(x, z - step);
  return Math.hypot(gx, gz) / (2 * step);
}
export function heightStats(ctx, x, z, radius) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  min = max = sum = ctx.terrain.heightAt(x, z);
  count = 1;
  for (let ring = 1; ring <= 2; ring++) {
    const ringR = (radius * ring) / 2;
    const samples = ring * 6;
    for (let j = 0; j < samples; j++) {
      const angle = (j / samples) * TAU;
      const h = ctx.terrain.heightAt(x + Math.cos(angle) * ringR, z + Math.sin(angle) * ringR);
      min = Math.min(min, h);
      max = Math.max(max, h);
      sum += h;
      count++;
    }
  }
  return {
    min,
    max,
    avg: sum / count,
  };
}
export function findSpot(ctx, x, z, options = {}) {
  const maxSlope = options.maxSlope ?? 0.45;
  const minH = options.minH ?? 0.8;
  const maxH = options.maxH ?? 999;
  const footprint = options.footprint ?? 2;
  const search = options.search ?? 18;
  const ok = (px, pz) => {
    if (Math.abs(px) > 150 || Math.abs(pz) > 150) return false;
    const h = ctx.terrain.heightAt(px, pz);
    if (!(h >= minH && h <= maxH) || slopeAt(ctx, px, pz, Math.max(1, footprint * 0.5)) > maxSlope) return false;
    if (options.maxFlatness !== undefined) {
      const stats = heightStats(ctx, px, pz, footprint);
      if (stats.max - stats.min > options.maxFlatness) return false;
    }
    if (options.avoid) {
      for (const zone of options.avoid) if (Math.hypot(px - zone.x, pz - zone.z) < zone.r) return false;
    }
    try {
      if (ctx.water && ctx.water.depthAt(px, pz) > 0.05) return false;
    } catch {}
    return true;
  };
  if (ok(x, z)) return new Vector3(x, ctx.terrain.heightAt(x, z), z);
  const step = 1.5;
  for (let dist = step; dist <= search; dist += step) {
    const count = Math.max(6, Math.round((dist * TAU) / step));
    for (let j = 0; j < count; j++) {
      const angle = (j / count) * TAU + dist * 0.37;
      const cx = x + Math.cos(angle) * dist;
      const cz = z + Math.sin(angle) * dist;
      if (ok(cx, cz)) return new Vector3(cx, ctx.terrain.heightAt(cx, cz), cz);
    }
  }
  return null;
}
export const yawTo = (x0, z0, x1, z1) => Math.atan2(x1 - x0, z1 - z0);
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.14)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 128, 128);
  glowTex = new CanvasTexture(canvas);
  glowTex.colorSpace = SRGBColorSpace;
  return glowTex;
}
export const safe = (label, fn, fallback) => {
  try {
    return fn();
  } catch (err) {
    console.warn(`[content] ${label} failed`, err);
    return fallback;
  }
};
