/**
 * Paint volume: sparse 3D paint coverage with one RGBA channel per ink, kept as 8-voxel bricks with a one-voxel apron in a 3D texture atlas plus an indirection table. Paints and erases through coverage functions, samples on the CPU, evicts the least recently painted bricks and uploads changes to the GPU on a budget.
 */
import { ClampToEdgeWrapping, Data3DTexture, LinearFilter, RGBAFormat, UnsignedByteType, Vector3 } from 'three';
import {
  ATLAS_DEPTH,
  CELL_COUNT,
  GRID_X,
  GRID_Y,
  GRID_Z,
  INDIRECTION_LAYERS,
  SLOT_BYTES,
  SLOT_COUNT,
  VOLUME_MIN,
  VOXEL_SIZE,
  VOXELS_X,
  VOXELS_Y,
  VOXELS_Z,
} from './constants.js';
const INV_VOXEL = 1 / VOXEL_SIZE;
const PAD2 = 100;
export class PaintVolume {
  texture;
  slotData = new Uint8Array(SLOT_COUNT * SLOT_BYTES);
  cellSlot = new Int32Array(CELL_COUNT).fill(-1);
  slotCell = new Int32Array(SLOT_COUNT).fill(-1);
  slotStamp = new Float64Array(SLOT_COUNT);
  freeSlots = [];
  indData = new Uint8Array(25600 * INDIRECTION_LAYERS * 4);
  dirtySlotFlag = new Uint8Array(SLOT_COUNT);
  dirtySlots = [];
  dirtyRowFlag = new Uint8Array(160 * INDIRECTION_LAYERS);
  dirtyRows = [];
  stagingBrick;
  stagingRow;
  dstPos = new Vector3();
  op = 1;
  gpuReady = false;
  ax = new AxisMap(VOXELS_X);
  ay = new AxisMap(VOXELS_Y);
  az = new AxisMap(VOXELS_Z);
  allocated = 0;
  evictions = 0;
  constructor() {
    for (let i = SLOT_COUNT - 1; i >= 0; i--) this.freeSlots.push(i);
    const texture = new Data3DTexture(null, 160, 160, ATLAS_DEPTH);
    texture.format = RGBAFormat;
    texture.type = UnsignedByteType;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.wrapS = texture.wrapT = texture.wrapR = ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.unpackAlignment = 1;
    texture.source.dataReady = false;
    texture.needsUpdate = true;
    texture.name = 'wb-paint-volume';
    this.texture = texture;
    this.stagingBrick = new Data3DTexture(new Uint8Array(SLOT_BYTES), 10, 10, 10);
    this.stagingBrick.unpackAlignment = 1;
    this.stagingRow = new Data3DTexture(new Uint8Array(640), 160, 1, 1);
    this.stagingRow.unpackAlignment = 1;
  }
  init(renderer) {
    try {
      renderer.initTexture(this.texture);
      this.gpuReady = true;
    } catch (err) {
      console.warn('[paint] volume init failed', err);
    }
  }
  sample(x2, y2, z, out) {
    out[0] = out[1] = out[2] = out[3] = 0;
    const vx = (x2 - VOLUME_MIN.x) * INV_VOXEL;
    const vy = (y2 - VOLUME_MIN.y) * INV_VOXEL;
    const vz = (z - VOLUME_MIN.z) * INV_VOXEL;
    const bx = Math.floor(vx / 8);
    const by = Math.floor(vy / 8);
    const bz = Math.floor(vz / 8);
    if (bx < 0 || by < 0 || bz < 0 || bx >= GRID_X || by >= GRID_Y || bz >= GRID_Z) return;
    const slot = this.cellSlot[bx + GRID_X * (bz + GRID_Z * by)];
    if (slot < 0) return;
    const lx = vx - bx * 8 + 0.5;
    const ly = vy - by * 8 + 0.5;
    const lz = vz - bz * 8 + 0.5;
    const ix = Math.floor(lx);
    const iy = Math.floor(ly);
    const iz = Math.floor(lz);
    const fx = lx - ix;
    const fy = ly - iy;
    const fz = lz - iz;
    const slotData = this.slotData;
    const base = slot * SLOT_BYTES;
    for (let i = 0; i < 8; i++) {
      const ox = i & 1;
      const oy = (i >> 1) & 1;
      const oz = (i >> 2) & 1;
      const w = (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy) * (oz ? fz : 1 - fz);
      if (w <= 0) continue;
      const idx = base + ((iz + oz) * PAD2 + (iy + oy) * 10 + (ix + ox)) * 4;
      out[0] += slotData[idx] * w;
      out[1] += slotData[idx + 1] * w;
      out[2] += slotData[idx + 2] * w;
      out[3] += slotData[idx + 3] * w;
    }
    const inv = 1 / 255;
    out[0] *= inv;
    out[1] *= inv;
    out[2] *= inv;
    out[3] *= inv;
  }
  anyIn(x0, y0, z0, x1, y1, z1) {
    const brick = 8 * VOXEL_SIZE;
    const bx0 = Math.max(0, Math.floor((x0 - VOLUME_MIN.x) / brick));
    const by0 = Math.max(0, Math.floor((y0 - VOLUME_MIN.y) / brick));
    const bz0 = Math.max(0, Math.floor((z0 - VOLUME_MIN.z) / brick));
    const bx1 = Math.min(GRID_X - 1, Math.floor((x1 - VOLUME_MIN.x) / brick));
    const by1 = Math.min(GRID_Y - 1, Math.floor((y1 - VOLUME_MIN.y) / brick));
    const bz1 = Math.min(GRID_Z - 1, Math.floor((z1 - VOLUME_MIN.z) / brick));
    for (let by = by0; by <= by1; by++)
      for (let bz = bz0; bz <= bz1; bz++)
        for (let bx = bx0; bx <= bx1; bx++) if (this.cellSlot[bx + GRID_X * (bz + GRID_Z * by)] >= 0) return true;
    return false;
  }
  paint(x0, y0, z0, x1, y1, z1, channel, fn, strength = 1) {
    return this.write(x0, y0, z0, x1, y1, z1, fn, channel, 0, strength);
  }
  erase(x0, y0, z0, x1, y1, z1, mask, fn, strength = 1) {
    return this.write(x0, y0, z0, x1, y1, z1, fn, -1, mask, strength);
  }
  write(x0, y0, z0, x1, y1, z1, fn, channel, eraseMask, strength) {
    const vx0 = Math.max(0, Math.floor((x0 - VOLUME_MIN.x) * INV_VOXEL));
    const vy0 = Math.max(0, Math.floor((y0 - VOLUME_MIN.y) * INV_VOXEL));
    const vz0 = Math.max(0, Math.floor((z0 - VOLUME_MIN.z) * INV_VOXEL));
    const vx1 = Math.min(VOXELS_X - 1, Math.floor((x1 - VOLUME_MIN.x) * INV_VOXEL));
    const vy1 = Math.min(VOXELS_Y - 1, Math.floor((y1 - VOLUME_MIN.y) * INV_VOXEL));
    const vz1 = Math.min(VOXELS_Z - 1, Math.floor((z1 - VOLUME_MIN.z) * INV_VOXEL));
    if (vx0 > vx1 || vy0 > vy1 || vz0 > vz1 || (vx1 - vx0) * (vy1 - vy0) * (vz1 - vz0) > 4000000) return 0;
    this.op++;
    const adding = channel >= 0;
    this.ax.build(vx0, vx1);
    this.ay.build(vy0, vy1);
    this.az.build(vz0, vz1);
    const slotData = this.slotData;
    let changed = 0;
    for (let vy = vy0; vy <= vy1; vy++) {
      const wy = VOLUME_MIN.y + (vy + 0.5) * VOXEL_SIZE;
      const iy = vy - vy0;
      for (let vz = vz0; vz <= vz1; vz++) {
        const wz = VOLUME_MIN.z + (vz + 0.5) * VOXEL_SIZE;
        const iz = vz - vz0;
        for (let vx = vx0; vx <= vx1; vx++) {
          let amount = fn(VOLUME_MIN.x + (vx + 0.5) * VOXEL_SIZE, wy, wz);
          if (!(amount > 0.002)) continue;
          amount *= strength;
          if (amount > 1) amount = 1;
          const ix = vx - vx0;
          const bx = this.ax.b0[ix];
          const by = this.ay.b0[iy];
          const bz = this.az.b0[iz];
          const cell = bx + GRID_X * (bz + GRID_Z * by);
          let slot = this.cellSlot[cell];
          if (slot < 0 && (!adding || ((slot = this.allocate(cell)), slot < 0))) continue;
          const idx = slot * SLOT_BYTES + (this.az.p0[iz] * PAD2 + this.ay.p0[iy] * 10 + this.ax.p0[ix]) * 4;
          let r2 = slotData[idx];
          let g = slotData[idx + 1];
          let b = slotData[idx + 2];
          let a2 = slotData[idx + 3];
          const r0 = r2;
          const g0 = g;
          const b0 = b;
          const a0 = a2;
          if (adding) {
            const value = Math.round(amount * 255);
            const ramp = amount < 0.25 ? 0 : amount > 0.75 ? 1 : (amount - 0.25) * 2;
            const keep = 1 - ramp * ramp * (3 - 2 * ramp);
            if (channel === 0) {
              if (value > r2) r2 = value;
              g = (g * keep) | 0;
              b = (b * keep) | 0;
              a2 = (a2 * keep) | 0;
            } else if (channel === 1) {
              if (value > g) g = value;
              r2 = (r2 * keep) | 0;
              b = (b * keep) | 0;
              a2 = (a2 * keep) | 0;
            } else if (channel === 2) {
              if (value > b) b = value;
              r2 = (r2 * keep) | 0;
              g = (g * keep) | 0;
              a2 = (a2 * keep) | 0;
            } else {
              if (value > a2) a2 = value;
              r2 = (r2 * keep) | 0;
              g = (g * keep) | 0;
              b = (b * keep) | 0;
            }
          } else {
            const keep = 1 - amount;
            if (eraseMask & 1) r2 = (r2 * keep) | 0;
            if (eraseMask & 2) g = (g * keep) | 0;
            if (eraseMask & 4) b = (b * keep) | 0;
            if (eraseMask & 8) a2 = (a2 * keep) | 0;
          }
          if (r2 === r0 && g === g0 && b === b0 && a2 === a0) continue;
          changed++;
          const copiesX = this.ax.b1[ix] >= 0 ? 2 : 1;
          const copiesY = this.ay.b1[iy] >= 0 ? 2 : 1;
          const copiesZ = this.az.b1[iz] >= 0 ? 2 : 1;
          for (let cy = 0; cy < copiesY; cy++) {
            const brickY = cy ? this.ay.b1[iy] : by;
            const padY = cy ? this.ay.p1[iy] : this.ay.p0[iy];
            for (let cz = 0; cz < copiesZ; cz++) {
              const brickZ = cz ? this.az.b1[iz] : bz;
              const padZ = cz ? this.az.p1[iz] : this.az.p0[iz];
              for (let cx = 0; cx < copiesX; cx++) {
                const brickX = cx ? this.ax.b1[ix] : bx;
                const padX = cx ? this.ax.p1[ix] : this.ax.p0[ix];
                const copyCell = brickX + GRID_X * (brickZ + GRID_Z * brickY);
                let copySlot = this.cellSlot[copyCell];
                if (copySlot < 0 && (!adding || ((copySlot = this.allocate(copyCell)), copySlot < 0))) continue;
                const dst = copySlot * SLOT_BYTES + (padZ * PAD2 + padY * 10 + padX) * 4;
                slotData[dst] = r2;
                slotData[dst + 1] = g;
                slotData[dst + 2] = b;
                slotData[dst + 3] = a2;
                this.touch(copySlot);
              }
            }
          }
        }
      }
    }
    return changed;
  }
  touch(slot) {
    this.slotStamp[slot] = this.op;
    if (!this.dirtySlotFlag[slot]) {
      this.dirtySlotFlag[slot] = 1;
      this.dirtySlots.push(slot);
    }
  }
  allocate(cell) {
    let slot = this.freeSlots.pop();
    if (slot === undefined && ((slot = this.evictOldest()), slot < 0)) {
      return -1;
    } else {
      this.cellSlot[cell] = slot;
      this.slotCell[slot] = cell;
      this.slotStamp[slot] = this.op;
      this.allocated++;
      this.slotData.fill(0, slot * SLOT_BYTES, (slot + 1) * SLOT_BYTES);
      this.refreshApron(slot, cell);
      this.setIndirection(cell, slot);
      this.touch(slot);
      return slot;
    }
  }
  evictOldest() {
    let victim = -1;
    let oldest = Infinity;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const stamp = this.slotStamp[i];
      if (this.slotCell[i] >= 0 && stamp < oldest && stamp < this.op) {
        oldest = stamp;
        victim = i;
      }
    }
    if (victim < 0) return -1;
    const cell = this.slotCell[victim];
    this.cellSlot[cell] = -1;
    this.slotCell[victim] = -1;
    this.allocated--;
    this.evictions++;
    this.setIndirection(cell, -1);
    const [cx, cy, cz] = cellCoords(cell);
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy && !dz) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          const nz = cz + dz;
          if (nx < 0 || ny < 0 || nz < 0 || nx >= GRID_X || ny >= GRID_Y || nz >= GRID_Z) continue;
          const nCell = nx + GRID_X * (nz + GRID_Z * ny);
          const nSlot = this.cellSlot[nCell];
          if (nSlot >= 0) {
            this.refreshApron(nSlot, nCell);
            this.touch(nSlot);
          }
        }
    return victim;
  }
  refreshApron(slot, cell) {
    const [cx, cy, cz] = cellCoords(cell);
    const slotData = this.slotData;
    const base = slot * SLOT_BYTES;
    for (let pz = 0; pz < 10; pz++) {
      const edgeZ = pz === 0 || pz === 9;
      for (let py = 0; py < 10; py++) {
        const edgeY = py === 0 || py === 9;
        for (let px = 0; px < 10; px++) {
          if (!edgeZ && !edgeY && px !== 0 && px !== 9) {
            px = 8;
            continue;
          }
          const gx = cx * 8 + px - 1;
          const gy = cy * 8 + py - 1;
          const gz = cz * 8 + pz - 1;
          const idx = base + (pz * PAD2 + py * 10 + px) * 4;
          if (gx < 0 || gy < 0 || gz < 0 || gx >= VOXELS_X || gy >= 1024 || gz >= VOXELS_Z) {
            slotData[idx] = slotData[idx + 1] = slotData[idx + 2] = slotData[idx + 3] = 0;
            continue;
          }
          const bx = Math.floor(gx / 8);
          const by = Math.floor(gy / 8);
          const bz = Math.floor(gz / 8);
          const srcSlot = this.cellSlot[bx + GRID_X * (bz + GRID_Z * by)];
          if (srcSlot < 0) {
            slotData[idx] = slotData[idx + 1] = slotData[idx + 2] = slotData[idx + 3] = 0;
            continue;
          }
          const src =
            srcSlot * SLOT_BYTES + ((gz - bz * 8 + 1) * PAD2 + (gy - by * 8 + 1) * 10 + (gx - bx * 8 + 1)) * 4;
          slotData[idx] = slotData[src];
          slotData[idx + 1] = slotData[src + 1];
          slotData[idx + 2] = slotData[src + 2];
          slotData[idx + 3] = slotData[src + 3];
        }
      }
    }
  }
  setIndirection(cell, slot) {
    const idx = cell * 4;
    if (slot >= 0) {
      this.indData[idx] = slot % 16;
      this.indData[idx + 1] = Math.floor(slot / 16) % 16;
      this.indData[idx + 2] = Math.floor(slot / 256);
      this.indData[idx + 3] = 255;
    } else this.indData[idx] = this.indData[idx + 1] = this.indData[idx + 2] = this.indData[idx + 3] = 0;
    const row = Math.floor(cell / 160);
    if (!this.dirtyRowFlag[row]) {
      this.dirtyRowFlag[row] = 1;
      this.dirtyRows.push(row);
    }
  }
  clear() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const cell = this.slotCell[i];
      if (cell >= 0) {
        this.cellSlot[cell] = -1;
        this.slotCell[i] = -1;
        this.setIndirection(cell, -1);
      }
    }
    this.freeSlots.length = 0;
    for (let i = SLOT_COUNT - 1; i >= 0; i--) this.freeSlots.push(i);
    this.allocated = 0;
  }
  flush(renderer, budget = 384) {
    if (!this.gpuReady) return 0;
    let uploads = 0;
    const dstPos = this.dstPos;
    let bricks = 0;
    for (; this.dirtySlots.length && bricks < budget;) {
      const slot = this.dirtySlots.pop();
      this.dirtySlotFlag[slot] = 0;
      if (this.slotCell[slot] < 0) continue;
      const offset = slot * SLOT_BYTES;
      this.stagingBrick.image.data = this.slotData.subarray(offset, offset + SLOT_BYTES);
      dstPos.set((slot % 16) * 10, (Math.floor(slot / 16) % 16) * 10, Math.floor(slot / 256) * 10);
      renderer.copyTextureToTexture(this.stagingBrick, this.texture, null, dstPos);
      bricks++;
      uploads++;
    }
    if (this.dirtySlots.length) return uploads;
    for (const row of this.dirtyRows) {
      this.dirtyRowFlag[row] = 0;
      const offset = row * 160 * 4;
      this.stagingRow.image.data = this.indData.subarray(offset, offset + 640);
      dstPos.set(0, row % 160, 240 + Math.floor(row / 160));
      renderer.copyTextureToTexture(this.stagingRow, this.texture, null, dstPos);
      uploads++;
    }
    this.dirtyRows.length = 0;
    return uploads;
  }
}
function cellCoords(cell) {
  const x = cell % GRID_X;
  const rest = Math.floor(cell / GRID_X);
  const z = rest % GRID_Z;
  return [x, Math.floor(rest / GRID_Z), z];
}
class AxisMap {
  n;
  b0;
  p0;
  b1;
  p1;
  constructor(size) {
    this.n = size;
    this.b0 = new Int32Array(512);
    this.p0 = new Int32Array(512);
    this.b1 = new Int32Array(512);
    this.p1 = new Int32Array(512);
  }
  build(from, to) {
    const count = to - from + 1;
    if (count > this.b0.length) {
      const cap = count + 64;
      this.b0 = new Int32Array(cap);
      this.p0 = new Int32Array(cap);
      this.b1 = new Int32Array(cap);
      this.p1 = new Int32Array(cap);
    }
    const bricks = Math.ceil(this.n / 8);
    for (let i = 0; i < count; i++) {
      const v = from + i;
      const brick = Math.floor(v / 8);
      const local = v - brick * 8;
      this.b0[i] = brick;
      this.p0[i] = local + 1;
      if (local === 0 && brick > 0) {
        this.b1[i] = brick - 1;
        this.p1[i] = 9;
      } else if (local === 7 && brick < bricks - 1) {
        this.b1[i] = brick + 1;
        this.p1[i] = 0;
      } else {
        this.b1[i] = -1;
        this.p1[i] = 0;
      }
    }
  }
}
