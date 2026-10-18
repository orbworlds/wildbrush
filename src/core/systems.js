/**
 * The sixteen game systems: a lazy import for each one and the order boot creates them in.
 */
export const SYSTEM_LOADERS = {
  environment: () => import('../render/index.js'),
  paint: () => import('../paint/index.js'),
  terrain: () => import('../terrain/index.js'),
  water: () => import('../water/index.js'),
  vegetation: () => import('../vegetation/index.js'),
  elements: () => import('../elements/index.js'),
  enemies: () => import('../enemies/index.js'),
  boss: () => import('../boss/index.js'),
  sky: () => import('../sky/index.js'),
  caverns: () => import('../caverns/index.js'),
  temples: () => import('../temples/index.js'),
  player: () => import('../player/index.js'),
  character: () => import('../character/index.js'),
  content: () => import('../content/index.js'),
  ui: () => import('../ui/index.js'),
  audio: () => import('../audio/index.js'),
};
export const SYSTEM_ORDER = [
  'environment',
  'paint',
  'terrain',
  'water',
  'vegetation',
  'sky',
  'elements',
  'enemies',
  'boss',
  'caverns',
  'temples',
  'player',
  'character',
  'content',
  'ui',
  'audio',
];
