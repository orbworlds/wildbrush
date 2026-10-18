/**
 * Placement rules shared by trees, plants and rocks: clearings around landmarks and the boss arena, the canyon corridor, paths, the terrain surface and the dry meadow.
 */
import { Vector3 } from 'three';
import { BOSS_ARENA, DRY_MEADOW, LANDMARKS } from '../core/config.js';
export class PlacementRules {
  ctx;
  lm;
  discs = [];
  corridor = [];
  constructor(ctx) {
    this.ctx = ctx;
    const lm = {};
    for (const key of Object.keys(LANDMARKS)) {
      const pos = ctx.terrain.landmarks?.[key];
      const mark = LANDMARKS[key];
      lm[key] = pos && Number.isFinite(pos.x) ? pos.clone() : new Vector3(mark.x, 0, mark.z);
    }
    this.lm = lm;
    const addDisc = (key, radius) =>
      this.discs.push({
        x: lm[key].x,
        z: lm[key].z,
        r: radius,
      });
    addDisc('spawn', 13);
    addDisc('mesa', 17);
    addDisc('lakeIslet', 9);
    addDisc('tower', 15);
    addDisc('canyon', 11);
    addDisc('grove', 10);
    addDisc('summit', 9);
    this.discs.push({
      x: BOSS_ARENA.x,
      z: BOSS_ARENA.z,
      r: BOSS_ARENA.radius + 6,
    });
    this.corridor.push({
      ax: lm.canyon.x,
      az: lm.canyon.z,
      bx: lm.grove.x,
      bz: lm.grove.z,
      w: 7,
    });
  }
  clearDist(x, z) {
    let best = Infinity;
    for (const disc of this.discs) best = Math.min(best, Math.hypot(x - disc.x, z - disc.z) - disc.r);
    for (const seg of this.corridor) {
      const dx = seg.bx - seg.ax;
      const dz = seg.bz - seg.az;
      const t = Math.max(0, Math.min(1, ((x - seg.ax) * dx + (z - seg.az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - (seg.ax + dx * t), z - (seg.az + dz * t)) - seg.w);
    }
    return best;
  }
  surface(x, z) {
    try {
      return this.ctx.terrain.surfaceAt(x, z);
    } catch {
      return 'grass';
    }
  }
  nearPath(x, z, radius) {
    if (this.surface(x, z) === 'path') return true;
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      if (this.surface(x + Math.cos(ang) * radius, z + Math.sin(ang) * radius) === 'path') return true;
    }
    return false;
  }
  distTo(key, x, z) {
    return Math.hypot(x - this.lm[key].x, z - this.lm[key].z);
  }
  dryMeadow(x, z) {
    const dist = Math.hypot(x - DRY_MEADOW.x, z - DRY_MEADOW.z);
    return Math.max(0, Math.min(1, (DRY_MEADOW.radius + 4 - dist) / 10));
  }
}
