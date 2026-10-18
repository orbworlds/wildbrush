/**
 * Animation maths for the hero rig: a critically damped spring bank that smooths the pose channels, scalar, 3D and angle springs, and the clamp, smoothstep, pulse, envelope and easing helpers the animation code shares.
 */
export class SpringBank {
  n;
  x;
  v;
  prev;
  omega;
  track;
  maxRate;
  init = false;
  constructor(count) {
    this.n = count;
    this.x = new Float32Array(count);
    this.v = new Float32Array(count);
    this.prev = new Float32Array(count);
    this.omega = new Float32Array(count).fill(18);
    this.track = new Float32Array(count).fill(1);
    this.maxRate = new Float32Array(count).fill(30);
  }
  reset(values) {
    this.x.set(values);
    this.prev.set(values);
    this.v.fill(0);
    this.init = true;
  }
  step(target, dt) {
    if (!this.init) {
      this.reset(target);
      return;
    }
    if (dt <= 0) return;
    const invDt = 1 / dt;
    for (let i = 0; i < this.n; i++) {
      const goal = target[i];
      let goalVel = (goal - this.prev[i]) * invDt;
      const maxRate = this.maxRate[i];
      if (goalVel > maxRate) goalVel = maxRate;
      else if (goalVel < -maxRate) goalVel = -maxRate;
      goalVel *= this.track[i];
      const omega = this.omega[i];
      const offset = this.x[i] - goal;
      const relVel = this.v[i] - goalVel;
      const decay = Math.exp(-omega * dt);
      const temp = (relVel + omega * offset) * dt;
      const newOffset = (offset + temp) * decay;
      const newRelVel = (relVel - omega * temp) * decay;
      this.x[i] = goal + newOffset;
      this.v[i] = goalVel + newRelVel;
      this.prev[i] = goal;
      if (!Number.isFinite(this.x[i])) {
        this.x[i] = goal;
        this.v[i] = 0;
      }
    }
  }
}
export class Spring {
  stiffness;
  damping;
  x = 0;
  v = 0;
  constructor(stiffness = 200, damping = 20) {
    this.stiffness = stiffness;
    this.damping = damping;
  }
  static make(hz, zeta, initial = 0) {
    const omega = 2 * Math.PI * hz;
    const spring = new Spring(omega * omega, 2 * zeta * omega);
    spring.x = initial;
    return spring;
  }
  step(target, dt) {
    if (dt <= 0) return this.x;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const accel = this.stiffness * (target - this.x) - this.damping * this.v;
      this.v += accel * h;
      this.x += this.v * h;
    }
    if (!Number.isFinite(this.x)) {
      this.x = target;
      this.v = 0;
    }
    return this.x;
  }
}
export class Spring3 {
  stiffness;
  damping;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  constructor(stiffness = 120, damping = 10) {
    this.stiffness = stiffness;
    this.damping = damping;
  }
  static make(hz, zeta) {
    const omega = 2 * Math.PI * hz;
    return new Spring3(omega * omega, 2 * zeta * omega);
  }
  step(tx, ty, tz, dt) {
    if (dt <= 0) return;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vx += (this.stiffness * (tx - this.x) - this.damping * this.vx) * h;
      this.vy += (this.stiffness * (ty - this.y) - this.damping * this.vy) * h;
      this.vz += (this.stiffness * (tz - this.z) - this.damping * this.vz) * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
      this.z += this.vz * h;
    }
    if (!Number.isFinite(this.x + this.y + this.z)) {
      this.x = tx;
      this.y = ty;
      this.z = tz;
      this.vx = this.vy = this.vz = 0;
    }
  }
  kick(vx, vy, vz) {
    this.vx += vx;
    this.vy += vy;
    this.vz += vz;
  }
}
export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export class AngleSpring {
  omega;
  x = 0;
  v = 0;
  init = false;
  constructor(omega = 14) {
    this.omega = omega;
  }
  step(target, dt) {
    if (!this.init) {
      this.x = target;
      this.init = true;
      return this.x;
    }
    if (dt <= 0) return this.x;
    const change = angleDiff(this.x, target);
    const omega = this.omega;
    const decay = Math.exp(-omega * dt);
    const temp = (this.v + omega * change) * dt;
    const newChange = (change + temp) * decay;
    this.v = (this.v - omega * temp) * decay;
    this.x = target + newChange;
    return this.x;
  }
  snap(angle) {
    this.x = angle;
    this.v = 0;
    this.init = true;
  }
}
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothStep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
export function pulse(t2, rise, fall) {
  return t2 < 0 ? 0 : t2 < rise ? smoothStep(0, rise, t2) : 1 - smoothStep(rise, rise + fall, t2);
}
export function envelope(t2, rise, hold, fall) {
  return t2 < 0
    ? 0
    : t2 < rise
      ? smoothStep(0, rise, t2)
      : t2 < rise + hold
        ? 1
        : 1 - smoothStep(rise + hold, rise + hold + fall, t2);
}
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
