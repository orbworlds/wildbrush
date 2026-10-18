/**
 * The water shader and material: wind-aligned waves that fade with depth, calmer lake water, fresnel sky reflection, sun glints, shoreline foam and a dim view from below the surface.
 */
import { Color, DoubleSide, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
const WATER_COMMON_GLSL = `
#include <wb_common>
uniform vec3 uLake;        // x, z, radius
uniform float uWaveHeight;
varying vec3 vWPos;
varying float vCalm;

float wbwDepthAt(vec2 xz) {
  vec2 uv = (xz - uHeightBounds.xy) / uHeightBounds.zw;
  float h = texture2D(uHeightMap, clamp(uv, vec2(0.0), vec2(1.0))).r;
  vec2 o = max(abs(uv - 0.5) - 0.5, 0.0) * uHeightBounds.zw;
  float outside = length(o);
  return mix(uWaterLevel - h, 30.0, smoothstep(0.0, 60.0, outside));
}
float wbwCalm(vec2 xz) {
  return 1.0 - smoothstep(uLake.z * 0.95, uLake.z * 1.35, length(xz - uLake.xy));
}
vec2 wbwRot(vec2 d, float a) { float c = cos(a), s = sin(a); return vec2(c * d.x - s * d.y, s * d.x + c * d.y); }
// Sum of wind-aligned sines. Returns (height, dh/dx, dh/dz).
vec3 wbwWaves(vec2 p, float t) {
  vec2 w = normalize(uWindDir + vec2(1e-4));
  vec3 acc = vec3(0.0);
  vec2 d; float k; float a; float ph;
  d = w;                   k = 0.16; a = 0.34; ph = dot(d, p) * k + t * 1.25;
  acc += vec3(sin(ph) * a, cos(ph) * a * k * d);
  d = wbwRot(w, 0.55);     k = 0.29; a = 0.2;  ph = dot(d, p) * k + t * 1.69 + 1.7;
  acc += vec3(sin(ph) * a, cos(ph) * a * k * d);
  d = wbwRot(w, -0.8);     k = 0.47; a = 0.11; ph = dot(d, p) * k + t * 2.15 + 4.1;
  acc += vec3(sin(ph) * a, cos(ph) * a * k * d);
  d = wbwRot(w, 1.9);      k = 0.83; a = 0.05; ph = dot(d, p) * k + t * 2.85 + 0.6;
  acc += vec3(sin(ph) * a, cos(ph) * a * k * d);
  return acc;
}
float wbwWaveAmp(vec2 xz, float depth, float calm) {
  float fadeFar = 1.0 - smoothstep(240.0, 360.0, length(xz));
  return uWaveHeight * smoothstep(0.15, 4.5, depth) * mix(1.0, 0.18, calm) * fadeFar;
}
`;
const WATER_VERTEX = `
#include <common>
#include <fog_pars_vertex>
${WATER_COMMON_GLSL}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float depth = wbwDepthAt(wp.xz);
  float calm = wbwCalm(wp.xz);
  float amp = wbwWaveAmp(wp.xz, depth, calm);
  wp.y += wbwWaves(wp.xz, uTime).x * amp;
  vWPos = wp.xyz;
  vCalm = calm;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const WATER_FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
${WATER_COMMON_GLSL}
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uLakeShallow;
uniform vec3 uLakeDeep;
uniform vec3 uFoam;
uniform vec3 uHorizon;

vec2 wbwNoiseGrad(vec2 p) {
  const float e = 0.12;
  float c = wbNoise2(p);
  return vec2(wbNoise2(p + vec2(e, 0.0)) - c, wbNoise2(p + vec2(0.0, e)) - c) / e;
}

void main() {
  vec3 toCam = cameraPosition - vWPos;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 1e-4);
  vec2 xz = vWPos.xz;
  float t = uTime;
  float terrainH = uWaterLevel - wbwDepthAt(xz);
  float depth = max(vWPos.y - terrainH, 0.0);
  float calm = vCalm;

  // ── Normal: analytic waves + scrolling ripples, flattened with distance
  float amp = wbwWaveAmp(xz, depth, calm);
  vec2 grad = wbwWaves(xz, t).yz * amp;
  float near = 1.0 - smoothstep(30.0, 280.0, dist);
  vec2 wdir = normalize(uWindDir + vec2(1e-4));
#ifndef WBW_LOW
  if (dist < 900.0) {
    vec2 r = wbwNoiseGrad(xz * 0.32 + wdir * t * 0.32) * 0.16;
    if (near > 0.01) r += wbwNoiseGrad(xz * 0.95 - vec2(wdir.y, -wdir.x) * t * 0.45 + 3.0) * 0.075 * near;
    grad += r * mix(0.35, 1.0, near) * mix(1.0, 0.45, calm) * (1.0 - smoothstep(500.0, 900.0, dist));
  }
#endif
  grad *= 1.0 - smoothstep(200.0, 1400.0, dist) * 0.8;
  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
  if (!gl_FrontFacing) N = -N;

  // ── Body colour by optical depth
  float vy = max(abs(V.y), 0.06);
  float optical = depth * (1.0 + 1.8 * (1.0 - vy));
  float dShade = 1.0 - exp(-optical * 0.26);
  vec3 shallow = mix(uShallow, uLakeShallow, calm);
  vec3 deep = mix(uDeep, uLakeDeep, calm);
  vec3 body = mix(shallow, deep, smoothstep(0.0, 1.0, dShade));
  // Brighter turquoise band over sand shallows
  body = mix(body, shallow * 1.25, (1.0 - smoothstep(0.3, 2.5, depth)) * 0.5);

  vec3 L = normalize(uSunDir);
  float sunUp = clamp(L.y * 2.5 + 0.1, 0.0, 1.0);
  vec3 ambient = uSkyColor * 0.62;
  vec3 light = ambient + uSunColor * (0.5 * sunUp);
  body *= light;
  // Light scattering through wave crests facing away from the sun
  float sss = pow(max(dot(V, -L + vec3(0.0, 0.3, 0.0)), 0.0), 4.0) * clamp(dot(grad, -L.xz) * 2.0 + 0.3, 0.0, 1.0);
  body += shallow * uSunColor * sss * 0.35 * sunUp * (1.0 - calm * 0.6);

  // ── Fresnel sky reflection
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = mix(uHorizon, uSkyColor * 1.08, smoothstep(0.0, 0.5, R.y));
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  fres = clamp(fres * 1.15, 0.0, 0.95);
  vec3 col = mix(body, sky, fres);

  // ── Sun glints
  vec3 Hs = normalize(L + V);
  float nh = max(dot(N, Hs), 0.0);
  float spec = pow(nh, 420.0) * 7.0 + pow(nh, 70.0) * 0.22;
  col += uSunColor * spec * sunUp;

  // ── Shoreline foam
  float fn = 0.5;
  float fn2 = 0.5;
  if (depth < 3.0) {
    fn = wbNoise2(xz * 0.22 + t * 0.04);
    fn2 = wbNoise2(xz * 0.8 - t * 0.12);
  }
  float edgeW = 0.22 + 0.25 * fn;
  float foamEdge = 1.0 - smoothstep(edgeW * 0.35, edgeW, depth);
  foamEdge *= smoothstep(0.25, 0.55, fn2 + foamEdge * 0.35);
  float ph = depth * 1.25 - t * 0.42 + fn * 1.1;
  float f = fract(ph);
  float band = smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.08, 0.26, f));
  float bandFade = 1.0 - smoothstep(0.2, mix(2.4, 1.2, calm), depth);
  band *= bandFade * smoothstep(0.32, 0.62, fn2 + 0.25 * bandFade);
  float foam = clamp(max(foamEdge, band * 0.85), 0.0, 1.0);
  foam *= 1.0 - smoothstep(120.0, 400.0, dist) * 0.7;
  col = mix(col, uFoam * (ambient + uSunColor * 0.8 * sunUp) * 0.92, foam);

  // ── Alpha: soft shore transparency, more opaque with optical depth & fresnel
  float alpha = smoothstep(0.0, 0.1, depth) * mix(0.28, 1.0, smoothstep(0.0, 3.2, optical));
  alpha = max(alpha, fres * smoothstep(0.0, 0.2, depth));
  alpha = max(alpha, foam * smoothstep(0.0, 0.03, depth) * 0.95);

  // ── Seen from below: dim teal with a bright window toward the sky
  if (!gl_FrontFacing) {
    float win = smoothstep(0.55, 0.95, V.y * -1.0);
    col = mix(uDeep * light * 1.3, uSkyColor * 0.9, win * 0.6);
    alpha = 0.92;
  }

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
export function createWaterMaterial(ctx, lake) {
  const material = new ShaderMaterial({
    name: 'water',
    uniforms: {
      ...ctx.globals,
      ...UniformsUtils.clone(UniformsLib.fog),
      uLake: {
        value: lake,
      },
      uWaveHeight: {
        value: 1,
      },
      uShallow: {
        value: new Color('#3fc1c9'),
      },
      uDeep: {
        value: new Color('#135a7a'),
      },
      uLakeShallow: {
        value: new Color('#58c2a8'),
      },
      uLakeDeep: {
        value: new Color('#1d5a6a'),
      },
      uFoam: {
        value: new Color('#ffffff'),
      },
      uHorizon: {
        value: new Color('#dfe9ef'),
      },
    },
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: true,
    fog: true,
    side: DoubleSide,
  });
  if (ctx.settings.quality === 'low')
    material.defines = {
      WBW_LOW: '',
    };
  return material;
}
