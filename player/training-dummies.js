/**
 * Training dummies for the ?dummy URL flag: a row of straw targets on wooden posts that stands in for the enemies system. They wobble and flash when struck, can wind up and swing back at the hero, and pop back up a few seconds after being knocked down.
 */
import {
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { COLLISION_GROUPS, PALETTE } from '../core/config.js';
import { clamp } from '../core/math.js';
const _dummyPos = new Vector3();
const _swingDir = new Vector3();
export class TrainingDummies {
  ctx;
  isStub = false;
  isDummy = true;
  list = [];
  queryOut = [];
  nextId = 1;
  inCombat = false;
  attacks;
  constructor(ctx, center, facing, spec) {
    this.ctx = ctx;
    const count = clamp(parseInt(spec, 10) || 1, 1, 7);
    this.attacks = /attack/i.test(spec) || ctx.params.has('dummyattack');
    const fwdX = Math.sin(facing);
    const fwdZ = Math.cos(facing);
    const sideX = -Math.cos(facing);
    const sideZ = Math.sin(facing);
    for (let i = 0; i < count; i++) {
      const lane = i - (count - 1) / 2;
      const dist = 3.6 + Math.abs(lane) * 0.9;
      _dummyPos.set(center.x + fwdX * dist + sideX * lane * 2.1, 0, center.z + fwdZ * dist + sideZ * lane * 2.1);
      this.spawn('smudgeling', _dummyPos, {
        facing: facing + Math.PI,
      });
    }
  }
  get alertedCount() {
    let count = 0;
    for (const dummy of this.list) if (dummy.alive && dummy.alerted) count++;
    return count;
  }
  registerTarget() {}
  unregisterTarget() {}
  spawn(kind, pos, opts) {
    const ctx = this.ctx;
    const id = this.nextId++;
    const baseY = this.groundY(pos.x, pos.z);
    const group = new Group();
    group.name = `training-dummy-${id}`;
    group.position.set(pos.x, baseY, pos.z);
    group.rotation.y = opts?.facing ?? 0;
    const pivot = new Group();
    group.add(pivot);
    const woodMat = new MeshStandardMaterial({
      color: 0x8a6446,
      roughness: 0.85,
    });
    const strawMat = new MeshStandardMaterial({
      color: 0xd6bd86,
      roughness: 0.95,
    });
    const ropeMat = new MeshStandardMaterial({
      color: 0xa3824f,
      roughness: 0.9,
    });
    const faceMat = new MeshStandardMaterial({
      color: 0xf4ecd8,
      roughness: 0.9,
    });
    const redMat = new MeshStandardMaterial({
      color: 0xd9543a,
      roughness: 0.7,
    });
    const mats = [woodMat, strawMat, ropeMat, faceMat, redMat];
    for (const mat of mats)
      try {
        ctx.paint.patchMaterial(mat, {
          paint: false,
          vitality: true,
        });
      } catch {}
    const addPart = (geometry, material, x, y, z, holder = pivot) => {
      const mesh = new Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      holder.add(mesh);
      return mesh;
    };
    addPart(new CylinderGeometry(0.06, 0.075, 0.5, 8), woodMat, 0, 0.2, 0, group);
    addPart(new CylinderGeometry(0.055, 0.06, 1.35, 8), woodMat, 0, 0.95, 0);
    const bodyGeo = new SphereGeometry(0.3, 16, 12);
    bodyGeo.scale(1, 1.25, 0.9);
    addPart(bodyGeo, strawMat, 0, 1, 0);
    const bandGeo = new TorusGeometry(0.29, 0.022, 6, 20);
    bandGeo.rotateX(Math.PI / 2);
    addPart(bandGeo, ropeMat, 0, 0.86, 0).scale.set(1, 1, 0.9);
    addPart(bandGeo, ropeMat, 0, 1.18, 0).scale.set(0.9, 1, 0.82);
    const crossbar = addPart(new CylinderGeometry(0.035, 0.035, 1.05, 6), woodMat, 0, 1.22, 0);
    crossbar.rotation.z = Math.PI / 2;
    const tuftGeo = new ConeGeometry(0.07, 0.16, 6);
    for (const side of [-1, 1]) {
      const tuft = addPart(tuftGeo, strawMat, side * 0.56, 1.22, 0);
      tuft.rotation.z = (-side * Math.PI) / 2;
    }
    addPart(new SphereGeometry(0.17, 14, 10), strawMat, 0, 1.52, 0);
    const face = addPart(new CircleGeometry(0.13, 20), faceMat, 0, 1.53, 0.166);
    face.castShadow = false;
    const ring = addPart(new RingGeometry(0.075, 0.1, 20), redMat, 0, 1.53, 0.168);
    ring.castShadow = false;
    const bullseye = addPart(new CircleGeometry(0.03, 12), redMat, 0, 1.53, 0.169);
    bullseye.castShadow = false;
    addPart(new ConeGeometry(0.1, 0.18, 7), strawMat, 0, 1.71, 0);
    ctx.scene.add(group);
    const RAPIER = ctx.RAPIER;
    const body = ctx.physics.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, baseY + 0.95, pos.z),
    );
    const collider = ctx.physics.createCollider(
      RAPIER.ColliderDesc.capsule(0.45, 0.3).setCollisionGroups(COLLISION_GROUPS.enemy),
      body,
    );
    ctx.colliders.register(collider, {
      kind: 'enemy',
      surface: 'wood',
      object: group,
      data: {
        id,
      },
    });
    const dummy = {
      id,
      kind,
      position: new Vector3(pos.x, baseY, pos.z),
      facing: opts?.facing ?? 0,
      radius: 0.32,
      height: 1.75,
      health: 6,
      maxHealth: 6,
      alive: true,
      alerted: false,
      telegraphing: false,
      attackEta: -1,
      statuses: new Set(),
      group,
      pivot,
      mats,
      body,
      tiltX: 0,
      tiltZ: 0,
      tvX: 0,
      tvZ: 0,
      squash: 1,
      squashV: 0,
      flash: 0,
      paint: new Color(),
      paintAmt: 0,
      deadT: -1,
      popT: 0,
      attackCd: 1.5 + id * 0.6,
      windT: -1,
      swingT: -1,
      home: new Vector3(pos.x, baseY, pos.z),
    };
    this.list.push(dummy);
    this.ctx.events.emit('enemy:spawn', {
      id,
      kind,
      position: dummy.position.clone(),
    });
    return id;
  }
  spawnCamp(campId, center, kinds) {
    kinds.forEach((kind, i) => {
      const angle = (i / Math.max(1, kinds.length)) * Math.PI * 2;
      this.spawn(kind, _dummyPos.set(center.x + Math.cos(angle) * 3, 0, center.z + Math.sin(angle) * 3));
    });
  }
  get(id) {
    for (const dummy of this.list) if (dummy.id === id) return dummy;
  }
  query(center, radius) {
    const queryOut = this.queryOut;
    queryOut.length = 0;
    for (const dummy of this.list) {
      if (!dummy.alive) continue;
      const dx = dummy.position.x - center.x;
      const dz = dummy.position.z - center.z;
      if (dx * dx + dz * dz <= radius * radius) queryOut.push(dummy);
    }
    queryOut.sort((a, b) => a.position.distanceToSquared(center) - b.position.distanceToSquared(center));
    return queryOut;
  }
  damage(id, hit) {
    const dummy = this.get(id);
    if (!dummy || !dummy.alive || dummy.popT > 0) return false;
    let damage = hit.damage;
    if (dummy.statuses.has('frozen')) {
      damage *= 2;
      dummy.statuses.delete('frozen');
    }
    dummy.health = Math.max(0, dummy.health - damage);
    const direction = hit.direction;
    const cos = Math.cos(dummy.facing);
    const sin = Math.sin(dummy.facing);
    const localX = direction.x * cos - direction.z * sin;
    const localZ = direction.x * sin + direction.z * cos;
    const kick = 3 + hit.knockback * 0.9;
    dummy.tvX += localZ * kick;
    dummy.tvZ += -localX * kick;
    dummy.squashV -= 2.5 + hit.damage;
    dummy.flash = 1;
    dummy.alerted = true;
    if (hit.color) {
      dummy.paint.set(PALETTE[hit.color].hex);
      dummy.paintAmt = 1;
      if (hit.color === 'blue') dummy.statuses.add('frozen');
    }
    const killed = dummy.health <= 0;
    this.ctx.events.emit('combat:hit', {
      enemyId: id,
      kind: dummy.kind,
      position: dummy.position.clone(),
      damage,
      color: hit.color,
      source: hit.source,
      killed,
    });
    if (killed) {
      dummy.alive = false;
      dummy.deadT = 0;
      dummy.telegraphing = false;
      dummy.attackEta = -1;
      this.ctx.events.emit('enemy:death', {
        id,
        kind: dummy.kind,
        position: dummy.position.clone(),
        color: hit.color,
      });
    }
    return true;
  }
  hitSphere(center, radius, hit, hitIds) {
    const hits = [];
    for (const dummy of this.list) {
      if (!dummy.alive || hitIds?.has(dummy.id)) continue;
      const nearY = clamp(center.y, dummy.position.y + 0.35, dummy.position.y + 1.6);
      const dx = center.x - dummy.position.x;
      const dy = center.y - nearY;
      const dz = center.z - dummy.position.z;
      const reach = radius + dummy.radius;
      if (!(dx * dx + dy * dy + dz * dz > reach * reach))
        if (this.damage(dummy.id, hit)) {
          hits.push(dummy.id);
          hitIds?.add(dummy.id);
        }
    }
    return hits;
  }
  findLockTarget(eye, dir, maxDist = 30) {
    let best = null;
    let bestScore = 1000000000;
    const heroPos = this.ctx.player?.state.position ?? eye;
    for (const dummy of this.list) {
      if (!dummy.alive) continue;
      _dummyPos.set(dummy.position.x - eye.x, dummy.position.y + 1 - eye.y, dummy.position.z - eye.z);
      const dist = _dummyPos.length();
      const heroDist = dummy.position.distanceTo(heroPos);
      if (heroDist > maxDist) continue;
      const align = _dummyPos.dot(dir) / Math.max(dist, 0.0001);
      if (align < 0.35 && heroDist > 5) continue;
      const score = (1 - align) * 4 + heroDist * 0.12;
      if (score < bestScore) {
        bestScore = score;
        best = dummy;
      }
    }
    return best ? best.id : null;
  }
  update(dt) {
    if (dt <= 0) return;
    const ctx = this.ctx;
    const state = ctx.player?.state;
    for (const dummy of this.list) {
      if (state) {
        const dist = Math.hypot(state.position.x - dummy.position.x, state.position.z - dummy.position.z);
        if (dummy.alive && !dummy.alerted && dist < 10 && !state.dead) {
          dummy.alerted = true;
          ctx.events.emit('enemy:alert', {
            id: dummy.id,
            kind: dummy.kind,
            position: dummy.position.clone(),
          });
        } else if (dummy.alerted && (dist > 16 || state.dead)) dummy.alerted = false;
        if (this.attacks && dummy.alive && dummy.alerted) this.think(dummy, dt, dist);
      }
      if (!dummy.alive) {
        dummy.deadT += dt;
        if (dummy.deadT > 3.2) this.revive(dummy);
      }
      dummy.tvX += (-70 * dummy.tiltX - 5 * dummy.tvX) * dt;
      dummy.tvZ += (-70 * dummy.tiltZ - 5 * dummy.tvZ) * dt;
      dummy.tiltX = clamp(dummy.tiltX + dummy.tvX * dt, -0.9, 0.9);
      dummy.tiltZ = clamp(dummy.tiltZ + dummy.tvZ * dt, -0.9, 0.9);
      dummy.squashV += (-(dummy.squash - 1) * 260 - dummy.squashV * 14) * dt;
      dummy.squash += dummy.squashV * dt;
      dummy.flash = Math.max(0, dummy.flash - dt * 7);
      dummy.paintAmt = Math.max(0, dummy.paintAmt - dt * 0.35);
      let lean = 0;
      if (dummy.windT >= 0) lean = Math.min(1, dummy.windT / 0.7) * 0.35;
      if (dummy.swingT >= 0) lean = -0.6 * Math.sin(Math.PI * Math.min(1, dummy.swingT / 0.25));
      let scale = 1;
      if (!dummy.alive) scale = Math.max(0.001, 1 - dummy.deadT / 0.22);
      if (dummy.popT > 0) {
        dummy.popT = Math.max(0, dummy.popT - dt);
        const pop = 1 - dummy.popT / 0.45;
        scale = Math.max(0.001, 1 + Math.sin(pop * Math.PI) * 0.25 * (1 - pop)) * Math.min(1, pop * 2.2);
      }
      dummy.pivot.rotation.set(dummy.tiltX - lean, 0, dummy.tiltZ);
      dummy.pivot.scale.set(scale / Math.sqrt(dummy.squash), scale * dummy.squash, scale / Math.sqrt(dummy.squash));
      dummy.group.visible = scale > 0.002;
      const flash = dummy.flash;
      const blink = dummy.telegraphing ? 0.5 + 0.5 * Math.sin(ctx.time.elapsed * 30) : 0;
      for (const mat of dummy.mats)
        mat.emissive.setRGB(
          flash + blink * 0.9 + dummy.paint.r * dummy.paintAmt * 0.5,
          flash + blink * 0.35 + dummy.paint.g * dummy.paintAmt * 0.5,
          flash + blink * 0.1 + dummy.paint.b * dummy.paintAmt * 0.5,
        );
    }
    const inCombat = this.alertedCount > 0;
    if (inCombat !== this.inCombat) {
      this.inCombat = inCombat;
      ctx.events.emit('combat:state', {
        inCombat,
      });
    }
  }
  think(dummy, dt, heroDist) {
    const ctx = this.ctx;
    if (dummy.swingT >= 0) {
      dummy.swingT += dt;
      if (dummy.swingT > 0.4) dummy.swingT = -1;
      return;
    }
    if (dummy.windT >= 0) {
      dummy.windT += dt;
      dummy.attackEta = Math.max(0, 0.7 - dummy.windT);
      if (dummy.windT >= 0.7) {
        dummy.windT = -1;
        dummy.telegraphing = false;
        dummy.attackEta = -1;
        dummy.swingT = 0;
        ctx.events.emit('enemy:attack', {
          id: dummy.id,
          kind: dummy.kind,
          position: dummy.position.clone(),
          attack: 'swing',
        });
        const state = ctx.player.state;
        const dx = state.position.x - dummy.position.x;
        const dz = state.position.z - dummy.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 2.3 && Math.abs(state.position.y - dummy.position.y) < 1.6) {
          _swingDir.set(dx / Math.max(dist, 0.001), 0, dz / Math.max(dist, 0.001));
          ctx.player.damage({
            amount: 0.5,
            direction: _swingDir.clone(),
            knockback: 6,
            source: 'dummy',
            enemyId: dummy.id,
          });
        }
      }
      return;
    }
    dummy.attackCd -= dt;
    if (dummy.attackCd <= 0 && heroDist < 3.2) {
      dummy.attackCd = 2.2 + ((dummy.id * 0.37) % 1);
      dummy.windT = 0;
      dummy.telegraphing = true;
      dummy.attackEta = 0.7;
      ctx.events.emit('enemy:telegraph', {
        id: dummy.id,
        kind: dummy.kind,
        position: dummy.position.clone(),
        attack: 'swing',
        eta: 0.7,
      });
    }
  }
  revive(dummy) {
    dummy.alive = true;
    dummy.alerted = false;
    dummy.health = dummy.maxHealth;
    dummy.deadT = -1;
    dummy.popT = 0.45;
    dummy.statuses.clear();
    dummy.tiltX = dummy.tiltZ = dummy.tvX = dummy.tvZ = 0;
    dummy.windT = dummy.swingT = -1;
    dummy.telegraphing = false;
  }
  groundY(x, z) {
    try {
      const y = this.ctx.terrain.heightAt(x, z);
      return Number.isFinite(y) ? y : 0;
    } catch {
      return 0;
    }
  }
  dispose() {
    for (const dummy of this.list) {
      this.ctx.scene.remove(dummy.group);
      try {
        this.ctx.physics.removeRigidBody(dummy.body);
      } catch {}
    }
  }
}
