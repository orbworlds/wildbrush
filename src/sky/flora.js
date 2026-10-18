/**
 * Flora of the sky isles: GPU-placed rings of grass and six kinds of wildflower that sway in the wind, part around the hero and take paint, plus instanced blossom, birch, pine and oak trees with trunk colliders.
 */
import {
  Color,
  Float32BufferAttribute,
  Group,
  InstancedBufferGeometry,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Sphere,
  Vector3,
  Vector4,
} from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
import { makeRng } from '../core/math.js';
import { createTreeMaterials } from '../shared/tree-materials.js';
import { buildBirch, buildBroadleaf, buildConifer } from '../shared/tree-species.js';
import { patchVegMaterial, toColor, vegUniforms } from '../shared/veg-material.js';
import { updateRingRect } from '../shared/veg-rings.js';
import { SKY_FIELD_GLSL } from './veg-field.js';
import { skyify } from './vitality.js';
const GRASS_RINGS = {
  high: [
    {
      spacing: 0.1,
      radius: 13,
      segs: 5,
      width: 0.055,
      faceCam: 0.25,
    },
    {
      spacing: 0.2,
      radius: 26,
      segs: 4,
      width: 0.085,
      faceCam: 0.45,
    },
    {
      spacing: 0.42,
      radius: 58,
      segs: 3,
      width: 0.15,
      faceCam: 0.8,
    },
  ],
  medium: [
    {
      spacing: 0.125,
      radius: 12,
      segs: 4,
      width: 0.065,
      faceCam: 0.3,
    },
    {
      spacing: 0.25,
      radius: 25,
      segs: 3,
      width: 0.1,
      faceCam: 0.5,
    },
    {
      spacing: 0.55,
      radius: 52,
      segs: 3,
      width: 0.17,
      faceCam: 0.85,
    },
  ],
  low: [
    {
      spacing: 0.17,
      radius: 11,
      segs: 4,
      width: 0.08,
      faceCam: 0.35,
    },
    {
      spacing: 0.4,
      radius: 26,
      segs: 3,
      width: 0.13,
      faceCam: 0.6,
    },
    {
      spacing: 0.85,
      radius: 48,
      segs: 2,
      width: 0.26,
      faceCam: 1,
    },
  ],
};
const GRASS_PARS_GLSL = `
${SKY_FIELD_GLSL}
uniform float uGSpacing;
uniform vec4 uGRect;
uniform float uGRadius;
uniform float uGRing;
uniform float uGWidth;
uniform float uGFaceCam;
uniform vec3 uGRoot;
uniform vec3 uGMid;
uniform vec3 uGTip;
varying vec3 vGCol;
varying vec3 vGEmis;
`;
const GRASS_VERTEX = `
vec3 vegPos = vec3(0.0, -1000.0, 0.0);
vec3 vegN = vec3(0.0, 1.0, 0.0);
vGCol = vec3(0.0); vGEmis = vec3(0.0);
{
  int gw = max(int(uGRect.z + 0.5), 1);
  int gid = gl_InstanceID;
  ivec2 ci = ivec2(int(floor(uGRect.x + 0.5)), int(floor(uGRect.y + 0.5))) + ivec2(gid % gw, gid / gw);
  uvec4 hs = uvec4(uvec2(ci + ivec2(65536)), uint(uGRing) * 7919u + 13u, 29u);
  vec4 r1 = vegRand4(hs);
  vec4 r2 = vegRand4(hs + uvec4(0u, 0u, 0u, 101u));
  vec2 rootXZ = (vec2(ci) + r1.xy) * uGSpacing;
  float dist = distance(rootXZ, uCameraPos.xz);
  float fadeR = uGRadius * mix(0.45, 1.0, r1.z);
  float fade = 1.0 - smoothstep(fadeR - uGRadius * 0.18, fadeR, dist);
  vec4 fld = skyField(rootXZ);
  float canopy = fld.w;
  float dens = fld.y * (1.0 - canopy * 0.5);
  float keep = smoothstep(r1.w, r1.w + 0.15, dens * 1.3);
  float sc = fade * keep;
  vec3 root = vec3(rootXZ.x, fld.x - 0.04, rootXZ.y);
  vec4 clipC = projectionMatrix * (viewMatrix * vec4(root + vec3(0.0, 0.4, 0.0), 1.0));
  bool culled = sc < 0.02 || fld.x < -500.0 || clipC.w < -2.0
    || abs(clipC.x) > clipC.w * 1.04 + 1.6 || abs(clipC.y) > clipC.w * 1.04 + 2.2;
  if (!culled) {
    const float CLUMP = 1.15;
    vec2 cp = rootXZ / CLUMP;
    vec2 ic = floor(cp);
    float best = 1e9;
    vec2 bestPt = ic;
    vec2 bestId = ic;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 cell = ic + vec2(float(x), float(y));
        vec2 pt = cell + wbHash22(cell);
        vec2 dd = cp - pt;
        float d2 = dot(dd, dd);
        if (d2 < best) { best = d2; bestPt = pt; bestId = cell; }
      }
    }
    vec2 clumpC = bestPt * CLUMP;
    vec2 ch = wbHash22(bestId + 71.3);
    float clumpD = clamp(sqrt(best), 0.0, 1.0);
    float tuft = smoothstep(r1.w, r1.w + 0.15, dens * mix(1.3, 0.3, clumpD * (1.0 - dens)));
    sc *= tuft / max(keep, 1e-3);
    float big = wbNoise2(rootXZ * 0.045 + 3.1);
    float far = smoothstep(5.0, 45.0, dist);
    float h = mix(0.3, 0.62, r2.x) * mix(0.72, 1.3, ch.x) * mix(1.15, 0.78, clumpD);
    h *= mix(0.45, 1.0, smoothstep(0.0, 0.75, dens));
    h *= 0.72 + 0.56 * big;
    h *= 1.0 - canopy * 0.35;
    float fpn = wbNoise2(rootXZ * 0.06 + 5.3) * 0.7 + wbNoise2(rootXZ * 0.19 + 17.0) * 0.3;
    h *= 1.0 - smoothstep(0.5, 0.74, fpn) * 0.3;
    h *= 1.0 - smoothstep(30.0, 90.0, dist) * 0.35;
    vec4 paint = clamp(wbPaintSample(root + vec3(0.0, 0.2, 0.0)), 0.0, 1.0);
    h *= 1.0 + paint.a * 0.65 + paint.b * 0.08 + paint.g * 0.05;
    float burnt = clamp(wbBurnt(rootXZ), 0.0, 1.0);
    float burning = clamp(wbBurning(rootXZ), 0.0, 1.0);
    h *= mix(1.0, 0.1, burnt);
    h *= mix(0.15, 1.0, sc) * step(0.02, sc);
    float w = uGWidth * mix(0.75, 1.3, r2.y) * mix(0.55, 1.0, sc) * (1.0 + paint.a * 0.3);
    float ang = r2.z * 6.2831853;
    vec2 fdir = vec2(cos(ang), sin(ang));
    vec2 cdir = vec2(cos(ch.y * 6.2831853), sin(ch.y * 6.2831853));
    fdir = normalize(mix(fdir, cdir, 0.4) + vec2(1e-4, 0.0));
    vec2 toCam = uCameraPos.xz - rootXZ;
    toCam /= max(length(toCam), 1e-3);
    if (dot(fdir, toCam) < 0.0) fdir = -fdir;
    fdir = normalize(mix(fdir, toCam, uGFaceCam) + vec2(1e-4, 0.0));
    vec2 side2 = vec2(-fdir.y, fdir.x);
    vec2 away = rootXZ - clumpC;
    float al = length(away);
    vec2 lean = (al > 1e-4 ? away / al : fdir) * (0.1 + 0.32 * r2.w) * h;
    float gust = vegGust(rootXZ);
    float stiff = 1.0 - paint.g * 0.85;
    vec2 wd = vegWindDir();
    // the sky is windier than the meadows below
    float ws = min(1.0, uWindStrength * 1.35 + 0.15);
    float windAmt = (0.03 + ws * (0.14 + gust * 0.95)) * h * stiff;
    float ph = r1.x * 6.2831853 + dot(rootXZ, vec2(0.61, 0.83));
    float flutter = (sin(uTime * (3.0 + r2.x * 2.5) + ph) * 0.6 + sin(uTime * 7.3 + ph * 1.7) * 0.4) * (0.025 + 0.06 * ws) * h * stiff;
    vec2 bend = lean * (1.0 - paint.g * 0.7) + wd * windAmt + side2 * flutter * 0.7 + wd * flutter * 0.5;
    vec2 dp = rootXZ - uPlayerPos.xz;
    float pd = length(dp);
    float push = (1.0 - smoothstep(0.2, 1.4, pd)) * (1.0 - smoothstep(1.0, 2.5, abs(root.y - uPlayerPos.y)));
    bend = mix(bend, (pd > 1e-3 ? dp / pd : wd) * h * 0.95, push * 0.9);
    float bl = min(length(bend), h * 0.95);
    bend = normalize(bend + vec2(1e-5, 0.0)) * bl;
    float tipY = sqrt(max(h * h - bl * bl * 0.9, h * h * 0.03));
    tipY *= 1.0 - push * 0.3;
    float t = position.y;
    vec3 p1 = vec3(bend.x * 0.18, tipY * 0.7, bend.y * 0.18);
    vec3 p2 = vec3(bend.x, tipY, bend.y);
    float it = 1.0 - t;
    vec3 P = 2.0 * it * t * p1 + t * t * p2;
    vec3 T = normalize(2.0 * it * p1 + 2.0 * t * (p2 - p1) + vec3(0.0, 1e-4, 0.0));
    vec3 sideV = vec3(side2.x, 0.0, side2.y);
    float wProf = w * (1.0 - pow(t, 1.35)) * (1.0 + 0.35 * sin(t * 3.14159));
    vegPos = root + P + sideV * (position.x * wProf * 0.5);
    vec3 N = normalize(cross(sideV, T));
    if (dot(N, uCameraPos - vegPos) < 0.0) N = -N;
    N = normalize(N + sideV * position.x * 0.4);
    vegN = normalize(mix(N, vec3(0.0, 1.0, 0.0), mix(0.5, 0.85, far)));
    vec3 rootC = mix(uGRoot, uGMid * 1.08, far);
    vec3 c = mix(rootC, uGMid, smoothstep(0.0, 0.5, t));
    c = mix(c, uGTip, smoothstep(0.35, 1.0, t) * (1.0 - far * 0.35));
    float patchN = wbNoise2(rootXZ * 0.018 + 41.0);
    c = mix(c, c * vec3(1.18, 1.12, 0.72), smoothstep(0.55, 0.85, patchN) * 0.7);
    c = mix(c, c * vec3(0.8, 0.92, 0.95), smoothstep(0.4, 0.15, patchN) * 0.5);
    float hv = (ch.x - 0.5) * 1.1 + (r2.y - 0.5) * 0.5 + (big - 0.5) * 0.9;
    c = mix(c, c * vec3(1.2, 1.08, 0.6), clamp(hv, 0.0, 1.0));
    c = mix(c, c * vec3(0.82, 0.98, 1.08), clamp(-hv, 0.0, 1.0));
    c *= 0.86 + 0.26 * r1.w;
    c *= 1.0 + gust * (0.15 + ws * 0.45) * t;
    c *= 1.0 - canopy * 0.3;
    c *= 1.0 + far * 0.12;
    // drained blades read as pale sage-lavender (not near-black) against the washed meadow
    c = mix(c * 1.45 + vec3(0.02, 0.025, 0.03), c, clamp(skyVitality(root), 0.0, 1.0));
    c = wbApplyVitality(c, root);
    vec3 lush = mix(uPaintGreen * 0.3, uPaintGreen * 1.05, t);
    c = mix(c, wbSaturation(lush, 1.2), paint.a * 0.8);
    vec3 frost = mix(vec3(0.5, 0.68, 0.82), vec3(0.9, 0.96, 1.0), t);
    c = mix(c, frost, paint.g * 0.85);
    vec3 gold = mix(uPaintYellow * 0.45, uPaintYellow * 1.1, t);
    c = mix(c, gold, paint.b * 0.8);
    vec3 hot = mix(uPaintRed * 0.3, mix(uPaintRed, vec3(1.0, 0.62, 0.2), 0.5), t);
    c = mix(c, hot, paint.r * 0.8);
    c = mix(c, uCharcoal * (0.7 + 0.6 * r2.w), burnt);
    vGCol = c;
    vec3 em = mix(uPaintRed, vec3(1.0, 0.55, 0.15), 0.5) * paint.r * t * t * 0.9;
    em += uFireColor * burning * (0.25 + t) * 2.5 * (0.75 + 0.25 * sin(uTime * 9.0 + r1.x * 30.0));
    vGEmis = em;
    vVegTrans = smoothstep(0.1, 1.0, t) * (1.0 - burnt);
    vVegGloss = paint.b * 0.9 + paint.g * 0.45;
    vVegAO = mix(mix(0.4, 1.0, smoothstep(0.0, 0.8, t)), 1.0, far);
  }
}
objectNormal = vegN;
`;
function grassBladeGeometry(segs, count) {
  const positions = [];
  for (let i = 0; i < segs; i++) {
    const y = (i / segs) ** 0.9;
    positions.push(-1, y, 0, 1, y, 0);
  }
  positions.push(0, 1, 0);
  const indices = [];
  for (let i = 0; i < segs - 1; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const tip = (segs - 1) * 2;
  indices.push(tip, tip + 1, tip + 2);
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.instanceCount = count;
  geometry.boundingSphere = new Sphere(new Vector3(), 1000000);
  return geometry;
}
const FLOWER_PETAL_COLORS = ['#f8f5ec', '#fff27a', '#ff8fa0', '#a47fe0', '#5d8cf5', '#f58cc0'];
const FLOWER_CENTER_COLORS = ['#f5b81c', '#f0c020', '#5a2a3a', '#6a4bb0', '#2b3a8a', '#f7c531'];
const FLOWER_PARS_GLSL = `
${SKY_FIELD_GLSL}
uniform float uFSpacing;
uniform vec4 uFRect;
uniform float uFRadius;
uniform float uFRing;
uniform float uFSize;
uniform vec3 uFPetal[6];
uniform vec3 uFCenter[6];
uniform vec3 uFStem;
varying vec2 vFUv;
varying float vFPart;
varying float vFSpecies;
varying float vFRand;
varying vec3 vFStemCol;
varying vec3 vFPetalC;
varying vec3 vFCenterC;
`;
const FLOWER_VERTEX = `
vec3 vegPos = vec3(0.0, -1000.0, 0.0);
vec3 vegN = vec3(0.0, 1.0, 0.0);
vFUv = position.xy; vFPart = position.z; vFSpecies = 0.0; vFRand = 0.0; vFStemCol = uFStem; vFPetalC = vec3(1.0); vFCenterC = vec3(1.0);
{
  int gw = max(int(uFRect.z + 0.5), 1);
  int gid = gl_InstanceID;
  ivec2 ci = ivec2(int(floor(uFRect.x + 0.5)), int(floor(uFRect.y + 0.5))) + ivec2(gid % gw, gid / gw);
  uvec4 hs = uvec4(uvec2(ci + ivec2(65536)), uint(uFRing) * 104729u + 977u, 7u);
  vec4 r1 = vegRand4(hs);
  vec4 r2 = vegRand4(hs + uvec4(0u, 0u, 0u, 77u));
  vec2 rootXZ = (vec2(ci) + r1.xy) * uFSpacing;
  float dist = distance(rootXZ, uCameraPos.xz);
  float fadeR = uFRadius * mix(0.5, 1.0, r1.z);
  float fade = 1.0 - smoothstep(fadeR - uFRadius * 0.2, fadeR, dist);
  vec4 fld = skyField(rootXZ);
  float dens = smoothstep(0.25, 0.8, fld.y) * (1.0 - fld.w * 0.85);
  float pn = wbNoise2(rootXZ * 0.06 + 5.3) * 0.7 + wbNoise2(rootXZ * 0.19 + 17.0) * 0.3;
  float patchv = smoothstep(0.48, 0.72, pn);
  vec3 root = vec3(rootXZ.x, fld.x - 0.02, rootXZ.y);
  float vit = clamp(wbVitality(root), 0.0, 1.0);
  float prob = (patchv * 0.9 + 0.05) * dens * mix(0.35, 1.0, vit);
  float keep = smoothstep(r1.w, r1.w + 0.06, prob);
  float burnt = clamp(wbBurnt(rootXZ), 0.0, 1.0);
  float sc = fade * keep * (1.0 - burnt);
  vec4 clipC = projectionMatrix * (viewMatrix * vec4(root + vec3(0.0, 0.3, 0.0), 1.0));
  bool culled = sc < 0.03 || fld.x < -500.0 || clipC.w < -1.0
    || abs(clipC.x) > clipC.w * 1.04 + 1.0 || abs(clipC.y) > clipC.w * 1.04 + 1.5;
  if (!culled) {
    float sn = wbNoise2(rootXZ * 0.028 + 91.0);
    float spf = floor(fract(sn * 2.9 + (r2.x < 0.22 ? r2.y : 0.0)) * 6.0);
    int sp = int(spf);
    float stemH = sp == 3 ? 0.62 : sp == 2 ? 0.7 : sp == 5 ? 0.7 : 0.56;
    float headS = sp == 0 ? 0.105 : sp == 1 ? 0.08 : sp == 2 ? 0.12 : sp == 3 ? 0.09 : sp == 4 ? 0.085 : 0.105;
    float bloom = mix(0.45, 1.0, smoothstep(0.1, 0.9, vit));
    float s = uFSize * sc * bloom * mix(0.8, 1.2, r2.y);
    stemH *= mix(0.75, 1.25, r2.x) * mix(0.6, 1.0, sc);
    headS *= s;
    float gust = vegGust(rootXZ);
    vec2 wd = vegWindDir();
    float ph = r1.x * 6.2831853;
    float fl = sin(uTime * (2.2 + r2.x * 1.5) + ph) * (0.05 + 0.07 * uWindStrength);
    vec2 bend = wd * (0.06 + uWindStrength * (0.14 + gust * 0.34)) * stemH + vec2(cos(ph), sin(ph)) * (0.06 * stemH + fl * stemH);
    vec2 dp = rootXZ - uPlayerPos.xz;
    float pd = length(dp);
    float push = (1.0 - smoothstep(0.2, 1.2, pd)) * (1.0 - smoothstep(1.0, 2.5, abs(root.y - uPlayerPos.y)));
    bend = mix(bend, (pd > 1e-3 ? dp / pd : wd) * stemH * 0.9, push * 0.9);
    float bl = min(length(bend), stemH * 0.9);
    bend = normalize(bend + vec2(1e-5, 0.0)) * bl;
    float tipY = sqrt(max(stemH * stemH - bl * bl, stemH * stemH * 0.05));
    vec3 p1 = vec3(bend.x * 0.15, tipY * 0.7, bend.y * 0.15);
    vec3 p2 = vec3(bend.x, tipY, bend.y);
    vec3 toCam = normalize(uCameraPos - root);
    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1e-4, 0.0, 0.0));
    if (position.z < 0.5) {
      float t = position.y;
      float it = 1.0 - t;
      vec3 P = 2.0 * it * t * p1 + t * t * p2;
      vegPos = root + P + side * position.x * 0.006 * (1.0 + uFSize);
      vegN = normalize(toCam + vec3(0.0, 0.6, 0.0));
    } else {
      vec3 head = root + p2;
      vec3 hx, hy, hn;
      if (sp == 3) {
        hy = normalize(vec3(bend.x * 0.6, 1.0, bend.y * 0.6));
        hx = side;
        hn = normalize(toCam + vec3(0.0, 0.4, 0.0));
        head += hy * headS * 1.6;
        vegPos = head + hx * position.x * headS * 0.55 + hy * position.y * headS * 2.2;
      } else {
        float ta = r2.z * 6.2831853;
        vec2 tilt = vec2(cos(ta), sin(ta)) * 0.55 + bend / max(stemH, 0.05) * 0.8;
        tilt += toCam.xz * 0.35;
        hn = normalize(vec3(tilt.x, 1.0, tilt.y));
        hx = normalize(cross(hn, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 0.0, 1e-4));
        hy = cross(hx, hn);
        vegPos = head + (hx * position.x + hy * position.y) * headS;
      }
      vegN = normalize(hn + vec3(0.0, 0.5, 0.0));
    }
    vFSpecies = spf;
    vFRand = r2.w;
    vFStemCol = wbApplyVitality(uFStem * mix(0.8, 1.1, r1.z), root);
    vFPetalC = wbApplyVitality(uFPetal[sp], root);
    vFCenterC = wbApplyVitality(uFCenter[sp], root);
    vVegTrans = position.z > 0.5 ? 1.0 : 0.3;
    vVegGloss = sp == 1 ? 0.8 : 0.1;
    vVegAO = position.z > 0.5 ? 1.0 : mix(0.5, 1.0, position.y);
  }
}
objectNormal = vegN;
`;
const FLOWER_FRAGMENT = `
{
  int sp = int(vFSpecies + 0.5);
  vec3 c = vFStemCol * mix(0.6, 1.0, vFUv.y);
  if (vFPart > 0.5) {
    vec2 uv = vFUv;
    float r = length(uv);
    if (sp == 3) {
      float yy = uv.y * 0.5 + 0.5;
      float row = yy * 10.0;
      float ri = floor(row);
      float fr = fract(row) - 0.5;
      float sd = mod(ri, 2.0) < 1.0 ? -1.0 : 1.0;
      float w = 0.75 * (1.0 - yy * 0.6);
      vec2 d1 = vec2((uv.x - sd * w * 0.32) / (w * 0.62), fr * 2.3);
      vec2 d2 = vec2((uv.x + sd * w * 0.3) / (w * 0.5), (fr + 0.3) * 2.8);
      float bud = min(dot(d1, d1), dot(d2, d2));
      float stemL = step(abs(uv.x), 0.06) * step(yy, 0.9);
      if ((bud > 1.0 && stemL < 0.5) || yy > 0.97) discard;
      c = bud > 1.0 ? vFStemCol : vFPetalC * mix(0.6, 1.12, yy) * (0.78 + 0.35 * (1.0 - bud));
    } else {
      float N = sp == 0 ? 13.0 : sp == 1 ? 5.0 : sp == 2 ? 5.0 : sp == 4 ? 9.0 : 8.0;
      float a = atan(uv.y, uv.x);
      float pa = abs(fract(a * N / 6.2831853 + vFRand) - 0.5) * 2.0;
      float edge;
      if (sp == 0) edge = mix(1.0, 0.3, pow(pa, 0.6));
      else if (sp == 1) edge = mix(0.95, 0.55, pa * pa);
      else if (sp == 2) edge = mix(1.0, 0.62, pa * pa);
      else if (sp == 4) edge = mix(1.0, 0.45, pow(pa, 0.8)) - 0.12 * step(0.8, fract(a * N * 1.5));
      else edge = mix(1.0, 0.4, pow(pa, 0.9));
      if (r > edge) discard;
      float cr = sp == 0 ? 0.3 : sp == 2 ? 0.26 : sp == 1 ? 0.3 : 0.24;
      vec3 petal = vFPetalC;
      petal *= mix(0.72, 1.08, smoothstep(0.1, 0.9, r / max(edge, 0.01)));
      petal *= 0.9 + 0.1 * (1.0 - pa);
      c = r < cr ? vFCenterC * (0.8 + 0.4 * (1.0 - r / cr)) : petal;
    }
  }
  diffuseColor.rgb = c;
}
`;
function flowerGeometry(count) {
  const positions = [];
  for (let i = 0; i <= 3; i++) {
    const y = i / 3;
    positions.push(-1, y, 0, 1, y, 0);
  }
  const head = positions.length / 3;
  positions.push(-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1);
  const indices = [];
  for (let i = 0; i < 3; i++) {
    const base = i * 2;
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  indices.push(head, head + 1, head + 2, head, head + 2, head + 3);
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.instanceCount = count;
  geometry.boundingSphere = new Sphere(new Vector3(), 1000000);
  return geometry;
}
function snowCap(geometry, amount) {
  const color = geometry.getAttribute('color');
  const normal = geometry.getAttribute('normal');
  if (!color || !normal) return geometry;
  const snow = new Color(0.9, 0.94, 1);
  const tint = new Color();
  for (let i = 0; i < color.count; i++) {
    const w = MathUtils.smoothstep(normal.getY(i), 0.25, 0.8) * amount;
    tint.setRGB(color.getX(i), color.getY(i), color.getZ(i)).lerp(snow, w);
    color.setXYZ(i, tint.r, tint.g, tint.b);
  }
  color.needsUpdate = true;
  return geometry;
}
export function createFlora(ctx, vit, field, trees, groundAt, baseY, options = {}) {
  const withGrass = options.grass !== false;
  const fieldUniforms = {
    uSkyField: {
      value: field.texture,
    },
    uSkyFieldXf: {
      value: field.xf,
    },
  };
  const veg = {
    ctx,
    field: {
      texture: field.texture,
      xf: new Vector4(0, 1, 0, 1),
    },
    uniforms: vegUniforms({
      texture: field.texture,
      xf: new Vector4(0, 1, 0, 1),
    }),
  };
  const nearGroup = new Group();
  nearGroup.name = 'sky-flora-near';
  const treeGroup = new Group();
  treeGroup.name = 'sky-trees';
  const grassColors = {
    uGRoot: {
      value: toColor('#41692c'),
    },
    uGMid: {
      value: toColor('#76a646'),
    },
    uGTip: {
      value: toColor('#bcd86e'),
    },
  };
  const petalColors = {
    value: FLOWER_PETAL_COLORS.map((hex) => toColor(hex)),
  };
  const centerColors = {
    value: FLOWER_CENTER_COLORS.map((hex) => toColor(hex)),
  };
  const stemColor = {
    value: toColor('#4f8a33'),
  };
  let meshes = [];
  const setQuality = (quality) => {
    if (withGrass) {
      for (const mesh of meshes) {
        nearGroup.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      meshes = [];
      GRASS_RINGS[quality].forEach((cfg, i) => {
        const maxN = Math.ceil((2 * cfg.radius) / cfg.spacing) + 4;
        const rect = new Vector4(0, 0, maxN, maxN);
        const ring = {
          spacing: cfg.spacing,
          radius: cfg.radius,
          maxN,
        };
        const geometry = grassBladeGeometry(cfg.segs, maxN * maxN);
        const material = new MeshLambertMaterial({
          side: 2,
        });
        patchVegMaterial(veg, material, {
          key: 'sky-grass',
          uniforms: {
            ...grassColors,
            ...fieldUniforms,
            uGSpacing: {
              value: cfg.spacing,
            },
            uGRect: {
              value: rect,
            },
            uGRadius: {
              value: cfg.radius,
            },
            uGRing: {
              value: i,
            },
            uGWidth: {
              value: cfg.width,
            },
            uGFaceCam: {
              value: cfg.faceCam,
            },
          },
          defines: {
            VEG_WRAP: '0.6',
            VEG_TRANS: '1.4',
          },
          vertexPars: GRASS_PARS_GLSL,
          fragmentPars: GRASS_PARS_GLSL,
          vertexNormal: GRASS_VERTEX,
          vertexPosition: 'transformed = vegPos;',
          fragmentColor: 'diffuseColor.rgb = vGCol;',
          fragmentEmissive: 'totalEmissiveRadiance += vGEmis;',
          fragmentPost: 'reflectedLight.indirectDiffuse *= vVegAO;',
          noFaceFlip: true,
          transColor: toColor('#f2f59a'),
        });
        skyify(material, vit, 'sky-grass');
        const mesh = new Mesh(geometry, material);
        mesh.onBeforeRender = (renderer, scene, camera) => {
          const position = camera.position;
          geometry.instanceCount = updateRingRect(camera, groundAt(position.x, position.z) ?? baseY(), ring, rect);
        };
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.name = `sky-grass-${i}`;
        mesh.renderOrder = -1 + i * 0.01;
        nearGroup.add(mesh);
        meshes.push(mesh);
      });
      {
        const cfg =
          quality === 'low'
            ? {
                spacing: 0.7,
                radius: 22,
                size: 1.15,
              }
            : quality === 'medium'
              ? {
                  spacing: 0.52,
                  radius: 26,
                  size: 1.05,
                }
              : {
                  spacing: 0.44,
                  radius: 30,
                  size: 1,
                };
        const maxN = Math.ceil((2 * cfg.radius) / cfg.spacing) + 4;
        const rect = new Vector4(0, 0, maxN, maxN);
        const ring = {
          spacing: cfg.spacing,
          radius: cfg.radius,
          maxN,
        };
        const material = new MeshLambertMaterial({
          side: 2,
        });
        patchVegMaterial(veg, material, {
          key: 'sky-flowers',
          uniforms: {
            ...fieldUniforms,
            uFSpacing: {
              value: cfg.spacing,
            },
            uFRect: {
              value: rect,
            },
            uFRadius: {
              value: cfg.radius,
            },
            uFRing: {
              value: 0,
            },
            uFSize: {
              value: cfg.size,
            },
            uFPetal: petalColors,
            uFCenter: centerColors,
            uFStem: stemColor,
          },
          defines: {
            VEG_WRAP: '0.7',
            VEG_TRANS: '1.2',
          },
          vertexPars: FLOWER_PARS_GLSL,
          fragmentPars: FLOWER_PARS_GLSL,
          vertexNormal: FLOWER_VERTEX,
          vertexPosition: 'transformed = vegPos;',
          fragmentColor: FLOWER_FRAGMENT,
          fragmentPost: 'reflectedLight.indirectDiffuse *= vVegAO;',
          noFaceFlip: true,
          transColor: toColor('#fff4d0'),
        });
        skyify(material, vit, 'sky-flowers');
        const geometry = flowerGeometry(maxN * maxN);
        const mesh = new Mesh(geometry, material);
        mesh.onBeforeRender = (renderer, scene, camera) => {
          const position = camera.position;
          geometry.instanceCount = updateRingRect(camera, groundAt(position.x, position.z) ?? baseY(), ring, rect);
        };
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.name = 'sky-flowers';
        nearGroup.add(mesh);
        meshes.push(mesh);
      }
    }
  };
  setQuality(ctx.settings.quality);
  let treeMats = null;
  const treeGeometries = [];
  let treeCount = 0;
  try {
    treeMats = createTreeMaterials(veg);
    for (const material of [treeMats.foliage, treeMats.bark.brown, treeMats.bark.birch, treeMats.solid])
      skyify(material, vit, 'sky-tree');
    const builders = {
      blossom: () => buildBroadleaf('sky-blossom-0'),
      birch: () => buildBirch('sky-birch-1'),
      pine: () => {
        const conifer = buildConifer('sky-pine-2');
        snowCap(conifer.foliage, 0.85);
        return conifer;
      },
      oak: () => buildBroadleaf('sky-oak-3'),
    };
    const foliageColors = {
      blossom: ['#f7b8cf', '#f4c6dc', '#fbd3e0', '#eeaccb', '#f9e1ea'],
      birch: ['#b6de66', '#a8d85c', '#c0e06a'],
      pine: ['#ffffff', '#eef6f2', '#f4f8ff', '#e2eee8'],
      oak: ['#8fcf5a', '#7cc050', '#a2d868', '#b4dc6e'],
    };
    const rng = makeRng(options.seed ?? 'sky-trees');
    const quat = new Quaternion();
    const up = new Vector3(0, 1, 0);
    for (const species of ['blossom', 'birch', 'pine', 'oak']) {
      const placed = trees.filter((tree) => tree.sp === species);
      if (!placed.length && species !== 'blossom' && species !== 'birch') continue;
      const model = builders[species]();
      treeGeometries.push(model.trunk, model.foliage);
      if (!placed.length) continue;
      const trunks = new InstancedMesh(
        model.trunk,
        species === 'birch' ? treeMats.bark.birch : treeMats.bark.brown,
        placed.length,
      );
      const foliage = new InstancedMesh(
        model.foliage,
        species === 'pine' ? treeMats.solid : treeMats.foliage,
        placed.length,
      );
      const mat4 = new Matrix4();
      const color = new Color();
      placed.forEach((tree, i) => {
        const groundY = groundAt(tree.x, tree.z);
        if (groundY === null) return;
        const yaw = rng() * Math.PI * 2;
        quat.setFromAxisAngle(up, yaw);
        mat4.compose(new Vector3(tree.x, groundY - 0.05, tree.z), quat, new Vector3(tree.s, tree.s, tree.s));
        trunks.setMatrixAt(i, mat4);
        foliage.setMatrixAt(i, mat4);
        trunks.setColorAt(i, color.setScalar(0.9 + rng() * 0.2));
        foliage.setColorAt(i, color.set(foliageColors[species][Math.floor(rng() * foliageColors[species].length)]));
        field.splatCanopy(tree.x, tree.z, model.canopyR * tree.s, 0.6);
        treeCount++;
        try {
          const halfHeight = (model.trunkH * tree.s) / 2;
          const desc = ctx.RAPIER.ColliderDesc.cylinder(halfHeight, Math.max(0.12, model.trunkR * tree.s * 0.95))
            .setTranslation(tree.x, groundY + halfHeight - 0.2, tree.z)
            .setCollisionGroups(COLLISION_GROUPS.static)
            .setFriction(0.8);
          const collider = ctx.physics.createCollider(desc);
          ctx.colliders.register(collider, {
            kind: 'tree',
            surface: 'wood',
            flammable: true,
            object: treeGroup,
            data: {
              sky: true,
            },
          });
        } catch (err) {
          if (i === 0) console.warn('[sky] tree collider failed', err);
        }
      });
      for (const mesh of [trunks, foliage]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        treeGroup.add(mesh);
      }
      trunks.customDepthMaterial = treeMats.barkDepth;
      foliage.customDepthMaterial = species === 'pine' ? treeMats.solidDepth : treeMats.foliageDepth;
      trunks.name = `sky-tree-${species}-trunk`;
      foliage.name = `sky-tree-${species}-foliage`;
    }
  } catch (err) {
    console.error('[sky] trees failed', err);
  }
  return {
    near: nearGroup,
    trees: treeGroup,
    treeCount,
    setQuality,
    dispose() {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      for (const geometry of treeGeometries) geometry.dispose();
      treeMats?.dispose();
    },
  };
}
