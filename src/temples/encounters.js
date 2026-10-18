/**
 * Temple encounters: battle rooms that seal their doors and send waves of Smudges until cleared, and the boss fight with its intro cinematic, hazards, win and reset. Also the sleep helper and scratch vector the temple uses.
 */
import { Vector3 } from 'three';
import { sfx } from './props.js';
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const _tmp = new Vector3();
export class BattleRoom {
  t;
  box;
  seals;
  waves;
  onClear;
  state = 'idle';
  ids = new Set();
  wave = 0;
  spawnT = -1;
  reset = false;
  constructor(temple, box, seals, waves, onClear) {
    this.t = temple;
    this.box = box;
    this.seals = seals;
    this.waves = waves;
    this.onClear = onClear;
  }
  update(dt) {
    const state = this.t.ctx.player?.state;
    if (state && !state.dead) {
      if (this.state === 'idle') {
        const [x0, x1, z0, z1] = this.box;
        const lx = state.position.x - this.t.origin.x;
        const lz = state.position.z - this.t.origin.z;
        if (lx > x0 && lx < x1 && lz > z0 && lz < z1 && Math.abs(state.position.y - this.t.origin.y) < 4) this.start();
        return;
      }
      if (this.state === 'active' && this.spawnT >= 0) {
        this.spawnT -= dt;
        if (this.spawnT < 0) this.spawnWave();
      }
    }
  }
  start() {
    this.state = 'active';
    for (const seal of this.seals) seal.close();
    sfx(this.t.ctx, 'battle-sting', undefined, 0.9);
    if (this.ids.size === 0) this.spawnT = 0.7;
  }
  spawnWave() {
    const wave = this.waves[this.wave];
    if (!wave) return this.clear();
    for (const spawn of wave) {
      const pos = this.t.kit.w(spawn.x, 0.05, spawn.z);
      const id = this.t.ctx.enemies.spawn(spawn.kind, pos, {
        facing: spawn.facing ?? 0,
        rise: true,
        tier: 2,
      });
      if (id >= 0) this.ids.add(id);
    }
    if (this.ids.size === 0) this.clear();
  }
  onEnemyDeath(id) {
    if (this.ids.delete(id))
      if (!(this.ids.size > 0 || this.state !== 'active')) {
        this.wave++;
        if (this.wave < this.waves.length) this.spawnT = 1.4;
        else this.clear();
      }
  }
  clear() {
    if (this.state !== 'cleared') {
      this.state = 'cleared';
      for (const seal of this.seals) seal.open();
      try {
        this.onClear();
      } catch (err) {
        console.warn('[temples] room clear failed', err);
      }
    }
  }
  onDeath() {
    if (this.state === 'active') this.reset = true;
  }
  onRespawn() {
    if (this.reset) {
      this.reset = false;
      this.state = 'idle';
      this.spawnT = -1;
      for (const seal of this.seals) seal.open();
    }
  }
  skip() {
    this.state = 'cleared';
    for (const seal of this.seals) seal.open(true);
  }
}
export class BossFight {
  tp;
  o;
  state = 'sealed';
  bossId = -1;
  t = 0;
  reset = false;
  introDone = false;
  shot = {
    position: new Vector3(),
    target: new Vector3(),
    blend: 0.9,
    fov: 50,
  };
  cine = false;
  winStage = 0;
  roared = false;
  constructor(tp, o) {
    this.tp = tp;
    this.o = o;
  }
  unseal() {
    if (this.state === 'sealed') this.state = 'ready';
  }
  update(dt) {
    const ctx = this.tp.ctx;
    const state = ctx.player?.state;
    if (!state) return;
    const lx = state.position.x - this.tp.origin.x;
    const lz = state.position.z - this.tp.origin.z;
    this.t += dt;
    switch (this.state) {
      case 'ready':
        if (this.o.door.opts.pos.distanceTo(state.position) < 7 && this.o.door.target < 1) this.o.door.open();
        if (!state.dead && this.o.inside(lx, lz) && Math.abs(state.position.y - this.tp.origin.y) < 5) {
          this.state = 'intro';
          this.t = 0;
          this.o.door.close();
          this.o.onStart?.();
          this.tp.setCheckpointNear(this.o.door, 3.2, false);
          if (this.bossId < 0 || !ctx.enemies.get(this.bossId)?.alive) this.spawnBoss();
          if (this.introDone) this.state = 'fight';
          else this.beginIntro();
        }
        break;
      case 'intro':
        this.stepIntro(dt);
        this.o.hazards(dt, false);
        break;
      case 'fight':
        this.o.hazards(dt, true);
        break;
      case 'won':
        this.o.hazards(dt, false);
        this.stepWin(dt);
    }
  }
  spawnBoss() {
    const ctx = this.tp.ctx;
    const spawn = this.o.spawn;
    const pos = this.tp.kit.w(spawn.x, 0.05, spawn.z);
    this.bossId = ctx.enemies.spawn(this.o.kind, pos, {
      facing: spawn.facing,
      elite: this.o.elite,
      rise: true,
    });
    sfx(ctx, 'boss-rise', pos, 0.8);
  }
  beginIntro() {
    const ctx = this.tp.ctx;
    this.introDone = true;
    const introCam = this.o.introCam;
    this.shot.position.copy(this.tp.kit.w(introCam[0], introCam[1], introCam[2]));
    const spawn = this.o.spawn;
    this.shot.target.copy(this.tp.kit.w(spawn.x, 2.4, spawn.z));
    try {
      ctx.player.setControlEnabled(false);
      ctx.player.setCinematic(this.shot);
      this.cine = true;
    } catch {}
    try {
      ctx.events.emit('camera:shake', {
        strength: 0.45,
        position: this.shot.target.clone(),
      });
    } catch {}
  }
  stepIntro(dt) {
    if (!this.roared && this.t > 1.3) {
      this.roared = true;
      sfx(this.tp.ctx, 'boss-roar', this.shot.target, 0.7);
    }
    if (this.t > 2.5) {
      this.endCine();
      this.state = 'fight';
    }
  }
  endCine() {
    if (this.cine) {
      this.cine = false;
      try {
        this.tp.ctx.player.setCinematic(null);
        this.tp.ctx.player.setControlEnabled(true);
      } catch {}
    }
  }
  onEnemyDeath(id) {
    if (id === this.bossId && this.state !== 'won') {
      this.state = 'won';
      this.t = 0;
      this.winStage = 0;
      this.endCine();
    }
  }
  stepWin(dt) {
    const ctx = this.tp.ctx;
    const holding = !!ctx.player?.state?.itemHold;
    if (this.winStage === 0 && this.t > 2.4 && !holding && !ctx.player?.state?.dead) {
      this.winStage = 1;
      this.t = 0;
      const exitCam = this.o.exitCam;
      const exitLook = this.o.exitLook;
      this.shot.position.copy(this.tp.kit.w(exitCam[0], exitCam[1], exitCam[2]));
      this.shot.target.copy(this.tp.kit.w(exitLook[0], exitLook[1], exitLook[2]));
      try {
        ctx.player.setControlEnabled(false);
        ctx.player.setCinematic(this.shot);
        this.cine = true;
      } catch {}
      this.o.door.open();
    }
    if (this.winStage === 1 && this.t > 0.8) {
      this.winStage = 2;
      this.o.exitDoor.open();
      try {
        this.o.onWin();
      } catch (err) {
        console.warn('[temples] boss win failed', err);
      }
    }
    if (this.winStage === 2 && this.t > 3.4) {
      this.winStage = 3;
      this.endCine();
    }
  }
  onDeath() {
    if (this.state === 'intro' || this.state === 'fight') this.reset = true;
    this.endCine();
  }
  onRespawn() {
    if (this.reset) {
      this.reset = false;
      this.state = 'ready';
      this.o.door.open();
    }
  }
  skipWon() {
    this.state = 'won';
    this.winStage = 3;
    this.introDone = true;
    this.o.door.open(true);
    this.o.exitDoor.open(true);
  }
}
