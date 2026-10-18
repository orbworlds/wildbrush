/**
 * A baked texture over the isles holding ground height, grass density and tree canopy, which the grass and flower shaders sample.
 */
import { ClampToEdgeWrapping, DataTexture, FloatType, LinearFilter, RGBAFormat, Vector4 } from 'three';
export class SkyVegField {
  minX;
  minZ;
  size;
  n;
  cell;
  data;
  texture;
  xf;
  constructor(minX, minZ, size, isles, clearings, texelsPerUnit = 2) {
    this.minX = minX;
    this.minZ = minZ;
    this.size = size;
    const res = Math.min(512, Math.ceil(size * texelsPerUnit));
    this.n = res;
    this.cell = size / res;
    this.data = new Float32Array(res * res * 4);
    const loc = {
      i0: 0,
      i1: 0,
      i2: 0,
      w0: 0,
      w1: 0,
      w2: 0,
    };
    for (let i = 0; i < res; i++) {
      const z = minZ + (i + 0.5) * this.cell;
      for (let j = 0; j < res; j++) {
        const x = minX + (j + 0.5) * this.cell;
        const idx = (i * res + j) * 4;
        let height = -1000;
        let grass = 0;
        let found = false;
        for (const isle of isles)
          if (isle.locate(x, z, loc)) {
            height = isle.heightFrom(loc);
            grass = isle.grassFrom(loc);
            found = true;
            break;
          }
        if (!found) {
          let nearest = null;
          let best = Infinity;
          for (const isle of isles) {
            const gap = Math.hypot(x - isle.cx, z - isle.cz) - isle.maxR;
            if (gap < best) {
              best = gap;
              nearest = isle;
            }
          }
          if (nearest && best < 6) {
            const rt = nearest.radialT(x, z);
            const pull = 0.985 / Math.max(rt, 0.001);
            const ex = nearest.cx + (x - nearest.cx) * pull;
            const ez = nearest.cz + (z - nearest.cz) * pull;
            height = nearest.locate(ex, ez, loc) ? nearest.heightFrom(loc) : nearest.def.y;
          }
        }
        if (grass > 0)
          for (const clearing of clearings) {
            const dist = Math.hypot(x - clearing.x, z - clearing.z);
            if (dist < clearing.r + 0.6) grass *= Math.min(1, Math.max(0, (dist - clearing.r) / 0.6));
          }
        this.data[idx] = height;
        this.data[idx + 1] = grass;
        this.data[idx + 2] = 0;
        this.data[idx + 3] = 0;
      }
    }
    const texture = new DataTexture(this.data, res, res, RGBAFormat, FloatType);
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.name = 'sky-veg-field';
    texture.needsUpdate = true;
    this.texture = texture;
    this.xf = new Vector4(minX, minZ, 1 / size, 1 / size);
  }
  splatCanopy(x, z, radius, amount) {
    const res = this.n;
    const x0 = Math.max(0, Math.floor((x - radius - this.minX) / this.cell));
    const x1 = Math.min(res - 1, Math.ceil((x + radius - this.minX) / this.cell));
    const z0 = Math.max(0, Math.floor((z - radius - this.minZ) / this.cell));
    const z1 = Math.min(res - 1, Math.ceil((z + radius - this.minZ) / this.cell));
    for (let i = z0; i <= z1; i++)
      for (let j = x0; j <= x1; j++) {
        const wx = this.minX + (j + 0.5) * this.cell;
        const wz = this.minZ + (i + 0.5) * this.cell;
        const d = Math.hypot(wx - x, wz - z) / radius;
        if (d >= 1) continue;
        const idx = (i * res + j) * 4 + 3;
        this.data[idx] = Math.max(this.data[idx], amount * (1 - d * d));
      }
    this.texture.needsUpdate = true;
  }
}
export const SKY_FIELD_GLSL = `
uniform sampler2D uSkyField;
uniform vec4 uSkyFieldXf;
vec4 skyField(vec2 xz) { return texture(uSkyField, (xz - uSkyFieldXf.xy) * uSkyFieldXf.zw); }
`;
