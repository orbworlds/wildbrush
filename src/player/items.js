/**
 * The hero's items and upgrades: which ones are owned, the perks they give (extra hearts and stamina, the Sky Mantle's lighter drain, Cloudstep's air jump), and the item-get moment that freezes time, frames the hero holding the item up with a camera shot and then grants it.
 */
import { Vector3 } from 'three';
import { ITEM_HOLD } from '../shared/combat-defs.js';
import { wrapAngle } from './controller.js';
import { makeHit, Probes } from './probes.js';
const KNOWN_ITEMS = [
  'heartContainer',
  'chromaBrush',
  'brushflight',
  'staminaVessel',
  'skyMantle',
  'lantern',
  'emberCrest',
  'frostCrest',
  'cloudstep',
];
const MAX_HEARTS = 10;
const STAMINA_PER_VESSEL = 0.2;
const MAX_STAMINA = 3;
const UNIQUE_ITEMS = ['brushflight', 'skyMantle', 'lantern', 'emberCrest', 'frostCrest', 'cloudstep'];
const ITEM_SHOTS = {
  chromaBrush: {
    dist: 3.55,
    camH: 1.15,
    lookH: 1.78,
    fov: 46,
  },
  brushflight: {
    dist: 3.75,
    camH: 1.1,
    lookH: 1.62,
    fov: 48,
  },
  skyMantle: {
    dist: 3.9,
    camH: 1.2,
    lookH: 1.45,
    fov: 46,
  },
  lantern: {
    dist: 3.1,
    camH: 1.12,
    lookH: 1.74,
    fov: 42,
  },
  emberCrest: {
    dist: 3,
    camH: 1.12,
    lookH: 1.76,
    fov: 42,
  },
  frostCrest: {
    dist: 3,
    camH: 1.12,
    lookH: 1.76,
    fov: 42,
  },
  cloudstep: {
    dist: 3.2,
    camH: 1.1,
    lookH: 1.66,
    fov: 44,
  },
};
const DEFAULT_ITEM_SHOT = {
  dist: 3.05,
  camH: 1.12,
  lookH: 1.72,
  fov: 42,
};
export class Inventory {
  ctx;
  ctrl;
  rig;
  combat;
  owned = new Set();
  queue = [];
  waitT = 0;
  cur = null;
  shot = {
    position: new Vector3(),
    target: new Vector3(),
    fov: 44,
    blend: 0.6,
  };
  onShot = null;
  onHold = null;
  probes;
  hit = makeHit();
  v1 = new Vector3();
  v2 = new Vector3();
  anchor = new Vector3();
  constructor(ctx, ctrl, rig, combat) {
    this.ctx = ctx;
    this.ctrl = ctrl;
    this.rig = rig;
    this.combat = combat;
    this.probes = new Probes(ctx);
    this.probes.exclude = ctrl.collider;
    ctx.events.on('player:death', () => {
      if (this.cur) this.finish();
    });
  }
  get active() {
    return this.cur !== null;
  }
  give(item) {
    if (!KNOWN_ITEMS.includes(item)) {
      console.warn('[player] unknown item', item);
      return;
    }
    if (UNIQUE_ITEMS.includes(item) && this.owned.has(item)) {
      this.ctrl.log(`${item} already owned`);
      return;
    }
    this.apply(item);
    this.queue.push(item);
  }
  apply(item) {
    if (!KNOWN_ITEMS.includes(item)) return;
    const state = this.ctrl.state;
    this.owned.add(item);
    if (item === 'heartContainer') state.healthMax = Math.min(MAX_HEARTS, Math.max(1, Math.round(state.healthMax) + 1));
    else if (item === 'staminaVessel') {
      const base = Number.isFinite(state.staminaMax) && state.staminaMax > 0 ? state.staminaMax : 1;
      state.staminaMax = Math.min(MAX_STAMINA, Math.round((base + STAMINA_PER_VESSEL) * 10) / 10);
    }
    this.refreshPerks();
  }
  grantSilently(item) {
    if (
      !KNOWN_ITEMS.includes(item) ||
      ((UNIQUE_ITEMS.includes(item) || item === 'chromaBrush') && this.owned.has(item))
    )
      return;
    this.apply(item);
    const state = this.ctrl.state;
    if (item === 'skyMantle') state.outfit = 'sky';
    if (item === 'chromaBrush') state.brush = 'chroma';
    if (item === 'staminaVessel') {
      state.stamina = state.staminaMax;
      state.exhausted = false;
    }
  }
  refreshPerks() {
    const mantle = this.owned.has('skyMantle');
    this.ctrl.boostDrainMul = mantle ? 0.5 : 1;
    this.ctrl.glideSinkMul = mantle ? 0.8 : 1;
    this.ctrl.airJumps = +!!this.owned.has('cloudstep');
  }
  has(item) {
    return this.owned.has(item);
  }
  update(dt) {
    const state = this.ctrl.state;
    if (!this.cur) {
      if (!this.queue.length) return;
      if (state.dead || this.combat.isRespawning) {
        this.waitT = 0;
        return;
      }
      const currentMode = this.ctrl.currentMode;
      if (currentMode === 'fly') {
        this.waitT = 0;
        return;
      }
      this.waitT += dt;
      if (!(currentMode === 'ground' || currentMode === 'slide' || currentMode === 'swim' || this.waitT > 3) || dt <= 0)
        return;
      this.begin(this.queue.shift());
      return;
    }
    const cur = this.cur;
    if (dt > 0) cur.t += dt;
    cur.hold.t = cur.t;
    state.itemHold = cur.hold;
    this.ctrl.faceTarget = cur.yaw;
    this.ctrl.faceRate = cur.t < ITEM_HOLD.turn ? 11 : 6;
    if (!cur.healed && cur.t >= ITEM_HOLD.reveal) {
      cur.healed = true;
      this.reward(cur.item);
    }
    if (!cur.released && cur.t >= ITEM_HOLD.lower) {
      cur.released = true;
      this.shot.blend = 0.75;
      this.onShot?.(null);
    }
    if (cur.t >= ITEM_HOLD.dur) this.finish();
  }
  lateUpdate() {
    const cur = this.cur;
    if (!cur) return;
    const position = this.ctrl.state.position;
    if (this.anchor.distanceToSquared(position) > 25) this.anchor.copy(position);
    else this.anchor.lerp(position, 0.2);
    const sin = Math.sin(cur.yaw);
    const cos = Math.cos(cur.yaw);
    const reveal = Math.min(1, Math.max(0, (cur.t - ITEM_HOLD.reveal) / (ITEM_HOLD.lower - ITEM_HOLD.reveal)));
    const dist = cur.dist * (1 - 0.1 * reveal);
    this.shot.position.set(
      this.anchor.x + sin * dist - cos * 0.35,
      this.anchor.y + cur.camH,
      this.anchor.z + cos * dist + sin * 0.35,
    );
    const offset = cur.item === 'chromaBrush' ? 0.32 : cur.item === 'brushflight' ? 0.22 : 0;
    this.shot.target.set(
      this.anchor.x + Math.cos(cur.yaw) * offset,
      this.anchor.y + cur.lookH,
      this.anchor.z - Math.sin(cur.yaw) * offset,
    );
  }
  reward(item) {
    const state = this.ctrl.state;
    if (item === 'heartContainer')
      try {
        this.combat.heal(state.healthMax);
      } catch {}
    else if (item === 'staminaVessel') {
      state.stamina = state.staminaMax;
      state.exhausted = false;
    }
  }
  begin(item) {
    const ctx = this.ctx;
    const state = this.ctrl.state;
    this.waitT = 0;
    try {
      this.combat.interrupt();
    } catch {}
    this.combat.itemGuard = true;
    this.onHold?.(true);
    try {
      ctx.time.slowMo(1, 0.001);
    } catch {}
    const isBrush = item === 'chromaBrush';
    const isMantle = item === 'skyMantle';
    const framing = ITEM_SHOTS[item] ?? DEFAULT_ITEM_SHOT;
    const { dist, camH, lookH } = framing;
    const yaw = this.pickYaw(dist, camH);
    this.anchor.copy(state.position);
    this.cur = {
      item,
      t: 0,
      yaw,
      dist,
      camH,
      lookH,
      healed: false,
      released: false,
      hold: {
        item,
        t: 0,
      },
    };
    state.itemHold = this.cur.hold;
    if (isBrush) state.brush = 'chroma';
    if (isMantle) state.outfit = 'sky';
    this.shot.blend = 0.6;
    this.shot.fov = framing.fov;
    this.lateUpdate();
    this.onShot?.(this.shot);
    try {
      ctx.events.emit('item:get', {
        item,
        position: state.position.clone(),
      });
    } catch (err) {
      console.warn('[player] item:get handler failed', err);
    }
  }
  finish() {
    const state = this.ctrl.state;
    const cur = this.cur;
    this.cur = null;
    state.itemHold = null;
    this.combat.itemGuard = false;
    if (cur && !cur.released) this.onShot?.(null);
    if (cur && !cur.healed && !state.dead) this.reward(cur.item);
    this.ctrl.faceTarget = null;
    this.onHold?.(false);
  }
  pickYaw(dist, camH) {
    const state = this.ctrl.state;
    const camPos = this.ctx.camera.position;
    let angle = Math.atan2(camPos.x - state.position.x, camPos.z - state.position.z);
    if (!Number.isFinite(angle) || Math.hypot(camPos.x - state.position.x, camPos.z - state.position.z) < 0.3)
      angle = state.facing;
    const offsets = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2, Math.PI];
    for (const offset of offsets) {
      const yaw = wrapAngle(angle + offset);
      if (this.clear(yaw, dist, camH)) return yaw;
    }
    return wrapAngle(angle);
  }
  clear(yaw, dist, camH) {
    const state = this.ctrl.state;
    const from = this.v1.set(state.position.x, state.position.y + 1.5, state.position.z);
    const to = this.v2.set(
      state.position.x + Math.sin(yaw) * dist,
      state.position.y + camH,
      state.position.z + Math.cos(yaw) * dist,
    );
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.001) return true;
    dir.divideScalar(len);
    if (this.probes.ray(from, dir, len + 0.4, this.hit)) return false;
    try {
      const groundY = this.ctx.terrain.heightAt(to.x, to.z);
      if (Number.isFinite(groundY) && groundY > to.y - 0.5) return false;
      const waterY = Number.isFinite(this.ctx.water?.level) ? this.ctx.water.level : 0;
      if (to.y < waterY + 0.5) return false;
    } catch {}
    this.rig;
    return true;
  }
}
