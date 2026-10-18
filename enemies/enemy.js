/**
 * The Enemy record: per-Smudge state for AI, physics, statuses and animation, plus the damped spring bank and the channel indices that drive its procedural pose.
 */
import { Color, Vector3 } from 'three';
class SpringBank {
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
    const omega = 2 * Math.PI * freq;
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
    const { x, v, target, k, c: c2, n } = this;
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < n; j++) {
        const acc = k[j] * (target[j] - x[j]) - c2[j] * v[j];
        v[j] += acc * h;
        x[j] += v[j] * h;
      }
    for (let i = 0; i < n; i++)
      if (!Number.isFinite(x[i]) || !Number.isFinite(v[i])) {
        x[i] = target[i];
        v[i] = 0;
      }
  }
}
export const CH = {
  LEAN_X: 0,
  LEAN_Z: 1,
  SQUASH: 2,
  BOB: 3,
  TOP_X: 4,
  TOP_Y: 5,
  TOP_Z: 6,
  TOP_PITCH: 7,
  TOP_YAW: 8,
  TOP_ROLL: 9,
  MASK_YAW: 10,
  MASK_PITCH: 11,
  MASK_ROLL: 12,
  MASK_PUSH: 13,
  HL_PITCH: 14,
  HL_ROLL: 15,
  HL_X: 16,
  HL_Y: 17,
  HL_Z: 18,
  HR_PITCH: 19,
  HR_ROLL: 20,
  HR_X: 21,
  HR_Y: 22,
  HR_Z: 23,
  FL_LIFT: 24,
  FL_FWD: 25,
  FR_LIFT: 26,
  FR_FWD: 27,
  EXTRA_A: 28,
  EXTRA_B: 29,
  EYE_OPEN: 30,
  ANGER: 31,
  GLOW: 32,
  MOUTH: 33,
  WIDTH: 34,
  CRACK: 35,
};
const STATUSES = ['burning', 'frozen', 'launched', 'rooted'];
export class Enemy {
  id;
  kind;
  def;
  position = new Vector3();
  facing = 0;
  radius;
  height;
  health;
  maxHealth;
  alive = true;
  alerted = false;
  telegraphing = false;
  attackEta = 0;
  statuses = new Set();
  elite = null;
  ex = null;
  scale = 1;
  tier = 1;
  dmgMul = 1;
  deathDur = 0.55;
  crackle = 0;
  sparkT = 0;
  followUp = false;
  secondShot = false;
  skyBorn = false;
  onSky = false;
  skyY = 0;
  lastSkyPos = new Vector3();
  skyT = 0;
  wanderRadius = 0;
  windup = 0;
  speedCap = 0;
  ballistic = false;
  body = null;
  collider = null;
  vel = new Vector3();
  knock = new Vector3();
  grounded = true;
  airTime = 0;
  actualVel = new Vector3();
  prevActualVel = new Vector3();
  accel = new Vector3();
  dormant = false;
  state = 'idle';
  stateT = 0;
  attack = null;
  attackHit = false;
  attackFired = false;
  token = false;
  cooldown = 1;
  tokenWait = 0;
  home = new Vector3();
  homeFacing = 0;
  campId = null;
  awareness = 0;
  lastSeenT = -1000000000;
  lastSeen = new Vector3();
  canSee = false;
  distToPlayer = 1000000000;
  senseT = 0;
  desired = new Vector3();
  moveTarget = new Vector3();
  faceTarget = null;
  moveSpeed = 0;
  orbitAngle = 0;
  orbitDir = 1;
  orbitRadius = 4;
  orbitT = 0;
  wanderT = 0;
  idleT = 0;
  stuckT = 0;
  detourT = 0;
  detourSign = 1;
  lastPos = new Vector3();
  progressT = 0;
  alertDelay = -1;
  invuln = 0;
  resetPending = false;
  panicT = 0;
  panicAngle = 0;
  igniteT = 0;
  worldT = 0;
  paintUnder = null;
  bounceCd = 0;
  slipT = 0;
  hurtT = 0;
  airLock = 0;
  lastHitT = -1000000000;
  lastHitDir = new Vector3(0, 0, 1);
  statusT = {
    burning: 0,
    frozen: 0,
    launched: 0,
    rooted: 0,
  };
  immuneT = {
    burning: 0,
    frozen: 0,
    launched: 0,
    rooted: 0,
  };
  poiseDmg = 0;
  launchBounces = 0;
  tumble = 0;
  tumbleV = 0;
  tumbleAxis = 0;
  anim = new SpringBank(36);
  gaitPhase = 0;
  gaitAmp = 0;
  lastStep = 0;
  flash = 0;
  coat = new Color(0, 0, 0);
  coatAmt = 0;
  charr = 0;
  frozenVis = 0;
  deathT = 0;
  deathColor = null;
  fade = 1;
  rise = 1;
  crack = 0;
  sac = 0;
  seed;
  blinkT = 2;
  blink = 0;
  lookYaw = 0;
  lookPitch = 0;
  dripT = 0;
  rendered = false;
  shell = 0;
  vines = 0;
  flameT = 0;
  constructor(id, kind, def) {
    this.id = id;
    this.kind = kind;
    this.def = def;
    this.radius = def.radius;
    this.height = def.height;
    this.maxHealth = def.hp;
    this.health = def.hp;
    this.seed = (((id * 0.61803398875) % 1) + 1) % 1;
  }
  has(st) {
    return this.statuses.has(st);
  }
  get controllable() {
    return !this.statuses.has('frozen') && !this.statuses.has('rooted') && !this.statuses.has('launched');
  }
  tickStatusTimers(dt) {
    for (const st of STATUSES) if (this.immuneT[st] > 0) this.immuneT[st] = Math.max(0, this.immuneT[st] - dt);
  }
}
