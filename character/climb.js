/**
 * Climbing limbs: plants both hands and both feet on the wall in a crawling rhythm while the hero climbs, settles the furthest one when still and swings them all up for a wall leap.
 */
import { Vector3 } from 'three';
import { smoothStep } from './anim-math.js';
class ClimbGrip {
  isHand;
  side;
  restRight;
  restUp;
  phaseOff;
  planted = true;
  pos = new Vector3();
  from = new Vector3();
  target = new Vector3();
  s = 0;
  dur = 0.25;
  bulge = 0.08;
  constructor(isHand, side, restRight, restUp, phaseOff) {
    this.isHand = isHand;
    this.side = side;
    this.restRight = restRight;
    this.restUp = restUp;
    this.phaseOff = phaseOff;
  }
}
export class ClimbGait {
  grips = [
    new ClimbGrip(true, 1, 0.24, 1.52, 0),
    new ClimbGrip(true, -1, -0.24, 1.52, 0.5),
    new ClimbGrip(false, 1, 0.15, 0.2, 0.5),
    new ClimbGrip(false, -1, -0.15, 0.2, 0),
  ];
  phase = 0;
  moving = false;
  initialized = false;
  onGrab = null;
  leap = -1;
  tmp = new Vector3();
  right = new Vector3();
  up = new Vector3();
  planeP = new Vector3();
  lastSettle = 0;
  basis(normal) {
    this.up.set(0, 1, 0).addScaledVector(normal, -normal.y);
    if (this.up.lengthSq() < 0.000001) this.up.set(0, 0, 1);
    this.up.normalize();
    this.right.crossVectors(normal, this.up).normalize();
  }
  restSpot(grip, pos, normal, out) {
    this.basis(normal);
    this.planeP.copy(pos).addScaledVector(normal, -0.4);
    return out.copy(this.planeP).addScaledVector(this.right, grip.restRight).addScaledVector(this.up, grip.restUp);
  }
  reset(pos, normal) {
    for (const grip of this.grips) {
      this.restSpot(grip, pos, normal, grip.pos);
      grip.planted = true;
      grip.s = 0;
    }
    this.initialized = true;
  }
  project(pos, normal) {
    this.planeP.copy(pos).addScaledVector(normal, -0.4);
    for (const grip of this.grips) {
      const posOff = this.tmp.subVectors(grip.pos, this.planeP).dot(normal);
      grip.pos.addScaledVector(normal, -posOff);
      const targetOff = this.tmp.subVectors(grip.target, this.planeP).dot(normal);
      grip.target.addScaledVector(normal, -targetOff);
      const fromOff = this.tmp.subVectors(grip.from, this.planeP).dot(normal);
      grip.from.addScaledVector(normal, -fromOff);
    }
  }
  update(dt, now, pos, normal, vel, input, leapT) {
    if (!this.initialized) this.reset(pos, normal);
    for (const grip of this.grips)
      if (grip.pos.distanceToSquared(pos) > 9) {
        this.reset(pos, normal);
        break;
      }
    this.project(pos, normal);
    this.basis(normal);
    const planeVel = this.tmp.copy(vel).addScaledVector(normal, -vel.dot(normal));
    const speed = planeVel.length();
    const wasMoving = this.moving;
    this.moving = speed > 0.12 || input.lengthSq() > 0.04;
    const stride = 0.75;
    const rate = Math.max(speed, this.moving ? 0.6 : 0) / stride;
    if (leapT >= 0 && leapT < 0.5) {
      const leap = leapT / 0.5;
      this.leap = leap;
      const arc = Math.sin(Math.PI * Math.min(1, leap * 1.15));
      const follow = 1 - Math.exp(-28 * dt);
      for (const grip of this.grips) {
        grip.planted = false;
        grip.s = 0;
        this.restSpot(grip, pos, normal, this.tmp);
        if (grip.isHand) {
          this.tmp.addScaledVector(this.up, 0.34 * arc).addScaledVector(this.right, grip.side * 0.06 * arc);
          this.tmp.addScaledVector(normal, 0.12 * arc);
        } else {
          this.tmp.addScaledVector(this.up, -0.12 * arc + 0.05 * Math.sin(Math.PI * leap * 2));
          this.tmp.addScaledVector(normal, 0.18 * arc);
        }
        grip.pos.lerp(this.tmp, follow);
        grip.from.copy(grip.pos);
        grip.target.copy(this.tmp);
      }
      return;
    }
    if (this.leap >= 0) {
      this.leap = -1;
      for (const grip of this.grips) {
        this.restSpot(grip, pos, normal, grip.target);
        this.plant(grip);
      }
    } else if (this.moving) {
      if (!wasMoving) this.phase = 0.499;
      this.phase = (this.phase + rate * dt) % 1;
      const swingDur = 0.5 / Math.max(rate, 0.5);
      const dirX = speed > 0.05 ? planeVel.x / speed : 0;
      const dirY = speed > 0.05 ? planeVel.y / speed : 0;
      const dirZ = speed > 0.05 ? planeVel.z / speed : 0;
      for (const grip of this.grips) {
        const gripPhase = (this.phase + grip.phaseOff) % 1;
        if (gripPhase >= 0.5) {
          const swingT = (gripPhase - 0.5) / 0.5;
          if (grip.planted) {
            grip.planted = false;
            grip.from.copy(grip.pos);
          }
          grip.s = Math.max(grip.s, swingT);
          grip.dur = swingDur;
          grip.bulge = grip.isHand ? 0.09 : 0.07;
          const timeLeft = (1 - grip.s) * swingDur;
          this.restSpot(grip, pos, normal, grip.target);
          grip.target.x += planeVel.x * timeLeft + dirX * stride * 0.28;
          grip.target.y += planeVel.y * timeLeft + dirY * stride * 0.28;
          grip.target.z += planeVel.z * timeLeft + dirZ * stride * 0.28;
        } else if (!grip.planted) this.plant(grip);
      }
    } else {
      for (const grip of this.grips)
        if (!grip.planted) {
          this.restSpot(grip, pos, normal, grip.target);
          grip.s += dt / grip.dur;
          if (grip.s >= 1) {
            this.plant(grip);
            this.lastSettle = now;
          }
        }
      if (this.grips.every((grip) => grip.planted) && now - this.lastSettle > 0.12) {
        let worst = null;
        let worstDist = 0;
        for (const grip of this.grips) {
          const dist = this.restSpot(grip, pos, normal, this.tmp).distanceTo(grip.pos);
          if (dist > worstDist) {
            worstDist = dist;
            worst = grip;
          }
        }
        if (worst && worstDist > 0.2) {
          worst.planted = false;
          worst.from.copy(worst.pos);
          worst.s = 0;
          worst.dur = 0.28;
          worst.bulge = 0.08;
        }
      }
    }
    for (const grip of this.grips) {
      if (grip.planted) continue;
      const progress = Math.min(1, grip.s);
      const ease = smoothStep(0, 1, progress);
      grip.pos.lerpVectors(grip.from, grip.target, ease);
      grip.pos.addScaledVector(normal, grip.bulge * Math.sin(Math.PI * progress));
    }
  }
  plant(grip) {
    grip.planted = true;
    grip.pos.copy(grip.target);
    grip.s = 0;
    this.onGrab?.(grip);
  }
}
