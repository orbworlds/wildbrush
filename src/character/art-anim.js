/**
 * Art casting poses: the aim pose for each art (fireball, ice lance, bounce orb, vine lash) blended in while charging, keyframed cast tracks timed to each art's release, and the charge tremble, glow and shout.
 */
import { ART_BY_COLOR, ART_TIMING } from '../shared/artdefs.js';
import { clamp01, smoothStep } from './anim-math.js';
const ART_POSE_KEYS = [
  'th',
  'tl',
  'ga',
  'gu',
  'gr',
  'cy',
  'cp',
  'sp',
  'sy',
  'hy',
  'hw',
  'cr',
  'dp',
  'sq',
  'aS',
  'aA',
  'aE',
  'fS',
  'fA',
  'fE',
];
const ART_REST = {
  th: 2.05,
  tl: 0,
  ga: 0,
  gu: 0,
  gr: 0,
  cy: 0,
  cp: 0,
  sp: 0,
  sy: 0,
  hy: 0,
  hw: 0,
  cr: 0,
  dp: 0,
  sq: 1,
  aS: 0,
  aA: 0,
  aE: 0,
  fS: 0,
  fA: 0,
  fE: 0,
};
const ART_AIM_POSES = {
  fireball: {
    th: 2.4,
    tl: -0.3,
    ga: -0.08,
    gu: 0.2,
    gr: -0.02,
    cy: -0.46,
    cp: -0.16,
    sp: -0.12,
    sy: -0.2,
    hy: -0.05,
    hw: -0.16,
    cr: 0.12,
    dp: -0.08,
    sq: 0.97,
    aS: 0.55,
    aA: 0.15,
    aE: -0.15,
    fS: 0.55,
    fA: 0.25,
    fE: 1.3,
  },
  iceLance: {
    th: 0.1,
    tl: 0,
    ga: -0.34,
    gu: -0.06,
    gr: 0.15,
    cy: -0.58,
    cp: -0.02,
    sp: -0.04,
    sy: -0.26,
    hy: -0.09,
    hw: -0.26,
    cr: 0.06,
    dp: 0.02,
    sq: 0.96,
    aS: 0.5,
    aA: -0.12,
    aE: -0.2,
    fS: -0.35,
    fA: 0.3,
    fE: 1.6,
  },
  bounceOrb: {
    th: 1.95,
    tl: 1.3,
    ga: -0.12,
    gu: -0.14,
    gr: 0.22,
    cy: -0.62,
    cp: 0.06,
    sp: 0.08,
    sy: -0.26,
    hy: -0.08,
    hw: -0.22,
    cr: 0.12,
    dp: 0,
    sq: 0.96,
    aS: 0.2,
    aA: 0.55,
    aE: -0.1,
    fS: -0.2,
    fA: 1.1,
    fE: 0.3,
  },
  vineLash: {
    th: 2.25,
    tl: 0.35,
    ga: -0.04,
    gu: 0.24,
    gr: 0.04,
    cy: -0.36,
    cp: -0.15,
    sp: -0.08,
    sy: -0.12,
    hy: -0.03,
    hw: -0.1,
    cr: 0.14,
    dp: -0.12,
    sq: 0.98,
    aS: 0.3,
    aA: 0.2,
    aE: 0.1,
    fS: 0.7,
    fA: 0.2,
    fE: 0.9,
  },
};
function makeArtTrack(art, keys) {
  const track = [];
  const pose = {
    ...ART_REST,
    ...ART_AIM_POSES[art],
  };
  track.push({
    t: 0,
    e: 'io',
    p: {
      ...pose,
    },
  });
  for (const [time, ease, spec] of keys) {
    Object.assign(pose, spec);
    track.push({
      t: time,
      e: ease,
      p: {
        ...pose,
      },
    });
  }
  return track;
}
const ART_CAST_TRACKS = {
  fireball: makeArtTrack('fireball', [
    [
      ART_TIMING.fireball.release,
      'in',
      {
        th: 0.38,
        tl: 0.14,
        ga: 0.34,
        gu: 0.12,
        gr: -0.02,
        cy: 0.2,
        cp: 0.22,
        sp: 0.16,
        sy: 0.08,
        hy: -0.08,
        hw: 0.12,
        cr: -0.05,
        dp: 0.06,
        sq: 0.95,
        aS: -0.9,
        aA: 0.3,
        aE: 0.5,
        fS: -0.1,
        fA: 0.05,
        fE: 0,
      },
    ],
    [
      0.19,
      'out',
      {
        th: -0.95,
        tl: 0.1,
        ga: 0.38,
        gu: 0,
        gr: -0.04,
        cy: 0.36,
        cp: 0.36,
        sp: 0.28,
        sy: 0.14,
        hy: -0.11,
        hw: 0.18,
        cr: -0.08,
        dp: 0.12,
        sq: 0.93,
        aS: -1.25,
        aA: 0.35,
        aE: 0.6,
        fS: -0.4,
        fA: 0.05,
        fE: -0.1,
      },
    ],
    [
      0.3,
      'io',
      {
        th: -1,
        ga: 0.32,
        gu: -0.06,
        cp: 0.34,
        sp: 0.27,
        hy: -0.09,
        sq: 0.99,
        fE: 0.05,
      },
    ],
    [
      ART_TIMING.fireball.dur,
      'io',
      {
        ...ART_REST,
      },
    ],
  ]),
  iceLance: makeArtTrack('iceLance', [
    [
      ART_TIMING.iceLance.release,
      'whip',
      {
        th: 0.02,
        ga: 0.52,
        gu: 0,
        gr: -0.02,
        cy: 0.36,
        cp: 0.18,
        sp: 0.24,
        sy: 0.2,
        hy: -0.13,
        hw: 0.26,
        cr: -0.06,
        sq: 0.94,
        aS: -1.1,
        aA: 0.3,
        aE: 0.7,
        fS: 0.35,
        fA: 0,
        fE: -0.2,
      },
    ],
    [
      0.19,
      'out',
      {
        ga: 0.46,
        cy: 0.32,
        sp: 0.21,
        sq: 0.98,
        fS: 0.3,
      },
    ],
    [
      ART_TIMING.iceLance.dur,
      'io',
      {
        ...ART_REST,
      },
    ],
  ]),
  bounceOrb: makeArtTrack('bounceOrb', [
    [
      ART_TIMING.bounceOrb.release,
      'in',
      {
        th: 0.2,
        tl: 1.2,
        ga: 0.26,
        gu: -0.1,
        gr: 0,
        cy: 0.3,
        cp: 0.1,
        sp: 0.1,
        sy: 0.14,
        hy: -0.1,
        hw: 0.16,
        cr: -0.06,
        sq: 0.95,
        aS: -0.5,
        aA: 0.1,
        aE: 0.6,
        fS: 0.1,
        fA: -0.3,
        fE: -0.1,
      },
    ],
    [
      0.17,
      'out',
      {
        th: -0.95,
        ga: 0.22,
        gr: -0.1,
        cy: 0.62,
        cp: 0.14,
        sy: 0.28,
        hy: -0.11,
        hw: 0.3,
        cr: -0.1,
        sq: 0.97,
        aS: -0.8,
        aA: -0.1,
        aE: 0.7,
        fS: 0,
        fA: -0.55,
      },
    ],
    [
      ART_TIMING.bounceOrb.dur,
      'io',
      {
        ...ART_REST,
      },
    ],
  ]),
  vineLash: makeArtTrack('vineLash', [
    [
      ART_TIMING.vineLash.release,
      'whip',
      {
        th: 0,
        tl: 0.45,
        ga: 0.34,
        gu: 0.02,
        gr: 0,
        cy: 0.2,
        cp: 0.24,
        sp: 0.18,
        sy: 0.1,
        hy: -0.06,
        hw: 0.1,
        cr: -0.06,
        sq: 0.95,
        aS: -0.9,
        aA: 0.3,
        aE: 0.5,
        fS: -0.2,
        fE: -0.1,
      },
    ],
    [
      0.1,
      'out',
      {
        th: -0.42,
        ga: 0.4,
        cp: 0.3,
        fS: -0.45,
      },
    ],
    [
      0.2,
      'io',
      {
        th: 0.6,
        ga: 0.12,
        cp: 0,
        cy: 0.1,
        sp: 0.02,
        sq: 1.02,
        fS: 0.25,
        fE: 0.4,
      },
    ],
    [
      0.3,
      'io',
      {
        th: 0.25,
        ga: 0.2,
        cp: 0.06,
        sq: 1,
        fS: 0,
        fE: 0.2,
      },
    ],
    [
      ART_TIMING.vineLash.dur,
      'io',
      {
        ...ART_REST,
      },
    ],
  ]),
};
function artEase(kind, t) {
  switch (kind) {
    case 'lin':
      return t;
    case 'in':
      return t * t * (1.4 - 0.4 * t);
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
function sampleArtTrack(track, t, out) {
  if (t <= track[0].t) return Object.assign(out, track[0].p);
  for (let i = 1; i < track.length; i++) {
    const next = track[i];
    if (t <= next.t) {
      const prev = track[i - 1];
      const k = artEase(next.e, clamp01((t - prev.t) / Math.max(0.0001, next.t - prev.t)));
      for (const key of ART_POSE_KEYS) out[key] = prev.p[key] + (next.p[key] - prev.p[key]) * k;
      return out;
    }
  }
  return Object.assign(out, track[track.length - 1].p);
}
export class ArtAnimator {
  pose = {
    ...ART_REST,
  };
  w = 0;
  charge = 0;
  glow = 0;
  tremble = 0;
  det = 0;
  strain = 0;
  yell = 0;
  wantBrush = false;
  art = 'fireball';
  castArt = null;
  castT = 99;
  tmp = {
    ...ART_REST,
  };
  constructor(ctx) {
    ctx.events.on('combat:art', (data) => {
      if (data && data.art && ART_CAST_TRACKS[data.art]) {
        this.castArt = data.art;
        this.castT = 0;
      }
    });
  }
  update(dt, now, state) {
    this.castT += dt;
    const casting = this.castArt !== null && this.castT < ART_TIMING[this.castArt].dur;
    if (!casting) this.castArt = null;
    const chargeGoal = state.aiming && !state.dead && state.artCharge > 0 ? state.artCharge : 0;
    const rising = chargeGoal > this.charge;
    this.charge += (chargeGoal - this.charge) * (1 - Math.exp(-(rising ? 18 : casting ? 40 : 9) * dt));
    if (this.charge < 0.001) this.charge = 0;
    const pose = this.pose;
    if (casting) {
      this.art = this.castArt;
      sampleArtTrack(ART_CAST_TRACKS[this.art], this.castT, pose);
      this.w = 1;
    } else {
      this.art = ART_BY_COLOR[state.selectedColor] ?? 'fireball';
      const charge = this.charge;
      const aimW = 1 - (1 - clamp01(charge / 0.55)) ** 2.2;
      const aim = ART_AIM_POSES[this.art];
      for (const key of ART_POSE_KEYS) {
        const rest = ART_REST[key];
        pose[key] = rest + ((aim[key] ?? rest) - rest) * aimW;
      }
      this.w = clamp01(charge * 10);
    }
    const full = +(this.charge >= 0.97);
    this.tremble +=
      ((casting ? 0 : this.charge * this.charge * 0.45 + full * 0.55) - this.tremble) * (1 - Math.exp(-12 * dt));
    const flash = casting ? Math.exp(-this.castT * 7) : 0;
    this.glow = Math.max(
      this.charge > 0 ? 0.15 + 0.8 * this.charge * this.charge + full * 0.25 * (0.5 + 0.5 * Math.sin(now * 20)) : 0,
      flash * 1.2,
    );
    this.det = Math.max(this.charge * 1.1, casting ? 1 - smoothStep(0.4, ART_TIMING[this.art].dur, this.castT) : 0);
    this.strain = full * 0.45 + this.charge * 0.1;
    this.yell = casting ? 1 - smoothStep(0.12, 0.32, this.castT) : 0;
    this.wantBrush = this.charge > 0.01 || casting;
    this.tmp;
  }
  jitter(now) {
    return this.tremble * (Math.sin(now * 57) * 0.025 + Math.sin(now * 83 + 1.3) * 0.015);
  }
}
