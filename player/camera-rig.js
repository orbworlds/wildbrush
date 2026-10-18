/**
 * Third-person camera rig: orbits the hero with mouse or stick look, drifts behind the run direction, frames the lock-on target, pulls back for speed, gliding and brushflight, keeps clear of walls and the ground, adds shake, landing dip, hit punch and kick, and blends into scripted cinematic shots.
 */
import { Euler, Quaternion, Vector3 } from 'three';
import { clamp, damp, smoothstep } from '../core/math.js';
import { Probes } from './probes.js';
import { TUNING } from './tuning.js';
function springStep(x, v, target, omega, dt) {
  const f = 1 + 2 * dt * omega;
  const hoo = omega * omega * dt;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  return [(f * x + dt * v + hhoo * target) * detInv, (v + hoo * (target - x)) * detInv];
}
const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const isFiniteVec = (v) => !!v && Number.isFinite(v.x + v.y + v.z);
export class CameraRig {
  ctx;
  ctrl;
  yaw = Math.PI;
  pitch = 0.3;
  zoom = TUNING.camDist;
  dist = TUNING.camDist;
  fov = TUNING.camFov;
  pivot = new Vector3();
  lookAhead = new Vector3();
  lastFeet = new Vector3();
  aimBlend = 0;
  glideBlend = 0;
  climbBlend = 0;
  speedBlend = 0;
  sprintBlend = 0;
  flyBlend = 0;
  flySpeed = 0;
  flyRoll = 0;
  levelT = 0;
  levelPitch = 0.14;
  trauma = 0;
  dip = 0;
  dipVel = 0;
  shakeT = 0;
  initialized = false;
  idleLook = 0;
  settings;
  lockTarget = null;
  lockBlend = 0;
  lockPt = new Vector3();
  recenterT = 0;
  recenterYaw = 0;
  punchAmt = 0;
  punchSm = 0;
  kickOff = new Vector3();
  kickVel = new Vector3();
  cinematic = false;
  cineBlend = 0;
  beatT = 0;
  beatDur = 1;
  shot = null;
  shotW = 0;
  shotBlend = 0.8;
  shotInit = false;
  sPos = new Vector3();
  sPosV = new Vector3();
  sLook = new Vector3();
  sLookV = new Vector3();
  sFov = 55;
  sFovV = 0;
  gamePos = new Vector3();
  gameLook = new Vector3();
  gameFov = 55;
  blendPos = new Vector3();
  blendLook = new Vector3();
  probes;
  fwd = new Vector3();
  right = new Vector3();
  target = new Vector3();
  shoulder = new Vector3();
  camPos = new Vector3();
  back = new Vector3();
  euler = new Euler(0, 0, 0, 'YXZ');
  q = new Quaternion();
  constructor(ctx, ctrl) {
    this.ctx = ctx;
    this.ctrl = ctrl;
    this.probes = new Probes(ctx);
    this.probes.exclude = ctrl.collider;
    this.yaw = ctrl.state.facing;
    const heroCam = ctx.params.get('herocam')?.split(',').map(Number);
    if (heroCam && heroCam.length === 3 && heroCam.every(Number.isFinite))
      this.heroCam = new Vector3(heroCam[0], heroCam[1], heroCam[2]);
    this.settings = ctx.settings;
    ctx.events.on('settings:changed', ({ settings }) => {
      if (settings) this.settings = settings;
    });
    ctx.events.on('player:land', ({ impact }) => {
      if (impact > 6) this.dipVel -= Math.min(impact, 30) * 0.075;
      if (impact > 13) this.addTrauma(Math.min(0.55, (impact - 13) * 0.04 + 0.2));
    });
    ctx.events.on('player:bounce', ({ strength }) => {
      this.dipVel -= Math.min(strength, 20) * 0.06;
      this.addTrauma(Math.min(0.45, strength * 0.025));
    });
    ctx.events.on('camera:shake', ({ strength, position }) => {
      if (!Number.isFinite(strength) || strength <= 0) return;
      let falloff = 1;
      if (position) falloff = clamp(1 - position.distanceTo(this.ctrl.state.position) / 40, 0, 1);
      this.addTrauma(Math.min(1, strength) * falloff);
    });
    ctx.events.on('player:mode', ({ from, to }) => {
      if (to === 'fly' && (from === 'ground' || from === 'slide' || from === 'swim' || this.pitch > 0.55))
        this.levelOut(TUNING.flyPitchBias);
    });
  }
  levelOut(levelPitch, levelT = 0.7) {
    this.levelPitch = levelPitch;
    this.levelT = levelT;
  }
  recenter(recenterYaw) {
    this.recenterYaw = recenterYaw;
    this.recenterT = 0.4;
  }
  punch(punchAmt) {
    if (Math.abs(punchAmt) > Math.abs(this.punchAmt)) this.punchAmt = punchAmt;
  }
  kick(dir, amount) {
    this.kickVel.x += dir.x * amount * 9;
    this.kickVel.y -= amount * 3;
    this.kickVel.z += dir.z * amount * 9;
  }
  beat(duration) {
    this.beatDur = Math.max(0.2, duration);
    this.beatT = this.beatDur;
  }
  addTrauma(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  setShot(shot) {
    if (shot && (!isFiniteVec(shot.position) || !isFiniteVec(shot.target))) shot = null;
    if (shot) {
      const blend = Number(shot.blend);
      this.shotBlend = Number.isFinite(blend) && blend >= 0 ? Math.min(6, blend) : 0.8;
      if (this.shotW <= 0.0001 || !this.shotInit) {
        this.sPos.copy(shot.position);
        this.sLook.copy(shot.target);
        this.sPosV.set(0, 0, 0);
        this.sLookV.set(0, 0, 0);
        this.sFov = Number.isFinite(shot.fov) ? shot.fov : this.ctx.camera.fov;
        this.sFovV = 0;
        this.shotInit = true;
      }
    }
    this.shot = shot;
  }
  get shotWeight() {
    return this.shotW;
  }
  applyShot(dt) {
    const shot = this.shot;
    const blendTime = Math.max(0.05, this.shotBlend);
    this.shotW = shot ? Math.min(1, this.shotW + dt / blendTime) : Math.max(0, this.shotW - dt / blendTime);
    if (this.shotW <= 0) {
      this.shotInit = false;
      return;
    }
    const camera = this.ctx.camera;
    this.gameFov = camera.fov;
    if (shot && isFiniteVec(shot.position) && isFiniteVec(shot.target)) {
      if (this.sLook.distanceToSquared(shot.target) > 900 || this.sPos.distanceToSquared(shot.position) > 900) {
        this.sPos.copy(shot.position);
        this.sLook.copy(shot.target);
        this.sPosV.set(0, 0, 0);
        this.sLookV.set(0, 0, 0);
      }
      const omega = Math.min(40, 4.2 / blendTime);
      const springDt = Math.min(dt, 0.1);
      for (const [pos, vel, goal] of [
        [this.sPos, this.sPosV, shot.position],
        [this.sLook, this.sLookV, shot.target],
      ])
        for (const axis of ['x', 'y', 'z']) {
          const next = springStep(pos[axis], vel[axis], goal[axis], omega, springDt);
          pos[axis] = next[0];
          vel[axis] = next[1];
        }
      const targetFov = Number.isFinite(shot.fov) ? clamp(shot.fov, 10, 120) : this.gameFov;
      const fovNext = springStep(this.sFov, this.sFovV, targetFov, omega, springDt);
      this.sFov = fovNext[0];
      this.sFovV = fovNext[1];
    }
    this.gamePos.copy(camera.position);
    this.gameLook.copy(this.shoulder);
    const weight = smootherstep(clamp(this.shotW, 0, 1));
    const sLook = this.sLook;
    const gx = this.gamePos.x - sLook.x;
    const gy = this.gamePos.y - sLook.y;
    const gz = this.gamePos.z - sLook.z;
    const sx = this.sPos.x - sLook.x;
    const sy = this.sPos.y - sLook.y;
    const sz = this.sPos.z - sLook.z;
    const gameDist = Math.hypot(gx, gy, gz);
    const shotDist = Math.hypot(sx, sy, sz);
    const blendPos = this.blendPos;
    if (gameDist > 0.05 && shotDist > 0.05 && weight < 0.999) {
      const gameYaw = Math.atan2(gx, gz);
      let dYaw = Math.atan2(sx, sz) - gameYaw;
      dYaw = ((((dYaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
      const gamePitch = Math.asin(clamp(gy / gameDist, -1, 1));
      const shotPitch = Math.asin(clamp(sy / shotDist, -1, 1));
      const yaw = gameYaw + dYaw * weight;
      const pitch = gamePitch + (shotPitch - gamePitch) * weight;
      const radius = gameDist + (shotDist - gameDist) * weight;
      const cosPitch = Math.cos(pitch);
      blendPos.set(
        sLook.x + Math.sin(yaw) * cosPitch * radius,
        sLook.y + Math.sin(pitch) * radius,
        sLook.z + Math.cos(yaw) * cosPitch * radius,
      );
    } else blendPos.copy(this.sPos);
    this.blendLook.copy(this.gameLook).lerp(sLook, weight);
    try {
      const minY = Math.max(
        this.ctx.terrain.heightAt(blendPos.x, blendPos.z) + 0.35,
        (Number.isFinite(this.ctx.water?.level) ? this.ctx.water.level : 0) + 0.25,
      );
      if (blendPos.y < minY) blendPos.y = minY;
    } catch {}
    if (!isFiniteVec(blendPos) || !isFiniteVec(this.blendLook)) return;
    camera.position.copy(blendPos);
    if (blendPos.distanceToSquared(this.blendLook) > 0.000001) camera.lookAt(this.blendLook);
    this.applyShake(camera);
    const fov = this.gameFov + (this.sFov - this.gameFov) * weight;
    if (Number.isFinite(fov) && Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }
  applyShake(camera) {
    if (this.trauma <= 0.001) return;
    const phase = this.shakeT * 28;
    const amp = this.trauma * this.trauma;
    this.euler.set(
      amp * 0.035 * (Math.sin(phase * 1.13) + Math.sin(phase * 2.71) * 0.5),
      amp * 0.03 * (Math.sin(phase * 0.97 + 1.3) + Math.sin(phase * 2.29 + 0.4) * 0.5),
      amp * 0.025 * Math.sin(phase * 1.61 + 2.1),
      'YXZ',
    );
    this.q.setFromEuler(this.euler);
    camera.quaternion.multiply(this.q);
  }
  snap(yaw) {
    const state = this.ctrl.state;
    if (yaw !== undefined && Number.isFinite(yaw)) this.yaw = yaw;
    this.pivot.copy(state.position).y += TUNING.camPivotY;
    this.lookAhead.set(0, 0, 0);
    this.dist = this.zoom;
    this.lastFeet.copy(state.position);
    this.initialized = true;
    this.apply(1 / 60, true);
  }
  update(dt, lookX, lookY, wheel) {
    const settings = this.settings ?? this.ctx.settings;
    const state = this.ctrl.state;
    if (!this.initialized) this.snap();
    if (this.lastFeet.distanceToSquared(state.position) > 64) this.snap();
    this.lastFeet.copy(state.position);
    const aiming = state.aiming;
    const sens = TUNING.lookSens * clamp(settings.mouseSensitivity || 1, 0.1, 5) * (aiming ? TUNING.aimSensMul : 1);
    if (lookX !== 0 || lookY !== 0) this.idleLook = 0;
    else this.idleLook += dt;
    const mode = state.mode;
    if (
      this.idleLook > 0.9 &&
      !aiming &&
      !this.lockTarget &&
      (mode === 'ground' || mode === 'slide' || mode === 'glide') &&
      state.speed > 1.5
    ) {
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);
      const dirX = state.velocity.x / state.speed;
      const dirZ = state.velocity.z / state.speed;
      const side = cosYaw * dirX - sinYaw * dirZ;
      if (sinYaw * dirX + cosYaw * dirZ > -0.3) {
        const rate = (this.ctx.input.usingGamepad ? 0.55 : 0.3) * clamp(state.speed / TUNING.runSpeed, 0, 1.5);
        const ramp = clamp((this.idleLook - 0.9) / 1.2, 0, 1);
        this.yaw += side * rate * ramp * dt;
      }
    }
    if (this.lockTarget !== null && !aiming) {
      const lockTarget = this.lockTarget;
      const dx = lockTarget.x - state.position.x;
      const dz = lockTarget.z - state.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.3) {
        let dYaw = Math.atan2(dx, dz) + 0.16 + this.cineBlend * 0.75 - this.yaw;
        dYaw = ((((dYaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
        this.yaw += dYaw * damp(dist < 2 ? 3 : 6, dt);
      }
      const dy = lockTarget.y - (state.position.y + TUNING.camPivotY);
      const targetPitch =
        clamp(0.2 - Math.atan2(clamp(dy, -2, 0.8), Math.max(dist, 2)) * 0.6, 0.06, 0.55) - this.cineBlend * 0.1;
      this.pitch += (targetPitch - this.pitch) * damp(3, dt);
      this.pitch += lookY * sens * 0.3 * (settings.invertY ? -1 : 1);
      this.recenterT = 0;
    } else {
      if (this.recenterT > 0) {
        this.recenterT -= dt;
        let dYaw = this.recenterYaw - this.yaw;
        dYaw = ((((dYaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
        this.yaw += dYaw * damp(13, dt);
        this.pitch += (0.3 - this.pitch) * damp(8, dt);
        if (lookX !== 0 || lookY !== 0) this.recenterT = 0;
      }
      this.yaw -= lookX * sens;
      this.pitch += lookY * sens * (settings.invertY ? -1 : 1);
      if (mode === 'fly') {
        if (!aiming) this.yaw += this.ctrl.flyTurn * dt;
        if (this.levelT > 0) {
          this.levelT -= dt;
          if (lookX !== 0 || lookY !== 0) this.levelT = 0;
          else this.pitch += (this.levelPitch - this.pitch) * damp(6, dt);
        }
      } else this.levelT = 0;
    }
    this.pitch = clamp(this.pitch, TUNING.camPitchMin, TUNING.camPitchMax);
    this.yaw = ((((this.yaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    if (wheel) this.zoom = clamp(this.zoom + wheel * 0.75, TUNING.camMinDist, TUNING.camMaxDist);
    this.apply(dt, false);
    if (this.heroCam) this.applyHeroCam();
  }
  heroCam = null;
  heroLook = new Vector3();
  applyHeroCam() {
    const heroCam = this.heroCam;
    const state = this.ctrl.state;
    const facing = state.facing;
    const sinFacing = Math.sin(facing);
    const cosFacing = Math.cos(facing);
    const camera = this.ctx.camera;
    camera.position.set(
      state.position.x - cosFacing * heroCam.x + sinFacing * heroCam.z,
      state.position.y + 1 + heroCam.y,
      state.position.z + sinFacing * heroCam.x + cosFacing * heroCam.z,
    );
    this.heroLook.set(state.position.x, state.position.y + 0.95, state.position.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.heroLook);
    if (Math.abs(camera.fov - 50) > 0.01) {
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }
  apply(dt, instant) {
    const ctx = this.ctx;
    const state = this.ctrl.state;
    const mode = state.mode;
    const ease = (rate) => (instant ? 1 : damp(rate, dt));
    const speed = state.speed;
    this.aimBlend += (+!!state.aiming - this.aimBlend) * ease(13);
    this.glideBlend += (+(mode === 'glide') - this.glideBlend) * ease(2.2);
    this.climbBlend += (+(mode === 'climb') - this.climbBlend) * ease(3);
    const speedGoal = mode === 'slide' || mode === 'air' || mode === 'glide' ? clamp((speed - 7) / 10, 0, 1) : 0;
    this.speedBlend += (speedGoal - this.speedBlend) * ease(2.5);
    this.sprintBlend += ((state.sprinting && mode === 'ground' ? 1 : 0) - this.sprintBlend) * ease(3);
    const flying = mode === 'fly';
    this.flyBlend += (+!!flying - this.flyBlend) * ease(flying ? 3 : 2);
    const velLen = state.velocity.length();
    const flyGoal = flying ? clamp((velLen - 2) / (TUNING.flyBoost - 2), 0, 1.3) : 0;
    this.flySpeed += (flyGoal - this.flySpeed) * ease(flyGoal > this.flySpeed ? 1.6 : 2.4);
    this.flyRoll += (this.ctrl.flyBank * TUNING.flyCamRoll - this.flyRoll) * ease(4);
    const flyBlend = this.flyBlend;
    const pivotY =
      (mode === 'swim' ? TUNING.camPivotY - 0.2 : TUNING.camPivotY) +
      (TUNING.flyCamPivotY - TUNING.camPivotY) * flyBlend;
    const target = this.target.copy(state.position);
    target.y += pivotY;
    const lead = speed > 0.5 && !state.aiming && !flying ? TUNING.camLookAhead * (mode === 'glide' ? 1.6 : 1) : 0;
    const leadX = clamp(state.velocity.x * lead, -2.4, 2.4);
    const leadZ = clamp(state.velocity.z * lead, -2.4, 2.4);
    this.lookAhead.x += (leadX - this.lookAhead.x) * ease(2.2);
    this.lookAhead.z += (leadZ - this.lookAhead.z) * ease(2.2);
    target.x += this.lookAhead.x;
    target.z += this.lookAhead.z;
    this.lockBlend += ((this.lockTarget && !state.aiming ? 1 : 0) - this.lockBlend) * ease(5);
    let lockZoom = 0;
    if (this.lockTarget) this.lockPt.copy(this.lockTarget);
    if (this.lockBlend > 0.001) {
      const dx = this.lockPt.x - target.x;
      const dz = this.lockPt.z - target.z;
      const dist = Math.hypot(dx, dz);
      const pull = Math.min(0.28, 1.4 / Math.max(dist, 0.001)) * this.lockBlend;
      target.x += dx * pull;
      target.z += dz * pull;
      target.y += clamp(this.lockPt.y - target.y, -1.5, 1.5) * 0.25 * this.lockBlend;
      lockZoom = clamp((dist - 3) / 10, 0, 1) * this.lockBlend;
    }
    const followH = ease(state.aiming ? 30 : TUNING.camFollowH);
    this.pivot.x += (target.x - this.pivot.x) * followH;
    this.pivot.z += (target.z - this.pivot.z) * followH;
    const followV = state.grounded
      ? 11
      : mode === 'climb' || mode === 'swim' || flying || state.velocity.y < -12
        ? 9
        : TUNING.camFollowV * 0.6;
    this.pivot.y += (target.y - this.pivot.y) * ease(followV);
    this.pivot.y = clamp(this.pivot.y, target.y - 1.3, target.y + 1);
    if (!instant) {
      this.dipVel += (-this.dip * 140 - this.dipVel * 15) * dt;
      this.dip += this.dipVel * dt;
      this.dip = clamp(this.dip, -0.6, 0.3);
    }
    const cosPitch = Math.cos(this.pitch);
    const fwd = this.fwd.set(Math.sin(this.yaw) * cosPitch, -Math.sin(this.pitch), Math.cos(this.yaw) * cosPitch);
    const right = this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    if (!instant) {
      this.punchSm += (this.punchAmt - this.punchSm) * damp(38, dt);
      this.punchAmt *= Math.exp(-7 * dt);
      this.beatT = Math.max(0, this.beatT - dt);
      this.kickVel.addScaledVector(this.kickOff, -260 * dt);
      this.kickVel.multiplyScalar(Math.exp(-18 * dt));
      this.kickOff.addScaledVector(this.kickVel, dt);
    }
    this.cineBlend += (+!!this.cinematic - this.cineBlend) * ease(this.cinematic ? 5 : 2.5);
    const beatPhase = this.beatT > 0 ? this.beatT / this.beatDur : 0;
    const beatPulse = beatPhase > 0 ? smoothstep(0, 0.18, 1 - beatPhase) * smoothstep(0, 0.4, beatPhase) : 0;
    const baseDist =
      this.zoom +
      this.glideBlend * 2.2 +
      this.climbBlend * 0.9 +
      this.speedBlend * 1.1 +
      lockZoom * 2.2 +
      this.lockBlend * 0.9 -
      this.punchSm * 0.9 -
      beatPulse * 1.4 -
      this.cineBlend * 1.6 +
      flyBlend * (TUNING.flyCamDist + TUNING.flyCamSpeedDist * this.flySpeed);
    const wantDist = baseDist + (TUNING.camAimDist + flyBlend * 1.2 - baseDist) * this.aimBlend;
    const shoulder = this.shoulder
      .copy(this.pivot)
      .addScaledVector(right, TUNING.camAimShoulder * this.aimBlend + 0.3 * this.lockBlend);
    shoulder.y +=
      0.22 * this.aimBlend + this.dip - beatPulse * 0.35 + flyBlend * (0.3 + 0.2 * this.flySpeed) * (1 - this.aimBlend);
    shoulder.add(this.kickOff);
    const back = this.back.copy(fwd).negate();
    const castDist = this.probes.sphere(shoulder, back, wantDist, TUNING.camRadius);
    const clearDist = castDist >= 0 ? Math.max(0.35, castDist - 0.05) : wantDist;
    if (instant) this.dist = clearDist;
    else if (clearDist < this.dist) this.dist += (clearDist - this.dist) * damp(28, dt);
    else this.dist += (clearDist - this.dist) * damp(3.2, dt);
    const camPos = this.camPos.copy(shoulder).addScaledVector(back, this.dist);
    let floorY = -1000000000;
    try {
      floorY = this.ctx.terrain.heightAt(camPos.x, camPos.z) + 0.45;
    } catch {}
    const waterY = Number.isFinite(ctx.water?.level) ? ctx.water.level : 0;
    floorY = Math.max(floorY, waterY + 0.35);
    if (camPos.y < floorY) camPos.y = floorY;
    const camera = ctx.camera;
    camera.position.copy(camPos);
    camera.lookAt(shoulder);
    if (flyBlend > 0.001 && Math.abs(this.flyRoll) > 0.0001) {
      this.euler.set(0, 0, -this.flyRoll * flyBlend, 'YXZ');
      this.q.setFromEuler(this.euler);
      camera.quaternion.multiply(this.q);
    }
    if (!instant) {
      this.trauma = Math.max(0, this.trauma - dt * 1.5);
      this.shakeT += dt;
    }
    this.applyShake(camera);
    if (beatPulse > 0.001) {
      this.euler.set(0, 0, beatPulse * 0.035, 'YXZ');
      this.q.setFromEuler(this.euler);
      camera.quaternion.multiply(this.q);
    }
    const targetFov =
      TUNING.camFov +
      this.sprintBlend * 5 +
      this.speedBlend * 10 +
      this.glideBlend * 2 -
      (TUNING.camFov - TUNING.camAimFov) * this.aimBlend +
      this.lockBlend * 2 +
      flyBlend * (2 + TUNING.flyFovBoost * this.flySpeed * this.flySpeed) * (1 - 0.6 * this.aimBlend);
    this.fov += (targetFov - this.fov) * ease(5);
    const fov = this.fov - this.punchSm * 7 - beatPulse * 4;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    if (!instant || this.shotW > 0) this.applyShot(instant ? 0 : dt);
  }
}
