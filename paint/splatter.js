/**
 * Splatter: writes paint into the volume as noisy spheres, tapered capsules and directional splats with lobed outlines, satellite drops and streaks, erases paint, and runs the drips that crawl down steep surfaces.
 */
import { Vector3 } from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
import { makeNoise3D } from '../core/math.js';
import { nudgeRay } from './ballistics.js';
import { VOXEL_SIZE } from './constants.js';
const EDGE_SLOPE = 1 / (1.25 * VOXEL_SIZE);
const splatNoise = makeNoise3D('wb-paint-splat');
function smooth01(t) {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}
const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _up = new Vector3(0, 1, 0);
export class Splatter {
  ctx;
  volume;
  jobs = [];
  drips = [];
  time = 0;
  ray;
  lastVoxels = 0;
  constructor(ctx, volume) {
    this.ctx = ctx;
    this.volume = volume;
    this.ray = new ctx.RAPIER.Ray(
      {
        x: 0,
        y: 0,
        z: 0,
      },
      {
        x: 0,
        y: -1,
        z: 0,
      },
    );
  }
  sphere(center, radius, channel, strength = 1, dome = true) {
    const cx = center.x;
    const cy = center.y;
    const cz = center.z;
    const rad = Math.max(0.05, radius);
    const reach = rad + 0.9;
    const wobble = rad * 0.16;
    return this.volume.paint(
      cx - reach,
      cy - reach,
      cz - reach,
      cx + reach,
      cy + reach,
      cz + reach,
      channel,
      (x, y, z) => {
        const dx = x - cx;
        const dy = y - cy;
        const dz = z - cz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > reach) return 0;
        const edge = rad + splatNoise(x * 0.9, y * 0.9, z * 0.9) * wobble;
        let cov = 0.5 - (dist - edge) * EDGE_SLOPE;
        if (cov <= 0) {
          return 0;
        } else {
          if (cov > 1) cov = 1;
          if (dome) cov *= 0.66 + 0.34 * Math.max(0, 1 - (dist / edge) ** 2);
          return cov;
        }
      },
      strength,
    );
  }
  capsule(start, end, startRadius, endRadius, channel, strength = 1) {
    const ax = start.x;
    const ay = start.y;
    const az = start.z;
    const abx = end.x - ax;
    const aby = end.y - ay;
    const abz = end.z - az;
    const lenSq = abx * abx + aby * aby + abz * abz;
    const pad = Math.max(startRadius, endRadius) + 0.7;
    const minX = Math.min(start.x, end.x) - pad;
    const maxX = Math.max(start.x, end.x) + pad;
    const minY = Math.min(start.y, end.y) - pad;
    const maxY = Math.max(start.y, end.y) + pad;
    const minZ = Math.min(start.z, end.z) - pad;
    const maxZ = Math.max(start.z, end.z) + pad;
    return this.volume.paint(
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
      channel,
      (x2, y2, z) => {
        const px = x2 - ax;
        const py = y2 - ay;
        const pz = z - az;
        let t = lenSq > 1e-8 ? (px * abx + py * aby + pz * abz) / lenSq : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px - abx * t;
        const qy = py - aby * t;
        const qz = pz - abz * t;
        const dist = Math.sqrt(qx * qx + qy * qy + qz * qz);
        const rad = startRadius + (endRadius - startRadius) * t;
        const thin = rad < 0.15 ? (0.15 - rad) / 0.15 : 0;
        let cov = 0.5 + 0.14 * thin - (dist - rad) * EDGE_SLOPE * (1 - 0.2 * thin);
        if (cov <= 0) {
          return 0;
        } else {
          if (cov > 0.95) cov = 0.95;
          return cov;
        }
      },
      strength,
    );
  }
  erase(center, radius, mask) {
    const cx = center.x;
    const cy = center.y;
    const cz = center.z;
    const rad = Math.max(0.05, radius);
    const reach = rad + 0.5;
    return this.volume.erase(
      cx - reach,
      cy - reach,
      cz - reach,
      cx + reach,
      cy + reach,
      cz + reach,
      mask,
      (x, y, z) => {
        const dist = Math.hypot(x - cx, y - cy, z - cz);
        const edge = rad + splatNoise(x * 0.7 + 11, y * 0.7, z * 0.7) * rad * 0.2;
        return 1 - smooth01((dist - edge * 0.55) / (edge * 0.45 + 0.3));
      },
    );
  }
  splat(point, normal, velocity, channel, radius) {
    const hitPoint = point.clone();
    const nrm = normal.clone().normalize();
    const slide = _v1.copy(velocity).addScaledVector(nrm, -velocity.dot(nrm));
    const slideSpeed = slide.length();
    const speed = velocity.length();
    const stretchDir = new Vector3();
    if (slideSpeed > 0.5) stretchDir.copy(slide).divideScalar(slideSpeed);
    else
      stretchDir
        .copy(Math.abs(nrm.y) < 0.9 ? _up : _v2.set(1, 0, 0))
        .cross(nrm)
        .normalize();
    const sideDir = new Vector3().crossVectors(nrm, stretchDir).normalize();
    const glance = speed > 0.1 ? Math.min(1, slideSpeed / speed) : 0;
    const stretch = 1 + glance * 0.45;
    const center = hitPoint.clone().addScaledVector(stretchDir, radius * glance * 0.25);
    const lobes = Array.from(
      {
        length: 5,
      },
      (_, i) => ({
        k: [2, 3, 4, 6, 9][i],
        a: [0.07, 0.1, 0.06, 0.05, 0.035][i] * (0.6 + Math.random() * 0.8),
        ph: Math.random() * Math.PI * 2,
      }),
    );
    const stamp = (scale, rim) => {
      const rad = radius * scale;
      const reach = rim ? rad * 1.65 + 0.3 : rad + 0.6;
      const cx = center.x;
      const cy = center.y;
      const cz = center.z;
      const nx = nrm.x;
      const ny = nrm.y;
      const nz = nrm.z;
      const ux = stretchDir.x;
      const uy = stretchDir.y;
      const uz = stretchDir.z;
      const vx = sideDir.x;
      const vy = sideDir.y;
      const vz = sideDir.z;
      const reachU = reach * stretch;
      const ex = Math.abs(ux) * reachU + Math.abs(vx) * reach + Math.abs(nx) * 1;
      const ey = Math.abs(uy) * reachU + Math.abs(vy) * reach + Math.abs(ny) * 1;
      const ez = Math.abs(uz) * reachU + Math.abs(vz) * reach + Math.abs(nz) * 1;
      const invStretch = 1 / stretch;
      return this.volume.paint(cx - ex, cy - ey, cz - ez, cx + ex, cy + ey, cz + ez, channel, (x, y, z) => {
        const dx = x - cx;
        const dy = y - cy;
        const dz = z - cz;
        const depth = dx * nx + dy * ny + dz * nz;
        let slab;
        slab =
          depth >= 0
            ? depth < 0.45
              ? 1
              : 1 - smooth01((depth - 0.45) / 0.5)
            : -depth < 0.3
              ? 1
              : 1 - smooth01((-depth - 0.3) / 0.45);
        if (slab <= 0) return 0;
        const pu = (dx * ux + dy * uy + dz * uz) * invStretch;
        const pv = dx * vx + dy * vy + dz * vz;
        const planar = Math.sqrt(pu * pu + pv * pv);
        if (planar > reach) return 0;
        const angle = Math.atan2(pv, pu);
        let outline = 1;
        for (let i = 0; i < lobes.length; i++) outline += lobes[i].a * Math.sin(lobes[i].k * angle + lobes[i].ph);
        const edge = rad * outline + splatNoise(x * 0.85, y * 0.85, z * 0.85) * rad * 0.12;
        let cov = 0.5 - (planar - edge) * EDGE_SLOPE;
        if (cov > 1) cov = 1;
        if (cov > 0) cov *= 0.62 + 0.38 * Math.max(0, 1 - (planar / edge) * (planar / edge));
        else cov = 0;
        let value = cov;
        if (rim && planar > edge * 0.8) {
          const spatter =
            0.26 *
            (1 - smooth01((planar - edge) / (reach - edge))) *
            (0.7 + 0.3 * splatNoise(x * 2.1, y * 2.1, z * 2.1));
          if (spatter > value) value = spatter;
        }
        return value * slab;
      });
    };
    this.schedule(0, () => stamp(0.55, false));
    this.schedule(0.035, () => stamp(0.82, false));
    this.schedule(0.08, () => stamp(1, true));
    this.schedule(0.06, () => {
      const count = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = radius * (1.05 + Math.random() * 0.65);
        _v3
          .copy(center)
          .addScaledVector(stretchDir, Math.cos(angle) * dist * stretch)
          .addScaledVector(sideDir, Math.sin(angle) * dist);
        const spot = this.surfaceNear(_v3, nrm);
        if (spot && this.lastNormal.dot(nrm) > 0.55 && spot.distanceTo(_v3) < 1)
          this.sphere(spot, 0.16 + Math.random() * 0.24, channel, 1);
      }
      if (glance > 0.2 || Math.random() < 0.6) {
        const count = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          const angle = (Math.random() - 0.5) * (glance > 0.2 ? 1.3 : 6.28);
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          _v3
            .copy(center)
            .addScaledVector(stretchDir, cos * radius * 0.65)
            .addScaledVector(sideDir, sin * radius * 0.65);
          const startHit = this.surfaceNear(_v3, nrm);
          const start =
            startHit && this.lastNormal.dot(nrm) > 0.55 && startHit.distanceTo(_v3) < 1 ? startHit.clone() : null;
          const endDist = radius * (1.15 + Math.random() * 0.5 + glance * 0.35);
          _v3
            .copy(center)
            .addScaledVector(stretchDir, cos * endDist * stretch)
            .addScaledVector(sideDir, sin * endDist);
          const endHit = this.surfaceNear(_v3, nrm);
          const end = endHit && this.lastNormal.dot(nrm) > 0.55 && endHit.distanceTo(_v3) < 1 ? endHit : null;
          if (start && end) {
            this.capsule(start, end, 0.17, 0.02, channel, 1);
            if (Math.random() < 0.7) this.sphere(end, 0.1 + Math.random() * 0.08, channel, 1, false);
          }
        }
      }
    });
    if (nrm.y < 0.6 && nrm.y > -0.7) {
      const steep = 1 - Math.max(0, nrm.y) / 0.6;
      const down = new Vector3(0, -1, 0).addScaledVector(nrm, nrm.y).normalize();
      const across = new Vector3().crossVectors(down, nrm).normalize();
      const count = 1 + Math.floor(Math.random() * (1 + steep * 1.6));
      for (let i = 0; i < count; i++) {
        const offset = (Math.random() * 2 - 1) * radius * 0.6;
        const tip = hitPoint
          .clone()
          .addScaledVector(across, offset)
          .addScaledVector(down, radius * (0.3 + Math.random() * 0.3));
        this.drips.push({
          tip,
          n: nrm.clone(),
          down: down.clone(),
          channel,
          remaining: (1 + Math.random() * 2.6) * (0.5 + steep * 0.7),
          radius: 0.06 + Math.random() * 0.05,
          speed: 1.6 + Math.random() * 1.6,
          delay: 0.12 + Math.random() * 0.35,
          sinceBead: 0,
        });
      }
    }
  }
  update(dt) {
    this.time += dt;
    let voxels = 0;
    if (this.jobs.length) {
      const now = performance.now();
      let i = 0;
      for (; i < this.jobs.length;) {
        const job = this.jobs[i];
        if (job.t <= this.time) {
          if (performance.now() - now > 4) break;
          this.jobs.splice(i, 1);
          try {
            job.run();
          } catch (err) {
            console.warn('[paint] splat job failed', err);
          }
        } else i++;
      }
    }
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const drip = this.drips[i];
      if (drip.delay > 0) {
        drip.delay -= dt;
        continue;
      }
      const step = Math.min(0.35, drip.speed * dt);
      if (step <= 0) continue;
      drip.speed = Math.max(0.45, drip.speed * Math.exp(-0.7 * dt));
      const from = _v1.copy(drip.tip);
      const to = _v2.copy(drip.tip).addScaledVector(drip.down, step);
      const side = _v3.crossVectors(drip.down, drip.n);
      to.addScaledVector(side, splatNoise(drip.tip.x * 1.3, drip.tip.y * 1.3, drip.tip.z * 1.3) * step * 0.35);
      const hit = this.surfaceNear(to, drip.n, 0.55, 1.2);
      let done = false;
      if (hit) {
        to.copy(hit);
        const lastNormal = this.lastNormal;
        if (lastNormal.y > 0.8) done = true;
        drip.n.copy(lastNormal);
        drip.down.set(0, -1, 0).addScaledVector(lastNormal, lastNormal.y);
        if (drip.down.lengthSq() < 0.0001) done = true;
        else drip.down.normalize();
      } else done = true;
      const radius = drip.radius;
      voxels += this.capsule(from, to, radius, radius * 0.97, drip.channel, 1);
      drip.radius *= 0.985;
      drip.tip.copy(to);
      drip.remaining -= step;
      drip.sinceBead += step;
      if (drip.sinceBead > 0.9 && Math.random() < 0.3) {
        drip.sinceBead = 0;
        voxels += this.sphere(drip.tip, 0.1 + radius * 0.8, drip.channel, 1, false);
      }
      if (drip.remaining <= 0 || done) {
        voxels += this.sphere(drip.tip, 0.14 + radius * 1.1, drip.channel, 1, false);
        this.drips.splice(i, 1);
      }
    }
    this.lastVoxels = voxels;
  }
  get pending() {
    return this.jobs.length + this.drips.length;
  }
  schedule(delay, run) {
    this.jobs.push({
      t: this.time + delay,
      run,
    });
  }
  lastNormal = new Vector3(0, 1, 0);
  hitOut = new Vector3();
  surfaceNear(point, normal, above = 0.8, below = 2) {
    try {
      const ray = this.ray;
      ray.origin.x = point.x + normal.x * above;
      ray.origin.y = point.y + normal.y * above;
      ray.origin.z = point.z + normal.z * above;
      ray.dir.x = -normal.x;
      ray.dir.y = -normal.y;
      ray.dir.z = -normal.z;
      nudgeRay(ray);
      const hit = this.ctx.physics.castRayAndGetNormal(ray, above + below, true, 8, COLLISION_GROUPS.worldQuery);
      if (!hit || this.ctx.colliders.get(hit.collider.handle)?.dynamic) return null;
      const timeOfImpact = hit.timeOfImpact;
      this.hitOut.set(
        ray.origin.x - normal.x * timeOfImpact,
        ray.origin.y - normal.y * timeOfImpact,
        ray.origin.z - normal.z * timeOfImpact,
      );
      this.lastNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
      if (this.lastNormal.lengthSq() < 0.25) this.lastNormal.copy(normal);
      else this.lastNormal.normalize();
      return this.hitOut;
    } catch {
      return null;
    }
  }
}
