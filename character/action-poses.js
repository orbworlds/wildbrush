/**
 * Keyframed combat poses: the action pose (brush angle, grip, body channels, free arm, feet, lift and spin), building and sampling keyframe tracks, the guard and spin-charge stances, and the tracks for the three slashes, the spin and the jump slash.
 */
import { Vector3 } from 'three';
import { JUMP_SLASH } from '../shared/combat-defs.js';
import { clamp01 } from './anim-math.js';
import { BODY_CH } from './pose-channels.js';
export const BODY_KEY_CHANNELS = [
  BODY_CH.hipX,
  BODY_CH.hipY,
  BODY_CH.hipZ,
  BODY_CH.hipPitch,
  BODY_CH.hipYaw,
  BODY_CH.hipRoll,
  BODY_CH.spPitch,
  BODY_CH.spYaw,
  BODY_CH.spRoll,
  BODY_CH.chPitch,
  BODY_CH.chYaw,
  BODY_CH.chRoll,
  BODY_CH.nkPitch,
  BODY_CH.nkYaw,
  BODY_CH.hdPitch,
  BODY_CH.hdYaw,
  BODY_CH.hdRoll,
  BODY_CH.squash,
];
export const BODY_KEY_COUNT = BODY_KEY_CHANNELS.length;
const BODY_KEY_NAMES = [
  'hx',
  'hy',
  'hz',
  'hp',
  'hw',
  'hr',
  'sp',
  'sy',
  'sr',
  'cp',
  'cy',
  'cr',
  'np',
  'ny',
  'dp',
  'dy',
  'dr',
  'sq',
];
export const SQUASH_SLOT = BODY_KEY_COUNT - 1;
export class ActionPose {
  by = 0;
  bp = 0;
  g = new Vector3();
  two = 0;
  body = new Float32Array(BODY_KEY_COUNT);
  aL = new Vector3();
  fL = new Vector3();
  fR = new Vector3();
  lift = 0;
  spin = 0;
  pitch = 0;
  constructor() {
    this.body[SQUASH_SLOT] = 1;
  }
  copy(other) {
    this.by = other.by;
    this.bp = other.bp;
    this.g.copy(other.g);
    this.two = other.two;
    this.body.set(other.body);
    this.aL.copy(other.aL);
    this.fL.copy(other.fL);
    this.fR.copy(other.fR);
    this.lift = other.lift;
    this.spin = other.spin;
    this.pitch = other.pitch;
    return this;
  }
  lerp(other, t) {
    this.by += (other.by - this.by) * t;
    this.bp += (other.bp - this.bp) * t;
    this.g.lerp(other.g, t);
    this.two += (other.two - this.two) * t;
    for (let i = 0; i < BODY_KEY_COUNT; i++) this.body[i] += (other.body[i] - this.body[i]) * t;
    this.aL.lerp(other.aL, t);
    this.fL.lerp(other.fL, t);
    this.fR.lerp(other.fR, t);
    this.lift += (other.lift - this.lift) * t;
    this.spin += (other.spin - this.spin) * t;
    this.pitch += (other.pitch - this.pitch) * t;
    return this;
  }
}
const ACTION_POSE_BASE = {
  by: 0.4,
  bp: 0.62,
  g: [-0.08, -0.22, 0.16],
  two: 1,
  b: {},
  aL: [0.3, 0.3, 0.6],
  fL: [0.12, 0.05, 0],
  fR: [-0.12, -0.05, 0],
  lift: 0,
  spin: 0,
  pitch: 0,
};
function applyPoseSpec(pose, spec) {
  if (spec.by !== undefined) pose.by = spec.by;
  if (spec.bp !== undefined) pose.bp = spec.bp;
  if (spec.g) pose.g.set(spec.g[0], spec.g[1], spec.g[2]);
  if (spec.two !== undefined) pose.two = spec.two;
  if (spec.b)
    for (let i = 0; i < BODY_KEY_COUNT; i++) {
      const value = spec.b[BODY_KEY_NAMES[i]];
      if (value !== undefined) pose.body[i] = value;
    }
  if (spec.aL) pose.aL.set(spec.aL[0], spec.aL[1], spec.aL[2]);
  if (spec.fL) pose.fL.set(spec.fL[0], spec.fL[1], spec.fL[2]);
  if (spec.fR) pose.fR.set(spec.fR[0], spec.fR[1], spec.fR[2]);
  if (spec.lift !== undefined) pose.lift = spec.lift;
  if (spec.spin !== undefined) pose.spin = spec.spin;
  if (spec.pitch !== undefined) pose.pitch = spec.pitch;
}
function makeActionTrack(keys) {
  const track = [];
  const pose = new ActionPose();
  applyPoseSpec(pose, ACTION_POSE_BASE);
  for (const [time, ease, spec] of keys) {
    applyPoseSpec(pose, spec);
    track.push({
      t: time,
      e: ease,
      f: new ActionPose().copy(pose),
    });
  }
  return track;
}
export function actionEase(kind, t) {
  switch (kind) {
    case 'lin':
      return t;
    case 'in':
      return t * t * t;
    case 'out':
      return 1 - (1 - t) * (1 - t);
    case 'whip': {
      const u = 1 - t;
      return 1 - u * u * u * u;
    }
    default:
      return t * t * (3 - 2 * t);
  }
}
export function sampleActionTrack(track, t, out) {
  if (t <= track[0].t) return out.copy(track[0].f);
  for (let i = 1; i < track.length; i++) {
    const next = track[i];
    if (t <= next.t) {
      const prev = track[i - 1];
      const u = clamp01((t - prev.t) / Math.max(0.0001, next.t - prev.t));
      return out.copy(prev.f).lerp(next.f, actionEase(next.e, u));
    }
  }
  return out.copy(track[track.length - 1].f);
}
const GUARD_SPEC = {
  by: 0.42,
  bp: 0.66,
  g: [-0.07, -0.22, 0.15],
  two: 1,
  b: {
    hx: 0,
    hy: -0.05,
    hz: 0,
    hp: 0.05,
    hw: -0.12,
    hr: 0,
    sp: 0.08,
    sy: -0.1,
    sr: 0,
    cp: 0.02,
    cy: -0.28,
    cr: 0,
    np: 0,
    ny: 0.1,
    dp: -0.03,
    dy: 0.3,
    dr: 0,
    sq: 1,
  },
  aL: [0.5, 0.3, 0.8],
  lift: 0,
  spin: 0,
  pitch: 0,
};
export const GUARD_POSE = new ActionPose();
applyPoseSpec(GUARD_POSE, ACTION_POSE_BASE);
applyPoseSpec(GUARD_POSE, GUARD_SPEC);
const CHARGE_SPEC = {
  by: -2.45,
  bp: 0.06,
  g: [-0.3, -0.17, -0.08],
  two: 0,
  b: {
    hy: -0.27,
    hp: 0.2,
    hw: -0.36,
    sp: 0.3,
    sy: -0.46,
    cy: -0.92,
    cr: 0.1,
    cp: 0.06,
    ny: 0.3,
    dy: 0.95,
    dp: -0.14,
    sq: 0.94,
  },
  aL: [1.35, 0.5, 0.12],
  fL: [0.24, 0.28, 0],
  fR: [-0.2, -0.24, 0],
};
export const CHARGE_POSE = new ActionPose();
applyPoseSpec(CHARGE_POSE, ACTION_POSE_BASE);
applyPoseSpec(CHARGE_POSE, CHARGE_SPEC);
export const SLASH1_TRACK = makeActionTrack([
  [
    0,
    'io',
    {
      ...GUARD_SPEC,
      fL: [0.12, 0.06, 0],
      fR: [-0.12, -0.06, 0],
    },
  ],
  [
    0.1,
    'out',
    {
      by: -1.95,
      bp: 0.34,
      g: [-0.3, 0.04, -0.05],
      two: 0,
      b: {
        hy: -0.1,
        hp: 0.06,
        hw: -0.24,
        sp: 0.12,
        sy: -0.34,
        cy: -0.66,
        cp: -0.06,
        cr: 0.08,
        ny: 0.2,
        dy: 0.58,
        sq: 0.95,
      },
      aL: [1.05, 0.45, 0.5],
      fL: [0.1, 0.17, 0.08],
      fR: [-0.13, -0.1, 0],
    },
  ],
  [
    0.2,
    'whip',
    {
      by: 1.9,
      bp: -0.14,
      g: [0.12, -0.12, 0.27],
      b: {
        hy: -0.13,
        hp: 0.12,
        hw: 0.3,
        sp: 0.2,
        sy: 0.32,
        cy: 0.64,
        cp: 0.08,
        cr: -0.08,
        ny: -0.15,
        dy: -0.36,
        sq: 1.03,
      },
      aL: [-0.5, 0.95, 0.25],
      fL: [0.13, 0.34, 0],
      fR: [-0.13, -0.2, 0],
    },
  ],
  [
    0.29,
    'out',
    {
      by: 2.3,
      bp: -0.28,
      g: [0.18, -0.16, 0.18],
      b: {
        hy: -0.12,
        hp: 0.1,
        hw: 0.34,
        sp: 0.18,
        sy: 0.36,
        cy: 0.76,
        cr: -0.1,
        dy: -0.46,
        sq: 1,
      },
      aL: [-0.6, 1.05, 0.3],
    },
  ],
  [
    0.5,
    'io',
    {
      ...GUARD_SPEC,
    },
  ],
]);
export const SLASH2_TRACK = makeActionTrack([
  [
    0,
    'io',
    {
      by: 2.2,
      bp: -0.24,
      g: [0.17, -0.15, 0.2],
      two: 0,
      b: {
        hy: -0.12,
        hp: 0.1,
        hw: 0.3,
        sp: 0.16,
        sy: 0.34,
        cy: 0.7,
        cr: -0.08,
        dy: -0.4,
        sq: 1,
      },
      aL: [-0.5, 0.9, 0.3],
      fL: [0.13, 0.3, 0],
      fR: [-0.13, -0.18, 0],
    },
  ],
  [
    0.09,
    'out',
    {
      by: 2.6,
      bp: -0.36,
      g: [0.2, -0.2, 0.06],
      b: {
        hy: -0.14,
        hw: 0.36,
        sp: 0.2,
        sy: 0.4,
        cy: 0.82,
        cr: -0.1,
        dy: -0.56,
        ny: -0.2,
        sq: 0.95,
      },
      aL: [-0.3, 0.7, 0.6],
      fR: [-0.12, 0.02, 0.09],
    },
  ],
  [
    0.19,
    'whip',
    {
      by: -1.95,
      bp: 0.44,
      g: [-0.3, 0.03, 0.17],
      b: {
        hy: -0.1,
        hp: 0.06,
        hw: -0.3,
        sp: 0.08,
        sy: -0.34,
        cy: -0.64,
        cp: -0.1,
        cr: 0.1,
        ny: 0.15,
        dy: 0.42,
        sq: 1.04,
      },
      aL: [0.75, 1.1, 0.3],
      fL: [0.15, -0.08, 0],
      fR: [-0.12, 0.32, 0],
    },
  ],
  [
    0.28,
    'out',
    {
      by: -2.35,
      bp: 0.6,
      g: [-0.3, 0.1, 0.04],
      b: {
        cy: -0.74,
        sy: -0.38,
        hw: -0.33,
        cp: -0.14,
        dy: 0.52,
        sq: 1,
      },
      aL: [0.8, 1.2, 0.25],
    },
  ],
  [
    0.5,
    'io',
    {
      ...GUARD_SPEC,
    },
  ],
]);
export const SLASH3_TRACK = makeActionTrack([
  [
    0,
    'io',
    {
      by: -2.3,
      bp: 0.56,
      g: [-0.3, 0.08, 0.05],
      two: 0,
      b: {
        cy: -0.7,
        sy: -0.36,
        hw: -0.3,
        cp: -0.12,
        dy: 0.5,
        hy: -0.1,
      },
      aL: [0.8, 1.2, 0.25],
      fL: [0.15, -0.08, 0],
      fR: [-0.12, 0.3, 0],
    },
  ],
  [
    0.13,
    'out',
    {
      by: 0.9,
      bp: 2.1,
      g: [-0.14, 0.3, -0.04],
      two: 1,
      b: {
        hy: -0.24,
        hp: 0.12,
        hw: 0,
        sp: 0.06,
        sy: 0,
        cp: -0.26,
        cy: 0,
        cr: 0,
        dp: -0.26,
        dy: 0,
        ny: 0,
        sq: 0.88,
      },
      fL: [0.14, 0.12, 0],
      fR: [-0.14, -0.08, 0],
    },
  ],
  [
    0.26,
    'out',
    {
      by: 1,
      bp: 2.3,
      g: [-0.1, 0.36, 0],
      lift: 0.55,
      b: {
        hy: 0.02,
        hp: -0.06,
        sp: -0.2,
        cp: -0.32,
        dp: -0.3,
        sq: 1.1,
      },
      fL: [0.12, 0.22, 0.24],
      fR: [-0.12, -0.02, 0.32],
    },
  ],
  [
    0.36,
    'whip',
    {
      by: 0.5,
      bp: -0.62,
      g: [0.04, -0.3, 0.3],
      lift: 0,
      b: {
        hy: -0.32,
        hp: 0.26,
        sp: 0.52,
        cp: 0.3,
        cy: 0.3,
        sy: 0.12,
        dp: 0.12,
        sq: 0.82,
      },
      fL: [0.16, 0.34, 0],
      fR: [-0.14, -0.26, 0],
    },
  ],
  [
    0.52,
    'out',
    {
      b: {
        hy: -0.26,
        sp: 0.44,
        sq: 1,
      },
    },
  ],
  [
    0.84,
    'io',
    {
      ...GUARD_SPEC,
    },
  ],
]);
const FULL_SPIN = Math.PI * 2;
export const SPIN_TRACK = makeActionTrack([
  [
    0,
    'io',
    {
      ...CHARGE_SPEC,
    },
  ],
  [
    0.06,
    'out',
    {
      spin: 0.55,
      by: -1.65,
      bp: 0.04,
      g: [-0.36, -0.05, 0.08],
      b: {
        hy: -0.1,
        hp: 0.05,
        hw: 0.08,
        sp: 0.08,
        sy: 0.12,
        cy: 0.3,
        cr: -0.12,
        cp: 0,
        dy: 0.25,
        ny: 0.1,
        dp: 0,
        sq: 1.02,
      },
      aL: [0.3, 1.35, 0.15],
      fL: [0.17, 0.12, 0.1],
      fR: [-0.17, -0.12, 0.1],
      lift: 0.12,
    },
  ],
  [
    0.44,
    'out',
    {
      spin: FULL_SPIN + 0.5,
      by: -1.45,
      bp: -0.04,
      lift: 0.02,
      fL: [0.18, 0.16, 0],
      fR: [-0.16, -0.16, 0],
    },
  ],
  [
    0.56,
    'out',
    {
      spin: FULL_SPIN + 0.28,
      by: -0.8,
      bp: -0.3,
      g: [-0.25, -0.18, 0.2],
      b: {
        hy: -0.18,
        sp: 0.26,
        cy: 0.42,
        dy: -0.2,
      },
    },
  ],
  [
    0.78,
    'io',
    {
      ...GUARD_SPEC,
      spin: FULL_SPIN,
    },
  ],
]);
export const JUMP_SLASH_LAND = JUMP_SLASH.land;
export const JUMP_SLASH_TRACK = makeActionTrack([
  [
    0,
    'io',
    {
      by: 0.3,
      bp: 1.2,
      g: [-0.1, 0.1, 0.12],
      two: 1,
      b: {
        sp: -0.05,
        cp: -0.1,
      },
    },
  ],
  [
    0.14,
    'out',
    {
      by: 0.7,
      bp: 2.25,
      g: [-0.08, 0.34, -0.02],
      b: {
        hy: 0.02,
        sp: -0.22,
        cp: -0.26,
        dp: -0.2,
        cy: -0.15,
        sy: 0,
        hw: 0,
        dy: 0,
        sq: 1.06,
      },
    },
  ],
  [
    0.3,
    'whip',
    {
      by: 0.35,
      bp: -1.25,
      g: [0, -0.26, 0.26],
      b: {
        hp: 0.2,
        sp: 0.56,
        cp: 0.3,
        cy: 0.2,
        dp: 0.25,
        sq: 0.96,
      },
    },
  ],
  [JUMP_SLASH_LAND - 0.001, 'lin', {}],
  [
    JUMP_SLASH_LAND,
    'lin',
    {
      bp: -0.72,
      g: [0, -0.3, 0.32],
      b: {
        hy: -0.38,
        hp: 0.28,
        sp: 0.5,
        cp: 0.25,
        dp: 0.1,
        sq: 0.78,
      },
      fL: [0.17, 0.24, 0],
      fR: [-0.16, -0.2, 0],
    },
  ],
  [
    JUMP_SLASH_LAND + 0.12,
    'out',
    {
      b: {
        hy: -0.32,
        sq: 1.02,
      },
    },
  ],
  [
    JUMP_SLASH_LAND + 0.44,
    'io',
    {
      ...GUARD_SPEC,
    },
  ],
]);
