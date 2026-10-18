/**
 * Shader chunk wb_burn_pars that lets terrain and plants read the fire burn map: patchy charred scorch marks with a warm rim, and the flickering glow of smouldering ground.
 */
export const BURN_PARS_GLSL = `
#ifndef WB_BURN_PARS
#define WB_BURN_PARS
uniform sampler2D uBurnMap;
uniform vec4 uBurnBounds;

float wbBurnHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float wbBurnNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wbBurnHash(i), wbBurnHash(i + vec2(1.0, 0.0)), u.x),
             mix(wbBurnHash(i + vec2(0.0, 1.0)), wbBurnHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec4 wbBurnTexel(vec2 xz) {
  vec2 uv = (xz - uBurnBounds.xy) / uBurnBounds.zw;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec4(0.0);
  return texture2D(uBurnMap, uv);
}
float wbBurnRaw(vec2 xz) { return wbBurnTexel(xz).r; }

// Organic, patchy scorch edge: the 1m grid is hidden by warping with two octaves of noise.
float wbBurnt(vec2 xz) {
  float r = wbBurnTexel(xz).r;
  if (r <= 0.002) return 0.0;
  float n = wbBurnNoise(xz * 0.55) * 0.6 + wbBurnNoise(xz * 2.3 + 7.1) * 0.4;
  return smoothstep(0.18, 0.62, r + (n - 0.5) * 0.55);
}

float wbBurning(vec2 xz) {
  float g = wbBurnTexel(xz).g;
  if (g <= 0.002) return 0.0;
  float n = wbBurnNoise(xz * 1.7);
  return clamp(g * (0.75 + 0.5 * n), 0.0, 1.0);
}

// HDR glow of embers and smouldering ground (flickers). Add to emissive.
vec3 wbBurnGlow(vec2 xz) {
  vec4 t = wbBurnTexel(xz);
  if (t.g <= 0.002) return vec3(0.0);
  float n = wbBurnNoise(xz * 3.1) * 0.7 + wbBurnNoise(xz * 9.0) * 0.3;
  float cracks = smoothstep(0.52, 0.8, n);
  return vec3(1.0, 0.34, 0.08) * t.g * (0.35 + 2.6 * cracks);
}

// Charred albedo: near-black ash with warm brown rim at the scorch edge.
vec3 wbScorch(vec3 albedo, vec2 xz) {
  float b = wbBurnt(xz);
  if (b <= 0.0) return albedo;
  float n = wbBurnNoise(xz * 4.0);
  vec3 ash = mix(vec3(0.045, 0.04, 0.038), vec3(0.16, 0.15, 0.14), n * n);
  vec3 rim = albedo * vec3(0.55, 0.42, 0.28);
  vec3 c = mix(albedo, rim, smoothstep(0.0, 0.35, b));
  return mix(c, ash, smoothstep(0.3, 0.85, b));
}
#endif
`;
