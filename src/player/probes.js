/**
 * Physics probes shared by the hero, the camera and the brush: Rapier ray casts that report the hit point, normal and collider, and sphere casts that report the distance to the first hit, skipping sensors and an excluded collider.
 */
import { Vector3 } from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
export function makeHit() {
  return {
    point: new Vector3(),
    normal: new Vector3(0, 1, 0),
    distance: 0,
    handle: -1,
  };
}
export class Probes {
  ctx;
  rapierRay;
  ball;
  rot = {
    x: 0,
    y: 0,
    z: 0,
    w: 1,
  };
  v1 = {
    x: 0,
    y: 0,
    z: 0,
  };
  v2 = {
    x: 0,
    y: 0,
    z: 0,
  };
  flags;
  exclude;
  constructor(ctx) {
    this.ctx = ctx;
    const RAPIER = ctx.RAPIER;
    this.rapierRay = new RAPIER.Ray(
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
    this.ball = new RAPIER.Ball(0.25);
    this.flags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
  }
  ray(from, dir, maxDist, out, solid = true, groups = COLLISION_GROUPS.worldQuery) {
    const rapierRay = this.rapierRay;
    rapierRay.origin.x = from.x + 0.00137;
    rapierRay.origin.y = from.y;
    rapierRay.origin.z = from.z + 0.00173;
    rapierRay.dir.x = dir.x;
    rapierRay.dir.y = dir.y;
    rapierRay.dir.z = dir.z;
    let hit = null;
    try {
      hit = this.ctx.physics.castRayAndGetNormal(rapierRay, maxDist, solid, this.flags, groups, this.exclude);
    } catch {
      return false;
    }
    if (!hit) return false;
    const timeOfImpact = hit.timeOfImpact;
    out.distance = timeOfImpact;
    out.point.set(
      rapierRay.origin.x + dir.x * timeOfImpact,
      from.y + dir.y * timeOfImpact,
      rapierRay.origin.z + dir.z * timeOfImpact,
    );
    out.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    if (out.normal.lengthSq() < 0.000001) out.normal.set(-dir.x, -dir.y, -dir.z);
    else out.normal.normalize();
    out.handle = hit.collider ? hit.collider.handle : -1;
    return true;
  }
  sphere(from, dir, maxDist, radius) {
    this.ball.radius = radius;
    this.v1.x = from.x;
    this.v1.y = from.y;
    this.v1.z = from.z;
    this.v2.x = dir.x;
    this.v2.y = dir.y;
    this.v2.z = dir.z;
    try {
      const hit = this.ctx.physics.castShape(
        this.v1,
        this.rot,
        this.v2,
        this.ball,
        0,
        maxDist,
        true,
        this.flags,
        COLLISION_GROUPS.worldQuery,
        this.exclude,
      );
      return hit ? hit.time_of_impact : -1;
    } catch {
      return -1;
    }
  }
  info(handle) {
    return handle < 0 ? undefined : this.ctx.colliders.get(handle);
  }
}
