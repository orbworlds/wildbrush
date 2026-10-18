/**
 * Enemy director: spawns Smudges and their camps, runs their senses and AI states (idle, wander, notice, engage, telegraph, attack, flee, search, return), hands out attack tokens, applies damage and paint statuses, moves them with Rapier character controllers, and plays their deaths, loot drops and ambient ink effects.
 */
import { Color, Frustum, Group, Matrix4, Sphere, Vector3 } from 'three';
import { COLLISION_GROUPS, COLORS, PALETTE } from '../core/config.js';
import { clamp } from '../core/math.js';
import { animateEnemy, initAnim } from './animation.js';
import { EnemyCamps } from './camps.js';
import {
  AI,
  ATTACKS,
  ELITE,
  eliteDef,
  eliteStyle,
  ENEMY_DEFS,
  STATUS_BY_COLOR,
  STATUS_TUNING,
  STORMBORNE,
  stormborneDef,
} from './defs.js';
import { Elites } from './elites.js';
import { CH, Enemy } from './enemy.js';
import { EnemyFx, FX_INK, paletteColor } from './fx.js';
import { Globs } from './globs.js';
import { BONE, buildModel } from './models.js';
import { Pickups } from './pickups.js';
import { EnemyRenderer } from './renderer.js';
import { partToWorld, topMatrix, writeInstance } from './rig-transforms.js';
import { Flames, IceShells, VineWraps } from './status-fx.js';
import { STORM_INK, STORM_VIOLET, STORM_WHITE, Stormborne } from './stormborne.js';
const ENEMY_KINDS = ['smudgeling', 'spitter', 'brute'];
const ENEMY_GRAVITY = 24;
const KCC_OFFSET = 0.03;
const randBetween = (min, max) => min + Math.random() * (max - min);
const wrapYaw2 = (angle) => {
  for (; angle > Math.PI;) angle -= Math.PI * 2;
  for (; angle < -Math.PI;) angle += Math.PI * 2;
  return angle;
};
const _smudgePos = new Vector3();
const _smudgeVec = new Vector3();
const _smudgeDir = new Vector3();
const _flameMatrix = new Matrix4();
const _fxTint = new Color();
const _cullFrustum = new Frustum();
const _projScreenMatrix = new Matrix4();
const _cullSphere = new Sphere();
const WARM_GLOW = new Color(1, 0.8, 0.5);
const FROST_GLINT = new Color(0xbfeaff);
const SOOT_GREY = new Color(0x3a3740);
const STEAM_WHITE = new Color(0xeef4f8);
const SPRING_SPARK = new Color(1, 0.85, 0.3);
const ROOT_SPARK = new Color(0.35, 1, 0.45);
const WATER_SPLASH = new Color(0x9fe3ea);
const PURE_WHITE = new Color(1, 1, 1);
export class EnemyDirector {
  ctx;
  opts;
  enemies = [];
  byId = new Map();
  byCollider = new Map();
  nextId = 1;
  models;
  renderers;
  kcc = {};
  eliteKcc = {};
  fx;
  flames;
  ice;
  vines;
  globs;
  pickups;
  camps;
  elite;
  storm;
  root = new Group();
  time = 0;
  pPos = new Vector3();
  pVel = new Vector3();
  pAlive = true;
  pSprinting = false;
  pSpeed = 0;
  pHealth = 5;
  pHealthMax = 5;
  alertedCount = 0;
  inCombat = false;
  holders = new Set();
  lastGrant = -99;
  lastMeleeGrant = -99;
  campT = 0;
  grace = 0;
  ray;
  flags;
  constructor(ctx, opts) {
    this.ctx = ctx;
    this.opts = opts;
    this.root.name = 'enemies';
    ctx.scene.add(this.root);
    this.models = {};
    this.renderers = {};
    for (const kind of ENEMY_KINDS) {
      const model = buildModel(kind);
      this.models[kind] = model;
      const renderer = new EnemyRenderer(ctx, kind, model, ENEMY_DEFS[kind].maxInstances, ENEMY_DEFS[kind].size);
      this.renderers[kind] = renderer;
      this.root.add(renderer.outlineMesh, renderer.mesh);
    }
    this.fx = new EnemyFx(
      ctx,
      (x, z, y) => this.ground(x, z, y),
      (x, z, y) => this.fxFloor(x, z, y),
    );
    this.flames = new Flames(ctx, 360);
    this.ice = new IceShells(ctx, 32);
    this.vines = new VineWraps(ctx, 32);
    this.root.add(this.fx.group, this.flames.mesh, this.ice.mesh, this.vines.mesh);
    this.globs = new Globs(ctx, this.fx, {
      touchesPlayer: (pos, radius) => this.touchesPlayer(pos, radius),
      hurtPlayer: (glob, dir) => this.globHurt(glob, dir),
      enemyAt: (pos, radius) => this.enemyAt(pos, radius),
      hitEnemy: (enemyId, glob, dir) => this.globHitEnemy(enemyId, glob, dir),
      ownerPos: (ownerId, out) => {
        const owner = this.byId.get(ownerId);
        return owner && owner.alive ? out.copy(owner.position) : null;
      },
      onLand: (glob, pos, inWater) => this.globLanded(glob, pos, inWater),
      bounceTarget: (glob, pos, out) => this.orbBounceTarget(glob, pos, out),
    });
    this.root.add(this.globs.mesh);
    this.pickups = new Pickups(ctx, this.fx);
    this.root.add(this.pickups.group);
    this.camps = new EnemyCamps(ctx, (x, z, y) => this.fxFloor(x, z, y));
    this.root.add(this.camps.group);
    this.elite = new Elites(ctx, this);
    this.root.add(this.elite.group);
    this.storm = new Stormborne(ctx, this);
    this.flags = ctx.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
    this.ray = new ctx.RAPIER.Ray(
      {
        x: 0,
        y: 0,
        z: 0,
      },
      {
        x: 0,
        y: 1,
        z: 0,
      },
    );
    for (const kind of ENEMY_KINDS)
      try {
        const def = ENEMY_DEFS[kind];
        const kcc = ctx.physics.createCharacterController(KCC_OFFSET);
        kcc.setUp({
          x: 0,
          y: 1,
          z: 0,
        });
        kcc.setSlideEnabled(true);
        kcc.enableAutostep(kind === 'brute' ? 0.6 : 0.32 * def.size ** 0.5, 0.15, false);
        kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
        kcc.setMinSlopeSlideAngle((58 * Math.PI) / 180);
        kcc.enableSnapToGround(kind === 'brute' ? 0.45 : 0.32);
        try {
          kcc.setApplyImpulsesToDynamicBodies(true);
          kcc.setCharacterMass(kind === 'brute' ? 400 : 30);
        } catch {}
        this.kcc[kind] = kcc;
      } catch (err) {
        console.warn('[enemies] KCC unavailable', err);
      }
  }
  ground(x, z, y) {
    let groundY = this.terrainAt(x, z);
    const skyY = this.skyAt(x, z);
    if (skyY !== null)
      if (y === undefined || !Number.isFinite(y)) {
        if (this.pPos.y >= skyY - 12 || groundY < 1) groundY = skyY;
      } else if (y >= skyY - 2) groundY = skyY;
    const pocket = this.pocketAt(x, z);
    if (pocket) {
      if (y === undefined || !Number.isFinite(y) || y < pocket.bounds.min.y)
        y = Math.min(pocket.bounds.max.y - 0.5, this.pPos.y + 4);
      groundY = Math.max(groundY, pocket.bounds.min.y - 2);
    }
    if (y === undefined || !Number.isFinite(y) || y < groundY + 0.3) return groundY;
    try {
      const RAPIER = this.ctx.RAPIER;
      const fromY = y + 0.5;
      const ray = new RAPIER.Ray(
        {
          x: x + 0.001,
          y: fromY,
          z: z + 0.001,
        },
        {
          x: 0,
          y: -1,
          z: 0,
        },
      );
      const hit = this.ctx.physics.castRay(ray, fromY - groundY + 0.2, true, 8, COLLISION_GROUPS.worldQuery);
      if (hit) return Math.max(groundY, fromY - hit.timeOfImpact);
    } catch {}
    return groundY;
  }
  terrainAt(x, z) {
    try {
      const h = this.ctx.terrain.heightAt(x, z);
      return Number.isFinite(h) ? h : 0;
    } catch {
      return 0;
    }
  }
  skyAt(x, z) {
    const sky = this.ctx.sky;
    if (!sky || sky.isStub) return null;
    try {
      const h = sky.surfaceAt(x, z);
      return h != null && Number.isFinite(h) ? h : null;
    } catch {
      return null;
    }
  }
  skyGroundOk(x, z, y, margin = 1.5) {
    const solid = (px, pz) => {
      const skyY = this.skyAt(px, pz);
      return skyY !== null && Math.abs(skyY - y) < 2.5;
    };
    return solid(x, z) && solid(x + margin, z) && solid(x - margin, z) && solid(x, z + margin) && solid(x, z - margin);
  }
  floorAt(x, z, y) {
    const terrainY = this.terrainAt(x, z);
    const skyY = this.skyAt(x, z);
    return skyY !== null && y > skyY - 2.5 ? skyY : terrainY;
  }
  fxFloor(x, z, y) {
    if (y === undefined || !Number.isFinite(y)) return this.ground(x, z);
    if (this.pocketAt(x, z)) return this.ground(x, z, y);
    const skyY = this.skyAt(x, z);
    return skyY !== null && y > skyY - 3 ? skyY : this.terrainAt(x, z);
  }
  pocketAt(x, z) {
    const current = this.ctx.interiors?.current;
    if (!current) return null;
    const bounds = current.bounds;
    return x >= bounds.min.x && x <= bounds.max.x && z >= bounds.min.z && z <= bounds.max.z ? current : null;
  }
  waterDepth(x, z, y) {
    if (this.pocketAt(x, z) && (y === undefined || y > 150)) return 0;
    const skyY = this.skyAt(x, z);
    if (skyY !== null && (y === undefined || y > skyY - 3)) return 0;
    try {
      const depth = this.ctx.water.depthAt(x, z);
      return Number.isFinite(depth) ? depth : 0;
    } catch {
      return 0;
    }
  }
  emit(type, payload) {
    try {
      this.ctx.events.emit(type, payload);
    } catch (err) {
      console.warn('[enemies] emit failed', type, err);
    }
  }
  playerState() {
    try {
      return this.ctx.player?.state ?? null;
    } catch {
      return null;
    }
  }
  touchesPlayer(pos, radius) {
    if (!this.pAlive) return false;
    const pPos = this.pPos;
    const nearY = clamp(pos.y, pPos.y + 0.35, pPos.y + 1.35);
    const dx = pos.x - pPos.x;
    const dy = pos.y - nearY;
    const dz = pos.z - pPos.z;
    return dx * dx + dy * dy + dz * dz <= (radius + 0.35) ** 2;
  }
  enemyAt(pos, radius) {
    for (const enemy of this.enemies)
      if (enemy.alive && enemy.state !== 'rise' && this.sphereHitsEnemy(enemy, pos, radius)) return enemy.id;
    return -1;
  }
  sphereHitsEnemy(enemy, center, radius) {
    const topY = enemy.position.y + enemy.height - enemy.radius;
    const bottomY = enemy.position.y + enemy.radius;
    const nearY = clamp(center.y, bottomY, Math.max(bottomY, topY));
    const dx = center.x - enemy.position.x;
    const dy = center.y - nearY;
    const dz = center.z - enemy.position.z;
    return dx * dx + dy * dy + dz * dz <= (radius + enemy.radius) ** 2;
  }
  los(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.05) return true;
    try {
      this.ray.origin.x = from.x;
      this.ray.origin.y = from.y;
      this.ray.origin.z = from.z;
      this.ray.dir.x = dx / dist;
      this.ray.dir.y = dy / dist;
      this.ray.dir.z = dz / dist;
      return !this.ctx.physics.castRay(this.ray, dist - 0.1, true, this.flags, COLLISION_GROUPS.worldQuery);
    } catch {
      return true;
    }
  }
  spawn(kind, pos, opts) {
    if (!ENEMY_DEFS[kind]) return -1;
    const isElite = !!(opts?.elite && opts.elite.element && PALETTE[opts.elite.element]);
    const isStorm = !isElite && opts?.tier === 2;
    const def = isElite
      ? eliteDef(kind, eliteStyle(kind, opts?.elite?.name))
      : isStorm
        ? stormborneDef(kind)
        : ENEMY_DEFS[kind];
    const id = this.nextId++;
    const enemy = new Enemy(id, kind, def);
    const x = clamp(pos.x, -156, 156);
    const z = clamp(pos.z, -156, 156);
    const groundY = this.ground(x, z, Number.isFinite(pos.y) ? pos.y + 1 : undefined);
    const y = Number.isFinite(pos.y) ? Math.max(pos.y, groundY) : groundY;
    enemy.position.set(x, y, z);
    enemy.home.copy(enemy.position);
    enemy.facing = opts?.facing ?? Math.random() * Math.PI * 2;
    enemy.homeFacing = enemy.facing;
    enemy.campId = opts?.campId ?? null;
    enemy.cooldown = randBetween(0.5, 1.5);
    enemy.idleT = randBetween(2, 6);
    enemy.orbitDir = Math.random() < 0.5 ? 1 : -1;
    enemy.orbitRadius = kind === 'spitter' ? randBetween(9, 12) : randBetween(kind === 'brute' ? 4.2 : 3.8, 5.2);
    if (isElite && opts?.elite) this.elite.init(enemy, opts.elite);
    if (isStorm) this.storm.init(enemy);
    enemy.deathDur = kind === 'brute' ? 0.75 : 0.55;
    const skyY = this.skyAt(x, z);
    if (skyY !== null && Math.abs(enemy.position.y - skyY) < 3) {
      enemy.skyBorn = true;
      enemy.onSky = true;
      enemy.skyY = skyY;
      enemy.position.y = Math.max(enemy.position.y, skyY);
      enemy.home.copy(enemy.position);
      enemy.lastSkyPos.copy(enemy.position);
    }
    initAnim(enemy);
    enemy.lastPos.copy(enemy.position);
    if (opts?.rise) {
      enemy.state = 'rise';
      enemy.rise = 0.02;
      enemy.invuln = 1;
      this.fx.puddle(enemy.position, enemy.radius * 2.6, 3);
      this.fx.inkSplash(_smudgePos.copy(enemy.position).setY(enemy.position.y + 0.1), null, 10, 3, 0.07);
    }
    this.createBody(enemy);
    this.enemies.push(enemy);
    this.byId.set(id, enemy);
    this.emit('enemy:spawn', {
      id,
      kind,
      position: enemy.position.clone(),
    });
    return id;
  }
  createBody(enemy) {
    try {
      const RAPIER = this.ctx.RAPIER;
      const halfHeight = enemy.height / 2;
      const body = this.ctx.physics.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
          enemy.position.x,
          enemy.position.y + halfHeight + KCC_OFFSET,
          enemy.position.z,
        ),
      );
      const collider = this.ctx.physics.createCollider(
        RAPIER.ColliderDesc.capsule(Math.max(0.01, halfHeight - enemy.radius), enemy.radius)
          .setCollisionGroups(COLLISION_GROUPS.enemy)
          .setFriction(0),
        body,
      );
      this.ctx.colliders.register(collider, {
        kind: 'enemy',
        data: {
          enemyId: enemy.id,
        },
      });
      enemy.body = body;
      enemy.collider = collider;
      this.byCollider.set(collider.handle, enemy);
    } catch (err) {
      console.warn('[enemies] physics body failed', err);
    }
  }
  removeBody(enemy) {
    try {
      if (enemy.collider) {
        this.byCollider.delete(enemy.collider.handle);
        this.ctx.colliders.unregister(enemy.collider);
      }
      if (enemy.body) this.ctx.physics.removeRigidBody(enemy.body);
    } catch {}
    enemy.body = null;
    enemy.collider = null;
  }
  teleport(enemy, pos) {
    enemy.position.copy(pos);
    enemy.vel.set(0, 0, 0);
    enemy.knock.set(0, 0, 0);
    enemy.lastPos.copy(pos);
    try {
      enemy.body?.setTranslation(
        {
          x: pos.x,
          y: pos.y + enemy.height / 2 + KCC_OFFSET,
          z: pos.z,
        },
        true,
      );
    } catch {}
  }
  spawnCamp(id, center, kinds, radius = 6, respawn = true, tier = 1) {
    if (this.camps.camps.has(id)) return;
    const validKinds = kinds.filter((kind) => ENEMY_DEFS[kind]);
    const camp = this.camps.create(id, center, validKinds, radius, respawn, tier);
    if (this.skyAt(camp.center.x, camp.center.z) !== null)
      for (const member of camp.members)
        for (let i = 0; i < 4 && !this.skyGroundOk(member.home.x, member.home.z, camp.center.y, 1.2); i++) {
          member.home.lerp(camp.center, 0.35);
          member.home.y = this.fxFloor(member.home.x, member.home.z, camp.center.y);
        }
    for (const member of camp.members)
      member.id = this.spawn(member.kind, member.home, {
        facing: member.facing,
        campId: id,
        tier,
      });
  }
  respawnCamp(camp) {
    for (const member of camp.members) {
      const enemy = this.byId.get(member.id);
      if (!enemy || (!enemy.alive && enemy.state !== 'dying'))
        member.id = this.spawn(member.kind, member.home, {
          facing: member.facing,
          campId: camp.id,
          rise: true,
          tier: camp.tier,
        });
    }
    camp.clearedAt = null;
  }
  query(center, radius) {
    const found = [];
    const radiusSq = radius * radius;
    for (const enemy of this.enemies)
      if (enemy.alive && enemy.state !== 'rise' && enemy.position.distanceToSquared(center) <= radiusSq)
        found.push(enemy);
    found.sort((a, b) => a.position.distanceToSquared(center) - b.position.distanceToSquared(center));
    return found;
  }
  findLockTarget(from, dir, range = 25) {
    const fwd = _smudgeDir.set(dir.x, 0, dir.z);
    if (fwd.lengthSq() < 0.000001) fwd.set(0, 0, 1);
    fwd.normalize();
    let best = null;
    let bestScore = -Infinity;
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.state === 'rise') continue;
      const dx = enemy.position.x - from.x;
      const dz = enemy.position.z - from.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const dot = dist > 0.01 ? (dx * fwd.x + dz * fwd.z) / dist : 1;
      if (dot < -0.2 && dist > 4) continue;
      const score = dot * 1.2 - (dist / range) * 0.9 + (enemy.alerted ? 0.2 : 0);
      if (!(score <= bestScore)) {
        _smudgePos.set(enemy.position.x, enemy.position.y + enemy.height * 0.6, enemy.position.z);
        _smudgeVec.copy(from);
        if (this.los(_smudgeVec, _smudgePos)) {
          best = enemy;
          bestScore = score;
        }
      }
    }
    return best ? best.id : null;
  }
  hitSphere(center, radius, hit, hitIds) {
    const hits = [];
    if (!center || !Number.isFinite(center.x + center.y + center.z) || !(radius > 0)) return hits;
    if (hit.source === 'melee' || hit.source === 'spin' || hit.source === 'jumpSlash' || hit.source === 'flurry')
      this.globs.overlapping(center, radius, (glob) => this.globs.reflect(glob));
    const dir = _smudgeDir.set(hit.direction?.x ?? 0, 0, hit.direction?.z ?? 0);
    const hasDir = dir.lengthSq() > 0.000001;
    if (hasDir) dir.normalize();
    for (const enemy of this.enemies) {
      if (
        !enemy.alive ||
        enemy.state === 'rise' ||
        hitIds?.has(enemy.id) ||
        !this.sphereHitsEnemy(enemy, center, radius)
      )
        continue;
      const dx = enemy.position.x - center.x;
      const dz = enemy.position.z - center.z;
      const dist = Math.hypot(dx, dz);
      const hitDir = new Vector3();
      if (hit.source === 'spin' || !hasDir) {
        if (dist > 0.05) hitDir.set(dx / dist, 0, dz / dist);
        else hitDir.copy(hasDir ? dir : _smudgePos.set(0, 0, 1));
      } else if (dist > 0.05 && (dx * dir.x + dz * dir.z) / dist > -0.2)
        hitDir.set(dir.x + (dx / dist) * 0.6, 0, dir.z + (dz / dist) * 0.6).normalize();
      else hitDir.copy(dir);
      const enemyHit = {
        ...hit,
        direction: hitDir,
        point: hit.point ?? this.closestPoint(enemy, center),
      };
      if (this.damage(enemy.id, enemyHit)) {
        hits.push(enemy.id);
        hitIds?.add(enemy.id);
      }
    }
    return hits;
  }
  closestPoint(enemy, pos) {
    const y = clamp(pos.y, enemy.position.y + enemy.radius, enemy.position.y + enemy.height - enemy.radius);
    const dx = pos.x - enemy.position.x;
    const dz = pos.z - enemy.position.z;
    const len = Math.hypot(dx, dz) || 1;
    return new Vector3(enemy.position.x + (dx / len) * enemy.radius, y, enemy.position.z + (dz / len) * enemy.radius);
  }
  damage(id, hit) {
    const enemy = this.byId.get(id);
    if (!enemy || !enemy.alive || enemy.invuln > 0 || enemy.state === 'rise' || !hit) return false;
    const source = hit.source ?? 'melee';
    const isFire = source === 'fire';
    let amount = Number.isFinite(hit.damage) ? Math.max(0, hit.damage) : 1;
    let knockback = Number.isFinite(hit.knockback) ? Math.max(0, hit.knockback) : 4;
    const color = hit.color && PALETTE[hit.color] ? hit.color : null;
    const dir = new Vector3(hit.direction?.x ?? 0, 0, hit.direction?.z ?? 0);
    if (dir.lengthSq() < 0.000001 || !Number.isFinite(dir.x + dir.z))
      dir.set(enemy.position.x - this.pPos.x, 0, enemy.position.z - this.pPos.z);
    if (dir.lengthSq() < 0.000001) dir.set(0, 0, 1);
    dir.normalize();
    const point =
      hit.point && Number.isFinite(hit.point.x + hit.point.y + hit.point.z)
        ? hit.point.clone()
        : new Vector3(
            enemy.position.x - dir.x * enemy.radius,
            enemy.position.y + enemy.height * 0.55,
            enemy.position.z - dir.z * enemy.radius,
          );
    let shatter = false;
    const ex = enemy.ex;
    let absorbed = false;
    let countered = false;
    if (ex && color && !isFire)
      if (color === ex.element) {
        absorbed = true;
        amount *= ELITE.absorb;
        knockback *= 0.5;
      } else if (color === ex.counter) {
        countered = true;
        amount *= ELITE.weakDamage;
      }
    if (enemy.has('frozen') && !isFire) {
      shatter = true;
      amount *= 2;
      knockback = Math.max(knockback, 8) * 1.35;
      this.endStatus(enemy, 'frozen', 'shatter', dir);
    } else if (color && !isFire && !absorbed) {
      const statusScale = Number.isFinite(hit.statusScale) ? Math.min(4, Math.max(0.2, hit.statusScale)) : 1;
      this.applyStatus(
        enemy,
        STATUS_BY_COLOR[color],
        dir,
        STATUS_BY_COLOR[color] === 'rooted' ? STATUS_TUNING.rootedTime * statusScale : undefined,
        statusScale,
      );
    }
    if (!shatter && enemy.statuses.size === 0)
      if (ex) amount *= ex.tune.guard;
      else if (enemy.kind === 'brute') amount *= 0.5;
    if (ex && enemy.has(STATUS_BY_COLOR[ex.counter])) amount *= ELITE.weakWhileStatus;
    if (enemy.has('launched') && !isFire && enemy.airTime > 0.05) {
      enemy.vel.y = Math.max(enemy.vel.y, enemy.def.launchSpeed * 0.55);
      enemy.tumbleV += (Math.random() < 0.5 ? -1 : 1) * 4;
    }
    enemy.health -= amount;
    enemy.lastHitT = this.time;
    enemy.lastHitDir.copy(dir);
    const wasAlerted = enemy.alerted;
    if (!enemy.alerted) this.alert(enemy, true);
    enemy.lastSeenT = this.time;
    enemy.lastSeen.copy(this.pPos);
    if (!isFire) {
      enemy.flash = 1;
      if (enemy.tier === 2) enemy.crackle = Math.max(enemy.crackle, 1.1);
      const kick = enemy.kind === 'brute' ? 0.6 : 1;
      enemy.anim.kick(CH.SQUASH, -3.2 * kick);
      enemy.anim.kick(CH.WIDTH, 1.6 * kick);
      const cos = Math.cos(enemy.facing);
      const sin = Math.sin(enemy.facing);
      const localX = dir.x * cos - dir.z * sin;
      const localZ = dir.x * sin + dir.z * cos;
      enemy.anim.kick(CH.TOP_X, localX * 1.4 * kick);
      enemy.anim.kick(CH.TOP_Z, localZ * 1.4 * kick);
      enemy.anim.kick(CH.MASK_ROLL, (Math.random() - 0.5) * 6);
      enemy.anim.kick(CH.LEAN_X, -localZ * 3 * kick);
      enemy.anim.kick(CH.LEAN_Z, localX * 3 * kick);
      enemy.anim.kick(CH.EYE_OPEN, -6);
      if (!enemy.has('rooted')) {
        const resist = enemy.def.knockResist * (enemy.has('frozen') ? 1.4 : 1);
        enemy.knock.addScaledVector(dir, knockback * resist);
        if (knockback * resist > 7.5 && enemy.grounded && !enemy.has('launched')) {
          enemy.vel.y = Math.max(enemy.vel.y, 3.2);
          enemy.grounded = false;
          enemy.airLock = 0.12;
        }
      }
      this.fx.hitSpark(point, dir, absorbed ? null : color);
      this.fx.inkSplash(point, dir, shatter ? 8 : 12, 4.5, 0.07 * Math.sqrt(enemy.def.size));
      if (absorbed) this.elite.absorbFx(enemy, point);
      else if (color) {
        this.fx.paintSplash(point, color, 10, 4, 0.08);
        paletteColor(color, enemy.coat);
        enemy.coatAmt = Math.max(enemy.coatAmt, 0.62);
        if (countered) this.elite.weakFx(enemy, point, color);
      }
      enemy.poiseDmg += amount;
      const heavy = (Number.isFinite(hit.damage) ? hit.damage : 0) >= 1.8;
      const breaksPoise = ex
        ? enemy.poiseDmg >= enemy.def.poise || shatter || countered
        : enemy.def.poise <= 0 || enemy.poiseDmg >= enemy.def.poise || shatter || heavy;
      let staggered = false;
      if (breaksPoise && enemy.controllable && enemy.health > 0) {
        enemy.poiseDmg = 0;
        this.releaseToken(enemy);
        enemy.telegraphing = false;
        enemy.attackEta = 0;
        this.setState(enemy, 'stagger');
        enemy.hurtT = ex ? 0.6 : enemy.kind === 'brute' ? 0.95 : 0.4;
        staggered = true;
      }
      if (ex && enemy.health > 0) this.elite.onHurt(enemy, staggered);
    }
    const killed = enemy.health <= 0;
    this.emit('combat:hit', {
      enemyId: enemy.id,
      kind: enemy.kind,
      position: point,
      damage: amount,
      color,
      source,
      killed,
      shatter,
    });
    if (killed) this.kill(enemy, color, dir, source, wasAlerted);
    else if (shatter) {
      this.hitStop(0.12);
      this.emit('camera:shake', {
        strength: 0.35,
        position: enemy.position.clone(),
      });
    } else if (
      (source === 'melee' || source === 'spin' || source === 'jumpSlash' || source === 'flurry') &&
      source !== 'flurry'
    )
      this.hitStop(0.045);
    return true;
  }
  hitStop(seconds) {
    try {
      this.ctx.time.hitStop(seconds);
    } catch {}
  }
  applyStatus(enemy, effect, dir, duration, scale = 1) {
    if (!enemy.alive || enemy.immuneT[effect] > 0) return false;
    const eliteScale = enemy.ex ? this.elite.statusScale(enemy, effect) : 1;
    if (eliteScale <= 0) return false;
    const strength = eliteScale * scale;
    if (strength <= 0) return false;
    if (enemy.has(effect)) {
      if (effect === 'burning') enemy.statusT.burning = STATUS_TUNING.burnTime * strength;
      return false;
    }
    switch (effect) {
      case 'frozen':
        if (enemy.has('burning')) this.endStatus(enemy, 'burning', 'quench');
        if (enemy.has('rooted')) this.endStatus(enemy, 'rooted', 'replaced');
        if (enemy.has('launched')) this.endStatus(enemy, 'launched', 'replaced');
        enemy.statusT.frozen = STATUS_TUNING.frozenTime * strength;
        enemy.shell = 0;
        enemy.vel.x = enemy.vel.z = 0;
        this.fx.sparks(
          _smudgePos.copy(enemy.position).setY(enemy.position.y + enemy.height * 0.5),
          FROST_GLINT,
          14,
          3,
          2.5,
          0.08,
          -1,
        );
        this.fx.smoke(_smudgePos, 3, STEAM_WHITE, 0.5 * Math.sqrt(enemy.def.size), 0.4);
        if (enemy.ex) enemy.ballistic = false;
        break;
      case 'burning':
        if (enemy.has('frozen')) {
          this.endStatus(enemy, 'frozen', 'melt');
          this.fx.smoke(
            _smudgePos.copy(enemy.position).setY(enemy.position.y + enemy.height * 0.5),
            5,
            STEAM_WHITE,
            0.6,
            0.5,
          );
          return false;
        }
        enemy.statusT.burning = STATUS_TUNING.burnTime * strength;
        enemy.panicT = 0;
        break;
      case 'launched':
        if (enemy.has('rooted')) this.endStatus(enemy, 'rooted', 'replaced');
        enemy.statusT.launched = 4;
        enemy.vel.y = enemy.def.launchSpeed;
        enemy.grounded = false;
        enemy.airLock = 0.15;
        enemy.launchBounces = 0;
        enemy.tumbleV = (Math.random() < 0.5 ? -1 : 1) * (enemy.kind === 'brute' || enemy.ex ? 4 : 9);
        enemy.tumbleAxis = Math.random() - 0.5;
        if (dir) enemy.knock.addScaledVector(dir, 1.5);
        enemy.anim.kick(CH.SQUASH, 4);
        this.fx.sparks(enemy.position, SPRING_SPARK, 18, 5, 3, 0.09, 6);
        this.fx.dust(enemy.position, 4, 0.6, 0.5);
        break;
      case 'rooted':
        if (enemy.has('launched')) return false;
        enemy.statusT.rooted = (duration ?? STATUS_TUNING.rootedTime) * strength;
        enemy.vines = 0;
        enemy.vel.x = enemy.vel.z = 0;
        enemy.knock.set(0, 0, 0);
        this.fx.sparks(enemy.position, ROOT_SPARK, 14, 3, 2.5, 0.08, -2);
        this.fx.dust(enemy.position, 5, 0.9 * Math.sqrt(enemy.def.size), 0.45);
        this.fx.inkSplash(
          _smudgePos.copy(enemy.position).setY(enemy.position.y + 0.05),
          null,
          6,
          3,
          0.05,
          _fxTint.set(5192232),
        );
    }
    enemy.statuses.add(effect);
    if (effect !== 'burning') {
      this.releaseToken(enemy);
      enemy.telegraphing = false;
      enemy.attackEta = 0;
      if (enemy.state === 'telegraph' || enemy.state === 'attack') this.setState(enemy, 'stagger');
    }
    this.emit('enemy:status', {
      id: enemy.id,
      kind: enemy.kind,
      status: effect,
      on: true,
      position: enemy.position.clone(),
    });
    return true;
  }
  endStatus(enemy, effect, reason, dir) {
    if (!enemy.statuses.has(effect)) return;
    enemy.statuses.delete(effect);
    enemy.statusT[effect] = 0;
    enemy.immuneT[effect] = STATUS_TUNING.immunity;
    const center = _smudgePos.copy(enemy.position).setY(enemy.position.y + enemy.height * 0.5);
    if (effect === 'frozen') {
      if (reason === 'shatter')
        this.fx.iceShatter(center, dir ?? _smudgeVec.set(0, 0, 0), Math.min(1.5, enemy.def.size ** 0.6 * 1.1));
      else if (reason !== 'death-shatter')
        this.fx.iceShatter(center, _smudgeVec.set(0, 0, 0), Math.min(1, enemy.def.size ** 0.6 * 0.55));
      enemy.shell = 0;
    } else if (effect === 'launched') {
      enemy.tumble = 0;
      enemy.tumbleV = 0;
    } else if (effect === 'burning' && (reason === 'quench' || reason === 'water'))
      this.fx.smoke(center, 5, STEAM_WHITE, 0.6 * Math.sqrt(enemy.def.size), 0.5);
    this.emit('enemy:status', {
      id: enemy.id,
      kind: enemy.kind,
      status: effect,
      on: false,
      position: enemy.position.clone(),
    });
  }
  kill(enemy, color, dir, source, wasAlerted) {
    enemy.alive = false;
    enemy.health = 0;
    this.releaseToken(enemy);
    enemy.telegraphing = false;
    enemy.attackEta = 0;
    const wasFighting = enemy.alerted || wasAlerted;
    enemy.alerted = false;
    for (const effect of [...enemy.statuses])
      this.endStatus(enemy, effect, effect === 'frozen' ? 'shatter' : 'death', dir);
    enemy.deathColor = color;
    this.setState(enemy, 'dying');
    enemy.invuln = 99;
    enemy.knock.multiplyScalar(0.5);
    enemy.ballistic = false;
    enemy.speedCap = 0;
    if (color) paletteColor(color, enemy.coat);
    this.removeBody(enemy);
    if (source === 'melee' || source === 'spin' || source === 'jumpSlash' || source === 'flurry') this.hitStop(0.11);
    this.emit('camera:shake', {
      strength: enemy.kind === 'brute' ? 0.4 : 0.18,
      position: enemy.position.clone(),
    });
    if (enemy.ex) {
      this.elite.onKilled(enemy);
      return;
    }
    enemy.deathDur = enemy.kind === 'brute' ? 0.75 : 0.55;
    if (enemy.tier === 2) this.storm.onKilled(enemy);
    if (wasFighting) {
      let othersAlerted = 0;
      for (const other of this.enemies) if (other !== enemy && other.alive && other.alerted) othersAlerted++;
      if (othersAlerted === 0)
        try {
          this.ctx.time.slowMo(0.3, 0.75);
        } catch {}
    }
  }
  burst(enemy, fromFall = false) {
    if (enemy.tier === 2 && !enemy.ex && !fromFall)
      try {
        this.storm.discharge(enemy);
      } catch (err) {
        console.warn('[enemies] discharge failed', err);
      }
    const size = enemy.def.size;
    const scale = Math.sqrt(size);
    const center = _smudgePos.copy(enemy.position).setY(enemy.position.y + enemy.height * 0.5);
    const colors = enemy.deathColor ? [enemy.deathColor] : COLORS;
    const splashCount = Math.round((enemy.deathColor ? 60 : 22) * scale);
    for (const color of colors) {
      this.fx.paintSplash(center, color, splashCount, 7.5 * scale, 0.13 * scale);
      paletteColor(color, _fxTint);
      const floorY = this.fxFloor(center.x, center.z, enemy.position.y);
      for (let i = 0; i < (enemy.deathColor ? 8 : 3) * scale; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = randBetween(2, 5) * scale;
        this.fx.drops.spawn(
          this.time,
          center.x,
          center.y,
          center.z,
          Math.cos(angle) * speed,
          randBetween(4, 8),
          Math.sin(angle) * speed,
          randBetween(0.2, 0.3) * scale,
          randBetween(1.6, 2.6),
          floorY,
          _fxTint,
          0.4,
          16,
          0.4,
        );
      }
      this.fx.sparks(center, _fxTint, 18, 8, 4, 0.11, 2);
      _fxTint.lerp(PURE_WHITE, 0.25);
      this.fx.puffs.spawn(
        this.time,
        center.x,
        center.y,
        center.z,
        randBetween(-1, 1),
        randBetween(0.5, 1.5),
        randBetween(-1, 1),
        0.6 * scale,
        randBetween(1.6, 2.2) * scale,
        0.9,
        _fxTint,
        0.5,
        0.6,
        2.5,
      );
    }
    this.fx.inkSplash(center, null, Math.round(12 * scale), 5, 0.08);
    for (let i = 0; i < 8 * scale; i++)
      this.fx.shards.spawn(
        this.time,
        center.x + randBetween(-0.2, 0.2) * size,
        center.y + randBetween(-0.2, 0.3) * size,
        center.z + randBetween(-0.2, 0.2) * size,
        randBetween(-5, 5),
        randBetween(3, 8),
        randBetween(-5, 5),
        randBetween(0.06, 0.14) * scale,
        randBetween(1.4, 2.4),
        this.fxFloor(center.x, center.z, enemy.position.y),
        FX_INK,
        1,
        randBetween(5, 12),
      );
    const glowColor = enemy.deathColor ?? COLORS[Math.floor(Math.random() * 4)];
    paletteColor(glowColor, _fxTint);
    this.fx.glows.spawn(
      this.time,
      center.x,
      center.y,
      center.z,
      0,
      0,
      0,
      2.6 * scale,
      0.3,
      _fxTint.lerp(PURE_WHITE, 0.4),
      2.6,
      0,
      1,
      0,
    );
    paletteColor(glowColor, _fxTint);
    this.fx.ring(enemy.position, 0.3, 2.3 * scale, 0.6, _fxTint, 2.5);
    for (const color of colors)
      this.fx.splat(
        _smudgeVec.set(
          enemy.position.x + randBetween(-0.6, 0.6),
          enemy.position.y,
          enemy.position.z + randBetween(-0.6, 0.6),
        ),
        1.25 * scale,
        16,
        color,
      );
    try {
      this.ctx.paint.bloomVitality(enemy.position.clone(), enemy.kind === 'brute' ? 11 : 8, 1.5);
    } catch {}
    if (enemy.ex) this.elite.deathBurst(enemy);
    else if (!fromFall) this.dropLoot(enemy);
    this.emit('enemy:death', {
      id: enemy.id,
      kind: enemy.kind,
      position: enemy.position.clone(),
      color: enemy.deathColor,
    });
    if (enemy.kind === 'brute')
      this.emit('camera:shake', {
        strength: 0.35,
        position: enemy.position.clone(),
      });
    this.remove(enemy);
  }
  remove(enemy) {
    enemy.state = 'dying';
    enemy.rendered = false;
    const index = this.enemies.indexOf(enemy);
    if (index >= 0) this.enemies.splice(index, 1);
    this.byId.delete(enemy.id);
    this.removeBody(enemy);
    this.holders.delete(enemy);
  }
  dropLoot(enemy, at) {
    const pos = _smudgeVec.set(enemy.position.x, enemy.position.y + enemy.height * 0.5, enemy.position.z);
    if (at) pos.set(at.x, at.y + 0.6, at.z);
    const healthFrac = this.pHealth / Math.max(1, this.pHealthMax);
    let heartChance = 0.35;
    if (healthFrac < 0.5) heartChance = 0.6;
    if (this.pHealth <= 1.01) heartChance = 0.85;
    if (enemy.kind === 'brute') heartChance = 1;
    const isStorm = enemy.tier === 2;
    if (isStorm) heartChance = Math.min(1, heartChance + 0.25);
    if (Math.random() < heartChance) this.pickups.spawn('heart', pos, null);
    if (isStorm && enemy.kind === 'brute' && Math.random() < 0.6) this.pickups.spawn('heart', pos, null);
    let inkDrops = enemy.kind === 'brute' ? 3 : Math.random() < 0.3 ? 2 : 1;
    if (isStorm) inkDrops += enemy.kind === 'brute' ? 2 : 1;
    let ink = null;
    try {
      ink = this.ctx.paint.ink;
    } catch {
      ink = null;
    }
    for (; inkDrops-- > 0;) {
      let color = COLORS[Math.floor(Math.random() * 4)];
      if (ink && Math.random() < 0.65) {
        color = COLORS.reduce((lowest, c) => ((ink[lowest] ?? 0) <= (ink[c] ?? 0) ? lowest : c));
        if (Math.random() < 0.4 && enemy.deathColor) color = enemy.deathColor;
      }
      this.pickups.spawn('ink', pos, color);
    }
  }
  setState(enemy, state) {
    enemy.state = state;
    enemy.stateT = 0;
    if (state !== 'attack') {
      enemy.ballistic = false;
      enemy.speedCap = 0;
    }
  }
  alert(enemy, instant) {
    if (!enemy.alive) return;
    const isNew = !enemy.alerted;
    enemy.alerted = true;
    enemy.awareness = 1;
    enemy.lastSeenT = this.time;
    enemy.lastSeen.copy(this.pPos);
    enemy.orbitAngle = Math.atan2(enemy.position.x - this.pPos.x, enemy.position.z - this.pPos.z);
    if (isNew)
      this.emit('enemy:alert', {
        id: enemy.id,
        kind: enemy.kind,
        position: enemy.position.clone(),
      });
    if (isNew && enemy.elite)
      this.emit('elite:engage', {
        id: enemy.id,
        name: enemy.elite.name,
        element: enemy.elite.element,
        position: enemy.position.clone(),
      });
    if (!instant && enemy.controllable && enemy.state !== 'dying') {
      this.setState(enemy, 'notice');
      if (enemy.grounded && enemy.kind !== 'brute') {
        enemy.vel.y = enemy.kind === 'smudgeling' ? 4.2 : 3.4;
        enemy.grounded = false;
        enemy.airLock = 0.12;
      }
      enemy.anim.kick(CH.SQUASH, 3);
    } else if (
      enemy.state === 'idle' ||
      enemy.state === 'wander' ||
      enemy.state === 'return' ||
      enemy.state === 'search'
    )
      this.setState(enemy, 'engage');
    if (isNew)
      for (const other of this.enemies)
        if (!(
          other === enemy ||
          !other.alive ||
          other.alerted ||
          other.alertDelay >= 0 ||
          other.position.distanceToSquared(enemy.position) > AI.groupAlertRadius ** 2
        ))
          other.alertDelay = randBetween(0.25, 0.65);
  }
  releaseToken(enemy) {
    if (enemy.token) {
      enemy.token = false;
      this.holders.delete(enemy);
    }
    enemy.tokenWait = 0;
  }
  wantsToken = [];
  requestToken(enemy) {
    if (!(enemy.token || this.opts.noAttack)) this.wantsToken.push(enemy);
  }
  grantTokens() {
    const wantsToken = this.wantsToken;
    if (wantsToken.length === 0) return;
    for (const holder of this.holders) if (!holder.alive || !holder.alerted) this.holders.delete(holder);
    if (this.holders.size >= AI.maxAttackers || this.time - this.lastGrant < AI.grantSpacing) {
      for (const enemy of wantsToken) enemy.tokenWait += 1 / 60;
      wantsToken.length = 0;
      return;
    }
    let meleeHolders = 0;
    let rangedHolders = 0;
    for (const holder of this.holders)
      if (holder.def.melee) meleeHolders++;
      else rangedHolders++;
    let best = null;
    let bestScore = -Infinity;
    const camera = this.ctx.camera;
    camera.getWorldDirection(_smudgePos);
    for (const enemy of wantsToken) {
      if (enemy.def.melee) {
        if (
          meleeHolders >= 2 ||
          (meleeHolders >= 1 && (this.time - this.lastMeleeGrant < AI.meleeGrantSpacing || rangedHolders > 0))
        )
          continue;
      } else if (rangedHolders >= 1) continue;
      _smudgeVec.subVectors(enemy.position, camera.position);
      const dist = _smudgeVec.length() || 1;
      const viewDot = (_smudgeVec.x * _smudgePos.x + _smudgeVec.y * _smudgePos.y + _smudgeVec.z * _smudgePos.z) / dist;
      const score =
        enemy.tokenWait * 1.5 +
        (viewDot > 0.5 ? 1.2 : viewDot > 0 ? 0.4 : -0.8) -
        enemy.distToPlayer * 0.08 +
        Math.random() * 0.3 +
        (enemy.ex ? 1.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    if (best) {
      best.token = true;
      best.tokenWait = 0;
      this.holders.add(best);
      this.lastGrant = this.time;
      if (best.def.melee) this.lastMeleeGrant = this.time;
      best.orbitT = 0;
    }
    for (const enemy of wantsToken) if (enemy !== best) enemy.tokenWait += 0.1;
    wantsToken.length = 0;
  }
  cachePlayer() {
    const player = this.playerState();
    if (!player) {
      this.pAlive = false;
      return;
    }
    this.pPos.copy(player.position);
    this.pVel.copy(player.velocity);
    this.pAlive = !player.dead;
    this.pSprinting = !!player.sprinting;
    this.pSpeed = Number.isFinite(player.speed) ? player.speed : 0;
    this.pHealth = player.health ?? 5;
    this.pHealthMax = player.healthMax ?? 5;
  }
  update(dt) {
    this.time = this.ctx.time.elapsed;
    this.fx.setTime(this.time);
    this.cachePlayer();
    if (dt <= 0) return;
    if (this.grace > 0) {
      this.grace -= dt;
      this.pAlive = false;
    }
    const enemies = this.enemies;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      try {
        this.step(enemy, dt);
      } catch (err) {
        console.warn('[enemies] step failed', err);
      }
    }
    this.grantTokens();
    try {
      this.globs.update(dt);
    } catch (err) {
      console.warn('[enemies] globs failed', err);
    }
    try {
      this.elite.update(dt);
    } catch (err) {
      console.warn('[enemies] elites failed', err);
    }
    this.pickups.update(dt, this.pAlive ? this.pPos : null, this.pAlive);
    this.camps.update(dt);
    this.campT -= dt;
    if (this.campT <= 0) {
      this.campT = 1;
      this.updateCamps();
    }
    let alerted = 0;
    for (const enemy of enemies) if (enemy.alive && enemy.alerted) alerted++;
    this.alertedCount = alerted;
    const inCombat = alerted > 0;
    if (inCombat !== this.inCombat) {
      this.inCombat = inCombat;
      this.emit('combat:state', {
        inCombat,
      });
    }
  }
  updateCamps() {
    for (const camp of this.camps.camps.values()) {
      let living = 0;
      for (const member of camp.members) {
        const enemy = this.byId.get(member.id);
        if (enemy && (enemy.alive || enemy.state === 'dying')) living++;
      }
      if (living === 0 && camp.clearedAt === null) camp.clearedAt = this.time;
      if (
        camp.respawn &&
        camp.clearedAt !== null &&
        this.time - camp.clearedAt > AI.respawnDelay &&
        this.pPos.distanceTo(camp.center) > AI.respawnMinDist
      )
        this.respawnCamp(camp);
      if (this.pPos.distanceToSquared(camp.center) < 3600) {
        --camp.smokeT;
        if (camp.smokeT <= 0) {
          camp.smokeT = 1 + Math.random() * 2;
          this.fx.smoke(_smudgePos.copy(camp.center).setY(camp.center.y + 0.3), 1, SOOT_GREY, 0.35, 0.3);
        }
      }
    }
  }
  step(enemy, dt) {
    enemy.stateT += dt;
    enemy.flash = Math.max(0, enemy.flash - dt * 7);
    enemy.coatAmt = Math.max(
      enemy.deathColor && enemy.state === 'dying' ? enemy.coatAmt : 0,
      enemy.coatAmt - dt * (enemy.state === 'dying' ? 0 : 0.35),
    );
    enemy.invuln = Math.max(0, enemy.invuln - dt);
    enemy.poiseDmg = Math.max(0, enemy.poiseDmg - dt * 1.2);
    enemy.bounceCd = Math.max(0, enemy.bounceCd - dt);
    enemy.slipT = Math.max(0, enemy.slipT - dt);
    enemy.airLock = Math.max(0, enemy.airLock - dt);
    if (enemy.telegraphing) enemy.attackEta = Math.max(0, enemy.attackEta - dt);
    enemy.tickStatusTimers(dt);
    if (enemy.state === 'dying') {
      const deathDur = enemy.ex ? enemy.ex.deathDur : enemy.deathDur;
      enemy.deathT = Math.min(1, enemy.stateT / deathDur);
      if (enemy.deathColor) enemy.coatAmt = Math.min(1, enemy.ex ? enemy.deathT ** 2.4 * 1.3 : enemy.deathT * 1.4);
      enemy.knock.multiplyScalar(Math.exp(-5 * dt));
      enemy.position.addScaledVector(enemy.knock, dt);
      if (enemy.skyBorn && enemy.onSky) {
        const skyY = this.skyAt(enemy.position.x, enemy.position.z);
        if (skyY === null || Math.abs(skyY - enemy.skyY) > 2) enemy.position.addScaledVector(enemy.knock, -dt);
      }
      enemy.actualVel.set(0, 0, 0);
      if (enemy.ex) this.elite.dying(enemy, dt, enemy.deathT);
      else if (enemy.tier === 2) {
        enemy.crackle = 1.4 + enemy.deathT;
        this.storm.dying(enemy, dt, enemy.deathT);
      }
      if (enemy.stateT >= deathDur) this.burst(enemy);
      return;
    }
    if (enemy.state === 'fall') {
      this.stepFall(enemy, dt);
      return;
    }
    if (enemy.state === 'sink') {
      enemy.position.y -= dt * (0.9 + enemy.stateT);
      enemy.actualVel.set(0, -1, 0);
      if (Math.random() < dt * 10)
        this.fx.puffs.spawn(
          this.time,
          enemy.position.x + randBetween(-0.3, 0.3),
          this.ctx.water.level + 0.05,
          enemy.position.z + randBetween(-0.3, 0.3),
          0,
          0.4,
          0,
          0.1,
          0.3,
          0.6,
          STEAM_WHITE,
          0.6,
          0.5,
          2,
        );
      if (enemy.stateT > 1.1) {
        const splashPos = _smudgePos.set(enemy.position.x, this.ctx.water.level + 0.1, enemy.position.z);
        this.fx.inkSplash(splashPos, null, 20, 5, 0.07, WATER_SPLASH);
        this.fx.ring(splashPos, 0.3, 2.5, 0.8, WATER_SPLASH, 1.5);
        for (const color of COLORS) this.fx.paintSplash(splashPos, color, 6, 4, 0.08);
        try {
          this.ctx.paint.bloomVitality(splashPos.clone(), 6, 1.3);
        } catch {}
        this.emit('enemy:death', {
          id: enemy.id,
          kind: enemy.kind,
          position: splashPos.clone(),
          color: null,
        });
        this.remove(enemy);
      }
      return;
    }
    if (enemy.state === 'rise') {
      enemy.rise = Math.min(1, enemy.rise + dt * 1.3);
      if (enemy.rise >= 1) {
        enemy.rise = 1;
        enemy.anim.kick(CH.SQUASH, 3);
        this.setState(enemy, 'idle');
      }
      return;
    }
    const dx = this.pPos.x - enemy.position.x;
    const dz = this.pPos.z - enemy.position.z;
    const dist = Math.hypot(dx, dz);
    enemy.distToPlayer = dist;
    const wakeDist = enemy.skyBorn ? Math.hypot(dist, this.pPos.y - enemy.position.y) : dist;
    enemy.dormant = !enemy.alerted && wakeDist > AI.dormantDist && enemy.statuses.size === 0;
    if (enemy.dormant || this.opts.freeze) {
      enemy.actualVel.set(0, 0, 0);
      enemy.accel.set(0, 0, 0);
      return;
    }
    if (this.opts.zoo) {
      this.zooDrive(enemy, dt);
      return;
    }
    this.sense(enemy, dt, dist);
    this.tickStatuses(enemy, dt);
    if (enemy.alive) {
      enemy.desired.set(0, 0, 0);
      enemy.faceTarget = null;
      if (enemy.state !== 'attack') enemy.speedCap = 0;
      this.think(enemy, dt, dist, dx, dz);
      if (enemy.alive) {
        if (enemy.ex) this.elite.post(enemy, dt);
        this.steerFinalize(enemy, dt);
        this.move(enemy, dt);
        this.worldReact(enemy, dt);
        this.ambientFx(enemy, dt);
      }
    }
  }
  sense(enemy, dt, dist) {
    if (enemy.alertDelay >= 0) {
      enemy.alertDelay -= dt;
      if (enemy.alertDelay < 0 && !enemy.alerted && this.pAlive) this.alert(enemy, false);
    }
    enemy.senseT -= dt;
    if (enemy.senseT <= 0 && ((enemy.senseT = 0.15 + Math.random() * 0.1), (enemy.canSee = false), this.pAlive)) {
      const def = enemy.def;
      const range = enemy.alerted ? AI.loseDistance : def.visionRange;
      const dy = this.pPos.y - enemy.position.y;
      const dist3d = Math.hypot(dist, dy);
      if (dist3d < range) {
        const fx = Math.sin(enemy.facing);
        const fz = Math.cos(enemy.facing);
        const dot =
          dist > 0.01 ? ((this.pPos.x - enemy.position.x) * fx + (this.pPos.z - enemy.position.z) * fz) / dist : 1;
        if (enemy.alerted || dot > def.visionCos || dist3d < 2.5) {
          _smudgePos.set(enemy.position.x, enemy.position.y + enemy.height * 0.85, enemy.position.z);
          _smudgeVec.set(this.pPos.x, this.pPos.y + 1.2, this.pPos.z);
          enemy.canSee = this.los(_smudgePos, _smudgeVec);
        }
      }
    }
    if (enemy.canSee) {
      enemy.lastSeenT = this.time;
      enemy.lastSeen.copy(this.pPos);
    }
    if (enemy.alerted || !this.pAlive) {
      if (!this.pAlive) enemy.awareness = Math.max(0, enemy.awareness - dt);
      return;
    }
    const def = enemy.def;
    let gain = 0;
    if (enemy.canSee) {
      const far = clamp((dist - 4) / (def.visionRange - 4), 0, 1);
      gain = 4.5 * (1 - far) + 0.75 * far;
      if (this.pSprinting) gain *= 1.4;
    }
    if (dist < def.hearing * (this.pSprinting ? 1.8 : 1) && this.pSpeed > 1.5) gain = Math.max(gain, 2.8);
    if (dist < 1.6) gain = Math.max(gain, 6);
    if (gain > 0) enemy.awareness += gain * dt;
    else enemy.awareness = Math.max(0, enemy.awareness - dt * 0.25);
    if (
      enemy.awareness >= 1 &&
      enemy.controllable &&
      (enemy.state === 'idle' || enemy.state === 'wander' || enemy.state === 'return' || enemy.state === 'search')
    )
      this.alert(enemy, false);
  }
  tickStatuses(enemy, dt) {
    enemy.frozenVis += (+!!enemy.has('frozen') - enemy.frozenVis) * (1 - Math.exp(-14 * dt));
    enemy.charr += (+!!enemy.has('burning') - enemy.charr) * (1 - Math.exp(-(enemy.has('burning') ? 6 : 1.2) * dt));
    if (enemy.has('frozen')) enemy.shell = Math.min(1, enemy.shell + dt * 7);
    enemy.vines = enemy.has('rooted') ? Math.min(1, enemy.vines + dt * 3.2) : Math.max(0, enemy.vines - dt * 2.5);
    if (enemy.has('burning')) {
      enemy.statusT.burning -= dt;
      enemy.health -= STATUS_TUNING.burnDps * (enemy.ex && enemy.ex.counter === 'red' ? ELITE.weakBurn : 1) * dt;
      enemy.igniteT -= dt;
      if (enemy.igniteT <= 0) {
        enemy.igniteT = 0.35;
        try {
          if (enemy.grounded) this.ctx.elements.ignite(enemy.position.clone(), 0.7);
        } catch {}
        for (const other of this.enemies)
          if (!(other === enemy || !other.alive || other.has('burning') || other.immuneT.burning > 0))
            if (other.position.distanceToSquared(enemy.position) < (other.radius + enemy.radius + 0.25) ** 2)
              this.applyStatus(other, 'burning');
      }
      if (enemy.health <= 0) {
        this.emit('combat:hit', {
          enemyId: enemy.id,
          kind: enemy.kind,
          position: enemy.position.clone(),
          damage: 0,
          color: 'red',
          source: 'fire',
          killed: true,
        });
        this.kill(enemy, 'red', _smudgePos.set(0, 0, 1), 'fire', enemy.alerted);
        return;
      }
      if (enemy.statusT.burning <= 0) this.endStatus(enemy, 'burning', 'timeout');
    }
    if (enemy.has('frozen')) {
      enemy.statusT.frozen -= dt;
      if (enemy.statusT.frozen <= 0) this.endStatus(enemy, 'frozen', 'thaw');
    }
    if (enemy.has('rooted')) {
      enemy.statusT.rooted -= dt;
      if (enemy.statusT.rooted <= 0) {
        this.endStatus(enemy, 'rooted', 'timeout');
        this.fx.sparks(enemy.position, ROOT_SPARK, 8, 2, 2, 0.06, -1);
      }
    }
    if (enemy.has('launched')) {
      enemy.statusT.launched -= dt;
      if (enemy.grounded) enemy.tumble *= Math.exp(-10 * dt);
      else enemy.tumble += enemy.tumbleV * dt;
      if (enemy.statusT.launched <= 0) this.endStatus(enemy, 'launched', 'timeout');
    }
  }
  think(enemy, dt, dist, dx, dz) {
    const def = enemy.def;
    if (!enemy.controllable) {
      enemy.faceTarget = null;
      return;
    }
    if (enemy.cooldown > 0) enemy.cooldown -= dt;
    if (enemy.has('burning')) {
      this.releaseToken(enemy);
      enemy.telegraphing = false;
      enemy.panicT -= dt;
      if (enemy.panicT <= 0) {
        enemy.panicT = randBetween(0.35, 0.8);
        enemy.panicAngle = Math.random() * Math.PI * 2;
      }
      enemy.desired.set(Math.sin(enemy.panicAngle), 0, Math.cos(enemy.panicAngle)).multiplyScalar(def.runSpeed * 1.05);
      return;
    }
    if (!this.pAlive && enemy.alerted) {
      enemy.alerted = false;
      this.releaseToken(enemy);
      enemy.telegraphing = false;
      this.setState(enemy, 'return');
    }
    const yawToPlayer = Math.atan2(dx, dz);
    switch (enemy.state) {
      case 'idle':
        enemy.faceTarget = enemy.homeFacing;
        enemy.idleT -= dt;
        if (enemy.position.distanceTo(enemy.home) > 1.5) {
          this.setState(enemy, 'return');
          break;
        }
        if (enemy.idleT <= 0) {
          const roams = enemy.wanderRadius > 0;
          enemy.idleT = roams ? randBetween(1.5, 4) : randBetween(4, 10);
          if (Math.random() < (roams ? 0.85 : 0.55)) {
            const camp = enemy.campId ? this.camps.camps.get(enemy.campId) : null;
            const radius = roams ? enemy.wanderRadius : camp ? Math.min(3.5, camp.radius * 0.6) : 2.5;
            for (let attempt = 0; attempt < 4; attempt++) {
              const angle = Math.random() * Math.PI * 2;
              const reach = radius * (roams ? 0.35 + 0.65 * Math.random() : Math.random());
              const x = enemy.home.x + Math.cos(angle) * reach;
              const z = enemy.home.z + Math.sin(angle) * reach;
              if (!enemy.skyBorn || this.skyGroundOk(x, z, enemy.home.y, 1.4)) {
                enemy.moveTarget.set(x, enemy.home.y, z);
                this.setState(enemy, 'wander');
                break;
              }
            }
          }
        }
        break;
      case 'wander':
        if (
          Math.hypot(enemy.moveTarget.x - enemy.position.x, enemy.moveTarget.z - enemy.position.z) < 0.5 ||
          enemy.stateT > 8
        ) {
          this.setState(enemy, 'idle');
          enemy.idleT = randBetween(2, 5);
          if (enemy.position.distanceTo(enemy.home) > 1) {
            enemy.moveTarget.copy(enemy.home);
            this.setState(enemy, 'return');
          }
          break;
        }
        this.steerTo(enemy, enemy.moveTarget.x, enemy.moveTarget.z, def.walkSpeed, 0.8);
        break;
      case 'notice':
        enemy.faceTarget = yawToPlayer;
        if (enemy.stateT >= def.noticeTime) this.setState(enemy, 'engage');
        break;
      case 'engage':
        if (
          !this.pAlive ||
          dist > AI.loseDistance ||
          this.time - enemy.lastSeenT > AI.loseTime ||
          (enemy.position.distanceTo(enemy.home) > (enemy.ex ? ELITE.leash : AI.leash) && !enemy.token)
        ) {
          this.releaseToken(enemy);
          this.loseTrack(enemy);
          break;
        }
        enemy.faceTarget = yawToPlayer;
        if (enemy.token) enemy.tokenWait += dt;
        if (enemy.ex) this.elite.engage(enemy, dt, dist);
        else if (enemy.kind === 'smudgeling') this.engageSmudgeling(enemy, dt, dist);
        else if (enemy.kind === 'spitter') this.engageSpitter(enemy, dt, dist);
        else this.engageBrute(enemy, dt, dist);
        break;
      case 'telegraph':
        if (enemy.ex) this.elite.telegraph(enemy, dt, dist, yawToPlayer);
        else this.doTelegraph(enemy, dt, dist, yawToPlayer);
        break;
      case 'attack':
        if (enemy.ex) this.elite.attack(enemy, dt, dist, yawToPlayer);
        else this.doAttack(enemy, dt, dist, yawToPlayer);
        break;
      case 'recover': {
        const recoverT =
          enemy.ex && enemy.ex.recoverT > 0 ? enemy.ex.recoverT : enemy.attack ? ATTACKS[enemy.attack].recover : 0.6;
        if (enemy.stateT > recoverT * 0.6) enemy.faceTarget = yawToPlayer;
        if (enemy.stateT >= recoverT) {
          this.releaseToken(enemy);
          enemy.cooldown = randBetween(def.cooldown[0], def.cooldown[1]);
          enemy.attack = null;
          enemy.followUp = false;
          this.setState(enemy, 'engage');
        }
        break;
      }
      case 'stagger':
        if (enemy.stateT >= enemy.hurtT) {
          this.setState(enemy, enemy.alerted ? 'engage' : 'idle');
          enemy.cooldown = Math.max(enemy.cooldown, 0.4);
        }
        break;
      case 'flee': {
        const fleeYaw = Math.atan2(-dx, -dz) + Math.sin(this.time * 1.7 + enemy.seed * 10) * 0.5;
        enemy.desired.set(Math.sin(fleeYaw), 0, Math.cos(fleeYaw)).multiplyScalar(def.runSpeed);
        enemy.faceTarget = fleeYaw;
        if (dist > 9.5 || enemy.stateT > 2.6) this.setState(enemy, 'engage');
        break;
      }
      case 'search':
        if (
          Math.hypot(enemy.moveTarget.x - enemy.position.x, enemy.moveTarget.z - enemy.position.z) > 1 &&
          enemy.stateT < 4
        )
          this.steerTo(enemy, enemy.moveTarget.x, enemy.moveTarget.z, def.walkSpeed * 1.3, 1);
        else enemy.faceTarget = enemy.facing + Math.sin(enemy.stateT * 1.5) * 0.9;
        if (enemy.stateT > 6) {
          enemy.alerted = false;
          enemy.awareness = 0.3;
          this.setState(enemy, 'return');
        }
        break;
      case 'return':
        enemy.alerted = false;
        if (Math.hypot(enemy.home.x - enemy.position.x, enemy.home.z - enemy.position.z) < 0.6) {
          this.setState(enemy, 'idle');
          enemy.idleT = randBetween(3, 8);
          break;
        }
        this.steerTo(enemy, enemy.home.x, enemy.home.z, def.walkSpeed * (enemy.resetPending ? 1.6 : 1), 0.5);
    }
  }
  loseTrack(enemy) {
    enemy.alerted = false;
    enemy.telegraphing = false;
    enemy.awareness = 0.55;
    enemy.moveTarget.copy(enemy.lastSeen);
    this.setState(enemy, 'search');
    this.emit('enemy:lost', {
      id: enemy.id,
      kind: enemy.kind,
      position: enemy.position.clone(),
    });
  }
  steerTo(enemy, x, z, speed, slowRadius) {
    const dx = x - enemy.position.x;
    const dz = z - enemy.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) return;
    const targetSpeed = speed * clamp(dist / Math.max(0.1, slowRadius), 0, 1);
    enemy.desired.set((dx / dist) * targetSpeed, 0, (dz / dist) * targetSpeed);
  }
  orbit(enemy, dt, radius, lead, speed) {
    enemy.orbitT -= dt;
    if (enemy.orbitT <= 0) {
      enemy.orbitT = randBetween(1.6, 3.4);
      if (Math.random() < 0.35) enemy.orbitDir *= -1;
      enemy.orbitRadius = enemy.ex
        ? enemy.kind === 'spitter'
          ? randBetween(10, 13)
          : enemy.kind === 'brute'
            ? randBetween(5.6, 6.8)
            : randBetween(6, 8.5)
        : enemy.kind === 'smudgeling'
          ? randBetween(3.4, 5.4)
          : enemy.kind === 'spitter'
            ? randBetween(9, 12.5)
            : randBetween(4, 5.2);
    }
    const angle = Math.atan2(enemy.position.x - this.pPos.x, enemy.position.z - this.pPos.z);
    enemy.orbitAngle = angle + enemy.orbitDir * lead * 0.6;
    for (const other of this.enemies) {
      if (other === enemy || !other.alive || !other.alerted) continue;
      const gap = wrapYaw2(angle - Math.atan2(other.position.x - this.pPos.x, other.position.z - this.pPos.z));
      if (Math.abs(gap) < 0.9 && Math.abs(other.distToPlayer - enemy.distToPlayer) < 3.5)
        enemy.orbitAngle += Math.sign(gap || 1) * (0.9 - Math.abs(gap)) * 0.9;
    }
    const x = this.pPos.x + Math.sin(enemy.orbitAngle) * radius;
    const z = this.pPos.z + Math.cos(enemy.orbitAngle) * radius;
    this.steerTo(enemy, x, z, speed, 1.2);
  }
  engageSmudgeling(enemy, dt, dist) {
    const def = enemy.def;
    if (enemy.token) {
      if (dist > ATTACKS.lunge.range) {
        this.steerTo(enemy, this.pPos.x, this.pPos.z, def.runSpeed, 0.5);
        if (enemy.tokenWait > 3) this.releaseToken(enemy);
      } else if (
        Math.abs(wrapYaw2(Math.atan2(this.pPos.x - enemy.position.x, this.pPos.z - enemy.position.z) - enemy.facing)) <
        0.6
      )
        this.startTelegraph(enemy, 'lunge', dist);
      return;
    }
    if (dist > 8) this.steerTo(enemy, this.pPos.x, this.pPos.z, def.runSpeed, 1);
    else this.orbit(enemy, dt, enemy.orbitRadius, 0.9, def.runSpeed * 0.5);
    if (enemy.cooldown <= 0 && dist < 7.5) this.requestToken(enemy);
  }
  engageSpitter(enemy, dt, dist) {
    const def = enemy.def;
    if (dist < 5 && !(enemy.token && enemy.canSee && dist > ATTACKS.spit.minRange)) {
      this.releaseToken(enemy);
      this.setState(enemy, 'flee');
      return;
    }
    if (enemy.token) {
      if (enemy.canSee && dist >= ATTACKS.spit.minRange && dist <= ATTACKS.spit.maxRange) {
        this.startTelegraph(enemy, 'spit', dist);
        return;
      }
      if (enemy.tokenWait > 2) this.releaseToken(enemy);
    }
    const lostSight = this.time - enemy.lastSeenT > 1.2;
    if (dist > 14.5 || lostSight)
      this.steerTo(enemy, this.pPos.x, this.pPos.z, lostSight ? def.walkSpeed * 1.6 : def.runSpeed * 0.8, 1);
    else this.orbit(enemy, dt, enemy.orbitRadius, 0.35, def.walkSpeed);
    if (enemy.cooldown <= 0 && enemy.canSee && dist >= ATTACKS.spit.minRange && dist <= ATTACKS.spit.maxRange)
      this.requestToken(enemy);
  }
  engageBrute(enemy, dt, dist) {
    const def = enemy.def;
    if (enemy.token) {
      const aimError = Math.abs(
        wrapYaw2(Math.atan2(this.pPos.x - enemy.position.x, this.pPos.z - enemy.position.z) - enemy.facing),
      );
      if (dist > ATTACKS.slam.range) {
        this.steerTo(enemy, this.pPos.x, this.pPos.z, def.runSpeed, 0.5);
        if (enemy.tokenWait > 4.5) this.releaseToken(enemy);
      } else if (aimError < 0.5) {
        const attack = dist < 2.4 && Math.random() < 0.55 ? 'backhand' : 'slam';
        this.startTelegraph(enemy, attack, dist);
      }
      return;
    }
    if (dist > 7) this.steerTo(enemy, this.pPos.x, this.pPos.z, def.walkSpeed * 1.5, 1);
    else this.orbit(enemy, dt, enemy.orbitRadius, 0.3, def.walkSpeed);
    if (enemy.cooldown <= 0 && dist < 8) this.requestToken(enemy);
  }
  startTelegraph(enemy, attack, dist) {
    this.setState(enemy, 'telegraph');
    enemy.attack = attack;
    enemy.attackHit = false;
    enemy.attackFired = false;
    enemy.telegraphing = true;
    let eta = 0;
    if (enemy.ex) {
      enemy.windup = this.elite.windupOf(enemy, attack);
      eta = this.elite.etaOf(enemy, attack, dist);
      this.elite.onTelegraph(enemy, attack);
    } else {
      enemy.windup = ATTACKS[attack].windup * (enemy.tier === 2 ? STORMBORNE.windupMul : 1);
      if (enemy.tier === 2 && attack === 'lunge' && enemy.followUp) enemy.windup = STORMBORNE.followUpWindup;
      const windup = enemy.windup;
      eta =
        attack === 'lunge'
          ? windup + ATTACKS.lunge.strike
          : attack === 'spit'
            ? windup + clamp(dist / 12, 0.8, 1.3)
            : attack === 'slam'
              ? windup + ATTACKS.slam.strike
              : windup + ATTACKS.backhand.strike;
    }
    enemy.attackEta = eta;
    this.emit('enemy:telegraph', {
      id: enemy.id,
      kind: enemy.kind,
      position: enemy.position.clone(),
      attack,
      eta,
    });
  }
  doTelegraph(enemy, dt, dist, yawToPlayer) {
    const attack = enemy.attack;
    const windup = enemy.windup > 0 ? enemy.windup : ATTACKS[attack].windup;
    const aimFrac = attack === 'slam' ? 0.7 : attack === 'backhand' ? 0.6 : attack === 'lunge' ? 0.85 : 1;
    if (enemy.stateT < windup * aimFrac) enemy.faceTarget = yawToPlayer;
    if (attack === 'lunge') enemy.desired.set(-Math.sin(enemy.facing), 0, -Math.cos(enemy.facing)).multiplyScalar(0.4);
    if (enemy.stateT >= windup) this.startAttack(enemy, dist);
  }
  startAttack(enemy, dist) {
    const attack = enemy.attack;
    this.setState(enemy, 'attack');
    const fx = Math.sin(enemy.facing);
    const fz = Math.cos(enemy.facing);
    if (attack === 'lunge') {
      const leap = clamp((dist - 0.7) / 0.3, 3, 11.5);
      enemy.vel.x = fx * leap;
      enemy.vel.z = fz * leap;
      enemy.vel.y = 3.4;
      enemy.grounded = false;
      enemy.airLock = 0.12;
      enemy.attackEta = ATTACKS.lunge.strike;
      enemy.anim.kick(CH.SQUASH, 5);
      this.emit('enemy:attack', {
        id: enemy.id,
        kind: enemy.kind,
        position: enemy.position.clone(),
        attack,
      });
      this.fx.dust(enemy.position, 3, 0.3, 0.35);
    } else if (attack === 'spit') {
      const rig = this.models.spitter.rig;
      const mouth = partToWorld(enemy, rig, BONE.mask, rig.mouth, new Vector3());
      const flight = clamp(dist / 12, 0.8, 1.3);
      const aim = _smudgePos.copy(this.pPos).addScaledVector(this.pVel, flight * 0.4);
      aim.y = this.ground(aim.x, aim.z, this.pPos.y + 1);
      const glob = this.globs.fire(mouth, aim, flight, enemy.id, {
        dmg: this.scaleDamage(enemy, ATTACKS.spit.damage),
        storm: enemy.tier === 2,
      });
      enemy.attackEta = flight;
      enemy.telegraphing = !!glob;
      enemy.secondShot = false;
      enemy.anim.kick(CH.MASK_PUSH, 1.5);
      this.fx.inkSplash(mouth, _smudgeVec.set(fx, 0.3, fz), 8, 3, 0.06);
      this.emit('enemy:attack', {
        id: enemy.id,
        kind: enemy.kind,
        position: enemy.position.clone(),
        attack,
      });
    } else enemy.attackEta = ATTACKS[attack].strike;
  }
  doAttack(enemy, dt, dist, yawToPlayer) {
    const attack = enemy.attack;
    const stateT = enemy.stateT;
    const fx = Math.sin(enemy.facing);
    const fz = Math.cos(enemy.facing);
    switch (attack) {
      case 'lunge': {
        const lunge = ATTACKS.lunge;
        enemy.desired.set(enemy.vel.x, 0, enemy.vel.z);
        if (!enemy.attackHit && stateT >= lunge.strike * 0.4 && stateT <= lunge.strike + lunge.active) {
          _smudgePos.set(enemy.position.x + fx * 0.45, enemy.position.y + 0.45, enemy.position.z + fz * 0.45);
          if (this.touchesPlayer(_smudgePos, lunge.reach * 0.7)) {
            enemy.attackHit = true;
            this.hurtPlayer(enemy, lunge.damage, _smudgeVec.set(fx, 0, fz), lunge.knockback);
          }
        }
        if (stateT > lunge.strike + lunge.active) enemy.telegraphing = false;
        if ((stateT > 0.2 && enemy.grounded) || stateT > 0.75) {
          enemy.telegraphing = false;
          enemy.vel.x *= 0.3;
          enemy.vel.z *= 0.3;
          enemy.anim.kick(CH.SQUASH, -4);
          this.fx.dust(enemy.position, 2, 0.3, 0.3);
          this.fx.inkSplash(_smudgePos.copy(enemy.position).setY(enemy.position.y + 0.05), null, 5, 2, 0.05);
          if (
            enemy.tier === 2 &&
            !enemy.followUp &&
            enemy.token &&
            this.pAlive &&
            enemy.distToPlayer < 4.5 &&
            Math.random() < STORMBORNE.followUpChance &&
            !this.opts.noAttack
          ) {
            enemy.followUp = true;
            this.fx.sparks(enemy.position, STORM_VIOLET, 8, 3, 4, 0.06, 2);
            this.startTelegraph(enemy, 'lunge', enemy.distToPlayer);
          } else this.setState(enemy, 'recover');
        }
        break;
      }
      case 'spit':
        if (enemy.tier === 2 && !enemy.secondShot && stateT >= STORMBORNE.secondGlobDelay && this.pAlive) {
          enemy.secondShot = true;
          const rig = this.models.spitter.rig;
          const mouth = partToWorld(enemy, rig, BONE.mask, rig.mouth, new Vector3());
          const flight = clamp(dist / 12, 0.8, 1.3) + 0.06;
          const dx = this.pPos.x - enemy.position.x;
          const dz = this.pPos.z - enemy.position.z;
          const len = Math.hypot(dx, dz) || 1;
          const side = Math.random() < 0.5 ? -1 : 1;
          const x = this.pPos.x + this.pVel.x * flight * 0.7 + (-dz / len) * side * 1.9;
          const z = this.pPos.z + this.pVel.z * flight * 0.7 + (dx / len) * side * 1.9;
          const aim = _smudgePos.set(x, this.ground(x, z, this.pPos.y + 1), z);
          this.globs.fire(mouth, aim, flight, enemy.id, {
            dmg: this.scaleDamage(enemy, ATTACKS.spit.damage),
            storm: true,
          });
          enemy.anim.kick(CH.MASK_PUSH, 1.2);
        }
        if (stateT > 0.25) this.setState(enemy, 'recover');
        break;
      case 'slam': {
        const slam = ATTACKS.slam;
        if (!enemy.attackFired && stateT >= slam.strike) {
          enemy.attackFired = true;
          enemy.telegraphing = false;
          const x = enemy.position.x + fx * slam.reach;
          const z = enemy.position.z + fz * slam.reach;
          const floorY = this.fxFloor(x, z, enemy.position.y);
          const impact = _smudgePos.set(x, floorY, z);
          this.fx.shockwave(impact, slam.radius, WARM_GLOW);
          this.fx.dust(impact, 10, 1.4, 0.8);
          this.fx.inkSplash(_smudgeVec.copy(impact).setY(floorY + 0.2), null, 20, 6, 0.09);
          this.emit('camera:shake', {
            strength: 0.8,
            position: impact.clone(),
          });
          this.emit('enemy:attack', {
            id: enemy.id,
            kind: enemy.kind,
            position: impact.clone(),
            attack,
          });
          const dx = this.pPos.x - x;
          const dz = this.pPos.z - z;
          const dist = Math.hypot(dx, dz);
          if (
            dist <= slam.radius &&
            this.pPos.y - this.fxFloor(this.pPos.x, this.pPos.z, this.pPos.y) < 0.9 &&
            Math.abs(this.pPos.y - floorY) < 2
          ) {
            const push = dist > 0.05 ? _smudgeDir.set(dx / dist, 0, dz / dist) : _smudgeDir.set(fx, 0, fz);
            this.hurtPlayer(enemy, slam.damage, push, slam.knockback);
          }
          if (enemy.tier === 2) {
            const slamRing = STORMBORNE.slamRing;
            this.elite.addRingRaw(
              enemy.id,
              enemy.kind,
              null,
              STORM_VIOLET,
              impact,
              slamRing.r0,
              slamRing.r1,
              slamRing.life,
              slamRing.damage,
              slamRing.knockback,
              true,
            );
            this.fx.sparks(_smudgeVec.copy(impact).setY(floorY + 0.3), STORM_WHITE, 18, 7, 4.5, 0.08, 3);
          }
          enemy.anim.kick(CH.SQUASH, -3);
        }
        if (stateT >= slam.strike + 0.18) this.setState(enemy, 'recover');
        break;
      }
      case 'backhand': {
        const backhand = ATTACKS.backhand;
        if (!enemy.attackFired && stateT >= backhand.strike) {
          enemy.attackFired = true;
          enemy.telegraphing = false;
          this.emit('enemy:attack', {
            id: enemy.id,
            kind: enemy.kind,
            position: enemy.position.clone(),
            attack,
          });
          const dx = this.pPos.x - enemy.position.x;
          const dz = this.pPos.z - enemy.position.z;
          const dist = Math.hypot(dx, dz);
          const dot = dist > 0.01 ? (dx * fx + dz * fz) / dist : 1;
          if (dist <= backhand.range && dot >= backhand.arc && Math.abs(this.pPos.y - enemy.position.y) < 2.2) {
            const sideX = -Math.cos(enemy.facing);
            const sideZ = Math.sin(enemy.facing);
            const push = _smudgeDir
              .set(dx / Math.max(dist, 0.01) + sideX * 0.8, 0, dz / Math.max(dist, 0.01) + sideZ * 0.8)
              .normalize();
            this.hurtPlayer(enemy, backhand.damage, push, backhand.knockback);
          }
          const fist = partToWorld(
            enemy,
            this.models.brute.rig,
            BONE.handR,
            this.models.brute.rig.fists[1],
            _smudgePos,
          );
          this.fx.inkSplash(fist, _smudgeVec.set(-Math.cos(enemy.facing), 0.2, Math.sin(enemy.facing)), 10, 5, 0.07);
        }
        if (stateT >= backhand.strike + 0.22) this.setState(enemy, 'recover');
        break;
      }
    }
  }
  hurtPlayer(enemy, amount, dir, knockback) {
    return this.hurtPlayerFrom(enemy.kind, enemy.id, this.scaleDamage(enemy, amount), dir, knockback);
  }
  scaleDamage(enemy, amount) {
    return enemy.dmgMul === 1 ? amount : Math.min(amount * enemy.dmgMul, amount + 0.5);
  }
  hurtPlayerFrom(source, enemyId, amount, dir, knockback, slow) {
    if (this.opts.noAttack || !this.pAlive) return false;
    try {
      const flatDir = dir.clone().setY(0);
      if (flatDir.lengthSq() < 0.000001) flatDir.set(0, 0, 1);
      const hit = {
        amount,
        direction: flatDir.normalize(),
        knockback,
        source,
        enemyId,
      };
      if (slow && slow > 0) hit.slow = slow;
      return !!this.ctx.player.damage(hit);
    } catch (err) {
      console.warn('[enemies] player.damage failed', err);
      return false;
    }
  }
  globHurt(glob, dir) {
    const owner = this.byId.get(glob.ownerId);
    if (!this.opts.noAttack && this.pAlive)
      try {
        this.ctx.player.damage({
          amount: glob.dmg,
          direction: dir.clone(),
          knockback: ATTACKS.spit.knockback,
          source: owner?.ex && owner.ex.style === 'galecaller' ? 'galecaller' : 'spitter',
          enemyId: owner?.id ?? glob.ownerId,
        });
      } catch {}
  }
  globHitEnemy(enemyId, glob, dir) {
    this.damage(enemyId, {
      damage: 1.5,
      color: null,
      direction: dir,
      knockback: 7,
      source: 'prop',
      point: glob.pos.clone(),
    });
  }
  orbBounceTarget(glob, pos, out) {
    if (!this.pAlive || this.opts.noAttack) return null;
    const pPos = this.pPos;
    let x = pPos.x + this.pVel.x * 0.35 + randBetween(-0.8, 0.8);
    let z = pPos.z + this.pVel.z * 0.35 + randBetween(-0.8, 0.8);
    const dx = x - pos.x;
    const dz = z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 18) return null;
    const maxHop = 6.5;
    if (dist > maxHop) {
      x = pos.x + (dx / dist) * maxHop;
      z = pos.z + (dz / dist) * maxHop;
    }
    return out.set(x, this.ground(x, z, Math.max(pos.y, pPos.y) + 1.5), z);
  }
  globLanded(glob, pos, inWater) {
    const owner = this.byId.get(glob.ownerId);
    if (owner && owner.telegraphing && owner.attack === 'spit') {
      owner.telegraphing = false;
      owner.attackEta = 0;
    }
    if (glob.element)
      try {
        this.elite.globLanded(glob, pos, inWater);
      } catch (err) {
        console.warn('[enemies] elite glob failed', err);
      }
    if (!glob.reflected && !glob.hitPlayer && this.pAlive) {
      const dx = this.pPos.x - pos.x;
      const dz = this.pPos.z - pos.z;
      if (dx * dx + dz * dz < 1.1 * 1.1 && Math.abs(this.pPos.y - pos.y) < 1.4) {
        glob.hitPlayer = true;
        const len = Math.hypot(dx, dz) || 1;
        this.globHurt(glob, _smudgePos.set(dx / len, 0, dz / len));
      }
    }
  }
  steerFinalize(enemy, dt) {
    const desired = enemy.desired;
    for (const other of this.enemies) {
      if (other === enemy || !other.alive || other.dormant) continue;
      const dx = enemy.position.x - other.position.x;
      const dz = enemy.position.z - other.position.z;
      const minDist = enemy.radius + other.radius + 0.7;
      const distSq = dx * dx + dz * dz;
      if (distSq > minDist * minDist || distSq < 0.000001) continue;
      const d = Math.sqrt(distSq);
      const push = ((minDist - d) / minDist) * 3.5;
      desired.x += (dx / d) * push;
      desired.z += (dz / d) * push;
    }
    if (this.pAlive && enemy.state !== 'attack' && enemy.state !== 'telegraph') {
      const dx = enemy.position.x - this.pPos.x;
      const dz = enemy.position.z - this.pPos.z;
      const minDist = enemy.radius + 0.9;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist && distSq > 0.000001) {
        const d = Math.sqrt(distSq);
        const push = ((minDist - d) / minDist) * 5;
        desired.x += (dx / d) * push;
        desired.z += (dz / d) * push;
      }
    }
    const wantSpeed = Math.hypot(desired.x, desired.z);
    if (enemy.detourT > 0) {
      enemy.detourT -= dt;
      const angle = enemy.detourSign * 1.25;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rx = desired.x * cos - desired.z * sin;
      desired.z = desired.x * sin + desired.z * cos;
      desired.x = rx;
    }
    enemy.progressT += dt;
    if (enemy.progressT >= 0.5) {
      const moved = Math.hypot(enemy.position.x - enemy.lastPos.x, enemy.position.z - enemy.lastPos.z);
      enemy.lastPos.copy(enemy.position);
      if (wantSpeed > 0.9 && moved < wantSpeed * 0.5 * 0.25 && enemy.grounded) {
        enemy.stuckT += enemy.progressT;
        if (enemy.stuckT >= 0.9 && enemy.detourT <= 0) {
          enemy.detourT = 0.9;
          enemy.detourSign = -enemy.detourSign || 1;
        }
        if (enemy.stuckT >= 3 && enemy.grounded) {
          enemy.vel.y = 5.5;
          enemy.grounded = false;
          enemy.airLock = 0.12;
        }
        if (enemy.stuckT >= 7 && (enemy.distToPlayer > 25 || !enemy.alerted)) {
          this.teleport(enemy, enemy.home);
          enemy.stuckT = 0;
        }
      } else enemy.stuckT = Math.max(0, enemy.stuckT - enemy.progressT);
      enemy.progressT = 0;
    }
    const steerSpeed = Math.hypot(desired.x, desired.z);
    if (steerSpeed > 0.05) {
      const nx = desired.x / steerSpeed;
      const nz = desired.z / steerSpeed;
      const probe = enemy.radius + 0.9;
      const px = enemy.position.x + nx * probe;
      const pz = enemy.position.z + nz * probe;
      if (
        enemy.skyBorn && enemy.onSky
          ? this.skyEdge(enemy, px, pz) ||
            this.skyEdge(enemy, enemy.position.x + nx * (probe + 1.2), enemy.position.z + nz * (probe + 1.2))
          : this.waterDepth(px, pz) > enemy.height * 0.35
      ) {
        desired.x = -desired.x * 0.3;
        desired.z = -desired.z * 0.3;
        if (enemy.detourT <= 0) {
          enemy.detourT = 0.8;
          enemy.detourSign = Math.random() < 0.5 ? -1 : 1;
        }
      }
    }
    const maxSpeed = enemy.speedCap > 0 ? enemy.speedCap : enemy.def.runSpeed * 1.15;
    const finalSpeed = Math.hypot(desired.x, desired.z);
    if (finalSpeed > maxSpeed) desired.multiplyScalar(maxSpeed / finalSpeed);
  }
  skyEdge(enemy, x, z) {
    const skyY = this.skyAt(x, z);
    return skyY === null || skyY < enemy.position.y - 1.8;
  }
  move(enemy, dt) {
    const def = enemy.def;
    const slippery = enemy.slipT > 0 || enemy.has('frozen');
    const immobile = !enemy.controllable && !enemy.has('launched');
    if (
      (!enemy.ballistic || enemy.grounded) &&
      (enemy.state !== 'attack' || enemy.attack !== 'lunge' || enemy.grounded)
    ) {
      const accel = (slippery ? def.accel * 0.12 : def.accel) * (enemy.grounded ? 1 : 0.25);
      const wantX = immobile ? 0 : enemy.desired.x;
      const wantZ = immobile ? 0 : enemy.desired.z;
      const dvx = wantX - enemy.vel.x;
      const dvz = wantZ - enemy.vel.z;
      const dv = Math.hypot(dvx, dvz);
      const maxDv = accel * dt;
      if (dv > maxDv && dv > 0.000001) {
        enemy.vel.x += (dvx / dv) * maxDv;
        enemy.vel.z += (dvz / dv) * maxDv;
      } else {
        enemy.vel.x = wantX;
        enemy.vel.z = wantZ;
      }
    }
    if (enemy.has('rooted')) {
      enemy.vel.x = enemy.vel.z = 0;
      enemy.knock.set(0, 0, 0);
    }
    const knockDamp = slippery ? 1.1 : enemy.grounded ? 7 : 1.5;
    enemy.knock.multiplyScalar(Math.exp(-knockDamp * dt));
    if (
      enemy.grounded &&
      enemy.airLock <= 0 &&
      enemy.statuses.size === 0 &&
      Math.abs(enemy.vel.x) + Math.abs(enemy.vel.z) < 0.02 &&
      Math.abs(enemy.knock.x) + Math.abs(enemy.knock.z) < 0.02 &&
      Math.abs(enemy.desired.x) + Math.abs(enemy.desired.z) < 0.02
    ) {
      enemy.vel.x = enemy.vel.z = 0;
      enemy.knock.set(0, 0, 0);
      enemy.prevActualVel.copy(enemy.actualVel);
      enemy.actualVel.set(0, 0, 0);
      enemy.accel.multiplyScalar(Math.exp(-12 * dt));
      this.turn(enemy, dt);
      return;
    }
    const wasGrounded = enemy.grounded;
    if (!enemy.grounded || enemy.airLock > 0) enemy.vel.y -= ENEMY_GRAVITY * dt;
    else enemy.vel.y = -2;
    const mx = (enemy.vel.x + enemy.knock.x) * dt;
    const my = enemy.vel.y * dt;
    const mz = (enemy.vel.z + enemy.knock.z) * dt;
    let dx = mx;
    let dy = my;
    let dz = mz;
    let onGround = false;
    const kcc = enemy.ex ? this.kccForElite(enemy.kind) : this.kcc[enemy.kind];
    if (kcc && enemy.collider)
      try {
        if (enemy.airLock > 0 || enemy.vel.y > 0.5) kcc.disableSnapToGround();
        else kcc.enableSnapToGround((enemy.kind === 'brute' ? 0.45 : 0.32) * Math.sqrt(enemy.scale));
        kcc.computeColliderMovement(
          enemy.collider,
          {
            x: mx,
            y: my,
            z: mz,
          },
          this.flags,
          COLLISION_GROUPS.enemy,
        );
        const movement = kcc.computedMovement();
        dx = movement.x;
        dy = movement.y;
        dz = movement.z;
        onGround = kcc.computedGrounded();
        const numHits = kcc.numComputedCollisions();
        for (let i = 0; i < numHits; i++) {
          const collision = kcc.computedCollision(i);
          if (!collision) continue;
          const normal1 = collision.normal1;
          if (normal1.y < 0.6 && normal1.y > -0.3) {
            const flatLen = Math.hypot(normal1.x, normal1.z);
            if (flatLen > 0.0001) {
              const nx = normal1.x / flatLen;
              const nz = normal1.z / flatLen;
              const into = enemy.knock.x * nx + enemy.knock.z * nz;
              if (into < 0) {
                enemy.knock.x -= nx * into * 1.6;
                enemy.knock.z -= nz * into * 1.6;
              }
            }
          } else if (normal1.y <= -0.3 && enemy.vel.y > 0) enemy.vel.y = 0;
        }
      } catch {}
    if (!Number.isFinite(dx + dy + dz)) dx = dy = dz = 0;
    enemy.position.x += dx;
    enemy.position.y += dy;
    enemy.position.z += dz;
    const floorY = this.floorAt(enemy.position.x, enemy.position.z, enemy.position.y);
    if (enemy.position.y < floorY - 0.05) {
      enemy.position.y = floorY;
      if (enemy.vel.y < 0) onGround = true;
    }
    if (!enemy.collider && enemy.position.y <= floorY + 0.02 && enemy.vel.y <= 0) onGround = true;
    enemy.position.x = clamp(enemy.position.x, -156, 156);
    enemy.position.z = clamp(enemy.position.z, -156, 156);
    if (enemy.airLock > 0) onGround = false;
    if (enemy.skyBorn && this.skyContact(enemy, onGround)) return;
    if (onGround && !wasGrounded) this.onLand(enemy, -enemy.vel.y);
    if (onGround) {
      enemy.vel.y = Math.max(enemy.vel.y, -2);
      enemy.airTime = 0;
    } else enemy.airTime += dt;
    enemy.grounded = onGround;
    try {
      enemy.body?.setNextKinematicTranslation({
        x: enemy.position.x,
        y: enemy.position.y + enemy.height / 2 + KCC_OFFSET,
        z: enemy.position.z,
      });
    } catch {}
    enemy.prevActualVel.copy(enemy.actualVel);
    enemy.actualVel.set(dx / dt, dy / dt, dz / dt);
    const ax = (enemy.actualVel.x - enemy.prevActualVel.x) / dt;
    const az = (enemy.actualVel.z - enemy.prevActualVel.z) / dt;
    enemy.accel.x += (clamp(ax, -60, 60) - enemy.accel.x) * (1 - Math.exp(-12 * dt));
    enemy.accel.z += (clamp(az, -60, 60) - enemy.accel.z) * (1 - Math.exp(-12 * dt));
    this.turn(enemy, dt);
  }
  skyContact(enemy, onGround) {
    const skyY = this.skyAt(enemy.position.x, enemy.position.z);
    if (onGround) {
      if (skyY !== null && Math.abs(enemy.position.y - skyY) < 1.6) {
        enemy.onSky = true;
        enemy.skyY = skyY;
        enemy.lastSkyPos.copy(enemy.position);
      } else if (enemy.position.y < enemy.skyY - 4) enemy.onSky = false;
      return false;
    } else {
      return !enemy.onSky || enemy.position.y > enemy.skyY - 5
        ? false
        : enemy.ex
          ? (enemy.body?.setNextKinematicTranslation({
              x: enemy.home.x,
              y: enemy.home.y + enemy.height / 2 + KCC_OFFSET,
              z: enemy.home.z,
            }),
            this.teleport(enemy, enemy.home),
            this.fx.puddle(enemy.home, enemy.radius * 2.6, 3),
            this.fx.sparks(_smudgePos.copy(enemy.home).setY(enemy.home.y + 1), enemy.ex.color, 30, 6, 3.5, 0.09, 2),
            (enemy.grounded = true),
            (enemy.rise = 0.3),
            this.setState(enemy, 'rise'),
            this.releaseToken(enemy),
            (enemy.telegraphing = false),
            (enemy.alerted = false),
            (enemy.awareness = 0.7),
            (enemy.onSky = true),
            (enemy.skyY = enemy.home.y),
            true)
          : (this.startFall(enemy), true);
    }
  }
  startFall(enemy) {
    this.releaseToken(enemy);
    const wasAlerted = enemy.alerted;
    enemy.alive = false;
    enemy.alerted = false;
    enemy.telegraphing = false;
    enemy.attackEta = 0;
    for (const effect of [...enemy.statuses]) this.endStatus(enemy, effect, 'fall');
    this.removeBody(enemy);
    this.setState(enemy, 'fall');
    enemy.invuln = 99;
    enemy.onSky = false;
    enemy.ballistic = false;
    enemy.tumbleV = (Math.random() < 0.5 ? -1 : 1) * randBetween(5, 9);
    enemy.tumbleAxis = Math.random() - 0.5;
    enemy.vel.x += enemy.knock.x * 0.4;
    enemy.vel.z += enemy.knock.z * 0.4;
    enemy.knock.multiplyScalar(0.6);
    enemy.sparkT = 0;
    const dx = enemy.home.x - enemy.lastSkyPos.x;
    const dz = enemy.home.z - enemy.lastSkyPos.z;
    const dist = Math.hypot(dx, dz);
    const inset = Math.min(2, dist);
    const lootPos = _smudgeDir.set(
      enemy.lastSkyPos.x + (dist > 0.01 ? (dx / dist) * inset : 0),
      enemy.skyY,
      enemy.lastSkyPos.z + (dist > 0.01 ? (dz / dist) * inset : 0),
    );
    lootPos.y = this.ground(lootPos.x, lootPos.z, enemy.skyY + 1);
    if (!enemy.ex) this.dropLoot(enemy, lootPos);
    this.fx.sparks(
      _smudgePos.copy(enemy.position).setY(enemy.position.y + enemy.height * 0.5),
      PURE_WHITE,
      12,
      4,
      3,
      0.08,
      0,
    );
    if (wasAlerted) {
      let othersAlerted = 0;
      for (const other of this.enemies) if (other !== enemy && other.alive && other.alerted) othersAlerted++;
      if (othersAlerted === 0)
        try {
          this.ctx.time.slowMo(0.4, 0.6);
        } catch {}
    }
  }
  stepFall(enemy, dt) {
    enemy.vel.y = Math.max(-45, enemy.vel.y - ENEMY_GRAVITY * dt);
    enemy.knock.multiplyScalar(Math.exp(-0.4 * dt));
    const dx = (enemy.vel.x + enemy.knock.x) * dt;
    const dy = enemy.vel.y * dt;
    const dz = (enemy.vel.z + enemy.knock.z) * dt;
    enemy.position.x += dx;
    enemy.position.y += dy;
    enemy.position.z += dz;
    enemy.position.x = clamp(enemy.position.x, -158, 158);
    enemy.position.z = clamp(enemy.position.z, -158, 158);
    enemy.tumble += enemy.tumbleV * dt;
    enemy.grounded = false;
    enemy.prevActualVel.copy(enemy.actualVel);
    enemy.actualVel.set(dx / dt, dy / dt, dz / dt);
    enemy.sparkT -= dt;
    if (enemy.sparkT <= 0) {
      enemy.sparkT = 0.05;
      paletteColor(COLORS[Math.floor(Math.random() * 4)], _fxTint);
      this.fx.glows.spawn(
        this.time,
        enemy.position.x,
        enemy.position.y + enemy.height * 0.5,
        enemy.position.z,
        randBetween(-1, 1),
        randBetween(1, 3),
        randBetween(-1, 1),
        0.24 * Math.sqrt(enemy.def.size),
        0.9,
        _fxTint,
        3.2,
        0,
        1,
        0,
      );
      if (Math.random() < 0.3)
        this.fx.paintSplash(
          _smudgePos.copy(enemy.position).setY(enemy.position.y + enemy.height * 0.5),
          COLORS[Math.floor(Math.random() * 4)],
          2,
          2,
          0.08,
        );
      if (enemy.tier === 2 && Math.random() < 0.5) this.fx.sparks(enemy.position, STORM_VIOLET, 2, 3, 4, 0.06, 0);
    }
    const terrainY = this.terrainAt(enemy.position.x, enemy.position.z);
    let floorY = Math.max(terrainY, this.ctx.water?.level ?? 0);
    const skyY = this.skyAt(enemy.position.x, enemy.position.z);
    if (skyY !== null && skyY < enemy.position.y + 0.5 && skyY < enemy.skyY - 4) floorY = Math.max(floorY, skyY);
    if (enemy.position.y <= floorY || enemy.stateT > 9) {
      enemy.position.y = floorY;
      if (floorY <= (this.ctx.water?.level ?? 0) + 0.05 && skyY === null && terrainY < floorY) {
        const splashPos = _smudgePos.set(enemy.position.x, floorY + 0.05, enemy.position.z);
        this.fx.inkSplash(splashPos, null, 24, 7, 0.1, WATER_SPLASH);
        this.fx.ring(splashPos, 0.4, 4, 1, WATER_SPLASH, 1.8);
      }
      this.emit('camera:shake', {
        strength: 0.1,
        position: enemy.position.clone(),
      });
      this.burst(enemy, true);
    }
  }
  kccForElite(kind) {
    const cached = this.eliteKcc[kind];
    if (cached !== undefined) return cached;
    let kcc = null;
    try {
      const scale = eliteDef(kind).size / ENEMY_DEFS[kind].size;
      kcc = this.ctx.physics.createCharacterController(KCC_OFFSET);
      kcc.setUp({
        x: 0,
        y: 1,
        z: 0,
      });
      kcc.setSlideEnabled(true);
      kcc.enableAutostep((kind === 'brute' ? 0.6 : 0.32) * Math.sqrt(scale), 0.15, false);
      kcc.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
      kcc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
      kcc.enableSnapToGround(0.5);
      try {
        kcc.setApplyImpulsesToDynamicBodies(true);
        kcc.setCharacterMass(kind === 'brute' ? 900 : 120);
      } catch {}
    } catch (err) {
      console.warn('[enemies] elite KCC unavailable', err);
      kcc = this.kcc[kind] ?? null;
    }
    this.eliteKcc[kind] = kcc;
    return kcc;
  }
  turn(enemy, dt) {
    const def = enemy.def;
    let faceTarget = enemy.faceTarget;
    if (
      faceTarget === null &&
      enemy.controllable &&
      Math.hypot(enemy.vel.x, enemy.vel.z) > 0.4 &&
      enemy.state !== 'attack'
    )
      faceTarget = Math.atan2(enemy.vel.x, enemy.vel.z);
    if (faceTarget !== null && enemy.controllable) {
      const diff = wrapYaw2(faceTarget - enemy.facing);
      const rate = def.turnRate * (enemy.state === 'notice' ? 2 : enemy.state === 'telegraph' ? 0.8 : 1);
      const delta = clamp(diff, -rate * dt, rate * dt);
      enemy.facing = wrapYaw2(enemy.facing + delta);
    }
  }
  onLand(enemy, impact) {
    if (impact > 3) {
      enemy.anim.kick(CH.SQUASH, -Math.min(6, impact * 0.5));
      this.fx.dust(enemy.position, impact > 7 ? 4 : 2, enemy.radius, 0.35 * Math.sqrt(enemy.def.size), undefined, 0.35);
    }
    if (enemy.has('launched')) {
      if (enemy.launchBounces === 0) {
        enemy.launchBounces = 1;
        const launchLandDamage = STATUS_TUNING.launchLandDamage;
        enemy.health -= launchLandDamage;
        enemy.flash = 0.8;
        enemy.anim.kick(CH.SQUASH, -6);
        this.fx.inkSplash(_smudgePos.copy(enemy.position).setY(enemy.position.y + 0.1), null, 12, 3.5, 0.07);
        this.fx.dust(enemy.position, 5, enemy.radius * 1.5, 0.5);
        this.emit('combat:hit', {
          enemyId: enemy.id,
          kind: enemy.kind,
          position: enemy.position.clone(),
          damage: launchLandDamage,
          color: 'yellow',
          source: 'environment',
          killed: enemy.health <= 0,
        });
        if (enemy.health <= 0) {
          this.kill(enemy, 'yellow', _smudgeVec.set(0, 0, 1), 'environment', enemy.alerted);
          return;
        }
        enemy.vel.y = enemy.def.launchSpeed * 0.32;
        enemy.grounded = false;
        enemy.airLock = 0.1;
      } else {
        this.endStatus(enemy, 'launched', 'landed');
        if (enemy.alerted) this.setState(enemy, 'stagger');
        enemy.hurtT = 0.45;
      }
    }
    if (enemy.kind === 'brute' && impact > 5)
      this.emit('camera:shake', {
        strength: 0.15,
        position: enemy.position.clone(),
      });
    if (enemy.ex && enemy.alive) this.elite.onLand(enemy, impact);
  }
  worldReact(enemy, dt) {
    enemy.worldT -= dt;
    if (enemy.worldT > 0) return;
    enemy.worldT = 0.15 + Math.random() * 0.05;
    const depth = this.waterDepth(enemy.position.x, enemy.position.z, enemy.position.y);
    if (enemy.ex && depth > enemy.height * 0.45 && enemy.position.y < this.ctx.water.level - enemy.height * 0.2) {
      this.fx.inkSplash(
        _smudgePos.set(enemy.position.x, this.ctx.water.level, enemy.position.z),
        null,
        14,
        4,
        0.07,
        WATER_SPLASH,
      );
      this.teleport(enemy, enemy.home);
      this.fx.puddle(enemy.home, enemy.radius * 2.6, 3);
      enemy.rise = 0.3;
      this.setState(enemy, 'rise');
      return;
    }
    if (depth > enemy.height * 0.55 && enemy.position.y < this.ctx.water.level - enemy.height * 0.3) {
      this.releaseToken(enemy);
      enemy.alive = false;
      enemy.alerted = false;
      enemy.telegraphing = false;
      for (const effect of [...enemy.statuses]) this.endStatus(enemy, effect, 'water');
      this.removeBody(enemy);
      this.setState(enemy, 'sink');
      this.fx.inkSplash(
        _smudgePos.set(enemy.position.x, this.ctx.water.level, enemy.position.z),
        null,
        14,
        4,
        0.07,
        WATER_SPLASH,
      );
      this.fx.ring(_smudgePos, 0.3, 2, 0.6, WATER_SPLASH, 1.2);
      return;
    }
    if (depth > 0.2 && enemy.has('burning')) this.endStatus(enemy, 'burning', 'water');
    if (!enemy.has('burning') && !enemy.has('frozen'))
      try {
        if (this.ctx.elements.isBurning(enemy.position, enemy.radius + 0.2)) this.applyStatus(enemy, 'burning');
      } catch {}
    if (!enemy.grounded) return;
    let paint = null;
    try {
      paint = this.ctx.paint.dominant(
        _smudgePos.set(enemy.position.x, enemy.position.y + 0.08, enemy.position.z),
        0.35,
      );
    } catch {
      paint = null;
    }
    enemy.paintUnder = paint;
    if (!(enemy.ex && paint === enemy.ex.element))
      if (paint === 'blue') {
        enemy.slipT = 0.45;
        if (Math.random() < 0.25) this.fx.sparks(enemy.position, FROST_GLINT, 2, 1, 1.5, 0.05, 0);
      } else if (paint === 'yellow' && enemy.bounceCd <= 0 && !enemy.has('rooted') && !enemy.has('frozen')) {
        enemy.bounceCd = 0.9;
        enemy.vel.y = enemy.kind === 'brute' || enemy.ex ? 7 : 9.5;
        enemy.grounded = false;
        enemy.airLock = 0.15;
        enemy.anim.kick(CH.SQUASH, -5);
        this.fx.sparks(enemy.position, SPRING_SPARK, 10, 3, 2.5, 0.08, 3);
        if (enemy.state === 'telegraph') {
          this.releaseToken(enemy);
          enemy.telegraphing = false;
          this.setState(enemy, 'stagger');
          enemy.hurtT = 0.5;
        }
      } else if (paint === 'green' && !enemy.has('launched'))
        this.applyStatus(enemy, 'rooted', undefined, STATUS_TUNING.rootedPaintTime);
  }
  onSplat(colliderHandle, color, pos, normal) {
    if (colliderHandle == null) return;
    const enemy = this.byCollider.get(colliderHandle);
    if (!enemy || !enemy.alive) return;
    const dir = new Vector3(enemy.position.x - pos.x, 0, enemy.position.z - pos.z);
    if (dir.lengthSq() < 0.000001 && normal) dir.set(-normal.x, 0, -normal.z);
    if (dir.lengthSq() < 0.000001) dir.set(enemy.position.x - this.pPos.x, 0, enemy.position.z - this.pPos.z);
    dir.normalize();
    this.damage(enemy.id, {
      damage: 0.5,
      color,
      direction: dir,
      knockback: 3,
      source: 'blob',
      point: pos.clone(),
    });
  }
  onPlayerDeath() {
    this.grace = 4;
    for (const enemy of this.enemies)
      if (enemy.alive && (enemy.alerted || enemy.distToPlayer < 60)) {
        enemy.alerted = false;
        enemy.awareness = 0;
        this.releaseToken(enemy);
        enemy.telegraphing = false;
        enemy.resetPending = true;
        if (enemy.controllable && enemy.state !== 'rise') this.setState(enemy, 'return');
      }
    this.globs.clear();
    this.elite.reset();
  }
  onPlayerRespawn() {
    this.grace = 2;
    for (const enemy of this.enemies)
      if (enemy.alive && enemy.resetPending) {
        enemy.resetPending = false;
        enemy.health = enemy.maxHealth;
        for (const effect of [...enemy.statuses]) this.endStatus(enemy, effect, 'reset');
        if (enemy.position.distanceTo(enemy.home) > 3) this.teleport(enemy, enemy.home);
        enemy.facing = enemy.homeFacing;
        this.setState(enemy, 'idle');
      }
  }
  ambientFx(enemy, dt) {
    const camDistSq = this.ctx.camera.position.distanceToSquared(enemy.position);
    if (enemy.ex) this.elite.aura(enemy, dt, camDistSq);
    else if (enemy.tier === 2) this.storm.ambient(enemy, dt, camDistSq);
    if (camDistSq > 1225) return;
    const rig = this.models[enemy.kind].rig;
    if (enemy.grounded && enemy.gaitAmp > 0.3 && enemy.kind !== 'spitter') {
      const stepIndex = Math.floor(enemy.gaitPhase / Math.PI);
      if (stepIndex !== enemy.lastStep && ((enemy.lastStep = stepIndex), camDistSq < 784 && stepIndex % 2 == 0)) {
        const side = stepIndex % 4 == 0 ? 1 : -1;
        const ox = Math.cos(enemy.facing) * side * enemy.radius * 0.45;
        const oz = -Math.sin(enemy.facing) * side * enemy.radius * 0.45;
        this.fx.puddle(
          _smudgePos.set(enemy.position.x + ox, enemy.position.y, enemy.position.z + oz),
          (enemy.kind === 'brute' ? 0.34 : 0.14) * enemy.scale,
          3.2,
          enemy.tier === 2 ? STORM_INK : FX_INK,
          0.55,
        );
      }
    }
    enemy.dripT -= dt;
    if (enemy.dripT <= 0 && rig.dripPoints.length) {
      enemy.dripT = randBetween(0.5, 1.4) / Math.sqrt(enemy.def.size);
      const dripPoint = rig.dripPoints[Math.floor(Math.random() * rig.dripPoints.length)];
      partToWorld(enemy, rig, BONE.top, dripPoint, _smudgePos);
      this.fx.drops.spawn(
        this.time,
        _smudgePos.x,
        _smudgePos.y,
        _smudgePos.z,
        enemy.actualVel.x * 0.3,
        -0.5,
        enemy.actualVel.z * 0.3,
        0.035 * Math.sqrt(enemy.def.size),
        1.2,
        this.fxFloor(_smudgePos.x, _smudgePos.z, enemy.position.y),
        enemy.tier === 2 ? STORM_INK : FX_INK,
        0,
        16,
        0.2,
      );
    }
    if (enemy.has('burning') && ((enemy.flameT -= dt), enemy.flameT <= 0)) {
      enemy.flameT = 0.06;
      topMatrix(enemy, rig, _flameMatrix);
      const flamePoint = rig.flamePoints[Math.floor(Math.random() * rig.flamePoints.length)];
      _smudgePos.copy(flamePoint).applyMatrix4(_flameMatrix);
      this.fx.glows.spawn(
        this.time,
        _smudgePos.x + randBetween(-0.1, 0.1),
        _smudgePos.y,
        _smudgePos.z + randBetween(-0.1, 0.1),
        randBetween(-0.5, 0.5),
        randBetween(1.5, 3),
        randBetween(-0.5, 0.5),
        randBetween(0.04, 0.08),
        randBetween(0.5, 1),
        WARM_GLOW,
        3.5,
        -1,
        1.5,
        1,
      );
      if (Math.random() < 0.35) this.fx.smoke(_smudgePos, 1, SOOT_GREY, 0.3 * Math.sqrt(enemy.def.size), 0.35);
    }
    if (enemy.has('frozen') && Math.random() < dt * 4)
      this.fx.sparks(
        _smudgePos.set(
          enemy.position.x + randBetween(-0.4, 0.4),
          enemy.position.y + randBetween(0.2, enemy.height),
          enemy.position.z + randBetween(-0.4, 0.4),
        ),
        FROST_GLINT,
        1,
        0.3,
        2,
        0.07,
        -0.5,
      );
  }
  zooDrive(enemy, dt) {
    const zooState = this.opts.zooState ?? 'idle';
    enemy.actualVel.set(0, 0, 0);
    enemy.accel.set(0, 0, 0);
    enemy.alerted = zooState !== 'idle' && zooState !== 'walk' && zooState !== 'run';
    enemy.awareness = +!!enemy.alerted;
    this.tickStatuses(enemy, dt);
    switch (zooState) {
      case 'walk':
      case 'run':
      case 'flee': {
        const speed = zooState === 'walk' ? enemy.def.walkSpeed : enemy.def.runSpeed;
        enemy.actualVel.set(Math.sin(enemy.facing) * speed, 0, Math.cos(enemy.facing) * speed);
        enemy.state = zooState === 'flee' ? 'flee' : 'wander';
        break;
      }
      case 'frozen':
      case 'burning':
      case 'rooted':
      case 'launched': {
        const effect = zooState;
        if (!enemy.has(effect) && enemy.immuneT[effect] <= 0) this.applyStatus(enemy, effect);
        if (enemy.has(effect)) enemy.statusT[effect] = Math.max(enemy.statusT[effect], 1.5);
        if (effect === 'launched') {
          enemy.tumble += enemy.tumbleV * dt;
          enemy.grounded = false;
          enemy.position.y = enemy.home.y + 1.2 + Math.sin(this.time * 2) * 0.2;
        }
        enemy.state = 'engage';
        break;
      }
      default:
        if (enemy.state === 'idle' || enemy.state === 'wander') enemy.state = 'idle';
    }
  }
  lateUpdate(dt) {
    const camera = this.ctx.camera;
    _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _cullFrustum.setFromProjectionMatrix(_projScreenMatrix);
    for (const kind of ENEMY_KINDS) this.renderers[kind].begin();
    this.flames.begin();
    this.ice.begin();
    this.vines.begin();
    const frame = {
      time: this.time,
      player: this.pPos,
      freeLook: this.opts.zoo && (this.opts.zooState === 'idle' || this.opts.zooState === 'walk'),
    };
    for (const enemy of this.enemies) {
      const camDistSq = camera.position.distanceToSquared(enemy.position);
      if (camDistSq > AI.renderDist * AI.renderDist) {
        enemy.rendered = false;
        continue;
      }
      try {
        if (this.opts.zoo) this.zooPose(enemy, dt, frame);
        else animateEnemy(enemy, dt, frame);
      } catch (err) {
        console.warn('[enemies] animate failed', err);
      }
      _cullSphere.center.set(enemy.position.x, enemy.position.y + enemy.height * 0.5, enemy.position.z);
      _cullSphere.radius = enemy.height * 0.9 + 0.5;
      if (!_cullFrustum.intersectsSphere(_cullSphere) && camDistSq > 400) {
        enemy.rendered = false;
        continue;
      }
      const renderer = this.renderers[enemy.kind];
      const slot = renderer.push();
      if (!(slot < 0)) {
        writeInstance(enemy, this.models[enemy.kind].rig, renderer.data, slot);
        enemy.rendered = true;
        this.statusVisuals(enemy);
      }
    }
    for (const kind of ENEMY_KINDS) this.renderers[kind].end();
    try {
      this.elite.renderFlames();
      this.elite.render();
      this.elite.renderExtra();
    } catch (err) {
      console.warn('[enemies] elite render failed', err);
    }
    this.flames.end();
    this.ice.end();
    this.vines.end();
    this.globs.render();
    this.pickups.render();
    this.fx.flush();
  }
  zooPose(enemy, dt, frame) {
    const zooState = this.opts.zooState ?? 'idle';
    const savedStateT = enemy.stateT;
    const loopTime = (period) => enemy.stateT % period;
    if (
      zooState === 'telegraph' ||
      zooState === 'cycle' ||
      zooState === 'backhand' ||
      zooState === 'notice' ||
      zooState === 'stagger' ||
      zooState === 'dying'
    ) {
      const kind = enemy.kind;
      if (zooState === 'telegraph') {
        const attack = kind === 'smudgeling' ? 'lunge' : kind === 'spitter' ? 'spit' : 'slam';
        enemy.attack = attack;
        const windup = ATTACKS[attack].windup;
        const phase = loopTime(windup + 0.6);
        enemy.state = phase < windup ? 'telegraph' : 'engage';
        enemy.stateT = phase;
      } else if (zooState === 'cycle' || zooState === 'backhand') {
        const attack =
          zooState === 'backhand' ? 'backhand' : kind === 'smudgeling' ? 'lunge' : kind === 'spitter' ? 'spit' : 'slam';
        enemy.attack = attack;
        const windup = ATTACKS[attack].windup;
        const strikeDur = 0.35;
        const recover = ATTACKS[attack].recover;
        const phase = loopTime(windup + strikeDur + recover + 0.8);
        if (phase < windup) {
          enemy.state = 'telegraph';
          enemy.stateT = phase;
        } else if (phase < windup + strikeDur) {
          enemy.state = 'attack';
          enemy.stateT = phase - windup;
        } else if (phase < windup + strikeDur + recover) {
          enemy.state = 'recover';
          enemy.stateT = phase - windup - strikeDur;
        } else {
          enemy.state = 'engage';
          enemy.stateT = phase;
        }
      } else if (zooState === 'notice') {
        const phase = loopTime(1.6);
        enemy.state = phase < enemy.def.noticeTime ? 'notice' : 'engage';
        enemy.stateT = phase;
      } else if (zooState === 'stagger') {
        enemy.state = 'stagger';
        enemy.stateT = loopTime(1);
      } else if (zooState === 'dying') {
        enemy.state = 'dying';
        enemy.stateT = loopTime(1.1) * 0.55;
        enemy.deathT = Math.min(1, enemy.stateT / 0.55);
      }
    }
    enemy.stateT;
    animateEnemy(enemy, dt, frame);
    enemy.stateT = savedStateT;
  }
  statusVisuals(enemy) {
    const rig = this.models[enemy.kind].rig;
    const size = enemy.def.size;
    if (enemy.has('burning') || (enemy.charr > 0.3 && enemy.state === 'dying')) {
      topMatrix(enemy, rig, _flameMatrix);
      const len = rig.flamePoints.length;
      for (let i = 0; i < len; i++) {
        _smudgePos.copy(rig.flamePoints[i]).applyMatrix4(_flameMatrix);
        const flameSize = (0.2 + 0.08 * ((i * 0.37) % 1)) * size ** 0.7;
        this.flames.add(
          _smudgePos,
          flameSize * 1.1,
          flameSize * 2,
          enemy.charr,
          enemy.seed * 10 + i * 1.7,
          0.18 * Math.sqrt(size),
        );
      }
    }
    if (enemy.has('frozen') || enemy.shell > 0.01) {
      const grow = enemy.shell < 1 ? overshoot(enemy.shell) : 1;
      const crack = enemy.has('frozen') ? clamp(1 - enemy.statusT.frozen / 0.6, 0, 1) : 0;
      _smudgePos.copy(enemy.position);
      this.ice.add(
        _smudgePos,
        enemy.facing,
        rig.bodyRadius * enemy.scale * 1.3 + 0.08,
        enemy.height * 1.02,
        grow,
        crack,
        enemy.seed,
      );
    }
    if (enemy.vines > 0.01)
      this.vines.add(
        enemy.position,
        enemy.facing,
        rig.bodyRadius * enemy.scale * 1.02,
        enemy.height * 0.8,
        enemy.vines,
        enemy.seed,
      );
  }
}
function overshoot(t) {
  return 1 + 2.9 * (t - 1) ** 3 + 1.9 * (t - 1) ** 2;
}
