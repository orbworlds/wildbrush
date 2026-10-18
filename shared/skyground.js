/**
 * Ground queries that know about the sky island: its surface, terrain and water heights, water depth, and how strongly a point belongs to the Painted Aerie.
 */
import { SKY_ISLAND } from '../core/config.js';
const SKY_MARGIN = 3;
export function skySurfaceAt(ctx, x, z) {
  try {
    const sky = ctx.sky;
    if (!sky || sky.isStub) return null;
    const height = sky.surfaceAt(x, z);
    return typeof height == 'number' && Number.isFinite(height) ? height : null;
  } catch {
    return null;
  }
}
export function isOnSkyAt(ctx, x, z, y, margin = SKY_MARGIN) {
  const skyY = skySurfaceAt(ctx, x, z);
  return skyY !== null && y > skyY - margin;
}
export function waterLevel(ctx) {
  const level = ctx.water?.level;
  return typeof level == 'number' && Number.isFinite(level) ? level : 0;
}
function inInterior(y) {
  return Number.isFinite(y) && y > 205;
}
export function waterDepthAt(ctx, x, z, y) {
  if (inInterior(y) || isOnSkyAt(ctx, x, z, y)) return 0;
  try {
    const depth = ctx.water?.depthAt(x, z);
    return typeof depth == 'number' && Number.isFinite(depth) ? depth : 0;
  } catch {
    return 0;
  }
}
export function groundHeightAt(ctx, x, z, y = Infinity) {
  const skyY = skySurfaceAt(ctx, x, z);
  if (skyY !== null && y > skyY - SKY_MARGIN) return skyY;
  try {
    const height = ctx.terrain?.heightAt(x, z);
    return typeof height == 'number' && Number.isFinite(height) ? height : 0;
  } catch {
    return 0;
  }
}
export function floorHeightAt(ctx, x, z, y = Infinity) {
  const skyY = skySurfaceAt(ctx, x, z);
  return skyY !== null && y > skyY - SKY_MARGIN
    ? skyY
    : Math.max(groundHeightAt(ctx, x, z, -Infinity), waterLevel(ctx));
}
export function skyIsland(ctx) {
  try {
    const sky = ctx.sky;
    const center = sky?.center;
    if (center && Number.isFinite(center.x + center.y + center.z))
      return {
        x: center.x,
        y: center.y,
        z: center.z,
        radius: Number.isFinite(sky.radius) ? sky.radius : SKY_ISLAND.radius,
      };
  } catch {}
  return {
    x: SKY_ISLAND.x,
    y: SKY_ISLAND.y,
    z: SKY_ISLAND.z,
    radius: SKY_ISLAND.radius,
  };
}
export function skyFactor(ctx, pos) {
  if (!pos || !Number.isFinite(pos.x + pos.y + pos.z)) return 0;
  try {
    if (ctx.sky && !ctx.sky.isStub && ctx.sky.isOnSky(pos, 6)) return 1;
  } catch {}
  const island = skyIsland(ctx);
  const dist = Math.hypot(pos.x - island.x, pos.z - island.z);
  const radius = island.radius;
  const radial = 1 - smooth01((dist - radius * 1.6) / (radius * 1.6));
  const vertical = 1 - smooth01((island.y - 25 - pos.y) / 35);
  return Math.max(0, Math.min(1, radial * vertical));
}
function smooth01(x) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}
