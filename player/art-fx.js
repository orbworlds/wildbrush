/**
 * Brush art visuals: the charge glow and the art held at the brush tip, the aim arc and landing marker, the fireball, ice lance, bounce orb and vine lash in flight, and their bursts, shatters, bounces, vine grabs, ladder dabs and thorn patches.
 */
import {
  DoubleSide,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Vector3,
} from 'three';
import { COLOR_BY_ART, FIREBALL, VINE_LASH } from '../shared/artdefs.js';
import {
  _alignQuat,
  _basisU,
  _basisV,
  _greyColor,
  _thornMatrix,
  _thornQuat,
  _thornScale,
  _tiltQuat,
  _v1,
  _v2,
  _v3,
  _yawQuat,
  _yAxis,
  _zAxis,
  ART_TAU,
  createBounceOrbMaterial,
  createIceLanceGeometry,
  createIceLanceMaterial,
  createThornGeometry,
  FireballMesh,
  MAX_PROJECTILES,
  orthoBasis,
  PAINT_COLORS,
  quatFromDir,
  rand,
  randRange,
  RibbonTrails,
  TrajectoryPreview,
  VineMesh,
} from './art-meshes.js';
import { ArtParticles, PARTICLE_TYPE } from './art-particles.js';
export class ArtFx {
  ctx;
  particles;
  trails;
  preview_;
  fires = [];
  lances = [];
  orbs = [];
  orbMats = [];
  vines = [];
  vineAcc = [0, 0, 0];
  slots = [];
  thornMesh;
  thornSeeds = [];
  thornDrawn = [];
  thornWasDrawn = [];
  marker;
  markerMat;
  markerShown = false;
  chargeAcc = 0;
  chargeAcc2 = 0;
  wasCastable = false;
  wasFull = false;
  pulseT = 0;
  sputterT = 0;
  cam;
  heldFire;
  heldLance;
  heldOrb;
  heldOrbMat;
  heldT = 0;
  heldAim = new Vector3();
  warm = 3;
  warmPts = new Float32Array([0, -900, 0, 1, -900, 0, 2, -900, 0]);
  constructor(ctx) {
    this.ctx = ctx;
    this.cam = ctx.camera.position;
    this.particles = new ArtParticles(ctx);
    this.trails = new RibbonTrails(ctx);
    this.preview_ = new TrajectoryPreview(ctx);
    ctx.scene.add(this.particles.mesh, this.trails.mesh, this.preview_.mesh);
    const fireGeo = new IcosahedronGeometry(1, 4);
    const fireMat = FireballMesh.material(ctx);
    const lanceGeo = createIceLanceGeometry();
    const lanceMat = createIceLanceMaterial(ctx);
    const orbGeo = new IcosahedronGeometry(1, 4);
    const orbMat = createBounceOrbMaterial(ctx);
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const fire = new FireballMesh(fireGeo, fireMat);
      this.fires.push(fire);
      const lance = new Mesh(lanceGeo, lanceMat);
      lance.visible = false;
      lance.frustumCulled = false;
      lance.castShadow = true;
      this.lances.push(lance);
      const mat = orbMat.clone();
      const orb = new Mesh(orbGeo, mat);
      orb.visible = false;
      orb.frustumCulled = false;
      orb.castShadow = true;
      this.orbs.push(orb);
      this.orbMats.push(mat);
      ctx.scene.add(fire.mesh, lance, orb);
      this.slots.push({
        trail: -1,
        art: null,
        acc: 0,
        acc2: 0,
        acc3: 0,
      });
    }
    this.heldFire = new FireballMesh(fireGeo, fireMat);
    this.heldLance = new Mesh(lanceGeo, lanceMat);
    this.heldOrbMat = orbMat.clone();
    this.heldOrb = new Mesh(orbGeo, this.heldOrbMat);
    for (const mesh of [this.heldLance, this.heldOrb]) {
      mesh.visible = false;
      mesh.frustumCulled = false;
    }
    ctx.scene.add(this.heldFire.mesh, this.heldLance, this.heldOrb);
    for (let i = 0; i < 3; i++) {
      const vine = new VineMesh(ctx);
      this.vines.push(vine);
      ctx.scene.add(vine.mesh);
    }
    const thornMat = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      metalness: 0,
      flatShading: true,
    });
    this.thornMesh = new InstancedMesh(createThornGeometry(), thornMat, 144);
    this.thornMesh.frustumCulled = false;
    this.thornMesh.castShadow = true;
    _thornMatrix.makeScale(0, 0, 0);
    for (let i = 0; i < 144; i++) this.thornMesh.setMatrixAt(i, _thornMatrix);
    this.thornMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    ctx.scene.add(this.thornMesh);
    for (let i = 0; i < 8; i++) {
      this.thornSeeds.push([]);
      this.thornDrawn.push(false);
      this.thornWasDrawn.push(false);
    }
    this.markerMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: DoubleSide,
      toneMapped: false,
    });
    this.marker = new Mesh(new RingGeometry(0.34, 0.5, 40), this.markerMat);
    this.marker.renderOrder = 9;
    this.marker.visible = false;
    this.marker.frustumCulled = false;
    ctx.scene.add(this.marker);
    this.updateQuality();
    ctx.events.on('settings:changed', () => this.updateQuality());
  }
  warmup(show) {
    const pos = _v1.set(0, -900, 0);
    if (show) {
      this.fires[0].set(pos, _v2.set(0, 0, 1), 1, 0, 1, 1);
      this.lances[0].position.copy(pos);
      this.orbs[0].position.copy(pos);
      this.vines[0].set(pos, _v3.set(3, -900, 0), 0.1, 0, 0, 1, 1, 1, 0);
      this.preview_.show(this.warmPts, 3, PAINT_COLORS.red, 1, 0.05, this.cam);
      this.marker.position.copy(pos);
      this.markerShown = true;
      this.emit({
        type: PARTICLE_TYPE.Glow,
        x: 0,
        y: -900,
        z: 0,
        size: 1,
        life: 0.05,
        r: 1,
        g: 1,
        b: 1,
        alpha: 0.5,
      });
      const trail = this.trails.begin(0.2, 0.05, 1, 1, 1, 1, 0);
      if (trail >= 0) {
        this.trails.push(trail, pos);
        this.trails.push(trail, _v3.set(0, -900, 3));
        this.trails.end(trail);
      }
    } else {
      this.fires[0].hide();
      this.vines[0].hide();
    }
    this.lances[0].visible = show;
    this.orbs[0].visible = show;
    this.marker.visible = show;
  }
  updateQuality() {
    const quality = this.ctx.settings?.quality;
    this.particles.q = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
  }
  n(count) {
    return Math.max(1, Math.round(count * this.particles.q));
  }
  emit(opts) {
    this.particles.emit(opts);
  }
  update(dt) {
    if (this.warm > 0) this.warmup(--this.warm > 0);
    this.particles.update(dt);
    this.trails.update(dt, this.cam);
    this.preview_.endFrame();
    if (!this.markerShown) this.marker.visible = false;
    this.markerShown = false;
    let dirty = false;
    for (let i = 0; i < 8; i++) {
      if (!this.thornDrawn[i] && this.thornWasDrawn[i]) {
        _thornMatrix.makeScale(0, 0, 0);
        for (let j = 0; j < 18; j++) this.thornMesh.setMatrixAt(i * 18 + j, _thornMatrix);
        dirty = true;
      }
      if (this.thornDrawn[i]) dirty = true;
      this.thornWasDrawn[i] = this.thornDrawn[i];
      this.thornDrawn[i] = false;
    }
    if (dirty) this.thornMesh.instanceMatrix.needsUpdate = true;
  }
  charge(pos, art, level, castable, hasInk, dt, aim) {
    if (!pos || level <= 0) {
      this.wasCastable = false;
      this.wasFull = false;
      this.chargeAcc = 0;
      this.heldT = 0;
      this.heldFire.hide();
      this.heldLance.visible = false;
      this.heldOrb.visible = false;
      return;
    }
    this.heldT += dt;
    if (aim) this.heldAim.copy(aim);
    this.drawHeld(pos, art, hasInk ? level : level * 0.35);
    if (dt <= 0) return;
    const color = PAINT_COLORS[COLOR_BY_ART[art]];
    const full = level >= 1;
    const glow = hasInk ? 0.3 + 0.55 * level + (full ? 0.15 * Math.sin(this.ctx.time.elapsed * 18) : 0) : 0.2;
    const tint = hasInk ? color : _greyColor.setRGB(0.35, 0.35, 0.36);
    this.emit({
      type: PARTICLE_TYPE.Glow,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 0.18 + 0.22 * level,
      life: 0.045,
      r: tint.r * 1.1 * glow,
      g: tint.g * 1.1 * glow,
      b: tint.b * 1.1 * glow,
    });
    if (!hasInk) {
      this.sputterT -= dt;
      if (this.sputterT <= 0) {
        this.sputterT = 0.09 + rand() * 0.08;
        this.emit({
          type: PARTICLE_TYPE.Smoke,
          x: pos.x + randRange(-0.1, 0.1),
          y: pos.y,
          z: pos.z + randRange(-0.1, 0.1),
          vx: randRange(-0.4, 0.4),
          vy: randRange(0.4, 1),
          vz: randRange(-0.4, 0.4),
          size: randRange(0.08, 0.14),
          grow: 2.4,
          life: 0.6,
          r: 0.42,
          g: 0.41,
          b: 0.42,
          alpha: 0.6,
          drag: 2,
        });
      }
      this.wasCastable = castable;
      return;
    }
    const rate = (art === 'fireball' ? 14 + 30 * level : 18 + 40 * level) * this.particles.q;
    for (this.chargeAcc += dt * rate; this.chargeAcc >= 1;) {
      --this.chargeAcc;
      this.chargeParticle(pos, art, level);
    }
    if (castable && !this.wasCastable) this.chargeFlash(pos, color, 0.8);
    if (full && !this.wasFull) this.chargeFlash(pos, color, 1.25);
    this.wasCastable = castable;
    this.wasFull = full;
    if (full) {
      this.pulseT -= dt;
      if (this.pulseT <= 0) {
        this.pulseT = 0.3;
        this.emit({
          type: PARTICLE_TYPE.Shock,
          x: pos.x,
          y: pos.y,
          z: pos.z,
          size: 0.05,
          grow: 3.2,
          life: 0.24,
          r: color.r * 1.4,
          g: color.g * 1.4,
          b: color.b * 1.4,
          alpha: 0.7,
        });
      }
    } else this.pulseT = 0;
  }
  carry(pos, art, aim) {
    this.heldAim.copy(aim);
    this.drawHeld(pos, art, 1);
    this.wasCastable = false;
    this.wasFull = false;
  }
  drawHeld(pos, art, level) {
    const grow = 1 - (1 - Math.min(1, level)) ** 2;
    const heldT = this.heldT;
    this.heldFire.hide();
    this.heldLance.visible = false;
    this.heldOrb.visible = false;
    const dir = _v1.subVectors(this.heldAim, pos);
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
    dir.normalize();
    switch (art) {
      case 'fireball':
        this.heldFire.set(pos, _v2.set(0, -1, 0), 0.05 + 0.14 * grow, heldT, 0.9, Math.min(1, level * 4));
        break;
      case 'iceLance': {
        const heldLance = this.heldLance;
        heldLance.visible = true;
        heldLance.position.copy(pos).addScaledVector(dir, 0.15 + 0.35 * grow);
        quatFromDir(dir, heldLance.quaternion);
        heldLance.rotateZ(heldT * 2);
        const len = 0.12 + 0.6 * grow;
        heldLance.scale.set(len * 0.9, len * 0.9, len);
        break;
      }
      case 'bounceOrb': {
        const heldOrb = this.heldOrb;
        heldOrb.visible = true;
        const bob = Math.sin(heldT * 9) * 0.02 * grow;
        heldOrb.position.copy(pos).addScaledVector(dir, 0.12 * grow);
        heldOrb.position.y += 0.05 + bob;
        const radius = 0.05 + 0.2 * grow;
        const squash = 1 + 0.1 * Math.sin(heldT * 17);
        heldOrb.quaternion.identity();
        heldOrb.scale.set(radius / Math.sqrt(squash), radius * squash, radius / Math.sqrt(squash));
        this.heldOrbMat.uniforms.uAge.value = heldT;
        this.heldOrbMat.uniforms.uJiggle.value = 0.6 + 0.6 * grow;
        this.heldOrbMat.uniforms.uCharge.value = grow;
        break;
      }
      case 'vineLash':
        this.emit({
          type: PARTICLE_TYPE.Glow,
          x: pos.x,
          y: pos.y + 0.05,
          z: pos.z,
          size: 0.12 + 0.18 * grow,
          life: 0.045,
          r: 0.25,
          g: 0.8,
          b: 0.18,
        });
    }
  }
  chargeFlash(pos, color, strength) {
    this.emit({
      type: PARTICLE_TYPE.Star,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 0.36 * strength,
      grow: 1.5,
      life: 0.16,
      r: color.r,
      g: color.g,
      b: color.b,
    });
    this.emit({
      type: PARTICLE_TYPE.Shock,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 0.08,
      grow: 5 * strength,
      life: 0.24,
      r: color.r,
      g: color.g,
      b: color.b,
      alpha: 0.8,
    });
    for (let i = 0; i < this.n(8 * strength); i++) {
      const yaw = rand() * ART_TAU;
      const pitch = randRange(-0.8, 1.2);
      const speed = randRange(2, 5) * strength;
      this.emit({
        type: PARTICLE_TYPE.Spark,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: Math.cos(yaw) * Math.cos(pitch) * speed,
        vy: Math.sin(pitch) * speed,
        vz: Math.sin(yaw) * Math.cos(pitch) * speed,
        size: 0.025,
        stretch: 0.04,
        life: 0.3,
        r: color.r * 2,
        g: color.g * 2,
        b: color.b * 2,
        drag: 4,
      });
    }
  }
  chargeParticle(pos, art, level) {
    const angle = rand() * ART_TAU;
    switch (art) {
      case 'fireball':
        if (rand() < 0.8) {
          const radius = randRange(0.02, 0.1 + 0.1 * level);
          this.emit({
            type: PARTICLE_TYPE.Flame,
            x: pos.x + Math.cos(angle) * radius,
            y: pos.y + randRange(-0.05, 0.05),
            z: pos.z + Math.sin(angle) * radius,
            vx: Math.cos(angle) * 0.25,
            vy: randRange(0.8, 1.6) + 0.6 * level,
            vz: Math.sin(angle) * 0.25,
            size: randRange(0.035, 0.06) + 0.045 * level,
            grow: 0.4,
            life: randRange(0.16, 0.28),
            r: 1,
            g: 1,
            b: 1,
            drag: 1.5,
          });
        } else
          this.emit({
            type: PARTICLE_TYPE.Ember,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            vx: randRange(-1.2, 1.2),
            vy: randRange(1.5, 3.5),
            vz: randRange(-1.2, 1.2),
            size: randRange(0.025, 0.045),
            life: randRange(0.4, 0.8),
            r: 2.4,
            g: 0.9,
            b: 0.25,
            gravity: -2,
            drag: 1.2,
          });
        break;
      case 'iceLance': {
        const pitch = randRange(-0.9, 1.1);
        const dist = randRange(0.45, 0.8);
        const life = randRange(0.22, 0.32);
        const dx = Math.cos(angle) * Math.cos(pitch) * dist;
        const dy = Math.sin(pitch) * dist;
        const dz = Math.sin(angle) * Math.cos(pitch) * dist;
        const roll = rand();
        if (roll < 0.55)
          this.emit({
            type: PARTICLE_TYPE.Snow,
            x: pos.x + dx,
            y: pos.y + dy,
            z: pos.z + dz,
            vx: -dx / life,
            vy: -dy / life,
            vz: -dz / life,
            size: randRange(0.035, 0.06),
            life,
            r: 0.7,
            g: 0.9,
            b: 1.2,
            spin: randRange(-6, 6),
          });
        else if (roll < 0.8)
          this.emit({
            type: PARTICLE_TYPE.Shard,
            x: pos.x + dx * 0.5,
            y: pos.y + dy * 0.5,
            z: pos.z + dz * 0.5,
            vx: -dx / life,
            vy: -dy / life,
            vz: -dz / life,
            size: 0.03,
            stretch: 0.025,
            life: life * 0.5,
            r: 1,
            g: 1,
            b: 1,
          });
        else
          this.emit({
            type: PARTICLE_TYPE.Mist,
            x: pos.x + randRange(-0.15, 0.15),
            y: pos.y + randRange(-0.1, 0.1),
            z: pos.z + randRange(-0.15, 0.15),
            vx: randRange(-0.2, 0.2),
            vy: randRange(-0.4, -0.1),
            vz: randRange(-0.2, 0.2),
            size: randRange(0.12, 0.2),
            grow: 2.2,
            life: 0.6,
            r: 0.8,
            g: 0.92,
            b: 1.05,
            alpha: 0.35,
            drag: 2,
          });
        break;
      }
      case 'bounceOrb': {
        const radius = randRange(0.35, 0.6);
        const life = 0.26;
        const dx = Math.cos(angle) * radius;
        const dz = Math.sin(angle) * radius;
        const dy = randRange(-0.3, 0.3);
        const swirlX = -Math.sin(angle) * 2.2;
        const swirlZ = Math.cos(angle) * 2.2;
        if (rand() < 0.7)
          this.emit({
            type: PARTICLE_TYPE.Spark,
            x: pos.x + dx,
            y: pos.y + dy,
            z: pos.z + dz,
            vx: -dx / life + swirlX,
            vy: -dy / life,
            vz: -dz / life + swirlZ,
            size: 0.022,
            stretch: 0.03,
            life,
            r: 2.2,
            g: 1.7,
            b: 0.4,
          });
        else
          this.emit({
            type: PARTICLE_TYPE.Star,
            x: pos.x + dx * 0.6,
            y: pos.y + dy + 0.1,
            z: pos.z + dz * 0.6,
            vy: randRange(0.3, 0.8),
            size: randRange(0.06, 0.1),
            life: 0.3,
            r: 1.6,
            g: 1.3,
            b: 0.4,
          });
        break;
      }
      case 'vineLash': {
        const radius = randRange(0.4, 0.75);
        const life = randRange(0.28, 0.4);
        const dx = Math.cos(angle) * radius;
        const dz = Math.sin(angle) * radius;
        const dy = randRange(-0.35, 0.4);
        const swirlX = -Math.sin(angle) * 1.6;
        const swirlZ = Math.cos(angle) * 1.6;
        if (rand() < 0.65)
          this.emit({
            type: PARTICLE_TYPE.Leaf,
            x: pos.x + dx,
            y: pos.y + dy,
            z: pos.z + dz,
            vx: -dx / life + swirlX,
            vy: -dy / life,
            vz: -dz / life + swirlZ,
            size: randRange(0.05, 0.08),
            life,
            r: 0.28,
            g: randRange(0.62, 0.8),
            b: 0.18,
            spin: randRange(-9, 9),
          });
        else
          this.emit({
            type: PARTICLE_TYPE.Star,
            x: pos.x + dx * 0.4,
            y: pos.y + dy * 0.4,
            z: pos.z + dz * 0.4,
            size: randRange(0.05, 0.09),
            life: 0.3,
            r: 0.8,
            g: 1.8,
            b: 0.6,
          });
        break;
      }
    }
  }
  preview(points, count, color, art, alpha, endPoint, endNormal) {
    const tint = PAINT_COLORS[color];
    this.preview_.mat.uniforms.uDash.value = art === 'iceLance' ? 1.4 : art === 'vineLash' ? 0.7 : 0.9;
    this.preview_.show(points, count, tint, alpha, art === 'iceLance' ? 0.03 : 0.035, this.cam);
    if (endPoint && endNormal) {
      const marker = this.marker;
      marker.visible = true;
      this.markerShown = true;
      marker.position.copy(endPoint).addScaledVector(endNormal, 0.06);
      quatFromDir(endNormal, _alignQuat);
      marker.quaternion.copy(_alignQuat);
      const dist = endPoint.distanceTo(this.cam);
      const pulse = 1 + 0.12 * Math.sin(this.ctx.time.elapsed * 9);
      const radius =
        art === 'fireball'
          ? (FIREBALL.aoe[FIREBALL.aoe.length - 1][0] / 0.5) * 0.5
          : art === 'vineLash' && endNormal.y >= 0.6
            ? (VINE_LASH.thornR / 0.5) * 0.5
            : Math.max(0.5, dist * 0.02);
      marker.scale.setScalar(radius * pulse * 1);
      this.markerMat.color.copy(tint).multiplyScalar(1.6);
      this.markerMat.opacity = 0.55 * alpha;
    }
  }
  fizzle(pos, color) {
    const tint = PAINT_COLORS[color];
    for (let i = 0; i < this.n(7); i++)
      this.emit({
        type: PARTICLE_TYPE.Smoke,
        x: pos.x + randRange(-0.1, 0.1),
        y: pos.y + randRange(-0.05, 0.1),
        z: pos.z + randRange(-0.1, 0.1),
        vx: randRange(-0.8, 0.8),
        vy: randRange(0.5, 1.4),
        vz: randRange(-0.8, 0.8),
        size: randRange(0.12, 0.2),
        grow: 2.6,
        life: randRange(0.6, 0.9),
        r: 0.45,
        g: 0.44,
        b: 0.45,
        alpha: 0.7,
        drag: 2.5,
      });
    for (let i = 0; i < this.n(6); i++)
      this.emit({
        type: PARTICLE_TYPE.Drop,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: randRange(-1, 1),
        vy: randRange(0, 1.5),
        vz: randRange(-1, 1),
        size: randRange(0.02, 0.035),
        life: 0.6,
        r: tint.r * 0.4 + 0.2,
        g: tint.g * 0.4 + 0.2,
        b: tint.b * 0.4 + 0.2,
        gravity: -12,
      });
    this.emit({
      type: PARTICLE_TYPE.Star,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 0.3,
      life: 0.1,
      r: 0.5,
      g: 0.5,
      b: 0.5,
    });
  }
  release(art, pos, dir) {
    const tint = PAINT_COLORS[COLOR_BY_ART[art]];
    const x = pos.x + dir.x * 0.5;
    const y = pos.y + dir.y * 0.5;
    const z = pos.z + dir.z * 0.5;
    this.emit({
      type: PARTICLE_TYPE.Star,
      x,
      y,
      z,
      size: art === 'fireball' ? 0.9 : 0.55,
      grow: 1.5,
      life: 0.12,
      r: tint.r,
      g: tint.g,
      b: tint.b,
    });
    this.emit({
      type: PARTICLE_TYPE.Shock,
      x,
      y,
      z,
      size: 0.12,
      grow: 5,
      life: 0.2,
      r: tint.r,
      g: tint.g,
      b: tint.b,
      alpha: 0.8,
    });
    this.emit({
      type: PARTICLE_TYPE.Glow,
      x,
      y,
      z,
      size: 0.8,
      life: 0.12,
      r: tint.r * 1.2,
      g: tint.g * 1.2,
      b: tint.b * 1.2,
    });
    orthoBasis(dir, _basisU, _basisV);
    const sprayDir = (speed, spread, out) => {
      const angle = rand() * ART_TAU;
      const offset = rand() * spread;
      return out
        .copy(dir)
        .addScaledVector(_basisU, Math.cos(angle) * offset)
        .addScaledVector(_basisV, Math.sin(angle) * offset)
        .normalize()
        .multiplyScalar(speed);
    };
    switch (art) {
      case 'fireball':
        for (let i = 0; i < this.n(12); i++) {
          sprayDir(randRange(3, 9), 0.7, _v1);
          this.emit({
            type: PARTICLE_TYPE.Flame,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            vx: _v1.x,
            vy: _v1.y + 0.5,
            vz: _v1.z,
            size: randRange(0.15, 0.3),
            grow: 1.3,
            life: randRange(0.2, 0.35),
            r: 1,
            g: 1,
            b: 1,
            drag: 5,
          });
        }
        for (let i = 0; i < this.n(4); i++) {
          sprayDir(randRange(1, 2), 1.2, _v1);
          this.emit({
            type: PARTICLE_TYPE.Smoke,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            vx: _v1.x,
            vy: _v1.y + 0.8,
            vz: _v1.z,
            size: randRange(0.2, 0.3),
            grow: 2.5,
            life: randRange(0.7, 1),
            r: 0.25,
            g: 0.22,
            b: 0.2,
            alpha: 0.45,
            drag: 2,
          });
        }
        break;
      case 'iceLance':
        for (let i = 0; i < this.n(14); i++) {
          sprayDir(randRange(4, 12), 0.9, _v1);
          this.emit({
            type: rand() < 0.5 ? PARTICLE_TYPE.Snow : PARTICLE_TYPE.Shard,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            vx: _v1.x,
            vy: _v1.y,
            vz: _v1.z,
            size: randRange(0.03, 0.06),
            stretch: 0.03,
            life: randRange(0.3, 0.5),
            r: 0.8,
            g: 0.95,
            b: 1.2,
            drag: 5,
            spin: randRange(-8, 8),
          });
        }
        this.emit({
          type: PARTICLE_TYPE.Shock,
          x,
          y,
          z,
          size: 0.08,
          grow: 6,
          life: 0.18,
          r: 0.8,
          g: 0.95,
          b: 1.2,
          alpha: 0.6,
        });
        break;
      case 'bounceOrb':
        for (let i = 0; i < this.n(12); i++) {
          sprayDir(randRange(3, 8), 1.1, _v1);
          this.emit({
            type: PARTICLE_TYPE.Spark,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            vx: _v1.x,
            vy: _v1.y,
            vz: _v1.z,
            size: 0.025,
            stretch: 0.03,
            life: randRange(0.2, 0.35),
            r: 2.2,
            g: 1.7,
            b: 0.4,
            drag: 4,
          });
        }
        break;
      case 'vineLash':
        for (let i = 0; i < this.n(10); i++) {
          sprayDir(randRange(2, 6), 1.2, _v1);
          this.emit({
            type: PARTICLE_TYPE.Leaf,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            vx: _v1.x,
            vy: _v1.y + 1,
            vz: _v1.z,
            size: randRange(0.05, 0.08),
            life: randRange(0.5, 0.8),
            r: 0.3,
            g: randRange(0.62, 0.8),
            b: 0.18,
            gravity: -4,
            drag: 3,
            spin: randRange(-10, 10),
          });
        }
    }
  }
  projectile(index, proj) {
    const slot = this.slots[index];
    if (slot.art !== proj.art) {
      this.projectileEnd(index);
      slot.art = proj.art;
      slot.acc = slot.acc2 = slot.acc3 = 0;
    }
    const dt = Math.max(this.ctx.time.dt, 0);
    const pos = proj.pos;
    const vel = proj.vel;
    const speed = vel.length();
    const dir = _v3.copy(vel).divideScalar(speed || 1);
    const quality = this.particles.q;
    switch (proj.art) {
      case 'fireball': {
        const grow = Math.min(1, proj.age * 14);
        this.fires[index].set(pos, dir, FIREBALL.radius * (0.7 + 0.3 * grow), proj.age, Math.min(1.4, speed / 20), 1);
        if (slot.trail < 0) slot.trail = this.trails.begin(0.34, 0.2, 2.6, 0.75, 0.16, 0.85, 0, 0.2);
        this.trails.push(slot.trail, pos);
        this.emit({
          type: PARTICLE_TYPE.Glow,
          x: pos.x,
          y: pos.y,
          z: pos.z,
          size: 0.9,
          life: 0.04,
          r: 0.55,
          g: 0.2,
          b: 0.04,
        });
        if (dt <= 0) break;
        const radius = FIREBALL.radius;
        for (let i = 0, count = Math.round(dt * 150 * quality + rand()); i < count; i++) {
          _v1.set(randRange(-1, 1), randRange(-1, 1), randRange(-1, 1));
          if (_v1.lengthSq() < 0.0001) _v1.set(0, 1, 0);
          _v1.normalize();
          if (_v1.dot(dir) > 0.3) _v1.addScaledVector(dir, -0.6).normalize();
          this.emit({
            type: PARTICLE_TYPE.Flame,
            x: pos.x + _v1.x * radius * 0.85,
            y: pos.y + _v1.y * radius * 0.85,
            z: pos.z + _v1.z * radius * 0.85,
            vx: _v1.x * 1.6 - vel.x * 0.08,
            vy: _v1.y * 1.6 + 0.8 - vel.y * 0.08,
            vz: _v1.z * 1.6 - vel.z * 0.08,
            size: randRange(0.1, 0.17),
            grow: 0.6,
            life: randRange(0.1, 0.18),
            r: 1,
            g: 1,
            b: 1,
            drag: 2,
          });
        }
        for (slot.acc += dt * 60 * quality; slot.acc >= 1;) {
          --slot.acc;
          const back = randRange(0.05, 0.3);
          this.emit({
            type: PARTICLE_TYPE.Flame,
            x: pos.x - dir.x * back + randRange(-0.12, 0.12),
            y: pos.y - dir.y * back + randRange(-0.12, 0.12),
            z: pos.z - dir.z * back + randRange(-0.12, 0.12),
            vx: -vel.x * 0.12 + randRange(-1, 1),
            vy: -vel.y * 0.12 + randRange(0.2, 1.4),
            vz: -vel.z * 0.12 + randRange(-1, 1),
            size: randRange(0.14, 0.26),
            grow: 0.55,
            life: randRange(0.16, 0.3),
            r: 1,
            g: 1,
            b: 1,
            drag: 3,
          });
        }
        for (slot.acc2 += dt * 30 * quality; slot.acc2 >= 1;) {
          --slot.acc2;
          this.emit({
            type: rand() < 0.5 ? PARTICLE_TYPE.Ember : PARTICLE_TYPE.Spark,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            vx: -vel.x * 0.15 + randRange(-2.5, 2.5),
            vy: randRange(-0.5, 3),
            vz: -vel.z * 0.15 + randRange(-2.5, 2.5),
            size: randRange(0.025, 0.05),
            stretch: 0.02,
            life: randRange(0.4, 0.8),
            r: 2.6,
            g: 1,
            b: 0.25,
            gravity: -5,
            drag: 1.2,
          });
        }
        for (slot.acc3 += dt * 14 * quality; slot.acc3 >= 1;) {
          --slot.acc3;
          this.emit({
            type: PARTICLE_TYPE.Smoke,
            x: pos.x - dir.x * 0.5,
            y: pos.y - dir.y * 0.5,
            z: pos.z - dir.z * 0.5,
            vx: randRange(-0.4, 0.4),
            vy: randRange(0.6, 1.4),
            vz: randRange(-0.4, 0.4),
            size: randRange(0.22, 0.34),
            grow: 2.8,
            life: randRange(0.8, 1.3),
            r: 0.2,
            g: 0.18,
            b: 0.17,
            alpha: 0.5,
            drag: 1.5,
            gravity: 0.6,
          });
        }
        break;
      }
      case 'iceLance': {
        const lance = this.lances[index];
        lance.visible = true;
        lance.position.copy(pos);
        quatFromDir(dir, lance.quaternion);
        lance.rotateZ(proj.age * 7);
        const grow = Math.min(1, proj.age * 16);
        lance.scale.set(1.05 * grow, 1.05 * grow, 1.25 * (0.5 + 0.5 * grow));
        if (slot.trail < 0) slot.trail = this.trails.begin(0.14, 0.24, 0.4, 0.75, 1.3, 0.85, 1, 0.3);
        this.trails.push(slot.trail, _v2.copy(pos).addScaledVector(dir, -0.5));
        const tip = _v2.copy(pos).addScaledVector(dir, 1.25);
        this.emit({
          type: PARTICLE_TYPE.Glow,
          x: tip.x,
          y: tip.y,
          z: tip.z,
          size: 0.3,
          life: 0.04,
          r: 0.6,
          g: 0.9,
          b: 1.3,
        });
        const tail = _v2.copy(pos).addScaledVector(dir, -0.7);
        this.emit({
          type: PARTICLE_TYPE.Glow,
          x: tail.x,
          y: tail.y,
          z: tail.z,
          size: 0.45,
          life: 0.04,
          r: 0.3,
          g: 0.55,
          b: 0.9,
        });
        if (dt <= 0) break;
        for (slot.acc += dt * 90 * quality; slot.acc >= 1;) {
          --slot.acc;
          const along = rand();
          _v1.lerpVectors(proj.prev, pos, along);
          this.emit({
            type: rand() < 0.8 ? PARTICLE_TYPE.Snow : PARTICLE_TYPE.Star,
            x: _v1.x + randRange(-0.12, 0.12),
            y: _v1.y + randRange(-0.12, 0.12),
            z: _v1.z + randRange(-0.12, 0.12),
            vx: randRange(-0.7, 0.7) + dir.x * 2,
            vy: randRange(-0.5, 0.6),
            vz: randRange(-0.7, 0.7) + dir.z * 2,
            size: randRange(0.03, 0.06),
            life: randRange(0.35, 0.7),
            r: 0.8,
            g: 0.94,
            b: 1.2,
            drag: 2.5,
            gravity: -0.6,
            spin: randRange(-5, 5),
          });
        }
        for (slot.acc2 += dt * 14 * quality; slot.acc2 >= 1;) {
          --slot.acc2;
          _v1.lerpVectors(proj.prev, pos, rand()).addScaledVector(dir, -0.8);
          this.emit({
            type: PARTICLE_TYPE.Mist,
            x: _v1.x,
            y: _v1.y,
            z: _v1.z,
            vx: randRange(-0.3, 0.3),
            vy: randRange(-0.2, 0.3),
            vz: randRange(-0.3, 0.3),
            size: randRange(0.1, 0.18),
            grow: 2.6,
            life: randRange(0.3, 0.5),
            r: 0.82,
            g: 0.93,
            b: 1.05,
            alpha: 0.2,
            drag: 2,
          });
        }
        break;
      }
      case 'bounceOrb': {
        const orb = this.orbs[index];
        const mat = this.orbMats[index];
        orb.visible = true;
        orb.position.copy(pos);
        const sinceBounce = proj.lastBounce >= 0 ? proj.age - proj.lastBounce : 9;
        const wobble = Math.exp(-sinceBounce * 11) * Math.cos(sinceBounce * 38);
        const stretch = 1 + Math.min(0.28, speed * 0.012);
        const radius = 0.3 * proj.size * Math.min(1, 0.4 + proj.age * 8);
        quatFromDir(dir, orb.quaternion);
        const lenScale = stretch * (1 - 0.32 * wobble);
        const widthScale = (1 + 0.2 * wobble) / Math.sqrt(stretch);
        orb.scale.set(radius * widthScale, radius * widthScale, radius * lenScale);
        mat.uniforms.uAge.value = proj.age;
        mat.uniforms.uJiggle.value = 0.35 + 1.6 * Math.exp(-sinceBounce * 5);
        mat.uniforms.uCharge.value = Math.max(0, 1 - sinceBounce * 3);
        if (slot.trail < 0) slot.trail = this.trails.begin(0.2, 0.3, 1.9, 1.4, 0.3, 0.85, 2, 0.2);
        this.trails.push(slot.trail, pos);
        this.emit({
          type: PARTICLE_TYPE.Glow,
          x: pos.x,
          y: pos.y,
          z: pos.z,
          size: 0.6 * proj.size,
          life: 0.04,
          r: 0.45,
          g: 0.32,
          b: 0.06,
        });
        if (dt <= 0) break;
        for (slot.acc += dt * 22 * quality; slot.acc >= 1;) {
          --slot.acc;
          const angle = rand() * ART_TAU;
          this.emit({
            type: rand() < 0.55 ? PARTICLE_TYPE.Star : PARTICLE_TYPE.Spark,
            x: pos.x + Math.cos(angle) * radius,
            y: pos.y + randRange(-radius, radius),
            z: pos.z + Math.sin(angle) * radius,
            vx: Math.cos(angle) * 1.2 - vel.x * 0.1,
            vy: randRange(0.2, 1.5),
            vz: Math.sin(angle) * 1.2 - vel.z * 0.1,
            size: randRange(0.04, 0.09),
            stretch: 0.03,
            life: randRange(0.3, 0.5),
            r: 2,
            g: 1.6,
            b: 0.4,
            drag: 2,
            gravity: -2,
          });
        }
        break;
      }
    }
  }
  projectileEnd(index) {
    const slot = this.slots[index];
    this.fires[index].hide();
    this.lances[index].visible = false;
    this.orbs[index].visible = false;
    if (slot.trail >= 0) this.trails.end(slot.trail);
    slot.trail = -1;
    slot.art = null;
  }
  explode(pos, hitNormal, water, enemyHit, scale = 1) {
    const normal = hitNormal;
    const onGround = normal.y > 0.55;
    const density = (water ? 0.35 : 1) * (scale > 1 ? 1.35 : 1);
    const cy = pos.y + 0.35;
    const spread = Math.sqrt(scale);
    this.emit({
      type: PARTICLE_TYPE.Glow,
      x: pos.x,
      y: cy + 0.3,
      z: pos.z,
      size: 4 * scale,
      life: 0.13,
      r: 1.4,
      g: 0.5,
      b: 0.1,
    });
    this.emit({
      type: PARTICLE_TYPE.Star,
      x: pos.x,
      y: cy + 0.2,
      z: pos.z,
      size: 2.6 * spread,
      grow: 1.3,
      life: 0.1,
      r: 1.8,
      g: 0.85,
      b: 0.25,
    });
    this.emit({
      type: PARTICLE_TYPE.Shock,
      x: pos.x,
      y: cy + 0.3,
      z: pos.z,
      size: 0.6,
      grow: 10 * scale,
      life: 0.28,
      r: 1.6,
      g: 0.75,
      b: 0.25,
      alpha: 0.85,
    });
    if (onGround) {
      this.emit({
        type: PARTICLE_TYPE.Ring,
        x: pos.x,
        y: pos.y + 0.1,
        z: pos.z,
        size: 0.5,
        grow: 8 * scale,
        life: 0.32,
        r: 1.8,
        g: 0.8,
        b: 0.25,
        alpha: 1,
      });
      this.emit({
        type: PARTICLE_TYPE.Ring,
        x: pos.x,
        y: pos.y + 0.08,
        z: pos.z,
        size: 0.4,
        grow: 9.5 * scale,
        life: 0.6,
        r: 0.8,
        g: 0.35,
        b: 0.12,
        alpha: 0.55,
      });
    }
    const axis = _basisU
      .copy(normal)
      .lerp(_basisV.set(0, 1, 0), 0.5)
      .normalize();
    const burstDir = (speed, out) => {
      out.set(randRange(-1, 1), randRange(-1, 1), randRange(-1, 1));
      if (out.lengthSq() < 0.0001) out.set(0, 1, 0);
      out.normalize();
      if (out.dot(axis) < 0) out.addScaledVector(axis, -2 * out.dot(axis));
      out.addScaledVector(axis, 0.25).normalize();
      return out.multiplyScalar(speed);
    };
    for (let i = 0; i < this.n(12 * density); i++) {
      burstDir(randRange(0.2, 1.1), _v1);
      this.emit({
        type: PARTICLE_TYPE.Flame,
        x: pos.x + _v1.x * 0.6,
        y: cy + _v1.y * 0.5,
        z: pos.z + _v1.z * 0.6,
        vx: _v1.x * 2,
        vy: _v1.y * 2 + 1.6,
        vz: _v1.z * 2,
        size: randRange(0.55, 0.9),
        grow: 1.45,
        life: randRange(0.3, 0.52),
        r: 1,
        g: 1,
        b: 1,
        drag: 3,
      });
    }
    for (let i = 0; i < this.n(26 * density); i++) {
      burstDir(randRange(7, 15) * spread, _v1);
      this.emit({
        type: PARTICLE_TYPE.Flame,
        x: pos.x + _v1.x * 0.03,
        y: cy + _v1.y * 0.03,
        z: pos.z + _v1.z * 0.03,
        vx: _v1.x,
        vy: _v1.y * 0.7 + 1.2,
        vz: _v1.z,
        size: randRange(0.26, 0.46),
        grow: 1.5,
        life: randRange(0.3, 0.55),
        r: 1,
        g: 1,
        b: 1,
        drag: 5.5,
        gravity: 3,
      });
    }
    for (let i = 0; i < this.n(34); i++) {
      burstDir(randRange(6, 16), _v1);
      const spark = rand() < 0.55;
      this.emit({
        type: spark ? PARTICLE_TYPE.Spark : PARTICLE_TYPE.Ember,
        x: pos.x,
        y: cy,
        z: pos.z,
        vx: _v1.x,
        vy: _v1.y + 3,
        vz: _v1.z,
        size: spark ? randRange(0.03, 0.05) : randRange(0.04, 0.08),
        stretch: 0.025,
        life: randRange(0.6, 1.3),
        r: 2.2,
        g: 0.85,
        b: 0.22,
        gravity: -13,
        drag: 0.9,
        floor: pos.y - 3,
      });
    }
    for (let i = 0; i < this.n(12); i++) {
      burstDir(randRange(3, 7), _v1);
      this.emit({
        type: PARTICLE_TYPE.Drop,
        x: pos.x,
        y: cy,
        z: pos.z,
        vx: _v1.x,
        vy: _v1.y + 2,
        vz: _v1.z,
        size: randRange(0.05, 0.1),
        life: 1.1,
        r: PAINT_COLORS.red.r,
        g: PAINT_COLORS.red.g,
        b: PAINT_COLORS.red.b,
        gravity: -15,
        drag: 0.5,
        floor: pos.y - 2,
      });
    }
    for (let i = 0; i < this.n(14); i++) {
      burstDir(randRange(1, 3.5), _v1);
      this.emit({
        type: PARTICLE_TYPE.Smoke,
        x: pos.x + _v1.x * 0.25,
        y: cy + 0.2 + rand() * 0.6,
        z: pos.z + _v1.z * 0.25,
        vx: _v1.x * 0.8,
        vy: randRange(1.2, 3),
        vz: _v1.z * 0.8,
        size: randRange(0.55, 0.95),
        grow: 2.8,
        life: randRange(1.4, 2.3),
        r: water ? 0.9 : 0.2,
        g: water ? 0.92 : 0.18,
        b: water ? 0.95 : 0.17,
        alpha: water ? 0.5 : 0.62,
        drag: 1.4,
        gravity: 0.8,
      });
    }
    if (water) {
      for (let i = 0; i < this.n(24); i++) {
        const angle = rand() * ART_TAU;
        const speed = randRange(1.5, 5);
        this.emit({
          type: PARTICLE_TYPE.Drop,
          x: pos.x,
          y: pos.y + 0.05,
          z: pos.z,
          vx: Math.cos(angle) * speed,
          vy: randRange(3, 8),
          vz: Math.sin(angle) * speed,
          size: randRange(0.04, 0.08),
          life: 1,
          r: 0.85,
          g: 0.95,
          b: 1,
          gravity: -14,
          floor: pos.y - 0.05,
        });
      }
      for (let i = 0; i < this.n(16); i++)
        this.emit({
          type: PARTICLE_TYPE.Mist,
          x: pos.x + randRange(-1, 1),
          y: pos.y + randRange(0, 0.6),
          z: pos.z + randRange(-1, 1),
          vx: randRange(-0.5, 0.5),
          vy: randRange(1, 2.5),
          vz: randRange(-0.5, 0.5),
          size: randRange(0.5, 0.8),
          grow: 2.4,
          life: randRange(1, 1.6),
          r: 1,
          g: 1,
          b: 1,
          alpha: 0.55,
          drag: 1,
        });
      this.emit({
        type: PARTICLE_TYPE.Ring,
        x: pos.x,
        y: pos.y + 0.03,
        z: pos.z,
        size: 0.5,
        grow: 8,
        life: 0.9,
        r: 0.9,
        g: 0.97,
        b: 1,
        alpha: 0.7,
      });
    }
  }
  lancePierce(pos, vel) {
    const dir = _v3.copy(vel).normalize();
    this.emit({
      type: PARTICLE_TYPE.Star,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 1.2,
      grow: 1.5,
      life: 0.14,
      r: 0.7,
      g: 0.95,
      b: 1.4,
    });
    this.emit({
      type: PARTICLE_TYPE.Shock,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 0.2,
      grow: 7,
      life: 0.24,
      r: 0.7,
      g: 0.95,
      b: 1.4,
      alpha: 0.9,
    });
    for (let i = 0; i < this.n(14); i++) {
      _v1
        .set(randRange(-1, 1), randRange(-0.6, 1), randRange(-1, 1))
        .normalize()
        .multiplyScalar(randRange(2, 6))
        .addScaledVector(dir, randRange(2, 8));
      this.emit({
        type: PARTICLE_TYPE.Shard,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: _v1.x,
        vy: _v1.y,
        vz: _v1.z,
        size: randRange(0.06, 0.12),
        stretch: 0.02,
        life: randRange(0.5, 0.9),
        r: 1,
        g: 1,
        b: 1,
        gravity: -14,
        drag: 0.8,
        floor: pos.y - 2.5,
      });
    }
    for (let i = 0; i < this.n(12); i++)
      this.emit({
        type: PARTICLE_TYPE.Snow,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: randRange(-3, 3) + dir.x * 3,
        vy: randRange(-1, 3),
        vz: randRange(-3, 3) + dir.z * 3,
        size: randRange(0.04, 0.07),
        life: randRange(0.5, 0.9),
        r: 0.8,
        g: 0.95,
        b: 1.2,
        drag: 3,
        gravity: -1,
        spin: randRange(-6, 6),
      });
    for (let i = 0; i < this.n(4); i++)
      this.emit({
        type: PARTICLE_TYPE.Mist,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: randRange(-1, 1),
        vy: randRange(0, 1),
        vz: randRange(-1, 1),
        size: randRange(0.3, 0.5),
        grow: 2.2,
        life: 0.6,
        r: 0.85,
        g: 0.95,
        b: 1.05,
        alpha: 0.45,
        drag: 2.5,
      });
  }
  lanceShatter(pos, normal, vel, water, midair) {
    const dir = _v3.copy(vel).normalize();
    this.emit({
      type: PARTICLE_TYPE.Star,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: midair ? 0.9 : 1.5,
      grow: 1.5,
      life: 0.16,
      r: 0.75,
      g: 0.95,
      b: 1.4,
    });
    this.emit({
      type: PARTICLE_TYPE.Glow,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 2.2,
      life: 0.2,
      r: 0.6,
      g: 0.9,
      b: 1.5,
    });
    this.emit({
      type: PARTICLE_TYPE.Shock,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 0.2,
      grow: 8,
      life: 0.26,
      r: 0.75,
      g: 0.95,
      b: 1.4,
      alpha: 0.9,
    });
    if (normal.y > 0.55)
      this.emit({
        type: PARTICLE_TYPE.Ring,
        x: pos.x,
        y: pos.y + 0.05,
        z: pos.z,
        size: 0.4,
        grow: 6,
        life: 0.55,
        r: 0.85,
        g: 0.97,
        b: 1.2,
        alpha: 0.85,
      });
    const reflected = _v2
      .copy(dir)
      .addScaledVector(normal, -2 * dir.dot(normal))
      .normalize();
    for (let i = 0; i < this.n(midair ? 14 : 26); i++) {
      _v1.set(randRange(-1, 1), randRange(-1, 1), randRange(-1, 1)).normalize();
      if (_v1.dot(normal) < 0) _v1.addScaledVector(normal, -2 * _v1.dot(normal));
      _v1
        .multiplyScalar(randRange(2, 7))
        .addScaledVector(reflected, randRange(1, 5))
        .addScaledVector(dir, midair ? randRange(2, 6) : 0);
      this.emit({
        type: PARTICLE_TYPE.Shard,
        x: pos.x + normal.x * 0.1,
        y: pos.y + normal.y * 0.1,
        z: pos.z + normal.z * 0.1,
        vx: _v1.x,
        vy: _v1.y + 1.5,
        vz: _v1.z,
        size: randRange(0.06, 0.15),
        stretch: 0.018,
        life: randRange(0.6, 1.2),
        r: 1,
        g: 1,
        b: 1,
        gravity: -15,
        drag: 0.7,
        floor: pos.y - (midair ? 6 : 0.1),
      });
    }
    for (let i = 0; i < this.n(18); i++)
      this.emit({
        type: PARTICLE_TYPE.Snow,
        x: pos.x,
        y: pos.y + 0.1,
        z: pos.z,
        vx: randRange(-2.5, 2.5),
        vy: randRange(0, 3),
        vz: randRange(-2.5, 2.5),
        size: randRange(0.04, 0.07),
        life: randRange(0.6, 1.1),
        r: 0.8,
        g: 0.95,
        b: 1.2,
        drag: 2.5,
        gravity: -1.2,
        spin: randRange(-6, 6),
      });
    for (let i = 0; i < this.n(7); i++)
      this.emit({
        type: PARTICLE_TYPE.Mist,
        x: pos.x + randRange(-0.3, 0.3),
        y: pos.y + randRange(0, 0.3),
        z: pos.z + randRange(-0.3, 0.3),
        vx: randRange(-1.2, 1.2),
        vy: randRange(0.2, 1),
        vz: randRange(-1.2, 1.2),
        size: randRange(0.35, 0.6),
        grow: 2.4,
        life: randRange(0.7, 1.1),
        r: 0.85,
        g: 0.95,
        b: 1.05,
        alpha: 0.45,
        drag: 2,
      });
    if (water)
      for (let i = 0; i < this.n(14); i++) {
        const angle = rand() * ART_TAU;
        const speed = randRange(1, 3.5);
        this.emit({
          type: PARTICLE_TYPE.Drop,
          x: pos.x,
          y: pos.y + 0.05,
          z: pos.z,
          vx: Math.cos(angle) * speed,
          vy: randRange(2, 5),
          vz: Math.sin(angle) * speed,
          size: randRange(0.03, 0.06),
          life: 0.8,
          r: 0.85,
          g: 0.95,
          b: 1,
          gravity: -14,
          floor: pos.y - 0.05,
        });
      }
  }
  lanceSkim(pos) {
    this.emit({
      type: PARTICLE_TYPE.Ring,
      x: pos.x,
      y: pos.y + 0.04,
      z: pos.z,
      size: 0.3,
      grow: 6,
      life: 0.6,
      r: 0.85,
      g: 0.97,
      b: 1.2,
      alpha: 0.8,
    });
    for (let i = 0; i < this.n(8); i++)
      this.emit({
        type: PARTICLE_TYPE.Snow,
        x: pos.x + randRange(-0.5, 0.5),
        y: pos.y + 0.1,
        z: pos.z + randRange(-0.5, 0.5),
        vx: randRange(-1.5, 1.5),
        vy: randRange(0.5, 2.5),
        vz: randRange(-1.5, 1.5),
        size: randRange(0.04, 0.07),
        life: randRange(0.5, 0.9),
        r: 0.85,
        g: 0.96,
        b: 1.2,
        drag: 2,
        gravity: -2,
        spin: randRange(-6, 6),
      });
    for (let i = 0; i < this.n(3); i++)
      this.emit({
        type: PARTICLE_TYPE.Mist,
        x: pos.x + randRange(-0.6, 0.6),
        y: pos.y + 0.2,
        z: pos.z + randRange(-0.6, 0.6),
        vx: randRange(-0.5, 0.5),
        vy: randRange(0.3, 0.9),
        vz: randRange(-0.5, 0.5),
        size: randRange(0.4, 0.6),
        grow: 2,
        life: 0.9,
        r: 0.9,
        g: 0.97,
        b: 1.05,
        alpha: 0.45,
        drag: 1.5,
      });
  }
  orbBounce(pos, normal, size, water, hitEnemy, bounces) {
    const yellow = PAINT_COLORS.yellow;
    const power = 0.8 + 0.15 * bounces;
    this.emit({
      type: PARTICLE_TYPE.Star,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 0.9 * size * power,
      grow: 1.5,
      life: 0.13,
      r: 2,
      g: 1.6,
      b: 0.5,
    });
    this.emit({
      type: PARTICLE_TYPE.Glow,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 1.6 * size,
      life: 0.14,
      r: 1.8,
      g: 1.3,
      b: 0.3,
    });
    if (normal.y > 0.55 && !hitEnemy) {
      this.emit({
        type: PARTICLE_TYPE.Ring,
        x: pos.x,
        y: pos.y + 0.05,
        z: pos.z,
        size: 0.25,
        grow: 5 + bounces,
        life: 0.4,
        r: yellow.r * 1.6,
        g: yellow.g * 1.6,
        b: yellow.b * 1.6,
        alpha: 0.95,
      });
      this.emit({
        type: PARTICLE_TYPE.Ring,
        x: pos.x,
        y: pos.y + 0.04,
        z: pos.z,
        size: 0.2,
        grow: 9 + bounces * 1.5,
        life: 0.55,
        r: 1.2,
        g: 1.1,
        b: 0.7,
        alpha: 0.5,
      });
    } else
      this.emit({
        type: PARTICLE_TYPE.Shock,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        size: 0.2,
        grow: 6 + bounces,
        life: 0.26,
        r: 2,
        g: 1.6,
        b: 0.5,
        alpha: 0.9,
      });
    orthoBasis(normal, _basisU, _basisV);
    for (let i = 0; i < this.n(14 + bounces * 2); i++) {
      const angle = (i / 14) * ART_TAU + rand() * 0.4;
      const speed = randRange(3, 6) * power;
      _v1
        .copy(_basisU)
        .multiplyScalar(Math.cos(angle) * speed)
        .addScaledVector(_basisV, Math.sin(angle) * speed)
        .addScaledVector(normal, randRange(1.5, 4));
      this.emit({
        type: PARTICLE_TYPE.Spark,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: _v1.x,
        vy: _v1.y,
        vz: _v1.z,
        size: 0.03,
        stretch: 0.03,
        life: randRange(0.25, 0.45),
        r: 2.4,
        g: 1.9,
        b: 0.5,
        drag: 3,
        gravity: -6,
      });
    }
    for (let i = 0; i < this.n(6); i++) {
      _v1.set(randRange(-2, 2), randRange(2, 5), randRange(-2, 2));
      this.emit({
        type: PARTICLE_TYPE.Drop,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: _v1.x,
        vy: _v1.y,
        vz: _v1.z,
        size: randRange(0.04, 0.07),
        life: 0.8,
        r: yellow.r,
        g: yellow.g,
        b: yellow.b,
        gravity: -14,
        floor: pos.y - 2,
      });
    }
    if (water) {
      for (let i = 0; i < this.n(12); i++) {
        const angle = rand() * ART_TAU;
        const speed = randRange(1, 3);
        this.emit({
          type: PARTICLE_TYPE.Drop,
          x: pos.x,
          y: pos.y + 0.05,
          z: pos.z,
          vx: Math.cos(angle) * speed,
          vy: randRange(2, 5),
          vz: Math.sin(angle) * speed,
          size: randRange(0.03, 0.06),
          life: 0.8,
          r: 0.85,
          g: 0.95,
          b: 1,
          gravity: -14,
          floor: pos.y - 0.05,
        });
      }
      this.emit({
        type: PARTICLE_TYPE.Ring,
        x: pos.x,
        y: pos.y + 0.03,
        z: pos.z,
        size: 0.3,
        grow: 6,
        life: 0.8,
        r: 0.9,
        g: 0.97,
        b: 1,
        alpha: 0.6,
      });
    }
  }
  orbPop(pos, size) {
    const yellow = PAINT_COLORS.yellow;
    this.emit({
      type: PARTICLE_TYPE.Star,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 1.4 * size,
      grow: 1.6,
      life: 0.18,
      r: 2.2,
      g: 1.8,
      b: 0.6,
    });
    this.emit({
      type: PARTICLE_TYPE.Glow,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 2.4 * size,
      life: 0.2,
      r: 2,
      g: 1.5,
      b: 0.35,
    });
    this.emit({
      type: PARTICLE_TYPE.Shock,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 0.3,
      grow: 8,
      life: 0.3,
      r: 2,
      g: 1.6,
      b: 0.5,
      alpha: 0.9,
    });
    for (let i = 0; i < this.n(26); i++) {
      _v1.set(randRange(-1, 1), randRange(-0.3, 1), randRange(-1, 1)).normalize().multiplyScalar(randRange(3, 8));
      this.emit({
        type: rand() < 0.5 ? PARTICLE_TYPE.Star : PARTICLE_TYPE.Spark,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: _v1.x,
        vy: _v1.y + 1,
        vz: _v1.z,
        size: randRange(0.05, 0.1),
        stretch: 0.03,
        life: randRange(0.4, 0.7),
        r: 2.2,
        g: 1.8,
        b: 0.5,
        drag: 2.5,
        gravity: -5,
      });
    }
    for (let i = 0; i < this.n(10); i++) {
      _v1.set(randRange(-1, 1), randRange(0.2, 1), randRange(-1, 1)).normalize().multiplyScalar(randRange(2, 6));
      this.emit({
        type: PARTICLE_TYPE.Drop,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: _v1.x,
        vy: _v1.y + 1,
        vz: _v1.z,
        size: randRange(0.05, 0.09),
        life: 1,
        r: yellow.r,
        g: yellow.g,
        b: yellow.b,
        gravity: -15,
        floor: pos.y - 3,
      });
    }
  }
  vine(index, vine) {
    const mesh = this.vines[index];
    const age = vine.age;
    let amp;
    let sag;
    let flash = 0;
    let thick = 1;
    let fade = 1;
    const phase = age * 46;
    if (vine.phase === 0) {
      amp = 0.55 * Math.exp(-age * 5) + 0.12;
      sag = 0;
    } else if (vine.phase === 1) {
      const phaseT = vine.phaseT;
      amp = 0.18 * Math.exp(-phaseT * 9) + 0.035 * Math.sin(phaseT * 55) * (vine.kind === 'enemy' ? 1 : 0.4);
      sag = 0.05;
      flash = Math.exp(-phaseT * 12) * 0.9;
      thick = 1 + 0.25 * Math.exp(-phaseT * 10);
    } else {
      const retract = Math.min(1, vine.phaseT / VINE_LASH.retract);
      amp = 0.1 + 0.3 * retract;
      sag = 0.1 + 0.9 * retract * (1 - retract) * 2;
      thick = 1 - 0.35 * retract;
      fade = retract > 0.6 ? 1 - ((retract - 0.6) / 0.4) * 0.9 : 1;
    }
    const len = vine.origin.distanceTo(vine.tip);
    amp *= Math.min(1, len / 4);
    mesh.set(vine.origin, vine.tip, amp, phase, sag, Math.min(1, age * 6), thick, fade, flash);
    const dt = Math.max(0, this.ctx.time.dt);
    if (vine.phase === 0 && dt > 0) {
      for (this.vineAcc[index] += dt * 60 * this.particles.q; this.vineAcc[index] >= 1;) {
        --this.vineAcc[index];
        mesh.pointAt(randRange(0.2, 1), _v1);
        this.emit({
          type: PARTICLE_TYPE.Leaf,
          x: _v1.x,
          y: _v1.y,
          z: _v1.z,
          vx: randRange(-1.5, 1.5),
          vy: randRange(0, 2),
          vz: randRange(-1.5, 1.5),
          size: randRange(0.05, 0.08),
          life: randRange(0.7, 1.2),
          r: 0.3,
          g: randRange(0.6, 0.8),
          b: 0.18,
          gravity: -3.5,
          drag: 2.5,
          spin: randRange(-10, 10),
        });
      }
      this.emit({
        type: PARTICLE_TYPE.Glow,
        x: vine.tip.x,
        y: vine.tip.y,
        z: vine.tip.z,
        size: 0.6,
        life: 0.04,
        r: 0.5,
        g: 1.4,
        b: 0.35,
      });
    }
  }
  vineEnd(index) {
    this.vines[index].hide();
  }
  vineGrab(pos, dir) {
    const green = PAINT_COLORS.green;
    this.emit({
      type: PARTICLE_TYPE.Star,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 1.3,
      grow: 1.5,
      life: 0.15,
      r: 0.9,
      g: 2,
      b: 0.6,
    });
    this.emit({
      type: PARTICLE_TYPE.Shock,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      size: 0.25,
      grow: 7,
      life: 0.26,
      r: 0.9,
      g: 2,
      b: 0.6,
      alpha: 0.9,
    });
    for (let i = 0; i < this.n(18); i++) {
      _v1
        .set(randRange(-1, 1), randRange(-0.3, 1), randRange(-1, 1))
        .normalize()
        .multiplyScalar(randRange(2, 6))
        .addScaledVector(dir, -2);
      this.emit({
        type: PARTICLE_TYPE.Leaf,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: _v1.x,
        vy: _v1.y + 1,
        vz: _v1.z,
        size: randRange(0.06, 0.1),
        life: randRange(0.8, 1.3),
        r: 0.3,
        g: randRange(0.6, 0.82),
        b: 0.18,
        gravity: -5,
        drag: 2,
        spin: randRange(-12, 12),
      });
    }
    for (let i = 0; i < this.n(8); i++) {
      _v1.set(randRange(-1, 1), randRange(0, 1), randRange(-1, 1)).normalize().multiplyScalar(randRange(2, 5));
      this.emit({
        type: PARTICLE_TYPE.Drop,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: _v1.x,
        vy: _v1.y + 1,
        vz: _v1.z,
        size: randRange(0.04, 0.07),
        life: 0.9,
        r: green.r,
        g: green.g,
        b: green.b,
        gravity: -14,
      });
    }
  }
  vineWall(pos, normal) {
    this.emit({
      type: PARTICLE_TYPE.Star,
      x: pos.x + normal.x * 0.2,
      y: pos.y,
      z: pos.z + normal.z * 0.2,
      size: 1.1,
      grow: 1.4,
      life: 0.14,
      r: 0.9,
      g: 2,
      b: 0.6,
    });
    for (let i = 0; i < this.n(10); i++)
      this.emit({
        type: PARTICLE_TYPE.Smoke,
        x: pos.x + normal.x * 0.2,
        y: pos.y,
        z: pos.z + normal.z * 0.2,
        vx: normal.x * randRange(0.5, 2) + randRange(-0.8, 0.8),
        vy: randRange(-0.3, 0.8),
        vz: normal.z * randRange(0.5, 2) + randRange(-0.8, 0.8),
        size: randRange(0.2, 0.35),
        grow: 2.2,
        life: randRange(0.5, 0.8),
        r: 0.62,
        g: 0.56,
        b: 0.46,
        alpha: 0.5,
        drag: 3,
      });
  }
  ladderDab(pos, normal, index) {
    for (let i = 0; i < this.n(3); i++)
      this.emit({
        type: PARTICLE_TYPE.Leaf,
        x: pos.x + normal.x * 0.15 + randRange(-0.35, 0.35),
        y: pos.y + randRange(-0.2, 0.2),
        z: pos.z + normal.z * 0.15 + randRange(-0.35, 0.35),
        vx: normal.x * randRange(1, 2.5) + randRange(-0.6, 0.6),
        vy: randRange(0.5, 2),
        vz: normal.z * randRange(1, 2.5) + randRange(-0.6, 0.6),
        size: randRange(0.06, 0.1),
        life: randRange(0.7, 1.1),
        r: 0.3,
        g: randRange(0.62, 0.85),
        b: 0.18,
        gravity: -4,
        drag: 2.5,
        spin: randRange(-10, 10),
      });
    if (index % 2 == 0)
      this.emit({
        type: PARTICLE_TYPE.Star,
        x: pos.x + normal.x * 0.25,
        y: pos.y,
        z: pos.z + normal.z * 0.25,
        size: randRange(0.25, 0.4),
        grow: 1.3,
        life: 0.2,
        r: 0.8,
        g: 1.8,
        b: 0.5,
      });
  }
  vineWater(pos) {
    for (let i = 0; i < this.n(14); i++) {
      const angle = rand() * ART_TAU;
      const speed = randRange(1, 3);
      this.emit({
        type: PARTICLE_TYPE.Drop,
        x: pos.x,
        y: pos.y + 0.05,
        z: pos.z,
        vx: Math.cos(angle) * speed,
        vy: randRange(2, 5),
        vz: Math.sin(angle) * speed,
        size: randRange(0.03, 0.06),
        life: 0.8,
        r: 0.85,
        g: 0.95,
        b: 1,
        gravity: -14,
        floor: pos.y - 0.05,
      });
    }
    this.emit({
      type: PARTICLE_TYPE.Ring,
      x: pos.x,
      y: pos.y + 0.03,
      z: pos.z,
      size: 0.3,
      grow: 6,
      life: 0.8,
      r: 0.9,
      g: 0.97,
      b: 1,
      alpha: 0.6,
    });
  }
  thornsStart(index, zone) {
    if (index < 0 || index >= 8) return;
    const seeds = this.thornSeeds[index];
    seeds.length = 0;
    for (let i = 0; i < 18; i++) {
      const ring = i < 4 ? 0 : i < 10 ? 1 : 2;
      const angle = (i / (ring === 0 ? 4 : ring === 1 ? 6 : 8)) * ART_TAU + rand() * 0.6;
      const dist = ring === 0 ? randRange(0.1, 0.45) : ring === 1 ? randRange(0.7, 1.1) : randRange(1.3, 1.9);
      seeds.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        tilt: 0.12 + ring * 0.2 + rand() * 0.18,
        yaw: -angle + randRange(-0.5, 0.5),
        s: ring === 0 ? randRange(1.6, 2.1) : ring === 1 ? randRange(1.15, 1.5) : randRange(0.8, 1.1),
        delay: ring * 0.06 + rand() * 0.05,
      });
    }
    const center = zone.center;
    this.emit({
      type: PARTICLE_TYPE.Ring,
      x: center.x,
      y: center.y + 0.06,
      z: center.z,
      size: 0.4,
      grow: 5.5,
      life: 0.5,
      r: 0.7,
      g: 1.6,
      b: 0.4,
      alpha: 0.9,
    });
    this.emit({
      type: PARTICLE_TYPE.Star,
      x: center.x,
      y: center.y + 0.3,
      z: center.z,
      size: 1.2,
      grow: 1.4,
      life: 0.15,
      r: 0.9,
      g: 2,
      b: 0.6,
    });
    for (let i = 0; i < this.n(12); i++) {
      const angle = rand() * ART_TAU;
      const speed = randRange(1, 3);
      this.emit({
        type: PARTICLE_TYPE.Smoke,
        x: center.x + Math.cos(angle) * 0.5,
        y: center.y + 0.1,
        z: center.z + Math.sin(angle) * 0.5,
        vx: Math.cos(angle) * speed,
        vy: randRange(0.3, 1),
        vz: Math.sin(angle) * speed,
        size: randRange(0.25, 0.4),
        grow: 2.2,
        life: randRange(0.6, 0.9),
        r: 0.6,
        g: 0.52,
        b: 0.4,
        alpha: 0.45,
        drag: 3,
      });
    }
    for (let i = 0; i < this.n(16); i++) {
      const angle = rand() * ART_TAU;
      const speed = randRange(1.5, 4);
      this.emit({
        type: PARTICLE_TYPE.Leaf,
        x: center.x,
        y: center.y + 0.2,
        z: center.z,
        vx: Math.cos(angle) * speed,
        vy: randRange(2, 5),
        vz: Math.sin(angle) * speed,
        size: randRange(0.06, 0.1),
        life: randRange(0.8, 1.3),
        r: 0.3,
        g: randRange(0.6, 0.82),
        b: 0.18,
        gravity: -6,
        drag: 1.5,
        spin: randRange(-10, 10),
        floor: center.y + 0.02,
      });
    }
  }
  thorns(index, zone) {
    if (index < 0 || index >= 8) return;
    const seeds = this.thornSeeds[index];
    if (!seeds.length) this.thornsStart(index, zone);
    this.thornDrawn[index] = true;
    const age = zone.age;
    const fade = Math.min(1, Math.max(0, (zone.life - age) / 0.55));
    const elapsed = this.ctx.time.elapsed;
    const normal = zone.normal;
    _alignQuat.setFromUnitVectors(_yAxis, normal);
    for (let i = 0; i < 18; i++) {
      const seed = seeds[i];
      const grow = Math.min(1, Math.max(0, (age - seed.delay) / 0.2));
      const pop = grow <= 0 ? 0 : 1 - (1 - grow) ** 3 + Math.sin(grow * Math.PI) * 0.3;
      const scale = seed.s * pop * (0.35 + 0.65 * fade);
      _basisV.set(seed.x, 0, seed.z).applyQuaternion(_alignQuat);
      _v1
        .copy(zone.center)
        .add(_basisV)
        .addScaledVector(normal, -0.12 - (1 - fade) * 0.4);
      _yawQuat.setFromAxisAngle(_yAxis, seed.yaw);
      _tiltQuat.setFromAxisAngle(_zAxis, -(seed.tilt + Math.sin(elapsed * 2.2 + i * 1.7) * 0.05));
      _thornQuat.copy(_alignQuat).multiply(_yawQuat).multiply(_tiltQuat);
      _thornMatrix.compose(_v1, _thornQuat, _thornScale.setScalar(Math.max(0, scale)));
      this.thornMesh.setMatrixAt(index * 18 + i, _thornMatrix);
    }
  }
  thornSting(pos) {
    for (let i = 0; i < this.n(8); i++)
      this.emit({
        type: PARTICLE_TYPE.Spark,
        x: pos.x + randRange(-0.6, 0.6),
        y: pos.y,
        z: pos.z + randRange(-0.6, 0.6),
        vx: randRange(-2, 2),
        vy: randRange(1, 4),
        vz: randRange(-2, 2),
        size: 0.03,
        stretch: 0.03,
        life: 0.35,
        r: 0.9,
        g: 2,
        b: 0.6,
        drag: 3,
      });
  }
}
