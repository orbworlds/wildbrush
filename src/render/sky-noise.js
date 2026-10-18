/**
 * Tileable Perlin and Worley noise baked into the RGBA noise texture that the sky and cloud shaders sample.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipMapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { makeRng } from '../core/math.js';
function makeTileablePerlin(seed, period) {
  const rng = makeRng(seed);
  const gradX = new Float32Array(period * period);
  const gradY = new Float32Array(period * period);
  for (let i = 0; i < period * period; i++) {
    const angle = rng() * Math.PI * 2;
    gradX[i] = Math.cos(angle);
    gradY[i] = Math.sin(angle);
  }
  const size = period;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y2) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y2);
    const fx = x - x0;
    const fy = y2 - y0;
    const ix0 = ((x0 % size) + size) % size;
    const iy0 = ((y0 % size) + size) % size;
    const ix1 = (ix0 + 1) % size;
    const iy1 = (iy0 + 1) % size;
    const grad = (ix, iy, dx, dy) => gradX[iy * size + ix] * dx + gradY[iy * size + ix] * dy;
    const u = fade(fx);
    const v2 = fade(fy);
    const n00 = grad(ix0, iy0, fx, fy);
    const n10 = grad(ix1, iy0, fx - 1, fy);
    const n01 = grad(ix0, iy1, fx, fy - 1);
    const n11 = grad(ix1, iy1, fx - 1, fy - 1);
    return (n00 + (n10 - n00) * u) * (1 - v2) + (n01 + (n11 - n01) * u) * v2;
  };
}
function makeTileableWorley(seed, period) {
  const rng = makeRng(seed);
  const jitterX = new Float32Array(period * period);
  const jitterY = new Float32Array(period * period);
  for (let i = 0; i < period * period; i++) {
    jitterX[i] = rng();
    jitterY[i] = rng();
  }
  const size = period;
  return (x, y) => {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    let minDist2 = 9;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const cx = cellX + j;
        const cy = cellY + i;
        const index = (((cy % size) + size) % size) * size + (((cx % size) + size) % size);
        const dx = cx + jitterX[index] - x;
        const dy = cy + jitterY[index] - y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < minDist2) minDist2 = dist2;
      }
    return Math.sqrt(minDist2);
  };
}
export function createSkyNoiseTexture(size = 256) {
  const bytes = new Uint8Array(size * size * 4);
  const perlinR = [4, 8, 16, 32, 64].map((freq, i) => makeTileablePerlin('sky-r' + i, freq));
  const perlinB = [8, 16, 32, 64].map((freq, i) => makeTileablePerlin('sky-b' + i, freq));
  const worley1 = makeTileableWorley('sky-w1', 6);
  const worley2 = makeTileableWorley('sky-w2', 12);
  const worley3 = makeTileableWorley('sky-w3', 16);
  const worley4 = makeTileableWorley('sky-w4', 32);
  const freqsR = [4, 8, 16, 32, 64];
  const freqsB = [8, 16, 32, 64];
  for (let y2 = 0; y2 < size; y2++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v2 = y2 / size;
      let r = 0;
      let amp = 0.5;
      let norm = 0;
      for (let k = 0; k < perlinR.length; k++) {
        r += perlinR[k](u * freqsR[k], v2 * freqsR[k]) * amp;
        norm += amp;
        amp *= 0.5;
      }
      r = (r / norm / 0.55) * 0.5 + 0.5;
      let b2 = 0;
      amp = 0.5;
      norm = 0;
      for (let k = 0; k < perlinB.length; k++) {
        b2 += perlinB[k](u * freqsB[k], v2 * freqsB[k]) * amp;
        norm += amp;
        amp *= 0.5;
      }
      b2 = (b2 / norm / 0.55) * 0.5 + 0.5;
      const g = (1 - worley1(u * 6, v2 * 6)) * 0.65 + (1 - worley2(u * 12, v2 * 12)) * 0.35;
      const a = (1 - worley3(u * 16, v2 * 16)) * 0.6 + (1 - worley4(u * 32, v2 * 32)) * 0.4;
      const index = (y2 * size + x) * 4;
      bytes[index] = Math.max(0, Math.min(255, r * 255));
      bytes[index + 1] = Math.max(0, Math.min(255, g * 255));
      bytes[index + 2] = Math.max(0, Math.min(255, b2 * 255));
      bytes[index + 3] = Math.max(0, Math.min(255, a * 255));
    }
  const texture = new DataTexture(bytes, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipMapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = '';
  texture.needsUpdate = true;
  return texture;
}
