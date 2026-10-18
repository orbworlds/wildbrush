/**
 * Combat animation layer: picks the hero's current action (attack, flurry, charge, dodge, hurt, knockdown, death, victory, item reveal), poses it from the tracks or procedurally, drives the brush stroke trail and the look toward threats, and blends it over the body.
 */
import { Color, MathUtils, Vector3 } from 'three';
import { COLORS, PALETTE } from '../core/config.js';
import { DODGES, FLURRY, flurryStroke, ITEM_HOLD, MOVES } from '../shared/combat-defs.js';
import {
  actionEase,
  ActionPose,
  BODY_KEY_CHANNELS,
  BODY_KEY_COUNT,
  CHARGE_POSE,
  GUARD_POSE,
  JUMP_SLASH_LAND,
  JUMP_SLASH_TRACK,
  sampleActionTrack,
  SLASH1_TRACK,
  SLASH2_TRACK,
  SLASH3_TRACK,
  SPIN_TRACK,
  SQUASH_SLOT,
} from './action-poses.js';
import { clamp01, envelope, smoothStep } from './anim-math.js';
import { ARM_CH, armBase, BODY_CH, legBase } from './pose-channels.js';
const STROKE_KEYS = {
  slash1: 1,
  slash2: 2,
  slash3: 3,
  spin: 4,
  jumpSlash: 5,
  flurry: 6,
};
const ATTACK_TRACKS = {
  slash1: SLASH1_TRACK,
  slash2: SLASH2_TRACK,
  slash3: SLASH3_TRACK,
  spin: SPIN_TRACK,
  jumpSlash: JUMP_SLASH_TRACK,
};
const FLURRY_STROKES = [
  [-1.9, 0.5, 1.9, -0.3],
  [2, -0.4, -1.8, 0.6],
  [0.3, 2.3, 0.1, -0.6],
  [-1.5, -0.55, 1.2, 1.1],
  [1.6, 0.9, -1.6, -0.45],
  [-2.1, 0.12, 2.1, 0.22],
  [1.8, -0.2, -1.2, 1.3],
  [-0.2, 2.2, 0.2, -0.65],
];
const TWO_HAND_GAP = 0.27;
const FLIGHT_HAND_GAP = 0.56;
const _scratchPose = new ActionPose();
const _gripTarget = new Vector3();
const wrapAngle = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
export class CombatAnimator {
  ctx;
  stanceW = 0;
  actW = 0;
  legW = 0;
  snap = 0;
  wantBrush = false;
  brushW = 0;
  rootYaw = 0;
  rootPitch = 0;
  rootRoll = 0;
  rootLift = 0;
  pivotY = 0.85;
  glow = 0;
  flashColor = new Color();
  flash = 0;
  strokeLive = false;
  strokeId = 0;
  strokeColor = new Color();
  strokeWidth = 1;
  strokeRainbow = false;
  twoGap = TWO_HAND_GAP;
  itemW = 0;
  itemKind = null;
  itemT = 0;
  frame = new ActionPose();
  impactT = -1;
  action = null;
  actT = 0;
  act = new ActionPose();
  stance = new ActionPose();
  lastAction = null;
  lastMove = null;
  lastAtkT = 0;
  lastStrokeKey = -1;
  threatT = 0;
  threatId = -1;
  calmT = 99;
  victoryT = -1;
  hurtAmount = 0;
  hurtAt = -1;
  knock = false;
  tremble = 0;
  perfectT = -1;
  flurryOn = false;
  deadT = -1;
  lookDir = new Vector3();
  lookYaw = 0;
  hasLook = false;
  constructor(ctx) {
    this.ctx = ctx;
    this.stance.copy(GUARD_POSE);
    this.frame.copy(GUARD_POSE);
    ctx.events.on('player:hurt', ({ amount }) => {
      this.hurtAmount = amount;
      this.hurtAt = ctx.time.elapsed;
      this.knock = amount >= 1;
    });
    ctx.events.on('combat:perfect-dodge', () => {
      this.perfectT = ctx.time.elapsed;
    });
    ctx.events.on('combat:flurry', ({ active }) => {
      this.flurryOn = active;
    });
    ctx.events.on('combat:hit', ({ killed }) => {
      if (killed) this.pendingVictory = 0.4;
    });
    ctx.events.on('player:respawn', () => {
      this.deadT = -1;
      this.victoryT = -1;
      this.hurtAt = -1;
      this.knock = false;
    });
  }
  pendingVictory = 0;
  get s() {
    return this.ctx.player.state;
  }
  aimDy = 0;
  updateLook(yaw) {
    const state = this.s;
    this.hasLook = false;
    let target = state.lockTargetId === null ? undefined : this.ctx.enemies.get(state.lockTargetId);
    if (!target && (this.stanceW > 0.05 || state.attack)) {
      this.threatT -= this.ctx.time.dt;
      if (this.threatT <= 0) {
        this.threatT = 0.2;
        this.threatId = -1;
        try {
          for (const enemy of this.ctx.enemies.query(state.position, 12))
            if (enemy.alerted) {
              this.threatId = enemy.id;
              break;
            }
        } catch {
          this.threatId = -1;
        }
      }
      target = this.threatId >= 0 ? this.ctx.enemies.get(this.threatId) : undefined;
      if (target && !target.alive) target = undefined;
    }
    let dy = 0;
    if (target && target.position.distanceTo(state.position) < 5)
      dy = target.position.y + target.height * 0.5 - (state.position.y + 1.15);
    this.aimDy += (MathUtils.clamp(dy, -0.9, 0.6) - this.aimDy) * 0.2;
    if (
      target &&
      (this.lookDir.set(target.position.x - state.position.x, 0, target.position.z - state.position.z),
      this.lookDir.lengthSq() > 0.04)
    ) {
      let rel = Math.atan2(this.lookDir.x, this.lookDir.z) - yaw;
      rel = ((((rel + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
      this.lookYaw += (MathUtils.clamp(rel, -1.3, 1.3) - this.lookYaw) * 0.25;
      this.hasLook = true;
    }
    if (!this.hasLook) this.lookYaw *= 0.9;
  }
  update(dt, now, yaw, grounded) {
    const state = this.s;
    const ctx = this.ctx;
    const damp = (rate) => 1 - Math.exp(-rate * dt);
    this.updateLook(yaw);
    let alerted = 0;
    try {
      alerted = ctx.enemies.alertedCount;
    } catch {
      alerted = 0;
    }
    const sinceAttack = state.lastAttackTime >= 0 ? now - state.lastAttackTime : 99;
    const inCombat =
      state.lockTargetId !== null ||
      (alerted > 0 && this.hasLook) ||
      sinceAttack < 3 ||
      state.charge > 0 ||
      !!state.attack;
    this.calmT = inCombat ? 0 : this.calmT + dt;
    if (this.pendingVictory > 0) {
      this.pendingVictory -= dt;
      if (alerted === 0 && !state.dead) {
        this.pendingVictory = 0;
        this.victoryT = now + 0.35;
      }
    }
    let action = null;
    let actT = 0;
    const sinceHurt = this.hurtAt >= 0 ? now - this.hurtAt : 99;
    const sinceDodge = state.lastDodgeTime >= 0 ? now - state.lastDodgeTime : 99;
    const dodge = DODGES[state.dodgeDir] ?? DODGES.back;
    const itemHold = state.itemHold;
    if (state.dead) {
      if (this.deadT < 0) this.deadT = now;
      action = 'death';
      actT = now - this.deadT;
    } else if (itemHold && Number.isFinite(itemHold.t)) {
      action = 'item';
      actT = itemHold.t;
      this.victoryT = -1;
      this.pendingVictory = 0;
    } else if (this.knock && sinceHurt < 1.25) {
      action = 'knockdown';
      actT = sinceHurt;
    } else if (!this.knock && sinceHurt < 0.42) {
      action = 'hurt';
      actT = sinceHurt;
    } else if (state.attack) {
      action = 'attack';
      actT = state.attack.t;
    } else if (sinceDodge < dodge.dur) {
      action = 'dodge';
      actT = sinceDodge;
    } else if (state.charge > 0) {
      action = 'charge';
      actT = state.charge;
    } else if (this.victoryT >= 0 && now >= this.victoryT && now - this.victoryT < 1.9 && grounded) {
      action = 'victory';
      actT = now - this.victoryT;
    }
    if (!state.dead) this.deadT = -1;
    if (state.mode === 'fly' && action !== 'death' && action !== 'item') {
      action = null;
      this.victoryT = -1;
    }
    if (state.attack && state.attack.move !== this.lastMove) this.victoryT = -1;
    if (action === 'victory' && (state.speed > 0.6 || state.aiming)) {
      this.victoryT = -1;
      action = null;
    }
    this.action = action;
    this.actT = actT;
    const act = this.act;
    let legTarget = 0;
    let snapTarget = 0;
    this.rootPitch = 0;
    this.rootRoll = 0;
    this.pivotY = 0.85;
    this.glow = Math.max(0, this.glow - dt * 3);
    this.strokeLive = false;
    switch (action) {
      case 'attack': {
        const move = state.attack.move;
        if (move === 'flurry') this.flurryFrame(act, actT);
        else sampleActionTrack(ATTACK_TRACKS[move], actT, act);
        if (move === 'slash1' || move === 'slash2' || move === 'spin' || move === 'flurry') {
          const aimPitch = MathUtils.clamp(this.aimDy * 0.6, -0.5, 0.22);
          act.bp += aimPitch;
          act.g.y += MathUtils.clamp(this.aimDy * 0.18, -0.1, 0.04);
          act.body[6] += Math.max(0, -aimPitch) * 0.35;
          act.body[1] += Math.min(0, aimPitch) * 0.12;
        }
        const def = MOVES[move];
        legTarget = move === 'jumpSlash' ? +(actT >= JUMP_SLASH_LAND) : 1;
        if (move === 'spin' || move === 'jumpSlash') legTarget *= move === 'spin' ? 0.9 : 1;
        snapTarget = actT < def.activeEnd + 0.08 ? 1 : 0.4;
        this.strokeFor(move, actT);
        if (def.impact > 0 && actT >= def.impact && this.lastAtkT < def.impact && move !== 'flurry') this.impactT = now;
        this.lastAtkT = actT;
        break;
      }
      case 'charge': {
        act.copy(CHARGE_POSE);
        this.tremble = actT;
        const shake = actT * actT * 0.03 + (actT >= 1 ? 0.012 : 0);
        const phase = now * 61;
        act.body[1] += Math.sin(phase) * shake * 0.5 - 0.03 * actT;
        act.body[10] += Math.sin(phase * 1.3 + 1) * shake;
        act.body[6] += Math.sin(phase * 0.9 + 2) * shake;
        act.by += Math.sin(phase * 1.1) * shake * 1.5;
        act.bp += Math.sin(phase * 0.8 + 0.7) * shake;
        this.glow = Math.max(
          this.glow,
          0.25 + 0.75 * actT * actT + (actT >= 1 ? 0.35 * (0.5 + 0.5 * Math.sin(now * 18)) : 0),
        );
        legTarget = 1;
        snapTarget = 0.3;
        break;
      }
      case 'dodge':
        this.dodgeFrame(act, actT, state.dodgeDir, dodge.dur);
        legTarget = 0;
        snapTarget = 0.6;
        break;
      case 'hurt':
        this.hurtFrame(act, actT);
        snapTarget = 1;
        break;
      case 'knockdown':
        this.knockFrame(act, actT);
        snapTarget = 0.7;
        break;
      case 'death':
        this.deathFrame(act, actT);
        snapTarget = 0.3;
        break;
      case 'victory':
        this.victoryFrame(act, actT, now);
        legTarget = 0;
        break;
      case 'item':
        this.itemFrame(act, actT, itemHold.item);
        legTarget = 1;
        snapTarget = 0.5;
    }
    const holding = action === 'item';
    this.itemKind = holding ? itemHold.item : this.itemW > 0.01 ? this.itemKind : null;
    this.itemT = holding ? actT : this.itemT;
    let itemTarget = 0;
    if (holding)
      itemTarget =
        smoothStep(0.16, ITEM_HOLD.raise, actT) * (1 - smoothStep(ITEM_HOLD.lower, ITEM_HOLD.dur - 0.05, actT));
    this.itemW += (itemTarget - this.itemW) * damp(itemTarget > this.itemW ? 30 : 10);
    const gapTarget =
      holding && itemHold.item === 'chromaBrush'
        ? 0.3
        : holding && itemHold.item === 'brushflight'
          ? FLIGHT_HAND_GAP
          : TWO_HAND_GAP;
    this.twoGap += (gapTarget - this.twoGap) * damp(12);
    if (action !== this.lastAction || (state.attack && state.attack.move !== this.lastMove)) {
      this.lastAction = action;
      this.lastMove = state.attack ? state.attack.move : null;
      if (state.attack) this.lastAtkT = 0;
    }
    const stance = this.stance.copy(GUARD_POSE);
    const breath = Math.sin(now * 2.4);
    stance.body[1] += 0.008 * breath;
    stance.body[9] += -0.015 * breath;
    stance.by += 0.03 * Math.sin(now * 1.3);
    stance.bp += 0.025 * Math.sin(now * 1.7 + 1);
    if (this.hasLook) {
      stance.body[15] += this.lookYaw * 0.5;
      stance.body[13] += this.lookYaw * 0.2;
      stance.body[10] += this.lookYaw * 0.15;
    }
    if (state.speed > 0.4 && grounded) {
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const sideVel = state.velocity.x * cos - state.velocity.z * sin;
      const fwdVel = state.velocity.x * sin + state.velocity.z * cos;
      stance.body[8] += MathUtils.clamp(-sideVel * 0.03, -0.12, 0.12);
      stance.body[6] += MathUtils.clamp(fwdVel * 0.02, -0.08, 0.1);
      stance.body[1] += -0.03;
    }
    const engaged = inCombat || this.calmT < 3 || action !== null;
    this.wantBrush = engaged && !state.dead;
    if (holding) this.wantBrush = itemHold.item === 'chromaBrush' || itemHold.item === 'brushflight';
    this.stanceW +=
      ((inCombat && (grounded || state.mode === 'air') && !state.aiming ? 1 : 0) - this.stanceW) *
      damp(inCombat ? 7 : 2.5);
    const actTarget = action !== null && action !== 'victory' ? 1 : +(action === 'victory');
    const actRate = action === 'attack' || action === 'hurt' || action === 'dodge' ? 26 : action === null ? 7 : 12;
    this.actW += (actTarget - this.actW) * damp(actRate);
    this.legW += (legTarget * actTarget - this.legW) * damp(legTarget ? 22 : 8);
    this.snap += (snapTarget - this.snap) * damp(20);
    const brushTarget = state.aiming ? 0 : action === 'death' ? 1 : Math.max(this.stanceW, actTarget);
    this.brushW += (brushTarget - this.brushW) * damp(brushTarget > this.brushW ? 30 : 5);
    const frame = this.frame.copy(stance);
    const actW = Math.min(1, this.actW);
    if (actW > 0.001) frame.lerp(act, actW);
    this.rootYaw = wrapAngle(act.spin) * actW;
    this.rootPitch = wrapAngle(act.pitch) * actW;
    this.rootLift = act.lift * actW;
    this.flash = 0;
    if (sinceHurt < 0.25) {
      this.flashColor.setRGB(1, 0.25, 0.2);
      this.flash = 0.75 * (1 - sinceHurt / 0.25);
    } else if (state.invulnerable && !state.dead && sinceHurt < 2.2) {
      this.flashColor.setRGB(1, 1, 1);
      this.flash = Math.sin(now * 34) > 0.3 ? 0.16 : 0;
    }
    const sincePerfect = this.perfectT >= 0 ? now - this.perfectT : 99;
    if (sincePerfect < 0.5) {
      this.flashColor.setRGB(1, 1, 1);
      this.flash = Math.max(this.flash, 0.85 * (1 - sincePerfect / 0.5));
    }
    if (state.attack?.move === 'flurry') this.glow = Math.max(this.glow, 0.8);
  }
  strokeFor(move, t) {
    const state = this.s;
    const def = MOVES[move];
    let live = false;
    let key = STROKE_KEYS[move] ?? 0;
    let color = state.selectedColor;
    let width = 1;
    if (move === 'flurry') {
      const stroke = flurryStroke(t);
      if (stroke >= 0 && stroke < FLURRY.count) {
        const u = (t - FLURRY.first - stroke * FLURRY.stroke) / FLURRY.stroke;
        live = u > 0.22 && u < 0.95;
        key = 100 + stroke;
        color = COLORS[stroke % 4];
        width = 0.8;
      } else if (stroke === FLURRY.count) {
        live = t > FLURRY.finisher + 0.045 && t < FLURRY.finisher + 0.16;
        key = 200;
        width = 1.35;
      }
    } else if (move === 'jumpSlash') {
      live = (t > 0.13 && t < 0.34) || (t >= JUMP_SLASH_LAND && t < JUMP_SLASH_LAND + 0.07);
      key = t >= JUMP_SLASH_LAND ? 301 : 300;
      width = 1.2;
    } else if (move === 'spin') {
      live = t > 0.03 && t < 0.5;
      width = 1.15;
    } else if (move === 'slash3') {
      live = t > 0.27 && t < 0.42;
      width = 1.3;
    } else live = t > def.activeStart - 0.012 && t < def.activeEnd + 0.07;
    const ink = this.ctx.paint?.ink?.[state.selectedColor] ?? 100;
    const chroma = state.brush === 'chroma';
    this.strokeRainbow = chroma;
    if (live) {
      if (key !== this.lastStrokeKey) {
        this.lastStrokeKey = key;
        this.strokeId++;
      }
      if (move !== 'flurry' || key === 200) color = ink >= 1 || chroma ? state.selectedColor : null;
      if (color) this.strokeColor.setHex(PALETTE[color].hex);
      else this.strokeColor.setRGB(0.05, 0.055, 0.08);
      this.strokeWidth = width;
    }
    this.strokeLive = live;
  }
  flurryFrame(pose, t) {
    this.ctx.time.elapsed;
    pose.copy(GUARD_POSE);
    pose.two = 0;
    const body = pose.body;
    const stroke = flurryStroke(t);
    if (stroke < 0) {
      const dash = clamp01(t / FLURRY.dash);
      pose.by = -2.8;
      pose.bp = -0.1;
      pose.g.set(-0.3, -0.1, -0.08);
      body[6] = 0.45 * dash + 0.1;
      body[3] = 0.2;
      body[1] = -0.14;
      body[10] = -0.5;
      body[15] = 0.45;
      pose.aL.set(-0.7, 0.6, 0.3);
      pose.fL.set(0.12, 0.25, 0.1);
      pose.fR.set(-0.12, -0.3, 0.12);
      return;
    }
    if (stroke < FLURRY.count) {
      const u = clamp01((t - (FLURRY.first + stroke * FLURRY.stroke)) / FLURRY.stroke);
      const cur = FLURRY_STROKES[stroke];
      const prev = FLURRY_STROKES[(stroke + FLURRY_STROKES.length - 1) % FLURRY_STROKES.length];
      let yaw;
      let pitch;
      if (u < 0.22) {
        const k = actionEase('io', u / 0.22);
        yaw = (stroke === 0 ? -2.8 : prev[2]) + (cur[0] - (stroke === 0 ? -2.8 : prev[2])) * k;
        pitch = (stroke === 0 ? -0.1 : prev[3]) + (cur[1] - (stroke === 0 ? -0.1 : prev[3])) * k;
      } else {
        const k = actionEase('whip', clamp01((u - 0.22) / 0.62));
        yaw = cur[0] + (cur[2] - cur[0]) * k;
        pitch = cur[1] + (cur[3] - cur[1]) * k;
      }
      pose.by = yaw;
      pose.bp = pitch;
      const sinYaw = Math.sin(yaw);
      pose.g.set(
        -0.12 + sinYaw * 0.18,
        -0.08 + Math.min(0.3, Math.max(-0.2, Math.sin(Math.min(pitch, 1.4)) * 0.2)),
        0.18,
      );
      body[10] = MathUtils.clamp(yaw * 0.32, -0.7, 0.7);
      body[7] = body[10] * 0.5;
      body[4] = body[10] * 0.4;
      body[15] = -body[10] * 0.6;
      body[1] = -0.14 + 0.03 * Math.sin(u * Math.PI);
      body[6] = 0.2 + (pitch < 0 ? 0.15 : -0.05);
      body[9] = pitch < 0 ? 0.12 : -0.1;
      body[11] = -sinYaw * 0.12;
      body[SQUASH_SLOT] = 1 + 0.04 * Math.sin(u * Math.PI * 2);
      pose.aL.set(-0.3 + sinYaw * 0.6, 1, 0.4);
      pose.fL.set(0.16, 0.2, 0);
      pose.fR.set(-0.15, -0.2, 0);
      pose.lift = 0.05 * Math.sin(u * Math.PI) * (stroke % 2);
      return;
    }
    const fin = t - FLURRY.finisher;
    if (fin < 0.05) {
      const k = actionEase('out', fin / 0.05);
      pose.by = -2.7;
      pose.bp = 0.1;
      pose.g.set(-0.3, -0.12, -0.05);
      body[10] = -0.7 * k;
      body[1] = -0.2 * k;
      pose.aL.set(1.1, 0.4, 0.2);
      pose.fL.set(0.2, 0.22, 0);
      pose.fR.set(-0.17, -0.2, 0);
      return;
    }
    const spinU = actionEase('whip', clamp01((fin - 0.05) / 0.13));
    pose.spin = Math.PI * 2 * spinU;
    pose.by = -1.8 + 0.4 * spinU;
    pose.bp = 0.05 - 0.15 * spinU;
    pose.g.set(-0.36, -0.06, 0.08);
    body[1] = -0.16 - 0.08 * spinU;
    body[6] = 0.2;
    body[10] = 0.35;
    body[15] = 0.2;
    pose.aL.set(0.2, 1.4, 0.1);
    pose.fL.set(0.2, 0.18, 0);
    pose.fR.set(-0.18, -0.18, 0);
    if (fin > 0.2) {
      const hold = smoothStep(0.2, 0.3, fin) * (1 - smoothStep(0.42, 0.56, fin));
      pose.by += (-1.3 - pose.by) * hold;
      pose.bp += (-0.25 - pose.bp) * hold;
      body[1] += -0.08 * hold;
      body[15] += 0.2 * hold;
      const settle = smoothStep(0.42, 0.56, fin);
      pose.lerp(GUARD_POSE, settle);
      pose.spin = Math.PI * 2 * (1 - settle) + Math.PI * 2 * settle;
    }
  }
  dodgeFrame(pose, t, dir, dur) {
    pose.copy(GUARD_POSE);
    const u = clamp01(t / dur);
    const arc = Math.sin(Math.PI * u) ** 0.7;
    const body = pose.body;
    if (dir === 'back') {
      pose.pitch = -Math.PI * 2 * actionEase('io', clamp01((u - 0.04) / 0.86));
      body[6] = 0.45 * arc;
      body[9] = 0.25 * arc;
      body[14] = 0.3 * arc;
      body[1] = -0.05 * arc;
      pose.bp = 1.4;
      pose.by = 0.1;
      pose.g.set(-0.05, -0.05, 0.12);
      this.pivotY = 0.85;
    } else if (dir === 'forward') {
      pose.pitch = Math.PI * 2 * actionEase('io', clamp01((u - 0.05) / 0.85));
      body[1] = -0.28 * arc;
      body[6] = 0.6 * arc;
      body[9] = 0.35 * arc;
      body[14] = 0.45 * arc;
      pose.bp = 1.5;
      pose.by = 0;
      pose.g.set(-0.06, -0.06, 0.1);
      this.pivotY = 0.46;
    } else {
      const side = dir === 'left' ? 1 : -1;
      body[8] = -side * 0.22 * arc;
      body[5] = -side * 0.12 * arc;
      body[11] = -side * 0.08 * arc;
      body[16] = side * 0.12 * arc;
      body[1] = -0.04 * arc;
      pose.by += side * 0.25 * arc;
    }
  }
  hurtFrame(pose, t) {
    pose.copy(GUARD_POSE);
    pose.two = 0;
    const hit = envelope(t, 0.04, 0.08, 0.3);
    const body = pose.body;
    body[6] = -0.32 * hit;
    body[9] = -0.22 * hit;
    body[14] = -0.35 * hit;
    body[2] = -0.06 * hit;
    body[1] = -0.06 * hit;
    body[11] = 0.1 * hit;
    body[SQUASH_SLOT] = 1 - 0.1 * Math.sin(Math.PI * clamp01(t / 0.18));
    pose.by = 0.9;
    pose.bp = 0.9 + 0.3 * hit;
    pose.g.set(-0.2, -0.05, 0.08);
    pose.aL.set(-0.4 * hit + 0.3, 0.9 * hit + 0.3, 0.3);
  }
  knockFrame(pose, t) {
    pose.copy(GUARD_POSE);
    pose.two = 0;
    const body = pose.body;
    const fall = smoothStep(0.06, 0.5, t);
    const getUp = smoothStep(0.8, 1.2, t);
    const down = fall * (1 - getUp);
    pose.pitch = -1.45 * down + -0.3 * smoothStep(0.7, 0.9, t) * (1 - getUp);
    this.pivotY = 0.15;
    body[6] = -0.2 * fall * (1 - getUp) + 0.35 * smoothStep(0.75, 0.95, t) * (1 - getUp);
    body[14] = 0.3 * down;
    body[1] = -0.1 * down - 0.3 * smoothStep(0.8, 0.95, t) * (1 - smoothStep(1, 1.25, t));
    body[SQUASH_SLOT] = 1 - 0.12 * Math.sin(Math.PI * clamp01((t - 0.5) / 0.15)) * (t > 0.5 && t < 0.65);
    pose.aL.set(0.8 * down + 0.2, 0.9 * down + 0.3, 0.4);
    pose.fL.set(0.14, 0.15, 0);
    pose.fR.set(-0.14, -0.1, 0);
    pose.by = 0.6;
    pose.bp = 0.2 + 0.8 * (1 - down);
    pose.g.set(-0.25, -0.1, 0.05);
  }
  deathFrame(pose, t) {
    pose.copy(GUARD_POSE);
    pose.two = 0;
    const body = pose.body;
    const hit = envelope(t, 0.05, 0.15, 0.3);
    const sag = smoothStep(0.25, 0.8, t);
    const fall = smoothStep(0.85, 1.35, t);
    body[6] = -0.3 * hit + 0.55 * sag * (1 - fall * 0.6);
    body[9] = 0.25 * sag;
    body[14] = -0.3 * hit + 0.4 * sag;
    body[1] = -0.45 * sag * (1 - fall * 0.7);
    body[3] = 0.25 * sag;
    body[11] = 0.1 * sag;
    pose.pitch = 1.48 * actionEase('in', fall);
    this.pivotY = 0.12;
    body[SQUASH_SLOT] = 1 - 0.1 * (t > 1.3 && t < 1.45 ? Math.sin((Math.PI * (t - 1.3)) / 0.15) : 0);
    pose.aL.set(0.4 * sag + 2.4 * fall, 0.35, 0.5 - 0.3 * fall);
    pose.fL.set(0.12, 0.25 * sag, 0);
    pose.fR.set(-0.12, -0.25 * sag, 0);
    pose.by = 0.25 - 0.1 * fall;
    pose.bp = 0.3 - 0.75 * sag + 1.8 * fall;
    pose.g.set(-0.24, -0.2 + 0.45 * fall, 0.12 + 0.05 * fall);
  }
  victoryFrame(pose, t, now) {
    pose.copy(GUARD_POSE);
    const body = pose.body;
    const cheer = envelope(t, 0.15, 1.4, 0.35);
    body[1] = 0.02 * cheer;
    body[6] = -0.06 * cheer;
    body[9] = -0.08 * cheer;
    body[10] = -0.1 * cheer;
    body[14] = -0.1 * cheer;
    const twirl = smoothStep(0.15, 0.3, t) * (1 - smoothStep(1, 1.12, t));
    const twirlPhase = (t - 0.15) * 17;
    pose.two = 1 - Math.max(twirl, smoothStep(1, 1.1, t) * (1 - smoothStep(1.6, 1.85, t)));
    const twirlYaw = Math.atan2(Math.sin(twirlPhase), 0.25);
    const twirlPitch = Math.cos(twirlPhase) * 1.2;
    pose.by += (twirlYaw - pose.by) * twirl;
    pose.bp += (twirlPitch - pose.bp) * twirl;
    pose.g.lerp(_scratchPose.g.set(-0.14, -0.05, 0.26), twirl);
    const shoulder = smoothStep(1, 1.12, t) * (1 - smoothStep(1.6, 1.85, t));
    pose.by += (-1.1 - pose.by) * shoulder;
    pose.bp += (1.25 - pose.bp) * shoulder;
    pose.g.lerp(_scratchPose.g.set(-0.3, -0.15, 0.12), shoulder);
    body[15] += 0.25 * shoulder;
    body[10] += 0.15 * shoulder;
    pose.aL.set(0.2 * shoulder, 0.55 * shoulder + 0.3, 1.6 * shoulder + 0.4);
  }
  itemFrame(pose, t, item) {
    pose.copy(GUARD_POSE);
    const body = pose.body;
    const hold = ITEM_HOLD;
    const isBrush = item === 'chromaBrush' || item === 'brushflight';
    const isFlight = item === 'brushflight';
    const turn = clamp01(t / hold.turn);
    pose.lift = 0.08 * Math.sin(Math.PI * turn) * (t < hold.turn);
    const crouch = smoothStep(0.12, hold.raise - 0.04, t) * (1 - smoothStep(hold.raise - 0.04, hold.raise + 0.05, t));
    const raise =
      smoothStep(hold.raise - 0.06, hold.raise + 0.08, t) * (1 - smoothStep(hold.lower, hold.dur - 0.08, t));
    const sinceRaise = Math.max(0, t - hold.raise);
    const bounce = t > hold.raise ? Math.exp(-5.5 * sinceRaise) * Math.sin(19 * sinceRaise) : 0;
    const sway = Math.sin(t * 2.6) * raise;
    body[0] = 0;
    body[1] = -0.11 * crouch + (0.035 + 0.012 * sway) * raise + 0.05 * bounce * raise;
    body[2] = 0;
    body[3] = 0.12 * crouch - 0.06 * raise;
    body[4] = 0;
    body[5] = 0.02 * Math.sin(t * 1.7) * raise;
    body[6] = 0.22 * crouch - 0.1 * raise;
    body[7] = 0;
    body[8] = 0;
    body[9] = 0.1 * crouch - 0.17 * raise - 0.04 * bounce * raise;
    body[10] = 0;
    body[11] = 0.03 * Math.sin(t * 1.3) * raise;
    body[12] = -0.03 * raise;
    body[13] = 0;
    body[14] = 0.12 * crouch - (isBrush ? 0.2 : 0.14) * raise;
    body[15] = 0;
    body[16] = 0.06 * Math.sin(t * 1.1 + 0.5) * raise;
    body[SQUASH_SLOT] = 1 - 0.1 * crouch + 0.09 * bounce * raise + 0.01 * sway;
    pose.fL.set(0.15, 0.05, 0);
    pose.fR.set(-0.15, -0.03, 0);
    pose.aL.set(0.3 - 0.4 * crouch + 2.9 * raise, 0.3 + 0.2 * raise, 0.6 - 0.4 * raise);
    if (isFlight) {
      pose.two = 1;
      const gripFrom = _scratchPose.g.set(-0.06, -0.12, 0.2);
      const bob = 0.025 * Math.sin(t * 3.1) * raise;
      pose.by = 0.35 * (1 - raise) + (Math.PI / 2 - 0.08) * raise;
      pose.bp = 0.5 * (1 - raise) + (0.06 + 0.03 * Math.sin(t * 2.2)) * raise + 0.06 * bounce * raise;
      pose.g.copy(gripFrom).lerp(_gripTarget.set(-0.34, 0.47 + 0.03 * bounce + bob, 0.1), raise);
      body[6] = 0.22 * crouch - 0.05 * raise;
      body[9] = 0.1 * crouch - 0.1 * raise - 0.03 * bounce * raise;
      body[14] = 0.12 * crouch - 0.18 * raise;
      body[16] = 0.12 * raise + 0.06 * Math.sin(t * 1.1 + 0.5) * raise;
    } else if (isBrush) {
      pose.two = 1;
      const gripFrom = _scratchPose.g.set(-0.06, -0.12, 0.2);
      pose.by = 0.35 * (1 - raise) + 1.4 * raise + 0.04 * Math.sin(t * 1.4) * raise;
      pose.bp = 0.5 * (1 - raise) + 0.3 * raise + 0.08 * bounce * raise;
      pose.g.copy(gripFrom).lerp(_gripTarget.set(-0.22, 0.5 + 0.03 * bounce, 0.07), raise);
      body[6] = 0.22 * crouch - 0.03 * raise;
      body[9] = 0.1 * crouch - 0.07 * raise - 0.03 * bounce * raise;
    } else pose.two = 0;
    const lower = smoothStep(hold.lower + 0.15, hold.dur, t);
    if (lower > 0) pose.lerp(GUARD_POSE, lower);
  }
  overlay(target, rest) {
    const frame = this.frame;
    const actW = Math.min(1, this.actW);
    const stanceW = this.stanceW * (1 - actW);
    if (stanceW > 0.001) {
      for (let i = 0; i < BODY_KEY_COUNT; i++) {
        const ch = BODY_KEY_CHANNELS[i];
        const value = this.stance.body[i];
        target[ch] += (i === SQUASH_SLOT ? value - 1 : value) * stanceW;
      }
      const arm = armBase(1);
      target[arm + ARM_CH.swing] += (0.5 - target[arm + ARM_CH.swing]) * stanceW * 0.5;
    }
    if (actW > 0.001) {
      for (let i = 0; i < BODY_KEY_COUNT; i++) {
        const ch = BODY_KEY_CHANNELS[i];
        target[ch] += (rest[ch] + (i === SQUASH_SLOT ? frame.body[i] - 1 : frame.body[i]) - target[ch]) * actW;
      }
      const arm = armBase(1);
      const armW = actW * (1 - frame.two);
      target[arm + ARM_CH.swing] += (frame.aL.x - target[arm + ARM_CH.swing]) * armW;
      target[arm + ARM_CH.abd] += (frame.aL.y - target[arm + ARM_CH.abd]) * armW;
      target[arm + ARM_CH.elbow] += (frame.aL.z - target[arm + ARM_CH.elbow]) * armW;
      target[arm + ARM_CH.twist] += (0 - target[arm + ARM_CH.twist]) * armW;
      target[arm + ARM_CH.ik] *= 1 - armW;
      const legW = Math.min(1, this.legW);
      for (const side of [1, -1]) {
        const leg = legBase(side);
        target[leg + 7] *= 1 - legW;
      }
    }
    if (this.hasLook) target[BODY_CH.hdYaw] += this.lookYaw * 0.25 * (stanceW + actW * 0.3);
  }
}
