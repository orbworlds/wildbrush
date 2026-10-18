/**
 * The vegetation field: terrain height, grass density, dryness, canopy shade and slope baked on a grid over the island and uploaded as a float texture that grass, flowers and rocks sample in their shaders. Grass can be cleared from discs of it and trees splat their shade into it.
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  Vector4,
} from 'three';
import { DRY_MEADOW } from '../core/config.js';
import { clamp, fbm, makeNoise2D, smoothstep } from '../core/math.js';
export class VegField {
  ctx;
  res;
  n;
  min = -160;
  height;
  density;
  dry;
  canopy;
  slope;
  texture;
  xf = new Vector4();
  data;
  half = false;
  constructor(ctx, res) {
    this.ctx = ctx;
    this.res = res;
    this.n = Math.round(320 * res) + 1;
    const count = this.n * this.n;
    this.height = new Float32Array(count);
    this.density = new Float32Array(count);
    this.dry = new Float32Array(count);
    this.canopy = new Float32Array(count);
    this.slope = new Float32Array(count);
  }
  async bake() {
    const { terrain } = this.ctx;
    const n2 = this.n;
    const step = 1 / this.res;
    const edgeNoise = makeNoise2D('veg-dry-edge');
    let lastYield = performance.now();
    for (let j = 0; j < n2; j++) {
      const z = this.min + j * step;
      for (let k = 0; k < n2; k++) {
        const x = this.min + k * step;
        const idx = j * n2 + k;
        let h = 0;
        let dens = 0;
        try {
          h = terrain.heightAt(x, z);
          dens = terrain.grassDensityAt(x, z);
        } catch {}
        this.height[idx] = Number.isFinite(h) ? h : 0;
        this.density[idx] = Number.isFinite(dens) ? clamp(dens, 0, 1) : 0;
        const dist = Math.hypot(x - DRY_MEADOW.x, z - DRY_MEADOW.z) + fbm(edgeNoise, x * 0.05, z * 0.05, 3) * 9;
        this.dry[idx] = smoothstep(DRY_MEADOW.radius + 4, DRY_MEADOW.radius * 0.55, dist);
      }
      if (performance.now() - lastYield > 40) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }
    for (let i = 0; i < n2; i++)
      for (let j = 0; j < n2; j++) {
        const idx = i * n2 + j;
        const hx0 = this.height[i * n2 + Math.max(0, j - 1)];
        const hx1 = this.height[i * n2 + Math.min(n2 - 1, j + 1)];
        const hz0 = this.height[Math.max(0, i - 1) * n2 + j];
        const hz1 = this.height[Math.min(n2 - 1, i + 1) * n2 + j];
        const gx = (hx1 - hx0) * this.res * 0.5;
        const gz = (hz1 - hz0) * this.res * 0.5;
        const ny = 1 / Math.sqrt(1 + gx * gx + gz * gz);
        this.slope[idx] = 1 - ny;
      }
  }
  bilerp(grid, x, z) {
    const n = this.n;
    const gx = clamp((x - this.min) * this.res, 0, n - 1.0001);
    const gz = clamp((z - this.min) * this.res, 0, n - 1.0001);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fz = gz - z0;
    const idx = z0 * n + x0;
    const v00 = grid[idx];
    const v10 = grid[idx + 1];
    const v01 = grid[idx + n];
    const v11 = grid[idx + n + 1];
    return (v00 * (1 - fx) + v10 * fx) * (1 - fz) + (v01 * (1 - fx) + v11 * fx) * fz;
  }
  clearDisc(x, z, radius, feather = 1.5) {
    const n = this.n;
    const reach = (radius + feather) * this.res;
    const cx = (x - this.min) * this.res;
    const cz = (z - this.min) * this.res;
    for (let i = Math.max(0, Math.floor(cz - reach)); i <= Math.min(n - 1, Math.ceil(cz + reach)); i++)
      for (let j = Math.max(0, Math.floor(cx - reach)); j <= Math.min(n - 1, Math.ceil(cx + reach)); j++) {
        const d = Math.hypot(j - cx, i - cz) / this.res;
        const keep = smoothstep(radius, radius + feather, d);
        const idx = i * n + j;
        this.density[idx] *= keep;
      }
  }
  heightAt(x, z) {
    return this.bilerp(this.height, x, z);
  }
  densityAt(x, z) {
    return this.bilerp(this.density, x, z);
  }
  dryAt(x, z) {
    return this.bilerp(this.dry, x, z);
  }
  canopyAt(x, z) {
    return this.bilerp(this.canopy, x, z);
  }
  slopeAt(x, z) {
    return this.bilerp(this.slope, x, z);
  }
  splatCanopy(x, z, radius, strength) {
    const n2 = this.n;
    const reach = radius * this.res;
    const cx = (x - this.min) * this.res;
    const cz = (z - this.min) * this.res;
    const x0 = Math.max(0, Math.floor(cx - reach));
    const x1 = Math.min(n2 - 1, Math.ceil(cx + reach));
    const z0 = Math.max(0, Math.floor(cz - reach));
    const z1 = Math.min(n2 - 1, Math.ceil(cz + reach));
    for (let i = z0; i <= z1; i++)
      for (let j = x0; j <= x1; j++) {
        const d = Math.hypot(j - cx, i - cz) / reach;
        if (d >= 1) continue;
        const w = (1 - d * d) * strength;
        const idx = i * n2 + j;
        this.canopy[idx] = Math.min(1, this.canopy[idx] + w * (1 - this.canopy[idx]));
      }
  }
  upload() {
    const n2 = this.n;
    const count = n2 * n2;
    if (!this.texture) {
      const floatLinear = !!this.ctx.renderer.extensions.has?.('OES_texture_float_linear');
      this.half = !floatLinear;
      this.data = this.half ? new Uint16Array(count * 4) : new Float32Array(count * 4);
      this.texture = new DataTexture(this.data, n2, n2, RGBAFormat, this.half ? HalfFloatType : FloatType);
      this.texture.magFilter = LinearFilter;
      this.texture.minFilter = LinearFilter;
      this.texture.wrapS = this.texture.wrapT = ClampToEdgeWrapping;
      this.texture.generateMipmaps = false;
      this.xf.set(this.min, this.res / n2, 0.5 / n2, n2);
    }
    const data = this.data;
    const toHalfFloat = DataUtils.toHalfFloat;
    for (let i = 0; i < count; i++) {
      const p = i * 4;
      if (this.half) {
        data[p] = toHalfFloat(this.height[i]);
        data[p + 1] = toHalfFloat(this.density[i]);
        data[p + 2] = toHalfFloat(this.dry[i]);
        data[p + 3] = toHalfFloat(this.canopy[i]);
      } else {
        data[p] = this.height[i];
        data[p + 1] = this.density[i];
        data[p + 2] = this.dry[i];
        data[p + 3] = this.canopy[i];
      }
    }
    this.texture.needsUpdate = true;
    return this.texture;
  }
}
