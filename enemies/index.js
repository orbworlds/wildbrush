/**
 * Enemies system entry: builds the director, a registry of external lock-on targets such as boss parts, the elite arenas and the Aerie encounter, handles debug spawns from the URL and exposes the spawn, query, damage, hitSphere and lock-on API.
 */
import { MathUtils, Vector3 } from 'three';
import { PALETTE } from '../core/config.js';
import { AerieEnemies } from './aerie.js';
import { ELITE_ARENAS, EliteArenas } from './arenas.js';
import { SKY_ELITES } from './defs.js';
import { EnemyDirector } from './director.js';
const _aimPoint = new Vector3();
const _toAim = new Vector3();
class ExternalTargets {
  map = new Map();
  register(target) {
    if (target && target.info && Number.isFinite(target.info.id)) this.map.set(target.info.id, target);
  }
  unregister(id) {
    this.map.delete(id);
  }
  get(id) {
    return this.map.get(id)?.info;
  }
  has(id) {
    return this.map.has(id);
  }
  damage(id, hit) {
    const target = this.map.get(id);
    return !target || !target.info.alive ? false : !!target.onHit(hit);
  }
  query(center, radius, out) {
    for (const target of this.map.values()) {
      const info = target.info;
      if (info.alive && Math.hypot(info.position.x - center.x, info.position.z - center.z) - info.radius <= radius)
        out.push(info);
    }
  }
  hitSphere(center, radius, hit, hitIds, out) {
    for (const target of this.map.values()) {
      const info = target.info;
      if (info.alive && !hitIds?.has(info.id) && target.hitTest(center, radius) && target.onHit(hit)) {
        out.push(info.id);
        hitIds?.add(info.id);
      }
    }
  }
  alertedCount() {
    let count = 0;
    for (const target of this.map.values()) if (target.info.alive && target.info.alerted) count++;
    return count;
  }
  static score(info, from, dir, range) {
    if (info.aim) _aimPoint.copy(info.aim);
    else _aimPoint.copy(info.position).setY(info.position.y + info.height * 0.6);
    _toAim.subVectors(_aimPoint, from);
    const dist = _toAim.length();
    if (dist > range + info.radius || dist < 0.001) return Infinity;
    const angle = Math.acos(MathUtils.clamp(_toAim.dot(dir) / dist, -1, 1));
    return angle > 0.95 ? Infinity : angle + (Math.max(0, dist - info.radius) / Math.max(1, range)) * 0.6;
  }
  bestLock(from, dir, range) {
    let best = null;
    for (const target of this.map.values()) {
      if (!target.info.alive) continue;
      const score = ExternalTargets.score(target.info, from, dir, range);
      if (score < (best?.score ?? Infinity))
        best = {
          id: target.info.id,
          score,
        };
    }
    return best;
  }
}
const ELITE_BY_ELEMENT = {
  red: {
    kind: 'brute',
    name: 'Cinderjaw',
  },
  blue: {
    kind: 'spitter',
    name: 'Rimecaller',
  },
  yellow: {
    kind: 'smudgeling',
    name: 'Bounder',
  },
  green: {
    kind: SKY_ELITES.thornmother.kind,
    name: SKY_ELITES.thornmother.name,
  },
};
export async function create(ctx) {
  const flags = new Set((ctx.params.get('enemies') ?? '').split(',').filter(Boolean));
  const director = new EnemyDirector(ctx, {
    noAttack: flags.has('idle') || flags.has('zoo'),
    zoo: flags.has('zoo'),
    zooState: ctx.params.get('enemystate'),
    freeze: flags.has('freeze'),
  });
  window.__wbEnemies = director;
  const targets = new ExternalTargets();
  let arenas = null;
  try {
    arenas = new EliteArenas(ctx, director);
    director.root.add(arenas.group);
    director.elite.onDefeated = (elite) => arenas?.onDefeated(elite);
  } catch (err) {
    console.warn('[enemies] arenas failed', err);
    arenas = null;
  }
  let aerie = null;
  try {
    aerie = new AerieEnemies(ctx, director, arenas);
  } catch (err) {
    console.warn('[enemies] aerie failed', err);
    aerie = null;
  }
  const offs = [];
  offs.push(
    ctx.events.on('paint:splat', (data) => {
      if (data && data.surface === 'enemy')
        try {
          director.onSplat(data.colliderHandle, data.color, data.position, data.normal);
        } catch (err) {
          console.warn('[enemies] splat handling failed', err);
        }
    }),
  );
  offs.push(ctx.events.on('player:death', () => director.onPlayerDeath()));
  offs.push(
    ctx.events.on('player:respawn', () => {
      director.onPlayerRespawn();
      try {
        arenas?.onPlayerRespawn();
      } catch (err) {
        console.warn('[enemies] arena respawn failed', err);
      }
    }),
  );
  try {
    const spawnPoint = ctx.terrain.landmarks?.spawn ?? new Vector3(0, 0, 0);
    const nearSpawn = (dx, dz) => new Vector3(spawnPoint.x + dx, -1000, spawnPoint.z + dz);
    if (flags.has('demo')) {
      director.spawn('smudgeling', nearSpawn(-3.5, -10), {
        facing: 0.3,
      });
      director.spawn('spitter', nearSpawn(4.5, -14), {
        facing: -0.3,
      });
      director.spawn('brute', nearSpawn(0.5, -15), {
        facing: 0,
      });
    }
    if (flags.has('pack')) {
      director.spawn('smudgeling', nearSpawn(-2.5, -11), {
        facing: 0,
      });
      director.spawn('smudgeling', nearSpawn(0.5, -12.5), {
        facing: 0,
      });
      director.spawn('smudgeling', nearSpawn(3, -11), {
        facing: 0,
      });
    }
    if (flags.has('camp'))
      director.spawnCamp('debug-camp', nearSpawn(0, -24), ['smudgeling', 'smudgeling', 'spitter', 'brute'], 6, true);
    const parseEliteFlag = (flag) => {
      if (flag === 'elite-thornmother' || flag === 'elite-galecaller') {
        const named = flag === 'elite-thornmother' ? SKY_ELITES.thornmother : SKY_ELITES.galecaller;
        return {
          kind: named.kind,
          elite: {
            name: named.name,
            element: named.element,
          },
        };
      }
      const match = /^elite-(red|blue|yellow|green)$/.exec(flag);
      if (!match) return null;
      const element = match[1];
      const rosterEntry = ELITE_ARENAS.find((entry) => entry.element === element);
      return {
        kind: rosterEntry?.kind ?? ELITE_BY_ELEMENT[element].kind,
        elite: {
          name: rosterEntry?.name ?? ELITE_BY_ELEMENT[element].name,
          element,
        },
      };
    };
    if (flags.has('zoo')) {
      const zooKinds = ctx.params.get('zookinds');
      const kinds = zooKinds ? zooKinds.split(',') : ['smudgeling', 'spitter', 'brute'];
      const gap = Number(ctx.params.get('zoogap') ?? '2.6');
      kinds.forEach((spec, i) => {
        const eliteSpec = parseEliteFlag(spec);
        const isStorm = spec.startsWith('storm-');
        const kind = eliteSpec?.kind ?? (isStorm ? spec.slice(6) : spec);
        director.spawn(kind, nearSpawn((i - (kinds.length - 1) / 2) * gap + (kind === 'brute' ? 0.6 : 0), -6), {
          facing: 0,
          elite: eliteSpec?.elite,
          tier: isStorm ? 2 : 1,
        });
      });
    }
    for (const key of [...Object.keys(PALETTE), 'thornmother', 'galecaller']) {
      if (!flags.has(`elite-${key}`)) continue;
      const eliteSpec = parseEliteFlag(`elite-${key}`);
      if (eliteSpec)
        director.spawn(eliteSpec.kind, nearSpawn(0, -14), {
          facing: 0,
          elite: eliteSpec.elite,
        });
    }
    ['smudgeling', 'spitter', 'brute'].forEach((kind, i) => {
      if (flags.has(`storm-${kind}`))
        director.spawn(kind, nearSpawn((i - 1) * 3.5, kind === 'spitter' ? -14 : -11), {
          facing: 0,
          tier: 2,
        });
    });
    if (flags.has('storm')) {
      director.spawn('smudgeling', nearSpawn(-3.5, -10), {
        facing: 0.3,
        tier: 2,
      });
      director.spawn('spitter', nearSpawn(4.5, -14), {
        facing: -0.3,
        tier: 2,
      });
      director.spawn('brute', nearSpawn(0.5, -15), {
        facing: 0,
        tier: 2,
      });
    }
    if (flags.has('elites'))
      ELITE_ARENAS.forEach((elite, i) =>
        director.spawn(elite.kind, nearSpawn((i - 1) * 7, -14), {
          facing: 0,
          elite: {
            name: elite.name,
            element: elite.element,
          },
        }),
      );
  } catch (err) {
    console.warn('[enemies] debug spawn failed', err);
  }
  return {
    director,
    spawn(kind, pos, opts) {
      try {
        return !pos || !Number.isFinite(pos.x + pos.z) ? -1 : director.spawn(kind, pos, opts);
      } catch (err) {
        console.warn('[enemies] spawn failed', err);
        return -1;
      }
    },
    spawnCamp(id, center, kinds, opts) {
      try {
        if (!center || !Number.isFinite(center.x + center.z) || !Array.isArray(kinds)) return;
        director.spawnCamp(id, center, kinds, opts?.radius ?? 6, opts?.respawn ?? true, opts?.tier === 2 ? 2 : 1);
      } catch (err) {
        console.warn('[enemies] spawnCamp failed', err);
      }
    },
    get(id) {
      return director.byId.get(id) ?? targets.get(id);
    },
    query(center, radius) {
      try {
        const found = director.query(center, radius);
        if (targets.map.size) {
          targets.query(center, radius, found);
          found.sort((a, b) => a.position.distanceToSquared(center) - b.position.distanceToSquared(center));
        }
        return found;
      } catch {
        return [];
      }
    },
    damage(id, hit) {
      try {
        return targets.has(id) ? targets.damage(id, hit) : director.damage(id, hit);
      } catch (err) {
        console.warn('[enemies] damage failed', err);
        return false;
      }
    },
    hitSphere(center, radius, hit, hitIds) {
      try {
        const hits = director.hitSphere(center, radius, hit, hitIds);
        if (targets.map.size) targets.hitSphere(center, radius, hit, hitIds, hits);
        return hits;
      } catch (err) {
        console.warn('[enemies] hitSphere failed', err);
        return [];
      }
    },
    findLockTarget(from, dir, range) {
      try {
        const maxRange = range ?? 25;
        const lockTarget = director.findLockTarget(from, dir, maxRange);
        if (!targets.map.size) return lockTarget;
        const externalBest = targets.bestLock(from, dir, maxRange);
        if (!externalBest) return lockTarget;
        if (lockTarget == null) return externalBest.id;
        const enemy = director.byId.get(lockTarget);
        const enemyScore = enemy ? ExternalTargets.score(enemy, from, dir, maxRange) : Infinity;
        return externalBest.score < enemyScore ? externalBest.id : lockTarget;
      } catch {
        return null;
      }
    },
    get alertedCount() {
      return director.alertedCount + (targets.map.size ? targets.alertedCount() : 0);
    },
    registerTarget(target) {
      targets.register(target);
    },
    unregisterTarget(id) {
      targets.unregister(id);
    },
    update(dt) {
      try {
        aerie?.update(dt);
      } catch (err) {
        console.warn('[enemies] aerie update failed', err);
      }
      try {
        arenas?.update();
      } catch (err) {
        console.warn('[enemies] arenas update failed', err);
      }
      director.update(dt);
    },
    lateUpdate(dt) {
      director.lateUpdate(dt);
    },
    dispose() {
      for (const off of offs) off();
    },
  };
}
