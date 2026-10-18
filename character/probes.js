/**
 * The hero animator's probes: the ground under a point (terrain height, then a ray against the world
 * for bridges, rocks and floors, with its normal) and the top of a ledge in front of a climber.
 */
import { Vector3 } from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
export function heroProbes(ctx) {
  const RAPIER = ctx.RAPIER;
  const ray = new RAPIER.Ray(
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
  let useRay = true;
  const ground = (x, z, y, out) => {
    let terrainY = -1000000000;
    try {
      terrainY = ctx.terrain.heightAt(x, z);
    } catch {}
    let groundY = terrainY;
    let rayHit = false;
    if (useRay)
      try {
        ray.origin.x = x;
        ray.origin.y = y + 0.7;
        ray.origin.z = z;
        const hit = ctx.physics.castRayAndGetNormal(
          ray,
          2.2,
          true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
          COLLISION_GROUPS.worldQuery,
        );
        if (hit) {
          groundY = y + 0.7 - hit.timeOfImpact;
          out.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
          if (out.normal.y < 0.2) out.normal.set(0, 1, 0);
          rayHit = true;
        }
      } catch {
        useRay = false;
      }
    if (!Number.isFinite(groundY) || groundY < y - 1.4)
      groundY = Number.isFinite(terrainY) && terrainY > y - 1.4 ? terrainY : y;
    if (groundY > y + 0.65) groundY = y;
    if (!rayHit)
      try {
        ctx.terrain.normalAt(x, z, out.normal);
      } catch {
        out.normal.set(0, 1, 0);
      }
    out.normal.lerp(PROBE_UP, 0.35).normalize();
    out.y = groundY;
    return out;
  };
  const ledge = (x, z, y, maxDist) => {
    try {
      ray.origin.x = x;
      ray.origin.y = y;
      ray.origin.z = z;
      const hit = ctx.physics.castRayAndGetNormal(
        ray,
        maxDist,
        true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        COLLISION_GROUPS.worldQuery,
      );
      if (hit && hit.normal.y > 0.5) return y - hit.timeOfImpact;
    } catch {}
    return NaN;
  };
  return {
    ground,
    ledge,
  };
}
const PROBE_UP = new Vector3(0, 1, 0);
