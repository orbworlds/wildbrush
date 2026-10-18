/**
 * Base class for the sky realms beyond the Aerie (Canopy Isle, Cinder Isle and Frostspire): builds their isle shapes, colliders, chests, ink plants, water, clouds, motes and flora, tracks walkable surfaces, puzzles and enemy groups, and announces the realm when the hero lands on it.
 */
import { BufferAttribute, Group, Sphere, Vector3 } from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
import { makeRng } from '../core/math.js';
import { SkyChests } from '../shared/chests.js';
import { InkPlants } from '../shared/ink.js';
import { Motes } from '../shared/motes.js';
import { ParticleMode, Particles } from '../shared/particles.js';
import { SkyBuilder } from './builder.js';
import { createClouds } from './clouds.js';
import { createFlora } from './flora.js';
import { FloatingIsle } from './isle.js';
import { createSkyMaterials } from './materials.js';
import { buildUnderside } from './ruins.js';
import { SkyVegField } from './veg-field.js';
import { SkyVitality } from './vitality.js';
import { buildSkyWater } from './water.js';
const realmV3 = (x2, y, z) => new Vector3(x2, y, z);
const REALM_TAU = Math.PI * 2;
export class Realm {
  ctx;
  id;
  name;
  subtitle;
  biome;
  opts;
  group = new Group();
  far = new Group();
  near = new Group();
  inkGroup = new Group();
  trunks = [];
  inkCenter = new Vector3();
  isles;
  main;
  vit;
  mats;
  b;
  r;
  low;
  surfs = [];
  spots = {};
  chestDefs = [];
  falls = [];
  pools = [];
  trees = [];
  puffs = [];
  motes = [];
  clear = [];
  ink = [];
  colliders = [];
  offs = [];
  owned = [];
  chests = null;
  particles = null;
  flora = null;
  clouds = null;
  water = null;
  moteField = null;
  inkPlants = null;
  cx = 0;
  cz = 0;
  reach = 0;
  botY = Infinity;
  topY = -Infinity;
  baseY = 100;
  grass = false;
  flowersSeed = 'realm';
  loc = {
    i0: 0,
    i1: 0,
    i2: 0,
    w0: 0,
    w1: 0,
    w2: 0,
  };
  groups = [];
  enemyT = 0;
  discoverT = 0;
  announcedAt = -Infinity;
  lastOn = -Infinity;
  fxUntil = 0;
  inkWasNear = false;
  errors = 0;
  solved = new Set();
  visited = false;
  constructor(ctx, id, title, subtitle, isleDefs, biome, opts, margin = 0) {
    this.ctx = ctx;
    this.id = id;
    this.name = title;
    this.subtitle = subtitle;
    this.biome = biome;
    this.opts = opts;
    this.group.name = `sky-${id}`;
    this.far.name = `sky-${id}-far`;
    this.near.name = `sky-${id}-near`;
    this.group.add(this.far, this.near, this.inkGroup);
    this.low = opts.quality === 'low';
    this.r = makeRng(`sky-${id}`);
    this.isles = isleDefs.map((def) => new FloatingIsle(def));
    this.main = this.isles[0];
    this.cx = this.main.cx;
    this.cz = this.main.cz;
    let reach = 0;
    for (const isle of this.isles) {
      reach = Math.max(reach, Math.hypot(isle.cx - this.cx, isle.cz - this.cz) + isle.maxR);
      this.botY = Math.min(this.botY, isle.bottomY);
      this.topY = Math.max(this.topY, isle.maxY);
    }
    this.reach = reach + margin;
    this.baseY = this.main.def.y;
    const size = Math.ceil(this.reach * 2 + 8);
    const res = Math.max(128, Math.min(384, Math.ceil(size / 0.45 / 32) * 32));
    this.vit = new SkyVitality(Math.floor(this.cx - size / 2), Math.floor(this.cz - size / 2), size, res);
    if (opts.bloom) this.vit.restoreAll();
    this.mats = createSkyMaterials(ctx, this.vit, biome);
    this.b = new SkyBuilder(ctx);
  }
  groundAt(x, z) {
    let best = null;
    for (const isle of this.isles)
      if (isle.locate(x, z, this.loc)) {
        const y = isle.heightFrom(this.loc);
        if (best === null || y > best) best = y;
      }
    return best;
  }
  G(dx, dz) {
    return this.groundAt(this.cx + dx, this.cz + dz) ?? this.main.def.y;
  }
  W(dx, y, dz) {
    return realmV3(this.cx + dx, y, this.cz + dz);
  }
  P(dx, dz, lift = 0) {
    return realmV3(this.cx + dx, this.G(dx, dz) + lift, this.cz + dz);
  }
  spot(key, pos) {
    this.spots[key] = pos.clone();
    return this.spots[key];
  }
  collider(desc, info, groups = COLLISION_GROUPS.static) {
    try {
      desc.setCollisionGroups(groups);
      const collider = this.ctx.physics.createCollider(desc);
      this.ctx.colliders.register(collider, {
        ...info,
        data: {
          sky: this.id,
          ...info.data,
        },
      });
      this.colliders.push(collider);
      return collider;
    } catch (err) {
      console.warn(`[sky:${this.id}] collider failed`, err);
      return null;
    }
  }
  trimesh(geometry, info, groups = COLLISION_GROUPS.terrain) {
    try {
      const geo = geometry;
      const position = geo.getAttribute('position');
      const vertices = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        vertices[i * 3] = position.getX(i);
        vertices[i * 3 + 1] = position.getY(i);
        vertices[i * 3 + 2] = position.getZ(i);
      }
      let indices;
      if (geo.index) indices = new Uint32Array(geo.index.array);
      else {
        indices = new Uint32Array(position.count);
        for (let i = 0; i < position.count; i++) indices[i] = i;
      }
      const RAPIER = this.ctx.RAPIER;
      const FIX_INTERNAL_EDGES = RAPIER.TriMeshFlags?.FIX_INTERNAL_EDGES;
      let desc = null;
      try {
        desc = RAPIER.ColliderDesc.trimesh(vertices, indices, FIX_INTERNAL_EDGES);
      } catch {
        desc = RAPIER.ColliderDesc.trimesh(vertices, indices);
      }
      if (!desc) return null;
      desc.setCollisionGroups(groups).setFriction(0.9);
      const collider = this.ctx.physics.createCollider(desc);
      info.data = {
        sky: this.id,
        ...(info.data ?? {}),
      };
      this.ctx.colliders.register(collider, info);
      this.colliders.push(collider);
      return collider;
    } catch (err) {
      console.warn(`[sky:${this.id}] trimesh failed`, err);
      return null;
    }
  }
  removeCollider(collider) {
    if (!collider) return;
    try {
      this.ctx.colliders.unregister(collider);
      this.ctx.physics.removeCollider(collider, false);
    } catch {}
    const idx = this.colliders.indexOf(collider);
    if (idx >= 0) this.colliders.splice(idx, 1);
  }
  addEnemies(key, members, respawn) {
    this.groups.push({
      key,
      members,
      respawn,
      ids: [],
      spawned: false,
      clearedAt: -1,
      done: false,
    });
  }
  sparkle(pos, count, speed, colors, life = 1.2, gravity = -2, size = 0.14) {
    const particles = this.particles;
    if (particles) {
      this.fxUntil = Math.max(this.fxUntil, this.ctx.time.elapsed + life + 1);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * REALM_TAU;
        const lift = 0.2 + Math.random() * 0.9;
        const vel = speed * (0.35 + Math.random() * 0.65);
        try {
          particles.spawn({
            x: pos.x,
            y: pos.y,
            z: pos.z,
            vx: Math.cos(angle) * vel * 0.7,
            vy: vel * lift,
            vz: Math.sin(angle) * vel * 0.7,
            color: colors[i % colors.length],
            size: size * (0.7 + Math.random() * 0.6),
            life: life * (0.6 + Math.random() * 0.6),
            drag: 1.3,
            gravity,
            mode: ParticleMode.Ballistic,
            bright: 2.2,
          });
        } catch {
          return;
        }
      }
    }
  }
  swirl(pos, count, radius, color, life = 2) {
    const particles = this.particles;
    if (particles) {
      this.fxUntil = Math.max(this.fxUntil, this.ctx.time.elapsed + life + 1);
      for (let i = 0; i < count; i++)
        try {
          particles.spawn({
            x: pos.x,
            y: pos.y,
            z: pos.z,
            color,
            size: 0.12 + Math.random() * 0.1,
            life: life * (0.6 + Math.random() * 0.5),
            mode: ParticleMode.Swirl,
            cx: pos.x,
            cy: pos.y,
            cz: pos.z,
            angle: Math.random() * REALM_TAU,
            radius: radius * (0.6 + Math.random() * 0.5),
            angVel: 2 + Math.random() * 2,
            shrink: radius * 0.3,
            vy: 1 + Math.random() * 2,
            bright: 2,
          });
        } catch {
          return;
        }
    }
  }
  keepFx(seconds) {
    this.fxUntil = Math.max(this.fxUntil, this.ctx.time.elapsed + seconds);
  }
  play(sound, pos, volume = 1) {
    try {
      this.ctx.audio.play(sound, {
        position: pos,
        volume,
      });
    } catch {}
  }
  toast(title, subtitle, color) {
    try {
      this.ctx.ui.toast(title, subtitle, color);
    } catch {}
  }
  solve(id, pos, bloom = 0) {
    if (!this.solved.has(id)) {
      this.solved.add(id);
      if (bloom > 0) this.vit.bloom(pos.x, pos.z, bloom, 3.2, 1);
      try {
        this.ctx.events.emit('puzzle:solved', {
          id,
          area: 'sky',
          position: pos.clone(),
        });
      } catch {}
    }
  }
  listen(type, handler) {
    let failures = 0;
    this.offs.push(
      this.ctx.events.on(type, (data) => {
        try {
          handler(data);
        } catch (err) {
          if (failures++ < 3) console.warn(`[sky:${this.id}] ${String(type)} handler failed`, err);
        }
      }),
    );
  }
  get player() {
    const player = this.ctx.player;
    return player && !player.isStub ? player : null;
  }
  undersides(crystalColors, options = {}) {
    for (const isle of this.isles) buildUnderside(this.b, isle, this.r, this.low, crystalColors, options);
  }
  finish() {
    const ctx = this.ctx;
    const b = this.b;
    this.isles.forEach((isle, i) => {
      const geo = isle.geometry();
      geo.setAttribute('aFloat', new BufferAttribute(new Float32Array(isle.vertCount), 1));
      b.rockParts.splice(i, 0, geo);
    });
    const built = b.build(this.mats, this.far);
    for (const collider of built.colliders) {
      this.colliders.push(collider);
      const info = ctx.colliders.get(collider.handle);
      if (info)
        info.data = {
          sky: this.id,
        };
    }
    const topSurface = this.biome === 1 ? 'snow' : this.biome === 2 ? 'rock' : 'grass';
    const RAPIER = ctx.RAPIER;
    const FIX_INTERNAL_EDGES = RAPIER.TriMeshFlags?.FIX_INTERNAL_EDGES;
    for (const isle of this.isles) {
      const sections = [
        [isle.index.slice(0, isle.topTris * 3), topSurface],
        [isle.index.slice(isle.topTris * 3), 'rock'],
      ];
      for (const [indices, surface] of sections) {
        let collider = null;
        for (const flags of [FIX_INTERNAL_EDGES, undefined])
          try {
            const desc = RAPIER.ColliderDesc.trimesh(isle.pos, indices, flags);
            if (!desc) continue;
            desc.setCollisionGroups(COLLISION_GROUPS.terrain).setFriction(0.9);
            collider = ctx.physics.createCollider(desc);
            break;
          } catch (err) {
            if (flags === undefined) console.error(`[sky:${this.id}] trimesh failed`, isle.def.id, err);
          }
        if (collider) {
          ctx.colliders.register(collider, {
            kind: 'terrain',
            surface,
            object: built.rock ?? this.far,
            data: {
              sky: this.id,
            },
          });
          this.colliders.push(collider);
        }
      }
    }
    const withScene = (scene) =>
      new Proxy(ctx, {
        get: (target, prop) => (prop === 'scene' ? scene : Reflect.get(target, prop)),
      });
    try {
      this.particles = new Particles(withScene(this.near), this.low ? 220 : 420);
    } catch (err) {
      console.warn(`[sky:${this.id}] particles failed`, err);
    }
    if (this.chestDefs.length)
      try {
        this.chests = new SkyChests(ctx, this.chestDefs, {
          sealed: false,
          lenses: [],
          particles: this.particles,
          onOpened: (chest) => {
            try {
              this.vit.bloom(
                chest.pos.x,
                chest.pos.z,
                chest.kind === 'small' ? 10 : chest.kind === 'cloud' ? this.reach * 1.2 : 22,
                chest.kind === 'cloud' ? 6 : 2.4,
                1,
              );
              this.onChestOpened(chest);
            } catch (err) {
              console.warn(`[sky:${this.id}] chest hook failed`, err);
            }
          },
        });
        this.near.add(this.chests.group);
      } catch (err) {
        console.error(`[sky:${this.id}] chests failed`, err);
      }
    if (this.ink.length && this.particles)
      try {
        this.inkPlants = new InkPlants(withScene(this.inkGroup), this.particles);
        for (const plant of this.ink) this.inkPlants.addAt(plant.color, plant.pos);
        this.inkPlants.build();
        for (const plant of this.ink) this.inkCenter.add(plant.pos);
        this.inkCenter.multiplyScalar(1 / this.ink.length);
      } catch (err) {
        console.warn(`[sky:${this.id}] ink plants failed`, err);
        this.inkPlants = null;
      }
    const heightAt = (x, z, fallback) => this.groundAt(x, z) ?? fallback;
    if (this.falls.length || this.pools.length)
      try {
        this.water = buildSkyWater(ctx, this.falls, this.pools, heightAt);
        this.far.add(this.water.mesh);
      } catch (err) {
        console.warn(`[sky:${this.id}] water failed`, err);
      }
    try {
      this.clouds = createClouds(
        ctx,
        this.isles,
        this.water?.mistPoints ?? [],
        this.opts.quality,
        this.puffs,
        `sky-${this.id}-clouds`,
      );
      this.clouds.mesh.frustumCulled = true;
      this.clouds.mesh.geometry.boundingSphere = new Sphere(
        realmV3(this.cx, (this.botY + this.topY) / 2, this.cz),
        this.reach + 70,
      );
      this.far.add(this.clouds.mesh);
    } catch (err) {
      console.warn(`[sky:${this.id}] clouds failed`, err);
    }
    if (this.motes.length)
      try {
        this.moteField = new Motes(
          withScene(this.near),
          this.motes,
          this.r,
          this.low ? 0.5 : this.opts.quality === 'medium' ? 0.75 : 1,
        );
        this.moteField.points.frustumCulled = false;
      } catch (err) {
        console.warn(`[sky:${this.id}] motes failed`, err);
      }
    if (this.grass || this.trees.length)
      try {
        const size = Math.ceil(this.reach * 2 + 8);
        const groundMap = new SkyVegField(
          Math.floor(this.cx - size / 2),
          Math.floor(this.cz - size / 2),
          size,
          this.isles,
          this.clear,
          this.grass ? (this.low ? 1.5 : 2) : 0.25,
        );
        this.flora = createFlora(
          ctx,
          this.vit,
          groundMap,
          this.trees,
          (x, z) => this.groundAt(x, z),
          () => this.baseY,
          {
            grass: this.grass,
            seed: `sky-${this.id}-trees`,
          },
        );
        this.near.add(this.flora.near);
        this.far.add(this.flora.trees);
        this.flora.trees.traverse((obj) => {
          if (/trunk/.test(obj.name)) this.trunks.push(obj);
        });
        this.owned.push({
          dispose: () => groundMap.texture.dispose(),
        });
      } catch (err) {
        console.error(`[sky:${this.id}] flora failed`, err);
      }
    this.listen('paint:splat', (splat) => {
      if (splat.surface !== 'world' || !this.contains(splat.position)) return;
      const radius = Math.max(4, Math.min(10, (splat.radius || 1.65) * 4));
      this.vit.bloom(
        splat.position.x,
        splat.position.z,
        radius,
        1.1,
        this.vit.at(splat.position.x, splat.position.z) > 0.9 ? 0 : 0.25,
      );
    });
    this.listen('enemy:death', (enemy) => {
      if (this.contains(enemy.position))
        this.vit.bloom(enemy.position.x, enemy.position.z, enemy.kind === 'brute' ? 12 : 9, 1.5, 0.6);
    });
    this.listen('elite:defeated', (elite) => {
      if (this.contains(elite.position)) this.vit.bloom(elite.position.x, elite.position.z, 30, 3.2, 1);
    });
    this.listen('settings:changed', ({ settings }) => this.flora?.setQuality(settings.quality));
  }
  onChestOpened(chest) {}
  inReach(x, z) {
    return Math.abs(x - this.cx) <= this.reach && Math.abs(z - this.cz) <= this.reach;
  }
  surfaceAt(x, z) {
    if (!this.inReach(x, z)) return null;
    let best = this.groundAt(x, z);
    for (const surf of this.surfs) {
      if (surf.on && !surf.on()) continue;
      let y = null;
      if (surf.k === 'disc') {
        const dx = x - surf.x;
        const dz = z - surf.z;
        if (dx * dx + dz * dz <= surf.r * surf.r) y = surf.y;
      } else if (surf.k === 'ring') {
        const dist = Math.hypot(x - surf.x, z - surf.z);
        if (dist >= surf.r0 && dist <= surf.r1) y = surf.y;
      } else if (surf.k === 'ramp') {
        const dx = surf.x1 - surf.x0;
        const dz = surf.z1 - surf.z0;
        const lenSq = dx * dx + dz * dz;
        if (lenSq <= 0) continue;
        const t = ((x - surf.x0) * dx + (z - surf.z0) * dz) / lenSq;
        if (t < 0 || t > 1 || Math.abs((x - surf.x0) * dz - (z - surf.z0) * dx) / Math.sqrt(lenSq) > surf.hw) continue;
        y = surf.y0 + (surf.y1 - surf.y0) * t;
      } else {
        const dx = x - surf.x;
        const dz = z - surf.z;
        if (dx * dx + dz * dz > surf.r * surf.r) continue;
        y = surf.f(x, z);
      }
      if (y !== null && (best === null || y > best)) best = y;
    }
    return best;
  }
  contains(pos) {
    return (
      !!pos &&
      Number.isFinite(pos.x + pos.y + pos.z) &&
      this.inReach(pos.x, pos.z) &&
      pos.y > this.botY - 10 &&
      pos.y < this.topY + 45
    );
  }
  isOn(pos, headroom = 1.2) {
    const y = this.surfaceAt(pos.x, pos.z);
    return y !== null && pos.y >= y - 0.6 && pos.y <= y + headroom;
  }
  camDist() {
    const position = this.ctx.camera.position;
    const horiz = Math.max(0, Math.hypot(position.x - this.cx, position.z - this.cz) - this.reach);
    const vert = position.y > this.topY ? position.y - this.topY : position.y < this.botY ? this.botY - position.y : 0;
    return Math.hypot(horiz, vert);
  }
  landing() {
    return this.spots[`${this.id}Landing`] ?? realmV3(this.cx, this.main.def.y, this.cz);
  }
  update(dt) {
    try {
      this.frame(dt);
    } catch (err) {
      if (this.errors++ < 3) console.error(`[sky:${this.id}] update failed`, err);
    }
  }
  frame(dt) {
    const ctx = this.ctx;
    this.vit.update(dt);
    const dist = this.camDist();
    const near = dist < 80;
    this.near.visible = near;
    this.inkGroup.visible = !!this.inkPlants && ctx.camera.position.distanceTo(this.inkCenter) < 55;
    if (this.flora) {
      this.flora.near.visible = dist < 70;
      this.flora.trees.visible = dist < 320;
      for (const trunk of this.trunks) trunk.visible = dist < 130;
    }
    if (this.chests) {
      this.chests.group.visible = dist < 90;
      this.chests.update(dt, ctx.time.realDt, near && !!this.player);
      if (this.chests.fxActive) this.keepFx(3);
    }
    const fxOn = near && ctx.time.elapsed < this.fxUntil;
    if (this.particles) {
      this.particles.points.visible = fxOn;
      if (fxOn) this.particles.update(dt);
    }
    if (this.moteField && near) this.moteField.update(ctx);
    const state = this.player?.state;
    if (this.inkPlants) {
      const inkNear = !!state && this.ink.some((ink) => ink.pos.distanceToSquared(state.position) < 484);
      if (inkNear) {
        this.keepFx(3);
        try {
          this.inkPlants.update(dt, !!this.chests && (this.chests.busy || this.chests.prompting));
        } catch {}
      } else if (this.inkWasNear)
        try {
          ctx.ui.hidePrompt('ink');
        } catch {}
      this.inkWasNear = inkNear;
    }
    this.discoverT -= dt;
    if (
      this.discoverT <= 0 &&
      state &&
      ((this.discoverT = 0.25), state.mode !== 'fly' && !state.dead && this.isOn(state.position, 1.3))
    ) {
      const elapsed = ctx.time.elapsed;
      if (this.announcedAt === -Infinity || elapsed - this.lastOn > 90) {
        this.announcedAt = elapsed;
        try {
          ctx.events.emit('area:enter', {
            id: this.id,
            name: this.name,
            subtitle: this.subtitle,
          });
        } catch {}
        this.onFirstLanding(!this.visited);
        this.visited = true;
      }
      this.lastOn = elapsed;
    }
    this.enemies(dt);
    this.step(dt, near);
  }
  onFirstLanding(first) {}
  enemies(dt) {
    this.enemyT -= dt;
    if (this.enemyT > 0 || !this.groups.length) return;
    this.enemyT = 0.5;
    const ctx = this.ctx;
    const enemies = ctx.enemies;
    if (!enemies || enemies.isStub) return;
    const nocombat = ctx.params.get('nocombat');
    if (nocombat && nocombat !== '0') return;
    const state = this.player?.state;
    if (!state) return;
    const position = state.position;
    const dist = Math.hypot(
      Math.max(0, Math.hypot(position.x - this.cx, position.z - this.cz) - this.reach),
      position.y > this.topY ? position.y - this.topY : position.y < this.botY - 20 ? this.botY - 20 - position.y : 0,
    );
    const elapsed = ctx.time.elapsed;
    for (const group of this.groups)
      if (!group.done) {
        if (!group.spawned) {
          if (dist > 60 || (group.clearedAt >= 0 && elapsed - group.clearedAt < 90)) continue;
          group.spawned = true;
          group.clearedAt = -1;
          group.ids = group.members.map((member) => {
            try {
              return enemies.spawn(member.kind, member.pos.clone(), {
                facing: member.facing ?? this.r() * REALM_TAU,
                elite: member.elite,
                tier: member.elite ? undefined : 2,
              });
            } catch {
              return -1;
            }
          });
          continue;
        }
        if (!group.ids.some((id) => id >= 0 && !!enemies.get(id)?.alive)) {
          if (group.clearedAt < 0) group.clearedAt = elapsed;
          if (!group.respawn) {
            group.done = true;
            continue;
          }
          if (dist > 150) group.spawned = false;
        }
      }
  }
  dispose() {
    this.offs.forEach((off) => off());
    this.offs.length = 0;
    try {
      this.chests?.dispose();
    } catch {}
    for (const collider of [...this.colliders])
      try {
        this.ctx.colliders.unregister(collider);
        this.ctx.physics.removeCollider(collider, false);
      } catch {}
    this.colliders.length = 0;
    this.group.traverse((obj) => {
      const mesh = obj;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.group.removeFromParent();
    this.water?.dispose();
    this.clouds?.dispose();
    this.flora?.dispose();
    this.mats.dispose();
    this.vit.texture.dispose();
    for (const item of this.owned)
      try {
        item.dispose();
      } catch {}
  }
}
