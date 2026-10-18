/**
 * Blob ballistics: steps a thrown ink blob along its gravity arc and stops it at the first collider or water surface it crosses. Used for blobs in flight and for the throw preview.
 */
import { Vector3 } from 'three';
import { COLLISION_GROUPS, GRAVITY_Y } from '../core/config.js';
export function makeHit() {
  return {
    point: new Vector3(),
    normal: new Vector3(0, 1, 0),
    velocity: new Vector3(),
    handle: undefined,
    water: false,
  };
}
export function nudgeRay(ray) {
  ray.origin.x += 0.000137;
  ray.origin.z += 0.000091;
  if (Math.abs(ray.dir.x) < 0.00001) ray.dir.x = 0.000011;
  if (Math.abs(ray.dir.z) < 0.00001) ray.dir.z = 0.000007;
}
export class Ballistics {
  ctx;
  ray;
  p1 = new Vector3();
  constructor(ctx) {
    this.ctx = ctx;
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
  waterLevel() {
    const level = this.ctx.water?.level;
    return typeof level == 'number' && Number.isFinite(level) ? level : 0;
  }
  isWater(x, z) {
    try {
      const water = this.ctx.water;
      if (water && typeof water.depthAt == 'function') return water.depthAt(x, z) > 0.02;
    } catch {}
    return true;
  }
  step(pos, vel, dt, out) {
    const next = this.p1.set(pos.x + vel.x * dt, pos.y + vel.y * dt + 0.5 * GRAVITY_Y * dt * dt, pos.z + vel.z * dt);
    const dx = next.x - pos.x;
    const dy = next.y - pos.y;
    const dz = next.z - pos.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-7) {
      vel.y += GRAVITY_Y * dt;
      return false;
    }
    let toi = Infinity;
    let hitWater = false;
    let handle;
    const ray = this.ray;
    ray.origin.x = pos.x;
    ray.origin.y = pos.y;
    ray.origin.z = pos.z;
    ray.dir.x = dx / len;
    ray.dir.y = dy / len;
    ray.dir.z = dz / len;
    nudgeRay(ray);
    try {
      const hit = this.ctx.physics.castRayAndGetNormal(ray, len, true, 8, COLLISION_GROUPS.combatQuery);
      if (hit) {
        toi = hit.timeOfImpact;
        handle = hit.collider.handle;
        out.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        if (out.normal.lengthSq() < 0.25) out.normal.set(-ray.dir.x, -ray.dir.y, -ray.dir.z);
        out.normal.normalize();
      }
    } catch {}
    const waterY = this.waterLevel();
    if (pos.y > waterY && next.y <= waterY) {
      const waterToi = ((pos.y - waterY) / (pos.y - next.y)) * len;
      if (waterToi < toi) {
        const wx = pos.x + ray.dir.x * waterToi;
        const wz = pos.z + ray.dir.z * waterToi;
        if (this.isWater(wx, wz)) {
          toi = waterToi;
          hitWater = true;
          handle = undefined;
          out.normal.set(0, 1, 0);
        }
      }
    }
    if (toi <= len) {
      const frac = toi / len;
      out.point.set(pos.x + ray.dir.x * toi, pos.y + ray.dir.y * toi, pos.z + ray.dir.z * toi);
      out.velocity.set(vel.x, vel.y + GRAVITY_Y * dt * frac, vel.z);
      out.handle = handle;
      out.water = hitWater;
      pos.copy(out.point);
      vel.copy(out.velocity);
      return true;
    }
    pos.copy(next);
    vel.y += GRAVITY_Y * dt;
    return false;
  }
}
