/**
 * Perch parts: layout constants, hint texts, easing helpers, shaders and geometry for the summit Perch: the petals of the stone bud, the Skybrush relic and its feathered wings, and the socket prongs.
 */
import {
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  LatheGeometry,
  Matrix4,
  MeshStandardMaterial,
  Vector2,
  Vector3,
} from 'three';
import { COLORS, PALETTE } from '../core/config.js';
import { colorize, displace, lathe, mergeGeometries, taperedTube, TAU, weld } from '../shared/util.js';
export const SOCKET_GLOW_SLOT = {
  red: 5,
  blue: 6,
  yellow: 7,
  green: 8,
};
export const TRIAL_LANDMARK = {
  red: 'grove',
  blue: 'lakeIslet',
  yellow: 'tower',
  green: 'mesa',
};
export const SOCKET_GLYPH = {
  red: 0,
  blue: 3,
  yellow: 6,
  green: 8,
};
export const DRUM_R = 4.7;
export const SOCKET_R = 3.35;
export const DAIS_R = 1.25;
export const DAIS_H = 0.5;
export const PETAL_COUNT = 8;
export const PETAL_SCALE = 0.8;
export const PETAL_OPEN_ANGLE = 0.8;
export const RELIC_SCALE = 0.86;
export const RELIC_RISE = 2.45;
export const PERCH_HINT =
  'Four hollows wait in the crown of the peak, one for each colour. Wake the Prisms, and the Perch will open.';
export const SKYBRUSH_HINT = 'The first painters rode the wind on their brushes. The Skybrush waits for a steady hand.';
export const xyz = (x, y, z) => new Vector3(x, y, z);
export const paletteHex = (color) => PALETTE[color].hex;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
export const easeOutBack = (x, overshoot = 1.9) => {
  const u = clamp01(x) - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
};
export const easeInOutCubic = (x) => {
  const u = clamp01(x);
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
};
export const PILLAR_VERTEX = `
uniform vec3 uCam;
uniform float uHeight;
uniform float uWidth;
varying vec2 vUv;
void main() {
  vec3 base = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = uCam - base;
  toCam.y = 0.0;
  float dist = length(toCam);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam / max(dist, 0.001)));
  float w = uWidth * (1.0 + dist / 95.0);
  float taper = 1.0 - position.y * 0.3;
  vec3 wp = base + right * position.x * w * taper + vec3(0.0, position.y * uHeight, 0.0);
  vUv = vec2(position.x + 0.5, position.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
export const PILLAR_FRAGMENT = `
#include <wb_common>
uniform float uIntensity;
uniform float uHeight;
uniform float uGrow;
varying vec2 vUv;
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  float core = exp(-x * x * 26.0);
  float glow = exp(-x * x * 3.2);
  float n = wbNoise2(vec2(x * 3.0, y * uHeight * 0.03 - uTime * 1.2));
  float n2 = wbNoise2(vec2(x * 8.0 + 5.0, y * uHeight * 0.09 - uTime * 2.6));
  float fade = smoothstep(0.0, 0.012, y) * pow(1.0 - y, 1.2);
  float front = smoothstep(uGrow, uGrow - 0.05, y);
  // a prism's spread: red on one edge through violet on the other, drifting slowly up the column
  vec3 rb = hue(fract(0.78 * (x * 0.5 + 0.5) + y * uHeight * 0.0015 - uTime * 0.03));
  vec3 c = mix(rb * 1.3, vec3(1.0), core * 0.28);
  float a = (core * 1.5 + glow * (0.42 + 0.4 * n) + core * n2 * 0.35) * fade * front;
  // premultiplied: a fairly opaque ribbon of colour so it reads against a bright sky
  gl_FragColor = vec4(c * a * uIntensity, clamp(a * uIntensity * 0.85, 0.0, 1.0));
}
`;
export const RIBBON_VERTEX = `
attribute vec3 aColor;
attribute float aIdx;
uniform float uRadius;
uniform vec4 uProg;
uniform vec4 uAlpha;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vW;
varying float vProg;
varying float vAlpha;
void main() {
  vUv = uv;
  vColor = aColor;
  int i = int(aIdx + 0.5);
  vProg = i == 0 ? uProg.x : i == 1 ? uProg.y : i == 2 ? uProg.z : uProg.w;
  vAlpha = i == 0 ? uAlpha.x : i == 1 ? uAlpha.y : i == 2 ? uAlpha.z : uAlpha.w;
  vec4 w = modelMatrix * vec4(position, 1.0);
  float dist = length(cameraPosition - w.xyz);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  w.xyz += n * uRadius * (0.35 + dist / 120.0);
  vN = n;
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
export const RIBBON_FRAGMENT = `
#include <wb_common>
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vW;
varying float vProg;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.001) discard;
  vec3 V = normalize(cameraPosition - vW);
  float facing = abs(dot(normalize(vN), V));
  float core = pow(facing, 2.2);
  float t = vUv.x;
  float vis = smoothstep(vProg, vProg - 0.025, t);
  float head = exp(-pow((t - vProg) * 26.0, 2.0)) * 2.4 * step(vProg, 1.0);
  float flow = 0.7 + 0.3 * sin(t * 90.0 - uTime * 7.0);
  float ends = smoothstep(0.0, 0.04, t);
  float a = core * (vis * flow + head) * vAlpha * ends;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.25) * a * 1.35, clamp(a * 0.55, 0.0, 1.0));
}
`;
export const PERCH_RING_VERTEX = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const PERCH_RING_FRAGMENT = `
uniform float uAlpha;
varying vec2 vUv;
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float ring = smoothstep(0.8, 0.97, r) * smoothstep(1.0, 0.97, r);
  float inner = smoothstep(0.35, 0.97, r) * step(r, 1.0) * 0.18;
  vec3 c = hue(fract(atan(p.y, p.x) / 6.2832 + 0.25)) * 1.2 + 0.25;
  gl_FragColor = vec4(c * (ring * 2.0 + inner) * uAlpha, 1.0);
}
`;
export function petalMaterial(ctx, glow, curl) {
  const globals = ctx.globals;
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
    side: DoubleSide,
  });
  material.name = 'perch-petal';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, {
      uPetalGlow: glow,
      uCurl: curl,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute float aPaint;
attribute vec3 aPetal;
uniform float uCurl;
varying float vPaint;
varying vec3 vPetal;
varying vec3 vPW;
// unfurl: the petal curls outward about its hinge (local Z axis through the origin), more toward the tip
vec3 ptCurl(vec3 p, float k) {
  float a = -uCurl * pow(clamp(k, 0.0, 1.0), 1.4);
  float c = cos(a), s = sin(a);
  return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}
void main() {`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        objectNormal = ptCurl(objectNormal, position.y / ${(2.46 * PETAL_SCALE).toFixed(3)});`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed = ptCurl(transformed, position.y / ${(2.46 * PETAL_SCALE).toFixed(3)});`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec4 pw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            pw = instanceMatrix * pw;
          #endif
          vPW = (modelMatrix * pw).xyz;
          vPaint = aPaint;
          vPetal = aPetal;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `#include <wb_common>
uniform float uPetalGlow;
varying float vPaint;
varying vec3 vPetal;
varying vec3 vPW;
void main() {`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float ptN = wbNoise3(vPW * 1.4) * 0.6 + wbNoise3(vPW * 5.3 + 3.0) * 0.4;
        {
          vec3 stone = diffuseColor.rgb * (0.8 + 0.32 * ptN);
          float streak = smoothstep(0.35, 0.8, wbNoise3(vec3(vPW.x * 9.0, vPW.y * 1.5, vPW.z * 9.0)));
          vec3 paint = vPetal * (0.82 + 0.25 * ptN) * (1.0 - 0.12 * streak);
          diffuseColor.rgb = mix(stone, paint, vPaint);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vPetal * vPaint * uPetalGlow * (0.55 + 0.45 * ptN);`,
      );
  };
  material.customProgramCacheKey = () => 'wb-perch-petal-v2';
  return material;
}
export function relicMaterial(glow) {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.38,
    metalness: 0.18,
    side: DoubleSide,
  });
  material.name = 'perch-relic';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRelicGlow = glow;
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute float aGlow;
varying float vGlow;
void main() {`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
vGlow = aGlow;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform float uRelicGlow;
varying float vGlow;
void main() {`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vColor.rgb * vGlow * uRelicGlow;`,
      );
  };
  material.customProgramCacheKey = () => 'wb-perch-relic-v1';
  return material;
}
export function petalGeometry() {
  const scale = PETAL_SCALE;
  const outside = [
    [0.98, 0],
    [1.16, 0.3],
    [1.24, 0.75],
    [1.14, 1.3],
    [0.86, 1.8],
    [0.46, 2.2],
    [0.05, 2.46],
  ];
  const inside = [
    [0.03, 2.35],
    [0.4, 2.1],
    [0.77, 1.73],
    [1.03, 1.27],
    [1.12, 0.76],
    [1.05, 0.33],
    [0.88, 0.05],
  ];
  const profile = [...outside, ...inside, outside[0]].map(
    ([r, y]) => new Vector2(Math.max(0.0001, r * scale), y * scale),
  );
  const half = Math.PI / PETAL_COUNT - 0.022;
  const geo = weld(new LatheGeometry(profile, 12, Math.PI / 2 - half, half * 2));
  const hingeR = 0.98 * scale;
  geo.translate(-0.784, 0, 0);
  const position = geo.attributes.position;
  const normal = geo.attributes.normal;
  const paint = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + hingeR;
    const z = position.getZ(i);
    const len = Math.hypot(x, z) || 1;
    const outward = (normal.getX(i) * x + normal.getZ(i) * z) / len;
    const k = position.getY(i) / (2.46 * scale);
    paint[i] = outward < -0.05 ? 0.25 + 0.75 * smoothstep(0.12, 0.62, k) : 0;
    if (k > 0.86 && outward < 0.4) paint[i] = Math.max(paint[i], 0.7 * smoothstep(0.86, 0.97, k));
  }
  geo.setAttribute('aPaint', new BufferAttribute(paint, 1));
  colorize(geo, 14273971);
  displace(geo, 0.018, 2.4, 11);
  return geo;
}
export function skybrushGeometry() {
  const parts = [];
  const paints = COLORS.map((color) => new Color(paletteHex(color)));
  const color = new Color();
  const ivory = new Color(0xf3ece0);
  const gold = new Color(0xe8b64c);
  const paleGold = new Color(0xffe39a);
  const alongX = (geo) => {
    geo.rotateZ(-Math.PI / 2);
    return geo;
  };
  const paint = (geo, shade) => {
    const position = geo.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const glows = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      const [col, glow] = shade(position.getX(i), Math.atan2(position.getZ(i), position.getY(i)));
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
      glows[i] = glow;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.setAttribute('aGlow', new BufferAttribute(glows, 1));
    parts.push(geo);
  };
  const handleLen = 2.5;
  const profile = [
    [0, 0],
    [0.07, 0.005],
    [0.085, 0.05],
    [0.075, 0.1],
    [0.05, 0.16],
  ];
  for (let y = 0.2; y < 2.45; y += 0.05) profile.push([0.046 + (y / handleLen) * 0.008 + 0.004 * Math.sin(y * 9), y]);
  profile.push([0.056, 2.48], [0.05, handleLen]);
  const handle = alongX(lathe(profile, 20));
  handle.translate(-1.45, 0, 0);
  paint(handle, (x, angle) => {
    const along = x + 1.45;
    if (along < 0.13 || Math.abs(along - 0.7) < 0.035 || Math.abs(along - 1.45) < 0.035 || along > 2.4)
      return [color.copy(gold).lerp(paleGold, 0.3), 0.08];
    const spiral = angle / TAU + along * 1.6;
    const frac = spiral - Math.floor(spiral);
    if (frac < 0.09) {
      const idx = Math.floor((((spiral - frac) % 4) + 4) % 4);
      return [color.copy(paints[idx]), 0.55];
    }
    return [color.copy(ivory).multiplyScalar(0.94 + 0.06 * Math.sin(along * 23)), 0.04];
  });
  const ferrule = alongX(
    lathe(
      [
        [0.05, 0],
        [0.085, 0.02],
        [0.1, 0.1],
        [0.094, 0.18],
        [0.118, 0.25],
        [0.13, 0.31],
        [0.105, 0.35],
        [0, 0.35],
      ],
      22,
    ),
  );
  ferrule.translate(1.02, 0, 0);
  paint(ferrule, (x) => [color.copy(gold).lerp(paleGold, smoothstep(1.25, 1.36, x) * 0.6), 0.12]);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * TAU + 0.3;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const pts = [
      xyz(1.3, cos * 0.11, sin * 0.11),
      xyz(1.22, cos * 0.2, sin * 0.2),
      xyz(1.1, cos * 0.25, sin * 0.25),
      xyz(1, cos * 0.2, sin * 0.2),
    ];
    paint(
      taperedTube(new CatmullRomCurve3(pts), 8, 5, (u) => 0.028 * (1 - u * 0.7) + 0.004),
      () => [color.copy(paleGold), 0.25],
    );
  }
  const bristles = alongX(
    lathe(
      [
        [0.1, 0],
        [0.17, 0.07],
        [0.225, 0.19],
        [0.24, 0.33],
        [0.225, 0.48],
        [0.19, 0.63],
        [0.135, 0.78],
        [0.075, 0.92],
        [0.025, 1.04],
        [0, 1.12],
      ],
      28,
    ),
  );
  bristles.translate(1.33, 0, 0);
  const position = bristles.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const k = (position.getX(i) - 1.33) / 1;
    position.setY(i, position.getY(i) + 0.22 * k * k * k);
  }
  bristles.computeVertexNormals();
  const gradientAt = (k) => {
    const band = clamp01((k - 0.12) / 0.8) * 3;
    const idx = Math.min(2, Math.floor(band));
    return color.copy(paints[idx]).lerp(paints[idx + 1], smoothstep(0.35, 0.65, band - idx));
  };
  paint(bristles, (x, angle) => {
    const k = (x - 1.33) / 1;
    const col = gradientAt(k);
    col.lerp(new Color(0xfff4df), 1 - smoothstep(0.04, 0.2, k));
    if (k > 0.88) col.lerp(new Color(0xffffff), (k - 0.88) * 3);
    col.multiplyScalar(0.84 + 0.16 * Math.sin(angle * 11 + k * 4));
    return [col, 0.3 + 0.7 * smoothstep(0.1, 0.9, k)];
  });
  const merged = mergeGeometries(parts);
  for (const geo of parts) geo.dispose();
  return merged;
}
export function wingGeometry() {
  const parts = [];
  const up = xyz(0, 1, 0.1).normalize();
  const cream = new Color(0xfff2da);
  const col = new Color();
  const feather = (angle, lift, len, width, tint, glow, offset = 0) => {
    const profile = [
      [0, 0],
      [width * 0.3, len * 0.04],
      [width * 0.75, len * 0.16],
      [width, len * 0.42],
      [width * 0.86, len * 0.66],
      [width * 0.48, len * 0.88],
      [0, len],
    ];
    const geo = lathe(profile, 8);
    geo.scale(0.2, 1, 1);
    const position = geo.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const k = position.getY(i) / len;
      position.setX(i, position.getX(i) - 0.07 * k * k * len);
    }
    geo.computeVertexNormals();
    const dir = xyz(Math.cos(angle), Math.sin(lift), Math.sin(angle)).normalize();
    const normal = up.clone();
    const along = dir.clone().addScaledVector(normal, -dir.dot(normal)).normalize();
    const across = new Vector3().crossVectors(normal, along);
    geo.applyMatrix4(new Matrix4().makeBasis(normal, along, across));
    geo.translate(0, 0, offset);
    const position2 = geo.attributes.position;
    const colors = new Float32Array(position2.count * 3);
    const glows = new Float32Array(position2.count);
    const p2 = new Vector3();
    for (let i = 0; i < position2.count; i++) {
      p2.fromBufferAttribute(position2, i);
      const k = clamp01((p2.dot(dir) - 0) / len);
      col.copy(cream).lerp(tint, smoothstep(0.22, 0.85, k));
      if (k > 0.92) col.lerp(new Color(0xffffff), (k - 0.92) * 4);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
      glows[i] = 0.15 + glow * smoothstep(0.35, 1, k);
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.setAttribute('aGlow', new BufferAttribute(glows, 1));
    parts.push(geo);
  };
  for (const [angle, lift, len, color] of [
    [0.52, 0.34, 1.05, 'red'],
    [0.95, 0.3, 1.32, 'yellow'],
    [1.4, 0.24, 1.38, 'green'],
    [1.86, 0.18, 1.18, 'blue'],
  ])
    feather(angle, lift, len, 0.17, new Color(paletteHex(color)), 0.85, 0.02);
  for (const [angle, len] of [
    [0.75, 0.55],
    [1.2, 0.62],
    [1.65, 0.5],
  ])
    feather(angle, 0.28, len, 0.13, new Color(0xf1d7a2), 0.2, 0.05);
  const merged = mergeGeometries(parts);
  for (const geo of parts) geo.dispose();
  return merged;
}
export function prongCurve(yaw, base) {
  const at = (r2, y, twist = 0) =>
    xyz(base.x + Math.sin(yaw + twist) * r2, base.y + y, base.z + Math.cos(yaw + twist) * r2);
  return new CatmullRomCurve3([at(0.44, 0.93), at(0.56, 1.2, 0.05), at(0.47, 1.5, 0.12), at(0.22, 1.74, 0.2)]);
}
