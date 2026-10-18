/**
 * Populates the Painted Aerie once the hero gets near: its two sky elite arenas (Thornmother and Galecaller), the camps at its pack spots and a few wandering Smudges.
 */
import { Vector3 } from 'three';
import { SKY_ELITES } from './defs.js';
const AERIE_PACKS = [
  {
    spot: 'packA',
    kinds: ['smudgeling', 'smudgeling', 'spitter'],
  },
  {
    spot: 'packB',
    kinds: ['brute', 'smudgeling', 'smudgeling'],
  },
  {
    spot: 'packC',
    kinds: ['spitter', 'smudgeling', 'brute'],
  },
];
const AERIE_WANDERERS = ['smudgeling', 'spitter'];
const AERIE_POPULATE_RADIUS = 150;
export class AerieEnemies {
  ctx;
  d;
  arenas;
  built = false;
  spawned = false;
  t = 0;
  arenaIds = [];
  constructor(ctx, d, arenas) {
    this.ctx = ctx;
    this.d = d;
    this.arenas = arenas;
  }
  spots() {
    const sky = this.ctx.sky;
    if (!sky || sky.isStub) return null;
    const spots = sky.spots;
    if (!spots || typeof spots != 'object') return null;
    for (const key of Object.keys(spots)) {
      const spot = spots[key];
      if (spot && Number.isFinite(spot.x + spot.y + spot.z)) return spots;
    }
    return null;
  }
  spot(spots, key) {
    const spot = spots[key];
    return spot && Number.isFinite(spot.x + spot.y + spot.z) ? spot : null;
  }
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const spots = this.spots();
    if (spots && (this.built || ((this.built = true), this.build(spots)), !this.spawned)) {
      const pPos = this.d.pPos;
      const center = this.ctx.sky.center;
      if (
        Math.hypot(pPos.x - center.x, pPos.z - center.z) < AERIE_POPULATE_RADIUS ||
        this.ctx.params.has('elitewarp')
      ) {
        this.spawned = true;
        this.populate(spots);
      }
    }
  }
  build(spots) {
    if (!this.arenas) return;
    const landing = this.spot(spots, 'landing') ?? this.ctx.sky.center;
    const elites = [
      {
        key: 'eliteA',
        id: 'thornmother',
        e: SKY_ELITES.thornmother,
        escorts: ['smudgeling', 'brute'],
      },
      {
        key: 'eliteB',
        id: 'galecaller',
        e: SKY_ELITES.galecaller,
        escorts: ['smudgeling', 'spitter'],
      },
    ];
    for (const elite of elites) {
      const spot = this.spot(spots, elite.key);
      if (!spot) continue;
      let fromX = landing.x;
      let fromZ = landing.z;
      if (Math.hypot(fromX - spot.x, fromZ - spot.z) < 3) {
        fromX = spot.x + (spot.x - this.ctx.sky.center.x);
        fromZ = spot.z + (spot.z - this.ctx.sky.center.z);
      }
      if (
        this.arenas.addSkyArena({
          id: elite.id,
          element: elite.e.element,
          kind: elite.e.kind,
          name: elite.e.name,
          x: spot.x,
          z: spot.z,
          y: spot.y,
          from: [fromX, fromZ],
          escorts: elite.escorts,
          clear: 8,
          tier: 2,
          sky: true,
        })
      )
        this.arenaIds.push(elite.id);
    }
  }
  populate(spots) {
    const nocombat = this.ctx.params.get('nocombat');
    if (nocombat && nocombat !== '0') return;
    if (this.arenas) {
      for (const arena of this.arenas.list) if (arena.def.sky) this.arenas.spawnArena(arena);
    } else {
      const elites = [
        ['eliteA', SKY_ELITES.thornmother],
        ['eliteB', SKY_ELITES.galecaller],
      ];
      for (const [key, elite] of elites) {
        const spot = this.spot(spots, key);
        if (spot)
          this.d.spawn(elite.kind, spot.clone(), {
            elite: {
              name: elite.name,
              element: elite.element,
            },
          });
      }
    }
    for (const pack of AERIE_PACKS) {
      const spot = this.spot(spots, pack.spot);
      if (spot) this.d.spawnCamp(`aerie-${pack.spot}`, spot.clone(), pack.kinds, 5, true, 2);
    }
    const points = this.wanderPoints(spots);
    AERIE_WANDERERS.forEach((kind, i) => {
      const point = points[i];
      if (!point) return;
      const id = this.d.spawn(kind, point, {
        tier: 2,
        facing: Math.random() * Math.PI * 2,
      });
      const enemy = this.d.byId.get(id);
      if (enemy) enemy.wanderRadius = 8;
    });
  }
  wanderPoints(spots) {
    const keys = ['landing', 'shrine', 'packA', 'packB', 'packC', 'eliteA', 'eliteB'];
    const anchors = [];
    for (const key of keys) {
      const spot = this.spot(spots, key);
      if (spot) anchors.push(spot);
    }
    anchors.push(this.ctx.sky.center);
    const landing = this.spot(spots, 'landing');
    const picked = [];
    const midpoints = [];
    for (let i = 0; i < anchors.length; i++)
      for (let j = i + 1; j < anchors.length; j++)
        midpoints.push(new Vector3().addVectors(anchors[i], anchors[j]).multiplyScalar(0.5));
    for (const mid of midpoints) {
      const y = this.d.skyAt(mid.x, mid.z);
      if (
        y !== null &&
        ((mid.y = y),
        this.d.skyGroundOk(mid.x, mid.z, y, 2.2) &&
          !(landing && Math.hypot(mid.x - landing.x, mid.z - landing.z) < 14) &&
          !anchors.some((anchor) => anchor !== landing && Math.hypot(mid.x - anchor.x, mid.z - anchor.z) < 9) &&
          !picked.some((p) => Math.hypot(mid.x - p.x, mid.z - p.z) < 12) &&
          (picked.push(mid), picked.length >= AERIE_WANDERERS.length))
      )
        break;
    }
    return picked;
  }
}
