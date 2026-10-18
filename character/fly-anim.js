/**
 * Brushflight riding pose: seats the hero on the flying brush, pitches and banks with the flight, bobs, wobbles and flinches on jolts, and poses the hands on the shaft and the legs dangling or tucked at cruising speed.
 */
import { Quaternion, Vector3 } from 'three';
import { AngleSpring, clamp01, envelope, smoothStep, Spring, Spring3 } from './anim-math.js';
import { BRUSH_DIMS } from './body-mesh.js';
import { rotationAlongY } from './ik.js';
import { ARM_CH, armBase, BODY_CH, LEG_CH, legBase } from './pose-channels.js';
import { PELVIS_Y } from './rig.js';
const _velDelta = new Vector3();
const _brushUp = new Vector3();
const FLY_SEAT_Y = 0.61;
const FLY_BUTT_BACK = 0.64;
export class FlyAnimator {
  brushW = 0;
  gripW = [0, 0];
  butt = new Vector3(0, 0.72, FLY_BUTT_BACK);
  dir = new Vector3(0, 0, -1);
  rot = new Quaternion();
  gripPos = new Vector3();
  handD = [0.3, 0.17];
  pitch = 0;
  roll = 0;
  lift = 0;
  pivotY = FLY_SEAT_Y;
  cruise = 0;
  boost = 0;
  t = 99;
  from = 'ground';
  exitT = 99;
  bank = 0;
  seat = Spring.make(2.4, 0.3);
  wob = Spring.make(3.2, 0.22);
  pitchS = new AngleSpring(5.5);
  rollS = new AngleSpring(6);
  sway = Spring3.make(1.05, 0.28);
  prevVel = new Vector3();
  riding = false;
  flinchT = 99;
  jolt(strength) {
    this.wob.v += (Math.random() < 0.5 ? -1 : 1) * 5 * strength;
    this.seat.v -= 1.2 * strength;
    this.flinchT = 0;
  }
  update(dt, now, state, yaw, yawRate, accel) {
    const flying = state.mode === 'fly';
    if (flying && !this.riding) {
      this.t = 0;
      this.from = this.prevMode;
      const vy = state.velocity.y;
      if (this.from === 'ground' || this.from === 'slide' || this.from === 'swim') this.seat.v += 0.2;
      else this.seat.v += Math.max(-2.2, Math.min(-0.5, vy * 0.12));
      this.prevVel.copy(state.velocity);
    } else if (!flying && this.riding) this.exitT = 0;
    this.riding = flying;
    if (state.mode !== 'fly') this.prevMode = state.mode;
    if (dt <= 0) return;
    if (flying) this.t += dt;
    else {
      this.t = 99;
      this.exitT += dt;
    }
    this.flinchT += dt;
    const velocity = state.velocity;
    const speed = velocity.length();
    if (flying && this.t > 0.3) {
      const dv = _velDelta.subVectors(velocity, this.prevVel).length();
      if (dv > 5.5) this.jolt(Math.min(1.5, dv / 14));
    }
    this.prevVel.copy(velocity);
    const fromGround = this.from === 'ground' || this.from === 'slide' || this.from === 'swim';
    if (flying)
      this.brushW = fromGround ? smoothStep(0, 0.22, this.t) : Math.max(this.brushW, smoothStep(0, 0.1, this.t));
    else this.brushW *= Math.exp(-11 * dt);
    const damp = (rate) => 1 - Math.exp(-rate * dt);
    this.cruise += ((flying ? smoothStep(1.5, 11, speed) : 0) - this.cruise) * damp(3);
    this.boost += ((flying && state.sprinting ? 1 : 0) - this.boost) * damp(state.sprinting ? 3 : 2);
    const hover = 1 - this.cruise;
    const aiming = +!!state.aiming;
    const grab = flying ? clamp01((this.t - (fromGround ? 0.12 : 0.03)) / 0.12) : 0;
    this.gripW[0] += (grab * (1 - aiming) - this.gripW[0]) * damp(flying ? 14 : 12);
    this.gripW[1] += (grab - this.gripW[1]) * damp(flying ? 16 : 12);
    this.handD[1] = 0.3 - 0.14 * this.cruise - 0.03 * this.boost;
    this.handD[0] = this.handD[1] + 0.13;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const fwdVel = velocity.x * sin + velocity.z * cos;
    const sideVel = velocity.x * cos - velocity.z * sin;
    const fwdAcc = accel.x * sin + accel.z * cos;
    const sideAcc = accel.x * cos - accel.z * sin;
    let pitch = 0;
    let roll = 0;
    if (flying) {
      pitch =
        -Math.atan2(velocity.y, Math.max(Math.abs(fwdVel), 0.5)) *
        smoothStep(2, 8, speed) *
        smoothStep(1.5, 6, Math.abs(fwdVel)) *
        0.85;
      pitch = Math.max(-0.95, Math.min(0.95, pitch));
      pitch += Math.max(-0.12, Math.min(0.12, -fwdAcc * 0.006));
      roll = -yawRate * Math.min(speed, 30) * 0.03 - sideAcc * 0.012 - sideVel * 0.035;
      roll = Math.max(-0.75, Math.min(0.75, roll));
    }
    this.pitchS.step(pitch, dt);
    this.rollS.step(roll, dt);
    this.wob.step(0, dt);
    this.seat.step(0, dt);
    this.pitch = this.pitchS.x;
    this.roll = this.rollS.x + this.wob.x * 0.6;
    this.bank = this.rollS.x;
    const bob = flying ? (0.045 * Math.sin(now * 2.2) + 0.012 * Math.sin(now * 5.1 + 1)) * (0.35 + 0.65 * hover) : 0;
    this.lift = bob + this.seat.x * 0.35;
    this.sway.step(-sideAcc * -0.004, 0, -fwdAcc * 0.005, dt);
    const dip =
      0.07 +
      0.1 * hover -
      0.03 * this.boost +
      0.04 * Math.sin(now * 1.7) * hover +
      this.seat.x * 0.4 -
      this.wob.x * 0.05;
    const veer = (0.05 * Math.sin(now * 1.3) * hover + this.wob.x * 0.25) * 0.8;
    const cosDip = Math.cos(dip);
    this.dir.set(Math.sin(veer) * cosDip, -Math.sin(dip), -Math.cos(veer) * cosDip).normalize();
    this.butt.set(0, FLY_SEAT_Y, 0).addScaledVector(this.dir, -0.64);
    const twist = this.wob.x * 0.5 + 0.06 * Math.sin(now * 1.1 + 0.4) * hover;
    _brushUp.set(Math.sin(twist), Math.cos(twist), 0);
    rotationAlongY(this.dir, _brushUp, this.rot);
    this.gripPos.copy(this.butt).addScaledVector(this.dir, BRUSH_DIMS.grip);
  }
  prevMode = 'ground';
  handlePoint(dist, out) {
    return out.copy(this.butt).addScaledVector(this.dir, dist);
  }
  pose(target, now, state, lookYaw, lookPitch, yawRate) {
    const cruise = this.cruise;
    const boost = this.boost;
    const hover = 1 - cruise;
    const rideT = this.t;
    const fromGround = this.from === 'ground' || this.from === 'slide' || this.from === 'swim';
    target[BODY_CH.hipY] += 0.74 - PELVIS_Y - 0.03 * cruise - 0.04 * boost;
    target[BODY_CH.hipZ] += -0.02 + 0.03 * cruise;
    target[BODY_CH.hipPitch] += 0.14 + 0.2 * cruise + 0.1 * boost;
    target[BODY_CH.spPitch] += 0.12 + 0.2 * cruise + 0.12 * boost;
    target[BODY_CH.chPitch] += 0.05 + 0.1 * cruise + 0.06 * boost;
    const lean = 0.31 + 0.5 * cruise + 0.28 * boost;
    target[BODY_CH.nkPitch] += -lean * 0.35;
    target[BODY_CH.hdPitch] += -lean * 0.45 - 0.08 * boost;
    const bank = this.bank;
    target[BODY_CH.spRoll] += bank * 0.22;
    target[BODY_CH.chRoll] += bank * 0.14;
    target[BODY_CH.hdRoll] += -bank * 0.45;
    const turnLook = Math.max(-0.45, Math.min(0.45, yawRate * 0.14));
    target[BODY_CH.hdYaw] += turnLook;
    target[BODY_CH.nkYaw] += turnLook * 0.4;
    const breath = Math.sin(now * 2.4);
    target[BODY_CH.chPitch] += -0.02 * breath * hover;
    target[BODY_CH.hdYaw] += lookYaw * 0.55 * hover;
    target[BODY_CH.hdPitch] += lookPitch * 0.6 * hover;
    const flinch = envelope(this.flinchT, 0.04, 0.05, 0.4);
    target[BODY_CH.spPitch] += 0.18 * flinch;
    target[BODY_CH.hdPitch] += 0.2 * flinch;
    target[BODY_CH.squash] += -0.05 * flinch;
    for (const side of [1, -1]) {
      const arm = armBase(side);
      target[arm + ARM_CH.swing] += 0.9 + 0.3 * cruise;
      target[arm + ARM_CH.abd] += 0.18;
      target[arm + ARM_CH.elbow] += 0.5 - 0.2 * cruise;
      target[arm + ARM_CH.clavFwd] += 0.18 + 0.12 * cruise;
      target[arm + ARM_CH.clavUp] += -0.06 - 0.04 * cruise;
    }
    for (const side of [1, -1]) {
      const leg = legBase(side);
      target[leg + LEG_CH.plant] = 0;
      const phase = now * 2.3 + (side === 1 ? 0 : Math.PI * 0.85);
      const kick = Math.sin(phase);
      const dangleX = side * 0.07 + this.sway.x;
      const dangleY = 0.16 + 0.05 * Math.max(0, kick);
      const dangleZ = 0.1 + 0.09 * kick + this.sway.z;
      const tuckX = side * 0.075;
      const tuckY = 0.34 + 0.05 * boost;
      const tuckZ = -0.2 - 0.08 * boost;
      target[leg + LEG_CH.fx] += dangleX + (tuckX - dangleX) * cruise;
      target[leg + LEG_CH.fy] += dangleY + (tuckY - dangleY) * cruise;
      target[leg + LEG_CH.fz] += dangleZ + (tuckZ - dangleZ) * cruise;
      target[leg + LEG_CH.pitch] += 0.45 + 0.5 * cruise + 0.12 * kick * hover;
      target[leg + LEG_CH.yaw] += side * -0.12;
      target[leg + LEG_CH.knee] += 0.35 + 0.2 * cruise;
    }
    if (rideT < 0.6) {
      if (fromGround) {
        const hop = envelope(rideT, 0.03, 0.03, 0.08);
        const straddle = envelope(rideT - 0.06, 0.08, 0.06, 0.16);
        target[BODY_CH.hipY] += -0.1 * hop;
        target[BODY_CH.spPitch] += 0.2 * hop;
        target[BODY_CH.squash] += -0.06 * hop + 0.05 * straddle;
        for (const side of [1, -1]) {
          const leg = legBase(side);
          target[leg + LEG_CH.fx] += side * 0.16 * straddle;
          target[leg + LEG_CH.fy] += (side === -1 ? 0.2 : 0.08) * straddle;
          target[leg + LEG_CH.fz] += (side === -1 ? 0.08 : -0.04) * straddle;
          const arm = armBase(side);
          target[arm + ARM_CH.abd] += 0.4 * straddle;
          target[arm + ARM_CH.swing] += -0.3 * hop;
        }
      } else {
        const brace = envelope(rideT, 0.04, 0.06, 0.3);
        target[BODY_CH.spPitch] += 0.15 * brace;
        target[BODY_CH.squash] += -0.07 * brace;
        for (const side of [1, -1]) target[legBase(side) + LEG_CH.fy] += 0.08 * brace;
      }
    }
  }
}
