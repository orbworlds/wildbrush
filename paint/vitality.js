/**
 * Vitality map: a 512 by 512 texture of how alive the land is, from faded watercolour to vivid colour. Bloom waves restore it in expanding rings and feed their glowing fronts to shaders, drain clears it, and changes upload as dirty rectangles.
 */
import {
  Box2,
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RedFormat,
  UnsignedByteType,
  Vector2,
  Vector4,
} from 'three';
import { clamp, makeNoise2D, smoothstep } from '../core/math.js';
import { VITALITY_MIN_X, VITALITY_MIN_Z, VITALITY_SIZE, VITALITY_TEXEL } from './constants.js';
const MAX_WAVES = 24;
const edgeNoise = makeNoise2D('wb-vitality-edge');
export class VitalityMap {
  texture;
  data = new Uint8Array(262144);
  src;
  dirty = false;
  d0x = 0;
  d0y = 0;
  d1x = 0;
  d1y = 0;
  waves = [];
  region = new Box2();
  dst = new Vector2();
  gpuReady = false;
  waveUniform = [0, 1, 2, 3].map(() => new Vector4(0, 0, 0, 0));
  constructor() {
    const texture = new DataTexture(this.data, 512, 512, RedFormat, UnsignedByteType);
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.unpackAlignment = 1;
    texture.name = 'wb-vitality';
    texture.needsUpdate = true;
    this.texture = texture;
    this.src = new DataTexture(this.data, 512, 512, RedFormat, UnsignedByteType);
    this.src.unpackAlignment = 1;
  }
  init(renderer) {
    try {
      renderer.initTexture(this.texture);
      this.gpuReady = true;
      this.dirty = false;
    } catch (err) {
      console.warn('[paint] vitality init failed', err);
    }
  }
  at(x, z) {
    const fx = clamp((x - VITALITY_MIN_X) / VITALITY_TEXEL - 0.5, 0, 510.999);
    const fz = clamp((z - VITALITY_MIN_Z) / VITALITY_TEXEL - 0.5, 0, 510.999);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const data = this.data;
    const idx = iz * 512 + ix;
    const row0 = data[idx] + (data[idx + 1] - data[idx]) * tx;
    return (row0 + (data[idx + 512] + (data[idx + 512 + 1] - data[idx + 512]) * tx - row0) * tz) / 255;
  }
  restore(x, z, radius, strength = 1, feather = 0.35, skipRadius = 0) {
    if (!(radius > 0)) return;
    const core = radius * (1 - feather);
    const cx = (x - VITALITY_MIN_X) / VITALITY_TEXEL - 0.5;
    const cz = (z - VITALITY_MIN_Z) / VITALITY_TEXEL - 0.5;
    const texRadius = radius / VITALITY_TEXEL;
    const x0 = Math.max(0, Math.floor(cx - texRadius));
    const x1 = Math.min(511, Math.ceil(cx + texRadius));
    const z0 = Math.max(0, Math.floor(cz - texRadius));
    const z1 = Math.min(511, Math.ceil(cz + texRadius));
    if (x0 > x1 || z0 > z1) return;
    const skipSq = Math.max(0, skipRadius - VITALITY_TEXEL) ** 2;
    const data = this.data;
    const level = clamp(strength, 0, 1);
    let changed = false;
    for (let i = z0; i <= z1; i++) {
      const dz = VITALITY_MIN_Z + (i + 0.5) * VITALITY_TEXEL - z;
      for (let j = x0; j <= x1; j++) {
        const dx = VITALITY_MIN_X + (j + 0.5) * VITALITY_TEXEL - x;
        const distSq = dx * dx + dz * dz;
        if (distSq > radius * radius || distSq < skipSq) continue;
        let dist = Math.sqrt(distSq);
        if (dist > core * 0.8) {
          const wx = x + dx;
          const wz = z + dz;
          dist += (edgeNoise(wx * 0.035, wz * 0.035) * 0.14 + edgeNoise(wx * 0.13 + 7, wz * 0.13) * 0.05) * radius;
        }
        const value = level * (1 - smoothstep(core, radius, dist));
        const texel = Math.round(value * 255);
        const idx = i * 512 + j;
        if (texel > data[idx]) {
          data[idx] = texel;
          changed = true;
        }
      }
    }
    if (changed) this.markDirty(x0, z0, x1, z1);
  }
  drain(x, z, radius) {
    const cx = (x - VITALITY_MIN_X) / VITALITY_TEXEL - 0.5;
    const cz = (z - VITALITY_MIN_Z) / VITALITY_TEXEL - 0.5;
    const texRadius = radius / VITALITY_TEXEL;
    const x0 = Math.max(0, Math.floor(cx - texRadius));
    const x1 = Math.min(511, Math.ceil(cx + texRadius));
    const z0 = Math.max(0, Math.floor(cz - texRadius));
    const z1 = Math.min(511, Math.ceil(cz + texRadius));
    for (let i = z0; i <= z1; i++)
      for (let j = x0; j <= x1; j++) {
        const dx = j - cx;
        const dz = i - cz;
        if (dx * dx + dz * dz <= texRadius * texRadius) this.data[i * 512 + j] = 0;
      }
    this.markDirty(x0, z0, x1, z1);
  }
  bloom(x, z, radius, duration, glow = 1) {
    if (radius > 0) {
      if (this.waves.length >= MAX_WAVES) {
        const oldest = this.waves.shift();
        this.restore(oldest.x, oldest.z, oldest.radius, 1, 0.3, oldest.written * 0.9);
      }
      this.waves.push({
        x,
        z,
        radius,
        duration: Math.max(0.05, duration),
        t: 0,
        written: 0,
        glow,
      });
    }
  }
  update(dt) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i];
      wave.t += dt;
      const progress = clamp(wave.t / wave.duration, 0, 1);
      const eased = 1 - (1 - progress) ** 2.2;
      const front = wave.radius * eased;
      if (front > wave.written + VITALITY_TEXEL * 0.5 || progress >= 1) {
        const feather = Math.min(0.5, 3 / Math.max(front, 1));
        this.restore(wave.x, wave.z, front, 1, progress >= 1 ? 0.3 : feather, Math.max(0, wave.written - 4));
        wave.written = front;
      }
      if (progress >= 1 && wave.t > wave.duration + 0.8) this.waves.splice(i, 1);
    }
    const glowing = this.waves
      .filter((wave) => wave.glow > 0)
      .sort((a, b) => b.radius * b.glow - a.radius * a.glow)
      .slice(0, 4);
    for (let i = 0; i < 4; i++) {
      const uniform = this.waveUniform[i];
      const wave = glowing[i];
      if (!wave) {
        uniform.set(0, 0, 0, 0);
        continue;
      }
      const progress = clamp(wave.t / wave.duration, 0, 1);
      const eased = 1 - (1 - progress) ** 2.2;
      const fadeIn = smoothstep(0, 0.12, progress);
      const fadeOut = 1 - smoothstep(wave.duration * 0.75, wave.duration + 0.8, wave.t);
      uniform.set(wave.x, wave.z, wave.radius * eased, wave.glow * fadeIn * fadeOut);
    }
  }
  get activeWaves() {
    return this.waves.length;
  }
  forEachWave(fn) {
    for (const wave of this.waves) {
      const progress = clamp(wave.t / wave.duration, 0, 1);
      if (!(progress >= 1))
        fn(wave.x, wave.z, wave.radius * (1 - (1 - progress) ** 2.2), wave.radius, progress, wave.glow);
    }
  }
  markDirty(d0x, d0y, d1x, d1y) {
    if (this.dirty) {
      this.d0x = Math.min(this.d0x, d0x);
      this.d0y = Math.min(this.d0y, d0y);
      this.d1x = Math.max(this.d1x, d1x);
      this.d1y = Math.max(this.d1y, d1y);
    } else {
      this.dirty = true;
      this.d0x = d0x;
      this.d0y = d0y;
      this.d1x = d1x;
      this.d1y = d1y;
    }
  }
  flush(renderer) {
    if (this.dirty && this.gpuReady) {
      this.dirty = false;
      this.region.min.set(this.d0x, this.d0y);
      this.region.max.set(this.d1x + 1, this.d1y + 1);
      this.dst.set(this.d0x, this.d0y);
      renderer.copyTextureToTexture(this.src, this.texture, this.region, this.dst);
    }
  }
  get bounds() {
    return new Vector4(VITALITY_MIN_X, VITALITY_MIN_Z, VITALITY_SIZE, VITALITY_SIZE);
  }
}
