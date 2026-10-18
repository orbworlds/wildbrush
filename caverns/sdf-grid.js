/**
 * Signed-distance grid the caverns are carved from: shapes are stamped into it, sampled with trilinear filtering and meshed with surface nets. Also smooth min/max, ellipsoid and box distances and nearest-point queries on tunnel polylines.
 */
export class SdfGrid {
  ox;
  oy;
  oz;
  h;
  nx;
  ny;
  nz;
  data;
  constructor(ox, oy, oz, cell, sizeX, sizeY, sizeZ, fill = 6) {
    this.ox = ox;
    this.oy = oy;
    this.oz = oz;
    this.h = cell;
    this.nx = Math.ceil(sizeX / cell) + 1;
    this.ny = Math.ceil(sizeY / cell) + 1;
    this.nz = Math.ceil(sizeZ / cell) + 1;
    this.data = new Float32Array(this.nx * this.ny * this.nz).fill(fill);
  }
  idx(ix, iy, iz) {
    return ix + this.nx * (iy + this.ny * iz);
  }
  stamp(x0, y0, z0, x1, y1, z1, shape) {
    const { h: cell, nx, ny, nz, data } = this;
    const ix0 = Math.max(0, Math.floor((x0 - this.ox) / cell));
    const iy0 = Math.max(0, Math.floor((y0 - this.oy) / cell));
    const iz0 = Math.max(0, Math.floor((z0 - this.oz) / cell));
    const ix1 = Math.min(nx - 1, Math.ceil((x1 - this.ox) / cell));
    const iy1 = Math.min(ny - 1, Math.ceil((y1 - this.oy) / cell));
    const iz1 = Math.min(nz - 1, Math.ceil((z1 - this.oz) / cell));
    for (let iz = iz0; iz <= iz1; iz++) {
      const z = this.oz + iz * cell;
      for (let iy = iy0; iy <= iy1; iy++) {
        const y = this.oy + iy * cell;
        let index = ix0 + nx * (iy + ny * iz);
        for (let ix = ix0; ix <= ix1; ix++, index++) {
          const d2 = shape(this.ox + ix * cell, y, z, data[index]);
          if (d2 === d2) data[index] = d2;
        }
      }
    }
  }
  sample(x2, y2, z) {
    const { h: cell, nx, ny, nz, data } = this;
    const fx = (x2 - this.ox) / cell;
    const fy = (y2 - this.oy) / cell;
    const fz = (z - this.oz) / cell;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return 6;
    const ix = fx | 0;
    const iy = fy | 0;
    const iz = fz | 0;
    const tx = fx - ix;
    const ty = fy - iy;
    const tz = fz - iz;
    const i0 = ix + nx * (iy + ny * iz);
    const strideY = nx;
    const strideZ = nx * ny;
    const d00 = data[i0] + (data[i0 + 1] - data[i0]) * tx;
    const d10 = data[i0 + strideY] + (data[i0 + strideY + 1] - data[i0 + strideY]) * tx;
    const d01 = data[i0 + strideZ] + (data[i0 + strideZ + 1] - data[i0 + strideZ]) * tx;
    const d11 = data[i0 + strideY + strideZ] + (data[i0 + strideY + strideZ + 1] - data[i0 + strideY + strideZ]) * tx;
    const d0 = d00 + (d10 - d00) * ty;
    return d0 + (d01 + (d11 - d01) * ty - d0) * tz;
  }
  clear(x0, y0, z0, x1, y1, z1, margin = 0.15, step = 0.5) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / step));
    for (let i = 1; i < steps; i++) {
      const frac = i / steps;
      if (this.sample(x0 + dx * frac, y0 + dy * frac, z0 + dz * frac) > -margin) return false;
    }
    return true;
  }
}
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a, b, k) {
  return -smin(-a, -b, k);
}
export function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
export function sdBox(x, y, z, hx, hy, hz) {
  const qx = Math.abs(x) - hx;
  const qy = Math.abs(y) - hy;
  const qz = Math.abs(z) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
}
const _polyHit = {
  d: 0,
  floor: 0,
  t: 0,
};
export function nearestOnPoly(poly, x2, y2, z) {
  let best = Infinity;
  let floor = 0;
  let along = 0;
  const pts = poly.p;
  for (let i = 0; i < poly.n - 1; i++) {
    const i0 = i * 3;
    const i1 = i0 + 3;
    const ax = pts[i0];
    const ay = pts[i0 + 1];
    const az = pts[i0 + 2];
    const abx = pts[i1] - ax;
    const aby = pts[i1 + 1] - ay;
    const abz = pts[i1 + 2] - az;
    const apx = x2 - ax;
    const apy = y2 - ay;
    const apz = z - az;
    const len2 = abx * abx + aby * aby + abz * abz;
    let t = len2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = apx - abx * t;
    const ey = apy - aby * t;
    const ez = apz - abz * t;
    const d2 = ex * ex + ey * ey + ez * ez;
    if (d2 < best) {
      best = d2;
      floor = poly.f[i] + (poly.f[i + 1] - poly.f[i]) * t;
      along = (i + t) / (poly.n - 1);
    }
  }
  _polyHit.d = Math.sqrt(best);
  _polyHit.floor = floor;
  _polyHit.t = along;
  return _polyHit;
}
const CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
];
const EDGES = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];
export function surfaceNets(grid) {
  const { nx, ny, nz, data, h: cell } = grid;
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const vertIndex = new Int32Array(cx * cy * cz).fill(-1);
  const verts = [];
  const cornerD = new Float64Array(8);
  const sy = nx;
  const sz = nx * ny;
  const cornerOff = [0, 1, sy, sy + 1, sz, sz + 1, sz + sy, sz + sy + 1];
  for (let i = 0; i < cz; i++)
    for (let j = 0; j < cy; j++) {
      let gi = nx * (j + ny * i);
      let vi = cx * (j + cy * i);
      for (let k = 0; k < cx; k++, gi++, vi++) {
        let mask = 0;
        for (let corner = 0; corner < 8; corner++) {
          const d = data[gi + cornerOff[corner]];
          cornerD[corner] = d;
          if (d < 0) mask |= 1 << corner;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0;
        let ay = 0;
        let az = 0;
        let count = 0;
        for (let edge = 0; edge < 12; edge++) {
          const [ea, eb] = EDGES[edge];
          if (((mask >> ea) & 1) == ((mask >> eb) & 1)) continue;
          const t = cornerD[ea] / (cornerD[ea] - cornerD[eb]);
          const ca = CORNERS[ea];
          const cb = CORNERS[eb];
          ax += ca[0] + (cb[0] - ca[0]) * t;
          ay += ca[1] + (cb[1] - ca[1]) * t;
          az += ca[2] + (cb[2] - ca[2]) * t;
          count++;
        }
        vertIndex[vi] = verts.length / 3;
        verts.push(
          grid.ox + (k + ax / count) * cell,
          grid.oy + (j + ay / count) * cell,
          grid.oz + (i + az / count) * cell,
        );
      }
    }
  const tris = [];
  const vertAt = (ix, iy, iz) => vertIndex[ix + cx * (iy + cy * iz)];
  const quad = (a, b, c, d, flip) => {
    if (!(a < 0 || b < 0 || c < 0 || d < 0))
      if (flip) tris.push(a, c, b, a, d, c);
      else tris.push(a, b, c, a, c, d);
  };
  for (let i = 0; i < nz; i++)
    for (let j = 0; j < ny; j++)
      for (let k = 0; k < nx; k++) {
        const gi = k + nx * (j + ny * i);
        const inside = data[gi] < 0;
        if (k < cx && j > 0 && i > 0 && j < cy && i < cz && inside !== data[gi + 1] < 0)
          quad(vertAt(k, j - 1, i - 1), vertAt(k, j, i - 1), vertAt(k, j, i), vertAt(k, j - 1, i), inside);
        if (j < cy && k > 0 && i > 0 && k < cx && i < cz && inside !== data[gi + sy] < 0)
          quad(vertAt(k - 1, j, i - 1), vertAt(k - 1, j, i), vertAt(k, j, i), vertAt(k, j, i - 1), inside);
        if (i < cz && k > 0 && j > 0 && k < cx && j < cy && inside !== data[gi + sz] < 0)
          quad(vertAt(k - 1, j - 1, i), vertAt(k, j - 1, i), vertAt(k, j, i), vertAt(k - 1, j, i), inside);
      }
  return {
    positions: new Float32Array(verts),
    indices: new Uint32Array(tris),
  };
}
