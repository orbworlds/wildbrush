/**
 * Shared helpers for the element effects: particle budgets per quality setting, the tiling noise texture used by flames, smoke, ice and props, the fog GLSL helper, and small random and hash functions.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipMapLinearFilter,
  Matrix4,
  Quaternion,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from 'three';
export function fireBudget(quality) {
  switch (quality) {
    case 'low':
      return {
        flames: 700,
        puffs: 700,
        glows: 1200,
        lights: 2,
        smokeRate: 28,
        emberRate: 110,
      };
    case 'medium':
      return {
        flames: 1300,
        puffs: 1100,
        glows: 2200,
        lights: 3,
        smokeRate: 45,
        emberRate: 200,
      };
    default:
      return {
        flames: 2000,
        puffs: 1600,
        glows: 3200,
        lights: 4,
        smokeRate: 65,
        emberRate: 300,
      };
  }
}
let noiseTexture = null;
export function getNoiseTexture() {
  if (noiseTexture) return noiseTexture;
  const bytes = new Uint8Array(65536);
  const randomGrid = (seed, size) => {
    const grid = new Float32Array(size * size);
    let state = seed * 9301 + 49297;
    for (let i = 0; i < grid.length; i++) {
      state = (state * 16807) % 2147483647;
      grid[i] = (state & 65535) / 65535;
    }
    return grid;
  };
  const sampleGrid = (grid, size, px, py) => {
    const gx = (px / 128) * size;
    const gy = (py / 128) * size;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const ix0 = x0 % size;
    const iy0 = y0 % size;
    const ix1 = (ix0 + 1) % size;
    const iy1 = (iy0 + 1) % size;
    const v00 = grid[iy0 * size + ix0];
    const v10 = grid[iy0 * size + ix1];
    const v01 = grid[iy1 * size + ix0];
    const v11 = grid[iy1 * size + ix1];
    return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
  };
  const fbm = (seed, size, octaves, px, py, grids) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * sampleGrid(grids[i], size << i, px, py);
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
  const makeOctaves = (seed, size, octaves) => {
    const grids = [];
    for (let i = 0; i < octaves; i++) grids.push(randomGrid(seed * 31 + i * 7 + 1, size << i));
    return grids;
  };
  const gridsR = makeOctaves(1, 4, 4);
  const gridsG = makeOctaves(2, 8, 4);
  const gridsB = makeOctaves(3, 2, 4);
  const gridsA = makeOctaves(4, 8, 3);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const idx = (y * 128 + x) * 4;
      const r = fbm(1, 4, 4, x, y, gridsR);
      const g = fbm(2, 8, 4, x, y, gridsG);
      const b = fbm(3, 2, 4, x, y, gridsB);
      const ridgeBase = fbm(4, 8, 3, x, y, gridsA);
      const ridge = 1 - Math.abs(ridgeBase * 2 - 1);
      const contrast = (v) => Math.max(0, Math.min(1, (v - 0.5) * 2.1 + 0.5));
      bytes[idx] = contrast(r) * 255;
      bytes[idx + 1] = contrast(g) * 255;
      bytes[idx + 2] = contrast(b) * 255;
      bytes[idx + 3] = ridge ** 3 * 255;
    }
  const texture = new DataTexture(bytes, 128, 128, RGBAFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipMapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = '';
  texture.needsUpdate = true;
  noiseTexture = texture;
  return texture;
}
export const FOG_AMOUNT_GLSL = `
float wbFogAmount() {
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      return 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      return smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #else
    return 0.0;
  #endif
}
`;
new Vector3();
new Vector3();
new Quaternion();
new Matrix4();
export function rand(min, max) {
  return min + Math.random() * (max - min);
}
export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
