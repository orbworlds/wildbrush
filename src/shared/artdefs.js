/**
 * Brush art definitions: hold-to-charge and cooldown timings, which art each paint colour casts (fireball, ice lance, bounce orb, vine lash), each art's tuning, and the Ember and Frost Crest upgrades.
 */
export const ART_CHARGE = {
  tap: 0.08,
  time: 0.6,
};
export const ART_COOLDOWN = 0.5;
export const FIZZLE_COOLDOWN = 0.35;
export const ART_TIMING = {
  fireball: {
    release: 0.1,
    dur: 0.62,
  },
  iceLance: {
    release: 0.075,
    dur: 0.56,
  },
  bounceOrb: {
    release: 0.085,
    dur: 0.52,
  },
  vineLash: {
    release: 0.06,
    dur: 0.66,
  },
};
export const ART_BY_COLOR = {
  red: 'fireball',
  blue: 'iceLance',
  yellow: 'bounceOrb',
  green: 'vineLash',
};
export const COLOR_BY_ART = {
  fireball: 'red',
  iceLance: 'blue',
  bounceOrb: 'yellow',
  vineLash: 'green',
};
export const FIREBALL = {
  speed: 26,
  gravity: 6,
  hitR: 0.7,
  radius: 0.34,
  life: 3,
  direct: 3,
  aoe: [
    [1.3, 3],
    [2.4, 2.2],
    [3.5, 1.5],
  ],
  knockback: 9,
  ignite: 2.4,
  paint: 1.7,
};
export const ICE_LANCE = {
  speed: 45,
  range: 62,
  hitR: 0.6,
  pierce: 3,
  damage: 2.5,
  knockback: 3.5,
  skim: 2.6,
  floeStep: 2.3,
  floeR: 1.9,
};
export const BOUNCE_ORB = {
  speed: 20,
  gravity: 13,
  hitR: 0.65,
  radius: 0.3,
  bounces: 4,
  damage: 1.5,
  knockback: 3,
  seek: 10,
  perFoe: 2,
  pad: 0.95,
  life: 5.5,
};
export const VINE_LASH = {
  range: 22,
  speed: 190,
  hitR: 0.65,
  damage: 2,
  yank: 12,
  rootDelay: 0.3,
  ladder: 6,
  ladderR: 0.9,
  hold: 0.24,
  retract: 0.2,
  thornR: 2.1,
  thornLife: 3.6,
  thornDamage: 0.3,
};
export const EMBER_CREST = {
  radiusMul: 1.5,
  damageMul: 1.3,
  inkMul: 0.75,
  ringR: 3.6,
  ringLife: 3,
  ringDamage: 0.35,
  ringTick: 0.4,
  ringPts: 28,
};
export const FROST_CREST = {
  pathStep: 1.7,
  reach: 5.5,
  patchR: 1.05,
  floeR: 2.1,
  statusScale: 1.8,
};
