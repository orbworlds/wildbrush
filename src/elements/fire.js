/**
 * Fire simulation on a 1 m grid: grass, trees and flammable objects heat up, catch and spread with wind and slope, burn out into the burn map and regrow later. Heat is pooled into blocks that drive updrafts, smoke, embers and the flickering fire lights.
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  PointLight,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from 'three';
import { DRY_MEADOW } from '../core/config.js';
import { clamp, damp, makeNoise2D, smoothstep } from '../core/math.js';
import { hash, rand } from './util.js';
function readWind(ctx, out) {
  const globals = ctx.globals;
  const wind = ctx.environment?.wind;
  const dir = wind?.direction ?? globals.uWindDir.value;
  const strength = wind?.strength ?? globals.uWindStrength.value;
  const len = Math.hypot(dir.x, dir.y) || 1;
  out.x = dir.x / len;
  out.z = dir.y / len;
  out.s = Number.isFinite(strength) ? Math.max(0, Math.min(1.5, strength)) : 0.5;
  return out;
}
const GRID_SIZE = 320;
const GRID_ORIGIN = -160;
const TICK = 0.1;
const TILE = 16;
const TILES = GRID_SIZE / TILE;
const BLOCK = 4;
const BLOCKS = GRID_SIZE / BLOCK;
const TREE_CELL = 8;
const TREE_CELLS = GRID_SIZE / TREE_CELL;
const SPREAD_RATE = 0.55;
const SMOULDER_TIME = 4;
const REGROW_TIME = 16;
const NEIGHBOR_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NEIGHBOR_DZ = [0, 0, 1, -1, 1, -1, 1, -1];
export class FireSim {
  ctx;
  flames;
  fx;
  budget;
  state = new Uint8Array(GRID_SIZE * GRID_SIZE);
  fuel = new Float32Array(GRID_SIZE * GRID_SIZE).fill(-1);
  dry = new Float32Array(GRID_SIZE * GRID_SIZE);
  gy = new Float32Array(GRID_SIZE * GRID_SIZE);
  heat = new Float32Array(GRID_SIZE * GRID_SIZE);
  ignT = new Float32Array(GRID_SIZE * GRID_SIZE);
  endT = new Float32Array(GRID_SIZE * GRID_SIZE);
  peak = new Float32Array(GRID_SIZE * GRID_SIZE);
  curI = new Float32Array(GRID_SIZE * GRID_SIZE);
  burnt = new Float32Array(GRID_SIZE * GRID_SIZE);
  regrowT = new Float32Array(GRID_SIZE * GRID_SIZE);
  regrowRate = new Float32Array(GRID_SIZE * GRID_SIZE);
  inRecover = new Uint8Array(GRID_SIZE * GRID_SIZE);
  burning = [];
  recovering = [];
  texture;
  texData = new Uint8Array(GRID_SIZE * GRID_SIZE * 4);
  dirtyTile = new Uint8Array(TILES * TILES);
  dirtyList = [];
  bHeat = new Float32Array(BLOCKS * BLOCKS);
  bSum = new Float32Array(BLOCKS * BLOCKS);
  bSx = new Float32Array(BLOCKS * BLOCKS);
  bSz = new Float32Array(BLOCKS * BLOCKS);
  bSy = new Float32Array(BLOCKS * BLOCKS);
  bX = new Float32Array(BLOCKS * BLOCKS);
  bZ = new Float32Array(BLOCKS * BLOCKS);
  bY = new Float32Array(BLOCKS * BLOCKS);
  bTouched = new Uint8Array(BLOCKS * BLOCKS);
  bInHot = new Uint8Array(BLOCKS * BLOCKS);
  touched = [];
  hot = [];
  treeCache = new Map();
  treeById = new Map();
  burningTrees = [];
  burntTrees = [];
  flammables = [];
  heatSources = () => [];
  lights = [];
  lightTarget = [];
  lightCur = [];
  fuelNoise = makeNoise2D('wb-fuel');
  acc = 0;
  now = 0;
  wind = {
    x: 1,
    z: 0,
    s: 0.5,
  };
  tmp = new Vector3();
  sample = {
    red: 0,
    blue: 0,
    yellow: 0,
    green: 0,
  };
  emberAcc = 0;
  treeCheckAcc = 0;
  constructor(ctx, flames, fx, budget) {
    this.ctx = ctx;
    this.flames = flames;
    this.fx = fx;
    this.budget = budget;
    const texture = new DataTexture(this.texData, GRID_SIZE, GRID_SIZE, RGBAFormat, UnsignedByteType);
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.colorSpace = '';
    texture.needsUpdate = true;
    this.texture = texture;
    for (let i = 0; i < budget.lights; i++) {
      const light = new PointLight(0xff7a2e, 0, 30, 1.25);
      light.castShadow = false;
      light.position.set(0, -500, 0);
      ctx.scene.add(light);
      this.lights.push(light);
      this.lightTarget.push({
        x: 0,
        y: -500,
        z: 0,
        i: 0,
      });
      this.lightCur.push(0);
    }
  }
  cellAt(x, z) {
    const cx = Math.floor(x - GRID_ORIGIN);
    const cz = Math.floor(z - GRID_ORIGIN);
    return cx < 0 || cz < 0 || cx >= GRID_SIZE || cz >= GRID_SIZE ? -1 : cz * GRID_SIZE + cx;
  }
  ensure(cell) {
    if (this.fuel[cell] >= 0) return;
    const x = GRID_ORIGIN + (cell % GRID_SIZE) + 0.5;
    const z = GRID_ORIGIN + ((cell / GRID_SIZE) | 0) + 0.5;
    let y = 0;
    let grass = 0;
    try {
      y = this.ctx.terrain.heightAt(x, z);
      grass = this.ctx.terrain.grassDensityAt(x, z);
    } catch {}
    if (!Number.isFinite(y)) y = 0;
    if (!Number.isFinite(grass)) grass = 0;
    this.gy[cell] = y;
    const dist = Math.hypot(x - DRY_MEADOW.x, z - DRY_MEADOW.z);
    const dry = smoothstep(DRY_MEADOW.radius, DRY_MEADOW.radius * 0.72, dist);
    this.dry[cell] = dry;
    let fuel = y < 0.3 ? 0 : clamp(grass, 0, 1);
    if (dry > 0.2 && fuel > 0.05) fuel = Math.max(fuel, 0.85 * dry);
    const noise = this.fuelNoise(x * 0.07, z * 0.07) * 0.65 + this.fuelNoise(x * 0.23 + 17, z * 0.23) * 0.35;
    fuel *= 0.62 + 0.62 * noise;
    this.fuel[cell] = fuel < 0.12 ? 0 : fuel;
  }
  write(cell, burnt, glow) {
    const idx = cell * 4;
    const r = burnt <= 0 ? 0 : burnt >= 1 ? 255 : (burnt * 255 + 0.5) | 0;
    const g = glow <= 0 ? 0 : glow >= 1 ? 255 : (glow * 255 + 0.5) | 0;
    if (this.texData[idx] === r && this.texData[idx + 1] === g) return;
    this.texData[idx] = r;
    this.texData[idx + 1] = g;
    const tile = ((((cell / GRID_SIZE) | 0) / TILE) | 0) * TILES + (((cell % GRID_SIZE) / TILE) | 0);
    if (!this.dirtyTile[tile]) {
      this.dirtyTile[tile] = 1;
      this.dirtyList.push(tile);
    }
  }
  flushTexture() {
    const dirtyList = this.dirtyList;
    if (!dirtyList.length) return;
    const texture = this.texture;
    if (dirtyList.length > 140) texture.clearUpdateRanges();
    else
      for (const tile of dirtyList) {
        const tx = tile % TILES;
        const tz = (tile / TILES) | 0;
        for (let row = 0; row < TILE; row++)
          texture.addUpdateRange(((tz * TILE + row) * GRID_SIZE + tx * TILE) * 4, 64);
      }
    for (const tile of dirtyList) this.dirtyTile[tile] = 0;
    dirtyList.length = 0;
    texture.needsUpdate = true;
  }
  forCells(x, z, radius, fn) {
    const x0 = Math.max(0, Math.floor(x - radius - GRID_ORIGIN));
    const x1 = Math.min(GRID_SIZE - 1, Math.floor(x + radius - GRID_ORIGIN));
    const z0 = Math.max(0, Math.floor(z - radius - GRID_ORIGIN));
    const z1 = Math.min(GRID_SIZE - 1, Math.floor(z + radius - GRID_ORIGIN));
    const r2 = (radius + 0.5) * (radius + 0.5);
    for (let i = z0; i <= z1; i++) {
      const dz = GRID_ORIGIN + i + 0.5 - z;
      for (let j = x0; j <= x1; j++) {
        const dx = GRID_ORIGIN + j + 0.5 - x;
        const d2 = dx * dx + dz * dz;
        if (d2 <= r2) fn(i * GRID_SIZE + j, Math.sqrt(d2));
      }
    }
  }
  wetByPaint(cell) {
    const paint = this.ctx.paint;
    if (!paint || paint.isStub) return false;
    try {
      this.tmp.set(
        GRID_ORIGIN + (cell % GRID_SIZE) + 0.5,
        this.gy[cell] + 0.2,
        GRID_ORIGIN + ((cell / GRID_SIZE) | 0) + 0.5,
      );
      return paint.sample(this.tmp, this.sample).blue > 0.35;
    } catch {
      return false;
    }
  }
  igniteCell(cell, now, force = false, duration = 0, peak = 0) {
    if (cell < 0 || this.state[cell] === 1) return false;
    this.ensure(cell);
    const fuel = this.fuel[cell];
    if (!force && (fuel <= 0 || (this.state[cell] === 2 && this.burnt[cell] > 0.35))) return false;
    const dry = this.dry[cell];
    this.state[cell] = 1;
    this.ignT[cell] = now;
    this.endT[cell] =
      now + (duration > 0 ? duration : (dry > 0.3 ? rand(3, 4.3) : rand(3.6, 5.2)) * (0.75 + 0.25 * fuel));
    this.peak[cell] = peak > 0 ? peak : clamp(0.55 + fuel * 0.35 + dry * 0.35, 0.3, 1.25);
    this.heat[cell] = 0;
    this.burning.push(cell);
    return true;
  }
  pushRecover(cell) {
    if (!this.inRecover[cell]) {
      this.inRecover[cell] = 1;
      this.recovering.push(cell);
    }
  }
  burnOut(cell, now) {
    this.state[cell] = 2;
    this.burnt[cell] = 1;
    this.curI[cell] = 0;
    this.regrowT[cell] = now + rand(48, 72);
    this.regrowRate[cell] = 1 / REGROW_TIME;
    this.write(cell, 1, 0.3);
    this.pushRecover(cell);
  }
  treesAt(x, z) {
    const cx = Math.floor((x - GRID_ORIGIN) / TREE_CELL);
    const cz = Math.floor((z - GRID_ORIGIN) / TREE_CELL);
    if (cx < 0 || cz < 0 || cx >= TREE_CELLS || cz >= TREE_CELLS) return [];
    const key = cz * TREE_CELLS + cx;
    let list = this.treeCache.get(key);
    if (list) return list;
    list = [];
    const vegetation = this.ctx.vegetation;
    if (vegetation && !vegetation.isStub)
      try {
        this.tmp.set(GRID_ORIGIN + (cx + 0.5) * TREE_CELL, 0, GRID_ORIGIN + (cz + 0.5) * TREE_CELL);
        const near = vegetation.treesNear(this.tmp, 9.76) ?? [];
        for (const veg of near) {
          if (!veg || !veg.position) continue;
          let tree = this.treeById.get(veg.id);
          if (!tree) {
            tree = {
              id: veg.id,
              x: veg.position.x,
              y: veg.position.y,
              z: veg.position.z,
              radius: clamp(veg.radius || 2, 0.8, 6),
              height: clamp(veg.height || 6, 1.5, 20),
              flammable: veg.flammable !== false,
              state: 0,
              heat: 0,
              ign: 0,
              end: 0,
            };
            this.treeById.set(veg.id, tree);
          }
          list.push(tree);
        }
      } catch {}
    this.treeCache.set(key, list);
    return list;
  }
  igniteTree(tree, now) {
    if (tree.state !== 0 || !tree.flammable) {
      return false;
    } else {
      tree.state = 1;
      tree.ign = now;
      tree.end = now + rand(13, 18);
      tree.heat = 0;
      this.burningTrees.push(tree);
      this.forCells(tree.x, tree.z, Math.max(0.8, tree.radius * 0.5), (cell) =>
        this.igniteCell(cell, now, true, tree.end - now + 0.4, 1.1),
      );
      this.fx.ignition(tree.x, tree.y + tree.height * 0.55, tree.z, tree.radius * 0.8);
      this.ctx.events.emit('fire:ignite', {
        position: new Vector3(tree.x, tree.y + tree.height * 0.5, tree.z),
      });
      return true;
    }
  }
  ignite(pos, radius = 1.5, withFx = true) {
    const elapsed = this.ctx.time.elapsed;
    let count = 0;
    const r2 = clamp(radius, 0.5, 12);
    this.forCells(pos.x, pos.z, r2, (cell) => {
      if (this.igniteCell(cell, elapsed)) {
        this.ignT[cell] -= Math.random() * 0.3;
        count++;
      }
    });
    for (const tree of this.treesAt(pos.x, pos.z))
      if (
        Math.hypot(tree.x - pos.x, tree.z - pos.z) < tree.radius + r2 &&
        pos.y < tree.y + tree.height + 1.5 &&
        tree.state === 0 &&
        tree.flammable &&
        this.igniteTree(tree, elapsed)
      )
        count++;
    for (const flammable of this.flammables) {
      if (flammable.state !== 0) continue;
      const position = flammable.f.position;
      if (
        Math.hypot(position.x - pos.x, position.z - pos.z) < flammable.f.radius + r2 &&
        Math.abs(position.y - pos.y) < flammable.f.radius + r2 + 3
      ) {
        this.igniteFlammable(flammable, elapsed);
        count++;
      }
    }
    if (count > 0 && withFx) {
      this.fx.ignition(pos.x, pos.y, pos.z, r2);
      this.ctx.events.emit('fire:ignite', {
        position: pos.clone(),
      });
    }
    return count > 0;
  }
  extinguish(pos, radius = 2) {
    const elapsed = this.ctx.time.elapsed;
    let count = 0;
    const r = clamp(radius, 0.5, 20);
    this.forCells(pos.x, pos.z, r + 1, (cell, dist) => {
      if (this.state[cell] === 1 && dist <= r + 0.5) {
        const progress = clamp((elapsed - this.ignT[cell]) / Math.max(0.1, this.endT[cell] - this.ignT[cell]), 0, 1);
        this.state[cell] = 2;
        this.burnt[cell] = Math.max(this.burnt[cell], 0.35 + progress * 0.65);
        this.curI[cell] = 0;
        this.endT[cell] = elapsed - SMOULDER_TIME;
        this.regrowT[cell] = elapsed + rand(25, 40);
        this.regrowRate[cell] = 1 / REGROW_TIME;
        this.write(cell, this.burnt[cell], 0);
        this.pushRecover(cell);
        count++;
      }
      this.heat[cell] = -3;
    });
    for (const burningTree of this.burningTrees)
      if (
        burningTree.state === 1 &&
        Math.hypot(burningTree.x - pos.x, burningTree.z - pos.z) < burningTree.radius + r
      ) {
        burningTree.state = elapsed - burningTree.ign > (burningTree.end - burningTree.ign) * 0.6 ? 2 : 0;
        burningTree.heat = -2;
        if (burningTree.state === 2) this.burntTrees.push(burningTree);
        count++;
      }
    for (const flammable of this.flammables)
      if (flammable.state === 1 && flammable.f.position.distanceTo(pos) < flammable.f.radius + r + 1) {
        flammable.state = 0;
        flammable.heat = -1;
        count++;
      }
    if (count > 0)
      this.ctx.events.emit('fire:extinguish', {
        position: pos.clone(),
      });
    return count > 0;
  }
  isBurning(pos, radius = 1) {
    let found = false;
    this.forCells(pos.x, pos.z, clamp(radius, 0, 20), (cell) => {
      if (this.state[cell] === 1) found = true;
    });
    if (found) return true;
    for (const burningTree of this.burningTrees)
      if (
        burningTree.state === 1 &&
        Math.hypot(burningTree.x - pos.x, burningTree.z - pos.z) < burningTree.radius + radius &&
        pos.y < burningTree.y + burningTree.height + 2
      )
        return true;
    for (const flammable of this.flammables)
      if (flammable.state === 1 && flammable.f.position.distanceTo(pos) < flammable.f.radius + radius) return true;
    return false;
  }
  intensityAt(x, z) {
    const cell = this.cellAt(x, z);
    return cell >= 0 && this.state[cell] === 1 ? this.curI[cell] : 0;
  }
  flammableAt(x, z) {
    const cell = this.cellAt(x, z);
    if (cell < 0) {
      return false;
    } else {
      this.ensure(cell);
      return this.fuel[cell] > 0 && !(this.state[cell] === 2 && this.burnt[cell] > 0.35);
    }
  }
  regrow(pos, radius = 2.5) {
    const elapsed = this.ctx.time.elapsed;
    let count = 0;
    this.forCells(pos.x, pos.z, radius, (cell, dist) => {
      if (this.state[cell] === 2) {
        this.regrowT[cell] = Math.min(this.regrowT[cell], elapsed + dist * 0.09);
        this.regrowRate[cell] = 1 / 1.4;
        count++;
      }
    });
    if (count)
      for (const burntTree of this.burntTrees)
        if (Math.hypot(burntTree.x - pos.x, burntTree.z - pos.z) < radius + burntTree.radius)
          this.forCells(burntTree.x, burntTree.z, burntTree.radius * 0.8, (cell) => {
            if (this.state[cell] === 2) {
              this.regrowT[cell] = Math.min(this.regrowT[cell], elapsed + 0.4);
              this.regrowRate[cell] = 1 / 2.5;
            }
          });
    return count > 0;
  }
  isBurnt(pos, radius = 1.5) {
    let found = false;
    this.forCells(pos.x, pos.z, radius, (cell) => {
      if (this.state[cell] === 2 && this.burnt[cell] > 0.15) found = true;
    });
    return found;
  }
  addFlammable(f) {
    if (f && f.position)
      this.flammables.push({
        f,
        state: 0,
        heat: 0,
        ign: 0,
        end: 0,
        seed: Math.random(),
      });
  }
  igniteFlammable(flammable, now) {
    if (flammable.state !== 0) return;
    flammable.state = 1;
    flammable.ign = now;
    flammable.end = now + 4.8 + flammable.f.radius * 0.25;
    flammable.heat = 0;
    try {
      flammable.f.onIgnite?.();
    } catch (err) {
      console.warn('[elements] flammable onIgnite threw', err);
    }
    const position = flammable.f.position;
    this.forCells(position.x, position.z, flammable.f.radius, (cell) =>
      this.igniteCell(cell, now, true, flammable.end - now + 0.6, 1.15),
    );
    this.fx.ignition(position.x, position.y + 0.5, position.z, flammable.f.radius);
    this.ctx.events.emit('fire:ignite', {
      position: position.clone(),
    });
  }
  updraftAt(pos) {
    if (!this.hot.length) return 0;
    const bx = Math.floor((pos.x - GRID_ORIGIN) / BLOCK);
    const bz = Math.floor((pos.z - GRID_ORIGIN) / BLOCK);
    const wind = this.wind;
    let lift = 0;
    for (let i = -4; i <= 4; i++) {
      const row = bz + i;
      if (!(row < 0 || row >= BLOCKS))
        for (let j = -4; j <= 4; j++) {
          const col = bx + j;
          if (col < 0 || col >= BLOCKS) continue;
          const b = row * BLOCKS + col;
          const heat = this.bHeat[b];
          if (heat < 0.05) continue;
          const dy = pos.y - this.bY[b];
          if (dy < -3 || dy > 48) continue;
          const above = Math.max(dy, 0);
          const drift = above * 0.2 * wind.s;
          const px = this.bX[b] + wind.x * drift;
          const pz = this.bZ[b] + wind.z * drift;
          const dx = pos.x - px;
          const dz = pos.z - pz;
          const width = 3.4 + above * 0.12;
          const falloff = Math.exp(-(dx * dx + dz * dz) / (width * width));
          if (falloff < 0.01) continue;
          const profile = smoothstep(-3, 0.5, dy) * (1 - smoothstep(22, 42, dy));
          lift += Math.min(1.6, heat / 9) * falloff * profile;
        }
    }
    return lift > 0 ? 24 * (1 - Math.exp(-1.15 * lift)) : 0;
  }
  get burningCount() {
    return this.burning.length;
  }
  accumBlock(x, z, y, heat) {
    const bx = Math.floor((x - GRID_ORIGIN) / BLOCK);
    const bz = Math.floor((z - GRID_ORIGIN) / BLOCK);
    if (bx < 0 || bz < 0 || bx >= BLOCKS || bz >= BLOCKS || heat <= 0) return;
    const b = bz * BLOCKS + bx;
    if (!this.bTouched[b]) {
      this.bTouched[b] = 1;
      this.touched.push(b);
      this.bSum[b] = this.bSx[b] = this.bSz[b] = this.bSy[b] = 0;
    }
    this.bSum[b] += heat;
    this.bSx[b] += x * heat;
    this.bSz[b] += z * heat;
    this.bSy[b] += y * heat;
  }
  spread(cell, intensity, dt, now) {
    const cx = cell % GRID_SIZE;
    const cz = (cell / GRID_SIZE) | 0;
    const wind = this.wind;
    const y0 = this.gy[cell];
    for (let i = 0; i < 8; i++) {
      const nx = cx + NEIGHBOR_DX[i];
      const nz = cz + NEIGHBOR_DZ[i];
      if (nx < 0 || nz < 0 || nx >= GRID_SIZE || nz >= GRID_SIZE) continue;
      const nb = nz * GRID_SIZE + nx;
      const st = this.state[nb];
      if (st === 1 || (st === 2 && this.burnt[nb] > 0.35)) continue;
      this.ensure(nb);
      const fuel = this.fuel[nb];
      if (fuel <= 0) continue;
      const diag = i >= 4;
      const norm = diag ? 0.7071 : 1;
      const along = (NEIGHBOR_DX[i] * wind.x + NEIGHBOR_DZ[i] * wind.z) * norm;
      let boost = Math.max(0.1, 1 + along * wind.s * 2.2);
      boost *= clamp(1 + (this.gy[nb] - y0) * 0.5, 0.6, 2);
      const fuelK = Math.min(fuel, 1.1) * (1 + this.dry[nb] * 1.3) * (0.45 + 1.1 * hash(nb * 0.618));
      this.heat[nb] += SPREAD_RATE * intensity * boost * fuelK * (diag ? 0.62 : 1) * (0.35 + Math.random() * 1.3) * dt;
      if (this.heat[nb] >= 1)
        if (this.wetByPaint(nb)) this.heat[nb] = -2;
        else this.igniteCell(nb, now);
    }
    if (this.dry[cell] > 0.3 && Math.random() < 0.014 * intensity * (0.4 + wind.s)) {
      const dist = 2 + Math.random() * 3.5;
      const tx = cx + Math.round(wind.x * dist + (Math.random() - 0.5) * 2.5);
      const tz = cz + Math.round(wind.z * dist + (Math.random() - 0.5) * 2.5);
      if (tx >= 0 && tz >= 0 && tx < GRID_SIZE && tz < GRID_SIZE) this.igniteCell(tz * GRID_SIZE + tx, now);
    }
  }
  tick(dt) {
    const now = this.now;
    readWind(this.ctx, this.wind);
    const burning = this.burning;
    for (let i = burning.length - 1; i >= 0; i--) {
      const cell = burning[i];
      if (this.state[cell] !== 1) {
        burning[i] = burning[burning.length - 1];
        burning.pop();
        continue;
      }
      if (now >= this.endT[cell]) {
        this.burnOut(cell, now);
        burning[i] = burning[burning.length - 1];
        burning.pop();
        continue;
      }
      const age = now - this.ignT[cell];
      const left = this.endT[cell] - now;
      const env = Math.min(1, age / 0.6) * Math.min(1, left / 1.6);
      const intensity = this.peak[cell] * env;
      this.curI[cell] = intensity;
      const progress = age / Math.max(0.1, this.endT[cell] - this.ignT[cell]);
      if (progress * 1.25 > this.burnt[cell]) this.burnt[cell] = Math.min(1, progress * 1.25);
      this.write(cell, this.burnt[cell], intensity);
      if (intensity > 0.12) this.spread(cell, intensity, dt, now);
      const x = GRID_ORIGIN + (cell % GRID_SIZE) + 0.5;
      const z = GRID_ORIGIN + ((cell / GRID_SIZE) | 0) + 0.5;
      const trees = this.treesAt(x, z);
      for (let j = 0; j < trees.length; j++) {
        const tree = trees[j];
        if (tree.state !== 0 || !tree.flammable) continue;
        const reach = tree.radius * 0.6 + 0.9;
        const dx = tree.x - x;
        const dz = tree.z - z;
        if (dx * dx + dz * dz < reach * reach) {
          tree.heat += intensity * dt * 0.7;
          if (tree.heat >= 1) this.igniteTree(tree, now);
        }
      }
      this.accumBlock(x, z, this.gy[cell], intensity);
    }
    const burningTrees = this.burningTrees;
    for (let i = burningTrees.length - 1; i >= 0; i--) {
      const tree = burningTrees[i];
      if (tree.state !== 1) {
        burningTrees[i] = burningTrees[burningTrees.length - 1];
        burningTrees.pop();
        continue;
      }
      if (now >= tree.end) {
        tree.state = 2;
        this.burntTrees.push(tree);
        this.forCells(tree.x, tree.z, tree.radius * 0.85, (cell) => {
          if (this.state[cell] !== 1) {
            this.ensure(cell);
            this.state[cell] = 2;
            this.burnt[cell] = 1;
            this.regrowT[cell] = now + rand(75, 95);
            this.regrowRate[cell] = 1 / REGROW_TIME;
            this.endT[cell] = now;
            this.write(cell, 1, 0.3);
            this.pushRecover(cell);
          }
        });
        this.fx.emberPuff(tree.x, tree.y + tree.height * 0.6, tree.z, 1.4);
        burningTrees[i] = burningTrees[burningTrees.length - 1];
        burningTrees.pop();
        continue;
      }
      const intensity = 1.1 * (Math.min(1, (now - tree.ign) / 1.5) * Math.min(1, (tree.end - now) / 2.5));
      for (const other of this.treesAt(tree.x, tree.z)) {
        if (other.state !== 0 || !other.flammable || other === tree) continue;
        const dx = other.x - tree.x;
        const dz = other.z - tree.z;
        const dist = Math.hypot(dx, dz);
        if (dist < tree.radius + other.radius + 1) {
          const windK = Math.max(0.2, 1 + ((dx * this.wind.x + dz * this.wind.z) / (dist || 1)) * this.wind.s * 1.5);
          other.heat += intensity * dt * 0.18 * windK;
          if (other.heat >= 1) this.igniteTree(other, now);
        }
      }
      this.accumBlock(tree.x, tree.z, tree.y, intensity * 7);
    }
    this.treeCheckAcc += dt;
    if (this.treeCheckAcc > 1) {
      this.treeCheckAcc = 0;
      const burntTrees = this.burntTrees;
      for (let i = burntTrees.length - 1; i >= 0; i--) {
        const tree = burntTrees[i];
        const cell = this.cellAt(tree.x, tree.z);
        if (tree.state !== 2 || cell < 0 || this.state[cell] !== 2 || this.burnt[cell] < 0.2) {
          if (tree.state === 2) tree.state = 0;
          tree.heat = 0;
          burntTrees[i] = burntTrees[burntTrees.length - 1];
          burntTrees.pop();
        }
      }
    }
    if (this.flammables.length)
      for (const flammable of this.flammables) {
        const position = flammable.f.position;
        if (flammable.state === 0) {
          if (!burning.length) continue;
          let heat = 0;
          this.forCells(position.x, position.z, flammable.f.radius + 0.5, (cell) => {
            if (this.state[cell] === 1) heat += this.curI[cell];
          });
          if (heat > 0) {
            flammable.heat += heat * dt * 0.5;
            if (flammable.heat >= 0.6) this.igniteFlammable(flammable, now);
          }
        } else if (flammable.state === 1) {
          if (now >= flammable.end) {
            flammable.state = 2;
            try {
              flammable.f.onBurnt?.();
            } catch (err) {
              console.warn('[elements] flammable onBurnt threw', err);
            }
            this.fx.emberPuff(position.x, position.y + 0.8, position.z, Math.min(2.5, 0.8 + flammable.f.radius * 0.35));
            continue;
          }
          const intensity = Math.min(1, (now - flammable.ign) / 0.8) * Math.min(1, (flammable.end - now) / 1.5);
          this.accumBlock(position.x, position.z, position.y, intensity * 6);
        }
      }
    let sources = [];
    try {
      sources = this.heatSources();
    } catch {
      sources = [];
    }
    for (const src of sources)
      if (!(src.amount <= 0)) {
        this.forCells(src.x, src.z, src.radius, (cell) => {
          if (this.state[cell] !== 1)
            if (!(this.state[cell] === 2 && this.burnt[cell] > 0.35)) {
              this.ensure(cell);
              if (!(this.fuel[cell] <= 0))
                if (!(Math.abs(this.gy[cell] - src.y) > 2.5)) {
                  this.heat[cell] += src.amount * dt * 1.6;
                  if (this.heat[cell] >= 1) this.igniteCell(cell, now);
                }
            }
        });
        this.accumBlock(src.x, src.z, src.y, src.amount * 2.5);
      }
    const recovering = this.recovering;
    for (let i = recovering.length - 1; i >= 0; i--) {
      const cell = recovering[i];
      if (this.state[cell] !== 2) {
        this.inRecover[cell] = 0;
        recovering[i] = recovering[recovering.length - 1];
        recovering.pop();
        continue;
      }
      const since = now - this.endT[cell];
      let glow = 0;
      if (since >= 0 && since < SMOULDER_TIME)
        glow = 0.3 * (1 - since / SMOULDER_TIME) * (this.burnt[cell] > 0.9 ? 1 : 0.4);
      if (now >= this.regrowT[cell] && ((this.burnt[cell] -= dt * this.regrowRate[cell]), this.burnt[cell] <= 0)) {
        this.burnt[cell] = 0;
        this.state[cell] = 0;
        this.heat[cell] = 0;
        this.inRecover[cell] = 0;
        this.write(cell, 0, 0);
        recovering[i] = recovering[recovering.length - 1];
        recovering.pop();
        continue;
      }
      this.write(cell, this.burnt[cell], glow);
    }
    const decay = Math.exp(-dt / 2.2);
    for (const b of this.touched) {
      const sum = this.bSum[b];
      if (sum > 0) {
        this.bX[b] = this.bSx[b] / sum;
        this.bZ[b] = this.bSz[b] / sum;
        this.bY[b] = this.bSy[b] / sum;
      }
      if (!this.bInHot[b]) {
        this.bInHot[b] = 1;
        this.bHeat[b] = 0;
        this.hot.push(b);
      }
    }
    const hot = this.hot;
    for (let i = hot.length - 1; i >= 0; i--) {
      const b = hot[i];
      const target = this.bTouched[b] ? this.bSum[b] : 0;
      const cur = this.bHeat[b];
      this.bHeat[b] = target > cur ? cur + (target - cur) * 0.5 : Math.max(target, cur * decay);
      if (this.bHeat[b] < 0.05 && !this.bTouched[b]) {
        this.bHeat[b] = 0;
        this.bInHot[b] = 0;
        hot[i] = hot[hot.length - 1];
        hot.pop();
      }
    }
    for (const b of this.touched) this.bTouched[b] = 0;
    this.touched.length = 0;
    this.rebuildFlames(now);
    this.pickLights();
    this.flushTexture();
  }
  rebuildFlames(now) {
    const flames = this.flames;
    flames.beginSim();
    for (const burningTree of this.burningTrees) {
      if (burningTree.state !== 1) continue;
      const radius = burningTree.radius;
      const tipY = burningTree.y + burningTree.height;
      const crownY = tipY - Math.min(radius, burningTree.height * 0.35);
      const count = radius > 2.6 ? 11 : 8;
      for (let i = 0; i < count; i++) {
        const seed = hash(burningTree.id * 13.1 + i * 7.7);
        const rnd = hash(burningTree.id * 5.3 + i * 3.1);
        let x = burningTree.x;
        let y;
        let z = burningTree.z;
        let width;
        if (i === 0) {
          y = tipY - radius * 0.45;
          width = 1 + radius * 0.36;
        } else {
          const inner = i % 2 == 0;
          const angle = (i / count) * Math.PI * 2 + seed * 1.3;
          const dist = radius * (inner ? 0.5 : 0.82) * (0.85 + 0.3 * rnd);
          x += Math.cos(angle) * dist;
          z += Math.sin(angle) * dist;
          y = crownY + (inner ? radius * 0.15 : -radius * 0.55) + seed * 0.4;
          width = 0.8 + radius * (inner ? 0.3 : 0.24) * (0.8 + 0.4 * seed);
        }
        flames.add(
          x,
          y,
          z,
          seed,
          width,
          width * (2 + 0.6 * rnd),
          1.15,
          1,
          burningTree.ign + i * 0.18,
          burningTree.end - seed * 0.8,
          0.12,
          1 + rnd * 0.3,
        );
      }
    }
    for (const flammable of this.flammables) {
      if (flammable.state !== 1) continue;
      const position = flammable.f.position;
      const radius = flammable.f.radius;
      const count = clamp(Math.round(radius * 2.2), 3, 12);
      for (let i = 0; i < count; i++) {
        const seed = hash(flammable.seed * 91 + i * 3.3);
        const angle = (i / count) * Math.PI * 2 + seed * 2;
        const dist = radius * (0.2 + 0.6 * hash(flammable.seed * 17 + i));
        const width = 1.5 + 0.9 * seed + radius * 0.12;
        const ground = this.groundAt(
          position.x + Math.cos(angle) * dist,
          position.z + Math.sin(angle) * dist,
          position.y,
        );
        flames.add(
          position.x + Math.cos(angle) * dist,
          ground - 0.1,
          position.z + Math.sin(angle) * dist,
          seed,
          width,
          width * (1.7 + 0.5 * seed),
          1.2,
          1,
          flammable.ign + seed * 0.4,
          flammable.end,
          0.1,
          1.1,
        );
      }
    }
    const camPos = this.ctx.camera.position;
    const burning = this.burning;
    const free = flames.capacity - flames.count;
    const keep = burning.length > free * 0.92 ? (free * 0.9) / burning.length : 1;
    const sizeBoost = keep < 1 ? 1 / Math.sqrt(keep) : 1;
    for (let i = 0; i < burning.length; i++) {
      const cell = burning[i];
      if (this.state[cell] !== 1) continue;
      const cx = cell % GRID_SIZE;
      const cz = (cell / GRID_SIZE) | 0;
      const seed = hash(cell);
      if (keep < 1 && seed > keep) continue;
      const x2 = GRID_ORIGIN + cx + 0.5;
      const z = GRID_ORIGIN + cz + 0.5;
      const dx = x2 - camPos.x;
      const dz = z - camPos.z;
      const d2 = dx * dx + dz * dz;
      let scale = sizeBoost;
      if (d2 > 16900) {
        if ((cx | cz) & 1) continue;
        scale *= 1.85;
      } else if (d2 > 3600) {
        if ((cx + cz) & 1) continue;
        scale *= 1.38;
      }
      const r1 = hash(cell + 0.371);
      const r2 = hash(cell + 0.713);
      const dry = this.dry[cell];
      const fuel = this.fuel[cell];
      const big = +(scale > 1.2);
      const width = (0.9 + 0.5 * r1) * scale * (0.85 + 0.25 * dry) * (big ? 1.2 : 1);
      const height =
        (0.95 + 0.5 * r1) *
        (1.15 + 0.85 * r2 * r2) *
        (1 + 0.5 * dry) *
        (0.65 + 0.35 * Math.min(fuel, 1)) *
        scale *
        (big ? 0.85 : 1);
      if (
        !flames.add(
          x2 + (r1 - 0.5) * 0.8,
          this.gy[cell] - 0.12,
          z + (r2 - 0.5) * 0.8,
          seed,
          width,
          height,
          this.peak[cell],
          0,
          this.ignT[cell],
          this.endT[cell],
          0,
          0.9 + r2 * 0.35,
        )
      )
        break;
    }
    flames.endSim();
  }
  groundAt(x, z, fallback) {
    const cell = this.cellAt(x, z);
    if (cell < 0) {
      return fallback;
    } else {
      this.ensure(cell);
      return this.gy[cell];
    }
  }
  pickLights() {
    const len = this.lights.length;
    if (!len) return;
    const hot = this.hot;
    const picks = [];
    const sorted = hot.length > 1 ? hot.slice().sort((a, b) => this.bHeat[b] - this.bHeat[a]) : hot.slice();
    for (const b of sorted) {
      if (picks.length >= len || this.bHeat[b] < 0.6) break;
      let apart = true;
      for (const other of picks) {
        const dx = this.bX[other] - this.bX[b];
        const dz = this.bZ[other] - this.bZ[b];
        if (dx * dx + dz * dz < 169) {
          apart = false;
          break;
        }
      }
      if (apart) picks.push(b);
    }
    const used = Array(len).fill(false);
    const assigned = Array(len).fill(-1);
    for (const b of picks) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < len; i++) {
        if (used[i]) continue;
        const target = this.lightTarget[i];
        const d2 = this.lightCur[i] > 0.5 ? (target.x - this.bX[b]) ** 2 + (target.z - this.bZ[b]) ** 2 : 10000000 + i;
        if (d2 < bestD) {
          bestD = d2;
          best = i;
        }
      }
      if (best >= 0) {
        used[best] = true;
        assigned[best] = b;
      }
    }
    for (let i = 0; i < len; i++) {
      const target = this.lightTarget[i];
      const b = assigned[i];
      if (b < 0) {
        target.i = 0;
        continue;
      }
      let sum = 0;
      let sx = 0;
      let sz = 0;
      let sy = 0;
      const bx = b % BLOCKS;
      const bz = (b / BLOCKS) | 0;
      for (let j = -2; j <= 2; j++)
        for (let k = -2; k <= 2; k++) {
          const x = bx + k;
          const z = bz + j;
          if (x < 0 || z < 0 || x >= BLOCKS || z >= BLOCKS) continue;
          const nb = z * BLOCKS + x;
          const heat = this.bHeat[nb];
          if (!(heat <= 0.05)) {
            sum += heat;
            sx += this.bX[nb] * heat;
            sz += this.bZ[nb] * heat;
            sy += this.bY[nb] * heat;
          }
        }
      if (sum <= 0) {
        target.i = 0;
        continue;
      }
      const snap = this.lightCur[i] < 0.5;
      target.x = sx / sum;
      target.z = sz / sum;
      target.y = sy / sum + 3.2 + Math.min(4, sum * 0.04);
      target.i = Math.min(22, 3.2 * sum ** 0.55);
      if (snap) this.lights[i].position.set(target.x, target.y, target.z);
    }
  }
  updateLights(dt) {
    const elapsed = this.ctx.time.elapsed;
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      const target = this.lightTarget[i];
      const k = damp(target.i > this.lightCur[i] ? 3 : 1.6, dt);
      this.lightCur[i] += (target.i - this.lightCur[i]) * k;
      if (this.lightCur[i] > 0.3) {
        light.position.x += (target.x - light.position.x) * damp(3, dt);
        light.position.y += (target.y - light.position.y) * damp(3, dt);
        light.position.z += (target.z - light.position.z) * damp(3, dt);
      }
      const phase = i * 1.93;
      const flicker =
        0.8 +
        0.1 * Math.sin(elapsed * 9.3 + phase) +
        0.07 * Math.sin(elapsed * 23.1 + phase * 2.1) +
        0.05 * Math.sin(elapsed * 41.7 + phase * 0.7);
      light.intensity = this.lightCur[i] < 0.05 ? 0 : this.lightCur[i] * flicker;
      light.distance = 18 + Math.min(22, Math.sqrt(this.lightCur[i]) * 3);
    }
  }
  emit(dt) {
    const puffs = this.fx.puffs;
    const glows = this.fx.glows;
    const hot = this.hot;
    const budget = this.budget;
    if (hot.length) {
      let demand = 0;
      for (const b of hot) demand += 0.25 + Math.min(this.bHeat[b], 14) * 0.15;
      const smokeScale = demand > budget.smokeRate ? budget.smokeRate / demand : 1;
      let totalHeat = 0;
      for (const b of hot) totalHeat += this.bHeat[b];
      const fireSize = Math.min(1, totalHeat / 160);
      let glowDemand = 0;
      for (const b of hot) if (this.bHeat[b] > 3) glowDemand += 1.4;
      const glowScale = glowDemand > 50 ? 50 / glowDemand : 1;
      for (const b of hot) {
        const heat = this.bHeat[b];
        const rate = (0.25 + Math.min(heat, 14) * 0.15) * smokeScale;
        let puffCount = Math.floor(rate * dt + Math.random());
        const hotness = Math.min(1, heat / 12);
        for (; puffCount-- > 0;) {
          const shade = 0.52 - 0.2 * hotness + Math.random() * 0.06;
          const size = 0.9 + Math.random() * 0.6 + hotness * 0.6;
          puffs.spawn(
            this.bX[b] + (Math.random() - 0.5) * 3.2,
            this.bY[b] + 1.2 + Math.random() * 1.4 + hotness * 1.2,
            this.bZ[b] + (Math.random() - 0.5) * 3.2,
            (Math.random() - 0.5) * 0.6,
            2 + Math.random() * 1.6 + hotness * 1.6 + fireSize * 2.5,
            (Math.random() - 0.5) * 0.6,
            4.5 + Math.random() * 2.5 + fireSize * 3,
            size,
            size * (2.8 + Math.random() * 1.4 + fireSize * 1.6),
            0.55,
            0.3 + hotness * 0.25 + fireSize * 0.35,
            shade,
            shade * 0.97,
            shade * 0.94,
            0.17 + 0.12 * hotness,
            0.4 + 0.4 * hotness,
            1,
            0.18,
          );
        }
        if (heat > 3) {
          let glowCount = Math.floor(1.4 * glowScale * dt + Math.random());
          for (; glowCount-- > 0;)
            glows.spawn(
              this.bX[b] + (Math.random() - 0.5) * 3,
              this.bY[b] + 1 + Math.random() * 2,
              this.bZ[b] + (Math.random() - 0.5) * 3,
              (Math.random() - 0.5) * 1.2,
              8 + Math.random() * 5,
              (Math.random() - 0.5) * 1.2,
              3 + Math.random() * 1.8,
              0.05 + Math.random() * 0.04,
              0.16,
              0.6,
              1,
              0.62,
              0.25,
              4 + Math.random() * 3,
              0.5,
              10 + Math.random() * 14,
              0.9,
              0.8,
            );
        }
      }
    }
    const burning = this.burning;
    const cellCount = burning.length;
    const treeCount = this.burningTrees.length;
    if (cellCount || treeCount) {
      const rate = Math.min(budget.emberRate, cellCount * 0.6 + treeCount * 14);
      for (this.emberAcc += rate * dt; this.emberAcc >= 1;) {
        --this.emberAcc;
        let x;
        let y;
        let z;
        let lift = 1;
        if (treeCount && (Math.random() < (treeCount * 14) / (cellCount * 0.6 + treeCount * 14) || !cellCount)) {
          const tree = this.burningTrees[(Math.random() * treeCount) | 0];
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * tree.radius;
          x = tree.x + Math.cos(angle) * dist;
          z = tree.z + Math.sin(angle) * dist;
          y = tree.y + tree.height * (0.4 + Math.random() * 0.5);
          lift = 1.4;
        } else {
          const cell = burning[(Math.random() * cellCount) | 0];
          x = GRID_ORIGIN + (cell % GRID_SIZE) + Math.random();
          z = GRID_ORIGIN + ((cell / GRID_SIZE) | 0) + Math.random();
          y = this.gy[cell] + 0.4 + Math.random() * 1.3 * (1 + this.dry[cell]);
        }
        glows.spawn(
          x,
          y,
          z,
          (Math.random() - 0.5) * 1.4,
          (1.5 + Math.random() * 3.2) * lift,
          (Math.random() - 0.5) * 1.4,
          1.1 + Math.random() * 2.2,
          0.04 + Math.random() * 0.045,
          0.8,
          1.6,
          1,
          0.6 + Math.random() * 0.2,
          0.2,
          3 + Math.random() * 4,
          0.6,
          12 + Math.random() * 16,
          0.7,
          1,
        );
      }
      for (const burningTree of this.burningTrees)
        if (Math.random() < dt * 3.5) {
          const size = burningTree.radius * 0.7;
          puffs.spawn(
            burningTree.x + (Math.random() - 0.5) * burningTree.radius,
            burningTree.y + burningTree.height * 0.85,
            burningTree.z + (Math.random() - 0.5) * burningTree.radius,
            (Math.random() - 0.5) * 0.5,
            2.5 + Math.random() * 1.5,
            (Math.random() - 0.5) * 0.5,
            5 + Math.random() * 2,
            size,
            size * 4,
            0.5,
            0.45,
            0.3,
            0.29,
            0.28,
            0.5,
            1,
            1,
            0.15,
          );
        }
    }
  }
  update(dt) {
    if (dt <= 0) {
      this.updateLights(0);
      return;
    }
    this.now = this.ctx.time.elapsed;
    this.acc += dt;
    let steps = 0;
    for (; this.acc >= TICK && steps < 2;) {
      this.acc -= TICK;
      this.tick(TICK);
      steps++;
    }
    if (this.acc > TICK * 2) this.acc = 0;
    this.emit(dt);
    this.updateLights(dt);
  }
}
