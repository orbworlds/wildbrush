/**
 * Temple base class shared by every Paint Temple: registers the interior and builds the common pieces (doors, braziers, ink webs, ink fonts, sconces, light shafts, hint stones, chests, portals). Tracks Small Keys and locked doors, checkpoints and safe ground, and lights the temple up once its crest is claimed.
 */
import { Box3, Color, CylinderGeometry, Group, Mesh, Vector3 } from 'three';
import { PALETTE } from '../core/config.js';
import { Hints } from '../shared/hints.js';
import { Motes } from '../shared/motes.js';
import { Particles } from '../shared/particles.js';
import { lathe } from '../shared/util.js';
import { TempleChests } from './chests.js';
import { InkFont, keyGeometry, Portal } from './devices.js';
import { _tmp, sleep } from './encounters.js';
import { glyphAtlas, makeGlyphMaterial } from './glyphs.js';
import { InkWeb } from './ink-web.js';
import { TempleKit } from './kit.js';
import { makeBeamMaterial, makeFlames } from './materials.js';
import { Brazier, sfx, TempleDoor, TempleLights } from './props.js';
import { KIND, makeStoneMaterial } from './stone-material.js';
export class Temple {
  ctx;
  spec;
  root = new Group();
  origin;
  kit;
  stone;
  glyphMat;
  flames;
  particles;
  lights;
  hints;
  chests = null;
  doors = [];
  braziers = [];
  webs = [];
  fonts = [];
  pickups = [];
  portals = [];
  rooms = [];
  locks = [];
  boss = null;
  keys = 0;
  completed = false;
  entered = false;
  active = false;
  exitTo = null;
  def;
  checkpoint = {
    pos: new Vector3(),
    facing: 0,
  };
  safe = new Vector3();
  safeFacing = 0;
  safeT = 0;
  respawning = false;
  deadHere = false;
  nextCh = 2;
  lockPrompt = null;
  litT = -1;
  lit = 0;
  onCompleted = null;
  moteDefs = [];
  motes = null;
  keyGeo;
  constructor(ctx, spec) {
    this.ctx = ctx;
    this.spec = spec;
    const pocket = spec.pocket;
    this.origin = new Vector3(pocket.x, pocket.y, pocket.z);
    this.root.name = `temple-${spec.id}`;
    this.kit = new TempleKit(ctx, this.origin);
    this.stone = makeStoneMaterial(ctx, {
      ...spec.theme,
      floorY: pocket.y,
    });
    this.glyphMat = makeGlyphMaterial(ctx, this.stone.chan, glyphAtlas());
    this.flames = makeFlames(ctx, spec.id);
    this.particles = new Particles(ctx, ctx.settings?.quality === 'low' ? 500 : 900);
    this.particles.points.removeFromParent();
    this.root.add(this.particles.points);
    this.lights = new TempleLights(this.stone);
    this.hints = new Hints(ctx);
    this.keyGeo = keyGeometry(15251018, PALETTE[spec.element].hex);
    const half = pocket.size / 2;
    this.def = {
      id: spec.id,
      name: spec.name,
      kind: 'temple',
      subtitle: spec.subtitle,
      bounds: new Box3(
        new Vector3(pocket.x - half, pocket.y - 14, pocket.z - half),
        new Vector3(pocket.x + half, pocket.y + 40, pocket.z + half),
      ),
      lighting: {
        ...spec.lighting,
      },
      object: this.root,
      respawn: this.checkpoint.pos,
      respawnFacing: spec.entry.facing,
    };
    this.checkpoint.pos.copy(this.kit.w(spec.entry.x, 0.05, spec.entry.z));
    this.checkpoint.facing = spec.entry.facing;
    this.safe.copy(this.checkpoint.pos);
    this.safeFacing = spec.entry.facing;
  }
  ch() {
    return Math.min(15, this.nextCh++);
  }
  get entryPos() {
    return this.kit.w(this.spec.entry.x, 0.05, this.spec.entry.z);
  }
  init() {
    this.layout();
    this.flames.build();
    this.root.add(this.flames.mesh);
    if (this.moteDefs.length)
      try {
        let seed = this.spec.id.length * 7919 + 17;
        const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const defs = this.moteDefs.map((moteDef) => ({
          ...moteDef,
          x: moteDef.x + this.origin.x,
          y: moteDef.y + this.origin.y,
          z: moteDef.z + this.origin.z,
        }));
        this.motes = new Motes(this.ctx, defs, rand, this.ctx.settings?.quality === 'low' ? 0.5 : 1);
        this.motes.points.removeFromParent();
        this.root.add(this.motes.points);
      } catch (err) {
        console.warn('[temples] motes failed', err);
      }
    const def = this.def;
    this.ctx.interiors.register(def);
    this.ctx.scene.add(this.root);
    this.root.visible = false;
  }
  door(x, z, width, height, alongX, style, startOpen = false, time) {
    const palette = this.palette;
    const door = new TempleDoor(
      this.ctx,
      {
        pos: this.kit.w(x, 0, z),
        width,
        height,
        alongX,
        style,
        colors: {
          stone: palette.stone,
          trim: palette.trim,
          metal: palette.metal,
          glass: palette.glass,
        },
        startOpen,
        time,
      },
      this.stone.material,
      this.root,
    );
    this.doors.push(door);
    return door;
  }
  lockedDoor(x, z, width, height, alongX, frontX, frontZ) {
    const door = this.door(x, z, width, height, alongX, 'locked');
    this.locks.push({
      door,
      front: this.kit.w(frontX, 0, frontZ),
      unlocked: false,
    });
    return door;
  }
  brazier(x, z, y = 0, scale = 1, onLit, color, withLight = true) {
    const palette = this.palette;
    const ch = this.ch();
    const flameAt = this.kit.brazier(x, z, y, palette.trim, palette.metal, palette.glass, ch, scale);
    const pos = this.kit.w(flameAt.x, flameAt.y, flameAt.z);
    const flameId = this.flames.add(pos, 1.35 * scale, 1.9 * scale, color ?? 16742960);
    const light = withLight
      ? this.lights.add(pos.clone().add(_tmp.set(0, 0.8, 0)), color ?? 16753752, 7 * scale, 11 * scale, 0)
      : -1;
    const brazier = new Brazier(
      this.ctx,
      pos,
      this.flames,
      flameId,
      this.lights,
      light,
      this.stone.chan,
      ch,
      this.particles,
      'red',
    );
    if (onLit) brazier.onLit = onLit;
    this.braziers.push(brazier);
    return brazier;
  }
  web(x, z, alongX, width, height, seed, onBurnt) {
    const web = new InkWeb(this.ctx, this.kit.w(x, 0, z), alongX, width, height, this.root, this.particles, seed);
    if (onBurnt) web.onBurnt = onBurnt;
    this.webs.push(web);
    return web;
  }
  font(x, z, color, y = 0) {
    const palette = this.palette;
    const kit = this.kit;
    kit.box(x, y + 0.35, z, 1.6, 0.7, 1.6, palette.trim, {
      kind: 1,
      bevel: 0.08,
      col: true,
    });
    const bowl = new CylinderGeometry(0.72, 0.55, 0.3, 20, 1, true);
    kit.geo(bowl, x, y + 0.85, z, palette.metal, {
      kind: 2,
    });
    const inkPool = new CylinderGeometry(0.66, 0.66, 0.06, 20);
    kit.geo(inkPool, x, y + 0.92, z, PALETTE[color].hex, {
      kind: 6,
      glow: [0, 1.6],
    });
    const glyph = color === 'red' ? 0 : color === 'blue' ? 1 : 4;
    kit.glyph(x, y + 0.36, z + 0.81, new Vector3(0, 0, 1), 0.5, glyph, PALETTE[color].hex, 0, 1.2);
    kit.glyph(x, y + 0.36, z - 0.81, new Vector3(0, 0, -1), 0.5, glyph, PALETTE[color].hex, 0, 1.2);
    kit.colBox(x, y + 0.95, z, 0.72, 0.1, 0.72);
    const font = new InkFont(this.ctx, kit.w(x, y + 1, z), color, this.particles);
    this.fonts.push(font);
    this.lights.add(kit.w(x, y + 1.6, z), PALETTE[color].hex, 3.5, 5, 1, 0.05);
    return font;
  }
  sconce(x, z, y, nx, nz, color, lit = true) {
    const palette = this.palette;
    const kit = this.kit;
    kit.box(x - nx * 0.1, y - 0.15, z - nz * 0.1, nx ? 0.5 : 0.3, 0.16, nz ? 0.5 : 0.3, palette.metal, {
      kind: KIND.metal,
    });
    const cup = lathe(
      [
        [0.02, 0],
        [0.18, 0.02],
        [0.27, 0.18],
        [0.24, 0.2],
        [0.02, 0.12],
      ],
      10,
    );
    kit.geo(cup, x + nx * 0.12, y - 0.08, z + nz * 0.12, palette.metal, {
      kind: KIND.metal,
    });
    const pos = kit.w(x + nx * 0.12, y + 0.06, z + nz * 0.12);
    const flameId = this.flames.add(pos, 0.42, 0.75, color);
    this.flames.level[flameId] = lit ? 0.9 : 0;
    this.lights.add(pos.clone().add(_tmp.set(nx * 0.6, 0.3, nz * 0.6)), color, 3.2, 7, +!!lit, 0.15);
    return flameId;
  }
  shaft(x, z, height, radiusTop, radiusBottom, color, strength = 1) {
    const shaftK = {
      value: strength,
    };
    const geometry = new CylinderGeometry(radiusTop, radiusBottom, height, 24, 1, true);
    geometry.translate(0, height / 2, 0);
    const mesh = new Mesh(geometry, makeBeamMaterial(this.ctx, color, shaftK));
    mesh.position.copy(this.kit.w(x, 0, z));
    mesh.renderOrder = 6;
    mesh.name = `temple-shaft-${this.spec.id}`;
    this.root.add(mesh);
    return shaftK;
  }
  hint(x, z, facing, text, glyph, y = 0) {
    const palette = this.palette;
    this.kit.hintStone(x, z, y, facing, palette.trim, palette.glass, glyph);
    this.hints.add(this.kit.w(x + Math.sin(facing) * 1.2, y, z + Math.cos(facing) * 1.2), text, 3.2);
  }
  makeChests(defs) {
    this.chests = new TempleChests(this.ctx, defs, this.spec.chest, this.particles, this.keyGeo, this.stone.material);
    this.root.add(this.chests.group);
    this.chests.onKey = () => this.gainKey();
    this.chests.onOpened = (def) => {
      if ('item' in def.loot && def.loot.item === this.spec.crest) this.claimed();
    };
  }
  portal(x, z, facing, width, height, material, enabled = true) {
    const portal = new Portal(
      this.ctx,
      this.kit.w(x, 0, z),
      facing,
      width,
      height,
      material,
      this.root,
      () => void this.leave(),
    );
    portal.enabled = enabled;
    this.portals.push(portal);
    return portal;
  }
  get palette() {
    return this.spec.palette;
  }
  gainKey() {
    this.keys++;
    try {
      this.ctx.ui.toast('Small Key', 'It opens a locked door in this temple.', this.spec.element);
    } catch {}
    sfx(this.ctx, 'pickup', undefined, 1, 1.2);
  }
  solved(id, at) {
    const position = Array.isArray(at) ? this.kit.w(at[0], at[1], at[2]) : at.clone();
    try {
      this.ctx.events.emit('puzzle:solved', {
        id: `${this.spec.id}-${id}`,
        area: this.spec.id,
        position,
      });
    } catch {}
  }
  setCheckpoint(x, z, facing, y = 0.05) {
    this.checkpoint.pos.copy(this.kit.w(x, y, z));
    this.checkpoint.facing = facing;
    this.def.respawnFacing = facing;
  }
  setCheckpointNear(door, dist, playerSide) {
    const opts = door.opts;
    const state = this.ctx.player?.state;
    const pos = opts.pos;
    let nx = +!opts.alongX;
    let nz = +!!opts.alongX;
    if (state) {
      const side =
        ((state.position.x - pos.x) * nx + (state.position.z - pos.z) * nz > 0 ? 1 : -1) * (playerSide ? 1 : -1);
      nx *= side;
      nz *= side;
    }
    this.checkpoint.pos.set(pos.x + nx * dist, pos.y + 0.05, pos.z + nz * dist);
    this.checkpoint.facing = Math.atan2(-nx, -nz);
    this.def.respawnFacing = this.checkpoint.facing;
  }
  claimed() {
    if (!this.completed) {
      this.completed = true;
      this.litT = 0;
      for (const portal of this.portals) portal.enabled = true;
      try {
        this.ctx.ui.toast(this.spec.litToast[0], this.spec.litToast[1], this.spec.element);
      } catch {}
      sfx(this.ctx, 'shrine-complete', undefined, 0.8);
      try {
        this.ctx.paint.bloomVitality(this.ctx.player.state.position.clone(), 30, 3);
      } catch {}
      this.onCompleted?.();
    }
  }
  lightUp(instant) {
    if (instant) {
      this.completed = true;
      this.lit = 1;
      this.litT = 99;
      for (const brazier of this.braziers) brazier.ignite(true);
      for (const portal of this.portals) portal.enabled = true;
      this.applyLit();
    }
  }
  applyLit() {
    const lit = this.lit;
    this.stone.theme.z = lit;
    this.stone.chan[1] = 0.25 + lit * 1.3;
    this.lights.boost = 1 + lit * 0.35;
    const lighting = this.spec.lighting;
    const litLighting = this.spec.litLighting;
    const out = this.def.lighting;
    out.ambient = (lighting.ambient ?? 0.3) + ((litLighting.ambient ?? 0.3) - (lighting.ambient ?? 0.3)) * lit;
    out.fogDensity =
      (lighting.fogDensity ?? 0.02) + ((litLighting.fogDensity ?? 0.02) - (lighting.fogDensity ?? 0.02)) * lit;
    out.ambientColor = lit > 0.5 ? litLighting.ambientColor : lighting.ambientColor;
    out.fogColor = lit > 0.5 ? litLighting.fogColor : lighting.fogColor;
  }
  inside(pos) {
    return this.def.bounds.containsPoint(pos);
  }
  hit(color, pos, radius, kind) {
    if (this.active && pos && Number.isFinite(pos.x + pos.y + pos.z)) {
      if (color === 'red') {
        for (const brazier of this.braziers) if (!brazier.lit && brazier.hits(pos, radius)) brazier.ignite();
        for (const web of this.webs) if (web.state === 'intact' && web.hits(pos, radius)) web.ignite(pos.clone());
      }
      this.onHitExtra(color, pos, radius, kind);
    }
  }
  update(dt) {
    const ctx = this.ctx;
    this.active = ctx.interiors.current?.id === this.spec.id;
    if (!this.active) {
      if (this.lockPrompt) this.setLockPrompt(null);
      return;
    }
    const elapsed = ctx.time.elapsed;
    const realDt = ctx.time.realDt;
    this.particles.update(dt);
    this.motes?.update(ctx);
    this.lights.update(dt, elapsed, ctx.player?.state?.position);
    for (const door of this.doors) door.update(dt);
    for (const brazier of this.braziers) brazier.update(dt);
    for (const web of this.webs) web.update(dt);
    for (const pickup of this.pickups) pickup.update(dt);
    for (const font of this.fonts) font.update(dt);
    for (const portal of this.portals) portal.update();
    this.chests?.update(dt, realDt);
    this.hints.update();
    for (const room of this.rooms) room.update(dt);
    this.boss?.update(dt);
    this.updateLocks();
    if (this.litT >= 0 && this.lit < 1) {
      this.litT += dt;
      this.lit = Math.min(1, this.litT / 3.5);
      const len = this.braziers.length;
      for (let i = 0; i < len; i++)
        if (!this.braziers[i].lit && this.litT > 0.4 + (i / Math.max(1, len)) * 2.6) this.braziers[i].ignite();
      this.applyLit();
      try {
        ctx.environment.setInterior(this.def.lighting);
      } catch {}
    }
    try {
      this.logic(dt);
    } catch (err) {
      console.warn(`[temples] ${this.spec.id} logic failed`, err);
    }
    this.trackSafe(dt);
  }
  trackSafe(dt) {
    const state = this.ctx.player?.state;
    if (!state || state.dead || this.respawning) return;
    const floorY = this.origin.y;
    if (
      state.position.y < floorY - 6 &&
      state.position.y > floorY - 40 &&
      this.inside(_tmp.set(state.position.x, floorY, state.position.z))
    ) {
      this.respawnSafe(0.5);
      return;
    }
    this.safeT -= dt;
    if (!(this.safeT > 0)) {
      this.safeT = 0.35;
      if (
        !(state.mode !== 'ground' || !state.grounded || state.groundNormal.y < 0.8) &&
        state.surface !== 'ice' &&
        state.paintUnderfoot !== 'blue' &&
        state.paintUnderfoot !== 'yellow'
      )
        if (!this.isHazard(state.position)) {
          this.safe.copy(state.position);
          this.safeFacing = state.facing;
        }
    }
  }
  isHazard(pos) {
    return false;
  }
  async respawnSafe(damage, at, facing) {
    if (this.respawning) return;
    this.respawning = true;
    const ctx = this.ctx;
    try {
      ctx.player.setControlEnabled(false);
      await Promise.race([ctx.ui.fade(true, 0.35), sleep(700)]);
      const pos = (at ?? this.safe).clone();
      ctx.player.teleport(pos, facing ?? this.safeFacing);
      if (damage > 0)
        try {
          ctx.player.damage({
            amount: damage,
            direction: new Vector3(0, 0, 1),
            knockback: 0,
            source: 'environment',
          });
        } catch {}
      await sleep(120);
      await Promise.race([ctx.ui.fade(false, 0.45), sleep(900)]);
    } catch (err) {
      console.warn('[temples] respawn failed', err);
    } finally {
      try {
        ctx.player.setControlEnabled(true);
      } catch {}
      this.respawning = false;
    }
  }
  updateLocks() {
    const state = this.ctx.player?.state;
    if (!state || state.dead || state.itemHold || this.chests?.prompting || this.chests?.busy)
      return this.setLockPrompt(null);
    let near = null;
    for (const lock of this.locks) {
      if (lock.unlocked) continue;
      const dx = state.position.x - lock.front.x;
      const dz = state.position.z - lock.front.z;
      if (dx * dx + dz * dz < 5.76 && Math.abs(state.position.y - lock.front.y) < 2) near = lock;
    }
    if (!near) return this.setLockPrompt(null);
    if (this.keys > 0) {
      this.setLockPrompt('unlock');
      if (this.ctx.input.pressed('interact')) {
        this.keys--;
        near.unlocked = true;
        this.setLockPrompt(null);
        sfx(this.ctx, 'pickup', near.front, 1, 0.55);
        const position = near.door.mesh.position;
        const color = new Color(PALETTE[this.spec.element].hex);
        for (let i = 0; i < 40; i++) {
          const angle = Math.random() * Math.PI * 2;
          this.particles.spawn({
            x: position.x,
            y: position.y - 0.6,
            z: position.z,
            vx: Math.cos(angle) * 3,
            vy: 1 + Math.random() * 3,
            vz: Math.sin(angle) * 3,
            color: i % 2 ? color : new Color(1, 0.85, 0.5),
            size: 0.12,
            life: 0.9,
            drag: 2,
            bright: 2.5,
          });
        }
        near.door.open();
        this.setCheckpointNear(near.door, 3, true);
      }
    } else this.setLockPrompt('locked');
  }
  setLockPrompt(lockPrompt) {
    if (lockPrompt !== this.lockPrompt) {
      this.lockPrompt = lockPrompt;
      try {
        if (lockPrompt === 'unlock') this.ctx.ui.showPrompt('temple-door', 'Unlock with the Small Key', 'F');
        else if (lockPrompt === 'locked')
          this.ctx.ui.showPrompt('temple-door', 'Locked. A Small Key is hidden somewhere in this temple.');
        else this.ctx.ui.hidePrompt('temple-door');
      } catch {}
    }
  }
  onEnter() {
    for (const portal of this.portals) portal.disarm();
    if (!this.entered) {
      this.entered = true;
      setTimeout(() => {
        try {
          this.ctx.events.emit('area:enter', {
            id: this.spec.id,
            name: this.spec.name,
            subtitle: this.spec.subtitle,
          });
        } catch {}
      }, 700);
      try {
        if (this.ctx.player.state.selectedColor !== this.spec.element)
          this.ctx.events.emit('ui:select-color', {
            color: this.spec.element,
          });
      } catch {}
    }
  }
  async leave() {
    if (this.exitTo)
      try {
        await this.ctx.interiors.travel(this.exitTo.pos.clone(), this.exitTo.facing);
      } catch (err) {
        console.warn('[temples] leave failed', err);
      }
  }
  onPlayerDeath() {
    if (this.active) {
      this.deadHere = true;
      for (const room of this.rooms) room.onDeath();
      this.boss?.onDeath();
    }
  }
  onPlayerRespawn(pos) {
    if (this.deadHere) {
      this.deadHere = false;
      for (const room of this.rooms) room.onRespawn();
      this.boss?.onRespawn();
      if (!pos || !this.inside(pos))
        try {
          this.ctx.player.teleport(this.checkpoint.pos.clone(), this.checkpoint.facing);
        } catch {}
    }
  }
  onEnemyDeath(id) {
    for (const room of this.rooms) room.onEnemyDeath(id);
    this.boss?.onEnemyDeath(id);
  }
}
