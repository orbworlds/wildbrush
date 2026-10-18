/**
 * Lair hints: a hint stone near Greymaw's arena, and stones raised on the way to each elite Hoarder telling the hero which colour counters it.
 */
import { Vector3 } from 'three';
import { BOSS_ARENA, PALETTE } from '../core/config.js';
import { findSpot, rng } from '../shared/util.js';
import { hintStone } from './ruin-kit.js';
import { addClearing, Site } from './site.js';
const GREYMAW_HINT =
  'Above the northern cliffs a grey hunger sleeps, swollen with every colour it has stolen. Come with a full heart — and every colour in hand.';
const COUNTER_COLOR = {
  red: 'blue',
  blue: 'red',
  yellow: 'green',
  green: 'yellow',
};
const HOARDER_HINTS = {
  red: 'A Hoarder gorged on Ember prowls these stones. Fire will not touch its hide — but Frost can crack it.',
  blue: 'A Hoarder of Frost keeps this cold ring. Ice only feeds it; Ember will make it flinch.',
  yellow: 'A Hoarder of Spring bounds within. Nothing sticks to a thing that leaps — unless Bloom roots it fast.',
  green: 'A Hoarder of Bloom has taken root here. Its vines drink green paint; Spring tears them loose.',
};
const counterHex = (color) => PALETTE[COUNTER_COLOR[color]].hex;
export function buildBossHint(ctx, site, hints) {
  const arena = BOSS_ARENA;
  const summit = ctx.terrain.landmarks.summit;
  const angle = Math.atan2(summit.x - arena.x, summit.z - arena.z);
  const fx = Math.sin(angle);
  const fz = Math.cos(angle);
  let arenaY = 0;
  try {
    arenaY = Number.isFinite(ctx.boss?.arena?.y) ? ctx.boss.arena.y : ctx.terrain.heightAt(arena.x, arena.z);
  } catch {
    arenaY = ctx.terrain.heightAt(arena.x, arena.z);
  }
  let found = null;
  outer: for (const dist of [35, 38, 32, 41])
    for (const side of [4.5, -4.5, 6, -6, 7.5, -7.5]) {
      const px = arena.x + fx * dist - fz * side;
      const pz = arena.z + fz * dist + fx * side;
      const spot = findSpot(ctx, px, pz, {
        maxSlope: 0.36,
        search: 1.5,
        minH: arenaY - 9,
        maxH: arenaY + 9,
        footprint: 1.4,
      });
      if (spot && !(Math.abs((spot.x - arena.x) * fz - (spot.z - arena.z) * fx) < 3)) {
        found = spot;
        break outer;
      }
    }
  if (!found) return;
  const pos = found;
  addClearing(pos.x, pos.z, 2.2);
  const stonePos = hintStone(site, ctx, pos.x, pos.z, angle, 2.4, rng('greymaw-hint'), 11904982);
  hints.add(stonePos, GREYMAW_HINT, 3.8);
  if (ctx.shotMode || ctx.debug) globalThis.__wbLairHints = [stonePos.clone()];
}
export class EliteHints {
  ctx;
  mats;
  hints;
  done = new Set();
  scanT = 0.5;
  elapsed = 0;
  constructor(ctx, mats, hints) {
    this.ctx = ctx;
    this.mats = mats;
    this.hints = hints;
  }
  update(dt) {
    this.elapsed += dt;
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = this.elapsed < 30 ? 1 : 10;
    let enemies = [];
    try {
      enemies = this.ctx.enemies?.query?.(new Vector3(0, 0, 0), 400) ?? [];
    } catch {
      return;
    }
    for (const enemy of enemies) {
      const elite = enemy?.elite;
      if (!elite || enemy.boss || !enemy.position || !PALETTE[elite.element]) continue;
      const key = `${elite.name}:${elite.element}`;
      if (!this.done.has(key)) {
        this.done.add(key);
        try {
          this.raise(enemy.position, elite.element, key);
        } catch (err) {
          console.warn('[content] elite hint failed', err);
        }
      }
    }
  }
  raise(pos, element, key) {
    const ctx = this.ctx;
    const spawn = ctx.terrain.landmarks.spawn;
    const angle = Math.atan2(spawn.x - pos.x, spawn.z - pos.z);
    let found = null;
    let yaw = angle;
    for (const offset of [0.28, -0.28, 0.5, -0.5, 0.8, -0.8]) {
      const heading = angle + offset;
      const spot = findSpot(ctx, pos.x + Math.sin(heading) * 29, pos.z + Math.cos(heading) * 29, {
        maxSlope: 0.35,
        search: 3,
        minH: 1.2,
        footprint: 1.6,
      });
      if (spot && Math.hypot(spot.x - BOSS_ARENA.x, spot.z - BOSS_ARENA.z) > BOSS_ARENA.radius + 12) {
        found = spot;
        yaw = heading;
        break;
      }
    }
    if (!found) return;
    const site = new Site(ctx, `elite-hint-${key}`);
    const stonePos = hintStone(site, ctx, found.x, found.z, yaw, 2, rng(`elite-hint-${key}`), counterHex(element));
    site.build(this.mats);
    try {
      ctx.vegetation?.clearGrass?.(new Vector3(found.x, found.y, found.z), 2);
    } catch {}
    this.hints.add(stonePos, HOARDER_HINTS[element], 3.6);
    if (ctx.shotMode || ctx.debug) (globalThis.__wbLairHints ??= []).push(stonePos.clone());
  }
}
