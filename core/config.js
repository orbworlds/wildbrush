/**
 * Game-wide constants every system imports: gravity, the four paint colours and their palette, island landmarks and special sites (dry meadow, boss arena, sky island, interior pockets), item and art definitions, and the Rapier collision groups.
 */
export const GRAVITY_Y = -19.6;
export const COLORS = ['red', 'blue', 'yellow', 'green'];
export const DEFAULT_COLOR = 'green';
export const PALETTE = {
  red: {
    name: 'Ember',
    element: 'fire',
    hex: 0xff5b3a,
    css: '#ff5b3a',
    channel: 0,
    verb: 'Ignites grass, wood and brambles. Melts ice.',
  },
  blue: {
    name: 'Frost',
    element: 'ice',
    hex: 0x4cc3ff,
    css: '#4cc3ff',
    channel: 1,
    verb: 'Freezes water into ice. Makes ground slippery.',
  },
  yellow: {
    name: 'Spring',
    element: 'bounce',
    hex: 0xffd447,
    css: '#ffd447',
    channel: 2,
    verb: 'Makes any surface bouncy.',
  },
  green: {
    name: 'Bloom',
    element: 'growth',
    hex: 0x58d66b,
    css: '#58d66b',
    channel: 3,
    verb: 'Grows climbable vines. Regrows burnt land.',
  },
};
export const LANDMARKS = {
  spawn: {
    x: 0,
    z: 105,
    note: 'South meadow, gentle rolling grassland ~6-10m elevation. Player spawns here facing north (-z) with a view of the summit.',
  },
  beach: {
    x: 70,
    z: 120,
    note: 'South-east sandy beach and shallows.',
  },
  forest: {
    x: 85,
    z: 50,
    note: 'East woodland on gentle hills.',
  },
  lake: {
    x: -75,
    z: 25,
    note: 'West freshwater lake: basin carved below sea level, radius ~38m, shores ~2-4m above water.',
  },
  lakeIslet: {
    x: -75,
    z: 25,
    note: 'Small rocky islet (radius ~6m, top ~3m above water) in the middle of the lake. Frost trial.',
  },
  mesa: {
    x: -60,
    z: -75,
    note: 'North-west sheer-walled plateau. Base ~10m, flat top ~46m (radius ~14m). A rest ledge at ~26m on the south face. Bloom trial on top.',
  },
  summit: {
    x: 10,
    z: -40,
    note: 'Central peak ~68m, highest point, panoramic glider launch. Dry golden grass field on its south slope (fire updraft playground).',
  },
  tower: {
    x: 90,
    z: -25,
    note: 'East rocky hill ~12m with a flat top (radius ~12m) where content builds a ruined tower. Spring trial.',
  },
  canyon: {
    x: 55,
    z: -85,
    note: 'Entrance of a narrow (6-8m wide) canyon cut through a ridge. Content places a bramble gate here. Ember trial.',
  },
  grove: {
    x: 60,
    z: -120,
    note: 'Hidden grove enclosed by cliffs beyond the canyon. Ember trial prism sits here.',
  },
};
export const DRY_MEADOW = {
  x: 10,
  z: -5,
  radius: 30,
};
export const BOSS_ARENA = {
  x: -2,
  z: -89,
  radius: 22,
};
export const SKY_ISLAND = {
  x: 108,
  z: -108,
  y: 108,
  radius: 34,
};
export const INTERIOR_POCKETS = {
  glowcap: {
    x: 60,
    z: 60,
    y: 230,
    size: 80,
  },
  kiln: {
    x: -10,
    z: -30,
    y: 240,
    size: 64,
  },
  cistern: {
    x: -30,
    z: 90,
    y: 240,
    size: 64,
  },
};
export const EXTERNAL_TARGET_ID_BASE = 1000000;
export const ITEMS = {
  heartContainer: {
    name: 'Heart of Colour',
    description: 'A heart woven from reclaimed colour. Your maximum hearts increase by one.',
  },
  chromaBrush: {
    name: 'The Chroma Brush',
    description: 'The legendary brush of the first painters. Every stroke blazes with all four colours.',
  },
  staminaVessel: {
    name: 'Stamina Vessel',
    description: 'Wind-song from the Aerie fills your lungs. Your stamina grows.',
  },
  skyMantle: {
    name: 'The Sky Mantle',
    description: 'Woven by the first painters from sunset and cloud. Boosting in flight costs far less stamina.',
  },
  lantern: {
    name: 'The Glowcap Lantern',
    description: 'A lantern of living mushroom-light. It glows around you in dark places and at night.',
  },
  emberCrest: {
    name: 'The Ember Crest',
    description: 'The Kiln’s seal. Your Fireball blazes bigger and leaves a ring of flame.',
  },
  frostCrest: {
    name: 'The Frost Crest',
    description: 'The Cistern’s seal. Your Ice Lance pierces everything and freezes a path behind it.',
  },
  cloudstep: {
    name: 'Cloudstep Boots',
    description: 'Boots stitched from cloud. Jump again in mid-air!',
  },
  brushflight: {
    name: 'Brushflight',
    description: 'The summit remembers how the first painters travelled. Ride your brush and paint the sky.',
  },
};
export const ART_CHARGE_TIME = 0.4;
export const ARTS = {
  red: {
    art: 'fireball',
    name: 'Fireball',
    ink: 12,
    description: 'A roaring ball of Ember that explodes and sets things ablaze.',
  },
  blue: {
    art: 'iceLance',
    name: 'Ice Lance',
    ink: 12,
    description: 'A straight, piercing spear of Frost that freezes what it strikes.',
  },
  yellow: {
    art: 'bounceOrb',
    name: 'Bounce Orb',
    ink: 12,
    description: 'A springy orb that ricochets from foe to foe, launching them.',
  },
  green: {
    art: 'vineLash',
    name: 'Vine Lash',
    ink: 12,
    description: 'A whipping vine that roots foes — or grows a climbable ladder up a wall.',
  },
};
export const COLLISION_LAYERS = {
  TERRAIN: 1,
  STATIC: 2,
  PROP: 4,
  PLAYER: 8,
  ICE: 16,
  SENSOR: 32,
  ENEMY: 64,
  ALL: 65535,
};
export function interactionGroups(memberships, filter) {
  return ((memberships & 65535) << 16) | (filter & 65535);
}
export const COLLISION_GROUPS = {
  terrain: interactionGroups(COLLISION_LAYERS.TERRAIN, COLLISION_LAYERS.ALL),
  static: interactionGroups(COLLISION_LAYERS.STATIC, COLLISION_LAYERS.ALL),
  prop: interactionGroups(COLLISION_LAYERS.PROP, COLLISION_LAYERS.ALL),
  ice: interactionGroups(COLLISION_LAYERS.ICE, COLLISION_LAYERS.ALL),
  player: interactionGroups(
    COLLISION_LAYERS.PLAYER,
    COLLISION_LAYERS.TERRAIN | COLLISION_LAYERS.STATIC | COLLISION_LAYERS.PROP | COLLISION_LAYERS.ICE,
  ),
  enemy: interactionGroups(
    COLLISION_LAYERS.ENEMY,
    COLLISION_LAYERS.TERRAIN |
      COLLISION_LAYERS.STATIC |
      COLLISION_LAYERS.PROP |
      COLLISION_LAYERS.ICE |
      COLLISION_LAYERS.ENEMY,
  ),
  worldQuery: interactionGroups(
    COLLISION_LAYERS.ALL,
    COLLISION_LAYERS.TERRAIN | COLLISION_LAYERS.STATIC | COLLISION_LAYERS.PROP | COLLISION_LAYERS.ICE,
  ),
  combatQuery: interactionGroups(
    COLLISION_LAYERS.ALL,
    COLLISION_LAYERS.TERRAIN |
      COLLISION_LAYERS.STATIC |
      COLLISION_LAYERS.PROP |
      COLLISION_LAYERS.ICE |
      COLLISION_LAYERS.ENEMY,
  ),
};
