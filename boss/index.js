/**
 * Boss system entry: builds the arena, effects, Greymaw and its encounter, exposes debug controls on window.__wbBoss, and returns the boss status other systems read.
 */
import { Vector3 } from 'three';
import { Arena } from './arena.js';
import { BossEncounter } from './encounter.js';
import { BossFx } from './fx.js';
import { Greymaw } from './greymaw.js';
export async function create(ctx) {
  const debug = new Set(
    (ctx.params.get('boss') ?? '')
      .split(',')
      .map((flag) => flag.trim())
      .filter(Boolean),
  );
  const arena = new Arena(ctx);
  const fx = new BossFx(
    ctx,
    (x, z) => arena.groundAt(x, z),
    (x, z) => arena.inside(x, z, -1),
  );
  ctx.scene.add(fx.group);
  const boss = new Greymaw(ctx, arena, fx, {
    noAttack: debug.has('idle'),
  });
  const encounter = new BossEncounter(ctx, arena, boss, fx, {
    debug,
  });
  window.__wbBoss = {
    boss,
    encounter,
    arena,
    force: (kind) => boss.force(kind),
    damage: (amount) => boss.debugDamage(amount),
    kill: () => {
      boss.health = 0;
      boss.onDefeat?.();
    },
    stagger: (reason = 'fist') => boss.stagger(reason),
    shatter: (index) => boss.debugShatter(index),
    info: () => boss.debugInfo(),
    parts: () => boss.debugParts(),
    hitPart: (part, options = {}) => {
      const target = boss.debugParts()[part];
      if (!target) return [];
      const from = ctx.player?.state?.position ?? target.pos;
      const direction = new Vector3(target.pos.x - from.x, 0, target.pos.z - from.z);
      if (direction.lengthSq() < 0.000001) direction.set(0, 0, -1);
      direction.normalize();
      return ctx.enemies.hitSphere(target.pos, options.radius ?? 0.6, {
        damage: options.damage ?? 2.5,
        color: options.color ?? null,
        direction,
        knockback: 4,
        source: options.source ?? 'art',
        point: target.pos.clone(),
      });
    },
  };
  return {
    name: 'Greymaw',
    arena: arena.center.clone(),
    get active() {
      return encounter.fightActive && !encounter.defeated;
    },
    get defeated() {
      return encounter.defeated;
    },
    get health() {
      return boss.health;
    },
    get maxHealth() {
      return boss.maxHealth;
    },
    get phase() {
      return encounter.fightActive ? boss.phase : 0;
    },
    update(dt) {
      encounter.update(dt);
    },
    lateUpdate(dt) {
      encounter.lateUpdate(dt);
    },
    dispose() {
      encounter.dispose();
    },
  };
}
