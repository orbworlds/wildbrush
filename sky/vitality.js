/**
 * The sky's vitality map: how much colour each spot has regained, restored in spreading prismatic waves when paint lands or foes fall. Also the GLSL that greys out drained ground and the skyify patch that adds it to a material.
 */
import { ClampToEdgeWrapping, DataTexture, LinearFilter, RedFormat, UnsignedByteType, Vector4 } from 'three';
import { clamp, makeNoise2D, smoothstep } from '../core/math.js';
const vitalityEdgeNoise = makeNoise2D('sky-vitality-edge');
const MAX_BLOOM_WAVES = 12;
export class SkyVitality {
  minX;
  minZ;
  size;
  res;
  texel;
  data;
  texture;
  dirty = false;
  waves = [];
  uniforms;
  constructor(minX, minZ, size, res = 256) {
    this.minX = minX;
    this.minZ = minZ;
    this.size = size;
    this.res = res;
    this.texel = size / res;
    this.data = new Uint8Array(res * res);
    const texture = new DataTexture(this.data, res, res, RedFormat, UnsignedByteType);
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.unpackAlignment = 1;
    texture.name = 'sky-vitality';
    texture.needsUpdate = true;
    this.texture = texture;
    this.uniforms = {
      uSkyVit: {
        value: texture,
      },
      uSkyVitXf: {
        value: new Vector4(minX, minZ, 1 / size, 1 / size),
      },
      uSkyWaves: {
        value: [0, 1, 2, 3].map(() => new Vector4(0, 0, 0, 0)),
      },
      uSkyVitAll: {
        value: 0,
      },
    };
  }
  at(x, z) {
    const res = this.res;
    const gx = clamp((x - this.minX) / this.texel - 0.5, 0, res - 1.001);
    const gz = clamp((z - this.minZ) / this.texel - 0.5, 0, res - 1.001);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fz = gz - z0;
    const data = this.data;
    const idx = z0 * res + x0;
    const row0 = data[idx] + (data[idx + 1] - data[idx]) * fx;
    return (row0 + (data[idx + res] + (data[idx + res + 1] - data[idx + res]) * fx - row0) * fz) / 255;
  }
  restore(x, z, radius, strength = 1, feather = 0.35, inner = 0) {
    if (!(radius > 0) || !Number.isFinite(x + z)) return;
    const res = this.res;
    const core = radius * (1 - feather);
    const gx = (x - this.minX) / this.texel - 0.5;
    const gz = (z - this.minZ) / this.texel - 0.5;
    const rTex = radius / this.texel;
    const x0 = Math.max(0, Math.floor(gx - rTex));
    const x1 = Math.min(res - 1, Math.ceil(gx + rTex));
    const z0 = Math.max(0, Math.floor(gz - rTex));
    const z1 = Math.min(res - 1, Math.ceil(gz + rTex));
    if (x0 > x1 || z0 > z1) return;
    const inner2 = Math.max(0, inner - this.texel) ** 2;
    const level = clamp(strength, 0, 1);
    const data = this.data;
    for (let i = z0; i <= z1; i++) {
      const dz = this.minZ + (i + 0.5) * this.texel - z;
      for (let j = x0; j <= x1; j++) {
        const dx = this.minX + (j + 0.5) * this.texel - x;
        const d2 = dx * dx + dz * dz;
        if (d2 > radius * radius || d2 < inner2) continue;
        let dist = Math.sqrt(d2);
        if (dist > core * 0.8) {
          const wx = x + dx;
          const wz = z + dz;
          dist +=
            (vitalityEdgeNoise(wx * 0.035, wz * 0.035) * 0.14 + vitalityEdgeNoise(wx * 0.13 + 7, wz * 0.13) * 0.05) *
            radius;
        }
        const value = Math.round(level * (1 - smoothstep(core, radius, dist)) * 255);
        const idx = i * res + j;
        if (value > data[idx]) {
          data[idx] = value;
          this.dirty = true;
        }
      }
    }
  }
  bloom(x, z, radius, duration = 2.5, glow = 1) {
    if (radius > 0 && Number.isFinite(x + z)) {
      if (this.waves.length >= MAX_BLOOM_WAVES) {
        const oldest = this.waves.shift();
        this.restore(oldest.x, oldest.z, oldest.radius, 1, 0.35);
      }
      this.waves.push({
        x,
        z,
        radius,
        duration: Math.max(0.1, duration),
        t: 0,
        written: 0,
        glow,
      });
    }
  }
  restoreAll() {
    this.data.fill(255);
    this.dirty = true;
  }
  update(dt) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i];
      wave.t += dt;
      const progress = clamp(wave.t / wave.duration, 0, 1);
      const front = wave.radius * (1 - (1 - progress) * (1 - progress));
      if (front - wave.written > this.texel * 1.5 || progress >= 1) {
        this.restore(wave.x, wave.z, front, 1, 0.3, wave.written * 0.9);
        wave.written = front;
      }
      if (progress >= 1 && wave.t > wave.duration + 0.6) this.waves.splice(i, 1);
    }
    const uSkyWaves = this.uniforms.uSkyWaves.value;
    for (let i = 0; i < 4; i++) {
      const wave = this.waves[this.waves.length - 1 - i];
      if (!wave) {
        uSkyWaves[i].set(0, 0, 0, 0);
        continue;
      }
      const progress = clamp(wave.t / wave.duration, 0, 1);
      const front = wave.radius * (1 - (1 - progress) * (1 - progress));
      const fade = 1 - smoothstep(wave.duration, wave.duration + 0.6, wave.t);
      uSkyWaves[i].set(wave.x, wave.z, front, wave.glow * fade);
    }
    if (this.dirty) {
      this.dirty = false;
      this.texture.needsUpdate = true;
    }
  }
  get busy() {
    return this.waves.length > 0;
  }
}
export const SKY_VITALITY_GLSL = `
#include <wb_common>
#ifndef WB_SKY_VIT
#define WB_SKY_VIT
uniform sampler2D uSkyVit;
uniform vec4 uSkyVitXf;
uniform vec4 uSkyWaves[4];
uniform float uSkyVitAll;
float skyVitality(vec3 p) {
  vec2 uv = (p.xz - uSkyVitXf.xy) * uSkyVitXf.zw;
  return max(textureLod(uSkyVit, uv, 0.0).r, uSkyVitAll);
}
float skyVitShaped(vec3 p) {
  float v = skyVitality(p);
  if (v > 0.995) return 1.0;
  if (v < 0.005) return 0.0;
  float n = wbNoise2(p.xz * 0.09) * 0.6 + wbNoise2(p.xz * 0.37 + 3.1) * 0.28 + wbNoise2(p.xz * 1.9 + 7.7) * 0.12;
  return smoothstep(0.14, 0.86, v + (n - 0.5) * 0.5);
}
vec3 skyFade(vec3 c, vec3 p) {
  float l = wbLuma(c);
  vec3 f = mix(vec3(l), c, 0.3);
  // grey-lavender wash: the colour the storm left behind
  f = mix(f, f * vec3(0.98, 0.94, 1.12), 0.6);
  float gran = wbNoise2(p.xz * 0.31 + p.y * 0.05) * 0.6 + wbNoise2(p.xz * 1.7 + 5.0) * 0.4;
  return f * (0.88 + 0.1 * gran) + vec3(0.04, 0.036, 0.062) * (0.7 + l);
}
float skyBoost(vec3 p) {
  float b = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 w = uSkyWaves[i];
    if (w.w <= 0.0) continue;
    float behind = w.z - length(p.xz - w.xy);
    b = max(b, smoothstep(0.0, 1.5, behind) * smoothstep(9.0 + w.z * 0.1, 0.0, behind) * w.w);
  }
  return b;
}
vec3 skyApplyVitRaw(vec3 c, vec3 p) {
  float v = skyVitShaped(p);
  float b = skyBoost(p);
  vec3 rich = max(wbSaturation(c, 1.1 + b * 0.45) * (1.0 + b * 0.12), vec3(0.0));
  if (v >= 1.0) return rich;
  return mix(skyFade(c, p), rich, v);
}
vec3 skyVitGlow(vec3 p) {
  vec3 g = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 w = uSkyWaves[i];
    if (w.w <= 0.0) continue;
    vec2 dv = p.xz - w.xy;
    float d = length(dv);
    if (d > w.z + 12.0) continue;
    float width = 0.55 + w.z * 0.022;
    float wob = (wbNoise2(p.xz * 0.21 + w.xy) - 0.5) * (1.5 + w.z * 0.08);
    float x = (d + wob - w.z) / width;
    float front = exp(-x * x);
    float core = exp(-x * x * 6.0);
    float hue = fract(d * 0.018 + atan(dv.y, dv.x) * 0.159 + uTime * 0.15);
    vec3 prism = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));
    prism *= prism;
    g += (prism * front * 1.1 + vec3(1.0, 0.95, 0.82) * core * 0.8) * w.w;
  }
  return g * 0.6;
}
vec3 skyApplyVit(vec3 c, vec3 p) {
  vec3 r = skyApplyVitRaw(c, p);
  return r + skyVitGlow(p) * (0.35 + r);
}
#endif
`;
const SKY_VITALITY_ALIASES_GLSL = `
#define wbApplyVitality skyApplyVit
#define wbApplyVitalityRaw skyApplyVitRaw
#define wbVitalityGlow skyVitGlow
#define wbVitality skyVitality
`;
export function skyify(material, vit, key = 'sky') {
  try {
    const onBeforeCompile = material.onBeforeCompile;
    const customProgramCacheKey = material.customProgramCacheKey;
    material.onBeforeCompile = function (shader, renderer) {
      try {
        onBeforeCompile.call(this, shader, renderer);
      } catch (err) {
        console.warn('[sky] chained onBeforeCompile threw', err);
      }
      Object.assign(shader.uniforms, vit.uniforms);
      const prelude = `${SKY_VITALITY_GLSL}\n${SKY_VITALITY_ALIASES_GLSL}\nvoid main() {`;
      shader.vertexShader = shader.vertexShader.replace('void main() {', prelude);
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', prelude);
    };
    material.customProgramCacheKey = function () {
      let prev = '';
      try {
        prev = customProgramCacheKey.call(this);
      } catch {}
      return `${prev}|${key}`;
    };
    material.needsUpdate = true;
  } catch (err) {
    console.warn('[sky] skyify failed', err);
  }
}
