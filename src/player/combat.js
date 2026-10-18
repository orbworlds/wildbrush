/**
 * Brush melee combat: the slash combo, jump slash and charged spin (with the chroma brush's rainbow paint wave), hits on enemies and props along the brush's sweep, painting ground slams, dodges and the perfect-dodge masterstroke flurry, lock-on, hit feedback and rumble, and taking damage, dying and respawning.
 */
import { Vector2, Vector3 } from 'three';
import { COLLISION_LAYERS, COLORS, interactionGroups } from '../core/config.js';
import { clamp } from '../core/math.js';
import {
  CHROMA_BRUSH,
  COMBO,
  DODGES,
  FLURRY,
  flurryStroke,
  JUMP_SLASH,
  MASTERSTROKE_SLOWMO,
  MASTERSTROKE_WINDOW,
  MOVES,
  SPIN_CHARGE,
} from '../shared/combat-defs.js';
import { groundHeightAt, isOnSkyAt, skySurfaceAt, waterLevel } from '../shared/skyground.js';
import { approachAngle, wrapAngle, yawOf } from './controller.js';
function colorForAngle(angle) {
  const quadrant = ((Math.floor((angle + Math.PI) / (Math.PI / 2)) % 4) + 4) % 4;
  return COLORS[quadrant];
}
const MELEE_SOURCES = new Set(['melee', 'spin', 'jumpSlash', 'flurry']);
const MELEE_PROP_GROUPS = interactionGroups(COLLISION_LAYERS.ALL, COLLISION_LAYERS.PROP);
const IDENTITY_ROT = {
  x: 0,
  y: 0,
  z: 0,
  w: 1,
};
const SWEEP_FRACTIONS = [0.42, 0.72, 1];
const SWEEP_RADII = [0.45, 0.55, 0.7];
export class Combat {
  ctx;
  ctrl;
  rig;
  st;
  holdT = -1;
  buffered = false;
  comboNext = 0;
  comboGap = 99;
  charging = false;
  move = null;
  def = MOVES.slash1;
  t = 0;
  atk = {
    move: 'slash1',
    t: 0,
    duration: 0.5,
  };
  hitIds = new Set();
  propIds = new Set();
  swingColor = null;
  inkSpent = false;
  swingSent = false;
  impactDone = false;
  attackYaw = 0;
  lungeDir = new Vector3(0, 0, 1);
  lungeDist = 0;
  spinPower = 0;
  ringPaint = false;
  ringMask = 0;
  targetId = null;
  lastStroke = -2;
  pts = [new Vector3(), new Vector3(), new Vector3()];
  prev = [new Vector3(), new Vector3(), new Vector3()];
  havePrev = false;
  dodgeT = -1;
  dodgeDir = 'back';
  dodgeVel = new Vector2();
  masterT = 0;
  masterTarget = null;
  hurtT = -1;
  hurtDur = 0;
  hurtVel = new Vector2();
  iframeT = 0;
  deathT = -1;
  respawning = false;
  shrines = [];
  hitEventSeen = false;
  killCheckT = 0;
  scrapeT = 0;
  hit = {
    damage: 1,
    color: null,
    direction: new Vector3(1, 0, 0),
    knockback: 5,
    source: 'melee',
    point: new Vector3(),
  };
  v1 = new Vector3();
  v2 = new Vector3();
  v3 = new Vector3();
  chest = new Vector3();
  tip = new Vector3();
  ball;
  propCenter = {
    x: 0,
    y: 0,
    z: 0,
  };
  impulse = {
    x: 0,
    y: 0,
    z: 0,
  };
  onProp;
  lockPos = new Vector3();
  camDir = new Vector3();
  onTeleport = null;
  itemGuard = false;
  prism = {
    damage: CHROMA_BRUSH.prismDamage,
    color: 'blue',
    direction: new Vector3(1, 0, 0),
    knockback: 0,
    source: 'blob',
    point: new Vector3(),
  };
  prismIdx = 0;
  inPrism = false;
  wave = null;
  constructor(ctx, ctrl, rig) {
    this.ctx = ctx;
    this.ctrl = ctrl;
    this.rig = rig;
    this.st = ctrl.state;
    this.ball = new ctx.RAPIER.Ball(0.5);
    this.onProp = (collider) => this.collectProp(collider);
    ctx.events.on('combat:hit', (data) => this.onHit(data));
    ctx.events.on('content:shrine-complete', ({ position }) => {
      if (position) this.shrines.push(position.clone());
    });
  }
  get busy() {
    return this.move !== null || this.dodgeT >= 0 || this.hurtT >= 0 || this.st.dead || this.charging;
  }
  get isRespawning() {
    return this.respawning;
  }
  get chroma() {
    return this.st.brush === 'chroma';
  }
  interrupt() {
    if (this.move) this.endMove();
    this.cancelCharge();
    this.dodgeT = -1;
    this.buffered = false;
    this.masterT = 0;
    this.setLock(null);
    this.rig.lockTarget = null;
  }
  preUpdate(dt, intent, controlOn, attackBlocked) {
    const ctx = this.ctx;
    const st = this.st;
    const cmb = this.ctrl.cmb;
    cmb.lockMove = false;
    cmb.speedCap = 0;
    cmb.noSprint = false;
    cmb.drive = false;
    cmb.noJump = false;
    this.killCheck();
    if (dt <= 0) return;
    this.masterT = Math.max(0, this.masterT - dt);
    const input = ctx.input;
    const currentMode = this.ctrl.currentMode;
    const canAct = controlOn && !this.respawning && !st.dead;
    this.iframeT = Math.max(0, this.iframeT - dt);
    if (st.dead) {
      cmb.lockMove = cmb.noJump = true;
      if (currentMode === 'ground' || currentMode === 'slide') {
        cmb.drive = true;
        cmb.driveX = cmb.driveZ = 0;
      }
      this.deathT += ctx.time.realDt;
      if (this.deathT > 2.6 && !this.respawning) this.respawnAfterDeath();
      return;
    }
    const flying = currentMode === 'fly';
    if (canAct && !flying && input.pressed('lockOn')) this.toggleLock();
    if (
      st.lockTargetId !== null &&
      (currentMode === 'climb' || currentMode === 'swim' || currentMode === 'glide' || flying)
    )
      this.setLock(null);
    const canAttack = canAct && !attackBlocked && !st.aiming;
    const attackPressed = canAttack && input.pressed('attack');
    const attackHeld = canAttack && input.held('attack');
    if (this.hurtT >= 0) {
      this.hurtT += dt;
      cmb.lockMove = cmb.noJump = true;
      const falloff = Math.max(0, 1 - this.hurtT / 0.3);
      if (currentMode === 'ground' || currentMode === 'slide') {
        cmb.drive = true;
        cmb.driveX = this.hurtVel.x * falloff;
        cmb.driveZ = this.hurtVel.y * falloff;
      }
      if (this.hurtT >= this.hurtDur) this.hurtT = -1;
      if (attackPressed && !flying) this.buffered = true;
      this.holdT = -1;
      return;
    }
    if (flying) {
      if (this.move) this.endMove();
      if (this.charging) this.cancelCharge();
      this.holdT = -1;
      this.buffered = false;
      this.dodgeT = -1;
      st.charge = 0;
      st.attack = null;
      return;
    }
    if (attackPressed) {
      this.holdT = currentMode === 'ground' || currentMode === 'slide' || currentMode === 'air' ? 0 : -1;
      if (!(this.masterT > 0 && this.startFlurry()))
        if (this.move || this.dodgeT >= 0) {
          if (!this.move || this.t >= this.def.bufferFrom) this.buffered = true;
        } else this.tryStartAttack(intent);
    }
    if (attackHeld && this.holdT >= 0) this.holdT += dt;
    else if (this.holdT >= 0) {
      if (this.charging) this.releaseCharge();
      this.holdT = -1;
    }
    const grounded = currentMode === 'ground' || currentMode === 'slide';
    if (!this.charging && this.holdT >= SPIN_CHARGE.start && grounded && this.dodgeT < 0) {
      const inCombo = this.move !== null && COMBO.includes(this.move) && this.move !== 'slash3';
      if (!this.move || (inCombo && this.t >= Math.min(this.def.cancel, 0.24))) {
        this.endMove();
        this.charging = true;
        this.buffered = false;
      }
    }
    if (this.charging) {
      if (!grounded || !attackHeld) if (!grounded) this.cancelCharge();
      st.charge = clamp((this.holdT - SPIN_CHARGE.start) / SPIN_CHARGE.full, 0, 1);
      cmb.speedCap = 2.3;
      cmb.noSprint = true;
      cmb.noJump = true;
      this.faceWhileBusy(intent, 16);
    } else st.charge = 0;
    if (
      intent.jumpPressed &&
      st.lockTargetId !== null &&
      grounded &&
      !this.charging &&
      this.dodgeT < 0 &&
      (!this.move || this.t >= this.def.cancel) &&
      this.tryDodge(intent)
    )
      intent.jumpPressed = false;
    if (this.dodgeT >= 0) this.stepDodge(dt, intent);
    if (this.move) this.stepMove(dt, intent, attackPressed);
    else {
      this.comboGap += dt;
      if (this.buffered && this.dodgeT < 0 && !this.charging) {
        this.buffered = false;
        if (canAct) this.tryStartAttack(intent);
      }
    }
    if (st.lockTargetId !== null && !this.move && this.dodgeT < 0 && !this.ctrl.aiming) {
      const target = ctx.enemies.get(st.lockTargetId);
      if (
        target &&
        (currentMode === 'ground' || currentMode === 'slide' || currentMode === 'air') &&
        ((this.ctrl.faceTarget = yawOf(target.position.x - st.position.x, target.position.z - st.position.z)),
        (this.ctrl.faceRate = 12),
        (cmb.noSprint = true),
        !this.charging)
      ) {
        const facing = st.facing;
        cmb.speedCap = -(st.moveIntent.x * Math.sin(facing) + st.moveIntent.y * Math.cos(facing)) > 0.5 ? 3.8 : 5.2;
      }
    }
    st.attack = this.move ? this.atk : null;
  }
  update(dt) {
    const st = this.st;
    if (dt > 0 && this.move) {
      const def = this.def;
      const t2 = this.t;
      if (!this.swingSent && t2 >= def.activeStart - 0.02 && this.move !== 'flurry') {
        this.swingSent = true;
        this.emitSwing();
      }
      if (this.move === 'jumpSlash' && t2 < JUMP_SLASH.land) {
        const currentMode = this.ctrl.currentMode;
        const elapsed = this.ctx.time.elapsed;
        if (currentMode === 'swim' || currentMode === 'climb') this.endMove();
        else if (
          (currentMode === 'ground' || currentMode === 'slide' || st.lastBounceTime === elapsed) &&
          t2 > JUMP_SLASH.hang
        ) {
          this.t = JUMP_SLASH.land;
          this.atk.t = this.t;
          this.groundImpact(2.5, 2, 1.7);
        }
      }
      if (this.move) {
        if (this.move === 'flurry') this.flurryHits();
        else if (this.t >= def.activeStart - 0.03 && this.t <= def.activeEnd) this.sweep();
        else this.havePrev = false;
        if (this.move === 'slash3' && !this.impactDone && this.t >= def.impact) this.groundImpact(2, 1.5, 1.35);
      }
    }
    if (this.wave && dt > 0) this.stepWave(dt);
    this.updateLock();
    this.rig.cinematic = this.move === 'flurry' && this.t < FLURRY.finisher + 0.3;
    st.invulnerable =
      this.iframeT > 0 ||
      this.move === 'flurry' ||
      this.masterT > 0 ||
      this.respawning ||
      st.dead ||
      this.itemGuard ||
      (this.dodgeT >= 0 && this.dodgeT < DODGES[this.dodgeDir].iframes);
  }
  tryStartAttack(intent) {
    const st = this.st;
    const currentMode = this.ctrl.currentMode;
    if (this.hurtT >= 0 || this.dodgeT >= 0) {
      this.buffered = true;
      return;
    }
    if (currentMode === 'air' && st.airTime > 0.06) {
      this.startMove('jumpSlash', intent);
      return;
    }
    if (currentMode !== 'ground' && currentMode !== 'slide') return;
    if (this.comboGap > 0.5) this.comboNext = 0;
    const nextMove = COMBO[this.comboNext];
    this.comboNext = (this.comboNext + 1) % COMBO.length;
    this.startMove(nextMove, intent);
  }
  startMove(move, intent) {
    const ctx = this.ctx;
    const st = this.st;
    this.move = move;
    this.def = MOVES[move];
    this.t = 0;
    this.hitIds.clear();
    this.propIds.clear();
    this.inkSpent = false;
    this.swingSent = false;
    this.impactDone = false;
    this.havePrev = false;
    this.buffered = false;
    this.lastStroke = -2;
    this.ringMask = 0;
    const selectedColor = st.selectedColor;
    this.swingColor = this.chroma || (ctx.paint.ink[selectedColor] ?? 0) >= 1 ? selectedColor : null;
    this.atk.move = move;
    this.atk.t = 0;
    this.atk.duration = this.def.duration;
    st.attack = this.atk;
    st.lastAttackTime = ctx.time.elapsed;
    const wish = this.v1;
    this.wishDir(intent, wish);
    const target =
      move === 'flurry'
        ? (ctx.enemies.get(this.masterTarget ?? -1) ?? null)
        : this.pickTarget(wish, move === 'jumpSlash' ? 7 : 4.8);
    this.targetId = target ? target.id : null;
    if (target) {
      const dx = target.position.x - st.position.x;
      const dz = target.position.z - st.position.z;
      const dist = Math.hypot(dx, dz);
      this.attackYaw = yawOf(dx, dz);
      this.lungeDist = clamp(dist - target.radius - 0.95, 0, this.def.lungeTarget);
    } else {
      this.attackYaw = wish.lengthSq() > 0.01 ? yawOf(wish.x, wish.z) : st.facing;
      this.lungeDist = this.def.lunge;
    }
    this.lungeDir.set(Math.sin(this.attackYaw), 0, Math.cos(this.attackYaw));
    st.facing = approachAngle(st.facing, this.attackYaw, 1.4);
    this.comboGap = 0;
  }
  endMove() {
    if (this.move === 'flurry')
      this.ctx.events.emit('combat:flurry', {
        active: false,
      });
    this.move = null;
    this.st.attack = null;
    this.havePrev = false;
    this.comboGap = 0;
  }
  stepMove(dt, intent, attackPressed) {
    const st = this.st;
    const cmb = this.ctrl.cmb;
    const def = this.def;
    const currentMode = this.ctrl.currentMode;
    const move = this.move;
    this.t += dt;
    if (move === 'jumpSlash' && this.t >= JUMP_SLASH.land - 0.005 && !this.impactDone) this.t = JUMP_SLASH.land - 0.005;
    const t2 = this.t;
    this.atk.t = t2;
    if (t2 >= def.cancel) {
      if (this.buffered && move !== 'flurry') {
        this.buffered = false;
        const comboIdx = COMBO.indexOf(move);
        if (comboIdx >= 0 && comboIdx < COMBO.length - 1) {
          this.comboNext = comboIdx + 1;
          this.endMove();
          this.tryStartAttack(intent);
          return;
        }
        this.endMove();
        this.comboNext = 0;
        this.tryStartAttack(intent);
        return;
      }
      if (intent.move.lengthSq() > 0.09 || intent.jumpPressed || attackPressed) {
        this.endMove();
        return;
      }
    }
    if (t2 >= def.duration) {
      this.endMove();
      return;
    }
    cmb.lockMove = true;
    cmb.noJump = t2 < def.cancel;
    cmb.noSprint = true;
    if (this.targetId !== null && t2 < def.activeStart) {
      const target = this.ctx.enemies.get(this.targetId);
      if (target && target.alive) {
        this.attackYaw = yawOf(target.position.x - st.position.x, target.position.z - st.position.z);
        this.lungeDir.set(Math.sin(this.attackYaw), 0, Math.cos(this.attackYaw));
      }
    }
    this.ctrl.faceTarget = this.attackYaw;
    this.ctrl.faceRate = t2 < def.activeEnd ? 34 : 10;
    if (move === 'jumpSlash') {
      this.stepJumpSlash(t2);
      return;
    }
    if (move === 'flurry') {
      this.stepFlurry(t2);
      return;
    }
    if (currentMode === 'ground') {
      cmb.drive = true;
      let lunge = 0;
      if (t2 >= def.lungeStart && t2 <= def.lungeEnd && this.lungeDist > 0) {
        const k = (t2 - def.lungeStart) / (def.lungeEnd - def.lungeStart);
        lunge = (((this.lungeDist / (def.lungeEnd - def.lungeStart)) * Math.PI) / 2) * Math.sin(Math.PI * k);
      }
      cmb.driveX = this.lungeDir.x * lunge;
      cmb.driveZ = this.lungeDir.z * lunge;
    }
  }
  stepJumpSlash(t2) {
    const st = this.st;
    const velocity = st.velocity;
    const cmb = this.ctrl.cmb;
    cmb.noJump = true;
    if (t2 < JUMP_SLASH.land) {
      cmb.drive = true;
      if (t2 < JUMP_SLASH.hang) {
        if (velocity.y < 1.5) velocity.y = 1.5 - t2 * 6;
        cmb.driveX = velocity.x * 0.9;
        cmb.driveZ = velocity.z * 0.9;
      } else {
        velocity.y = Math.min(velocity.y, -JUMP_SLASH.plungeSpeed);
        let vx = velocity.x * 0.5;
        let vz = velocity.z * 0.5;
        const target = this.targetId === null ? undefined : this.ctx.enemies.get(this.targetId);
        if (target && target.alive) {
          const dx = target.position.x - st.position.x;
          const dz = target.position.z - st.position.z;
          const dist = Math.hypot(dx, dz);
          const fallTime = Math.max(0.15, (st.position.y - target.position.y) / JUMP_SLASH.plungeSpeed);
          const gap = Math.max(0, dist - target.radius - 0.6);
          const speed = Math.min(12, gap / fallTime);
          if (dist > 0.001) {
            vx = (dx / dist) * speed;
            vz = (dz / dist) * speed;
          }
        }
        cmb.driveX = vx;
        cmb.driveZ = vz;
      }
    } else {
      cmb.drive = true;
      cmb.driveX = cmb.driveZ = 0;
    }
  }
  releaseCharge() {
    const charge = this.st.charge;
    this.charging = false;
    this.st.charge = 0;
    if (charge < SPIN_CHARGE.min) return;
    this.spinPower = charge;
    this.startMove('spin', null);
    const selectedColor = this.st.selectedColor;
    if (this.chroma) {
      this.ringPaint = charge >= 0.99;
      const st = this.st;
      this.wave = {
        t: 0,
        center: new Vector3(st.position.x, st.position.y, st.position.z),
        radius: CHROMA_BRUSH.waveRadius * (0.62 + 0.38 * charge),
        lastR: 0,
        painted: 0,
        hit: new Set(),
        splats: 0,
      };
      try {
        this.ctx.paint.bloomVitality(this.wave.center.clone(), this.wave.radius * 2.4, 1.6);
      } catch {}
      this.rig.punch(0.55);
      this.rig.addTrauma(0.3);
      this.rumble(0.6, 0.9, 220);
      return;
    }
    this.ringPaint = charge >= 0.99 && (this.ctx.paint.ink[selectedColor] ?? 0) >= 3;
    if (this.ringPaint) this.ctx.paint.addInk(selectedColor, -3);
    this.rig.punch(0.35);
    this.rig.addTrauma(0.18);
  }
  stepWave(dt) {
    const wave = this.wave;
    const ctx = this.ctx;
    wave.t += dt;
    const progress = Math.min(1, wave.t / CHROMA_BRUSH.waveTime);
    const front = 0.6 + (wave.radius - 0.6) * (1 - (1 - progress) * (1 - progress));
    const center = wave.center;
    const rings = [0.34, 0.58, 0.82];
    for (let i = wave.painted; i < rings.length; i++) {
      const radius = rings[i] * wave.radius;
      if (front < radius) break;
      wave.painted = i + 1;
      const count = Math.round(radius * 3.2);
      for (let j = 0; j < count; j++) {
        const angle = (j / count) * Math.PI * 2 + i * 0.37;
        const x = center.x + Math.sin(angle) * radius;
        const z = center.z + Math.cos(angle) * radius;
        let y = groundHeightAt(ctx, x, z, center.y + 1);
        if (!Number.isFinite(y) || Math.abs(y - center.y) > 3) y = center.y;
        try {
          ctx.paint.paintSphere(this.v1.set(x, y + 0.06, z), 0.62 + i * 0.08, colorForAngle(angle), 1);
        } catch {}
      }
      if (i === 1)
        for (let j = 0; j < 4; j++) {
          const angle = -Math.PI + (j + 0.5) * (Math.PI / 2);
          const x = center.x + Math.sin(angle) * radius;
          const z = center.z + Math.cos(angle) * radius;
          let y = groundHeightAt(ctx, x, z, center.y + 1);
          if (!Number.isFinite(y) || Math.abs(y - center.y) > 3) y = center.y;
          this.emitSplat(this.v1.set(x, y, z), colorForAngle(angle), 1.25);
        }
    }
    let nearby = [];
    try {
      nearby = ctx.enemies.query(center, front + 1.5);
    } catch {
      nearby = [];
    }
    const prism = this.prism;
    for (const enemy of nearby) {
      if (!enemy.alive || wave.hit.has(enemy.id)) continue;
      const dx = enemy.position.x - center.x;
      const dz = enemy.position.z - center.z;
      if (Math.hypot(dx, dz) - enemy.radius > front || Math.abs(enemy.position.y - center.y) > 4) continue;
      wave.hit.add(enemy.id);
      prism.damage = 1.2 * CHROMA_BRUSH.damage;
      prism.color = colorForAngle(Math.atan2(dx, dz));
      prism.knockback = 8;
      prism.source = 'spin';
      const len = Math.hypot(dx, dz) || 1;
      prism.direction.set(dx / len, 0, dz / len);
      prism.point.set(enemy.position.x, enemy.position.y + enemy.height * 0.4, enemy.position.z);
      this.inPrism = true;
      try {
        ctx.enemies.damage(enemy.id, prism);
      } catch {}
      this.inPrism = false;
    }
    wave.lastR = front;
    if (progress >= 1) this.wave = null;
  }
  cancelCharge() {
    this.charging = false;
    this.st.charge = 0;
    this.holdT = -1;
  }
  startFlurry() {
    const ctx = this.ctx;
    const target = ctx.enemies.get(this.masterTarget ?? -1);
    if (!target || !target.alive) {
      return false;
    } else {
      this.dodgeT = -1;
      this.cancelCharge();
      this.masterT = 0;
      this.iframeT = Math.max(this.iframeT, 0.2);
      this.startMove('flurry', null);
      this.targetId = target.id;
      ctx.time.slowMo(1, 0.001);
      ctx.events.emit('combat:flurry', {
        active: true,
      });
      this.rig.punch(0.9);
      this.rig.addTrauma(0.25);
      this.rumble(0.6, 0.9, 160);
      if (this.st.lockTargetId === null) this.setLock(target.id);
      return true;
    }
  }
  stepFlurry(t2) {
    const st = this.st;
    const cmb = this.ctrl.cmb;
    let target = this.targetId === null ? undefined : this.ctx.enemies.get(this.targetId);
    cmb.drive = true;
    cmb.driveX = cmb.driveZ = 0;
    if ((!target || !target.alive) && t2 < FLURRY.finisher) {
      let next;
      try {
        next = this.ctx.enemies.query(st.position, 5.5).find((enemy) => enemy.alive);
      } catch {
        next = undefined;
      }
      if (next) {
        this.targetId = next.id;
        target = next;
        if (st.lockTargetId !== null) this.setLock(next.id);
      }
    }
    if (!target || !target.alive) {
      if (t2 < FLURRY.finisher) this.t = Math.max(this.t, FLURRY.finisher - 0.01);
      return;
    }
    const dx = target.position.x - st.position.x;
    const dz = target.position.z - st.position.z;
    const dist = Math.hypot(dx, dz);
    this.attackYaw = yawOf(dx, dz);
    const reach = target.radius + 0.85;
    const frameDt = Math.max(this.ctx.time.dt, 0.0001);
    if (t2 < FLURRY.dash) {
      const left = Math.max(FLURRY.dash - t2, frameDt);
      const speed = Math.min(38, Math.max(0, dist - reach) / left);
      cmb.driveX = (dx / Math.max(dist, 0.001)) * speed;
      cmb.driveZ = (dz / Math.max(dist, 0.001)) * speed;
    } else if (dist > reach + 0.35) {
      const speed = Math.min(14, (dist - reach) * 10);
      cmb.driveX = (dx / dist) * speed;
      cmb.driveZ = (dz / dist) * speed;
    }
  }
  flurryHits() {
    const ctx = this.ctx;
    const st = this.st;
    const t2 = this.t;
    const stroke = flurryStroke(t2);
    if (stroke === this.lastStroke) return;
    const target = this.targetId === null ? undefined : ctx.enemies.get(this.targetId);
    if (stroke < 0) return;
    this.lastStroke = stroke;
    const finisher = stroke >= FLURRY.count;
    if (finisher && t2 < FLURRY.finisherHit) {
      this.lastStroke = stroke - 1;
      return;
    }
    this.emitSwing();
    const point = this.v1;
    if (target && target.alive)
      point.set(target.position.x, target.position.y + target.height * 0.5, target.position.z);
    else
      point.set(
        st.position.x + Math.sin(st.facing) * 1.3,
        st.position.y + 1,
        st.position.z + Math.cos(st.facing) * 1.3,
      );
    this.hitIds.clear();
    const hit = this.hit;
    hit.damage = MOVES.flurry.damage * (this.chroma ? CHROMA_BRUSH.damage : 1);
    hit.color = this.chroma && !finisher ? COLORS[stroke % 4] : this.swingColor;
    hit.source = 'flurry';
    hit.knockback = finisher ? 11 : MOVES.flurry.knockback;
    this.v2.set(point.x - st.position.x, 0, point.z - st.position.z);
    if (this.v2.lengthSq() < 0.000001) this.v2.set(Math.sin(st.facing), 0, Math.cos(st.facing));
    hit.direction.copy(this.v2.normalize());
    hit.point.copy(point).addScaledVector(hit.direction, -0.3);
    this.doHit(point, finisher ? 2.3 : (target ? target.radius : 0.4) + 0.95);
    if (finisher) {
      ctx.time.hitStop(0.16);
      this.rig.addTrauma(0.55);
      this.rig.punch(1);
      this.rumble(1, 1, 260);
    }
  }
  sweep() {
    const ctx = this.ctx;
    const st = this.st;
    const chest = this.chest.set(st.position.x, st.position.y + 1.05, st.position.z);
    const tip = this.tip;
    let haveTip = false;
    try {
      if (!ctx.character.isStub) {
        ctx.character.brushTipWorld(tip);
        haveTip = Number.isFinite(tip.x + tip.y + tip.z) && tip.distanceToSquared(chest) < 9;
      }
    } catch {
      haveTip = false;
    }
    if (!haveTip) {
      const k = clamp(
        (this.t - this.def.activeStart) / Math.max(0.01, this.def.activeEnd - this.def.activeStart),
        0,
        1,
      );
      const angle =
        st.facing + (this.move === 'slash2' ? 1.4 - 2.8 * k : -1.4 + 2.8 * k) * (this.move === 'spin' ? 2.3 : 1);
      tip.set(chest.x + Math.sin(angle) * 1.5, chest.y - 0.1, chest.z + Math.cos(angle) * 1.5);
    }
    for (let i = 0; i < 3; i++) this.pts[i].copy(chest).lerp(tip, SWEEP_FRACTIONS[i]);
    if (!this.havePrev) {
      for (let i = 0; i < 3; i++) this.prev[i].copy(this.pts[i]);
      this.havePrev = true;
    }
    const def = this.def;
    const hit = this.hit;
    hit.damage =
      (this.move === 'spin' ? def.damage * (0.8 + 0.2 * this.spinPower) : def.damage) *
      (this.chroma ? CHROMA_BRUSH.damage : 1);
    hit.color = this.swingColor;
    hit.source = def.source;
    hit.knockback = def.knockback;
    for (let i = 0; i < 3; i++) {
      const from = this.prev[i];
      const to = this.pts[i];
      const radius = SWEEP_RADII[i] * (this.move === 'spin' ? 1.15 : 1);
      const len = from.distanceTo(to);
      const steps = Math.min(8, Math.max(1, Math.ceil(len / (radius * 0.8))));
      for (let j = 1; j <= steps; j++) {
        const point = this.v3.copy(from).lerp(to, j / steps);
        this.v2.set(point.x - st.position.x, 0, point.z - st.position.z);
        if (this.v2.lengthSq() < 0.000001) this.v2.set(Math.sin(st.facing), 0, Math.cos(st.facing));
        hit.direction.copy(this.v2.normalize());
        hit.point.copy(point);
        this.doHit(point, radius);
        if (i >= 1) {
          point.y -= 0.5;
          this.doHit(point, radius * 0.9);
          point.y += 0.5;
        }
        if (i === 2) this.hitProps(point, radius);
      }
      from.copy(to);
    }
    this.scrapeT -= ctx.time.dt;
    const swingColor = this.swingColor;
    if (swingColor && this.scrapeT <= 0) {
      const groundY = groundHeightAt(ctx, tip.x, tip.z, st.position.y + 0.5);
      const ring = this.move === 'spin' && this.ringPaint;
      if (ring || tip.y - groundY < 0.32) {
        this.scrapeT = ring ? 0.022 : 0.03;
        this.v3.set(tip.x, groundY + 0.05, tip.z);
        try {
          ctx.paint.paintSphere(this.v3, ring ? 0.55 : 0.3, swingColor, ring ? 1 : 0.55);
        } catch {}
        if (ring) this.ringSplat(tip, groundY, swingColor);
      }
    }
  }
  ringSplat(tip, groundY, color) {
    const st = this.st;
    const angle = Math.atan2(tip.x - st.position.x, tip.z - st.position.z);
    const quadrant = ((Math.floor((angle + Math.PI) / (Math.PI / 2)) % 4) + 4) % 4;
    if (!(this.ringMask & (1 << quadrant))) {
      this.ringMask |= 1 << quadrant;
      this.emitSplat(this.v3.set(tip.x, groundY, tip.z), color, 1.1);
    }
  }
  doHit(center, radius) {
    const ctx = this.ctx;
    this.hitEventSeen = false;
    let hits = [];
    try {
      hits = ctx.enemies.hitSphere(center, radius, this.hit, this.hitIds);
    } catch {
      hits = [];
    }
    if (hits.length) {
      if (!this.inkSpent && this.swingColor && !this.chroma) {
        this.inkSpent = true;
        try {
          ctx.paint.addInk(this.swingColor, -1);
        } catch {}
      }
      if (!this.hitEventSeen) this.juice(false, false, this.hit.damage);
      if (this.chroma) for (const enemyId of hits) this.prismBurst(enemyId);
    }
  }
  prismBurst(enemyId) {
    const ctx = this.ctx;
    let enemy;
    try {
      enemy = ctx.enemies.get(enemyId);
    } catch {
      enemy = undefined;
    }
    if (!enemy || !enemy.alive) return;
    try {
      if (enemy.statuses?.has?.('frozen')) return;
    } catch {}
    const selectedColor = this.st.selectedColor;
    let color = selectedColor;
    for (let i = 0; i < 4 && color === selectedColor; i++) {
      this.prismIdx = (this.prismIdx + 1) % COLORS.length;
      color = COLORS[this.prismIdx];
    }
    if (color === selectedColor) return;
    const prism = this.prism;
    prism.damage = CHROMA_BRUSH.prismDamage;
    prism.color = color;
    prism.knockback = 0;
    prism.source = 'blob';
    prism.direction.copy(this.hit.direction);
    if (enemy.aim) prism.point.copy(enemy.aim);
    else prism.point.set(enemy.position.x, enemy.position.y + enemy.height * 0.55, enemy.position.z);
    this.inPrism = true;
    try {
      ctx.enemies.damage(enemyId, prism);
    } catch {}
    this.inPrism = false;
  }
  hitProps(center, radius) {
    this.ball.radius = radius;
    this.propCenter.x = center.x;
    this.propCenter.y = center.y;
    this.propCenter.z = center.z;
    this.propHits.length = 0;
    try {
      this.ctx.physics.intersectionsWithShape(
        this.propCenter,
        IDENTITY_ROT,
        this.ball,
        this.onProp,
        undefined,
        MELEE_PROP_GROUPS,
      );
    } catch {}
    for (const collider of this.propHits)
      try {
        this.nudgeProp(collider);
      } catch {}
    this.propHits.length = 0;
  }
  propHits = [];
  collectProp(collider) {
    if (!this.propIds.has(collider.handle)) {
      this.propIds.add(collider.handle);
      this.propHits.push(collider);
    }
    return true;
  }
  nudgeProp(collider) {
    const handle = collider.handle;
    const body = collider.parent();
    if (!body || !body.isDynamic()) return;
    const st = this.st;
    const pos = body.translation();
    const dx = pos.x - st.position.x;
    const dz = pos.z - st.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const mass = body.mass();
    const strength = this.move === 'slash3' || this.move === 'spin' || this.move === 'jumpSlash' ? 7 : 4.5;
    this.impulse.x = (dx / len) * mass * strength;
    this.impulse.y = mass * 2.6;
    this.impulse.z = (dz / len) * mass * strength;
    body.applyImpulse(this.impulse, true);
    body.applyTorqueImpulse(
      {
        x: (Math.random() - 0.5) * mass,
        y: (Math.random() - 0.5) * mass,
        z: (Math.random() - 0.5) * mass,
      },
      true,
    );
    if (this.swingColor)
      this.ctx.events.emit('paint:splat', {
        position: new Vector3(pos.x, pos.y, pos.z),
        normal: new Vector3(-dx / len, 0.3, -dz / len).normalize(),
        color: this.swingColor,
        radius: 0.9,
        surface: 'prop',
        colliderHandle: handle,
      });
    this.ctx.events.emit('prop:impact', {
      position: new Vector3(pos.x, pos.y, pos.z),
      kind: 'crate',
      strength,
    });
    this.ctx.time.hitStop(0.035);
    this.rig.addTrauma(0.14);
  }
  groundImpact(radius, damage, paintRadius) {
    const ctx = this.ctx;
    const st = this.st;
    this.impactDone = true;
    const center = this.v3;
    let haveTip = false;
    try {
      if (!ctx.character.isStub) {
        ctx.character.brushTipWorld(center);
        haveTip = Number.isFinite(center.x) && Math.hypot(center.x - st.position.x, center.z - st.position.z) < 2.5;
      }
    } catch {
      haveTip = false;
    }
    const reach = this.move === 'jumpSlash' ? 0.9 : 1.35;
    if (!haveTip)
      center.set(st.position.x + Math.sin(st.facing) * reach, 0, st.position.z + Math.cos(st.facing) * reach);
    let groundY = groundHeightAt(ctx, center.x, center.z, st.position.y + 0.5);
    if (!Number.isFinite(groundY) || Math.abs(groundY - st.position.y) > 1.2) groundY = st.position.y;
    center.y = groundY;
    const hit = this.hit;
    hit.damage = damage * (this.chroma ? CHROMA_BRUSH.damage : 1);
    hit.color = this.swingColor;
    hit.source = this.def.source;
    hit.knockback = this.def.knockback;
    const propPoint = this.v2.set(center.x, groundY + 0.6, center.z);
    for (const enemy of ctx.enemies.query(center, radius + 1.5))
      if (
        !this.hitIds.has(enemy.id) &&
        (hit.direction.set(enemy.position.x - center.x, 0, enemy.position.z - center.z),
        hit.direction.lengthSq() < 0.000001 && hit.direction.set(Math.sin(st.facing), 0, Math.cos(st.facing)),
        hit.direction.normalize(),
        hit.point.set(enemy.position.x, enemy.position.y + enemy.height * 0.4, enemy.position.z),
        (this.hitEventSeen = false),
        Math.hypot(enemy.position.x - center.x, enemy.position.z - center.z) - enemy.radius <= radius)
      )
        try {
          if (ctx.enemies.damage(enemy.id, hit)) {
            this.hitIds.add(enemy.id);
            if (!this.inkSpent && this.swingColor && !this.chroma) {
              this.inkSpent = true;
              ctx.paint.addInk(this.swingColor, -1);
            }
            if (!this.hitEventSeen) this.juice(false, false, damage);
            if (this.chroma) this.prismBurst(enemy.id);
          }
        } catch {}
    this.hitProps(propPoint, radius * 0.8);
    const selectedColor = st.selectedColor;
    if ((this.chroma || (ctx.paint.ink[selectedColor] ?? 0) >= 2) && st.mode !== 'swim') {
      try {
        if (!this.chroma) ctx.paint.addInk(selectedColor, -2);
        ctx.paint.paintSphere(this.v1.set(center.x, groundY + 0.08, center.z), paintRadius, selectedColor, 1);
        ctx.paint.bloomVitality(this.v1.set(center.x, groundY, center.z), 7, 1.4);
      } catch {}
      this.emitSplat(this.v1.set(center.x, groundY, center.z), selectedColor, paintRadius + 0.3);
    }
    ctx.time.hitStop(this.move === 'jumpSlash' ? 0.06 : 0.035);
    this.rig.addTrauma(this.move === 'jumpSlash' ? 0.42 : 0.3);
    this.rig.punch(this.move === 'jumpSlash' ? 0.55 : 0.3);
    this.rumble(0.7, 0.4, 140);
    ctx.events.emit('camera:shake', {
      strength: 0,
      position: center.clone(),
    });
  }
  emitSplat(position, color, radius) {
    let normal = new Vector3(0, 1, 0);
    try {
      normal = this.ctx.terrain.normalAt(position.x, position.z, normal);
    } catch {}
    this.ctx.events.emit('paint:splat', {
      position: position.clone(),
      normal,
      color,
      radius,
      surface: 'world',
    });
  }
  emitSwing() {
    const st = this.st;
    const pos = this.v1.set(st.position.x, st.position.y + 1.1, st.position.z);
    const dir = this.v2.set(Math.sin(this.attackYaw), 0, Math.cos(this.attackYaw));
    this.ctx.events.emit('combat:swing', {
      move: this.move ?? 'slash1',
      color: this.swingColor ?? st.selectedColor,
      position: pos.clone(),
      direction: dir.clone(),
    });
  }
  onHit(info) {
    if (this.inPrism) {
      if (info.killed) {
        this.killCheckT = 0.3;
        this.ctx.time.hitStop(0.06);
        this.rig.addTrauma(0.2);
      } else this.rig.addTrauma(0.04);
      return;
    }
    if (!MELEE_SOURCES.has(info.source)) {
      if (info.source === 'blob') this.rig.addTrauma(info.killed ? 0.2 : 0.06);
      if (info.killed) this.killCheckT = 0.3;
      return;
    }
    this.hitEventSeen = true;
    const baseDamage = this.hit.damage > 0 ? this.hit.damage : 1;
    const shatter = info.shatter ?? (info.damage >= baseDamage * 1.9 && info.damage > 0.9);
    this.juice(info.killed, shatter, info.damage);
  }
  juice(killed, shatter, damage) {
    const ctx = this.ctx;
    const move = this.move ?? 'slash1';
    const def = MOVES[move];
    let hitStop = def.hitStop;
    if (killed) hitStop = Math.max(hitStop, 0.1);
    if (shatter) hitStop = 0.14;
    ctx.time.hitStop(hitStop);
    let shake = def.shake + (killed ? 0.16 : 0) + (shatter ? 0.2 : 0);
    if (move === 'flurry') shake = killed ? 0.4 : 0.1;
    this.rig.addTrauma(shake);
    this.rig.kick(this.lungeDir, move === 'flurry' ? 0.05 : 0.12 + damage * 0.04);
    if (move === 'slash3' || move === 'jumpSlash' || killed || shatter) this.rig.punch(killed || shatter ? 0.8 : 0.5);
    this.rumble(killed ? 0.9 : 0.45, killed ? 0.7 : 0.6, killed ? 200 : 90);
    if (killed) this.killCheckT = 0.3;
  }
  killCheck() {
    if (this.killCheckT <= 0) return;
    this.killCheckT -= this.ctx.time.realDt;
    let alerted = 1;
    try {
      alerted = this.ctx.enemies.alertedCount;
    } catch {
      alerted = 1;
    }
    if (alerted === 0) {
      this.killCheckT = 0;
      if (this.ctx.enemies.isDummy) this.ctx.time.slowMo(0.3, 0.8);
      this.rig.beat(1.1);
    }
  }
  rumble(strong, weak, duration) {
    if (this.ctx.input.usingGamepad)
      try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const pad of pads)
          pad?.vibrationActuator
            ?.playEffect?.('dual-rumble', {
              startDelay: 0,
              duration,
              weakMagnitude: weak,
              strongMagnitude: strong,
            })
            ?.catch?.(() => undefined);
      } catch {}
  }
  toggleLock() {
    const ctx = this.ctx;
    if (this.st.lockTargetId !== null) {
      this.setLock(null);
      return;
    }
    const currentMode = this.ctrl.currentMode;
    let targetId = null;
    if (currentMode !== 'climb' && currentMode !== 'swim' && currentMode !== 'glide')
      try {
        ctx.camera.getWorldDirection(this.camDir);
        targetId = ctx.enemies.findLockTarget(ctx.camera.position, this.camDir, 30);
      } catch {
        targetId = null;
      }
    if (targetId === null) this.rig.recenter(this.st.facing);
    else this.setLock(targetId);
  }
  setLock(id) {
    if (this.st.lockTargetId !== id) {
      this.st.lockTargetId = id;
      this.ctx.events.emit('combat:lock', {
        enemyId: id,
      });
    }
  }
  updateLock() {
    const st = this.st;
    const ctx = this.ctx;
    let target;
    if (st.lockTargetId !== null) {
      target = ctx.enemies.get(st.lockTargetId);
      if (!target || !target.alive) {
        let next = null;
        for (const enemy of ctx.enemies.query(st.position, 16))
          if (
            enemy.alive &&
            enemy.id !== st.lockTargetId &&
            (enemy.alerted || !next) &&
            ((next = enemy), enemy.alerted)
          )
            break;
        this.setLock(next ? next.id : null);
        target = next ?? undefined;
      } else if (target.position.distanceTo(st.position) > 30) {
        this.setLock(null);
        target = undefined;
      }
    }
    if (target && st.lockTargetId !== null) {
      if (target.aim && Number.isFinite(target.aim.x + target.aim.y + target.aim.z)) {
        this.lockPos.copy(target.aim);
        this.lockPos.y = Math.min(this.lockPos.y, st.position.y + 7);
        this.rig.lockTarget = this.lockPos;
      } else
        this.rig.lockTarget = this.lockPos.set(
          target.position.x,
          target.position.y + target.height * 0.55,
          target.position.z,
        );
    } else this.rig.lockTarget = null;
  }
  tryDodge(intent) {
    const st = this.st;
    const ctx = this.ctx;
    const dir = this.wishDir(intent, this.v1);
    if (dir.lengthSq() < 0.09) return false;
    const facing = st.facing;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const fwd = dir.x * fx + dir.z * fz;
    const side = dir.x * -fz + dir.z * fx;
    let dodgeDir;
    dodgeDir = fwd > 0.6 ? 'forward' : fwd < -0.55 ? 'back' : side > 0 ? 'right' : 'left';
    if (this.move) this.endMove();
    const def = DODGES[dodgeDir];
    this.dodgeDir = dodgeDir;
    this.dodgeT = 0;
    const rx = -fz;
    const rz = fx;
    if (dodgeDir === 'forward') this.dodgeVel.set(fx * def.speed, fz * def.speed);
    else if (dodgeDir === 'back') this.dodgeVel.set(-fx * def.speed, -fz * def.speed);
    else {
      const sign = dodgeDir === 'right' ? 1 : -1;
      this.dodgeVel.set(rx * sign * def.speed, rz * sign * def.speed);
    }
    if (def.vy > 0) this.ctrl.launch(this.dodgeVel.x, def.vy, this.dodgeVel.y);
    const elapsed = ctx.time.elapsed;
    if (st.slowedUntil > elapsed) st.slowedUntil = elapsed + (st.slowedUntil - elapsed) * 0.35;
    st.lastDodgeTime = ctx.time.elapsed;
    st.dodgeDir = dodgeDir;
    let threat = null;
    try {
      for (const enemy of ctx.enemies.query(st.position, 25))
        if (enemy.alive && enemy.telegraphing && enemy.attackEta >= 0 && enemy.attackEta <= 0.32) {
          threat = enemy;
          break;
        }
    } catch {
      threat = null;
    }
    if (threat) {
      ctx.time.slowMo(MASTERSTROKE_SLOWMO.scale, MASTERSTROKE_SLOWMO.seconds);
      this.masterT = MASTERSTROKE_WINDOW;
      this.masterTarget = threat.id;
      this.iframeT = Math.max(this.iframeT, 0.6);
      ctx.events.emit('combat:perfect-dodge', {
        position: st.position.clone(),
        enemyId: threat.id,
      });
      this.rig.punch(0.45);
      this.rumble(0.3, 0.8, 120);
    }
    return true;
  }
  stepDodge(dt, intent) {
    const cmb = this.ctrl.cmb;
    const def = DODGES[this.dodgeDir];
    this.dodgeT += dt;
    const progress = this.dodgeT / def.dur;
    if (progress >= 1) {
      this.dodgeT = -1;
      if (this.buffered) {
        this.buffered = false;
        this.tryStartAttack(intent);
      }
      return;
    }
    cmb.lockMove = cmb.noJump = true;
    cmb.noSprint = true;
    cmb.drive = true;
    const falloff =
      this.dodgeDir === 'forward' ? 1 - 0.65 * progress * progress : Math.max(0, 1 - progress * progress * 0.9);
    cmb.driveX = this.dodgeVel.x * falloff;
    cmb.driveZ = this.dodgeVel.y * falloff;
    const target = this.st.lockTargetId === null ? undefined : this.ctx.enemies.get(this.st.lockTargetId);
    if (target) {
      this.ctrl.faceTarget = yawOf(target.position.x - this.st.position.x, target.position.z - this.st.position.z);
      this.ctrl.faceRate = 10;
    }
  }
  damage(hit) {
    const ctx = this.ctx;
    const st = this.st;
    if (
      !hit ||
      st.dead ||
      this.respawning ||
      st.invulnerable ||
      this.itemGuard ||
      this.iframeT > 0 ||
      this.move === 'flurry' ||
      this.masterT > 0 ||
      (this.dodgeT >= 0 && this.dodgeT < DODGES[this.dodgeDir].iframes)
    )
      return false;
    if (Number(hit.amount) === 0) return this.shove(hit);
    const amount = Math.max(0.25, Math.ceil((Number(hit.amount) || 0.5) * 4 - 0.000001) / 4);
    st.health = Math.max(0, Math.round((st.health - amount) * 4) / 4);
    st.lastHurtTime = ctx.time.elapsed;
    if (this.move) this.endMove();
    this.cancelCharge();
    this.dodgeT = -1;
    this.buffered = false;
    const dir = this.v1.copy(hit.direction ?? this.v1.set(0, 0, 0));
    dir.y = 0;
    if (dir.lengthSq() < 0.000001) dir.set(-Math.sin(st.facing), 0, -Math.cos(st.facing));
    dir.normalize();
    const knock = clamp(Number(hit.knockback) || 5, 0, 16);
    const heavy = amount >= 1 || knock >= 10;
    st.facing = wrapAngle(yawOf(-dir.x, -dir.z));
    this.hurtT = 0;
    if (heavy && st.health > 0) {
      this.hurtDur = 1.25;
      this.ctrl.launch(dir.x * Math.min(knock, 10) * 0.48, 6, dir.z * Math.min(knock, 10) * 0.48);
    } else if (this.ctrl.currentMode === 'fly') {
      this.hurtDur = 0.3;
      this.hurtVel.set(0, 0);
      this.ctrl.flyKnock(dir.x * Math.min(knock, 8) * 0.9, 1.2, dir.z * Math.min(knock, 8) * 0.9);
    } else {
      this.hurtDur = 0.4;
      this.hurtVel.set(dir.x * Math.min(knock, 8), dir.z * Math.min(knock, 8));
    }
    this.iframeT = heavy ? 1.9 : 1.1;
    st.invulnerable = true;
    this.applySlow(hit);
    ctx.events.emit('player:hurt', {
      amount,
      health: st.health,
      position: st.position.clone(),
      source: String(hit.source ?? 'enemy'),
    });
    this.rig.addTrauma(0.35 + Math.min(0.4, amount * 0.25));
    this.rig.punch(-0.3);
    ctx.time.hitStop(heavy ? 0.09 : 0.06);
    this.rumble(0.9, 0.5, heavy ? 260 : 160);
    if (st.health <= 0) this.die();
    return true;
  }
  applySlow(hit) {
    const slow = Number(hit.slow);
    if (!Number.isFinite(slow) || slow <= 0) return;
    const currentMode = this.ctrl.currentMode;
    if (currentMode === 'fly' || currentMode === 'glide') return;
    const st = this.st;
    const elapsed = this.ctx.time.elapsed;
    st.slowedUntil = Math.max(st.slowedUntil, elapsed + Math.min(slow, 6));
  }
  shove(hit) {
    const st = this.st;
    const dir = this.v1.copy(hit.direction ?? this.v1.set(0, 0, 0));
    dir.y = 0;
    if (dir.lengthSq() < 0.000001) return false;
    dir.normalize();
    const knock = clamp(Number(hit.knockback) || 6, 0, 18);
    const currentMode = this.ctrl.currentMode;
    if (currentMode === 'fly') this.ctrl.flyKnock(dir.x * knock * 0.8, 0.8, dir.z * knock * 0.8);
    else if (currentMode === 'ground' || currentMode === 'slide') {
      if (knock >= 9) {
        if (this.move) this.endMove();
        this.cancelCharge();
        this.ctrl.launch(dir.x * knock * 0.5, 3 + knock * 0.1, dir.z * knock * 0.5);
        this.hurtT = 0;
        this.hurtDur = 0.22;
        this.hurtVel.set(dir.x * knock * 0.5, dir.z * knock * 0.5);
      } else {
        this.hurtT = 0;
        this.hurtDur = 0.32;
        this.hurtVel.set(dir.x * knock, dir.z * knock);
      }
    } else if (currentMode === 'air' || currentMode === 'glide') {
      const velocity = st.velocity;
      velocity.x += dir.x * knock * 0.7;
      velocity.z += dir.z * knock * 0.7;
    } else return false;
    this.applySlow(hit);
    this.rig.addTrauma(Math.min(0.3, knock * 0.02));
    try {
      this.ctx.audio?.play?.('wind-gust', {
        position: st.position,
      });
    } catch {}
    return true;
  }
  heal(amount) {
    const st = this.st;
    if (!Number.isFinite(amount) || amount <= 0 || st.dead) return;
    const prevHealth = st.health;
    st.health = Math.min(st.healthMax, Math.round((st.health + amount) * 4) / 4);
    this.ctx.events.emit('player:heal', {
      amount: st.health - prevHealth,
      health: st.health,
    });
  }
  die() {
    const st = this.st;
    const ctx = this.ctx;
    st.dead = true;
    st.health = 0;
    this.deathT = 0;
    this.hurtT = -1;
    this.setLock(null);
    this.masterT = 0;
    ctx.events.emit('player:death', {
      position: st.position.clone(),
    });
    ctx.time.slowMo(0.35, 1.1);
    this.rig.beat(2.2);
  }
  async respawnAfterDeath() {
    const ctx = this.ctx;
    const st = this.st;
    this.respawning = true;
    await this.safeFade(true);
    const pos = this.v3;
    let facing = Math.PI;
    const interiorFacing = this.interiorRespawn(pos);
    if (interiorFacing !== null) facing = interiorFacing;
    else if (!this.aerieRespawn(pos)) {
      const spawn = ctx.terrain?.landmarks?.spawn;
      if (spawn) pos.copy(spawn);
      else pos.copy(st.position);
      let bestDist = spawn ? Math.hypot(spawn.x - st.position.x, spawn.z - st.position.z) : 1000000000;
      for (const shrine of this.shrines) {
        const dist = Math.hypot(shrine.x - st.position.x, shrine.z - st.position.z);
        if (dist < bestDist) {
          bestDist = dist;
          pos.set(shrine.x + 2.5, shrine.y, shrine.z + 2.5);
        }
      }
      try {
        const groundY = ctx.terrain.heightAt(pos.x, pos.z);
        if (Number.isFinite(groundY)) pos.y = Math.max(groundY, waterLevel(ctx));
      } catch {}
    }
    pos.y += 0.08;
    this.onTeleport?.(pos, facing);
    st.dead = false;
    st.health = st.healthMax;
    st.stamina = st.staminaMax;
    st.exhausted = false;
    this.hurtT = -1;
    this.deathT = -1;
    this.iframeT = 2.5;
    ctx.events.emit('player:respawn', {
      position: pos.clone(),
    });
    await this.safeFade(false);
    this.respawning = false;
  }
  interiorRespawn(out) {
    try {
      const lastInterior = this.ctrl.lastInterior;
      if (!lastInterior) return null;
      const safePosition = this.ctrl.safePosition;
      const respawn = lastInterior.respawn;
      if (respawn && Number.isFinite(respawn.x + respawn.y + respawn.z)) {
        out.copy(respawn);
        return Number.isFinite(lastInterior.respawnFacing) ? lastInterior.respawnFacing : this.st.facing;
      }
      if (safePosition && lastInterior.bounds?.containsPoint(safePosition)) {
        out.copy(safePosition);
        return this.st.facing;
      }
    } catch {}
    return null;
  }
  aerieRespawn(out) {
    const ctx = this.ctx;
    const st = this.st;
    const sky = ctx.sky;
    if (!sky || sky.isStub) return false;
    try {
      const safePosition = this.ctrl.safePosition;
      if (!(sky.isOnSky(st.position, 30) || isOnSkyAt(ctx, st.position.x, st.position.z, st.position.y, 40)))
        return false;
      const spots = sky.spots ?? {};
      let spot = spots.landing ?? spots.start ?? spots.spawn;
      if (!spot && isOnSkyAt(ctx, safePosition.x, safePosition.z, safePosition.y, 0.5)) spot = safePosition;
      spot ??= sky.center;
      if (!spot || !Number.isFinite(spot.x + spot.y + spot.z)) {
        return false;
      } else {
        out.copy(spot);
        out.y = skySurfaceAt(ctx, out.x, out.z) ?? groundHeightAt(ctx, out.x, out.z, out.y + 1);
        return Number.isFinite(out.y);
      }
    } catch {
      return false;
    }
  }
  async safeFade(toBlack) {
    try {
      const pending = this.ctx.ui?.fade?.(toBlack, 0.8);
      if (pending && typeof pending.then == 'function')
        await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, 2500))]);
    } catch {}
  }
  wishDir(intent, out) {
    if (!intent) return out.set(0, 0, 0);
    const move = intent.move;
    const cameraYaw = this.ctrl.cameraYaw;
    const sinYaw = Math.sin(cameraYaw);
    const cosYaw = Math.cos(cameraYaw);
    out.set(sinYaw * move.y - cosYaw * move.x, 0, cosYaw * move.y + sinYaw * move.x);
    const len = out.length();
    if (len > 1) out.divideScalar(len);
    return out;
  }
  faceWhileBusy(intent, rate) {
    if (this.st.lockTargetId !== null) return;
    const dir = this.wishDir(intent, this.v2);
    if (dir.lengthSq() > 0.04) {
      this.ctrl.faceTarget = yawOf(dir.x, dir.z);
      this.ctrl.faceRate = rate;
    }
  }
  pickTarget(dir, range) {
    const ctx = this.ctx;
    const st = this.st;
    if (st.lockTargetId !== null) {
      const locked = ctx.enemies.get(st.lockTargetId);
      if (locked && locked.alive) return locked;
    }
    let dx = dir.x;
    let dz = dir.z;
    if (dx * dx + dz * dz < 0.01) {
      dx = Math.sin(st.facing);
      dz = Math.cos(st.facing);
    }
    const len = Math.hypot(dx, dz);
    dx /= len;
    dz /= len;
    let best = null;
    let bestScore = 1000000000;
    let candidates = [];
    try {
      candidates = ctx.enemies.query(st.position, range);
    } catch {
      candidates = [];
    }
    for (const enemy of candidates) {
      if (!enemy.alive) continue;
      const ox = enemy.position.x - st.position.x;
      const oz = enemy.position.z - st.position.z;
      const dist = Math.hypot(ox, oz);
      if (Math.abs(enemy.position.y - st.position.y) > 2.5) continue;
      const dot = dist > 0.001 ? (ox * dx + oz * dz) / dist : 1;
      const angle = Math.acos(clamp(dot, -1, 1));
      if (angle > 1.35 && dist > 1.2) continue;
      const score = dist - enemy.radius + angle * 1.6;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }
}
