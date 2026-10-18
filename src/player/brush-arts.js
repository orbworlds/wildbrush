/**
 * Brush arts: hold paint to charge the selected colour's art and release it as a fireball, ice lance, bounce orb or vine lash. Steps the projectiles and vines (enemy grabs, wall ladders, thorn patches), soft-aims at enemies, previews the path, deals damage and paint, and applies the Ember and Frost Crest upgrades.
 */
import { MathUtils, Vector3 } from 'three';
import { ART_CHARGE_TIME, ARTS, COLLISION_LAYERS, interactionGroups } from '../core/config.js';
import {
  ART_BY_COLOR,
  ART_CHARGE,
  ART_COOLDOWN,
  ART_TIMING,
  BOUNCE_ORB,
  EMBER_CREST,
  FIREBALL,
  FIZZLE_COOLDOWN,
  FROST_CREST,
  ICE_LANCE,
  VINE_LASH,
} from '../shared/artdefs.js';
import { heroSignals } from '../shared/signals.js';
import { ArtFx } from './art-fx.js';
import { CrestFx } from './crest-fx.js';
import { makeHit, Probes } from './probes.js';
const RING_PTS = EMBER_CREST.ringPts;
const MAX_ART_PROJECTILES = 12;
const MAX_VINES = 3;
const MAX_THORN_ZONES = 8;
const MAX_FLAME_RINGS = 4;
const _artsDown = new Vector3(0, -1, 0);
const _artsUp = new Vector3(0, 1, 0);
const _artsV1 = new Vector3();
const _artsV2 = new Vector3();
const _artsV3 = new Vector3();
const _artsV4 = new Vector3();
const _artsV5 = new Vector3();
export class BrushArts {
  ctx;
  ctrl;
  rig;
  fx;
  crestFx;
  emberCrest = false;
  frostCrest = false;
  rings = [];
  projectiles = [];
  vines = [];
  zones = [];
  ladders = [];
  pendingHits = [];
  probes;
  ph = makeHit();
  ph2 = makeHit();
  holding = false;
  holdT = 0;
  cd = 0;
  pending = null;
  castArt = null;
  castT = 99;
  castDir = new Vector3(0, 0, 1);
  chargeSeen = 0;
  hit = {
    damage: 1,
    color: null,
    direction: new Vector3(0, 0, 1),
    knockback: 0,
    source: 'art',
  };
  excl = new Set();
  origin = new Vector3();
  target = new Vector3();
  impact = new Vector3();
  seekDir = new Vector3();
  seekFrom = new Vector3();
  impactN = new Vector3();
  blast = new Vector3();
  dir = new Vector3();
  camDir = new Vector3();
  prevPts = new Float32Array(192);
  prevN = 0;
  prevEnd = new Vector3();
  prevEndN = new Vector3();
  prevHasEnd = false;
  simP = new Vector3();
  simV = new Vector3();
  assistT = 0;
  assistId = -1;
  ball;
  propHits = [];
  onProp;
  errOnce = false;
  constructor(ctx, ctrl, rig) {
    this.ctx = ctx;
    this.ctrl = ctrl;
    this.rig = rig;
    this.fx = new ArtFx(ctx);
    this.crestFx = new CrestFx(ctx, this.fx.particles);
    for (let i = 0; i < MAX_FLAME_RINGS; i++)
      this.rings.push({
        active: false,
        center: new Vector3(),
        radius: 1,
        age: 0,
        life: 1,
        tick: 0,
        pts: new Float32Array(RING_PTS * 3),
        n: 0,
        acc: 0,
        acc2: 0,
        acc3: 0,
      });
    this.probes = new Probes(ctx);
    this.probes.exclude = ctrl.collider;
    this.ball = new ctx.RAPIER.Ball(1);
    this.onProp = (collider) => {
      if (this.propHits.length < 16) this.propHits.push(collider);
      return true;
    };
    for (let i = 0; i < MAX_ART_PROJECTILES; i++)
      this.projectiles.push({
        active: false,
        art: 'fireball',
        color: 'red',
        pos: new Vector3(),
        prev: new Vector3(),
        vel: new Vector3(),
        age: 0,
        gravity: 0,
        hit: new Set(),
        hits: new Map(),
        lastFoe: -1,
        pierced: 0,
        bounces: 0,
        lastBounce: -1,
        travelled: 0,
        floeAcc: 0,
        pathAcc: 0,
        first: true,
        size: 1,
      });
    for (let i = 0; i < MAX_VINES; i++)
      this.vines.push({
        active: false,
        age: 0,
        phase: 0,
        phaseT: 0,
        origin: new Vector3(),
        dir: new Vector3(),
        len: 0,
        tip: new Vector3(),
        from: new Vector3(),
        kind: 'none',
        enemyId: -1,
        anchor: new Vector3(),
        normal: new Vector3(0, 1, 0),
        hitSet: new Set(),
      });
    for (let i = 0; i < MAX_THORN_ZONES; i++)
      this.zones.push({
        active: false,
        center: new Vector3(),
        normal: new Vector3(0, 1, 0),
        age: 0,
        life: 1,
        tick: 0,
        hit: new Set(),
      });
    ctx.events.on('player:death', () => this.cancel());
  }
  get casting() {
    return this.castT < 0.3;
  }
  cancel() {
    this.holding = false;
    this.holdT = 0;
    this.ctrl.state.artCharge = 0;
  }
  input(dt, intent, aiming, wheelOpen) {
    const state = this.ctrl.state;
    if (!aiming || wheelOpen || state.dead) {
      if (this.holding) this.cancel();
      state.artCharge = 0;
      return null;
    }
    if (intent.paintPressed) {
      this.holding = true;
      this.holdT = 0;
    }
    if (!this.holding) {
      state.artCharge = 0;
      return null;
    }
    if (intent.paintHeld) {
      if (this.cd <= 0 && !this.pending) this.holdT += dt;
      state.artCharge = MathUtils.clamp((this.holdT - ART_CHARGE.tap) / ART_CHARGE.time, 0, 1);
      return null;
    }
    const artCharge = state.artCharge;
    this.holding = false;
    this.holdT = 0;
    state.artCharge = 0;
    if (artCharge >= 0.4 - 0.000001) {
      this.cast();
      return null;
    } else {
      return 'flick';
    }
  }
  preUpdate(dt) {
    if (dt <= 0) return;
    this.castT += dt;
    const state = this.ctrl.state;
    const cmb = this.ctrl.cmb;
    const currentMode = this.ctrl.currentMode;
    if (state.artCharge > 0 && (currentMode === 'ground' || currentMode === 'slide')) {
      cmb.speedCap = cmb.speedCap > 0 ? Math.min(cmb.speedCap, 2.6) : 2.6;
      cmb.noSprint = true;
    }
    if (currentMode !== 'ground' || !this.castArt) return;
    const castT = this.castT;
    let drive = 0;
    if (this.castArt === 'iceLance' && castT < 0.16) drive = 5.2 * Math.sin((Math.PI * castT) / 0.16);
    else if (this.castArt === 'fireball' && castT > 0.1 && castT < 0.28)
      drive = -2.6 * Math.sin((Math.PI * (castT - 0.1)) / 0.18);
    else if (this.castArt === 'vineLash' && castT > 0.06 && castT < 0.2)
      drive = -1.6 * Math.sin((Math.PI * (castT - 0.06)) / 0.14);
    if (drive !== 0) {
      cmb.drive = true;
      cmb.driveX = this.castDir.x * drive;
      cmb.driveZ = this.castDir.z * drive;
    }
  }
  update(dt) {
    try {
      this.step(dt);
    } catch (err) {
      if (!this.errOnce) console.warn('[player] brush arts', err);
      this.errOnce = true;
    }
    try {
      this.fx.update(dt);
      this.crestFx.update(dt);
    } catch (err) {
      if (!this.errOnce) console.warn('[player] brush arts fx', err);
      this.errOnce = true;
    }
  }
  step(dt) {
    const state = this.ctrl.state;
    if (dt <= 0) {
      this.fx.charge(null, 'fireball', 0, false, true, 0);
      return;
    }
    this.cd = Math.max(0, this.cd - dt);
    if (this.pending) {
      this.pending.t += dt;
      if (state.dead) this.pending = null;
      else if (this.pending.t >= ART_TIMING[this.pending.art].release) {
        const pending = this.pending;
        this.pending = null;
        this.release(pending.art, pending.color);
      }
    }
    const charging = state.artCharge > 0 && state.aiming && !state.dead;
    if (this.pending) {
      this.castPoint(this.origin);
      this.aimPoint(this.origin, this.target, false);
      this.fx.carry(this.origin, this.pending.art, this.target);
    } else if (charging) {
      const selectedColor = state.selectedColor;
      const art = ART_BY_COLOR[selectedColor];
      this.castPoint(this.origin);
      const cost = this.cost(selectedColor);
      const hasInk = (this.ctx.paint.ink[selectedColor] ?? 0) + 0.000001 >= cost;
      const castable = state.artCharge >= ART_CHARGE_TIME - 0.000001;
      this.aimPoint(this.origin, this.target, false);
      this.fx.charge(this.origin, art, state.artCharge, castable, hasInk, dt, this.target);
      if (castable && this.chargeSeen < 0.4) this.rig.punch(0.06);
      this.chargeSeen = state.artCharge;
      this.preview(art, selectedColor, state.artCharge, castable);
    } else {
      this.chargeSeen = 0;
      this.fx.charge(null, 'fireball', 0, false, true, dt);
    }
    for (let i = 0; i < MAX_ART_PROJECTILES; i++) {
      const proj = this.projectiles[i];
      if (proj.active) {
        proj.age += dt;
        switch (proj.art) {
          case 'fireball':
            this.stepFireball(proj, dt);
            break;
          case 'iceLance':
            this.stepLance(proj, dt);
            break;
          case 'bounceOrb':
            this.stepOrb(proj, dt);
            break;
          default:
            proj.active = false;
        }
        if (proj.active) this.fx.projectile(i, proj);
        else this.fx.projectileEnd(i);
      }
    }
    for (let i = 0; i < MAX_VINES; i++) {
      const vine = this.vines[i];
      if (vine.active) {
        this.stepVine(vine, dt);
        if (vine.active) this.fx.vine(i, vine);
        else this.fx.vineEnd(i);
      }
    }
    for (let i = 0; i < MAX_THORN_ZONES; i++) {
      const zone = this.zones[i];
      if (zone.active) {
        this.stepZone(zone, dt);
        this.fx.thorns(i, zone);
      }
    }
    for (const ring of this.rings) if (ring.active) this.stepRing(ring, dt);
    for (const ladder of this.ladders) if (ladder.active) this.stepLadder(ladder, dt);
    for (let i = this.pendingHits.length - 1; i >= 0; i--) {
      const delayed = this.pendingHits[i];
      delayed.t -= dt;
      if (!(delayed.t > 0)) {
        this.pendingHits.splice(i, 1);
        try {
          const foe = this.ctx.enemies.get(delayed.id);
          if (foe && foe.alive) this.ctx.enemies.damage(delayed.id, delayed.hit);
        } catch {}
      }
    }
  }
  cost(color) {
    let ink = ARTS[color]?.ink ?? 12;
    if (color === 'red' && this.emberCrest) ink *= EMBER_CREST.inkMul;
    return this.ctrl.state.brush === 'chroma' ? ink * 0.5 : ink;
  }
  cast() {
    const ctx = this.ctx;
    const state = this.ctrl.state;
    const selectedColor = state.selectedColor;
    const art = ARTS[selectedColor]?.art ?? ART_BY_COLOR[selectedColor];
    const cost = this.cost(selectedColor);
    this.castPoint(this.origin);
    if ((ctx.paint.ink[selectedColor] ?? 0) + 0.000001 < cost) {
      this.fx.fizzle(this.origin, selectedColor);
      ctx.events.emit('paint:ink-empty', {
        color: selectedColor,
      });
      this.cd = FIZZLE_COOLDOWN;
      this.ctrl.log(`art fizzle ${art} (ink ${(ctx.paint.ink[selectedColor] ?? 0).toFixed(1)} < ${cost})`);
      return;
    }
    try {
      ctx.paint.addInk(selectedColor, -cost);
    } catch {}
    this.cd = ART_COOLDOWN;
    state.lastArtTime = ctx.time.elapsed;
    this.aimPoint(this.origin, this.target, true);
    this.dir.subVectors(this.target, this.origin);
    if (this.dir.lengthSq() < 0.000001) this.dir.set(Math.sin(state.facing), 0, Math.cos(state.facing));
    this.dir.normalize();
    this.castArt = art;
    this.castT = 0;
    this.castDir.set(this.dir.x, 0, this.dir.z);
    if (this.castDir.lengthSq() < 0.000001) this.castDir.set(Math.sin(state.facing), 0, Math.cos(state.facing));
    this.castDir.normalize();
    this.pending = {
      art,
      color: selectedColor,
      t: 0,
    };
    ctx.events.emit('combat:art', {
      art,
      color: selectedColor,
      origin: this.origin.clone(),
      direction: this.dir.clone(),
    });
    this.ctrl.log(`art cast ${art}`);
  }
  release(art, color) {
    this.ctx;
    const state = this.ctrl.state;
    const from = this.castPoint(this.origin);
    const aim = this.aimPoint(from, this.target, false);
    const flying = this.ctrl.currentMode === 'fly';
    const velocity = state.velocity;
    const dir = this.dir.subVectors(aim, from);
    if (dir.lengthSq() < 0.000001) dir.set(Math.sin(state.facing), 0, Math.cos(state.facing));
    dir.normalize();
    const boost = flying ? Math.max(0, dir.dot(velocity)) : 0;
    this.fx.release(art, from, dir);
    this.rig.punch(art === 'fireball' ? 0.22 : art === 'iceLance' ? 0.16 : 0.12);
    this.rig.kick(_artsV1.copy(this.castDir).negate(), art === 'fireball' ? 0.1 : 0.06);
    this.rig.addTrauma(art === 'fireball' ? 0.12 : 0.06);
    if (flying && art === 'fireball') this.ctrl.flyKnock(-dir.x * 2.5, 0.4, -dir.z * 2.5);
    if (art === 'vineLash') {
      this.startVine(from, dir);
      return;
    }
    const proj = this.projectiles.find((projectile) => !projectile.active) ?? this.projectiles[0];
    proj.active = true;
    proj.art = art;
    proj.color = color;
    proj.pos.copy(from);
    proj.prev.copy(from);
    proj.age = 0;
    proj.hit.clear();
    proj.hits.clear();
    proj.lastFoe = -1;
    proj.pierced = 0;
    proj.bounces = 0;
    proj.lastBounce = -1;
    proj.travelled = 0;
    proj.floeAcc = ICE_LANCE.floeStep;
    proj.pathAcc = 0;
    proj.first = true;
    proj.size = 1;
    if (art === 'fireball') {
      proj.gravity = FIREBALL.gravity;
      launchVelocity(from, aim, FIREBALL.speed + boost, FIREBALL.gravity, proj.vel);
    } else if (art === 'iceLance') {
      proj.gravity = 0;
      proj.vel.copy(dir).multiplyScalar(ICE_LANCE.speed + boost);
    } else {
      proj.gravity = BOUNCE_ORB.gravity;
      launchVelocity(from, aim, BOUNCE_ORB.speed + boost, BOUNCE_ORB.gravity, proj.vel);
    }
  }
  castPoint(out) {
    const state = this.ctrl.state;
    let ok = false;
    try {
      const character = this.ctx.character;
      if (character.castPoint) character.castPoint(out);
      else character.brushTipWorld(out);
      ok = Number.isFinite(out.x + out.y + out.z) && out.distanceToSquared(state.position) < 16;
    } catch {
      ok = false;
    }
    if (!ok) {
      out.copy(state.position);
      out.x += Math.sin(state.facing) * 0.5;
      out.z += Math.cos(state.facing) * 0.5;
      out.y += 1.5;
    }
    return out;
  }
  aimPoint(from, out, retarget) {
    const ctx = this.ctx;
    const state = this.ctrl.state;
    out.copy(state.aimTarget);
    if (!Number.isFinite(out.x + out.y + out.z) || out.distanceToSquared(from) < 0.25)
      out.copy(from).addScaledVector(_artsV1.set(Math.sin(state.facing), 0, Math.cos(state.facing)), 20);
    if (retarget || this.assistT <= 0) {
      this.assistT = 0.12;
      this.assistId = this.findAssist();
    }
    if (this.assistId >= 0) {
      let foe;
      try {
        foe = ctx.enemies.get(this.assistId);
      } catch {
        foe = undefined;
      }
      if (foe && foe.alive) enemyAimPoint(foe, out);
      else this.assistId = -1;
    }
    return out;
  }
  findAssist() {
    const ctx = this.ctx;
    const state = this.ctrl.state;
    const camPos = ctx.camera.position;
    ctx.camera.getWorldDirection(this.camDir);
    const aimDist = state.aimTarget.distanceTo(camPos);
    let foes = [];
    try {
      foes = ctx.enemies.query(state.position, 48);
    } catch {
      foes = [];
    }
    let bestId = -1;
    let bestScore = 1000000000;
    for (const foe of foes) {
      if (!foe || !foe.alive) continue;
      const aimAt = enemyAimPoint(foe, _artsV2);
      const dx = aimAt.x - camPos.x;
      const dy = aimAt.y - camPos.y;
      const dz = aimAt.z - camPos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1.5) continue;
      const cos = (dx * this.camDir.x + dy * this.camDir.y + dz * this.camDir.z) / dist;
      const angle = Math.acos(MathUtils.clamp(cos, -1, 1));
      const offAxis = dist * Math.sin(angle);
      const locked = foe.id === state.lockTargetId;
      if (
        angle > 0.42 ||
        (angle > (locked ? 0.36 : 0.13) && offAxis > 1 + foe.radius * 0.8) ||
        aimDist < dist - Math.max(2.2, foe.radius * 2.2)
      )
        continue;
      const score = angle + dist * 0.004 - +!!locked;
      if (score < bestScore) {
        bestScore = score;
        bestId = foe.id;
      }
    }
    return bestId;
  }
  preview(art, color, charge, castable) {
    this.assistT -= this.ctx.time.dt;
    const from = this.origin;
    const aim = this.aimPoint(from, this.target, false);
    const prevPts = this.prevPts;
    let count = 0;
    const addPoint = (p) => {
      if (!(count >= 64)) {
        prevPts[count * 3] = p.x;
        prevPts[count * 3 + 1] = p.y;
        prevPts[count * 3 + 2] = p.z;
        count++;
      }
    };
    this.prevHasEnd = false;
    const waterY = this.waterLevel();
    if (art === 'iceLance' || art === 'vineLash') {
      const dir = _artsV3.subVectors(aim, from);
      if (dir.lengthSq() < 0.000001) dir.set(0, 0, 1);
      dir.normalize();
      const range = art === 'iceLance' ? ICE_LANCE.range : VINE_LASH.range;
      let dist = range;
      if (this.probes.ray(from, dir, range, this.ph)) {
        dist = this.ph.distance;
        this.prevHasEnd = true;
        this.prevEnd.copy(this.ph.point);
        this.prevEndN.copy(this.ph.normal);
      }
      if (dir.y < -0.0001) {
        const toWater = (waterY - from.y) / dir.y;
        if (toWater > 0 && toWater < dist && this.overWater(from.x + dir.x * toWater, from.z + dir.z * toWater)) {
          dist = toWater;
          this.prevHasEnd = true;
          this.prevEnd.copy(from).addScaledVector(dir, toWater);
          this.prevEndN.set(0, 1, 0);
        }
      }
      for (let i = 0; i <= 14; i++) addPoint(_artsV4.copy(from).addScaledVector(dir, (dist * i) / 14));
    } else {
      const gravity = art === 'fireball' ? FIREBALL.gravity : BOUNCE_ORB.gravity;
      const speed = art === 'fireball' ? FIREBALL.speed : BOUNCE_ORB.speed;
      const pos = this.simP.copy(from);
      const vel = launchVelocity(from, aim, speed, gravity, this.simV);
      addPoint(pos);
      const step = 1 / 24;
      for (let i = 0; i < 60 && count < 64; i++) {
        _artsV4.copy(pos);
        vel.y -= gravity * step;
        pos.addScaledVector(vel, step);
        const seg = _artsV5.subVectors(pos, _artsV4);
        const segLen = seg.length();
        if (segLen > 0.00001 && this.probes.ray(_artsV4, seg.divideScalar(segLen), segLen, this.ph)) {
          addPoint(this.ph.point);
          this.prevHasEnd = true;
          this.prevEnd.copy(this.ph.point);
          this.prevEndN.copy(this.ph.normal);
          break;
        }
        if (_artsV4.y > waterY && pos.y <= waterY && this.overWater(pos.x, pos.z)) {
          addPoint(pos);
          this.prevHasEnd = true;
          this.prevEnd.copy(pos).setY(waterY);
          this.prevEndN.set(0, 1, 0);
          break;
        }
        addPoint(pos);
        if (pos.y < waterY - 20) break;
      }
    }
    const alpha = castable ? 0.9 : 0.25 + (charge / ART_CHARGE_TIME) * 0.5;
    this.fx.preview(
      prevPts,
      count,
      color,
      art,
      alpha,
      this.prevHasEnd ? this.prevEnd : null,
      this.prevHasEnd ? this.prevEndN : null,
    );
  }
  stepFireball(proj, dt) {
    proj.prev.copy(proj.pos);
    proj.vel.y -= proj.gravity * dt;
    proj.pos.addScaledVector(proj.vel, dt);
    const worldHit = this.traceWorld(proj.prev, proj.pos);
    const end = worldHit ? this.ph.point : proj.pos;
    const hit = this.hit;
    hit.damage = FIREBALL.direct * (this.emberCrest ? EMBER_CREST.damageMul : 1);
    hit.color = 'red';
    hit.knockback = FIREBALL.knockback;
    hit.source = 'art';
    hit.point = undefined;
    flatDir(proj.vel, hit.direction);
    const foeHit = this.sweep(proj.prev, end, FIREBALL.hitR, hit, proj.hit, proj.first);
    proj.first = false;
    if (foeHit) {
      this.explode(proj, this.impact.copy(foeHit), this.impactN.copy(proj.vel).negate().normalize(), false, true);
      return;
    }
    if (worldHit === 'water') {
      this.explode(proj, this.impact.copy(this.ph.point), _artsUp, true, false);
      return;
    }
    if (worldHit) {
      this.explode(proj, this.impact.copy(this.ph.point), this.impactN.copy(this.ph.normal), false, false);
      return;
    }
    if (proj.age > FIREBALL.life || proj.pos.y < this.waterLevel() - 30)
      this.explode(proj, this.impact.copy(proj.pos), _artsUp, false, false);
  }
  explode(proj, point, normal, water, directHit) {
    const ctx = this.ctx;
    const center = this.blast.copy(point);
    proj.active = false;
    const hit = this.hit;
    hit.color = 'red';
    hit.source = 'art';
    hit.knockback = FIREBALL.knockback;
    hit.point = undefined;
    const state = this.ctrl.state;
    hit.direction.set(center.x - state.position.x, 0, center.z - state.position.z);
    if (hit.direction.lengthSq() < 0.000001) flatDir(proj.vel, hit.direction);
    else hit.direction.normalize();
    let enemyHit = directHit;
    const emberCrest = this.emberCrest;
    const radiusMul = emberCrest ? EMBER_CREST.radiusMul : 1;
    const damageMul = emberCrest ? EMBER_CREST.damageMul : 1;
    for (const [radius, damage] of FIREBALL.aoe) {
      hit.damage = damage * damageMul;
      try {
        if (ctx.enemies.hitSphere(center, radius * radiusMul, hit, proj.hit).length) enemyHit = true;
      } catch {}
    }
    let ground = null;
    if (!water)
      if (this.probes.ray(_artsV1.copy(center).addScaledVector(normal, 0.3), _artsV2.set(0, -1, 0), 3.2, this.ph2))
        ground = this.ph2.point;
      else if (normal.y > 0.5) ground = center;
    const paintMul = emberCrest ? 1.3 : 1;
    if (ground) {
      try {
        ctx.elements.ignite(ground, FIREBALL.ignite * radiusMul);
      } catch {}
      try {
        ctx.paint.paintSphere(ground, FIREBALL.paint * paintMul, 'red', 1);
      } catch {}
      this.splat(ground, this.ph2.normal.y > 0.2 ? this.ph2.normal : _artsUp, 'red', FIREBALL.paint * paintMul);
      if (emberCrest) this.startRing(ground);
    } else if (!water && normal.y <= 0.5) {
      try {
        ctx.elements.ignite(center, FIREBALL.ignite * 0.8);
        ctx.paint.paintSphere(center, FIREBALL.paint * 0.8, 'red', 1);
      } catch {}
      this.splat(center, normal, 'red', FIREBALL.paint * 0.8);
    }
    if (water)
      try {
        ctx.events.emit('element:steam', {
          position: center.clone(),
        });
      } catch {}
    this.pushProps(center, FIREBALL.aoe[FIREBALL.aoe.length - 1][0] * radiusMul, 7);
    this.fx.explode(center, normal, water, enemyHit, radiusMul);
    ctx.events.emit('camera:shake', {
      strength: 0.3,
      position: center.clone(),
    });
    if (enemyHit) ctx.time.hitStop(0.05);
    ctx.events.emit('combat:art-impact', {
      art: 'fireball',
      color: 'red',
      position: center.clone(),
      enemyHit,
    });
  }
  stepLance(proj, dt) {
    const ctx = this.ctx;
    proj.prev.copy(proj.pos);
    proj.pos.addScaledVector(proj.vel, dt);
    const moved = proj.prev.distanceTo(proj.pos);
    proj.travelled += moved;
    const worldHit = this.traceWorld(proj.prev, proj.pos);
    const end = _artsV3.copy(worldHit ? this.ph.point : proj.pos);
    const hit = this.hit;
    hit.damage = ICE_LANCE.damage;
    hit.color = 'blue';
    hit.knockback = ICE_LANCE.knockback;
    hit.source = 'art';
    hit.point = undefined;
    flatDir(proj.vel, hit.direction);
    const frostCrest = this.frostCrest;
    const maxPierce = frostCrest ? Infinity : ICE_LANCE.pierce;
    if (frostCrest) hit.statusScale = FROST_CREST.statusScale;
    const span = proj.prev.distanceTo(end);
    const hitR = ICE_LANCE.hitR;
    const steps = Math.max(1, Math.ceil(span / (hitR * 0.75)));
    let shattered = false;
    for (let i = +!proj.first; i <= steps && !shattered; i++) {
      const at = _artsV4.copy(proj.prev).lerp(end, i / steps);
      let hits = [];
      try {
        hits = ctx.enemies.hitSphere(at, hitR, hit, proj.hit);
      } catch {
        hits = [];
      }
      for (const id of hits) {
        proj.pierced++;
        if (id >= 1000000) proj.pierced = maxPierce;
        this.fx.lancePierce(at, proj.vel);
        ctx.time.hitStop(0.03);
        this.rig.addTrauma(0.08);
        ctx.events.emit('combat:art-impact', {
          art: 'iceLance',
          color: 'blue',
          position: at.clone(),
          enemyHit: true,
        });
      }
      if (proj.pierced >= maxPierce) {
        shattered = true;
        proj.active = false;
        this.fx.lanceShatter(at, _artsV5.copy(proj.vel).negate().normalize(), proj.vel, false, true);
      }
    }
    delete hit.statusScale;
    proj.first = false;
    if (proj.active) {
      if (frostCrest) this.frostPath(proj, moved);
      else this.skim(proj, moved);
      if (worldHit) {
        proj.active = false;
        const water = worldHit === 'water';
        const point = this.ph.point;
        if (water)
          try {
            ctx.elements.freezeWater(_artsV1.copy(point).setY(this.waterLevel()), 2.8);
          } catch {}
        else
          try {
            ctx.paint.paintSphere(point, 0.85, 'blue', 0.9);
          } catch {}
        this.splat(point, this.ph.normal, 'blue', 1, water ? 'water' : 'world');
        this.fx.lanceShatter(point, this.ph.normal, proj.vel, water, false);
        this.rig.addTrauma(0.05);
        ctx.events.emit('combat:art-impact', {
          art: 'iceLance',
          color: 'blue',
          position: point.clone(),
          enemyHit: false,
        });
        return;
      }
      if (proj.travelled > ICE_LANCE.range) {
        proj.active = false;
        this.fx.lanceShatter(proj.pos, _artsV5.copy(proj.vel).negate().normalize(), proj.vel, false, true);
      }
    }
  }
  frostPath(proj, moved) {
    proj.pathAcc += moved;
    if (proj.pathAcc < FROST_CREST.pathStep) return;
    proj.pathAcc = 0;
    const ctx = this.ctx;
    const dir = flatDir(proj.vel, _artsV5);
    const waterY = this.waterLevel();
    const height = proj.pos.y - waterY;
    if (
      height > -0.3 &&
      height < FROST_CREST.reach &&
      this.overWater(proj.pos.x, proj.pos.z, 0.35) &&
      !this.probes.ray(proj.pos, _artsDown, Math.max(0.05, height), this.ph2)
    ) {
      const at = _artsV1.set(proj.pos.x, waterY, proj.pos.z);
      try {
        ctx.elements.freezeWater(at, FROST_CREST.floeR);
      } catch {}
      this.fx.lanceSkim(at);
      this.crestFx.frostPatch(at, _artsUp, dir, true);
      heroSignals(ctx).emit('frost-patch', {
        position: at.clone(),
        water: true,
      });
      return;
    }
    if (!this.probes.ray(proj.pos, _artsDown, FROST_CREST.reach, this.ph2) || this.ph2.normal.y < 0.45) return;
    const point = this.ph2.point;
    try {
      ctx.paint.paintSphere(point, FROST_CREST.patchR, 'blue', 0.85);
    } catch {}
    this.crestFx.frostPatch(point, this.ph2.normal, dir, false);
    heroSignals(ctx).emit('frost-patch', {
      position: point.clone(),
      water: false,
    });
  }
  startRing(pos) {
    const ring =
      this.rings.find((ring) => !ring.active) ??
      this.rings.reduce((oldest, ring) => (oldest.age > ring.age ? oldest : ring));
    ring.active = true;
    ring.center.copy(pos);
    ring.radius = EMBER_CREST.ringR;
    ring.age = 0;
    ring.life = EMBER_CREST.ringLife;
    ring.tick = 0.12;
    ring.acc = ring.acc2 = ring.acc3 = 0;
    const center = ring.center;
    const count = RING_PTS;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
      const x = center.x + Math.cos(angle) * ring.radius;
      const z = center.z + Math.sin(angle) * ring.radius;
      let y = center.y;
      if (this.probes.ray(_artsV1.set(x, center.y + 2.4, z), _artsDown, 5.5, this.ph2) && this.ph2.normal.y > 0.3)
        y = this.ph2.point.y;
      ring.pts[i * 3] = x;
      ring.pts[i * 3 + 1] = y;
      ring.pts[i * 3 + 2] = z;
    }
    ring.n = count;
    this.crestFx.ringStart(ring);
    heroSignals(this.ctx).emit('flame-ring', {
      position: center.clone(),
      radius: ring.radius,
      life: ring.life,
    });
  }
  stepRing(ring, dt) {
    ring.age += dt;
    if (ring.age >= ring.life) {
      ring.active = false;
      this.crestFx.ringEnd(ring);
      return;
    }
    this.crestFx.ring(ring, dt);
    ring.tick -= dt;
    if (ring.tick > 0) return;
    ring.tick = EMBER_CREST.ringTick;
    const hit = this.hit;
    hit.damage = EMBER_CREST.ringDamage;
    hit.color = 'red';
    hit.knockback = 0;
    hit.source = 'art';
    hit.point = undefined;
    hit.direction.set(0, 0, 0);
    const excl = this.excl;
    excl.clear();
    try {
      this.ctx.enemies.hitSphere(_artsV1.copy(ring.center).setY(ring.center.y + 0.7), ring.radius + 0.2, hit, excl);
    } catch {}
  }
  skim(proj, moved) {
    const waterY = this.waterLevel();
    const height = proj.pos.y - waterY;
    if (height > ICE_LANCE.skim || height < -0.3 || !this.overWater(proj.pos.x, proj.pos.z, 0.35)) {
      proj.floeAcc = ICE_LANCE.floeStep;
      return;
    }
    proj.floeAcc += moved;
    if (proj.floeAcc < ICE_LANCE.floeStep) return;
    proj.floeAcc = 0;
    const at = _artsV1.set(proj.pos.x, waterY, proj.pos.z);
    try {
      this.ctx.elements.freezeWater(at, ICE_LANCE.floeR);
    } catch {}
    this.fx.lanceSkim(at);
  }
  stepOrb(proj, dt) {
    const ctx = this.ctx;
    proj.prev.copy(proj.pos);
    proj.vel.y -= proj.gravity * dt;
    proj.pos.addScaledVector(proj.vel, dt);
    const worldHit = this.traceWorld(proj.prev, proj.pos);
    const end = _artsV3.copy(worldHit ? this.ph.point : proj.pos);
    const hit = this.hit;
    hit.damage = BOUNCE_ORB.damage;
    hit.color = 'yellow';
    hit.knockback = BOUNCE_ORB.knockback;
    hit.source = 'art';
    hit.point = undefined;
    flatDir(proj.vel, hit.direction);
    const excl = this.excl;
    excl.clear();
    if (proj.lastFoe >= 0) excl.add(proj.lastFoe);
    for (const [id, count] of proj.hits) if (count >= BOUNCE_ORB.perFoe) excl.add(id);
    const span = proj.prev.distanceTo(end);
    const hitR = BOUNCE_ORB.hitR * (0.9 + 0.1 * proj.size);
    const steps = Math.max(1, Math.ceil(span / (hitR * 0.75)));
    for (let i = +!proj.first; i <= steps; i++) {
      const at = _artsV4.copy(proj.prev).lerp(end, i / steps);
      let hits = [];
      try {
        hits = ctx.enemies.hitSphere(at, hitR, hit, excl);
      } catch {
        hits = [];
      }
      if (hits.length) {
        for (const id of hits) proj.hits.set(id, (proj.hits.get(id) ?? 0) + 1);
        proj.lastFoe = hits[0];
        proj.pos.copy(at);
        ctx.time.hitStop(0.025);
        this.rig.addTrauma(0.06);
        ctx.events.emit('combat:art-impact', {
          art: 'bounceOrb',
          color: 'yellow',
          position: at.clone(),
          enemyHit: true,
        });
        this.orbBounce(proj, at, _artsV5.copy(proj.vel).negate().normalize(), false, true);
        proj.first = false;
        return;
      }
    }
    proj.first = false;
    if (worldHit) {
      const water = worldHit === 'water';
      const point = _artsV4.copy(this.ph.point);
      const normal = _artsV5.copy(this.ph.normal);
      if (!water && normal.y > 0.5) {
        try {
          ctx.paint.paintSphere(point, BOUNCE_ORB.pad, 'yellow', 1);
        } catch {}
        this.splat(point, normal, 'yellow', BOUNCE_ORB.pad);
      } else if (!water) this.splat(point, normal, 'yellow', 0.6, this.surfaceOf(this.ph.handle));
      proj.pos.copy(point).addScaledVector(normal, 0.05);
      proj.lastFoe = -1;
      ctx.events.emit('combat:art-impact', {
        art: 'bounceOrb',
        color: 'yellow',
        position: point.clone(),
        enemyHit: false,
      });
      this.orbBounce(proj, point, normal, water, false);
      return;
    }
    if (proj.age > BOUNCE_ORB.life || proj.pos.y < this.waterLevel() - 30) {
      proj.active = false;
      this.fx.orbPop(proj.pos, proj.size);
    }
  }
  orbBounce(proj, point, normal, water, hitEnemy) {
    proj.bounces++;
    proj.lastBounce = proj.age;
    this.fx.orbBounce(point, normal, proj.size, water, hitEnemy, proj.bounces);
    if (proj.bounces > BOUNCE_ORB.bounces) {
      proj.active = false;
      this.fx.orbPop(point, proj.size);
      return;
    }
    proj.size = 1 + 0.16 * proj.bounces;
    const target = this.orbSeek(proj, point, hitEnemy ? null : normal);
    if (target) {
      enemyAimPoint(target, _artsV1);
      const dist = point.distanceTo(_artsV1);
      const flightT = MathUtils.clamp(0.28 + dist * 0.035, 0.32, 0.72);
      proj.vel.set(
        (_artsV1.x - point.x) / flightT,
        (_artsV1.y - point.y) / flightT + 0.5 * proj.gravity * flightT,
        (_artsV1.z - point.z) / flightT,
      );
      return;
    }
    const vn = proj.vel.dot(normal);
    proj.vel.addScaledVector(normal, -2 * vn).multiplyScalar(0.72);
    const out = proj.vel.dot(normal);
    const minOut = hitEnemy ? 7 : 6 - proj.bounces * 0.6;
    if (out < minOut) proj.vel.addScaledVector(normal, minOut - out);
    if (hitEnemy) proj.vel.y = Math.max(proj.vel.y, 6.5);
  }
  orbSeek(proj, from, normal) {
    let foes = [];
    try {
      foes = this.ctx.enemies.query(from, BOUNCE_ORB.seek + 4);
    } catch {
      foes = [];
    }
    let best = null;
    let bestScore = 1000000000;
    for (const foe of foes) {
      if (!foe.alive || foe.id === proj.lastFoe || (proj.hits.get(foe.id) ?? 0) >= BOUNCE_ORB.perFoe) continue;
      enemyAimPoint(foe, _artsV2);
      const gap = _artsV2.distanceTo(from) - foe.radius;
      if (gap > BOUNCE_ORB.seek) continue;
      const score = gap + (proj.hits.has(foe.id) ? 6 : 0);
      if (score >= bestScore) continue;
      const dir = this.seekDir.subVectors(_artsV2, from);
      const dist = dir.length();
      if (!(dist < 0.001)) {
        dir.divideScalar(dist);
        if (!(normal && dir.dot(normal) < -0.05)) {
          this.seekFrom.copy(from).addScaledVector(normal ?? dir, 0.12);
          if (!this.probes.ray(this.seekFrom, dir, Math.max(0, dist - foe.radius - 0.3), this.ph2)) {
            bestScore = score;
            best = foe;
          }
        }
      }
    }
    return best;
  }
  startVine(from, dir) {
    const vine = this.vines.find((vine) => !vine.active) ?? this.vines[0];
    vine.active = true;
    vine.age = 0;
    vine.phase = 0;
    vine.phaseT = 0;
    vine.origin.copy(from);
    vine.dir.copy(dir);
    vine.len = 0.2;
    vine.tip.copy(from).addScaledVector(dir, vine.len);
    vine.kind = 'none';
    vine.enemyId = -1;
    vine.hitSet.clear();
  }
  stepVine(vine, dt) {
    const ctx = this.ctx;
    vine.age += dt;
    vine.phaseT += dt;
    this.castPoint(vine.origin);
    if (vine.phase === 0) {
      const len = vine.len;
      const reach = Math.min(VINE_LASH.range, len + VINE_LASH.speed * dt);
      const prevTip = _artsV1.copy(vine.origin).addScaledVector(vine.dir, len);
      let hitDist = 1000000000;
      let kind = 'none';
      if (this.probes.ray(vine.origin, vine.dir, reach, this.ph)) {
        hitDist = this.ph.distance;
        kind = this.ph.normal.y >= 0.64 ? 'ground' : this.ph.normal.y > -0.5 ? 'wall' : 'ground';
        vine.normal.copy(this.ph.normal);
        vine.anchor.copy(this.ph.point);
      }
      const waterY = this.waterLevel();
      if (vine.dir.y < -0.0001) {
        const toWater = (waterY - vine.origin.y) / vine.dir.y;
        if (
          toWater > 0 &&
          toWater < Math.min(hitDist, reach) &&
          this.overWater(vine.origin.x + vine.dir.x * toWater, vine.origin.z + vine.dir.z * toWater)
        ) {
          hitDist = toWater;
          kind = 'water';
          vine.anchor.copy(vine.origin).addScaledVector(vine.dir, toWater);
          vine.normal.set(0, 1, 0);
        }
      }
      const dist = Math.min(reach, hitDist);
      const tip = _artsV2.copy(vine.origin).addScaledVector(vine.dir, dist);
      if (this.vineSweep(vine, prevTip, tip)) {
        vine.len = vine.origin.distanceTo(vine.anchor);
        vine.tip.copy(vine.anchor);
        vine.phase = 1;
        vine.phaseT = 0;
        return;
      }
      vine.len = dist;
      vine.tip.copy(tip);
      if (hitDist <= reach) {
        vine.kind = kind;
        vine.tip.copy(vine.anchor);
        vine.phase = 1;
        vine.phaseT = 0;
        this.vineLand(vine);
        return;
      }
      if (reach >= VINE_LASH.range) {
        vine.phase = 2;
        vine.phaseT = 0;
        vine.from.copy(vine.tip);
      }
      return;
    }
    if (vine.phase === 1) {
      if (vine.kind === 'enemy') {
        let foe;
        try {
          foe = ctx.enemies.get(vine.enemyId);
        } catch {
          foe = undefined;
        }
        if (foe && foe.alive) enemyAimPoint(foe, vine.anchor);
      }
      vine.tip.copy(vine.anchor);
      const hold =
        vine.kind === 'enemy'
          ? VINE_LASH.hold + 0.08
          : vine.kind === 'wall'
            ? VINE_LASH.hold + 0.12
            : VINE_LASH.hold * 0.6;
      if (vine.phaseT >= hold) {
        vine.phase = 2;
        vine.phaseT = 0;
        vine.from.copy(vine.tip);
      }
      return;
    }
    const k = Math.min(1, vine.phaseT / VINE_LASH.retract);
    const ease = k * k * (3 - 2 * k);
    vine.tip.lerpVectors(vine.from, vine.origin, ease);
    if (k >= 1) vine.active = false;
  }
  vineSweep(vine, from, to) {
    const ctx = this.ctx;
    const dist = from.distanceTo(to);
    const hitR = VINE_LASH.hitR;
    let foes = [];
    try {
      foes = ctx.enemies.query(_artsV3.lerpVectors(from, to, 0.5), dist * 0.5 + 5);
    } catch {
      foes = [];
    }
    const excl = this.excl;
    excl.clear();
    for (const id of vine.hitSet) excl.add(id);
    for (const foe of foes) if (foe.id < 1000000) excl.add(foe.id);
    const steps = Math.max(1, Math.ceil(dist / (hitR * 0.75)));
    const hit = this.hit;
    for (let i = 0; i <= steps; i++) {
      const at = _artsV4.copy(from).lerp(to, i / steps);
      for (const foe of foes)
        if (!(!foe.alive || foe.id >= 1000000 || vine.hitSet.has(foe.id)) && touchesEnemy(foe, at, hitR)) {
          this.vineGrab(vine, foe, at);
          return true;
        }
      hit.damage = VINE_LASH.damage;
      hit.color = 'green';
      hit.knockback = 1;
      hit.source = 'art';
      hit.point = undefined;
      flatDir(vine.dir, hit.direction);
      let hits = [];
      try {
        hits = ctx.enemies.hitSphere(at, hitR, hit, excl);
      } catch {
        hits = [];
      }
      if (hits.length) {
        vine.kind = 'enemy';
        vine.enemyId = hits[0];
        for (const id of hits) vine.hitSet.add(id);
        vine.anchor.copy(at);
        this.vineGrabFx(vine, at, true);
        return true;
      }
    }
    return false;
  }
  vineGrab(vine, foe, point) {
    const ctx = this.ctx;
    const state = this.ctrl.state;
    vine.kind = 'enemy';
    vine.enemyId = foe.id;
    vine.hitSet.add(foe.id);
    vine.anchor.copy(point);
    const yankable = (foe.kind === 'smudgeling' || foe.kind === 'spitter') && !foe.elite && !foe.boss;
    const toHero = _artsV1.set(state.position.x - foe.position.x, 0, state.position.z - foe.position.z);
    const dist = toHero.length();
    if (dist > 0.001) toHero.divideScalar(dist);
    else flatDir(vine.dir, toHero).negate();
    if (yankable) {
      const yank = MathUtils.clamp((dist - 2.2) * 2.4, 0, VINE_LASH.yank);
      const yankHit = {
        damage: VINE_LASH.damage * 0.75,
        color: null,
        direction: toHero.clone(),
        knockback: yank,
        source: 'art',
        point: point.clone(),
      };
      try {
        ctx.enemies.damage(foe.id, yankHit);
      } catch {}
      this.pendingHits.push({
        t: VINE_LASH.rootDelay,
        id: foe.id,
        hit: {
          damage: VINE_LASH.damage * 0.25,
          color: 'green',
          direction: toHero.clone(),
          knockback: 0,
          source: 'art',
          point: point.clone(),
        },
      });
    } else {
      const lashHit = {
        damage: VINE_LASH.damage,
        color: 'green',
        direction: flatDir(vine.dir, new Vector3()),
        knockback: 1,
        source: 'art',
        point: point.clone(),
      };
      try {
        ctx.enemies.damage(foe.id, lashHit);
      } catch {}
    }
    this.vineGrabFx(vine, point, yankable);
  }
  vineGrabFx(vine, point, yanked) {
    this.fx.vineGrab(point, vine.dir);
    this.ctx.time.hitStop(0.05);
    this.rig.addTrauma(0.12);
    if (yanked) this.rig.kick(_artsV1.copy(vine.dir).negate(), 0.06);
    this.ctx.events.emit('combat:art-impact', {
      art: 'vineLash',
      color: 'green',
      position: point.clone(),
      enemyHit: true,
    });
  }
  vineLand(vine) {
    const ctx = this.ctx;
    const anchor = vine.anchor;
    if (vine.kind === 'water') {
      this.fx.vineWater(anchor);
      ctx.events.emit('combat:art-impact', {
        art: 'vineLash',
        color: 'green',
        position: anchor.clone(),
        enemyHit: false,
      });
      return;
    }
    if (vine.kind === 'wall') this.growLadder(anchor, vine.normal);
    else this.thornPatch(anchor, vine.normal);
    ctx.events.emit('combat:art-impact', {
      art: 'vineLash',
      color: 'green',
      position: anchor.clone(),
      enemyHit: false,
    });
  }
  growLadder(anchor, normal) {
    const out = _artsV1.set(normal.x, 0, normal.z);
    if (out.lengthSq() < 0.05) {
      this.thornPatch(anchor, normal);
      return;
    }
    out.normalize();
    const dabs = [];
    const into = _artsV2.copy(out).negate();
    const side = _artsV5.set(-out.z, 0, out.x);
    const last = [null, null];
    const done = [false, false];
    for (let rise = -1; rise <= VINE_LASH.ladder + 0.01; rise += 0.42)
      for (let rail = 0; rail < 2; rail++) {
        if (done[rail]) continue;
        const probe = _artsV3
          .copy(anchor)
          .addScaledVector(out, 0.9)
          .addScaledVector(side, rail === 0 ? -0.45 : 0.45);
        probe.y += rise;
        if (this.probes.ray(probe, into, 2.4, this.ph) && this.ph.normal.y < 0.75) {
          last[rail] = this.ph.point.clone();
          dabs.push(last[rail]);
        } else if (last[rail] && rise > 0) {
          dabs.push(last[rail].clone().addScaledVector(_artsUp, 0.35).addScaledVector(into, 0.35));
          done[rail] = true;
        }
      }
    if (!dabs.length) {
      this.thornPatch(anchor, normal);
      return;
    }
    const slot = this.ladders.find((ladder) => !ladder.active) ?? (this.ladders.length < 4 ? null : this.ladders[0]);
    const ladder = slot ?? {
      active: true,
      pts: dabs,
      normal: out.clone(),
      idx: 0,
      t: 0,
    };
    ladder.active = true;
    ladder.pts = dabs;
    ladder.normal = out.clone();
    ladder.idx = 0;
    ladder.t = 0;
    if (!slot) this.ladders.push(ladder);
    this.fx.vineWall(anchor, out);
    this.splat(anchor, out, 'green', VINE_LASH.ladderR);
    this.ctrl.log(`vine ladder ${dabs.length} dabs`);
  }
  stepLadder(ladder, dt) {
    ladder.t += dt;
    const upTo = Math.min(ladder.pts.length, Math.floor(ladder.t * 84) + 2);
    for (; ladder.idx < upTo;) {
      const dab = ladder.pts[ladder.idx++];
      try {
        this.ctx.paint.paintSphere(dab, VINE_LASH.ladderR, 'green', 1);
      } catch {}
      this.fx.ladderDab(dab, ladder.normal, ladder.idx);
    }
    if (ladder.idx >= ladder.pts.length) ladder.active = false;
  }
  thornPatch(pos, normal) {
    const zone =
      this.zones.find((zone) => !zone.active) ??
      this.zones.reduce((oldest, zone) => (oldest.age > zone.age ? oldest : zone));
    zone.active = true;
    zone.center.copy(pos);
    zone.normal.copy(normal.y > 0.2 ? normal : _artsUp);
    zone.age = 0;
    zone.life = VINE_LASH.thornLife;
    zone.tick = 0;
    zone.hit.clear();
    try {
      this.ctx.paint.paintSphere(pos, 1.5, 'green', 1);
    } catch {}
    this.splat(pos, zone.normal, 'green', 1.5);
    this.fx.thornsStart(this.zones.indexOf(zone), zone);
  }
  stepZone(zone, dt) {
    zone.age += dt;
    if (zone.age >= zone.life) {
      zone.active = false;
      return;
    }
    zone.tick -= dt;
    if (zone.tick > 0 || zone.age > zone.life - 0.5) return;
    zone.tick = 0.2;
    const hit = this.hit;
    hit.damage = VINE_LASH.thornDamage;
    hit.color = 'green';
    hit.knockback = 0;
    hit.source = 'art';
    hit.point = undefined;
    hit.direction.set(0, 0, 0);
    const at = _artsV1.copy(zone.center).addScaledVector(zone.normal, 0.5);
    try {
      if (this.ctx.enemies.hitSphere(at, VINE_LASH.thornR, hit, zone.hit).length) this.fx.thornSting(at);
    } catch {}
  }
  waterLevel() {
    const level = this.ctx.water?.level;
    return Number.isFinite(level) ? level : 0;
  }
  overWater(x, z, minDepth = 0.05) {
    try {
      return (this.ctx.water?.depthAt?.(x, z) ?? 0) > minDepth;
    } catch {
      return false;
    }
  }
  traceWorld(from, to) {
    const dir = _artsV1.subVectors(to, from);
    const len = dir.length();
    if (len < 0.000001) return null;
    dir.divideScalar(len);
    let kind = null;
    let dist = len;
    if (this.probes.ray(from, dir, len, this.ph)) {
      dist = this.ph.distance;
      kind = 'world';
    }
    const waterY = this.waterLevel();
    if (from.y > waterY && to.y <= waterY) {
      const toWater = ((from.y - waterY) / (from.y - to.y)) * len;
      if (toWater < dist && this.overWater(from.x + dir.x * toWater, from.z + dir.z * toWater)) {
        this.ph.point.copy(from).addScaledVector(dir, toWater).setY(waterY);
        this.ph.normal.set(0, 1, 0);
        this.ph.distance = toWater;
        this.ph.handle = -1;
        kind = 'water';
      }
    }
    return kind;
  }
  sweep(from, to, radius, hit, exclude, first) {
    const dist = from.distanceTo(to);
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.75)));
    for (let i = +!first; i <= steps; i++) {
      const at = _artsV4.copy(from).lerp(to, i / steps);
      let hits = [];
      try {
        hits = this.ctx.enemies.hitSphere(at, radius, hit, exclude);
      } catch {
        hits = [];
      }
      if (hits.length) return at;
    }
    return null;
  }
  surfaceOf(handle) {
    try {
      return this.ctx.colliders.get(handle)?.dynamic ? 'prop' : 'world';
    } catch {
      return 'world';
    }
  }
  splat(pos, normal, color, radius, surface = 'world') {
    try {
      this.ctx.events.emit('paint:splat', {
        position: pos.clone(),
        normal: normal.clone(),
        color,
        radius,
        surface,
        colliderHandle: surface === 'prop' && this.ph.handle >= 0 ? this.ph.handle : undefined,
      });
    } catch {}
  }
  pushProps(center, radius, force) {
    this.ball.radius = radius;
    this.propHits.length = 0;
    try {
      this.ctx.physics.intersectionsWithShape(
        {
          x: center.x,
          y: center.y,
          z: center.z,
        },
        {
          x: 0,
          y: 0,
          z: 0,
          w: 1,
        },
        this.ball,
        this.onProp,
        undefined,
        PROP_PUSH_GROUPS,
      );
    } catch {
      return;
    }
    for (const collider of this.propHits)
      try {
        const body = collider.parent();
        if (!body || !body.isDynamic()) continue;
        const p = body.translation();
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        const dz = p.z - center.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        const mass = body.mass();
        const impulse = (1 - Math.min(1, dist / radius)) * force * mass + mass * 1.5;
        body.applyImpulse(
          {
            x: (dx / dist) * impulse,
            y: mass * 4 + Math.max(0, dy / dist) * impulse,
            z: (dz / dist) * impulse,
          },
          true,
        );
      } catch {}
    this.propHits.length = 0;
  }
}
const PROP_PUSH_GROUPS = interactionGroups(COLLISION_LAYERS.ALL, COLLISION_LAYERS.PROP);
function flatDir(v, out) {
  out.set(v.x, 0, v.z);
  const len = out.length();
  return len < 0.00001 ? out.set(0, 0, 1) : out.divideScalar(len);
}
function enemyAimPoint(foe, out) {
  return foe.aim && Number.isFinite(foe.aim.x + foe.aim.y + foe.aim.z)
    ? out.copy(foe.aim)
    : out.set(foe.position.x, foe.position.y + foe.height * 0.55, foe.position.z);
}
function touchesEnemy(foe, point, radius) {
  const bottomY = foe.position.y + foe.radius;
  const topY = Math.max(bottomY, foe.position.y + foe.height - foe.radius);
  const cy = Math.min(Math.max(point.y, bottomY), topY);
  const dx = point.x - foe.position.x;
  const dy = point.y - cy;
  const dz = point.z - foe.position.z;
  const reach = foe.radius + radius;
  return dx * dx + dy * dy + dz * dz <= reach * reach;
}
function launchVelocity(from, to, speed, gravity, out) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) return out.set(0, Math.sign(dy || 1) * speed, 0);
  const v2 = speed * speed;
  const disc = v2 * v2 - gravity * (gravity * dist * dist + 2 * dy * v2);
  let angle;
  angle =
    disc < 0 || gravity < 0.0001
      ? gravity < 0.0001
        ? Math.atan2(dy, dist)
        : Math.PI / 4
      : Math.atan((v2 - Math.sqrt(disc)) / (gravity * dist));
  const horiz = speed * Math.cos(angle);
  out.set((dx / dist) * horiz, speed * Math.sin(angle), (dz / dist) * horiz);
  if (!Number.isFinite(out.x + out.y + out.z)) out.set(dx, dy, dz).normalize().multiplyScalar(speed);
  return out;
}
