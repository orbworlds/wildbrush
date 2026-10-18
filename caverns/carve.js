/**
 * Carves the chambers, tunnels, chasm, shaft, pool and pillars into the distance grid with noisy rock walls, meshes it, offers ground probes, and bakes ambient occlusion and fungus glow into the cave vertices.
 */
import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';
import { makeNoise2D, makeNoise3D } from '../core/math.js';
import { CHAMBERS, CHASM, OX, OY, OZ, PILLARS, POCKET, POOL, SHAFT, TUNNELS } from './layout.js';
import { nearestOnPoly, sdBox, sdEllipsoid, SdfGrid, smax, smin, surfaceNets } from './sdf-grid.js';
const rockNoise = makeNoise3D('glowcap-rock');
const rockNoiseB = makeNoise3D('glowcap-rock-b');
const floorNoise = makeNoise2D('glowcap-floor');
function rockDisp(x, y, z) {
  const ridge = 1 - Math.abs(rockNoiseB(x * 0.13 - 2.1, y * 0.17 + 4.4, z * 0.13));
  return (
    0.8 * rockNoise(x * 0.085, y * 0.11, z * 0.085) +
    0.5 * rockNoiseB(x * 0.21 + 5.1, y * 0.26, z * 0.21 - 3.3) +
    0.42 * (ridge * ridge - 0.45) +
    0.16 * rockNoise(x * 0.5 - 7.7, y * 0.62 + 1.9, z * 0.5) +
    0.06 * Math.sin(y * 1.9 + 2.6 * rockNoiseB(x * 0.06, y * 0.05, z * 0.06))
  );
}
function floorDisp(x, z) {
  return 0.16 * floorNoise(x * 0.11, z * 0.11) + 0.06 * floorNoise(x * 0.45 + 9, z * 0.45);
}
function makePoly(tunnel) {
  const points = tunnel.pts.map(([x, y, z]) => new Vector3(OX + x, OY + y, OZ + z));
  const curve = new CatmullRomCurve3(points, false, 'centripetal', 0.5);
  const len = curve.getLength();
  const count = Math.max(2, Math.ceil(len / 1.1) + 1);
  const spacedPoints = curve.getSpacedPoints(count - 1);
  const pos = new Float32Array(count * 3);
  const floors = new Float32Array(count);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  spacedPoints.forEach((pt, i) => {
    floors[i] = pt.y;
    pos[i * 3] = pt.x;
    pos[i * 3 + 1] = pt.y + tunnel.r * 0.5;
    pos[i * 3 + 2] = pt.z;
    min[0] = Math.min(min[0], pt.x);
    min[1] = Math.min(min[1], pt.y);
    min[2] = Math.min(min[2], pt.z);
    max[0] = Math.max(max[0], pt.x);
    max[1] = Math.max(max[1], pt.y + tunnel.r);
    max[2] = Math.max(max[2], pt.z);
  });
  return {
    p: pos,
    f: floors,
    n: count,
    min,
    max,
  };
}
export const timing = {};
export function buildCave(quality) {
  const tStart = performance.now();
  const cell = quality === 'low' ? 0.62 : 0.52;
  const half = POCKET.size / 2 - 0.5;
  const yMin = OY - 10.8;
  const yMax = OY + 16.5;
  const field = new SdfGrid(OX - half, yMin, OZ - half, cell, half * 2, yMax - yMin, half * 2, 6);
  const carveChamber = (chamber) => {
    const cx = OX + chamber.x;
    const cz = OZ + chamber.z;
    const floorY = OY + chamber.floor;
    const cy = floorY + 0.35 * chamber.ry;
    const rough = chamber.rough ?? 1;
    field.stamp(
      cx - chamber.rx - 3,
      floorY - 2,
      cz - chamber.rz - 3,
      cx + chamber.rx + 3,
      cy + chamber.ry + 3,
      cz + chamber.rz + 3,
      (x, y, z, d2) => {
        let dRoom = sdEllipsoid(x - cx, y - cy, z - cz, chamber.rx, chamber.ry, chamber.rz);
        if (dRoom > 4) return NaN;
        if (dRoom < 2.3 && dRoom > -2.6) dRoom += rockDisp(x, y, z) * rough;
        let dFloor = floorY - y;
        if (dFloor > -1.2 && dFloor < 1.2) dFloor += floorDisp(x, z);
        return smin(d2, smax(dRoom, dFloor, 1.3), 1.2);
      },
    );
  };
  for (const chamber of CHAMBERS) carveChamber(chamber);
  const polys = {};
  for (const tunnel of TUNNELS) {
    const poly = makePoly(tunnel);
    polys[tunnel.id] = poly;
    const pad = tunnel.r + 2.5;
    field.stamp(
      poly.min[0] - pad,
      poly.min[1] - 2,
      poly.min[2] - pad,
      poly.max[0] + pad,
      poly.max[1] + 3,
      poly.max[2] + pad,
      (x, y, z, d) => {
        const hit = nearestOnPoly(poly, x, y, z);
        let dTube = hit.d - tunnel.r;
        if (dTube > 3.5) return NaN;
        if (dTube < 1.8 && dTube > -2.2) dTube += rockDisp(x + 31, y, z - 17) * 0.8;
        let dFloor = hit.floor - y;
        if (dFloor > -1.2 && dFloor < 1.2) dFloor += floorDisp(x, z);
        return smin(d, smax(dTube, dFloor, 0.9), 1);
      },
    );
  }
  {
    const x0 = OX + CHASM.x0;
    const x1 = OX + CHASM.x1;
    const z0 = OZ + CHASM.z0;
    const z1 = OZ + CHASM.z1;
    const y0 = OY + CHASM.floor;
    const y1 = OY + CHASM.top + 2.5;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const cz = (z0 + z1) / 2;
    const hx = (x1 - x0) / 2 - 0.5;
    const hy = (y1 - y0) / 2 - 0.5;
    const hz = (z1 - z0) / 2 - 0.5;
    field.stamp(x0 - 2, y0 - 2, z0 - 2, x1 + 2, y1 + 1, z1 + 2, (x, y, z, d) => {
      let dBox = sdBox(x - cx, y - cy, z - cz, hx, hy, hz) - 0.5;
      if (Math.abs(dBox) < 2) dBox += 0.35 * rockNoise(x * 0.3, y * 0.3, z * 0.3) + 0.12 * Math.sin(y * 2.1 + x * 0.3);
      return smin(d, dBox, 0.7);
    });
  }
  {
    const sx = OX + SHAFT.x;
    const sz = OZ + SHAFT.z;
    const y0 = OY + SHAFT.y0 + 0.05;
    const y1 = OY + SHAFT.y1;
    const cy = (y0 + y1) / 2;
    const hy = (y1 - y0) / 2;
    field.stamp(
      sx - SHAFT.r - 2,
      y0 - 1,
      sz - SHAFT.r - 2,
      sx + SHAFT.r + 2,
      y1 + 1,
      sz + SHAFT.r + 2,
      (x, y, z, d) => {
        const dRing = Math.hypot(x - sx, z - sz) - SHAFT.r;
        let dShaft = Math.max(dRing, Math.abs(y - cy) - hy);
        dShaft += 0.22 * rockNoise(x * 0.4, y * 0.4, z * 0.4);
        return smin(d, dShaft, 1);
      },
    );
  }
  {
    const px = OX + POOL.x;
    const pz = OZ + POOL.z;
    const py = OY;
    field.stamp(
      px - POOL.rx - 1,
      py - POOL.depth - 1,
      pz - POOL.rz - 1,
      px + POOL.rx + 1,
      py + 1,
      pz + POOL.rz + 1,
      (x, y, z, d) => smin(d, sdEllipsoid(x - px, y - py, z - pz, POOL.rx, POOL.depth, POOL.rz), 0.6),
    );
  }
  for (const [lx, lz, baseR] of PILLARS) {
    const cx = OX + lx;
    const cz = OZ + lz;
    const waistY = OY + 4;
    field.stamp(cx - baseR - 3, OY - 2, cz - baseR - 3, cx + baseR + 3, OY + 14, cz + baseR + 3, (x, y, z, d) => {
      const dy = y - waistY;
      const rad = baseR + Math.min(2.2, 0.035 * dy * dy);
      let dCol = Math.hypot(x - cx, z - cz) - rad;
      if (Math.abs(dCol) < 2) dCol += 0.35 * rockDisp(x * 1.7, y, z * 1.7);
      return smax(d, -dCol, 1.2);
    });
  }
  const tNets = performance.now();
  const { positions, indices } = surfaceNets(field);
  timing.stamp = Math.round(tNets - tStart);
  timing.nets = Math.round(performance.now() - tNets);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const decos = [];
  const build = {
    field,
    geometry,
    polys,
    groundY: (x, z, fromY, maxDrop = 14) => {
      let y = fromY;
      let d = field.sample(x, y, z);
      if (d > 0) {
        for (let i = 0; i < 12 && d > 0; i++) {
          y += 0.25;
          d = field.sample(x, y, z);
        }
        if (d > 0) return null;
      }
      for (let probeY = y - 0.2; probeY > fromY - maxDrop; probeY -= 0.2)
        if (field.sample(x, probeY, z) > 0) {
          let lo = probeY;
          let hi = probeY + 0.2;
          for (let j = 0; j < 10; j++) {
            const mid = (lo + hi) / 2;
            if (field.sample(x, mid, z) > 0) lo = mid;
            else hi = mid;
          }
          return (lo + hi) / 2;
        }
      return null;
    },
    tris: indices.length / 3,
    addDeco(geo) {
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      for (const attr of Object.keys(geo.attributes))
        if (attr !== 'position' && attr !== 'normal') geo.deleteAttribute(attr);
      decos.push(geo);
    },
    finish(lights) {
      const parts = [geometry, ...decos];
      let vertCount = 0;
      let indexCount = 0;
      for (const part of parts) {
        vertCount += part.attributes.position.count;
        indexCount += part.index ? part.index.count : part.attributes.position.count;
      }
      const pos = new Float32Array(vertCount * 3);
      const nrm = new Float32Array(vertCount * 3);
      const index = new Uint32Array(indexCount);
      let vOffset = 0;
      let iOffset = 0;
      for (const part of parts) {
        const position = part.attributes.position;
        const normal = part.attributes.normal;
        for (let i = 0; i < position.count; i++) {
          pos[(vOffset + i) * 3] = position.getX(i);
          pos[(vOffset + i) * 3 + 1] = position.getY(i);
          pos[(vOffset + i) * 3 + 2] = position.getZ(i);
          nrm[(vOffset + i) * 3] = normal.getX(i);
          nrm[(vOffset + i) * 3 + 1] = normal.getY(i);
          nrm[(vOffset + i) * 3 + 2] = normal.getZ(i);
        }
        if (part.index) {
          const array = part.index.array;
          for (let i = 0; i < array.length; i++) index[iOffset++] = array[i] + vOffset;
        } else for (let i = 0; i < position.count; i++) index[iOffset++] = vOffset + i;
        vOffset += position.count;
      }
      for (const geo of decos) geo.dispose();
      decos.length = 0;
      const tBake = performance.now();
      const bake = bakeVertices(field, pos, nrm, vertCount, lights);
      timing.bake = Math.round(performance.now() - tBake);
      timing.verts = vertCount;
      const merged = new BufferGeometry();
      merged.setAttribute('position', new BufferAttribute(pos, 3));
      merged.setAttribute('normal', new BufferAttribute(nrm, 3));
      merged.setAttribute('aBake', new BufferAttribute(bake, 4));
      merged.setIndex(new BufferAttribute(index, 1));
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      if (geometry !== merged) geometry.dispose();
      build.geometry = merged;
      build.tris = index.length / 3;
    },
  };
  return build;
}
export function bakeGeometry(field, geometry, lights) {
  const pos = geometry.getAttribute('position').array;
  const nrm = geometry.getAttribute('normal').array;
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('aBake', new BufferAttribute(bakeVertices(field, pos, nrm, count, lights, true), 4));
}
function bakeVertices(field, pos, nrm, count, lights, outdoor = false) {
  const out = new Float32Array(count * 4);
  const prepared = lights.map((light) => ({
    ...light,
    r2: light.r * light.r,
    cr: light.color.r * light.k,
    cg: light.color.g * light.k,
    cb: light.color.b * light.k,
  }));
  for (let i = 0; i < count; i++) {
    const px = pos[i * 3];
    const py = pos[i * 3 + 1];
    const pz = pos[i * 3 + 2];
    const nx = nrm[i * 3];
    const ny = nrm[i * 3 + 1];
    const nz = nrm[i * 3 + 2];
    const open1 = -field.sample(px + nx * 0.9, py + ny * 0.9, pz + nz * 0.9);
    const open2 = -field.sample(px + nx * 2.2, py + ny * 2.2, pz + nz * 2.2);
    const open3 = -field.sample(px + nx * 4.2, py + ny * 4.2, pz + nz * 4.2);
    let ao = Math.min(
      1,
      Math.max(
        0.12,
        0.2 + 0.4 * Math.min(1, open1 / 0.9) + 0.25 * Math.min(1, open2 / 2.2) + 0.15 * Math.min(1, open3 / 4.2),
      ),
    );
    if (outdoor) ao = Math.min(1, 0.35 + ao * 0.75);
    let lr = 0;
    let lg = 0;
    let lb = 0;
    const sx = px + nx * 0.35;
    const sy = py + ny * 0.35;
    const sz = pz + nz * 0.35;
    for (const light of prepared) {
      const dx = light.x - px;
      const dy = light.y - py;
      const dz = light.z - pz;
      const dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 >= light.r2) continue;
      const dist = Math.sqrt(dist2);
      const ndl = (dx * nx + dy * ny + dz * nz) / Math.max(dist, 0.001);
      const wrap = Math.min(1, Math.max(0, ndl * 0.7 + 0.3));
      if (wrap <= 0.01) continue;
      const fall = 1 - dist / light.r;
      let w = fall * fall * (1 + 1.2 / (1 + dist2 * 0.5));
      if (dist > 1.2 && !field.clear(sx, sy, sz, light.x, light.y, light.z, 0.05, 0.55)) w *= 0.12;
      lr += light.cr * w * wrap;
      lg += light.cg * w * wrap;
      lb += light.cb * w * wrap;
    }
    out[i * 4] = lr;
    out[i * 4 + 1] = lg;
    out[i * 4 + 2] = lb;
    out[i * 4 + 3] = ao;
  }
  return out;
}
