/**
 * Procedural footsteps for walking, running and sprinting: each foot steps through stance and swing on a shared phase clock, lands on a probed foothold ahead of the hero with toe-off and heel-strike pitch, and the feet resettle when the hero stands still.
 */
import { Vector2, Vector3 } from 'three';
import { smoothStep } from './anim-math.js';
class Foot {
  side;
  planted = true;
  pos = new Vector3();
  from = new Vector3();
  target = new Vector3();
  relFrom = new Vector2();
  relTarget = new Vector2();
  normal = new Vector3(0, 1, 0);
  fromNormal = new Vector3(0, 1, 0);
  yaw = 0;
  fromYaw = 0;
  targetYaw = 0;
  s = 0;
  swingDur = 0.3;
  lift = 0.08;
  stanceU = 0;
  pitch = 0;
  settle = false;
  lastPlantTime = -10;
  constructor(side) {
    this.side = side;
  }
}
const ANKLE_HEIGHT = 0.088;
export class Gait {
  probe;
  feet = [new Foot(1), new Foot(-1)];
  phase = 0;
  moving = false;
  runW = 0;
  sprintW = 0;
  duty = 0.6;
  cycleRate = 1;
  stanceTravel = 0.5;
  moveTime = 0;
  onPlant = null;
  stanceW = 0;
  hit = {
    y: 0,
    normal: new Vector3(0, 1, 0),
  };
  initialized = false;
  tmp = new Vector3();
  dir = new Vector3();
  lastSettleEnd = 0;
  constructor(probe) {
    this.probe = probe;
  }
  snap(pos, yaw) {
    for (const foot of this.feet) {
      this.restSpot(pos, yaw, foot, foot.pos);
      foot.planted = true;
      foot.yaw = yaw + foot.side * 0.1;
      foot.s = 0;
      foot.pitch = 0;
      foot.settle = false;
    }
    this.initialized = true;
  }
  replant(ankles, yaw, rootY) {
    for (let i = 0; i < 2; i++) {
      const foot = this.feet[i];
      const ankle = ankles[i];
      this.probe(ankle.x, ankle.z, rootY, this.hit);
      foot.pos.set(ankle.x, this.hit.y + ANKLE_HEIGHT, ankle.z);
      foot.normal.copy(this.hit.normal);
      foot.planted = true;
      foot.s = 0;
      foot.yaw = yaw + foot.side * 0.1;
      foot.settle = false;
      foot.pitch = 0;
    }
    this.initialized = true;
  }
  restSpot(pos, yaw, foot, out) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const lateral = foot.side * (0.1 + 0.065 * this.stanceW);
    const forward = foot.side * (0.02 + 0.1 * this.stanceW);
    const x = pos.x + lateral * cos + forward * sin;
    const z = pos.z - lateral * sin + forward * cos;
    this.probe(x, z, pos.y, this.hit);
    foot.normal.copy(this.hit.normal);
    return out.set(x, this.hit.y + ANKLE_HEIGHT, z);
  }
  update(dt, now, pos, yaw, vel, wantsMove) {
    if (!this.initialized) this.snap(pos, yaw);
    const speed = Math.hypot(vel.x, vel.z);
    const wasMoving = this.moving;
    this.moving = this.moving
      ? speed > 0.22 || (wantsMove && speed > 0.08)
      : speed > 0.45 || (wantsMove && speed > 0.25);
    this.moveTime = this.moving === wasMoving ? this.moveTime + dt : 0;
    const pace = Math.max(speed, 0.6);
    this.runW = smoothStep(2.4, 5.2, speed);
    this.sprintW = smoothStep(7, 9.5, speed);
    const cadence = Math.min(6, Math.max(2.3, 2.35 + 0.5 * pace - 0.018 * pace * pace + 0.6 * this.runW));
    this.duty = 0.6 - 0.28 * this.runW - 0.04 * this.sprintW;
    this.cycleRate = cadence / 2;
    this.stanceTravel = (pace * this.duty) / this.cycleRate;
    const reach = 0.52 - 0.16 * this.runW;
    const stepWidth = 0.095 - 0.035 * this.runW;
    const liftHeight = 0.07 + 0.19 * this.runW + 0.08 * this.sprintW;
    if (speed > 0.05) this.dir.set(vel.x / speed, 0, vel.z / speed);
    else this.dir.set(Math.sin(yaw), 0, Math.cos(yaw));
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (const foot of this.feet) {
      const dx = foot.pos.x - pos.x;
      const dz = foot.pos.z - pos.z;
      if (dx * dx + dz * dz > 2.2 * 2.2 || Math.abs(foot.pos.y - pos.y) > 2.5) {
        this.snap(pos, yaw);
        break;
      }
    }
    if (this.moving) {
      if (!wasMoving) {
        const swinging = this.feet.find((foot) => !foot.planted);
        if (swinging) {
          const phaseOff = swinging.side === 1 ? 0 : 0.5;
          this.phase = this.duty + swinging.s * (1 - this.duty) - phaseOff;
        } else {
          const along0 = (this.feet[0].pos.x - pos.x) * this.dir.x + (this.feet[0].pos.z - pos.z) * this.dir.z;
          const along1 = (this.feet[1].pos.x - pos.x) * this.dir.x + (this.feet[1].pos.z - pos.z) * this.dir.z;
          this.phase = along0 < along1 ? this.duty : this.duty + 0.5;
        }
        this.phase = ((this.phase % 1) + 1) % 1;
      }
      this.phase = (this.phase + this.cycleRate * dt) % 1;
      const swingDur = (1 - this.duty) / this.cycleRate;
      for (const foot of this.feet) {
        const phaseOff = foot.side === 1 ? 0 : 0.5;
        const footPhase = (((this.phase + phaseOff) % 1) + 1) % 1;
        if (footPhase >= this.duty) {
          const swingT = (footPhase - this.duty) / (1 - this.duty);
          if (foot.planted) {
            this.lift(foot, pos, yaw);
            foot.settle = false;
            foot.s = swingT;
          } else foot.settle &&= false;
          foot.s = Math.max(foot.s, Math.min(swingT, 1));
          foot.swingDur = swingDur;
          foot.lift = liftHeight;
          const timeLeft = (1 - foot.s) * swingDur;
          const ahead = this.stanceTravel * reach;
          const lateral = foot.side * stepWidth;
          const offX = this.dir.x * ahead + lateral * cos;
          const offZ = this.dir.z * ahead - lateral * sin;
          foot.relTarget.set(offX * cos - offZ * sin, offX * sin + offZ * cos);
          const targetX = pos.x + vel.x * timeLeft + offX;
          const targetZ = pos.z + vel.z * timeLeft + offZ;
          this.probe(targetX, targetZ, pos.y, this.hit);
          foot.target.set(targetX, this.hit.y + ANKLE_HEIGHT, targetZ);
          foot.normal.copy(this.hit.normal);
          foot.targetYaw = yaw + foot.side * 0.08;
          foot.stanceU = 1;
        } else {
          foot.stanceU = footPhase / this.duty;
          if (!foot.planted) this.plant(foot, now, speed);
        }
      }
    } else {
      for (const foot of this.feet) {
        foot.stanceU = Math.max(0, foot.stanceU - dt * 3);
        if (!foot.planted) {
          this.restSpot(pos, yaw, foot, foot.target);
          foot.relTarget.set(foot.side * (0.1 + 0.065 * this.stanceW), foot.side * (0.02 + 0.1 * this.stanceW));
          foot.targetYaw = yaw + foot.side * 0.1;
          foot.s += dt / Math.max(0.12, foot.swingDur);
          if (foot.s >= 1) {
            foot.s = 1;
            this.plant(foot, now, Math.min(speed, 1));
            this.lastSettleEnd = now;
          }
        }
      }
      if (this.feet[0].planted && this.feet[1].planted && now - this.lastSettleEnd > 0.08) {
        let worst = null;
        let worstErr = 0;
        for (const foot of this.feet) {
          this.restSpot(pos, yaw, foot, this.tmp);
          const dist = Math.hypot(this.tmp.x - foot.pos.x, this.tmp.z - foot.pos.z);
          let yawErr = Math.abs(((foot.yaw - (yaw + foot.side * 0.1) + Math.PI) % (Math.PI * 2)) - Math.PI);
          if (!Number.isFinite(yawErr)) yawErr = 0;
          const err = dist + yawErr * 0.12;
          if (err > worstErr) {
            worstErr = err;
            worst = foot;
          }
        }
        if (worst && worstErr > 0.11) {
          this.lift(worst, pos, yaw);
          worst.relTarget.set(worst.side * (0.1 + 0.065 * this.stanceW), worst.side * (0.02 + 0.1 * this.stanceW));
          worst.settle = true;
          worst.s = 0;
          worst.swingDur = 0.2 + 0.12 * Math.min(1, worstErr / 0.4);
          worst.lift = 0.05 + 0.05 * Math.min(1, worstErr / 0.4);
        }
      }
    }
    for (const foot of this.feet) {
      if (!foot.planted) continue;
      const dx = foot.pos.x - pos.x;
      const dz = foot.pos.z - pos.z;
      if (dx * dx + dz * dz > 0.8 * 0.8 && !this.moving) {
        this.lift(foot, pos, yaw);
        foot.relTarget.set(foot.side * (0.1 + 0.065 * this.stanceW), foot.side * (0.02 + 0.1 * this.stanceW));
        foot.settle = true;
        foot.s = 0;
        foot.swingDur = 0.2;
        foot.lift = 0.08;
      }
    }
    const walkW = 1 - this.runW;
    for (const foot of this.feet) {
      if (foot.planted) {
        foot.pitch =
          (this.moving ? smoothStep(0.5, 1, foot.stanceU) * (0.35 + 0.55 * this.runW) : 0) +
          (this.moving ? (1 - smoothStep(0, 0.18, foot.stanceU)) * -0.22 * walkW : 0);
        continue;
      }
      const progress = Math.min(1, foot.s);
      const ease =
        this.runW > 0
          ? lerp(smoothStep(0, 1, progress), smoothStep(0.12, 1, progress), this.runW)
          : smoothStep(0, 1, progress);
      const relX = foot.relFrom.x + (foot.relTarget.x - foot.relFrom.x) * ease;
      const relZ = foot.relFrom.y + (foot.relTarget.y - foot.relFrom.y) * ease;
      foot.pos.x = pos.x + relX * cos + relZ * sin;
      foot.pos.z = pos.z - relX * sin + relZ * cos;
      const liftT = progress ** (0.75 - 0.27 * this.runW);
      const baseY = foot.from.y + (foot.target.y - foot.from.y) * smoothStep(0, 1, progress);
      foot.pos.y = baseY + foot.lift * Math.sin(Math.PI * liftT);
      foot.yaw = foot.fromYaw + angleDelta(foot.targetYaw, foot.fromYaw) * smoothStep(0, 1, progress);
      const toeOff = (0.35 + 0.55 * this.runW) * (1 - smoothStep(0, 0.45, progress));
      const heelStrike =
        -0.3 * walkW * smoothStep(0.55, 0.95, progress) + 0.25 * this.runW * Math.sin(Math.PI * progress);
      foot.pitch = foot.settle ? 0.15 * Math.sin(Math.PI * progress) : toeOff + heelStrike;
    }
  }
  lift(foot, pos, yaw) {
    foot.planted = false;
    foot.from.copy(foot.pos);
    foot.fromYaw = foot.yaw;
    foot.fromNormal.copy(foot.normal);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const dx = foot.pos.x - pos.x;
    const dz = foot.pos.z - pos.z;
    foot.relFrom.set(dx * cos - dz * sin, dx * sin + dz * cos);
    foot.relTarget.copy(foot.relFrom);
    foot.target.copy(foot.pos);
  }
  plant(foot, now, speed) {
    foot.planted = true;
    foot.settle = false;
    foot.pos.y = foot.target.y;
    foot.yaw = foot.targetYaw;
    foot.s = 0;
    foot.stanceU = 0;
    foot.lastPlantTime = now;
    this.onPlant?.(foot, Math.min(1, 0.25 + speed / 9));
  }
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function angleDelta(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
