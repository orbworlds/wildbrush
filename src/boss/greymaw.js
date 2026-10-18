/**
 * Greymaw, the boss: its hit targets and volumes, state machine (idle, attack, stuck, stagger, recover, phase shift), attacks per phase (slams, sweep, ink rain, crystal casts, summons) with telegraphs, damage, armour and crystal shattering, hit reactions and effects, and the uniforms it writes each frame.
 */
import { Color, Mesh, Vector3 } from 'three';
import { COLLISION_LAYERS, COLORS, interactionGroups, PALETTE } from '../core/config.js';
import { POOL_RADIUS } from './arena.js';
import { INK_COLOR, paintColor } from './fx.js';
import { createGreymawMaterials, createGreymawUniforms } from './greymaw-material.js';
import { CH, GreymawPose } from './greymaw-pose.js';
import {
  BODY_DAMAGE_MUL,
  BOSS_ID_BASE,
  COUNTER_COLOR,
  CRYSTAL_HP,
  CRYSTAL_RADIUS,
  CRYSTAL_STAGGER,
  FIST_RADIUS,
  HIT_VOLUME_GROUPS,
  INTERRUPT_COOLDOWN,
  INTERRUPT_HITS,
  INTERRUPT_STAGGER,
  MASK_DAMAGE_MUL,
  MASK_RADIUS,
  MASK_RADIUS_EXPOSED,
  MAX_HEALTH,
  PHASE2_ARMOUR,
  PHASE2_AT,
  PHASE3_AT,
  SHATTER_DAMAGE,
  SLAM_REACH,
  SLOT_BODY,
  SLOT_CRYSTAL,
  SLOT_FIST,
  SLOT_MASK,
} from './greymaw-tuning.js';
import { Hazards } from './hazards.js';
import { clamp, easeIn, easeInOut, easeOut, isFiniteVec, rand, smoothstep, TAU, wrapAngle, yawOf } from './math.js';
import { BONE, buildGreymawModel } from './model.js';
const _tmp = new Vector3();
const _tmp2 = new Vector3();
const _tmp3 = new Vector3();
const _tmpColor = new Color();
const _tmpColor2 = new Color();
const FLASH_WHITE = new Color(1, 1, 1);
const TELEGRAPH_ORANGE = new Color(1, 0.62, 0.28);
const SLAM_DUST = new Color(0xb9ad95);
const STONE_GREY = new Color(0x8a8794);
const SPLASH_INK = new Color(0x2a2831);
const HALO_GOLD = new Color(1, 0.84, 0.58);
class GreymawPart {
  g;
  slot;
  info;
  constructor(greymaw, slot, radius, height) {
    this.g = greymaw;
    this.slot = slot;
    this.info = {
      id: BOSS_ID_BASE + slot,
      kind: 'brute',
      position: new Vector3(),
      facing: 0,
      radius,
      height,
      health: MAX_HEALTH,
      maxHealth: MAX_HEALTH,
      alive: false,
      alerted: false,
      telegraphing: false,
      attackEta: -1,
      statuses: new Set(),
      elite: null,
      boss: true,
      aim: new Vector3(),
    };
  }
  hitTest(center, radius) {
    try {
      return this.g.hitTestSlot(this.slot, center, radius);
    } catch {
      return false;
    }
  }
  onHit(hit) {
    try {
      return this.g.onSlotHit(this.slot, hit);
    } catch (err) {
      console.warn('[boss] hit failed', err);
      return false;
    }
  }
}
export class Greymaw {
  ctx;
  arena;
  fx;
  opts;
  model;
  uni;
  pose;
  mesh;
  outline;
  hazards;
  parts = [];
  crystals = COLORS.map((color) => ({
    color,
    alive: true,
    hp: CRYSTAL_HP,
    flash: 0,
    cast: 0,
    lastDeflect: -9,
  }));
  state = 'dormant';
  stateT = 0;
  health = MAX_HEALTH;
  maxHealth = MAX_HEALTH;
  phase = 1;
  nextAtk = 2.5;
  atk = null;
  lastKinds = [];
  staggerDur = 5;
  stuckSince = 0;
  stuckFor = 2.5;
  lastMaster = -99;
  shiftTo = 0;
  summons = 0;
  flash = 0;
  coat = new Color();
  coatAmt = 0;
  crackBoost = 0;
  rage = 0;
  glowL = 0;
  glowR = 0;
  hurtSfxT = 0;
  time = 0;
  breather = 0;
  registered = false;
  headCollider = null;
  headData = {
    boss: true,
    enemyId: BOSS_ID_BASE + SLOT_BODY,
    part: 'body',
    slot: SLOT_BODY,
  };
  volByHandle = new Map();
  vols = [];
  volsParked = false;
  spine = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  spineR = [3.5, 3.4, 2.4, 1.6, 1.6];
  foreMid = [new Vector3(), new Vector3()];
  upperMid = [new Vector3(), new Vector3()];
  probeC = new Vector3();
  probeR = 0;
  probeOn = false;
  rangedExposed = false;
  windowHits = 0;
  windowAtk = null;
  lastInterrupt = -99;
  haloT = 0;
  maskPos = new Vector3();
  crystalPos = [0, 1, 2, 3].map(() => new Vector3());
  player = new Vector3();
  playerDist = 10;
  playerAng = 0;
  wantYaw = 0;
  turnRate = 0.9;
  lookYaw = 0;
  fistsStuck = false;
  stuckPos = [new Vector3(), new Vector3()];
  flags2 = new Set();
  shieldHinted = false;
  summonIds = [];
  wet = 0;
  onDefeat = null;
  onPhase = null;
  exposedTime = 0;
  constructor(ctx, arena, fx, opts) {
    this.ctx = ctx;
    this.arena = arena;
    this.fx = fx;
    this.opts = opts;
    this.model = buildGreymawModel();
    this.uni = createGreymawUniforms();
    const mats = createGreymawMaterials(ctx, this.uni);
    this.mesh = new Mesh(this.model.geometry, mats.body);
    this.mesh.name = 'greymaw';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.customDepthMaterial = mats.depth;
    this.mesh.matrixAutoUpdate = false;
    this.outline = new Mesh(this.model.geometry, mats.outline);
    this.outline.name = 'greymaw-outline';
    this.outline.frustumCulled = false;
    this.outline.renderOrder = -1;
    this.outline.matrixAutoUpdate = false;
    ctx.scene.add(this.mesh, this.outline);
    this.pose = new GreymawPose(this.model.rig, this.uni.uBones.value);
    this.pose.root.copy(arena.center);
    this.pose.yaw = arena.stairYaw;
    this.wantYaw = arena.stairYaw;
    this.pose.rise = 0.36;
    this.uni.uPool.value.set(arena.center.x, arena.center.z, arena.floorY + 0.03, POOL_RADIUS + 0.35);
    this.hazards = new Hazards(ctx, fx, arena.center, arena.floorY);
    this.hazards.onPlayerHit = () => {
      this.breather = Math.max(this.breather, 0.9);
    };
    this.parts.push(new GreymawPart(this, SLOT_BODY, 3.8, 9));
    this.parts.push(new GreymawPart(this, SLOT_MASK, 1.9, 3));
    this.parts.push(new GreymawPart(this, SLOT_FIST, 1.6, 2.6));
    this.parts.push(new GreymawPart(this, 3, 1.6, 2.6));
    for (let i = 0; i < 4; i++) this.parts.push(new GreymawPart(this, SLOT_CRYSTAL + i, 1.1, 2));
    for (let i = 0; i < 5; i++) this.makeVol([3.3, 3.2, 2.3, 1.5, 1.5][i], SLOT_BODY, 'body', this.spine[i]);
    for (let i = 0; i < 2; i++) this.makeVol(1.3, SLOT_BODY, 'body', this.upperMid[i]);
    for (let i = 0; i < 2; i++) this.makeVol(1.2, SLOT_BODY, 'body', this.foreMid[i]);
    this.makeVol(1.9, SLOT_MASK, 'mask', this.maskPos);
    for (let i = 0; i < 2; i++) this.makeVol(1.5, SLOT_FIST + i, 'fist', this.pose.worldFist[i]);
    for (let i = 0; i < 4; i++) this.makeVol(1.45, SLOT_CRYSTAL + i, 'crystal', this.crystalPos[i]);
    this.headCollider = this.makeBlocker(2.3);
    if (this.headCollider) this.volByHandle.set(this.headCollider.handle, this.headData);
    if (arena.bodyHandle >= 0)
      this.volByHandle.set(arena.bodyHandle, {
        boss: true,
        enemyId: BOSS_ID_BASE + SLOT_BODY,
        part: 'body',
        slot: SLOT_BODY,
      });
    this.pose.step(0);
    this.syncParts();
  }
  makeVol(radius, slot, part, target) {
    try {
      const RAPIER = this.ctx.RAPIER;
      const center = this.arena.center;
      const body = this.ctx.physics.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y - 40, center.z),
      );
      const collider = this.ctx.physics.createCollider(
        RAPIER.ColliderDesc.ball(radius).setCollisionGroups(HIT_VOLUME_GROUPS).setFriction(0),
        body,
      );
      const data = {
        boss: true,
        enemyId: BOSS_ID_BASE + slot,
        part,
        slot,
      };
      this.ctx.colliders.register(collider, {
        kind: 'enemy',
        surface: 'stone',
        data,
      });
      this.volByHandle.set(collider.handle, data);
      this.vols.push({
        body,
        col: collider,
        slot,
        data,
        target,
      });
    } catch (err) {
      console.warn('[boss] hit volume failed', err);
    }
  }
  makeBlocker(radius) {
    try {
      const desc = this.ctx.RAPIER.ColliderDesc.ball(radius)
        .setTranslation(this.arena.center.x, this.arena.center.y - 30, this.arena.center.z)
        .setCollisionGroups(interactionGroups(COLLISION_LAYERS.STATIC, COLLISION_LAYERS.ALL));
      const collider = this.ctx.physics.createCollider(desc);
      this.ctx.colliders.register(collider, {
        kind: 'enemy',
        surface: 'stone',
        data: this.headData,
      });
      return collider;
    } catch (err) {
      console.warn('[boss] head collider failed', err);
      return null;
    }
  }
  get active() {
    return this.state !== 'dormant' && this.state !== 'gone' && this.state !== 'sinking' && this.state !== 'dying';
  }
  get fighting() {
    return (
      this.state === 'idle' ||
      this.state === 'attack' ||
      this.state === 'stuck' ||
      this.state === 'stagger' ||
      this.state === 'recover' ||
      this.state === 'shift'
    );
  }
  get shattered() {
    return this.crystals.filter((crystal) => !crystal.alive).length;
  }
  setState(state) {
    this.state = state;
    this.stateT = 0;
    this.flags2.clear();
  }
  resetStats() {
    this.health = MAX_HEALTH;
    this.phase = 1;
    for (const crystal of this.crystals) {
      crystal.alive = true;
      crystal.hp = CRYSTAL_HP;
      crystal.flash = 0;
      crystal.cast = 0;
    }
    this.atk = null;
    this.fistsStuck = false;
    this.summons = 0;
    this.crackBoost = 0;
    this.rage = 0;
    this.lastInterrupt = -99;
    this.windowAtk = null;
    this.windowHits = 0;
    this.hazards.clear();
    this.hazards.dmgMul = 1;
    this.lastKinds.length = 0;
    this.pose.fistJitter[0].set(0, 0, 0);
    this.pose.fistJitter[1].set(0, 0, 0);
  }
  beginFight(phase = 1) {
    this.phase = phase;
    if (phase >= 2) this.health = Math.min(this.health, MAX_HEALTH * PHASE2_AT);
    if (phase >= 3) {
      this.health = Math.min(this.health, MAX_HEALTH * PHASE3_AT);
      for (const crystal of this.crystals) crystal.alive = false;
      this.startEdge();
    }
    this.hazards.dmgMul = phase >= 3 ? 1.5 : 1;
    this.setState('idle');
    this.nextAtk = 1.6;
    this.register(true);
  }
  register(registered) {
    if (registered !== this.registered) {
      this.registered = registered;
      for (const part of this.parts) {
        try {
          if (registered) this.ctx.enemies.registerTarget(part);
          else this.ctx.enemies.unregisterTarget(part.info.id);
        } catch {}
        part.info.alive = false;
        part.info.alerted = false;
        part.info.telegraphing = false;
      }
    }
  }
  dismissSummons() {
    for (const id of this.summonIds)
      try {
        const enemy = this.ctx.enemies.get(id);
        if (!enemy || !enemy.alive) continue;
        this.ctx.enemies.damage(id, {
          damage: 99,
          color: null,
          direction: new Vector3(0, 0, 1),
          knockback: 0,
          source: 'environment',
          point: enemy.position.clone(),
        });
      } catch {}
    this.summonIds.length = 0;
  }
  force(kind) {
    if (this.fighting) {
      this.atk = null;
      this.fistsStuck = false;
      this.startAttack(kind);
    }
  }
  update(dt) {
    this.time += dt;
    this.stateT += dt;
    const state = this.ctx.player?.state;
    if (state) this.player.copy(state.position);
    const center = this.arena.center;
    this.playerDist = Math.hypot(this.player.x - center.x, this.player.z - center.z);
    this.playerAng = yawOf(this.player.x - center.x, this.player.z - center.z);
    this.breather = Math.max(0, this.breather - dt);
    this.hurtSfxT = Math.max(0, this.hurtSfxT - dt);
    this.basePose(dt);
    switch (this.state) {
      case 'idle':
        this.stepIdle(dt);
        break;
      case 'attack':
        this.stepAttack(dt);
        break;
      case 'stuck':
        this.stepStuck(dt);
        break;
      case 'stagger':
        this.stepStagger(dt);
        break;
      case 'recover':
        this.stepRecover(dt);
        break;
      case 'shift':
        this.stepShift(dt);
    }
    const turn = wrapAngle(this.wantYaw - this.pose.yaw);
    const maxTurn = this.turnRate * dt;
    this.pose.yaw = wrapAngle(this.pose.yaw + clamp(turn, -maxTurn, maxTurn));
    if (Math.abs(turn) > 0.05 && this.state !== 'dying') this.pose.set(CH.TWIST, clamp(turn * 0.5, -0.25, 0.25));
    this.updateRangedWindow(dt);
    this.hazards.update(dt);
    this.decay(dt);
    if (this.phase === 2 && this.fighting && dt > 0 && Math.random() < 0.5) {
      const ci = Math.floor(Math.random() * 4);
      if (this.crystals[ci].alive) {
        const pos = this.crystalPos[ci];
        paintColor(this.crystals[ci].color, _tmpColor);
        this.fx.glows.spawn(
          this.fx.now,
          pos.x + rand(-0.5, 0.5),
          pos.y + rand(-0.3, 0.8),
          pos.z + rand(-0.5, 0.5),
          rand(-1, 1),
          rand(0.5, 2.5),
          rand(-1, 1),
          rand(0.08, 0.16),
          rand(0.4, 0.8),
          _tmpColor,
          3,
          -1,
          1.5,
          1,
        );
      }
    }
  }
  lateUpdate(dt) {
    this.pose.step(dt);
    this.writeUniforms(dt);
    this.syncParts();
    this.probeOn = false;
  }
  decay(dt) {
    this.flash = Math.max(0, this.flash - dt * 5);
    this.coatAmt = Math.max(0, this.coatAmt - dt * 0.12);
    for (const crystal of this.crystals) {
      crystal.flash = Math.max(0, crystal.flash - dt * 3);
      crystal.cast = Math.max(0, crystal.cast - dt * 0.6);
    }
  }
  rangedWindow() {
    const atk = this.atk;
    return this.state !== 'attack' || !atk
      ? false
      : atk.kind === 'rain'
        ? atk.t > 0.2 && atk.t < atk.w + 1.35
        : atk.crystal >= 0
          ? atk.t > 0.15 && atk.t < atk.w + 0.1
          : atk.kind === 'summon' && atk.t < atk.w;
  }
  updateRangedWindow(dt) {
    const exposed = this.fighting && this.registered && this.rangedWindow();
    if (exposed && this.windowAtk !== this.atk) {
      this.windowAtk = this.atk;
      this.windowHits = 0;
    }
    this.rangedExposed = exposed;
    if (!exposed) return;
    const pose = this.pose;
    pose.set(CH.GLOW, Math.max(pose.sp.target[CH.GLOW], 1.15));
    pose.set(CH.EYE, Math.max(pose.sp.target[CH.EYE], 1.3));
    if (dt <= 0 || ((this.haloT -= dt), this.haloT > 0)) return;
    this.haloT = 0.04;
    const maskPos = this.maskPos;
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 11);
    this.fx.glows.spawn(
      this.fx.now,
      maskPos.x,
      maskPos.y,
      maskPos.z,
      0,
      0,
      0,
      4.6 * pulse,
      0.22,
      HALO_GOLD,
      0.55,
      0,
      1,
      0,
    );
    for (let i2 = 0; i2 < 3; i2++) {
      const angle = this.time * 3.2 + (i2 * TAU) / 3;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      this.fx.glows.spawn(
        this.fx.now,
        maskPos.x + cos * 2.8,
        maskPos.y + Math.sin(angle * 2) * 0.45,
        maskPos.z + sin * 2.8,
        -sin * 2,
        0,
        cos * 2,
        0.36,
        0.45,
        HALO_GOLD,
        4.5,
        0,
        0.5,
        1,
      );
    }
    const angle = Math.random() * TAU;
    const radius = rand(2.6, 3.8);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.fx.glows.spawn(
      this.fx.now,
      maskPos.x + cos * radius,
      maskPos.y + rand(-1.4, 1.4),
      maskPos.z + sin * radius,
      -cos * radius * 1.8,
      rand(-0.6, 0.6),
      -sin * radius * 1.8,
      rand(0.1, 0.16),
      0.5,
      HALO_GOLD,
      3.5,
      0,
      0.8,
      1.2,
    );
  }
  get armour() {
    return this.phase === 2 ? PHASE2_ARMOUR + 0.4 * (this.shattered / 4) : 1;
  }
  get heavyShoulders() {
    return this.phase === 2 && (this.crystals[2].alive || this.crystals[3].alive);
  }
  basePose(dt) {
    const pose = this.pose;
    const time = this.time;
    const breath = Math.sin(time * 1.25);
    const awake = this.state !== 'dormant' && this.state !== 'sinking';
    pose.set(CH.SQUASH, 1 + breath * 0.022);
    pose.set(CH.WIDTH, 1 - breath * 0.01);
    pose.set(CH.LEAN_P, awake ? 0.14 + breath * 0.015 : 0.02 + breath * 0.02);
    pose.set(CH.LEAN_R, Math.sin(time * 0.43) * 0.03);
    pose.set(CH.TWIST, 0);
    pose.set(CH.CHEST_P, awake ? 0.08 : 0.04);
    pose.set(CH.CHEST_R, Math.sin(time * 0.37) * 0.035);
    pose.set(CH.CHEST_Y, 0);
    pose.set(CH.CHEST_OX, 0);
    pose.set(CH.CHEST_OY, breath * 0.05);
    pose.set(CH.CHEST_OZ, 0);
    pose.set(CH.SINK, 0);
    pose.set(CH.JAW, 0.03 + Math.max(0, Math.sin(time * 0.31)) * 0.05);
    pose.set(CH.MASK_PUSH, 0);
    pose.set(CH.MASK_P, 0);
    pose.set(CH.MASK_R, Math.sin(time * 0.5) * 0.03);
    pose.set(CH.EYE, awake ? 1 : 0.15);
    pose.set(CH.ANGER, awake ? 0.45 + 0.2 * (this.phase - 1) : 0);
    pose.set(CH.GLOW, 0);
    pose.set(CH.MOUTH, 0);
    pose.set(CH.GLOW_L, 0);
    pose.set(CH.GLOW_R, 0);
    pose.set(CH.LW_P, 0.2);
    pose.set(CH.RW_P, 0.2);
    pose.set(CH.LW_R, 0);
    pose.set(CH.RW_R, 0);
    pose.set(CH.LF_S, 1);
    pose.set(CH.RF_S, 1);
    pose.set(CH.LP_UP, 0.1);
    pose.set(CH.LP_BACK, 0.45);
    pose.set(CH.RP_UP, 0.1);
    pose.set(CH.RP_BACK, 0.45);
    pose.set(CH.MANE_X, 0);
    pose.set(CH.MANE_Z, 0);
    pose.set(CH.BRUSH_X, 0);
    pose.set(CH.BRUSH_Z, 0);
    const sway = Math.sin(time * 0.7);
    if (awake) {
      pose.fist(0, 6, 1.45 + Math.max(0, sway) * 0.35, 6.2 + sway * 0.2);
      pose.fist(1, -6, 1.45 + Math.max(0, -sway) * 0.35, 6.2 - sway * 0.2);
    } else {
      pose.fist(0, 3.4, -2.5, 1.8);
      pose.fist(1, -3.4, -2.5, 1.8);
      pose.set(CH.LP_UP, -1.6);
      pose.set(CH.RP_UP, -1.6);
      pose.set(CH.LP_BACK, 0.2);
      pose.set(CH.RP_BACK, 0.2);
    }
    pose.setFistStiffness(0, 1.5);
    pose.setFistStiffness(1, 1.5);
    if (awake) {
      const toPlayer = wrapAngle(this.playerAng - this.pose.yaw);
      this.lookYaw += (clamp(toPlayer, -0.7, 0.7) - this.lookYaw) * Math.min(1, dt * 3);
      pose.set(CH.HEAD_Y, this.lookYaw * 0.7);
      const dy = this.player.y + 1 - (this.arena.floorY + 6.5);
      pose.set(CH.HEAD_P, clamp(-Math.atan2(dy, Math.max(3, this.playerDist - 3)) * 0.6, -0.4, 0.35) + 0.05);
      pose.set(CH.HEAD_R, Math.sin(time * 0.6) * 0.04);
    } else {
      pose.set(CH.HEAD_Y, Math.sin(time * 0.2) * 0.08);
      pose.set(CH.HEAD_P, -0.08 + breath * 0.03);
      pose.set(CH.HEAD_R, 0.1);
    }
  }
  stepIdle(dt) {
    this.wantYaw = this.playerAng;
    this.turnRate = [0, 0.9, 1.1, 1.45][this.phase];
    if (!this.opts.noAttack)
      if (!this.ctx.player?.state?.dead) {
        this.nextAtk -= dt;
        if (!(this.nextAtk > 0 || this.breather > 0)) this.startAttack(this.chooseAttack());
      }
  }
  gap() {
    return this.phase === 1 ? rand(1.5, 2.3) : this.phase === 2 ? rand(1.2, 1.9) : rand(0.6, 1.2);
  }
  chooseAttack() {
    const far = this.playerDist > 15.6;
    const weights = {};
    if (this.phase === 1) {
      weights.slam = far ? 0.2 : 0.46;
      weights.sweep = far ? 0.25 : 0.32;
      weights.rain = far ? 0.75 : 0.22;
    } else if (this.phase === 2) {
      const alive = this.crystals.map((crystal, i) => (crystal.alive ? i : -1)).filter((idx) => idx >= 0);
      const casts = ['fire', 'ice', 'bounce', 'thorns'];
      for (const idx of alive) weights[casts[idx]] = 0.55 / Math.max(1, alive.length) + (far ? 0.1 : 0);
      weights.slam = far ? 0.1 : 0.26;
      weights.sweep = far ? 0.08 : 0.12;
      weights.rain = far ? 0.3 : 0.1;
      if ((this.summons === 0 || (this.summons === 1 && this.shattered >= 2)) && this.time > 3) weights.summon = 3;
    } else {
      weights.combo = far ? 0.1 : 0.32;
      weights.double = far ? 0.1 : 0.22;
      weights.slam = far ? 0.12 : 0.16;
      weights.sweep = far ? 0.12 : 0.14;
      weights.rain = far ? 0.6 : 0.16;
    }
    const lastKinds = this.lastKinds;
    if (
      lastKinds.length >= 2 &&
      lastKinds[lastKinds.length - 1] === lastKinds[lastKinds.length - 2] &&
      weights[lastKinds[lastKinds.length - 1]] !== undefined
    )
      weights[lastKinds[lastKinds.length - 1]] = 0.02;
    let total = 0;
    for (const key of Object.keys(weights)) total += weights[key] ?? 0;
    let roll = Math.random() * total;
    for (const key of Object.keys(weights)) {
      roll -= weights[key] ?? 0;
      if (roll <= 0) return key;
    }
    return 'slam';
  }
  startAttack(kind) {
    const player = this.player;
    this.arena.center;
    const windMul = this.phase >= 3 ? 0.8 : 1;
    const atk = {
      kind,
      t: 0,
      w: 1,
      side: 0,
      target: new Vector3(),
      target2: new Vector3(),
      flags: new Set(),
      impactAt: 1,
      a0: 0,
      a1: 0,
      radius: 10,
      crystal: -1,
      done: false,
      stuckFor: 2.5,
      prevA: 0,
    };
    this.lastKinds.push(kind);
    if (this.lastKinds.length > 4) this.lastKinds.shift();
    switch (kind) {
      case 'slam':
      case 'combo':
        atk.w = 1.05 * windMul;
        atk.impactAt = atk.w + 0.2;
        atk.stuckFor =
          kind === 'combo' ? 1.1 : this.phase === 1 ? 2.7 : this.phase === 2 ? (this.heavyShoulders ? 2.9 : 2.3) : 1.7;
        this.slamTarget(atk.target);
        break;
      case 'double':
        atk.w = 0.8;
        atk.impactAt = atk.w + 0.18;
        atk.stuckFor = 1.6;
        atk.side = this.playerLocalX() > 0 ? 0 : 1;
        this.slamTarget(atk.target);
        break;
      case 'sweep':
        atk.w = 0.95 * windMul;
        atk.side = +(this.playerLocalX() > 0);
        atk.radius = clamp(this.playerDist, 6.8, 14);
        atk.a0 = atk.side === 1 ? -2.05 : 2.05;
        atk.a1 = -atk.a0;
        atk.impactAt = atk.w + 0.4;
        break;
      case 'rain':
        atk.w = 0.85 * windMul;
        atk.impactAt = atk.w + 1.7;
        break;
      case 'fire':
      case 'ice':
      case 'bounce':
      case 'thorns':
        atk.crystal = kind === 'fire' ? 0 : kind === 'ice' ? 1 : kind === 'bounce' ? 2 : 3;
        atk.w = kind === 'bounce' || kind === 'thorns' ? 0.95 : 1.05;
        atk.side = kind === 'fire' || kind === 'bounce' ? 0 : 1;
        atk.impactAt = atk.w + 0.3;
        atk.target.copy(player);
        break;
      case 'summon':
        atk.w = 1;
        atk.impactAt = 99;
    }
    this.atk = atk;
    this.setState('attack');
    if (atk.crystal < 0 && kind !== 'summon') {
      const id = kind === 'rain' ? this.parts[SLOT_BODY].info.id : this.parts[SLOT_FIST + atk.side].info.id;
      this.emitSafe('enemy:telegraph', {
        id,
        kind: 'brute',
        position: this.fistOrBody(atk.side).clone(),
        attack: kind,
        eta: atk.impactAt,
      });
    }
  }
  slamTarget(out) {
    const center = this.arena.center;
    const state = this.ctx.player?.state;
    out.copy(this.player);
    if (state) out.addScaledVector(_tmp.set(state.velocity.x, 0, state.velocity.z), 0.25);
    out.y = this.arena.floorY;
    Hazards.clampToArena(out, center, SLAM_REACH, 8);
  }
  playerLocalX() {
    this.pose.toLocal(this.player, _tmp3);
    return _tmp3.x;
  }
  fistOrBody(side) {
    return this.pose.worldFist[side] ?? this.arena.center;
  }
  once(flag, at) {
    const atk = this.atk;
    if (!atk || atk.flags.has(flag) || atk.t < at) {
      return false;
    } else {
      atk.flags.add(flag);
      return true;
    }
  }
  stepAttack(dt) {
    const atk = this.atk;
    if (!atk) {
      this.setState('idle');
      return;
    }
    atk.t += dt;
    switch (atk.kind) {
      case 'slam':
      case 'combo':
        this.doSlam(atk, dt);
        break;
      case 'double':
        this.doDouble(atk, dt);
        break;
      case 'sweep':
        this.doSweep(atk, dt);
        break;
      case 'rain':
        this.doRain(atk);
        break;
      case 'fire':
        this.doFire(atk);
        break;
      case 'ice':
        this.doIce(atk);
        break;
      case 'bounce':
        this.doBounce(atk);
        break;
      case 'thorns':
        this.doThorns(atk);
        break;
      case 'summon':
        this.doSummon(atk);
    }
    if (atk.done && this.state === 'attack') this.endAttack();
  }
  endAttack() {
    this.atk = null;
    this.setState('idle');
    this.nextAtk = this.gap();
    for (const side of [0, 1]) {
      this.pose.setFistStiffness(side, 1.5);
      this.pose.fistJitter[side].set(0, 0, 0);
    }
  }
  doSlam(atk, dt) {
    const pose = this.pose;
    const w = atk.w;
    const fall = 0.2;
    const t2 = atk.t;
    const spread = 1.7;
    if (t2 < w) {
      if (t2 < w * 0.62) this.slamTarget(atk.target);
      this.wantYaw = yawOf(atk.target.x - this.arena.center.x, atk.target.z - this.arena.center.z);
      this.turnRate = 2.6;
      const u = t2 / w;
      const raise = easeOut(clamp(u / 0.55, 0, 1));
      const tense = smoothstep(0.55, 1, u);
      pose.fist(0, 2.6 - tense * 0.4, 12.2 + raise * 0.8, 0.8 - tense * 0.5);
      pose.fist(1, -2.6 + tense * 0.4, 12.2 + raise * 0.8, 0.8 - tense * 0.5);
      pose.set(CH.LP_UP, 1.2);
      pose.set(CH.RP_UP, 1.2);
      pose.set(CH.LP_BACK, 0.2);
      pose.set(CH.RP_BACK, 0.2);
      pose.set(CH.LEAN_P, -0.22 * raise - 0.05 * tense);
      pose.set(CH.CHEST_P, -0.22 * raise);
      pose.set(CH.HEAD_P, -0.2 * raise);
      pose.set(CH.SQUASH, 1 + 0.07 * raise);
      pose.set(CH.JAW, 0.35 * raise);
      pose.set(CH.ANGER, 1);
      pose.set(CH.EYE, 1.15);
      pose.set(CH.GLOW, 0.8 * raise);
      pose.set(CH.GLOW_L, smoothstep(0.1, 0.7, u));
      pose.set(CH.GLOW_R, smoothstep(0.1, 0.7, u));
      pose.set(CH.LW_P, -0.6 * raise);
      pose.set(CH.RW_P, -0.6 * raise);
      const jitter = smoothstep(0.7, 1, u) * 0.12;
      pose.fistJitter[0].set(rand(-jitter, jitter), rand(-jitter, jitter), rand(-jitter, jitter));
      pose.fistJitter[1].set(rand(-jitter, jitter), rand(-jitter, jitter), rand(-jitter, jitter));
      if (this.once('mark', w * 0.62)) {
        const eta = w + fall - t2;
        this.impactPoints(atk.target, spread, _tmp, _tmp2);
        this.fx.marker(_tmp, 2.2, eta, TELEGRAPH_ORANGE, 2.4);
        this.fx.marker(_tmp2, 2.2, eta, TELEGRAPH_ORANGE, 2.4);
        this.fx.decals.spawn(
          this.fx.now,
          atk.target.x,
          this.arena.floorY,
          atk.target.z,
          3,
          3,
          eta + 0.05,
          1,
          _tmpColor.set(14206632),
          1.2,
          0,
          0,
          eta,
        );
      }
    } else if (t2 < w + fall) {
      this.impactPoints(atk.target, spread, _tmp, _tmp2);
      pose.setFistStiffness(0, 7, 0.9);
      pose.setFistStiffness(1, 7, 0.9);
      pose.fistWorld(0, _tmp.setY(this.arena.floorY + 1));
      pose.fistWorld(1, _tmp2.setY(this.arena.floorY + 1));
      pose.fistJitter[0].set(0, 0, 0);
      pose.fistJitter[1].set(0, 0, 0);
      pose.set(CH.LEAN_P, 0.5);
      pose.set(CH.CHEST_P, 0.38);
      pose.set(CH.HEAD_P, 0.25);
      pose.set(CH.SQUASH, 0.93);
      pose.set(CH.JAW, 0.6);
      pose.set(CH.ANGER, 1);
      pose.set(CH.GLOW_L, 1);
      pose.set(CH.GLOW_R, 1);
      pose.set(CH.LW_P, 0.3);
      pose.set(CH.RW_P, 0.3);
      pose.set(CH.LP_UP, 0.6);
      pose.set(CH.RP_UP, 0.6);
      if (this.once('attack', w)) {
        this.emitSafe('enemy:attack', {
          id: this.parts[SLOT_FIST].info.id,
          kind: 'brute',
          position: atk.target.clone(),
          attack: atk.kind,
        });
        this.play('boss-sweep', atk.target, 0.5, 0.7);
      }
    } else {
      if (this.once('impact', w + fall)) this.slamImpact(atk, spread);
      this.impactPoints(atk.target, spread, _tmp, _tmp2);
      this.stuckPos[0].copy(_tmp).setY(this.arena.floorY + 0.75);
      this.stuckPos[1].copy(_tmp2).setY(this.arena.floorY + 0.75);
      pose.fistWorld(0, this.stuckPos[0]);
      pose.fistWorld(1, this.stuckPos[1]);
      this.fistsStuck = true;
      this.stuckFor = atk.stuckFor;
      this.stuckSince = this.time;
      this.setState('stuck');
    }
  }
  impactPoints(target, spread, outA, outB) {
    const center = this.arena.center;
    const dx = target.x - center.x;
    const dz = target.z - center.z;
    const len = Math.hypot(dx, dz) || 1;
    const px = dz / len;
    const pz = -dx / len;
    outA.set(target.x + px * spread, this.arena.floorY, target.z + pz * spread);
    outB.set(target.x - px * spread, this.arena.floorY, target.z - pz * spread);
  }
  slamImpact(atk, spread) {
    const floorY = this.arena.floorY;
    const pose = this.pose;
    pose.snapFist(0);
    pose.snapFist(1);
    pose.kick(CH.SQUASH, -1.4);
    pose.kick(CH.LF_S, -3);
    pose.kick(CH.RF_S, -3);
    pose.kick(CH.CHEST_OY, -2.5);
    pose.kick(CH.MASK_PUSH, 1.5);
    const point = _tmp3.copy(atk.target).setY(floorY);
    this.impactPoints(atk.target, spread, _tmp, _tmp2);
    for (const impact of [_tmp, _tmp2]) {
      this.fx.inkSplash(_tmp.set(impact.x, floorY + 0.4, impact.z), null, 18, 7, 0.14, SPLASH_INK);
      this.fx.dust(impact, 12, 2.2, 1.1, SLAM_DUST, 0.6);
      this.fx.puddle(impact, 2.4, 6, INK_COLOR, 0.8);
      for (let i = 0; i < 6; i++)
        this.fx.shards.spawn(
          this.fx.now,
          impact.x,
          floorY + 0.3,
          impact.z,
          rand(-5, 5),
          rand(4, 9),
          rand(-5, 5),
          rand(0.14, 0.3),
          rand(1.2, 2),
          floorY,
          _tmpColor.set(9406332),
          1,
          rand(4, 10),
        );
    }
    this.fx.sparks(_tmp3.copy(point).setY(floorY + 0.5), TELEGRAPH_ORANGE, 20, 8, 2.8, 0.1, 8);
    const shockSpeed = this.phase >= 3 ? 14 : 12;
    this.hazards.shock(point.x, point.z, shockSpeed, 17, 1, SLAM_DUST, 0.75, 3.1);
    this.emitSafe('camera:shake', {
      strength: 1,
      position: point.clone(),
    });
    this.play('boss-slam', point, 1);
    if (Math.hypot(this.player.x - point.x, this.player.z - point.z) < 3.1 && this.player.y - floorY < 1.8)
      this.damagePlayer(1.5, _tmp.set(this.player.x - point.x, 0, this.player.z - point.z), 11, 'slam');
    try {
      this.ctx.paint.eraseSphere(point.clone().setY(floorY), 2.5);
    } catch {}
  }
  doDouble(atk, dt) {
    const pose = this.pose;
    const t2 = atk.t;
    const w = atk.w;
    const wind2 = 0.62;
    const side = atk.side;
    const other = 1 - side;
    const start2 = w + 0.18 + 0.1;
    if (t2 < w) {
      if (t2 < w * 0.6) this.slamTarget(atk.target);
      this.wantYaw = yawOf(atk.target.x - this.arena.center.x, atk.target.z - this.arena.center.z);
      this.turnRate = 2.8;
      const u = t2 / w;
      const raise = easeOut(clamp(u / 0.6, 0, 1));
      const sign = side === 0 ? 1 : -1;
      pose.fist(side, 3.5 * sign, 12 * raise + 1.3 * (1 - raise), 2 + 1.5 * (1 - raise));
      pose.set(side === 0 ? CH.LP_UP : CH.RP_UP, 1.1);
      pose.set(CH.LEAN_R, -0.12 * sign * raise);
      pose.set(CH.LEAN_P, -0.1 * raise);
      pose.set(side === 0 ? CH.GLOW_L : CH.GLOW_R, smoothstep(0.1, 0.7, u));
      pose.set(CH.ANGER, 1);
      if (this.once('mark1', w * 0.6)) this.fx.marker(_tmp.copy(atk.target), 2.3, w + 0.18 - t2, TELEGRAPH_ORANGE, 2.4);
    } else if (t2 < w + 0.18) {
      pose.setFistStiffness(side, 7, 0.9);
      pose.fistWorld(side, _tmp.copy(atk.target).setY(this.arena.floorY + 1));
      pose.set(CH.LEAN_P, 0.4);
      pose.set(side === 0 ? CH.GLOW_L : CH.GLOW_R, 1);
    } else {
      if (this.once('impact1', w + 0.18)) {
        this.singleImpact(side, atk.target);
        this.slamTarget(atk.target2);
        this.fx.marker(_tmp.copy(atk.target2), 2.3, wind2, TELEGRAPH_ORANGE, 2.4);
        this.emitSafe('enemy:telegraph', {
          id: this.parts[SLOT_FIST + other].info.id,
          kind: 'brute',
          position: atk.target2.clone(),
          attack: 'slam',
          eta: wind2,
        });
      }
      pose.fistWorld(side, _tmp.copy(atk.target).setY(this.arena.floorY + 0.7));
      const u = clamp((t2 - start2) / wind2, 0, 1);
      this.wantYaw = yawOf(atk.target2.x - this.arena.center.x, atk.target2.z - this.arena.center.z);
      const sign = other === 0 ? 1 : -1;
      if (u < 1) {
        const lift = easeOut(clamp(u / 0.55, 0, 1)) * (1 - smoothstep(0.75, 1, u));
        pose.fist(other, 3.5 * sign, 1.2 + 10.5 * lift, 2 + 4 * smoothstep(0.75, 1, u));
        if (u > 0.75) {
          pose.setFistStiffness(other, 7, 0.9);
          pose.fistWorld(other, _tmp.copy(atk.target2).setY(this.arena.floorY + 1));
        }
        pose.set(other === 0 ? CH.GLOW_L : CH.GLOW_R, smoothstep(0, 0.6, u));
        pose.set(CH.LEAN_P, 0.3);
      } else {
        if (this.once('impact2', start2 + wind2)) this.singleImpact(other, atk.target2);
        this.stuckPos[side].copy(atk.target).setY(this.arena.floorY + 0.75);
        this.stuckPos[other].copy(atk.target2).setY(this.arena.floorY + 0.75);
        pose.fistWorld(other, this.stuckPos[other]);
        this.fistsStuck = true;
        this.stuckFor = atk.stuckFor;
        this.stuckSince = this.time;
        this.setState('stuck');
      }
    }
  }
  singleImpact(side, point) {
    const floorY = this.arena.floorY;
    this.pose.snapFist(side);
    this.pose.kick(side === 0 ? CH.LF_S : CH.RF_S, -3);
    this.pose.kick(CH.SQUASH, -0.8);
    this.fx.inkSplash(_tmp.set(point.x, floorY + 0.4, point.z), null, 14, 6, 0.13, SPLASH_INK);
    this.fx.dust(_tmp, 10, 2, 1, SLAM_DUST, 0.6);
    this.fx.puddle(_tmp, 2, 5, INK_COLOR, 0.8);
    this.hazards.shock(point.x, point.z, 13, 12, 1, SLAM_DUST, 0.7, 2.8);
    this.emitSafe('camera:shake', {
      strength: 0.75,
      position: point.clone(),
    });
    this.emitSafe('enemy:attack', {
      id: this.parts[SLOT_FIST + side].info.id,
      kind: 'brute',
      position: point.clone(),
      attack: 'slam',
    });
    this.play('boss-slam', point, 0.8);
    if (Math.hypot(this.player.x - point.x, this.player.z - point.z) < 2.8 && this.player.y - floorY < 1.8)
      this.damagePlayer(1.5, _tmp.set(this.player.x - point.x, 0, this.player.z - point.z), 11, 'slam');
  }
  stepStuck(dt) {
    const pose = this.pose;
    const progress = (this.time - this.stuckSince) / this.stuckFor;
    this.wantYaw = this.pose.yaw;
    const strain = Math.sin(this.stateT * 7) * 0.5 + 0.5;
    if (this.heavyShoulders) {
      const yank = smoothstep(0.82, 1, progress);
      pose.set(CH.LEAN_P, 0.92 - 0.45 * yank - strain * 0.05);
      pose.set(CH.CHEST_P, 0.46 - 0.16 * yank + strain * 0.04);
      pose.set(CH.SINK, -1.15 * (1 - yank));
      pose.set(CH.HEAD_P, -1.35 * (1 - yank) + 0.15 * yank);
    } else {
      pose.set(CH.LEAN_P, 0.45 - strain * 0.08);
      pose.set(CH.CHEST_P, 0.3 + strain * 0.05);
      pose.set(CH.HEAD_P, 0.15);
    }
    pose.set(CH.CHEST_OY, -strain * 0.2);
    pose.set(CH.JAW, 0.25 + strain * 0.15);
    pose.set(CH.ANGER, 1);
    pose.set(CH.EYE, 1.1);
    pose.set(CH.LP_UP, 0.5);
    pose.set(CH.RP_UP, 0.5);
    pose.set(CH.GLOW_L, 0.25 * (1 - progress));
    pose.set(CH.GLOW_R, 0.25 * (1 - progress));
    const jitter = 0.06 + 0.1 * smoothstep(0.6, 1, progress);
    for (const side of [0, 1]) {
      pose.fistWorld(side, this.stuckPos[side]);
      pose.setFistStiffness(side, 6, 0.9);
      pose.fistJitter[side].set(rand(-jitter, jitter), rand(-jitter, jitter) * 0.5, rand(-jitter, jitter));
      pose.set(side === 0 ? CH.LW_P : CH.RW_P, 0.35 + Math.sin(this.stateT * 11 + side) * 0.1);
    }
    if (Math.random() < dt * 10) {
      const fist = this.pose.worldFist[Math.random() < 0.5 ? 0 : 1];
      this.fx.inkSplash(_tmp.set(fist.x, this.arena.floorY + 0.2, fist.z), null, 2, 2.5, 0.08, SPLASH_INK);
    }
    if (progress >= 1) this.yankFree();
  }
  yankFree() {
    this.fistsStuck = false;
    const floorY = this.arena.floorY;
    for (const side of [0, 1]) {
      const fist = this.pose.worldFist[side];
      this.fx.dust(_tmp.set(fist.x, floorY, fist.z), 8, 1.6, 0.9);
      for (let i = 0; i < 5; i++)
        this.fx.shards.spawn(
          this.fx.now,
          fist.x,
          floorY + 0.3,
          fist.z,
          rand(-3, 3),
          rand(4, 7),
          rand(-3, 3),
          rand(0.12, 0.25),
          rand(1, 1.6),
          floorY,
          _tmpColor.set(9406332),
          1,
          rand(4, 10),
        );
      this.pose.fistJitter[side].set(0, 0, 0);
      this.pose.setFistStiffness(side, 2.2, 0.6);
    }
    this.pose.kick(CH.LEAN_P, -1.2);
    this.pose.kick(CH.LFY, 8);
    this.pose.kick(CH.RFY, 8);
    const combo = this.atk?.kind === 'combo';
    this.atk = null;
    if (combo) {
      this.startAttack('sweep');
      if (this.atk) this.atk.w = 0.62;
      return;
    }
    this.setState('recover');
  }
  stepRecover(dt) {
    const pose = this.pose;
    const progress = this.stateT / 0.9;
    pose.set(CH.LEAN_P, 0.14 + 0.2 * (1 - progress));
    pose.set(CH.EYE, 1);
    this.wantYaw = this.playerAng;
    if (progress >= 1) {
      this.setState('idle');
      this.nextAtk = this.gap();
    }
  }
  doSweep(atk, dt) {
    const pose = this.pose;
    const t2 = atk.t;
    const w = atk.w;
    const swing = 0.72;
    const side = atk.side;
    const sign = side === 0 ? 1 : -1;
    const other = 1 - side;
    const radius = atk.radius;
    if (t2 < w) {
      this.wantYaw = this.playerAng;
      this.turnRate = 1.6;
      const u2 = t2 / w;
      const lift = easeOut(clamp(u2 / 0.6, 0, 1));
      const angle = atk.a0 * (0.6 + 0.4 * lift);
      pose.fist(side, Math.sin(angle) * radius * 0.75, 1.2 + 3.2 * lift, Math.cos(angle) * radius * 0.75);
      pose.set(CH.TWIST, 0.35 * sign * lift);
      pose.set(CH.CHEST_Y, 0.3 * sign * lift);
      pose.set(CH.LEAN_R, 0.1 * sign * lift);
      pose.set(CH.LEAN_P, 0.28);
      pose.set(side === 0 ? CH.GLOW_L : CH.GLOW_R, smoothstep(0.15, 0.75, u2));
      pose.set(side === 0 ? CH.LP_UP : CH.RP_UP, 0.1);
      pose.set(CH.ANGER, 1);
      pose.set(CH.JAW, 0.3 * lift);
      pose.fist(other, -4.6 * sign, 1.2, 5);
      if (this.once('warn', w * 0.4)) {
        const eta = w - t2;
        for (let i = 0; i <= 10; i++) {
          const ang = atk.a0 + ((atk.a1 - atk.a0) * i) / 10;
          this.pose.toWorld(_tmp.set(Math.sin(ang) * radius, 0, Math.cos(ang) * radius), _tmp2);
          this.fx.decals.spawn(
            this.fx.now,
            _tmp2.x,
            this.arena.floorY,
            _tmp2.z,
            1.2,
            1.2,
            eta + (i / 10) * swing + 0.05,
            1,
            TELEGRAPH_ORANGE,
            1.4,
            0,
            0,
            eta + (i / 10) * swing,
          );
        }
      }
      atk.prevA = atk.a0;
    } else if (t2 < w + swing) {
      this.wantYaw = this.pose.yaw;
      if (this.once('go', w)) {
        this.play('boss-sweep', this.pose.worldFist[side], 1);
        this.emitSafe('enemy:attack', {
          id: this.parts[SLOT_FIST + side].info.id,
          kind: 'brute',
          position: this.pose.worldFist[side].clone(),
          attack: 'sweep',
        });
        pose.setFistStiffness(side, 9, 0.85);
      }
      const u = easeInOut((t2 - w) / swing);
      const angle = atk.a0 + (atk.a1 - atk.a0) * u;
      pose.fist(side, Math.sin(angle) * radius, 0.55, Math.cos(angle) * radius);
      pose.set(side === 0 ? CH.LW_R : CH.RW_R, 1.2 * sign);
      pose.set(side === 0 ? CH.LF_S : CH.RF_S, 0.7);
      pose.set(CH.TWIST, -0.35 * sign * (u * 2 - 1));
      pose.set(CH.CHEST_Y, -0.35 * sign * (u * 2 - 1));
      pose.set(CH.LEAN_P, 0.4);
      pose.set(side === 0 ? CH.GLOW_L : CH.GLOW_R, 1);
      pose.fist(other, -4.6 * sign, 1.2, 5);
      const prevA = atk.prevA;
      atk.prevA = angle;
      const playerRel = wrapAngle(this.playerAng - this.pose.yaw);
      const lo = Math.min(prevA, angle) - 0.12;
      const hi = Math.max(prevA, angle) + 0.12;
      const playerH = this.player.y - this.arena.floorY;
      if (
        !atk.flags.has('hit') &&
        playerRel >= lo &&
        playerRel <= hi &&
        Math.abs(this.playerDist - radius) < 2.7 &&
        playerH < 0.75
      ) {
        atk.flags.add('hit');
        const dir = _tmp.set(this.player.x - this.arena.center.x, 0, this.player.z - this.arena.center.z);
        this.damagePlayer(1, dir, 12, 'sweep');
      }
      const fist = this.pose.worldFist[side];
      if (Math.random() < dt * 40) {
        this.fx.inkSplash(_tmp.set(fist.x, this.arena.floorY + 0.3, fist.z), null, 3, 5, 0.12, SPLASH_INK);
        this.fx.dust(_tmp, 2, 1.2, 0.8);
      }
      this.fx.waves.spawn(this.fx.now, fist.x, this.arena.floorY, fist.z, 0.3, 1.8, 0.35, 0.9, STONE_GREY, 1.2);
    } else {
      pose.fist(other, -4.6 * sign, 1.2, 5);
      pose.set(CH.LEAN_P, 0.3);
      if (t2 > w + swing + 0.75) atk.done = true;
    }
  }
  doRain(atk) {
    const pose = this.pose;
    const t2 = atk.t;
    const w = atk.w;
    const count = this.phase >= 3 ? 14 : this.phase === 2 ? 10 : 9;
    const spit = 1.35;
    this.wantYaw = this.playerAng;
    this.turnRate = 1;
    const gape = easeOut(clamp(t2 / w, 0, 1)) * (1 - smoothstep(w + spit, w + spit + 0.5, t2));
    pose.set(CH.LEAN_P, -0.25 * gape);
    pose.set(CH.CHEST_P, -0.3 * gape);
    pose.set(CH.HEAD_P, -0.45 * gape);
    pose.set(CH.JAW, 0.85 * gape);
    pose.set(CH.MOUTH, gape);
    pose.set(CH.GLOW, 0.6 * gape);
    pose.set(CH.ANGER, 0.8);
    pose.fist(0, 5.4, 1.2, 3.5);
    pose.fist(1, -5.4, 1.2, 3.5);
    if (t2 >= w && t2 < w + spit) {
      const index = Math.floor(((t2 - w) / spit) * count);
      if (this.once(`g${index}`, w + (index / count) * spit)) {
        if (index === 0) this.play('boss-rain', this.arena.center, 1);
        const mouth = this.pose.mouthWorld(_tmp2).clone();
        const land = new Vector3();
        const state = this.ctx.player?.state;
        if (index % 3 == 0) {
          land.copy(this.player);
          if (state) land.addScaledVector(_tmp.set(state.velocity.x, 0, state.velocity.z), 0.9);
        } else if (index % 3 == 1) {
          const angle = Math.random() * TAU;
          const dist = rand(2.5, 6);
          land.set(this.player.x + Math.cos(angle) * dist, 0, this.player.z + Math.sin(angle) * dist);
        } else {
          const angle = Math.random() * TAU;
          const dist = rand(POOL_RADIUS + 2, 20.5);
          land.set(this.arena.center.x + Math.cos(angle) * dist, 0, this.arena.center.z + Math.sin(angle) * dist);
        }
        land.y = this.arena.floorY;
        Hazards.clampToArena(land, this.arena.center, 21, POOL_RADIUS + 1.5);
        this.hazards.glob(mouth, land, rand(1.45, 1.9), this.phase >= 3 ? 1 : 0.5, 1.9);
        this.fx.inkSplash(mouth, _tmp.set(0, 1, 0), 4, 5, 0.12, SPLASH_INK);
        pose.kick(CH.JAW, 3);
        pose.kick(CH.HEAD_P, -1);
      }
    }
    if (t2 > w + spit + 0.9) atk.done = true;
  }
  castPose(atk, charge) {
    const pose = this.pose;
    const ci = atk.crystal;
    const crystal = this.crystals[ci];
    crystal.cast = Math.max(crystal.cast, 0.4 + charge);
    pose.set(CH.ANGER, 1);
    pose.set(CH.EYE, 1.15);
    pose.set(CH.GLOW, 0.5 * charge);
    if (Math.random() < 0.6) {
      this.pose.crystalWorld(ci, _tmp2);
      const angle = Math.random() * TAU;
      const from = _tmp.set(_tmp2.x + Math.cos(angle) * 5, _tmp2.y + rand(-2, 3), _tmp2.z + Math.sin(angle) * 5);
      this.fx.streams.spawn(
        this.fx.now,
        from,
        _tmp2,
        rand(0.4, 0.7),
        paintColor(crystal.color, _tmpColor),
        2.5,
        rand(0.12, 0.2),
        0.5,
        1,
        0.8,
        2,
      );
    }
  }
  doFire(atk) {
    const pose = this.pose;
    const t2 = atk.t;
    const w = atk.w;
    const center = this.arena.center;
    if (!this.crystals[0].alive) {
      atk.done = true;
      return;
    }
    if (t2 < w) {
      this.wantYaw = this.playerAng;
      this.turnRate = 1.8;
      const u = t2 / w;
      const raise = easeOut(clamp(u / 0.5, 0, 1));
      pose.fist(0, 4.2, 1.3 + 8 * raise, 4 - 1.5 * raise);
      pose.set(CH.LP_UP, 1);
      pose.set(CH.LEAN_R, -0.08 * raise);
      pose.set(CH.GLOW_L, 0.6 * u);
      this.castPose(atk, u);
      if (this.once('mark', w * 0.35)) {
        const playerAng = this.playerAng;
        const ox = center.x + Math.sin(playerAng + 0.32) * 7.5;
        const oz = center.z + Math.cos(playerAng + 0.32) * 7.5;
        atk.target.set(ox, this.arena.floorY, oz);
        const delay = w - t2 + 0.25;
        const aim = yawOf(this.player.x - ox, this.player.z - oz);
        const fan = this.phase >= 3 ? 0.36 : 0.44;
        for (const off of [-fan, 0, fan]) {
          const angle = aim + off;
          this.hazards.fireLine(ox, oz, Math.sin(angle), Math.cos(angle), 15, 22, delay + Math.abs(off) * 0.25, 1);
        }
        this.emitSafe('enemy:telegraph', {
          id: this.parts[SLOT_CRYSTAL].info.id,
          kind: 'brute',
          position: atk.target.clone(),
          attack: 'fire',
          eta: delay,
        });
      }
    } else if (t2 < w + 0.25) {
      pose.setFistStiffness(0, 7, 0.85);
      pose.fistWorld(0, _tmp.copy(atk.target).setY(this.arena.floorY + 1));
      pose.set(CH.LEAN_P, 0.45);
      pose.set(CH.GLOW_L, 1);
      this.crystals[0].cast = 1.6;
    } else {
      if (this.once('impact', w + 0.25)) {
        this.singleImpactFx(0, atk.target, _tmpColor.set(PALETTE.red.hex));
        this.play('boss-crystal', atk.target, 0.9);
        this.emitSafe('enemy:attack', {
          id: this.parts[SLOT_CRYSTAL].info.id,
          kind: 'brute',
          position: atk.target.clone(),
          attack: 'fire',
        });
      }
      pose.fistWorld(0, _tmp.copy(atk.target).setY(this.arena.floorY + 0.9));
      pose.set(CH.LEAN_P, 0.35);
      if (t2 > w + 1.6) atk.done = true;
    }
  }
  doIce(atk) {
    const pose = this.pose;
    const t2 = atk.t;
    const w = atk.w;
    const center = this.arena.center;
    if (!this.crystals[1].alive) {
      atk.done = true;
      return;
    }
    if (t2 < w) {
      this.wantYaw = this.playerAng;
      this.turnRate = 1.8;
      const u = t2 / w;
      const raise = easeOut(clamp(u / 0.5, 0, 1));
      pose.fist(1, -4.2, 1.3 + 7.5 * raise, 4 - 1.2 * raise);
      pose.set(CH.RP_UP, 1);
      pose.set(CH.LEAN_R, 0.08 * raise);
      pose.set(CH.GLOW_R, 0.5 * u);
      this.castPose(atk, u);
      if (Math.random() < 0.3)
        this.fx.puffs.spawn(
          this.fx.now,
          this.pose.worldFist[1].x,
          this.pose.worldFist[1].y,
          this.pose.worldFist[1].z,
          0,
          -0.5,
          0,
          0.5,
          1.6,
          0.9,
          _tmpColor.set(15136511),
          0.4,
          -0.3,
          2,
        );
      if (this.once('mark', w * 0.4)) {
        const playerAng = this.playerAng;
        const ox = center.x + Math.sin(playerAng - 0.3) * 7.2;
        const oz = center.z + Math.cos(playerAng - 0.3) * 7.2;
        atk.target.set(ox, this.arena.floorY, oz);
        const aim = yawOf(this.player.x - ox, this.player.z - oz);
        const delay = w - t2 + 0.25;
        for (const off of [-0.42, 0, 0.42]) {
          const angle = aim + off;
          for (let i = 1; i <= 9; i++) {
            const dist = i * 1.9;
            const x = ox + Math.sin(angle) * dist;
            const z = oz + Math.cos(angle) * dist;
            if (Math.hypot(x - center.x, z - center.z) > 21.2) break;
            this.hazards.spike(x, z, delay + dist / 10, 0, 1, 1.1, 2.4 + (i % 2) * 0.5);
          }
        }
        this.emitSafe('enemy:telegraph', {
          id: this.parts[5].info.id,
          kind: 'brute',
          position: atk.target.clone(),
          attack: 'ice',
          eta: delay + 0.2,
        });
      }
    } else if (t2 < w + 0.25) {
      pose.setFistStiffness(1, 7, 0.85);
      pose.fistWorld(1, _tmp.copy(atk.target).setY(this.arena.floorY + 0.7));
      pose.set(CH.LEAN_P, 0.45);
      pose.set(CH.GLOW_R, 1);
      this.crystals[1].cast = 1.6;
    } else {
      if (this.once('impact', w + 0.25)) {
        this.singleImpactFx(1, atk.target, _tmpColor.set(PALETTE.blue.hex));
        this.play('boss-crystal', atk.target, 0.9);
        for (let i = 0; i < 3; i++) {
          const angle = this.playerAng + rand(-0.9, 0.9);
          const dist = rand(8, 15);
          _tmp.set(center.x + Math.sin(angle) * dist, this.arena.floorY + 0.05, center.z + Math.cos(angle) * dist);
          try {
            this.ctx.paint.paintSphere(_tmp, 2.4, 'blue', 0.9);
          } catch {}
          this.fx.puffs.spawn(
            this.fx.now,
            _tmp.x,
            _tmp.y + 0.3,
            _tmp.z,
            0,
            0.4,
            0,
            1,
            2.5,
            1.2,
            _tmpColor.set(15136511),
            0.4,
            0.2,
            2,
          );
        }
      }
      pose.fistWorld(1, _tmp.copy(atk.target).setY(this.arena.floorY + 0.6));
      pose.set(CH.LEAN_P, 0.35);
      if (t2 > w + 1.9) atk.done = true;
    }
  }
  doBounce(atk) {
    const pose = this.pose;
    const t2 = atk.t;
    const w = atk.w;
    const center = this.arena.center;
    if (!this.crystals[2].alive) {
      atk.done = true;
      return;
    }
    this.wantYaw = this.playerAng;
    this.turnRate = 1;
    if (t2 < w) {
      const u = t2 / w;
      const crouch = easeOut(u);
      pose.set(CH.SINK, -1.2 * crouch);
      pose.set(CH.SQUASH, 1 - 0.14 * crouch);
      pose.set(CH.WIDTH, 1 + 0.06 * crouch);
      pose.set(CH.LEAN_P, 0.3);
      pose.fist(0, 5.4, 1.2, 3.6);
      pose.fist(1, -5.4, 1.2, 3.6);
      this.castPose(atk, u);
      if (this.once('mark', 0.2))
        this.emitSafe('enemy:telegraph', {
          id: this.parts[6].info.id,
          kind: 'brute',
          position: center.clone(),
          attack: 'bounce',
          eta: w,
        });
    } else {
      const hop = Math.floor((t2 - w) / 0.62);
      const hopT = t2 - w - hop * 0.62;
      if (hop < 3) {
        const arc = Math.sin(clamp(hopT / 0.62, 0, 1) * Math.PI);
        pose.set(CH.SINK, 1.6 * arc - 0.3);
        pose.set(CH.SQUASH, 1 + 0.12 * arc);
        pose.fist(0, 5.4, 1.2 + 2 * arc, 3.6);
        pose.fist(1, -5.4, 1.2 + 2 * arc, 3.6);
        if (this.once(`ring${hop}`, w + hop * 0.62)) {
          pose.kick(CH.SQUASH, -1.6);
          pose.kick(CH.SINK, -3);
          this.hazards.shock(center.x, center.z, 10.5, 23, 1, _tmpColor.set(PALETTE.yellow.hex), 0.8, 4);
          this.emitSafe('camera:shake', {
            strength: 0.55,
            position: center.clone(),
          });
          this.play('boss-slam', center, 0.7, 1.25);
          this.fx.inkSplash(_tmp.set(center.x, this.arena.floorY + 0.3, center.z), null, 16, 7, 0.12, SPLASH_INK);
          this.crystals[2].cast = 1.6;
          const angle = this.playerAng + rand(-1.4, 1.4);
          const dist = rand(7.5, 13);
          _tmp.set(center.x + Math.sin(angle) * dist, this.arena.floorY + 0.05, center.z + Math.cos(angle) * dist);
          try {
            this.ctx.paint.paintSphere(_tmp, 1.7, 'yellow', 1);
          } catch {}
          this.fx.paintSplash(_tmp2.set(_tmp.x, _tmp.y + 0.3, _tmp.z), 'yellow', 16, 4, 0.12);
        }
      } else {
        pose.set(CH.SINK, 0);
        if (t2 > w + 3 * 0.62 + 0.9) atk.done = true;
      }
    }
  }
  doThorns(atk) {
    const pose = this.pose;
    const t2 = atk.t;
    const w = atk.w;
    const center = this.arena.center;
    if (!this.crystals[3].alive) {
      atk.done = true;
      return;
    }
    this.wantYaw = this.playerAng;
    this.turnRate = 1.2;
    const u = clamp(t2 / w, 0, 1);
    this.castPose(atk, u);
    pose.set(CH.LEAN_P, 0.35 + 0.15 * u);
    pose.set(CH.HEAD_P, 0.2);
    pose.fist(1, -3.8, 0.4, 5.2);
    pose.fist(0, 5.2, 1.2, 4.4);
    pose.set(CH.RW_P, 0.8);
    pose.set(CH.GLOW_R, 0.3 * u);
    const wave = (flag, at, count) => {
      if (!this.once(flag, at)) return;
      const state = this.ctx.player?.state;
      const aim = _tmp3.copy(this.player);
      if (state) aim.addScaledVector(_tmp.set(state.velocity.x, 0, state.velocity.z), 0.45);
      for (let i = 0; i < count; i++) {
        const pos =
          i === 0
            ? aim.clone()
            : aim
                .clone()
                .add(_tmp.set(Math.cos((i / count) * TAU + t2) * 3.1, 0, Math.sin((i / count) * TAU + t2) * 3.1));
        pos.y = this.arena.floorY;
        Hazards.clampToArena(pos, center, 21, POOL_RADIUS + 1);
        this.hazards.spike(pos.x, pos.z, 0.95, 1, 1, 1.5, 2.6);
      }
      this.crystals[3].cast = 1.6;
      this.emitSafe('enemy:telegraph', {
        id: this.parts[7].info.id,
        kind: 'brute',
        position: aim.clone(),
        attack: 'thorns',
        eta: 0.95,
      });
      if (flag === 'w1') this.play('boss-crystal', center, 0.9);
    };
    wave('w1', w, 4);
    wave('w2', w + 0.9, 3);
    if (this.phase >= 2 && this.shattered >= 2) wave('w3', w + 1.8, 3);
    if (t2 > w + 2.9) atk.done = true;
  }
  doSummon(atk) {
    const pose = this.pose;
    const t2 = atk.t;
    const w = atk.w;
    const center = this.arena.center;
    pose.set(CH.LEAN_P, 0.45 * easeOut(clamp(t2 / w, 0, 1)));
    const lift = Math.sin(clamp(t2 / w, 0, 1) * Math.PI);
    pose.fist(0, 3.8, 1.2 + 4 * lift, 5.2);
    pose.fist(1, -3.8, 1.2 + 4 * lift, 5.2);
    pose.set(CH.JAW, 0.5);
    pose.set(CH.ANGER, 1);
    if (this.once('slap', w)) {
      this.summons++;
      pose.kick(CH.SQUASH, -1.2);
      this.emitSafe('camera:shake', {
        strength: 0.5,
        position: center.clone(),
      });
      this.play('boss-slam', center, 0.6, 1.2);
      const count = this.summons === 1 ? 2 : 3;
      for (let i = 0; i < count; i++) {
        const angle = this.pose.yaw + (i - (count - 1) / 2) * 0.75;
        const pos = new Vector3(
          center.x + Math.sin(angle) * (POOL_RADIUS + 1.4),
          this.arena.floorY + 0.05,
          center.z + Math.cos(angle) * (POOL_RADIUS + 1.4),
        );
        this.fx.inkSplash(_tmp.copy(pos).setY(pos.y + 0.3), null, 12, 4, 0.1, SPLASH_INK);
        this.fx.puddle(pos, 1.6, 4, INK_COLOR, 0.9);
        try {
          const spawn = this.ctx.enemies.spawn;
          const id = spawn('smudgeling', pos, {
            facing: angle,
            rise: true,
          });
          if (id >= 0) this.summonIds.push(id);
        } catch (err) {
          console.warn('[boss] summon failed', err);
        }
      }
    }
    if (t2 > w + 1.2) atk.done = true;
  }
  singleImpactFx(side, point, color) {
    const floorY = this.arena.floorY;
    this.pose.snapFist(side);
    this.pose.kick(side === 0 ? CH.LF_S : CH.RF_S, -2.5);
    this.pose.kick(CH.SQUASH, -0.7);
    this.fx.sparks(_tmp.set(point.x, floorY + 0.6, point.z), color, 24, 7, 3.2, 0.12, 5);
    this.fx.ring(_tmp, 0.5, 5, 0.6, color, 2.4);
    this.fx.dust(_tmp, 8, 1.6, 0.9);
    this.emitSafe('camera:shake', {
      strength: 0.55,
      position: point.clone(),
    });
  }
  stagger(reason) {
    if (this.state === 'stagger') {
      if (reason === 'crystal') this.staggerDur = Math.max(this.staggerDur, this.stateT + 3);
      return;
    }
    if (this.fighting && this.state !== 'shift') {
      if (reason === 'interrupt' && this.atk && this.atk.crystal >= 0) this.hazards.fizzle();
      this.atk = null;
      this.fistsStuck = false;
      this.staggerDur =
        reason === 'crystal'
          ? CRYSTAL_STAGGER
          : reason === 'interrupt'
            ? INTERRUPT_STAGGER
            : reason === 'master'
              ? 4.4
              : this.phase === 1
                ? 5.2
                : this.phase === 2
                  ? 5
                  : 4.4;
      this.setState('stagger');
      this.exposedTime = 0;
      for (const side of [0, 1]) {
        this.pose.fistJitter[side].set(0, 0, 0);
        this.pose.setFistStiffness(side, 2.6, 0.55);
      }
      this.pose.kick(CH.LEAN_P, -2);
      this.pose.kick(CH.MASK_R, 4);
      this.play('boss-stagger', this.arena.center, 1);
      this.emitSafe('camera:shake', {
        strength: 0.7,
        position: this.arena.center.clone(),
      });
    }
  }
  stepStagger(dt) {
    const pose = this.pose;
    const stateT = this.stateT;
    const staggerDur = this.staggerDur;
    this.wantYaw = this.pose.yaw;
    if (stateT < 0.4) {
      pose.set(CH.LEAN_P, -0.3);
      pose.set(CH.CHEST_P, -0.2);
      pose.fist(0, 4.5, 6, 3);
      pose.fist(1, -4.5, 6, 3);
      pose.set(CH.JAW, 0.7);
      pose.set(CH.EYE, 1.5);
      pose.set(CH.ANGER, 0);
      pose.set(CH.GLOW, 1);
    } else {
      const slump = easeIn(clamp((stateT - 0.4) / 0.55, 0, 1));
      if (this.heavyShoulders) {
        pose.set(CH.SINK, -1.05 * slump);
        pose.set(CH.LEAN_P, 0.14 + 0.8 * slump);
        pose.set(CH.CHEST_P, 0.08 + 0.37 * slump);
        pose.set(CH.HEAD_P, -1.45 * slump);
      } else {
        pose.set(CH.SINK, -0.35 * slump);
        pose.set(CH.LEAN_P, 0.14 + 0.54 * slump);
        pose.set(CH.CHEST_P, 0.08 + 0.26 * slump);
        pose.set(CH.HEAD_P, -0.5 * slump);
      }
      pose.set(CH.HEAD_Y, 0);
      pose.set(CH.MASK_P, -0.12 * slump);
      pose.fist(0, 6.4, 1, 5.2 + 1.2 * slump);
      pose.fist(1, -6.4, 1, 5.2 + 1.2 * slump);
      pose.set(CH.LP_UP, 0.8);
      pose.set(CH.RP_UP, 0.8);
      pose.set(CH.LW_P, 0.6);
      pose.set(CH.RW_P, 0.6);
      const dazed = stateT > 1;
      pose.set(CH.EYE, dazed ? 0.35 + 0.15 * Math.sin(stateT * 2.3) : 1);
      pose.set(CH.ANGER, 0);
      pose.set(CH.JAW, 0.3 + 0.1 * Math.sin(stateT * 1.7));
      pose.set(CH.MASK_R, Math.sin(stateT * 1.9) * 0.12);
      pose.set(CH.HEAD_R, Math.sin(stateT * 1.3) * 0.1);
      if (this.once2('thud', stateT, 0.95)) this.maskThud();
      if (dazed) this.exposedTime += dt;
      const wake = smoothstep(staggerDur - 0.85, staggerDur - 0.2, stateT);
      if (wake > 0) {
        pose.set(CH.GLOW, wake);
        pose.set(CH.ANGER, wake);
        pose.set(CH.EYE, 1.2);
        pose.set(CH.CHEST_OX, rand(-0.06, 0.06) * wake);
        pose.set(CH.CHEST_OZ, rand(-0.06, 0.06) * wake);
        if (this.once2('warn', stateT, staggerDur - 0.85))
          this.emitSafe('enemy:telegraph', {
            id: this.parts[SLOT_BODY].info.id,
            kind: 'brute',
            position: this.arena.center.clone(),
            attack: 'rise',
            eta: staggerDur - stateT,
          });
      }
    }
    if (stateT >= staggerDur) {
      const center = this.arena.center;
      this.hazards.shock(center.x, center.z, 15, 12, 0.5, STONE_GREY, 0.6, 5.5);
      this.emitSafe('camera:shake', {
        strength: 0.5,
        position: center.clone(),
      });
      this.play('boss-roar', center, 0.7);
      this.pose.kick(CH.LEAN_P, -1.5);
      this.setState('recover');
    }
  }
  once2(flag, t, at) {
    if (this.flags2.has(flag) || t < at) {
      return false;
    } else {
      this.flags2.add(flag);
      return true;
    }
  }
  maskThud() {
    const maskPos = this.maskPos;
    const floorY = this.arena.floorY;
    this.fx.dust(_tmp.set(maskPos.x, floorY, maskPos.z), 14, 2.6, 1.2, SLAM_DUST, 0.6);
    this.fx.inkSplash(_tmp.set(maskPos.x, floorY + 0.4, maskPos.z), null, 14, 5, 0.12, SPLASH_INK);
    this.emitSafe('camera:shake', {
      strength: 0.6,
      position: maskPos.clone(),
    });
    this.play('boss-slam', maskPos, 0.6, 0.8);
  }
  startShift(shiftTo) {
    if (!(shiftTo <= this.phase)) {
      this.shiftTo = shiftTo;
      this.atk = null;
      this.fistsStuck = false;
      this.hazards.clear();
      this.setState('shift');
      this.play('boss-roar', this.arena.center, 1);
      this.emitSafe('camera:shake', {
        strength: 0.9,
        position: this.arena.center.clone(),
      });
    }
  }
  stepShift(dt) {
    const pose = this.pose;
    const stateT = this.stateT;
    this.wantYaw = this.playerAng;
    const roar = easeOut(clamp(stateT / 0.6, 0, 1)) * (1 - smoothstep(2.2, 2.8, stateT));
    pose.set(CH.LEAN_P, -0.3 * roar);
    pose.set(CH.CHEST_P, -0.35 * roar);
    pose.set(CH.HEAD_P, -0.5 * roar);
    pose.set(CH.JAW, 0.9 * roar);
    pose.set(CH.MOUTH, roar);
    pose.set(CH.GLOW, roar);
    pose.set(CH.ANGER, 1);
    pose.fist(0, 6, 3 + 5 * roar, 1);
    pose.fist(1, -6, 3 + 5 * roar, 1);
    pose.set(CH.MASK_R, Math.sin(stateT * 30) * 0.05 * roar);
    const center = this.arena.center;
    if (this.once2('burst', stateT, 0.5)) {
      this.phase = this.shiftTo;
      if (this.phase >= 3) this.health = Math.min(this.health, MAX_HEALTH * PHASE3_AT);
      this.hazards.dmgMul = this.phase >= 3 ? 1.5 : 1;
      this.hazards.shock(
        center.x,
        center.z,
        16,
        23,
        0.5,
        this.phase === 2 ? _tmpColor.set(14272511) : _tmpColor.set(16747098),
        0.7,
        4,
      );
      this.fx.ring(_tmp.set(center.x, this.arena.floorY, center.z), 1, 22, 0.9, FLASH_WHITE, 2.4);
      if (this.phase === 2)
        for (let i = 0; i < 4; i++) {
          this.crystals[i].flash = 1;
          this.pose.crystalWorld(i, _tmp2);
          paintColor(COLORS[i], _tmpColor);
          this.fx.sparks(_tmp2, _tmpColor, 26, 6, 3.4, 0.12, 2);
        }
      else {
        for (let i = 0; i < 4; i++) this.shatterCrystal(i, true);
        this.startEdge();
      }
      this.onPhase?.(this.phase);
    }
    if (stateT > 2.9) {
      this.setState('idle');
      this.nextAtk = this.phase === 2 ? 0.8 : 0.6;
      if (this.phase === 2 && this.summons === 0) this.nextAtk = 0.3;
    }
  }
  startEdge() {
    this.hazards.edgeOn = true;
    this.hazards.edgeFront = 23.5;
  }
  applyDamage(amount) {
    if (amount > 0) {
      this.health = Math.max(0, this.health - amount);
      if (this.phase === 1 && this.health <= 27.3001) {
        this.health = MAX_HEALTH * PHASE2_AT;
        this.startShift(2);
      } else if (this.phase === 2 && this.health <= 12.6001) {
        this.health = MAX_HEALTH * PHASE3_AT;
        this.startShift(3);
      } else if (this.phase === 3 && this.health <= 0.0001) {
        this.health = 0;
        this.onDefeat?.();
      }
    }
  }
  debugDamage(amount) {
    if (this.fighting && amount > 0) this.applyDamage(amount);
  }
  debugShatter(index) {
    const crystal = this.crystals[index];
    if (!crystal || !this.parts[SLOT_CRYSTAL + index]?.info.alive) {
      return false;
    } else {
      crystal.hp = 1;
      return this.onSlotHit(SLOT_CRYSTAL + index, {
        damage: 1,
        color: COUNTER_COLOR[crystal.color],
        direction: new Vector3(0, 0, -1),
        knockback: 0,
        source: 'melee',
        point: this.crystalPos[index].clone(),
      });
    }
  }
  debugInfo() {
    const round2 = (v) => Math.round(v * 100) / 100;
    return {
      state: this.state,
      stateT: round2(this.stateT),
      phase: this.phase,
      health: round2(this.health),
      maxHealth: MAX_HEALTH,
      armour: round2(this.armour),
      attack: this.atk?.kind ?? null,
      maskExposed: this.parts[SLOT_MASK].info.alive,
      rangedExposed: this.rangedExposed,
      crystals: this.crystals.map((crystal) => ({
        color: crystal.color,
        alive: crystal.alive,
        hp: crystal.hp,
      })),
    };
  }
  debugParts() {
    const out = {};
    const add = (key, slot, pos) => {
      out[key] = {
        id: BOSS_ID_BASE + slot,
        alive: this.parts[slot].info.alive,
        pos: pos.clone(),
      };
    };
    add('body', SLOT_BODY, this.spine[1]);
    add('mask', SLOT_MASK, this.maskPos);
    add('fistL', SLOT_FIST, this.pose.worldFist[0]);
    add('fistR', 3, this.pose.worldFist[1]);
    COLORS.forEach((color, i) => add(color, SLOT_CRYSTAL + i, this.crystalPos[i]));
    return out;
  }
  hitTestSlot(slot, center, radius) {
    if (!this.parts[slot].info.alive) return false;
    if (slot === SLOT_BODY) {
      if (this.parts[SLOT_MASK].info.alive && this.hitTestSlot(SLOT_MASK, center, radius)) return false;
      for (let i = 0; i < 2; i++)
        if (this.parts[SLOT_FIST + i].info.alive && this.hitTestSlot(SLOT_FIST + i, center, radius)) return false;
      let hit = false;
      for (let i = 0; i < this.spine.length && !hit; i++)
        hit = center.distanceTo(this.spine[i]) < this.spineR[i] + radius;
      for (let i = 0; i < 2 && !hit; i++)
        hit =
          center.distanceTo(this.pose.worldFist[i]) < 1.5 + radius ||
          center.distanceTo(this.foreMid[i]) < 1.3 + radius ||
          center.distanceTo(this.upperMid[i]) < 1.35 + radius;
      if (hit) {
        this.probeC.copy(center);
        this.probeR = radius;
        this.probeOn = true;
      }
      return hit;
    }
    return slot === SLOT_MASK
      ? this.rangedExposed && center.distanceTo(this.spine[2]) < this.spineR[2] + radius
        ? true
        : center.distanceTo(this.maskPos) < (this.rangedExposed ? MASK_RADIUS_EXPOSED : MASK_RADIUS) + radius
      : slot === SLOT_FIST || slot === 3
        ? center.distanceTo(this.pose.worldFist[slot - SLOT_FIST]) < FIST_RADIUS + radius
        : center.distanceTo(this.crystalPos[slot - SLOT_CRYSTAL]) < CRYSTAL_RADIUS + radius;
  }
  onSlotHit(slot, hit) {
    const probed = slot === SLOT_BODY && this.probeOn;
    if (slot === SLOT_BODY) this.probeOn = false;
    if (!this.fighting || !hit) return false;
    const source = hit.source ?? 'melee';
    if (source === 'fire' || source === 'environment') return false;
    const color = hit.color && PALETTE[hit.color] ? hit.color : null;
    if (probed && color) {
      for (let ci = 0; ci < 4; ci++)
        if (
          this.parts[SLOT_CRYSTAL + ci].info.alive &&
          COUNTER_COLOR[this.crystals[ci].color] === color &&
          this.probeC.distanceTo(this.crystalPos[ci]) < CRYSTAL_RADIUS + this.probeR
        )
          return false;
    }
    const raw = Number.isFinite(hit.damage) ? Math.max(0, hit.damage) : 1;
    const dir = _tmp.set(hit.direction?.x ?? 0, 0, hit.direction?.z ?? 0);
    if (dir.lengthSq() < 0.000001) dir.set(this.arena.center.x - this.player.x, 0, this.arena.center.z - this.player.z);
    if (dir.lengthSq() < 0.000001) dir.set(0, 0, -1);
    dir.normalize();
    const point = hit.point && isFiniteVec(hit.point) ? hit.point.clone() : this.slotPoint(slot).clone();
    const heavy =
      source === 'spin' ||
      source === 'jumpSlash' ||
      source === 'art' ||
      (source === 'flurry' && (hit.knockback ?? 0) >= 9);
    const shifting = this.state === 'shift';
    let dmg = 0;
    let shatter = false;
    const immune = shifting;
    let armoured = false;
    let interrupted = false;
    let staggerBy = null;
    if (!shifting) {
      if (slot === SLOT_BODY) {
        const armour = this.armour;
        dmg = raw * (BODY_DAMAGE_MUL[source] ?? 0.4) * armour;
        armoured = armour < 0.999;
        if (
          source === 'flurry' &&
          (hit.knockback ?? 0) >= 9 &&
          this.time - this.lastMaster > 8 &&
          this.state !== 'stagger'
        ) {
          this.lastMaster = this.time;
          staggerBy = 'master';
        }
      } else if (slot === SLOT_MASK) {
        dmg = raw * (MASK_DAMAGE_MUL[source] ?? 1.15);
        if (this.rangedExposed) {
          this.windowHits += source === 'blob' ? 1 : source === 'art' || heavy ? INTERRUPT_HITS : 0;
          if (this.windowHits >= INTERRUPT_HITS && this.time - this.lastInterrupt > INTERRUPT_COOLDOWN) {
            this.lastInterrupt = this.time;
            this.windowHits = 0;
            staggerBy = 'interrupt';
            interrupted = true;
          }
        }
      } else if (slot === SLOT_FIST || slot === 3) {
        const armour = this.armour;
        dmg = raw * 0.5 * armour;
        armoured = armour < 0.999;
        if (this.state === 'stuck') staggerBy = 'fist';
      } else {
        const ci = slot - SLOT_CRYSTAL;
        const crystal = this.crystals[ci];
        if (!color || COUNTER_COLOR[crystal.color] !== color) {
          if (this.time - crystal.lastDeflect > 0.45) {
            crystal.lastDeflect = this.time;
            crystal.flash = Math.max(crystal.flash, 0.6);
            this.deflectFx(ci);
          }
          return false;
        }
        crystal.hp -= heavy ? 2 : 1;
        crystal.flash = 1;
        if (crystal.hp <= 0) {
          shatter = true;
          dmg = SHATTER_DAMAGE;
          staggerBy = 'crystal';
          this.shatterCrystal(ci);
        } else {
          dmg = 0.6;
          this.crackFx(ci, color);
        }
      }
    }
    const before = this.health;
    this.applyDamage(dmg);
    if (armoured && dmg > 0 && !this.shieldHinted && this.phase === 2) {
      this.shieldHinted = true;
      try {
        this.ctx.ui.toast('The stolen colours shield it', 'Shatter a crystal with its opposite colour!');
      } catch {}
    }
    this.hitFx(slot, point, dir, color, dmg, immune, shatter, source, armoured);
    if (interrupted) this.interruptFx(point);
    const killed = this.health <= 0.0001;
    this.emitSafe('combat:hit', {
      enemyId: BOSS_ID_BASE + slot,
      kind: 'brute',
      position: point,
      damage: Math.max(0, before - this.health),
      color,
      source,
      killed,
      shatter: shatter || undefined,
    });
    if (staggerBy && !killed && this.state !== 'shift') this.stagger(staggerBy);
    return true;
  }
  slotPoint(slot) {
    return slot === SLOT_MASK
      ? this.maskPos
      : slot === SLOT_FIST || slot === 3
        ? this.pose.worldFist[slot - SLOT_FIST]
        : slot >= SLOT_CRYSTAL
          ? this.crystalPos[slot - SLOT_CRYSTAL]
          : this.spine[1];
  }
  hitFx(slot, point, dir, color, dmg, immune, shatter, source, armoured) {
    const pose = this.pose;
    const freeze = source !== 'blob' || shatter;
    if (immune) {
      this.fx.sparks(point, STONE_GREY, 12, 6, 2.4, 0.08, 6);
      this.fx.glows.spawn(this.fx.now, point.x, point.y, point.z, 0, 0, 0, 1.1, 0.12, FLASH_WHITE, 1.6, 0, 1, 0);
      this.hitStop(0.05);
      return;
    }
    this.flash = Math.min(1, this.flash + (slot === SLOT_BODY ? 0.35 : slot >= SLOT_CRYSTAL ? 0.25 : 0.7));
    this.fx.hitSpark(point, dir, color);
    this.fx.inkSplash(point, dir, slot === SLOT_BODY ? 6 : 12, 5, 0.1, SPLASH_INK);
    if (color) {
      this.fx.paintSplash(point, color, slot === SLOT_BODY ? 6 : 12, 4.5, 0.1);
      paintColor(color, this.coat);
      this.coatAmt = Math.min(0.5, this.coatAmt + 0.1);
    }
    const cos = Math.cos(pose.yaw);
    const sin = Math.sin(pose.yaw);
    const lx = dir.x * cos - dir.z * sin;
    const lz = dir.x * sin + dir.z * cos;
    const weight = (slot === SLOT_BODY ? 0.35 : 1) * (source === 'blob' ? 0.45 : 1);
    if (armoured) this.fx.sparks(point, STONE_GREY, 4, 4.5, 1.8, 0.06, 6);
    pose.kick(CH.CHEST_OX, lx * 1.2 * weight);
    pose.kick(CH.CHEST_OZ, lz * 1.2 * weight);
    pose.kick(CH.SQUASH, -0.6 * weight);
    pose.kick(CH.MASK_R, (Math.random() - 0.5) * 3 * weight);
    if (slot === SLOT_MASK) {
      pose.kick(CH.MASK_PUSH, -1.2);
      pose.kick(CH.HEAD_R, (Math.random() - 0.5) * 1.5);
      pose.kick(CH.EYE, -6);
      this.crackBoost = Math.min(0.25, this.crackBoost + 0.02);
    }
    if (slot === SLOT_FIST || slot === 3) {
      const side = slot - SLOT_FIST;
      pose.kick(side === 0 ? CH.LF_S : CH.RF_S, -2);
    }
    if (freeze) this.hitStop(shatter ? 0.14 : slot === SLOT_MASK ? 0.075 : slot === SLOT_BODY ? 0.035 : 0.06);
    if (((slot === SLOT_MASK && dmg > 0) || shatter) && this.hurtSfxT <= 0) {
      this.hurtSfxT = 0.35;
      this.play('boss-hurt', point, 0.8 + Math.min(0.4, dmg * 0.1));
    }
  }
  crackFx(ci, color) {
    const pos = this.crystalPos[ci];
    this.fx.sparks(pos, paintColor(color, _tmpColor), 16, 6, 3.2, 0.1, 4);
    this.fx.shards.spawn(
      this.fx.now,
      pos.x,
      pos.y,
      pos.z,
      rand(-3, 3),
      rand(2, 5),
      rand(-3, 3),
      0.18,
      1.2,
      this.arena.floorY,
      paintColor(this.crystals[ci].color, _tmpColor2),
      2,
      10,
    );
  }
  deflectFx(ci) {
    const pos = this.crystalPos[ci];
    const counter = COUNTER_COLOR[this.crystals[ci].color];
    paintColor(counter, _tmpColor);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * TAU;
      this.fx.glows.spawn(
        this.fx.now,
        pos.x,
        pos.y,
        pos.z,
        Math.cos(angle) * 3,
        rand(-1, 2),
        Math.sin(angle) * 3,
        0.22,
        0.5,
        _tmpColor,
        3,
        0,
        2,
        1,
      );
    }
    this.fx.decals.spawn(this.fx.now, this.player.x, this.arena.floorY, this.player.z, 0.3, 1.6, 0.5, 0, _tmpColor, 2);
    this.play('ui-click', pos, 0.5, 0.6);
  }
  shatterCrystal(ci, quiet = false) {
    const crystal = this.crystals[ci];
    if (!crystal.alive) return;
    crystal.alive = false;
    const pos = this.crystalPos[ci].clone();
    const color = paintColor(crystal.color, new Color());
    const floorY = this.arena.floorY;
    this.fx.paintSplash(pos, crystal.color, 90, 9, 0.16);
    for (let i = 0; i < 26; i++)
      this.fx.shards.spawn(
        this.fx.now,
        pos.x,
        pos.y,
        pos.z,
        rand(-7, 7),
        rand(3, 10),
        rand(-7, 7),
        rand(0.12, 0.3),
        rand(1.4, 2.4),
        floorY,
        color,
        2,
        rand(6, 16),
      );
    this.fx.sparks(pos, color, 40, 10, 4, 0.14, 3);
    this.fx.glows.spawn(
      this.fx.now,
      pos.x,
      pos.y,
      pos.z,
      0,
      0,
      0,
      5,
      0.25,
      _tmpColor.copy(color).lerp(FLASH_WHITE, 0.5),
      3,
      0,
      1,
      0,
    );
    this.fx.ring(_tmp.set(pos.x, floorY, pos.z), 0.5, 9, 0.8, color, 3);
    if (!quiet) this.hazards.shock(pos.x, pos.z, 16, 9, 0, color, 0.5, 1);
    const center = this.arena.center;
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * TAU;
      const dist = rand(6, 30);
      _tmp2.set(center.x + Math.cos(angle) * dist, floorY + rand(0, 1), center.z + Math.sin(angle) * dist);
      this.fx.streams.spawn(
        this.fx.now + i * 0.01,
        pos,
        _tmp2,
        rand(0.6, 1.2),
        color,
        2.6,
        rand(0.15, 0.3),
        rand(2, 5),
        rand(0.2, 1),
        0.5,
        2.5,
      );
    }
    for (let i = 0; i < 14; i++)
      this.fx.streams.spawn(
        this.fx.now + 0.2 + i * 0.03,
        pos,
        _tmp2.copy(this.player).setY(this.player.y + 1.2),
        0.9,
        color,
        3,
        0.2,
        3,
        1.2,
        1,
        3,
      );
    try {
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * TAU;
        const dist = rand(2, 8);
        this.ctx.paint.paintSphere(
          _tmp.set(pos.x + Math.cos(angle) * dist, floorY + 0.05, pos.z + Math.sin(angle) * dist),
          rand(1.4, 2.4),
          crystal.color,
          1,
        );
      }
      this.ctx.paint.bloomVitality(center.clone(), 28, 2.2);
      this.ctx.paint.addInk(crystal.color, 40);
    } catch {}
    this.play('boss-crystal', pos, quiet ? 0.8 : 1.2);
    if (quiet) return;
    this.emitSafe('camera:shake', {
      strength: 0.9,
      position: pos.clone(),
    });
    try {
      this.ctx.time.slowMo(0.35, 0.7);
    } catch {}
    const left = 4 - this.shattered;
    try {
      this.ctx.ui.toast(
        `${PALETTE[crystal.color].name} reclaimed`,
        left > 0 ? `Its guard weakens — ${left} stolen colour${left === 1 ? '' : 's'} remain` : 'Its guard is broken!',
        crystal.color,
      );
    } catch {}
    if (this.shattered === 2 && this.summons < 2 && this.phase === 2) this.nextAtk = 0;
  }
  interruptFx(point) {
    const maskPos = this.maskPos;
    this.fx.glows.spawn(
      this.fx.now,
      maskPos.x,
      maskPos.y,
      maskPos.z,
      0,
      0,
      0,
      4.5,
      0.3,
      _tmpColor.copy(HALO_GOLD).lerp(FLASH_WHITE, 0.5),
      2.6,
      0,
      1,
      0,
    );
    this.fx.sparks(point, HALO_GOLD, 30, 9, 3.4, 0.11, 5);
    this.fx.shards.spawn(
      this.fx.now,
      maskPos.x,
      maskPos.y,
      maskPos.z,
      rand(-4, 4),
      rand(3, 7),
      rand(-4, 4),
      0.28,
      1.6,
      this.arena.floorY,
      _tmpColor.set(15854557),
      2,
      8,
    );
    this.fx.shards.spawn(
      this.fx.now,
      maskPos.x,
      maskPos.y,
      maskPos.z,
      rand(-4, 4),
      rand(3, 7),
      rand(-4, 4),
      0.22,
      1.6,
      this.arena.floorY,
      _tmpColor.set(15854557),
      2,
      8,
    );
    this.crackBoost = Math.min(0.3, this.crackBoost + 0.05);
    this.hitStop(0.11);
    this.emitSafe('camera:shake', {
      strength: 0.7,
      position: maskPos.clone(),
    });
    this.play('boss-hurt', maskPos, 1.1, 1.1);
  }
  damagePlayer(amount, dir, knockback, kind) {
    if (!(amount > 0)) return;
    const direction = dir.clone().setY(0);
    if (direction.lengthSq() < 0.000001) direction.set(0, 0, 1);
    direction.normalize();
    try {
      if (
        this.ctx.player.damage({
          amount: amount * this.hazards.dmgMul,
          direction,
          knockback,
          source: `greymaw-${kind}`,
        })
      )
        this.breather = Math.max(this.breather, 1.1);
    } catch {}
  }
  onSplat(splat) {
    if (!splat || splat.surface !== 'enemy' || splat.colliderHandle == null || !splat.position) return;
    const data = this.volByHandle.get(splat.colliderHandle);
    if (!data || !this.fighting || !this.registered) return;
    const color = splat.color && PALETTE[splat.color] ? splat.color : null;
    const slot = this.splatSlot(data.slot, splat.position, color);
    const point = this.slotPoint(slot);
    const hit = {
      damage: 0.5,
      color,
      direction: this.splatDir.set(point.x - this.player.x, 0, point.z - this.player.z),
      knockback: 3,
      source: 'blob',
      point: splat.position.clone(),
    };
    if (!this.onSlotHit(slot, hit) && slot !== SLOT_BODY) this.onSlotHit(SLOT_BODY, hit);
  }
  splatDir = new Vector3();
  splatSlot(slot, pos, color) {
    let best = -1;
    let bestD = 0.6;
    for (let ci = 0; ci < 4; ci++) {
      if (!this.parts[SLOT_CRYSTAL + ci].info.alive) continue;
      let d = pos.distanceTo(this.crystalPos[ci]) - CRYSTAL_RADIUS;
      if (color && COUNTER_COLOR[this.crystals[ci].color] === color) d -= 0.4;
      if (d < bestD) {
        bestD = d;
        best = SLOT_CRYSTAL + ci;
      }
    }
    if (this.parts[SLOT_MASK].info.alive) {
      let d = pos.distanceTo(this.maskPos) - (this.rangedExposed ? MASK_RADIUS_EXPOSED : MASK_RADIUS);
      if (this.rangedExposed) d = Math.min(d, pos.distanceTo(this.spine[2]) - this.spineR[2]);
      if (d < bestD) {
        bestD = d;
        best = SLOT_MASK;
      }
    }
    for (let side = 0; side < 2; side++) {
      if (!this.parts[SLOT_FIST + side].info.alive) continue;
      const d = pos.distanceTo(this.pose.worldFist[side]) - FIST_RADIUS;
      if (d < bestD) {
        bestD = d;
        best = SLOT_FIST + side;
      }
    }
    return best >= 0 ? best : this.parts[slot]?.info.alive ? slot : SLOT_BODY;
  }
  writeUniforms(dt) {
    const pose = this.pose;
    const uni = this.uni;
    this.glowL += (pose.get(CH.GLOW_L) - this.glowL) * Math.min(1, dt * 20);
    this.glowR += (pose.get(CH.GLOW_R) - this.glowR) * Math.min(1, dt * 20);
    const death = uni.uP0.value.w;
    uni.uP0.value.set(clamp(this.flash, 0, 1), clamp(this.glowL, 0, 1.2), clamp(this.glowR, 0, 1.2), death);
    const look = wrapAngle(this.playerAng - pose.yaw) - pose.get(CH.HEAD_Y);
    uni.uP1.value.set(
      clamp(pose.get(CH.GLOW), 0, 1.5),
      clamp(pose.get(CH.EYE), 0.02, 1.6),
      clamp(pose.get(CH.ANGER), 0, 1),
      clamp(pose.get(CH.MOUTH), 0, 1.5),
    );
    const crack = clamp((1 - this.health / MAX_HEALTH) * 0.95 + this.crackBoost + (this.phase >= 3 ? 0.15 : 0), 0, 1);
    this.rage +=
      ((this.phase >= 3 && this.fighting ? 0.55 + 0.25 * Math.sin(this.time * 3) : 0) - this.rage) *
      Math.min(1, dt * 2);
    uni.uP2.value.set(clamp(-look * 1.5, -1, 1), clamp(0.3 - pose.get(CH.HEAD_P), -1, 1), crack, this.rage);
    uni.uP3.value.set(this.coat.r, this.coat.g, this.coat.b, clamp(this.coatAmt, 0, 1));
    this.wet += (+(this.state === 'rising' || this.state === 'sinking') - this.wet) * Math.min(1, dt * 2);
    uni.uP4.value.set(0.37, uni.uP4.value.y, this.wet, this.fighting ? 0.1 : 0);
    for (let ci = 0; ci < 4; ci++) {
      const crystal = this.crystals[ci];
      const glow = this.phase === 1 || !this.fighting ? 0.28 + 0.12 * Math.sin(this.time * 1.3 + ci) : 0.85;
      const hint = this.phase >= 2 && this.fighting && crystal.alive ? 1 : 0;
      uni.uCrystal.value[ci].set(glow + crystal.cast, +!!crystal.alive, crystal.flash, hint);
    }
    uni.uPool.value.set(
      this.arena.center.x,
      this.arena.center.z,
      this.arena.floorY + 0.03,
      this.state === 'gone' ? 0 : POOL_RADIUS + 0.4,
    );
  }
  syncParts() {
    const pose = this.pose;
    this.model.rig;
    pose.maskWorld(this.maskPos);
    pose.boneWorld(BONE.belly, _tmp.set(0, 1.9, 0.1), this.spine[0]);
    pose.boneWorld(BONE.chest, _tmp.set(0, 5, 0.9), this.spine[1]);
    pose.boneWorld(BONE.head, _tmp.set(0, 6.3, 2.6), this.spine[2]);
    pose.boneWorld(BONE.chest, _tmp.set(3.2, 7.2, 0.3), this.spine[3]);
    pose.boneWorld(BONE.chest, _tmp.set(-3.2, 7.2, 0.3), this.spine[4]);
    for (const side of [0, 1]) {
      this.foreMid[side].copy(pose.worldElbow[side]).lerp(pose.worldWrist[side], 0.5);
      this.upperMid[side].copy(pose.worldShoulder[side]).lerp(pose.worldElbow[side], 0.5);
    }
    for (let i = 0; i < 4; i++) pose.crystalWorld(i, this.crystalPos[i]);
    const floorY = this.arena.floorY;
    const live = this.fighting && this.registered;
    const slumped = this.state === 'stagger' && this.stateT > 0.9;
    const bodyInfo = this.parts[SLOT_BODY].info;
    if (slumped) bodyInfo.position.set(this.maskPos.x, floorY, this.maskPos.z);
    else bodyInfo.position.set(this.arena.center.x, floorY, this.arena.center.z);
    bodyInfo.radius = slumped ? 2.3 : 3.8;
    bodyInfo.facing = pose.yaw;
    const pinned = this.state === 'stuck' && this.fistsStuck;
    bodyInfo.alive = live && !pinned;
    bodyInfo.alerted = live;
    bodyInfo.aim.copy(slumped ? this.maskPos : this.spine[2]);
    bodyInfo.height = slumped ? 4 : 9;
    bodyInfo.health = this.health;
    const maskInfo = this.parts[SLOT_MASK].info;
    maskInfo.position.set(this.maskPos.x, floorY, this.maskPos.z);
    maskInfo.aim.copy(this.maskPos);
    maskInfo.facing = pose.yaw;
    maskInfo.alive = live && (slumped || this.rangedExposed);
    maskInfo.radius = this.rangedExposed && !slumped ? 2.2 : 1.9;
    maskInfo.alerted = maskInfo.alive;
    maskInfo.health = this.health;
    for (const side of [0, 1]) {
      const info = this.parts[SLOT_FIST + side].info;
      info.position.set(pose.worldFist[side].x, floorY, pose.worldFist[side].z);
      info.aim.copy(pose.worldFist[side]);
      info.alive = live && this.state === 'stuck' && this.fistsStuck;
      info.alerted = info.alive;
      info.health = this.health;
    }
    for (let ci = 0; ci < 4; ci++) {
      const info = this.parts[SLOT_CRYSTAL + ci].info;
      const pos = this.crystalPos[ci];
      info.position.set(pos.x, floorY, pos.z);
      info.height = Math.max(1, pos.y - floorY + 0.8);
      info.aim.copy(pos);
      info.alive = live && this.phase === 2 && this.crystals[ci].alive;
      info.alerted = info.alive;
      info.health = this.health;
    }
    let eta = Infinity;
    const atk = this.atk;
    if (atk && this.state === 'attack' && atk.t < atk.impactAt) eta = atk.impactAt - atk.t;
    if (this.state === 'stagger') eta = Math.min(eta, this.staggerDur - this.stateT + 0.15);
    eta = Math.min(eta, this.hazards.threatEta());
    const warn = live && eta < 1.3;
    bodyInfo.telegraphing = warn;
    bodyInfo.attackEta = warn ? eta : -1;
    for (const side of [0, 1]) {
      const info = this.parts[SLOT_FIST + side].info;
      info.telegraphing = warn && info.alive;
      info.attackEta = info.telegraphing ? eta : -1;
    }
    this.syncVolumes();
  }
  volTo = {
    x: 0,
    y: 0,
    z: 0,
  };
  syncVolumes() {
    const center = this.arena.center;
    const present = this.state !== 'gone';
    const volTo = this.volTo;
    if (present || !this.volsParked) {
      for (const vol of this.vols) {
        if (present && (vol.data.part !== 'crystal' || this.crystals[vol.slot - SLOT_CRYSTAL].alive)) {
          volTo.x = vol.target.x;
          volTo.y = vol.target.y;
          volTo.z = vol.target.z;
        } else {
          volTo.x = center.x;
          volTo.y = center.y - 40;
          volTo.z = center.z;
        }
        vol.data.enemyId = BOSS_ID_BASE + (this.parts[vol.slot].info.alive ? vol.slot : SLOT_BODY);
        try {
          vol.body.setNextKinematicTranslation(volTo);
        } catch {}
      }
      this.volsParked = !present;
    }
    const headCollider = this.headCollider;
    if (headCollider) {
      _tmp2.copy(this.spine[2]).lerp(this.maskPos, 0.45);
      const blocking = present && this.state !== 'dormant' && _tmp2.y - this.arena.floorY < 3.4;
      this.headData.slot = this.parts[SLOT_MASK].info.alive ? SLOT_MASK : SLOT_BODY;
      this.headData.enemyId = BOSS_ID_BASE + this.headData.slot;
      try {
        headCollider.setTranslation({
          x: _tmp2.x,
          y: blocking ? _tmp2.y : center.y - 30,
          z: _tmp2.z,
        });
      } catch {}
    }
  }
  hitStop(duration) {
    try {
      this.ctx.time.hitStop(duration);
    } catch {}
  }
  play(sound, pos, volume = 1, pitch) {
    try {
      this.ctx.audio?.play(sound, {
        position: pos.clone(),
        volume,
        pitch,
      });
    } catch {}
  }
  emitSafe(type, payload) {
    try {
      this.ctx.events.emit(type, payload);
    } catch (err) {
      console.warn('[boss] emit failed', type, err);
    }
  }
  setVisible(visible) {
    this.mesh.visible = visible;
    this.outline.visible = visible;
  }
  setDeath(death) {
    this.uni.uP0.value.w = death;
  }
  setFade(fade) {
    this.uni.uP4.value.y = fade;
  }
  get maskWorld() {
    return this.maskPos;
  }
  get crystalWorld() {
    return this.crystalPos;
  }
  get bodyCenter() {
    return this.spine[1];
  }
  get headCenter() {
    return this.spine[2];
  }
}
