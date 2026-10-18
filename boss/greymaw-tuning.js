/**
 * Greymaw's tuning: phase names, the counter colour that breaks each crystal, hit-target ids and slots, health and phase thresholds, damage taken by hit source, armour, hit radii, stagger times and the mask-interrupt rule.
 */
import { COLLISION_LAYERS, EXTERNAL_TARGET_ID_BASE, interactionGroups } from '../core/config.js';
export const PHASE_NAMES = ['', 'The Grey', 'The Stolen Colours', 'Desperation'];
export const COUNTER_COLOR = {
  red: 'blue',
  blue: 'red',
  yellow: 'green',
  green: 'yellow',
};
export const BOSS_ID_BASE = EXTERNAL_TARGET_ID_BASE + 4200;
export const SLOT_BODY = 0;
export const SLOT_MASK = 1;
export const SLOT_FIST = 2;
export const SLOT_CRYSTAL = 4;
export const MAX_HEALTH = 42;
export const PHASE2_AT = 0.65;
export const PHASE3_AT = 0.3;
export const SLAM_REACH = 14.6;
export const HIT_VOLUME_GROUPS = interactionGroups(COLLISION_LAYERS.ENEMY, COLLISION_LAYERS.SENSOR);
export const BODY_DAMAGE_MUL = {
  melee: 0.4,
  spin: 0.4,
  jumpSlash: 0.5,
  flurry: 0.6,
  blob: 0.4,
  art: 1,
  prop: 0.4,
};
export const MASK_DAMAGE_MUL = {
  melee: 1.15,
  spin: 1.15,
  jumpSlash: 1.15,
  flurry: 1.4,
  blob: 0.9,
  art: 1.25,
  prop: 1,
};
export const PHASE2_ARMOUR = 0.6;
export const CRYSTAL_HP = 3;
export const SHATTER_DAMAGE = 5;
export const CRYSTAL_RADIUS = 1.75;
export const MASK_RADIUS = 2.1;
export const MASK_RADIUS_EXPOSED = 2.6;
export const FIST_RADIUS = 1.75;
export const CRYSTAL_STAGGER = 3.6;
export const INTERRUPT_STAGGER = 2.8;
export const INTERRUPT_COOLDOWN = 6.5;
export const INTERRUPT_HITS = 5;
