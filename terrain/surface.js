/**
 * Turns the heightmap into vertex normals, two splat-weight maps, a surface type per cell (grass, dirt, sand, rock, path or snow) and a grass density map.
 */
import { clamp, fbm, makeNoise2D, smoothstep } from '../core/math.js';
import { TERRAIN_RES } from './heightmap.js';
export const SURFACES = ['grass', 'dirt', 'sand', 'rock', 'path', 'snow'];
const patchNoise = makeNoise2D('wb-surf-patch');
const edgeNoise = makeNoise2D('wb-surf-edge');
export function computeSurface(maps) {
  const n2 = TERRAIN_RES;
  const heights = maps.heights;
  const count = n2 * n2;
  const normals = new Float32Array(count * 3);
  const splatA = new Uint8Array(count * 4);
  const splatB = new Uint8Array(count * 4);
  const surface = new Uint8Array(count);
  const grass = new Float32Array(count);
  const toByte = (v) => Math.round(clamp(v, 0, 1) * 255);
  for (let i = 0; i < n2; i++) {
    const z2 = i - 160;
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n2 - 1, i + 1);
    for (let j2 = 0; j2 < n2; j2++) {
      const x2 = j2 - 160;
      const j0 = Math.max(0, j2 - 1);
      const j1 = Math.min(n2 - 1, j2 + 1);
      const idx = i * n2 + j2;
      const h = heights[idx];
      const dx = (heights[i * n2 + j1] - heights[i * n2 + j0]) / (j1 - j0);
      const dz = (heights[i1 * n2 + j2] - heights[i0 * n2 + j2]) / (i1 - i0);
      const inv = 1 / Math.hypot(dx, 1, dz);
      const nx = -dx * inv;
      const ny = inv;
      const nz = -dz * inv;
      normals[idx * 3] = nx;
      normals[idx * 3 + 1] = ny;
      normals[idx * 3 + 2] = nz;
      const edgeN = edgeNoise(x2 * 0.11, z2 * 0.11) * 0.5 + edgeNoise(x2 * 0.37 + 9, z2 * 0.37) * 0.25;
      const coastD = maps.coast[idx];
      const cliffV = maps.cliff[idx];
      const lakeV = maps.lake[idx];
      let rock = smoothstep(0.76, 0.64, ny + edgeN * 0.04);
      rock = Math.max(rock, maps.rockBias[idx] * smoothstep(0.93, 0.8, ny) + maps.rockBias[idx] * 0.35);
      rock = Math.max(rock, cliffV * smoothstep(9, 2, coastD) * smoothstep(-0.5, 1.5, h));
      if (h < -1.5) rock = Math.max(rock, cliffV * smoothstep(-1.5, -5, h));
      rock = clamp(rock, 0, 1);
      const beachLift = 1.5 * Math.exp(-((x2 - 72) ** 2 + (z2 - 118) ** 2) / 1156);
      let sand =
        smoothstep(2.4 + beachLift, 1.5 + beachLift, h + edgeN * 0.8) *
        (1 - smoothstep(0.35, 0.7, cliffV)) *
        smoothstep(36, 22, coastD) *
        (1 - lakeV);
      if (h < 0.4 && lakeV < 0.5) sand = Math.max(sand, (1 - cliffV * 0.8) * smoothstep(0.4, -0.2, h));
      sand *= 1 - rock * 0.9;
      let dirt = 0;
      dirt = Math.max(dirt, lakeV * smoothstep(1.6, 0.4, h + edgeN * 0.6));
      dirt = Math.max(dirt, smoothstep(0.8, 0.74, ny) * 0.45);
      dirt = Math.max(dirt, maps.sandstone[idx] * 0.55 * (1 - maps.pad[idx]));
      const forest = Math.exp(-((x2 - 88) ** 2 + (z2 - 45) ** 2) / 1296);
      dirt = Math.max(
        dirt,
        smoothstep(0.62, 0.8, fbm(patchNoise, x2 * 0.04, z2 * 0.04, 3) * 0.5 + 0.5) * 0.75 * forest,
      );
      dirt = Math.max(dirt, maps.pad[idx] * 0.35);
      dirt *= 1 - sand;
      const path = maps.path[idx] * (1 - rock);
      const snow = smoothstep(58.5, 62.5, h + edgeN * 3) * smoothstep(0.6, 0.78, ny);
      const dry = maps.dry[idx];
      splatA[idx * 4] = toByte(dirt);
      splatA[idx * 4 + 1] = toByte(sand);
      splatA[idx * 4 + 2] = toByte(rock);
      splatA[idx * 4 + 3] = toByte(maps.lush[idx]);
      splatB[idx * 4] = toByte(path);
      splatB[idx * 4 + 1] = toByte(dry);
      splatB[idx * 4 + 2] = toByte(snow);
      splatB[idx * 4 + 3] = toByte(maps.sandstone[idx]);
      let kind = 0;
      if (dirt > 0.5) kind = 1;
      if (sand > 0.5) kind = 2;
      if (path > 0.5) kind = 4;
      if (rock > 0.5) kind = 3;
      if (snow > 0.5) kind = 5;
      surface[idx] = kind;
      let grassV = (1 - rock) * (1 - sand) * (1 - path) * (1 - snow) * (1 - dirt * 0.85);
      grassV *= smoothstep(0.72, 0.86, ny);
      grassV *= smoothstep(0.4, 1.2, h);
      grassV *= maps.lush[idx];
      grassV *= 1 - maps.pad[idx] * 0.85;
      if (kind !== 0) grassV = Math.min(grassV, 0.15);
      if (kind === 2 || kind === 3 || kind === 4 || kind === 5) grassV = 0;
      grass[idx] = clamp(grassV, 0, 1);
    }
  }
  return {
    normals,
    splatA,
    splatB,
    surface,
    grass,
  };
}
