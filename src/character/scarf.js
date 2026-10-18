/**
 * The hero's scarf: two Verlet cloth strips anchored at the neck that flutter and whip in the wind and with speed, and collide with the body capsules and the ground.
 */
import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Mesh, Vector3 } from 'three';
import { HERO_COLORS } from './body-mesh.js';
const _scarfP = new Vector3();
const _scarfSeg = new Vector3();
const _scarfRel = new Vector3();
const _scarfClosest = new Vector3();
export class Scarf {
  ctx;
  mesh;
  tails;
  geo;
  pos;
  nrm;
  init = false;
  time = 0;
  iters = 5;
  anchor = new Vector3();
  anchorSide = new Vector3(1, 0, 0);
  anchorBack = new Vector3(0, 0, -1);
  bodyVel = new Vector3();
  colliders = [];
  colliderCount = 0;
  groundY = -1000000000;
  constructor(ctx, material) {
    this.ctx = ctx;
    this.tails = [this.makeTail(13, 1.02, 0.1, 0), this.makeTail(10, 0.68, 0.085, 1)];
    let verts = 0;
    for (const tail of this.tails) {
      tail.base = verts;
      verts += tail.n * 2;
    }
    const vertCount = verts;
    this.geo = new BufferGeometry();
    this.pos = new BufferAttribute(new Float32Array(vertCount * 3), 3);
    this.pos.setUsage(DynamicDrawUsage);
    this.nrm = new BufferAttribute(new Float32Array(vertCount * 3), 3);
    this.nrm.setUsage(DynamicDrawUsage);
    const colors = new Float32Array(vertCount * 3);
    const index = [];
    for (const tail of this.tails)
      for (let i = 0; i < tail.n; i++)
        if (i < tail.n - 1) {
          const i0 = tail.base + i * 2;
          const i1 = i0 + 1;
          const i2 = i0 + 2;
          const i3 = i0 + 3;
          index.push(i0, i2, i1, i1, i2, i3);
        }
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('normal', this.nrm);
    this.colAttr = new BufferAttribute(colors, 3);
    this.geo.setAttribute('color', this.colAttr);
    this.setColors(HERO_COLORS.scarf, HERO_COLORS.scarfDark, HERO_COLORS.tunic);
    this.geo.setAttribute('aTint', new BufferAttribute(new Float32Array(vertCount), 1));
    this.geo.setAttribute('aOutline', new BufferAttribute(new Float32Array(vertCount), 1));
    this.geo.setAttribute('aScarf', new BufferAttribute(new Float32Array(vertCount), 1));
    this.geo.setAttribute('aHood', new BufferAttribute(new Float32Array(vertCount * 3), 3));
    this.geo.setIndex(index);
    this.mesh = new Mesh(this.geo, material);
    this.mesh.name = 'hero-scarf';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
  colAttr;
  /** `tip`, if given: the tails fade to it towards their ends. */
  setColors(base, dark, band, tip) {
    const colors = this.colAttr.array;
    const baseColor = new Color(base);
    const darkColor = new Color(dark);
    const bandColor = new Color(band);
    const tipColor = tip == null ? null : new Color(tip);
    const color = new Color();
    for (const tail of this.tails)
      for (let i = 0; i < tail.n; i++) {
        const along = i / (tail.n - 1);
        color.copy(baseColor).lerp(darkColor, 0.25 * (1 - along));
        if (tipColor) {
          const fade = Math.min(1, Math.max(0, (along - 0.15) / 0.85));
          color.lerp(tipColor, fade * fade * (3 - 2 * fade));
        }
        if ((along > 0.74 && along < 0.79) || (along > 0.86 && along < 0.9))
          color.copy(bandColor).lerp(baseColor, 0.15);
        for (let j = 0; j < 2; j++) {
          const vert = tail.base + i * 2 + j;
          colors[vert * 3] = color.r;
          colors[vert * 3 + 1] = color.g;
          colors[vert * 3 + 2] = color.b;
        }
      }
    this.colAttr.needsUpdate = true;
  }
  makeTail(count, len, width, seed) {
    return {
      n: count,
      len,
      width,
      p: new Float32Array(count * 2 * 3),
      q: new Float32Array(count * 2 * 3),
      base: 0,
      seed,
    };
  }
  layout(tail, index) {
    const segLen = tail.len / (tail.n - 1);
    for (let j = 0; j < tail.n; j++)
      for (let k = 0; k < 2; k++) {
        _scarfP
          .copy(this.anchor)
          .addScaledVector(this.anchorSide, (k - 0.5) * tail.width + (index === 0 ? 0.02 : -0.03))
          .addScaledVector(this.anchorBack, 0.02 + j * segLen * 0.35);
        _scarfP.y -= j * segLen * 0.9;
        const idx = (j * 2 + k) * 3;
        tail.p[idx] = tail.q[idx] = _scarfP.x;
        tail.p[idx + 1] = tail.q[idx + 1] = _scarfP.y;
        tail.p[idx + 2] = tail.q[idx + 2] = _scarfP.z;
      }
  }
  reset() {
    this.init = false;
  }
  update(dt) {
    if (dt <= 0) return;
    this.init ||= (this.tails.forEach((tail, index) => this.layout(tail, index)), true);
    const first = this.tails[0];
    if (Math.hypot(first.p[0] - this.anchor.x, first.p[1] - this.anchor.y, first.p[2] - this.anchor.z) > 2)
      this.tails.forEach((tail, index) => this.layout(tail, index));
    const low = this.ctx.settings.quality === 'low';
    const substeps = low ? 1 : dt > 1 / 45 ? 3 : 2;
    this.iters = low ? 3 : 5;
    const stepDt = Math.min(dt, 1 / 30) / substeps;
    for (let i = 0; i < substeps; i++) {
      this.time += stepDt;
      this.tails.forEach((tail, i) => this.step(tail, i, stepDt));
    }
    this.writeGeometry();
  }
  step(tail, index, dt) {
    const globals = this.ctx.globals;
    const uWindDir = globals.uWindDir.value;
    const uWindStrength = globals.uWindStrength.value;
    const time = this.time;
    const segLen = tail.len / (tail.n - 1);
    const gust = 0.6 + 0.4 * Math.sin(time * 1.7 + index) * Math.sin(time * 0.63);
    const windX = uWindDir.x * uWindStrength * 3.2 * gust;
    const windZ = uWindDir.y * uWindStrength * 3.2 * gust;
    const drag = 3.2;
    const count = tail.n;
    for (let j = 1; j < count; j++) {
      const along = j / (count - 1);
      for (let k = 0; k < 2; k++) {
        const idx = (j * 2 + k) * 3;
        const x2 = tail.p[idx];
        const y2 = tail.p[idx + 1];
        const z = tail.p[idx + 2];
        const vx = (x2 - tail.q[idx]) / dt;
        const vy = (y2 - tail.q[idx + 1]) / dt;
        const vz = (z - tail.q[idx + 2]) / dt;
        const relX = windX - vx;
        const relZ = windZ - vz;
        const relY = -vy;
        const airSpeed = Math.hypot(relX, relY, relZ);
        const flutter = Math.sin(time * 11 - j * 0.9 + tail.seed * 2 + k * 0.4) * Math.min(airSpeed, 9) * 0.55 * along;
        const excess = airSpeed > 10 ? Math.min(airSpeed - 10, 20) : 0;
        const whip =
          excess > 0 ? Math.sin(time * (14 + excess * 0.5) - j * 1.1 + tail.seed * 3) * excess * 1.4 * along : 0;
        const ax = relX * drag + this.anchorSide.x * flutter;
        const ay =
          -9.8 +
          relY * drag * 0.6 +
          Math.sin(time * 8.3 - j * 0.7 + tail.seed) * Math.min(airSpeed, 9) * 0.35 * along +
          whip;
        const az = relZ * drag + this.anchorSide.z * flutter;
        const keep = 0.992;
        tail.q[idx] = x2;
        tail.q[idx + 1] = y2;
        tail.q[idx + 2] = z;
        tail.p[idx] = x2 + vx * dt * keep + ax * dt * dt;
        tail.p[idx + 1] = y2 + vy * dt * keep + ay * dt * dt;
        tail.p[idx + 2] = z + vz * dt * keep + az * dt * dt;
      }
    }
    for (let i = 0; i < 2; i++) {
      _scarfP.copy(this.anchor).addScaledVector(this.anchorSide, (i - 0.5) * tail.width + (index === 0 ? 0.02 : -0.03));
      const idx = i * 3;
      tail.p[idx] = tail.q[idx] = _scarfP.x;
      tail.p[idx + 1] = tail.q[idx + 1] = _scarfP.y;
      tail.p[idx + 2] = tail.q[idx + 2] = _scarfP.z;
    }
    const diag = Math.hypot(segLen, tail.width);
    for (let i = 0; i < this.iters; i++) {
      for (let j = 0; j < count; j++) {
        this.link(tail, j * 2, j * 2 + 1, tail.width, j === 0 ? 0 : 0.5);
        if (j < count - 1) {
          this.link(tail, j * 2, j * 2 + 2, segLen, j === 0 ? 0 : 0.5);
          this.link(tail, j * 2 + 1, j * 2 + 3, segLen, j === 0 ? 0 : 0.5);
          this.link(tail, j * 2, j * 2 + 3, diag, j === 0 ? 0 : 0.5, 0.5);
          this.link(tail, j * 2 + 1, j * 2 + 2, diag, j === 0 ? 0 : 0.5, 0.5);
        }
        if (j < count - 2) {
          this.link(tail, j * 2, j * 2 + 4, segLen * 2, j === 0 ? 0 : 0.5, 0.12);
          this.link(tail, j * 2 + 1, j * 2 + 5, segLen * 2, j === 0 ? 0 : 0.5, 0.12);
        }
      }
      this.collide(tail);
    }
  }
  link(tail, ia, ib, rest, wa, stiffness = 1) {
    const oa = ia * 3;
    const ob = ib * 3;
    const dx = tail.p[ob] - tail.p[oa];
    const dy = tail.p[ob + 1] - tail.p[oa + 1];
    const dz = tail.p[ob + 2] - tail.p[oa + 2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.000001;
    let corr = ((len - rest) / len) * stiffness;
    if (stiffness < 1 && len > rest) corr *= 0.2;
    const wb = 1 - wa;
    tail.p[oa] += dx * corr * wa;
    tail.p[oa + 1] += dy * corr * wa;
    tail.p[oa + 2] += dz * corr * wa;
    tail.p[ob] -= dx * corr * wb;
    tail.p[ob + 1] -= dy * corr * wb;
    tail.p[ob + 2] -= dz * corr * wb;
  }
  collide(tail) {
    const colliders = this.colliders;
    for (let i = 1; i < tail.n; i++)
      for (let j = 0; j < 2; j++) {
        const idx = (i * 2 + j) * 3;
        _scarfP.set(tail.p[idx], tail.p[idx + 1], tail.p[idx + 2]);
        for (let ci = 0; ci < this.colliderCount; ci++) {
          const cap = colliders[ci];
          _scarfSeg.subVectors(cap.b, cap.a);
          const lenSq = _scarfSeg.lengthSq();
          let along = lenSq > 1e-8 ? _scarfRel.subVectors(_scarfP, cap.a).dot(_scarfSeg) / lenSq : 0;
          along = along < 0 ? 0 : along > 1 ? 1 : along;
          _scarfClosest.copy(cap.a).addScaledVector(_scarfSeg, along);
          _scarfRel.subVectors(_scarfP, _scarfClosest);
          const dist = _scarfRel.length();
          const radius = cap.r + 0.012;
          if (dist < radius) {
            if (dist < 0.00001) _scarfRel.set(0, 0, -1);
            else _scarfRel.divideScalar(dist);
            _scarfP.copy(_scarfClosest).addScaledVector(_scarfRel, radius);
          }
        }
        if (_scarfP.y < this.groundY + 0.015) _scarfP.y = this.groundY + 0.015;
        tail.p[idx] = _scarfP.x;
        tail.p[idx + 1] = _scarfP.y;
        tail.p[idx + 2] = _scarfP.z;
      }
  }
  writeGeometry() {
    const positions = this.pos.array;
    const normals = this.nrm.array;
    for (const tail of this.tails)
      for (let i = 0; i < tail.n; i++) {
        for (let j = 0; j < 2; j++) {
          const src = (i * 2 + j) * 3;
          const dst = (tail.base + i * 2 + j) * 3;
          positions[dst] = tail.p[src];
          positions[dst + 1] = tail.p[src + 1];
          positions[dst + 2] = tail.p[src + 2];
        }
        const prev = Math.max(0, i - 1);
        const next = Math.min(tail.n - 1, i + 1);
        const prevOff = prev * 2 * 3;
        const nextOff = next * 2 * 3;
        const curOff = i * 2 * 3;
        _scarfP.set(
          tail.p[nextOff] - tail.p[prevOff],
          tail.p[nextOff + 1] - tail.p[prevOff + 1],
          tail.p[nextOff + 2] - tail.p[prevOff + 2],
        );
        _scarfSeg.set(
          tail.p[curOff + 3] - tail.p[curOff],
          tail.p[curOff + 4] - tail.p[curOff + 1],
          tail.p[curOff + 5] - tail.p[curOff + 2],
        );
        _scarfRel.crossVectors(_scarfP, _scarfSeg).normalize();
        for (let j = 0; j < 2; j++) {
          const dst = (tail.base + i * 2 + j) * 3;
          normals[dst] = _scarfRel.x;
          normals[dst + 1] = _scarfRel.y;
          normals[dst + 2] = _scarfRel.z;
        }
      }
    this.pos.needsUpdate = true;
    this.nrm.needsUpdate = true;
  }
}
