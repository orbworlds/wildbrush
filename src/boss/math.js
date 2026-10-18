/**
 * Math helpers shared by the boss modules: clamp, smoothstep, easing curves, random ranges and angle wrapping. Also a bank of damped springs, stepped in fixed substeps, that drives Greymaw's secondary motion.
 */
export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export function wrapAngle(a) {
  for (; a > Math.PI;) a -= TAU;
  for (; a < -Math.PI;) a += TAU;
  return a;
}
export const yawOf = (dx, dz) => Math.atan2(dx, dz);
export const isFiniteVec = (v) => Number.isFinite(v.x + v.y + v.z);
export class SpringBank {
  n;
  x;
  v;
  target;
  k;
  c;
  constructor(count) {
    this.n = count;
    this.x = new Float32Array(count);
    this.v = new Float32Array(count);
    this.target = new Float32Array(count);
    this.k = new Float32Array(count);
    this.c = new Float32Array(count);
    for (let i = 0; i < count; i++) this.set(i, 4, 1);
  }
  set(i, freq, zeta) {
    const omega = TAU * freq;
    this.k[i] = omega * omega;
    this.c[i] = 2 * zeta * omega;
  }
  snap(i, value) {
    this.x[i] = value;
    this.v[i] = 0;
    this.target[i] = value;
  }
  snapAll() {
    this.x.set(this.target);
    this.v.fill(0);
  }
  kick(i, impulse) {
    this.v[i] += impulse;
  }
  step(dt) {
    if (dt <= 0) return;
    const steps = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 120))));
    const h = dt / steps;
    const { x, v, target, k, c: c2, n: count } = this;
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < count; j++) {
        const accel = k[j] * (target[j] - x[j]) - c2[j] * v[j];
        v[j] += accel * h;
        x[j] += v[j] * h;
      }
    for (let i = 0; i < count; i++)
      if (!Number.isFinite(x[i]) || !Number.isFinite(v[i])) {
        x[i] = target[i];
        v[i] = 0;
      }
  }
}
