/**
 * Crest upgrade effects: the ring of fire an Ember Crest fireball leaves on the ground and the ice crystals a Frost Crest lance grows along its path.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { PARTICLE_TYPE } from './art-particles.js';
const CREST_TAU = Math.PI * 2;
const crestRandom = Math.random;
const crestRand = (min, max) => min + (max - min) * crestRandom();
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const MAX_FROST_SHARDS = 180;
const FROST_SHARD_LIFE = 3.6;
const _crestMatrix = new Matrix4();
const _crestQuat = new Quaternion();
const _crestSpin = new Quaternion();
const _crestPos = new Vector3();
const _crestTmp = new Vector3();
const _crestNormal = new Vector3();
const _crestUp = new Vector3(0, 1, 0);
function frostShardGeometry() {
  const prism = new CylinderGeometry(0.62, 1, 1, 6, 1, false);
  prism.translate(0, 0.5, 0);
  const tip = new ConeGeometry(0.62, 0.55, 6, 1, false);
  tip.translate(0, 1.275, 0);
  const geo = new BufferGeometry();
  const prismFlat = prism.toNonIndexed();
  const tipFlat = tip.toNonIndexed();
  const prismPos = prismFlat.attributes.position.array;
  const tipPos = tipFlat.attributes.position.array;
  const positions = new Float32Array(prismPos.length + tipPos.length);
  positions.set(prismPos, 0);
  positions.set(tipPos, prismPos.length);
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  const colors = new Float32Array(positions.length);
  const rootColor = new Color(0x2f7fd6);
  const tipColor = new Color(0xdff6ff);
  const col = new Color();
  for (let i = 0; i < positions.length / 3; i++) {
    const y = positions[i * 3 + 1];
    col.copy(rootColor).lerp(tipColor, clamp01(y / 1.5));
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.scale(0.07, 0.34, 0.07);
  geo.computeVertexNormals();
  prism.dispose();
  tip.dispose();
  prismFlat.dispose();
  tipFlat.dispose();
  return geo;
}
export class CrestFx {
  ctx;
  particles;
  shards = [];
  shardMesh;
  shardNext = 0;
  shardsLive = 0;
  flush = false;
  constructor(ctx, particles) {
    this.ctx = ctx;
    this.particles = particles;
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.18,
      metalness: 0.05,
      flatShading: true,
      emissive: new Color(0x2a6fb0),
      emissiveIntensity: 0.55,
    });
    material.name = 'frost-crest-crystals';
    this.shardMesh = new InstancedMesh(frostShardGeometry(), material, MAX_FROST_SHARDS);
    this.shardMesh.name = 'frost-crest-path';
    this.shardMesh.frustumCulled = false;
    this.shardMesh.castShadow = true;
    this.shardMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    _crestMatrix.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_FROST_SHARDS; i++) {
      this.shardMesh.setMatrixAt(i, _crestMatrix);
      this.shards.push({
        alive: false,
        age: 0,
        life: FROST_SHARD_LIFE,
        delay: 0,
        pos: new Vector3(),
        quat: new Quaternion(),
        s: 1,
        sink: 0,
      });
    }
    this.shardMesh.count = MAX_FROST_SHARDS;
    ctx.scene.add(this.shardMesh);
  }
  get q() {
    return this.particles.q;
  }
  n(count) {
    return Math.max(1, Math.round(count * this.particles.q));
  }
  ringStart(ring) {
    const center = ring.center;
    const particles = this.particles;
    particles.emit({
      type: PARTICLE_TYPE.Ring,
      x: center.x,
      y: center.y + 0.08,
      z: center.z,
      size: 0.4,
      grow: (ring.radius / 0.4) * 1.02,
      life: 0.3,
      r: 2.2,
      g: 0.9,
      b: 0.25,
      alpha: 1,
    });
    particles.emit({
      type: PARTICLE_TYPE.Glow,
      x: center.x,
      y: center.y + 0.4,
      z: center.z,
      size: ring.radius * 1.3,
      life: 0.35,
      r: 1.4,
      g: 0.45,
      b: 0.08,
    });
    for (let i = 0; i < ring.n; i++) {
      const x = ring.pts[i * 3];
      const y = ring.pts[i * 3 + 1];
      const z = ring.pts[i * 3 + 2];
      const dx = x - center.x;
      const dz = z - center.z;
      const len = Math.hypot(dx, dz) || 1;
      for (let k = 0; k < (this.q < 0.7 ? 1 : 2); k++)
        particles.emit({
          type: PARTICLE_TYPE.Flame,
          x: x + crestRand(-0.15, 0.15),
          y: y + 0.2,
          z: z + crestRand(-0.15, 0.15),
          vx: (dx / len) * crestRand(0.5, 1.6),
          vy: crestRand(3, 5.5),
          vz: (dz / len) * crestRand(0.5, 1.6),
          size: crestRand(0.35, 0.55),
          grow: 1.2,
          life: crestRand(0.35, 0.55),
          r: 1,
          g: 1,
          b: 1,
          drag: 2.5,
        });
    }
    for (let i = 0; i < this.n(24); i++) {
      const angle = crestRandom() * CREST_TAU;
      particles.emit({
        type: crestRandom() < 0.5 ? PARTICLE_TYPE.Ember : PARTICLE_TYPE.Spark,
        x: center.x + Math.cos(angle) * ring.radius,
        y: center.y + 0.3,
        z: center.z + Math.sin(angle) * ring.radius,
        vx: Math.cos(angle) * crestRand(1, 3),
        vy: crestRand(3, 7),
        vz: Math.sin(angle) * crestRand(1, 3),
        size: crestRand(0.03, 0.06),
        stretch: 0.02,
        life: crestRand(0.6, 1.2),
        r: 2.6,
        g: 1,
        b: 0.25,
        gravity: -6,
        drag: 1.2,
      });
    }
  }
  ringPoint(ring, u, out) {
    const idx = (((u % 1) + 1) % 1) * ring.n;
    const i0 = Math.floor(idx) % ring.n;
    const i1 = (i0 + 1) % ring.n;
    const frac = idx - Math.floor(idx);
    const angle = u * CREST_TAU;
    const y = ring.pts[i0 * 3 + 1] + (ring.pts[i1 * 3 + 1] - ring.pts[i0 * 3 + 1]) * frac;
    return out.set(ring.center.x + Math.cos(angle) * ring.radius, y, ring.center.z + Math.sin(angle) * ring.radius);
  }
  ring(ring, dt) {
    if (dt <= 0) return;
    const particles = this.particles;
    const center = ring.center;
    const flare = 1 + 0.6 * Math.exp(-ring.age * 5);
    const fade = clamp01((ring.life - ring.age) / 0.7);
    const heat = flare * (0.2 + 0.8 * fade);
    const elapsed = this.ctx.time.elapsed;
    const flicker = 0.85 + 0.15 * Math.sin(elapsed * 19);
    const circumference = CREST_TAU * ring.radius;
    for (ring.acc += dt * circumference * 15 * this.q * (0.35 + 0.65 * heat); ring.acc >= 1;) {
      --ring.acc;
      const p = this.ringPoint(ring, crestRandom(), _crestPos);
      const tall = crestRandom() < 0.25;
      particles.emit({
        type: PARTICLE_TYPE.Flame,
        x: p.x + crestRand(-0.12, 0.12),
        y: p.y + crestRand(0.02, 0.12),
        z: p.z + crestRand(-0.12, 0.12),
        vx: crestRand(-0.25, 0.25),
        vy: (tall ? crestRand(3.2, 4.6) : crestRand(2, 3.2)) * (0.55 + 0.45 * heat),
        vz: crestRand(-0.25, 0.25),
        size: (tall ? crestRand(0.2, 0.28) : crestRand(0.13, 0.22)) * (0.6 + 0.4 * heat),
        grow: 0.45,
        life: tall ? crestRand(0.32, 0.45) : crestRand(0.22, 0.34),
        r: 1,
        g: 1,
        b: 1,
        drag: 1.2,
      });
    }
    for (ring.acc2 += dt * 18 * this.q * heat; ring.acc2 >= 1;) {
      --ring.acc2;
      const p = this.ringPoint(ring, crestRandom(), _crestPos);
      particles.emit({
        type: crestRandom() < 0.6 ? PARTICLE_TYPE.Ember : PARTICLE_TYPE.Spark,
        x: p.x,
        y: p.y + 0.4,
        z: p.z,
        vx: crestRand(-0.8, 0.8),
        vy: crestRand(1.5, 4),
        vz: crestRand(-0.8, 0.8),
        size: crestRand(0.025, 0.05),
        stretch: 0.02,
        life: crestRand(0.6, 1.3),
        r: 2.6,
        g: 1,
        b: 0.25,
        gravity: -3,
        drag: 1,
      });
    }
    for (ring.acc3 += dt * 6 * this.q * fade; ring.acc3 >= 1;) {
      --ring.acc3;
      const p = this.ringPoint(ring, crestRandom(), _crestPos);
      particles.emit({
        type: PARTICLE_TYPE.Smoke,
        x: p.x,
        y: p.y + 1,
        z: p.z,
        vx: crestRand(-0.3, 0.3),
        vy: crestRand(0.8, 1.6),
        vz: crestRand(-0.3, 0.3),
        size: crestRand(0.35, 0.55),
        grow: 2.4,
        life: crestRand(1.1, 1.7),
        r: 0.22,
        g: 0.19,
        b: 0.17,
        alpha: 0.3,
        drag: 1.2,
        gravity: 0.5,
      });
    }
    const spin = elapsed * 0.15;
    for (let i = 0; i < 18; i++) {
      const p = this.ringPoint(ring, i / 18 + spin, _crestPos);
      const twinkle = 0.8 + 0.2 * Math.sin(elapsed * 13 + i * 2.1);
      particles.emit({
        type: PARTICLE_TYPE.Glow,
        x: p.x,
        y: p.y + 0.12,
        z: p.z,
        size: 0.75,
        life: 0.05,
        r: 1.1 * heat * twinkle,
        g: 0.38 * heat * twinkle,
        b: 0.07 * heat * twinkle,
      });
    }
    particles.emit({
      type: PARTICLE_TYPE.Glow,
      x: center.x,
      y: center.y + 0.4,
      z: center.z,
      size: ring.radius * 1.4,
      life: 0.05,
      r: 0.28 * heat * flicker,
      g: 0.09 * heat,
      b: 0.015 * heat,
    });
  }
  ringEnd(ring) {
    const particles = this.particles;
    for (let i = 0; i < ring.n; i += 2)
      particles.emit({
        type: PARTICLE_TYPE.Smoke,
        x: ring.pts[i * 3],
        y: ring.pts[i * 3 + 1] + 0.3,
        z: ring.pts[i * 3 + 2],
        vx: crestRand(-0.3, 0.3),
        vy: crestRand(0.6, 1.3),
        vz: crestRand(-0.3, 0.3),
        size: crestRand(0.3, 0.45),
        grow: 2.2,
        life: crestRand(1, 1.5),
        r: 0.2,
        g: 0.18,
        b: 0.17,
        alpha: 0.45,
        drag: 1.4,
        gravity: 0.4,
      });
  }
  frostPatch(pos, normal, dir, water) {
    const particles = this.particles;
    particles.emit({
      type: PARTICLE_TYPE.Ring,
      x: pos.x,
      y: pos.y + 0.05,
      z: pos.z,
      size: 0.25,
      grow: 5.2,
      life: 0.5,
      r: 0.85,
      g: 0.97,
      b: 1.25,
      alpha: 0.85,
    });
    particles.emit({
      type: PARTICLE_TYPE.Glow,
      x: pos.x,
      y: pos.y + 0.25,
      z: pos.z,
      size: 1.3,
      life: 0.2,
      r: 0.35,
      g: 0.6,
      b: 1,
    });
    for (let i = 0; i < this.n(7); i++)
      particles.emit({
        type: PARTICLE_TYPE.Snow,
        x: pos.x + crestRand(-0.5, 0.5),
        y: pos.y + 0.15,
        z: pos.z + crestRand(-0.5, 0.5),
        vx: crestRand(-1.2, 1.2) + dir.x,
        vy: crestRand(0.8, 2.6),
        vz: crestRand(-1.2, 1.2) + dir.z,
        size: crestRand(0.04, 0.07),
        life: crestRand(0.6, 1.1),
        r: 0.85,
        g: 0.96,
        b: 1.2,
        drag: 2,
        gravity: -1.5,
        spin: crestRand(-6, 6),
      });
    for (let i = 0; i < this.n(3); i++)
      particles.emit({
        type: PARTICLE_TYPE.Mist,
        x: pos.x + crestRand(-0.5, 0.5),
        y: pos.y + 0.2,
        z: pos.z + crestRand(-0.5, 0.5),
        vx: crestRand(-0.4, 0.4),
        vy: crestRand(0.2, 0.7),
        vz: crestRand(-0.4, 0.4),
        size: crestRand(0.4, 0.65),
        grow: 2,
        life: crestRand(0.9, 1.4),
        r: 0.9,
        g: 0.97,
        b: 1.05,
        alpha: 0.4,
        drag: 1.5,
      });
    _crestNormal.copy(normal.y > 0.3 ? normal : _crestUp);
    const count = water ? 2 : 3 + +(crestRandom() < 0.5);
    for (let i = 0; i < count; i++) {
      const angle = crestRandom() * CREST_TAU;
      const dist = crestRand(0.1, 0.55);
      _crestPos.set(Math.cos(angle), 0, Math.sin(angle));
      const shard = this.shards[this.shardNext];
      this.shardNext = (this.shardNext + 1) % MAX_FROST_SHARDS;
      shard.alive = true;
      shard.age = 0;
      shard.delay = i * 0.035 + crestRand(0, 0.03);
      shard.life = FROST_SHARD_LIFE * crestRand(0.85, 1.15);
      shard.pos.set(pos.x + _crestPos.x * dist, pos.y - 0.05, pos.z + _crestPos.z * dist);
      _crestTmp
        .copy(_crestNormal)
        .addScaledVector(_crestPos, crestRand(0.35, 0.9) * (water ? 1.4 : 1))
        .addScaledVector(dir, crestRand(0, 0.35))
        .normalize();
      shard.quat.setFromUnitVectors(_crestUp, _crestTmp);
      _crestSpin.setFromAxisAngle(_crestUp, crestRandom() * CREST_TAU);
      shard.quat.multiply(_crestSpin);
      shard.s = (i === 0 ? crestRand(1.1, 1.5) : crestRand(0.6, 1.05)) * (water ? 0.7 : 1);
      shard.sink = 0;
    }
    this.shardsLive = MAX_FROST_SHARDS;
  }
  update(dt) {
    if (this.shardsLive <= 0 && !this.flush) return;
    let live = 0;
    let flush = this.flush;
    this.flush = false;
    for (let i = 0; i < MAX_FROST_SHARDS; i++) {
      const shard = this.shards[i];
      if (!shard.alive) continue;
      live++;
      flush = true;
      if (dt > 0) shard.age += dt;
      const age = shard.age - shard.delay;
      if (age < 0) {
        _crestMatrix.makeScale(0, 0, 0);
        this.shardMesh.setMatrixAt(i, _crestMatrix);
        continue;
      }
      if (age > shard.life) {
        shard.alive = false;
        _crestMatrix.makeScale(0, 0, 0);
        this.shardMesh.setMatrixAt(i, _crestMatrix);
        continue;
      }
      const grow = age < 0.16 ? 1 - (1 - age / 0.16) ** 3 + Math.sin((age / 0.16) * Math.PI) * 0.25 : 1;
      const fade = clamp01((shard.life - age) / 0.9);
      const scale = shard.s * grow * (0.2 + 0.8 * fade);
      _crestPos.copy(shard.pos);
      _crestPos.y -= (1 - fade) * 0.25;
      _crestQuat.copy(shard.quat);
      _crestTmp.set(scale * (0.85 + 0.15 * fade), scale, scale * (0.85 + 0.15 * fade));
      _crestMatrix.compose(_crestPos, _crestQuat, _crestTmp);
      this.shardMesh.setMatrixAt(i, _crestMatrix);
    }
    this.shardsLive = live;
    if (flush) this.shardMesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    for (const shard of this.shards) shard.alive = false;
    _crestMatrix.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_FROST_SHARDS; i++) this.shardMesh.setMatrixAt(i, _crestMatrix);
    this.flush = true;
    this.shardsLive = 0;
    this.shardMesh.instanceMatrix.needsUpdate = true;
  }
}
