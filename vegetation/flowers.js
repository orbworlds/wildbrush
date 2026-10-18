/**
 * Wildflowers: daisies, buttercups, poppies, lavender, cornflowers and pink blooms drawn as instanced rings that follow the camera. The vertex shader places them in patches, picks the species and bends them with the wind and the hero.
 */
import {
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
const FLOWER_RINGS = {
  high: [
    {
      spacing: 0.42,
      radius: 24,
      size: 1,
    },
    {
      spacing: 1.05,
      radius: 75,
      size: 1.5,
    },
  ],
  medium: [
    {
      spacing: 0.5,
      radius: 22,
      size: 1,
    },
    {
      spacing: 1.25,
      radius: 65,
      size: 1.55,
    },
  ],
  low: [
    {
      spacing: 0.65,
      radius: 20,
      size: 1.1,
    },
    {
      spacing: 1.5,
      radius: 50,
      size: 1.6,
    },
  ],
};
const PETAL_COLORS = ['#f8f5ec', '#fff27a', '#ee3b24', '#a47fe0', '#4d7cf0', '#f58cc0'];
const CENTER_COLORS = ['#f5b81c', '#f0c020', '#2b1a14', '#6a4bb0', '#2b3a8a', '#f7c531'];
const FLOWER_PARS_GLSL = `
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
  uvec4 hs = uvec4(uvec2(ci + ivec2(65536)), uint(uFRing) * 104729u + 911u, 5u);
  vec4 r1 = vegRand4(hs);
  vec4 r2 = vegRand4(hs + uvec4(0u, 0u, 0u, 77u));
  vec2 rootXZ = (vec2(ci) + r1.xy) * uFSpacing;
  float dist = distance(rootXZ, uCameraPos.xz);
  float fadeR = uFRadius * mix(0.5, 1.0, r1.z);
  float fade = 1.0 - smoothstep(fadeR - uFRadius * 0.2, fadeR, dist);
  vec4 fld = vegField(rootXZ);
  float dens = smoothstep(0.25, 0.8, fld.y) * (1.0 - fld.w * 0.85);
  float pn = wbNoise2(rootXZ * 0.06 + 5.3) * 0.7 + wbNoise2(rootXZ * 0.19 + 17.0) * 0.3;
  float patchv = smoothstep(0.5, 0.74, pn);
  vec3 root = vec3(rootXZ.x, fld.x - 0.02, rootXZ.y);
  float vit = clamp(wbVitality(root), 0.0, 1.0);
  float prob = (patchv * 0.9 + 0.035) * dens * mix(0.3, 1.0, vit);
  float keep = smoothstep(r1.w, r1.w + 0.06, prob);
  float burnt = clamp(wbBurnt(rootXZ), 0.0, 1.0);
  float sc = fade * keep * (1.0 - burnt);
  vec4 clipC = projectionMatrix * (viewMatrix * vec4(root + vec3(0.0, 0.3, 0.0), 1.0));
  bool culled = sc < 0.03 || root.y < uWaterLevel + 0.2 || clipC.w < -1.0
    || abs(clipC.x) > clipC.w * 1.04 + 1.0 || abs(clipC.y) > clipC.w * 1.04 + 1.5;
  if (!culled) {
    // species: mostly one per patch, some mixing; the dry meadow favours buttercups & poppies
    float sn = wbNoise2(rootXZ * 0.028 + 91.0);
    float spf = floor(fract(sn * 2.9 + (r2.x < 0.22 ? r2.y : 0.0)) * 6.0);
    if (fld.z > 0.4 && r2.z < fld.z) spf = r2.w < 0.6 ? 1.0 : 2.0;
    int sp = int(spf);
    float stemH = sp == 3 ? 0.62 : sp == 2 ? 0.72 : sp == 5 ? 0.7 : 0.58;
    float headS = sp == 0 ? 0.105 : sp == 1 ? 0.08 : sp == 2 ? 0.12 : sp == 3 ? 0.09 : sp == 4 ? 0.085 : 0.105;
    float bloom = mix(0.45, 1.0, smoothstep(0.1, 0.9, vit));
    float s = uFSize * sc * bloom * mix(0.8, 1.2, r2.y);
    stemH *= mix(0.75, 1.25, r2.x) * mix(0.6, 1.0, sc) * (1.0 + fld.z * 0.3);
    headS *= s;

    // wind bend (like a grass blade)
    float gust = vegGust(rootXZ);
    vec2 wd = vegWindDir();
    float ph = r1.x * 6.2831853;
    float fl = sin(uTime * (2.2 + r2.x * 1.5) + ph) * (0.04 + 0.06 * uWindStrength);
    vec2 bend = wd * (0.04 + uWindStrength * (0.12 + gust * 0.3)) * stemH + vec2(cos(ph), sin(ph)) * (0.06 * stemH + fl * stemH);
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
        // lavender spike: vertical camera-facing card
        hy = normalize(vec3(bend.x * 0.6, 1.0, bend.y * 0.6));
        hx = side;
        hn = normalize(toCam + vec3(0.0, 0.4, 0.0));
        head += hy * headS * 1.6;
        vegPos = head + hx * position.x * headS * 0.55 + hy * position.y * headS * 2.2;
      } else {
        float ta = r2.z * 6.2831853;
        vec2 tilt = vec2(cos(ta), sin(ta)) * 0.55 + bend / max(stemH, 0.05) * 0.8;
        // lean heads a little toward the viewer so fields read from eye level
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
    vFStemCol = wbApplyVitality(uFStem * mix(0.8, 1.1, r1.z) * (1.0 - fld.z * 0.2) + vec3(0.12, 0.08, 0.0) * fld.z, root);
    vFPetalC = wbApplyVitality(uFPetal[sp], root);
    vFCenterC = wbApplyVitality(uFCenter[sp], root);
    vVegTrans = position.z > 0.5 ? 1.0 : 0.3;
    vVegGloss = sp == 1 ? 0.8 : 0.1;
    vVegAO = position.z > 0.5 ? 1.0 : mix(0.5, 1.0, position.y);
  }
}
objectNormal = vegN;
`;
const FLOWER_COLOR_FRAGMENT = `
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
      float N = sp == 0 ? 13.0 : sp == 1 ? 5.0 : sp == 2 ? 4.0 : sp == 4 ? 9.0 : 8.0;
      float a = atan(uv.y, uv.x);
      float pa = abs(fract(a * N / 6.2831853 + vFRand) - 0.5) * 2.0;
      float edge;
      if (sp == 0) edge = mix(1.0, 0.3, pow(pa, 0.6));
      else if (sp == 1) edge = mix(0.95, 0.55, pa * pa);
      else if (sp == 2) edge = mix(1.0, 0.72, pa * pa);
      else if (sp == 4) edge = mix(1.0, 0.45, pow(pa, 0.8)) - 0.12 * step(0.8, fract(a * N * 1.5));
      else edge = mix(1.0, 0.4, pow(pa, 0.9));
      if (r > edge) discard;
      float cr = sp == 0 ? 0.3 : sp == 2 ? 0.28 : sp == 1 ? 0.3 : 0.24;
      vec3 petal = vFPetalC;
      petal *= mix(0.72, 1.08, smoothstep(0.1, 0.9, r / max(edge, 0.01)));
      petal *= 0.9 + 0.1 * (1.0 - pa);
      c = r < cr ? vFCenterC * (0.8 + 0.4 * (1.0 - r / cr)) : petal;
    }
  }
  diffuseColor.rgb = c;
}
`;
function createFlowerGeometry(count) {
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
export function createFlowers(veg, quality) {
  const group = new Group();
  group.name = 'vegetation-flowers';
  const petalColors = {
    value: PETAL_COLORS.map((hex) => toColor(hex)),
  };
  const centerColors = {
    value: CENTER_COLORS.map((hex) => toColor(hex)),
  };
  const stemColor = {
    value: toColor('#4f8a33'),
  };
  let rings = [];
  const setQuality = (quality) => {
    for (const mesh of rings) {
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    rings = [];
    FLOWER_RINGS[quality].forEach((ringDef, i) => {
      const maxN = Math.ceil((2 * ringDef.radius) / ringDef.spacing) + 4;
      const rect = new Vector4(0, 0, maxN, maxN);
      const ring = {
        spacing: ringDef.spacing,
        radius: ringDef.radius,
        maxN,
      };
      const material = new MeshLambertMaterial({
        side: 2,
      });
      patchVegMaterial(veg, material, {
        key: 'flowers',
        uniforms: {
          uFSpacing: {
            value: ringDef.spacing,
          },
          uFRect: {
            value: rect,
          },
          uFRadius: {
            value: ringDef.radius,
          },
          uFRing: {
            value: i,
          },
          uFSize: {
            value: ringDef.size,
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
        fragmentColor: FLOWER_COLOR_FRAGMENT,
        fragmentPost: 'reflectedLight.indirectDiffuse *= vVegAO;',
        noFaceFlip: true,
        transColor: toColor('#fff4d0'),
      });
      const geometry = createFlowerGeometry(maxN * maxN);
      const mesh = new Mesh(geometry, material);
      mesh.onBeforeRender = (renderer, scene, camera) => {
        const position = camera.position;
        geometry.instanceCount = updateRingRect(camera, veg.field.heightAt(position.x, position.z), ring, rect);
      };
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.name = `flowers-ring-${i}`;
      group.add(mesh);
      rings.push(mesh);
    });
  };
  setQuality(quality);
  return {
    group,
    setQuality,
    dispose() {
      for (const mesh of rings) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    },
  };
}
