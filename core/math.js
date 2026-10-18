/**
 * Seeded random numbers, seeded simplex noise and fBm, and the clamp, lerp, smoothstep and damp helpers.
 */
import { createNoise2D, createNoise3D } from 'simplex-noise';
export function makeRng(seed) {
  const str = String(seed);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const nextSeed = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
  let a2 = nextSeed();
  let b = nextSeed();
  let c = nextSeed();
  let d = nextSeed();
  return () => {
    a2 |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a2 + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a2 = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
export function makeNoise2D(seed = 'wildbrush') {
  return createNoise2D(makeRng(seed));
}
export function makeNoise3D(seed = 'wildbrush') {
  return createNoise3D(makeRng(seed));
}
export function fbm(noise, x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
