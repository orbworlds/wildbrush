/**
 * Shared shader uniforms (time, wind, sun, heightmap, paint volume, vitality and burn maps) and the wb_* GLSL chunks every material includes, with no-op paint and burn chunks until those systems install their own.
 */
import { Color, Data3DTexture, DataTexture, FloatType, RedFormat, ShaderChunk, Vector2, Vector3, Vector4 } from 'three';
export function createGlobalUniforms() {
  const blackTex = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blackTex.needsUpdate = true;
  const whiteTex = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  whiteTex.needsUpdate = true;
  const volumeTex = new Data3DTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, 1);
  volumeTex.needsUpdate = true;
  const heightTex = new DataTexture(new Float32Array([0]), 1, 1, RedFormat, FloatType);
  heightTex.needsUpdate = true;
  const bounds = () => new Vector4(-160, -160, 320, 320);
  return {
    uTime: {
      value: 0,
    },
    uWindDir: {
      value: new Vector2(0.8, 0.6).normalize(),
    },
    uWindStrength: {
      value: 0.5,
    },
    uSunDir: {
      value: new Vector3(0.4, 0.8, 0.35).normalize(),
    },
    uSunColor: {
      value: new Color(1, 0.95, 0.85),
    },
    uSkyColor: {
      value: new Color(0.55, 0.72, 0.92),
    },
    uGroundColor: {
      value: new Color(0.36, 0.32, 0.26),
    },
    uPlayerPos: {
      value: new Vector3(),
    },
    uCameraPos: {
      value: new Vector3(),
    },
    uWaterLevel: {
      value: 0,
    },
    uHeightMap: {
      value: heightTex,
    },
    uHeightBounds: {
      value: bounds(),
    },
    uPaintVolume: {
      value: volumeTex,
    },
    uPaintVolumeMin: {
      value: new Vector3(-160, -16, -160),
    },
    uPaintVolumeSize: {
      value: new Vector3(320, 96, 320),
    },
    uVitalityMap: {
      value: whiteTex,
    },
    uVitalityBounds: {
      value: bounds(),
    },
    uBurnMap: {
      value: blackTex,
    },
    uBurnBounds: {
      value: bounds(),
    },
  };
}
const WB_COMMON_GLSL = `
#ifndef WB_COMMON
#define WB_COMMON
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uPlayerPos;
uniform vec3 uCameraPos;
uniform float uWaterLevel;
uniform sampler2D uHeightMap;
uniform vec4 uHeightBounds;

float wbHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 wbHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float wbHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
// Value noise, returns 0..1
float wbNoise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wbHash12(i), wbHash12(i + vec2(1.0, 0.0)), u.x),
             mix(wbHash12(i + vec2(0.0, 1.0)), wbHash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float wbNoise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = wbHash13(i), n100 = wbHash13(i + vec3(1,0,0)), n010 = wbHash13(i + vec3(0,1,0)), n110 = wbHash13(i + vec3(1,1,0));
  float n001 = wbHash13(i + vec3(0,0,1)), n101 = wbHash13(i + vec3(1,0,1)), n011 = wbHash13(i + vec3(0,1,1)), n111 = wbHash13(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float wbFbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * wbNoise2(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float wbLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 wbSaturation(vec3 c, float s) { return mix(vec3(wbLuma(c)), c, s); }
// Terrain height from the shared heightmap (meters).
float wbTerrainHeight(vec2 xz) {
  vec2 uv = (xz - uHeightBounds.xy) / uHeightBounds.zw;
  return texture2D(uHeightMap, uv).r;
}
#endif
`;
const PAINT_PARS_STUB_GLSL = `
#ifndef WB_PAINT_PARS
#define WB_PAINT_PARS
vec4 wbPaintSample(vec3 worldPos) { return vec4(0.0); }
float wbVitality(vec3 worldPos) { return 1.0; }
vec3 wbApplyVitality(vec3 color, vec3 worldPos) { return color; }
void wbPaintSurface(inout vec3 albedo, inout float roughness, inout vec3 emissive, vec3 worldPos, vec3 worldNormal) {}
#endif
`;
const BURN_PARS_STUB_GLSL = `
#ifndef WB_BURN_PARS
#define WB_BURN_PARS
float wbBurnt(vec2 xz) { return 0.0; }
float wbBurning(vec2 xz) { return 0.0; }
#endif
`;
export function installShaderChunks() {
  const chunks = ShaderChunk;
  chunks.wb_common = WB_COMMON_GLSL;
  chunks.wb_paint_pars = PAINT_PARS_STUB_GLSL;
  chunks.wb_burn_pars = BURN_PARS_STUB_GLSL;
}
export function setShaderChunk(chunkName, glsl) {
  ShaderChunk[chunkName] = glsl;
}
