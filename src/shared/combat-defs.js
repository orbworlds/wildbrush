/**
 * Brush combat tuning shared by the player, character, UI and audio: attack moves, the three-hit combo, flurry, jump slash, spin charge, dodges and the Masterstroke counter after a perfect dodge. Also the item-reveal, Chroma Brush and Sky Mantle timings.
 */
export const MOVES = {
  slash1: {
    duration: 0.5,
    activeStart: 0.1,
    activeEnd: 0.2,
    cancel: 0.27,
    bufferFrom: 0.02,
    damage: 1,
    knockback: 5,
    source: 'melee',
    lunge: 0.8,
    lungeTarget: 1.6,
    lungeStart: 0,
    lungeEnd: 0.13,
    impact: -1,
    hitStop: 0.055,
    shake: 0.2,
  },
  slash2: {
    duration: 0.5,
    activeStart: 0.09,
    activeEnd: 0.19,
    cancel: 0.26,
    bufferFrom: 0.02,
    damage: 1,
    knockback: 5,
    source: 'melee',
    lunge: 0.8,
    lungeTarget: 1.6,
    lungeStart: 0,
    lungeEnd: 0.12,
    impact: -1,
    hitStop: 0.055,
    shake: 0.2,
  },
  slash3: {
    duration: 0.84,
    activeStart: 0.28,
    activeEnd: 0.4,
    cancel: 0.6,
    bufferFrom: 0.05,
    damage: 1.5,
    knockback: 10,
    source: 'melee',
    lunge: 1.4,
    lungeTarget: 2.4,
    lungeStart: 0.08,
    lungeEnd: 0.33,
    impact: 0.36,
    hitStop: 0.085,
    shake: 0.38,
  },
  spin: {
    duration: 0.78,
    activeStart: 0.04,
    activeEnd: 0.46,
    cancel: 0.56,
    bufferFrom: 0.2,
    damage: 2,
    knockback: 9,
    source: 'spin',
    lunge: 0.6,
    lungeTarget: 1.2,
    lungeStart: 0,
    lungeEnd: 0.42,
    impact: -1,
    hitStop: 0.07,
    shake: 0.3,
  },
  jumpSlash: {
    duration: 1.44,
    activeStart: 0.1,
    activeEnd: 1.08,
    cancel: 1.26,
    bufferFrom: 1,
    damage: 2,
    knockback: 9,
    source: 'jumpSlash',
    lunge: 0,
    lungeTarget: 0,
    lungeStart: 0,
    lungeEnd: 0,
    impact: 1,
    hitStop: 0.09,
    shake: 0.5,
  },
  flurry: {
    duration: 1.46,
    activeStart: 0.13,
    activeEnd: 1.06,
    cancel: 1.26,
    bufferFrom: 1.1,
    damage: 0.6,
    knockback: 0.6,
    source: 'flurry',
    lunge: 0,
    lungeTarget: 0,
    lungeStart: 0,
    lungeEnd: 0,
    impact: 0.98,
    hitStop: 0.03,
    shake: 0.12,
  },
};
export const COMBO = ['slash1', 'slash2', 'slash3'];
const COMBO_WINDOW = 0.5;
export const FLURRY = {
  dash: 0.13,
  first: 0.14,
  stroke: 0.094,
  count: 8,
  finisher: 0.9,
  finisherHit: 0.98,
};
export function flurryStroke(t) {
  return t < FLURRY.first
    ? -1
    : t >= FLURRY.finisher
      ? FLURRY.count
      : Math.min(FLURRY.count - 1, Math.floor((t - FLURRY.first) / FLURRY.stroke));
}
export const JUMP_SLASH = {
  hang: 0.16,
  land: 1,
  plungeSpeed: 26,
};
export const SPIN_CHARGE = {
  start: 0.3,
  full: 0.55,
  min: 0.25,
};
export const DODGES = {
  forward: {
    dur: 0.46,
    iframes: 0.3,
    speed: 10.5,
    vy: 0,
  },
  back: {
    dur: 0.58,
    iframes: 0.34,
    speed: 7.2,
    vy: 8.6,
  },
  left: {
    dur: 0.44,
    iframes: 0.28,
    speed: 9.5,
    vy: 5.2,
  },
  right: {
    dur: 0.44,
    iframes: 0.28,
    speed: 9.5,
    vy: 5.2,
  },
};
const PERFECT_DODGE_WINDOW = 0.32;
export const MASTERSTROKE_SLOWMO = {
  scale: 0.25,
  seconds: 1.4,
};
export const MASTERSTROKE_WINDOW = 0.46;
export const ITEM_HOLD = {
  turn: 0.34,
  raise: 0.42,
  reveal: 0.5,
  lower: 3.45,
  dur: 3.95,
};
export const CHROMA_BRUSH = {
  damage: 1.5,
  prismDamage: 0.3,
  waveTime: 0.55,
  waveRadius: 6.5,
};
export const SKY_MANTLE = {
  unfurl: 1.85,
  on: 2.72,
};
