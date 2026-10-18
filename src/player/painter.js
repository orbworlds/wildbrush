/**
 * Painting with the brush: switches the selected colour, turns the hero toward the aim point, flicks ink blobs along the paint system's launch arc (leading the shot while flying), pours a stream of ink during brushflight and casts the aim ray behind the reticle.
 */
import { Vector3 } from 'three';
import { COLLISION_GROUPS, COLORS } from '../core/config.js';
import { yawOf } from './controller.js';
import { makeHit, Probes } from './probes.js';
import { TUNING } from './tuning.js';
export class Painter {
  ctx;
  ctrl;
  rig;
  flickCd = 0;
  flickTurnT = 0;
  flickYaw = 0;
  wheelOpen = false;
  arts = null;
  probes;
  hit = makeHit();
  origin = new Vector3();
  velocity = new Vector3();
  dir = new Vector3();
  start = new Vector3();
  chest = new Vector3();
  lead = new Vector3();
  constructor(ctx, ctrl, rig) {
    this.ctx = ctx;
    this.ctrl = ctrl;
    this.rig = rig;
    this.probes = new Probes(ctx);
    this.probes.exclude = ctrl.collider;
    ctx.events.on('ui:select-color', ({ color }) => this.select(color));
    ctx.events.on('ui:wheel', ({ open: isOpen }) => {
      this.wheelOpen = isOpen;
    });
    const color = ctx.params.get('color');
    if (color && COLORS.includes(color)) ctrl.state.selectedColor = color;
  }
  get isWheelOpen() {
    return this.wheelOpen;
  }
  select(color) {
    const state = this.ctrl.state;
    if (COLORS.includes(color) && state.selectedColor !== color) {
      state.selectedColor = color;
      this.ctx.events.emit('player:color', {
        color,
      });
      this.ctrl.log(`color ${color}`);
    }
  }
  preUpdate(dt, intent, input, hasControl) {
    const state = this.ctrl.state;
    if (hasControl) {
      const current = COLORS.indexOf(state.selectedColor);
      if (input.pressed('color1')) this.select(COLORS[0]);
      else if (input.pressed('color2')) this.select(COLORS[1]);
      else if (input.pressed('color3')) this.select(COLORS[2]);
      else if (input.pressed('color4')) this.select(COLORS[3]);
      else if (input.pressed('colorNext')) this.select(COLORS[(current + 1) % COLORS.length]);
      else if (input.pressed('colorPrev')) this.select(COLORS[(current + COLORS.length - 1) % COLORS.length]);
    }
    const currentMode = this.ctrl.currentMode;
    const flying = currentMode === 'fly';
    const canAim =
      currentMode === 'ground' || currentMode === 'air' || currentMode === 'slide' || currentMode === 'swim' || flying;
    this.ctrl.aiming = intent.aimHeld && canAim && !this.wheelOpen;
    this.flickTurnT = Math.max(0, this.flickTurnT - dt);
    const canTurn = canAim && !flying;
    if (flying) this.ctrl.faceTarget = null;
    else if (this.ctrl.aiming) {
      this.ctrl.faceTarget = this.rig.yaw;
      this.ctrl.faceRate = 20;
    } else if (this.flickTurnT > 0 && canTurn) {
      this.ctrl.faceTarget = this.flickYaw;
      this.ctrl.faceRate = 16;
    } else this.ctrl.faceTarget = null;
  }
  streamDist = 0;
  streamT = 0;
  streamDry = false;
  streamV = new Vector3();
  updateStream(dt, intent) {
    const state = this.ctrl.state;
    if (!(
      intent.streamHeld &&
      this.ctrl.currentMode === 'fly' &&
      !state.aiming &&
      !this.wheelOpen &&
      this.ctrl.flyTime > 0.3
    )) {
      this.streamDist = TUNING.flyStreamStep;
      this.streamT = TUNING.flyStreamMax;
      this.streamDry = false;
      return;
    }
    const velocity = state.velocity;
    this.streamDist += Math.hypot(velocity.x, velocity.y, velocity.z) * dt;
    this.streamT += dt;
    if (
      !(
        (this.streamDist >= TUNING.flyStreamStep && this.streamT >= TUNING.flyStreamMin) ||
        this.streamT >= TUNING.flyStreamMax
      ) ||
      this.streamDry
    )
      return;
    this.streamDist = 0;
    this.streamT = 0;
    const tip = this.origin;
    let onTip = false;
    try {
      this.ctx.character.brushTipWorld(tip);
      onTip = Number.isFinite(tip.x + tip.y + tip.z) && tip.distanceToSquared(state.position) < 16;
    } catch {
      onTip = false;
    }
    if (!onTip) tip.copy(state.position);
    tip.y -= 0.15;
    const random = Math.random;
    const vel = this.streamV.set(
      velocity.x * 0.94 + (random() - 0.5) * 0.8,
      Math.min(velocity.y, 2) * 0.5 - 9 - random() * 1.5,
      velocity.z * 0.94 + (random() - 0.5) * 0.8,
    );
    let thrown = false;
    try {
      thrown = this.ctx.paint.throwBlob(tip, vel, state.selectedColor);
    } catch {
      thrown = false;
    }
    if (!thrown) this.streamDry = true;
  }
  update(dt, intent) {
    const state = this.ctrl.state;
    this.flickCd = Math.max(0, this.flickCd - dt);
    if (dt <= 0) return;
    this.updateStream(dt, intent);
    const artsAim = !!this.arts && state.aiming && this.ctrl.currentMode !== 'swim';
    let flicked = false;
    if (this.arts)
      try {
        flicked = this.arts.input(dt, intent, artsAim, this.wheelOpen) === 'flick';
      } catch {
        flicked = false;
      }
    const tapped = artsAim ? flicked : intent.paintPressed;
    const wantFlick = !this.wheelOpen && (artsAim ? flicked : intent.paintPressed || intent.paintHeld);
    if (wantFlick || state.aiming) {
      this.computeLaunch();
      if (state.aiming && !(state.artCharge > 0) && !this.arts?.casting)
        try {
          this.ctx.paint.showTrajectory(this.origin, this.velocity, state.selectedColor);
        } catch {}
      if (wantFlick && (this.flickCd <= 0 || (tapped && this.flickCd < TUNING.flickInterval * 0.5))) {
        this.flickCd = TUNING.flickInterval;
        let thrown = false;
        try {
          thrown = this.ctx.paint.throwBlob(this.origin, this.velocity, state.selectedColor);
        } catch {
          thrown = false;
        }
        const position = state.position;
        const dx = state.aimTarget.x - position.x;
        const dz = state.aimTarget.z - position.z;
        if (dx * dx + dz * dz > 0.04) {
          this.flickYaw = yawOf(dx, dz);
          this.flickTurnT = TUNING.flickTurnTime;
        }
        if (thrown) {
          state.lastFlickTime = this.ctx.time.elapsed;
          this.dir.copy(this.velocity).normalize();
          this.ctx.events.emit('player:flick', {
            color: state.selectedColor,
            direction: this.dir.clone(),
          });
        }
      }
    }
  }
  computeLaunch() {
    const state = this.ctrl.state;
    const tip = this.origin;
    let onTip = false;
    try {
      this.ctx.character.brushTipWorld(tip);
      onTip = Number.isFinite(tip.x + tip.y + tip.z) && tip.distanceToSquared(state.position) < 16;
    } catch {
      onTip = false;
    }
    if (!onTip) {
      tip.copy(state.position);
      tip.x += Math.sin(state.facing) * 0.5;
      tip.z += Math.cos(state.facing) * 0.5;
      tip.y += 1.5;
    }
    try {
      this.ctx.paint.launchVelocity(tip, state.aimTarget, this.velocity);
      const velocity = state.velocity;
      if (this.ctrl.currentMode === 'fly' && velocity.lengthSq() > 1) {
        this.lead.copy(state.aimTarget);
        for (let i = 0; i < 6; i++) {
          const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
          const hDist = Math.hypot(this.lead.x - tip.x, this.lead.z - tip.z);
          const flightT = hSpeed > 0.5 ? Math.min(2.4, hDist / hSpeed) : 0.6;
          this.lead.copy(state.aimTarget).addScaledVector(velocity, -flightT);
          this.ctx.paint.launchVelocity(tip, this.lead, this.velocity);
        }
        this.velocity.add(velocity);
      }
    } catch {
      this.velocity.copy(state.aimTarget).sub(tip).normalize().multiplyScalar(18);
    }
    if (!Number.isFinite(this.velocity.x + this.velocity.y + this.velocity.z)) this.velocity.set(0, 6, 0);
  }
  updateAim() {
    const state = this.ctrl.state;
    const camera = this.ctx.camera;
    const dir = camera.getWorldDirection(this.dir);
    const chest = this.chest.copy(state.position);
    chest.y += 1.3;
    const skip = Math.max(0, chest.sub(camera.position).dot(dir) - 0.4);
    const start = this.start.copy(camera.position).addScaledVector(dir, skip);
    let aimRange = TUNING.aimRange;
    if (this.probes.ray(start, dir, TUNING.aimRange, this.hit, false, COLLISION_GROUPS.combatQuery))
      aimRange = this.hit.distance;
    const waterY = Number.isFinite(this.ctx.water?.level) ? this.ctx.water.level : 0;
    if (dir.y < -0.0001) {
      const toWater = (waterY - start.y) / dir.y;
      if (toWater > 0 && toWater < aimRange) aimRange = toWater;
    }
    state.aimTarget.copy(start).addScaledVector(dir, aimRange);
  }
}
