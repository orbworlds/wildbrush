/**
 * Grass: rings of instanced curved blades that follow the camera. The vertex shader clumps them, bends them with gusts and the hero, and tints them by dryness, paint and fire.
 */
import {
  Box3,
  Float32BufferAttribute,
  Group,
  InstancedBufferGeometry,
  Mesh,
  MeshLambertMaterial,
  Sphere,
  Vector3,
  Vector4,
} from 'three';
import { patchVegMaterial, toColor } from '../shared/veg-material.js';
import { updateRingRect } from '../shared/veg-rings.js';
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
      radius: 54,
      segs: 3,
      width: 0.15,
      faceCam: 0.8,
    },
    {
      spacing: 0.9,
      radius: 110,
      segs: 2,
      width: 0.28,
      faceCam: 1,
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
      spacing: 0.52,
      radius: 50,
      segs: 3,
      width: 0.17,
      faceCam: 0.85,
    },
    {
      spacing: 1.1,
      radius: 95,
      segs: 2,
      width: 0.3,
      faceCam: 1,
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
      spacing: 0.36,
      radius: 24,
      segs: 3,
      width: 0.13,
      faceCam: 0.6,
    },
    {
      spacing: 0.8,
      radius: 60,
      segs: 2,
      width: 0.26,
      faceCam: 1,
    },
  ],
};
const GRASS_PARS_GLSL = `
uniform float uGSpacing;
uniform vec4 uGRect;
uniform float uGRadius;
uniform float uGRing;
uniform float uGWidth;
uniform float uGFaceCam;
uniform float uGHeight;
uniform vec3 uGRoot;
uniform vec3 uGMid;
uniform vec3 uGTip;
uniform vec3 uGDryRoot;
uniform vec3 uGDryTip;
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
  uvec4 hs = uvec4(uvec2(ci + ivec2(65536)), uint(uGRing) * 7919u + 3u, 17u);
  vec4 r1 = vegRand4(hs);
  vec4 r2 = vegRand4(hs + uvec4(0u, 0u, 0u, 101u));
  vec2 rootXZ = (vec2(ci) + r1.xy) * uGSpacing;
  float dist = distance(rootXZ, uCameraPos.xz);
  float fadeR = uGRadius * mix(0.45, 1.0, r1.z);
  float fade = 1.0 - smoothstep(fadeR - uGRadius * 0.18, fadeR, dist);
  vec4 fld = vegField(rootXZ);
  float canopy = fld.w;
  float dens = fld.y * (1.0 - canopy * 0.5);
  float keep = smoothstep(r1.w, r1.w + 0.15, dens * 1.3);
  float sc = fade * keep;
  vec3 root = vec3(rootXZ.x, fld.x - 0.04, rootXZ.y);
  vec4 clipC = projectionMatrix * (viewMatrix * vec4(root + vec3(0.0, 0.4, 0.0), 1.0));
  bool culled = sc < 0.02 || root.y < uWaterLevel + 0.08 || clipC.w < -2.0
    || abs(clipC.x) > clipC.w * 1.04 + 1.6 || abs(clipC.y) > clipC.w * 1.04 + 2.2;
  if (!culled) {
    // Voronoi clumps: blades in a clump share height, tint and lean away from its centre
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
    // sparse ground grows in tufts around clump centres instead of evenly scattered blades
    float tuft = smoothstep(r1.w, r1.w + 0.15, dens * mix(1.3, 0.3, clumpD * (1.0 - dens)));
    sc *= tuft / max(keep, 1e-3);

    float dry = fld.z;
    float big = wbNoise2(rootXZ * 0.045 + 3.1);
    float far = smoothstep(5.0, 45.0, dist);
    float h = mix(0.3, 0.62, r2.x) * mix(0.72, 1.3, ch.x) * mix(1.15, 0.78, clumpD);
    h *= mix(0.45, 1.0, smoothstep(0.0, 0.75, dens));
    h *= 0.72 + 0.56 * big;
    h *= 1.0 + dry * 0.4;
    h *= 1.0 - canopy * 0.35;
    // shorter grass inside wildflower patches so the flowers show (same noise as flowers.ts)
    float fpn = wbNoise2(rootXZ * 0.06 + 5.3) * 0.7 + wbNoise2(rootXZ * 0.19 + 17.0) * 0.3;
    h *= 1.0 - smoothstep(0.5, 0.74, fpn) * 0.3;
    h *= uGHeight * (1.0 - smoothstep(30.0, 90.0, dist) * 0.35);
    vec4 paint = clamp(wbPaintSample(root + vec3(0.0, 0.2, 0.0)), 0.0, 1.0);
    h *= 1.0 + paint.a * 0.65 + paint.b * 0.08 + paint.g * 0.05;
    float burnt = clamp(wbBurnt(rootXZ), 0.0, 1.0);
    float burning = clamp(wbBurning(rootXZ), 0.0, 1.0);
    h *= mix(1.0, 0.1, burnt);
    h *= mix(0.15, 1.0, sc) * step(0.02, sc);
    float w = uGWidth * mix(0.75, 1.3, r2.y) * mix(0.55, 1.0, sc) * (1.0 + paint.a * 0.3 + dry * 0.1);

    // facing
    float ang = r2.z * 6.2831853;
    vec2 fdir = vec2(cos(ang), sin(ang));
    vec2 cdir = vec2(cos(ch.y * 6.2831853), sin(ch.y * 6.2831853));
    fdir = normalize(mix(fdir, cdir, 0.4) + vec2(1e-4, 0.0));
    vec2 toCam = uCameraPos.xz - rootXZ;
    toCam /= max(length(toCam), 1e-3);
    if (dot(fdir, toCam) < 0.0) fdir = -fdir;
    fdir = normalize(mix(fdir, toCam, uGFaceCam) + vec2(1e-4, 0.0));
    vec2 side2 = vec2(-fdir.y, fdir.x);

    // bend: clump lean + rolling gusts + flutter + player push
    vec2 away = rootXZ - clumpC;
    float al = length(away);
    vec2 lean = (al > 1e-4 ? away / al : fdir) * (0.1 + 0.32 * r2.w) * h;
    float gust = vegGust(rootXZ);
    float stiff = 1.0 - paint.g * 0.85;
    vec2 wd = vegWindDir();
    float ws = uWindStrength;
    float windAmt = (0.03 + ws * (0.14 + gust * 0.95)) * h * stiff;
    float ph = r1.x * 6.2831853 + dot(rootXZ, vec2(0.61, 0.83));
    float flutter = (sin(uTime * (3.0 + r2.x * 2.5) + ph) * 0.6 + sin(uTime * 7.3 + ph * 1.7) * 0.4)
      * (0.025 + 0.06 * ws) * h * stiff;
    vec2 bend = lean * (1.0 - paint.g * 0.7) + wd * windAmt + side2 * flutter * 0.7 + wd * flutter * 0.5;
    vec2 dp = rootXZ - uPlayerPos.xz;
    float pd = length(dp);
    float push = (1.0 - smoothstep(0.2, 1.4, pd)) * (1.0 - smoothstep(1.0, 2.5, abs(root.y - uPlayerPos.y)));
    bend = mix(bend, (pd > 1e-3 ? dp / pd : wd) * h * 0.95, push * 0.9);
    float bl = min(length(bend), h * 0.95);
    bend = normalize(bend + vec2(1e-5, 0.0)) * bl;
    float tipY = sqrt(max(h * h - bl * bl * 0.9, h * h * 0.03));
    tipY *= 1.0 - push * 0.3;

    // quadratic bezier blade
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

    // colour
    vec3 rootC = mix(uGRoot, uGMid * 1.08, far);
    vec3 c = mix(rootC, uGMid, smoothstep(0.0, 0.5, t));
    c = mix(c, uGTip, smoothstep(0.35, 1.0, t) * (1.0 - far * 0.35));
    // broad luminous patches (sunlit yellow-green drifts vs cooler deep green)
    float patchN = wbNoise2(rootXZ * 0.018 + 41.0);
    c = mix(c, c * vec3(1.18, 1.12, 0.72), smoothstep(0.55, 0.85, patchN) * 0.7);
    c = mix(c, c * vec3(0.8, 0.92, 0.95), smoothstep(0.4, 0.15, patchN) * 0.5);
    float hv = (ch.x - 0.5) * 1.1 + (r2.y - 0.5) * 0.5 + (big - 0.5) * 0.9;
    c = mix(c, c * vec3(1.2, 1.08, 0.6), clamp(hv, 0.0, 1.0));
    c = mix(c, c * vec3(0.82, 0.98, 1.08), clamp(-hv, 0.0, 1.0));
    c *= 0.86 + 0.26 * r1.w;
    vec3 dcol = mix(mix(uGDryRoot, uGDryTip, far * 0.5), uGDryTip, smoothstep(0.0, 1.0, t)) * (0.88 + 0.24 * r2.y);
    c = mix(c, dcol, dry);
    c *= 1.0 + gust * (0.15 + ws * 0.45) * t;
    c *= 1.0 - canopy * 0.3;
    c *= 1.0 + far * 0.12;
    // world systems: vitality, paint, fire (all per vertex — keeps the fragment stage lean)
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
    float spk = step(0.965, fract(r2.w * 37.0 + uTime * 0.35)) * smoothstep(0.55, 1.0, t) * paint.g;
    em += vec3(0.9, 0.97, 1.0) * spk * 2.5;
    vGEmis = em;
    vVegTrans = smoothstep(0.1, 1.0, t) * (1.0 - burnt);
    vVegGloss = paint.b * 0.9 + paint.g * 0.45;
    vVegAO = mix(mix(0.4, 1.0, smoothstep(0.0, 0.8, t)), 1.0, far);
  }
}
objectNormal = vegN;
`;
const GRASS_COLOR_FRAGMENT = `
diffuseColor.rgb = vGCol;
`;
const GRASS_EMISSIVE_FRAGMENT = `
totalEmissiveRadiance += vGEmis;
`;
const GRASS_AO_FRAGMENT = `
reflectedLight.indirectDiffuse *= vVegAO;
`;
function createBladeGeometry(segs, count) {
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
  const last = (segs - 1) * 2;
  indices.push(last, last + 1, last + 2);
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.instanceCount = count;
  geometry.boundingSphere = new Sphere(new Vector3(), 1000000);
  geometry.boundingBox = new Box3(new Vector3(-1000000, -1000000, -1000000), new Vector3(1000000, 1000000, 1000000));
  return geometry;
}
export function createGrass(veg, quality) {
  const group = new Group();
  group.name = 'vegetation-grass';
  const uniforms = {
    uGRoot: {
      value: toColor('#41692c'),
    },
    uGMid: {
      value: toColor('#74a244'),
    },
    uGTip: {
      value: toColor('#b9d66c'),
    },
    uGDryRoot: {
      value: toColor('#ab7f2c'),
    },
    uGDryTip: {
      value: toColor('#f4cf68'),
    },
    uGHeight: {
      value: 1,
    },
  };
  let rings = [];
  let bladeCount = 0;
  const setQuality = (quality) => {
    for (const mesh of rings) {
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    rings = [];
    bladeCount = 0;
    GRASS_RINGS[quality].forEach((ringDef, i) => {
      const maxN = Math.ceil((2 * ringDef.radius) / ringDef.spacing) + 4;
      const rect = new Vector4(0, 0, maxN, maxN);
      const ring = {
        spacing: ringDef.spacing,
        radius: ringDef.radius,
        maxN,
      };
      const geometry = createBladeGeometry(ringDef.segs, maxN * maxN);
      bladeCount += maxN * maxN;
      const material = new MeshLambertMaterial({
        side: 2,
      });
      patchVegMaterial(veg, material, {
        key: 'grass',
        uniforms: {
          ...uniforms,
          uGSpacing: {
            value: ringDef.spacing,
          },
          uGRect: {
            value: rect,
          },
          uGRadius: {
            value: ringDef.radius,
          },
          uGRing: {
            value: i,
          },
          uGWidth: {
            value: ringDef.width,
          },
          uGFaceCam: {
            value: ringDef.faceCam,
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
        fragmentColor: GRASS_COLOR_FRAGMENT,
        fragmentEmissive: GRASS_EMISSIVE_FRAGMENT,
        fragmentPost: GRASS_AO_FRAGMENT,
        noFaceFlip: true,
        transColor: toColor('#f2f59a'),
      });
      const mesh = new Mesh(geometry, material);
      mesh.onBeforeRender = (renderer, scene, camera) => {
        const position = camera.position;
        geometry.instanceCount = updateRingRect(camera, veg.field.heightAt(position.x, position.z), ring, rect);
      };
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = `grass-ring-${i}`;
      mesh.renderOrder = -1 + i * 0.01;
      group.add(mesh);
      rings.push(mesh);
    });
  };
  setQuality(quality);
  return {
    group,
    uniforms,
    setQuality,
    setVisible(visible) {
      group.visible = visible;
    },
    get bladeCount() {
      return bladeCount;
    },
    dispose() {
      for (const mesh of rings) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    },
  };
}
