/**
 * The hero's face, drawn by a shader on a patch over the head: eyes that blink and look around, brows, mouth, blush and freckles, all driven by expression params. Then HeroModel, which puts together the skinned body, its outline, the face, the pose and the outfit geometries.
 */
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Vector3,
  Vector4,
} from 'three';
import { buildHeroGeometry, headSurface, smoothFaceNormal } from './body-mesh.js';
import { BONE, createBones, HEAD_CENTER, Pose, REST_POS } from './rig.js';
import { createHeroMaterials, patchToonMaterial } from './toon-material.js';
export const neutralFace = () => ({
  blink: 0,
  happy: 0,
  squeeze: 0,
  widen: 0,
  lookX: 0,
  lookY: 0,
  lid: 0.25,
  lidTilt: 0,
  browY: 0,
  browTilt: 0,
  mouthCurve: 0.6,
  mouthOpen: 0,
  mouthWidth: 1,
  teeth: 0,
  blush: 0,
});
const EYE_X = 0.046;
const EYE_Y = -0.014;
const EYE_A = 0.0198;
const EYE_B = 0.0276;
const FACE_GLSL = `
uniform vec4 uF0; // blink, happy, squeeze, widen
uniform vec4 uF1; // lookX, lookY, lid, lidTilt
uniform vec4 uF2; // browY, browTilt, mouthCurve, mouthOpen
uniform vec4 uF3; // mouthWidth, teeth, blush, -
varying vec2 vFace;
vec3 wbFaceGlow = vec3(0.0);

// coverage of the region d < 0 (d in metres), anti-aliased over ~1 pixel
float fCov(float d) {
  float w = max(fwidth(d), 1e-6) * 0.8;
  return 1.0 - smoothstep(-w, w, d);
}
// accumulate a layer (premultiplied)
void fLay(inout vec4 acc, vec3 col, float a) {
  acc.rgb = col * a + acc.rgb * (1.0 - a);
  acc.a = a + acc.a * (1.0 - a);
}
float fSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float fSegT(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

${Object.entries({
  F_LASH: 2758674,
  F_SCLERA: 16775922,
  F_SCLERA_SH: 13226467,
  F_IRIS_TOP: 0x1a0f0b,
  F_IRIS_BOT: 0x6a3a1c,
  F_IRIS_RING: 0xd08a42,
  F_PUPIL: 0x0a0605,
  F_BROW: 5910560,
  F_MOUTH: 9058864,
  F_MOUTH_IN: 5905434,
  F_TONGUE: 15304320,
  F_TEETH: 16775924,
  F_BLUSH: 16028810,
  F_FRECKLE: 13602412,
}).map(([id, hex]) => {
  const color = new Color(hex);
  return `const vec3 ${id} = vec3(${color.r.toFixed(4)}, ${color.g.toFixed(4)}, ${color.b.toFixed(4)});`;
}).join(`
`)}

void fEye(inout vec4 acc, float s) {
  const float EA = ${EYE_A.toFixed(4)};
  const float EB = ${EYE_B.toFixed(4)};
  vec2 q = vFace - vec2(s * ${EYE_X.toFixed(4)}, ${EYE_Y.toFixed(4)});
  q.x *= s; // +x = toward the temple
  float blink = uF0.x, happy = uF0.y, squeeze = uF0.z, widen = uF0.w;
  float lid = uF1.z, tilt = uF1.w;
  float a = EA * (1.0 + 0.08 * widen), b = EB * (1.0 + 0.1 * widen);
  // tall oval, a touch wider at the top
  float sx = a * (1.0 + 0.07 * clamp(q.y / b, -1.0, 1.0));
  float dE = (length(vec2(q.x / sx, q.y / b)) - 1.0) * min(sx, b) * 0.9;
  float xn = clamp(q.x / a, -1.3, 1.3);
  // upper lid line: open → above the oval; closing → a gentle curve low in the eye
  float close = clamp(max(blink, lid * 0.6), 0.0, 1.0);
  float lidY = mix(b * 1.05, -b * 0.3 + b * 0.16 * xn * xn, close);
  float tp = max(tilt, 0.0), tn = max(-tilt, 0.0);
  lidY -= (tp * 0.42 * (1.0 - xn) * 0.5 + tn * 0.3 * (1.0 + xn) * 0.5) * b * (1.0 - blink);
  float open = (1.0 - smoothstep(0.25, 0.75, happy)) * (1.0 - smoothstep(0.25, 0.75, squeeze));
  float inside = fCov(dE) * fCov(q.y - lidY);
  // sclera, shaded under the lid
  vec3 sc = mix(F_SCLERA_SH, F_SCLERA, smoothstep(0.0, b * 0.5, lidY - q.y));
  vec4 eye = vec4(0.0);
  fLay(eye, sc, 1.0);
  // iris (+ warm lower ring, pupil) following the look direction
  vec2 ic = vec2(uF1.x * s * a * 0.26, uF1.y * b * 0.2 - b * 0.1);
  vec2 ir = vec2(a * 0.86, b * 0.88) * (1.0 - 0.2 * widen);
  vec2 iq = (q - ic) / ir;
  float rn = length(iq);
  float irisA = fCov((rn - 1.0) * ir.x);
  float lowT = clamp(-iq.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 ic0 = mix(F_IRIS_TOP, F_IRIS_BOT, smoothstep(0.3, 1.0, lowT));
  ic0 = mix(ic0, F_IRIS_RING, smoothstep(0.6, 0.8, rn) * (1.0 - smoothstep(0.86, 0.96, rn)) * smoothstep(0.5, 1.0, lowT) * 0.9);
  ic0 = mix(ic0, F_PUPIL, fCov((length(iq * vec2(1.0, 0.9)) - 0.42) * ir.x));
  ic0 = mix(ic0, F_IRIS_TOP * 0.8, smoothstep(0.9, 1.0, rn));
  fLay(eye, ic0, irisA);
  // two glints (head-space offsets, so both eyes are lit from the same side)
  vec2 h1 = ic + vec2(0.34 * a * s, 0.34 * b);
  vec2 h2 = ic + vec2(-0.3 * a * s, -0.42 * b);
  float g1 = fCov((length((q - h1) / vec2(0.3 * a, 0.26 * b)) - 1.0) * 0.26 * a);
  float g2 = fCov((length(q - h2) - 0.12 * a) * 1.0);
  float glint = max(g1, g2 * 0.95) * irisA;
  fLay(eye, vec3(1.0), glint);
  float eyeA = inside * open;
  fLay(acc, eye.rgb / max(eye.a, 1e-4), eyeA);
  wbFaceGlow += vec3(0.55) * glint * eyeA;

  // lash line: upper outline of the oval + the lid edge, thicker toward the outer corner
  float th = 0.0029 + 0.0024 * smoothstep(-0.6, 1.0, xn);
  float upper = fCov(abs(dE) - th) * smoothstep(-0.35 * b, 0.05 * b, q.y) * fCov(q.y - lidY - th * 0.6);
  float lidS = fCov(abs(q.y - lidY) - th) * fCov(dE - th * 0.8);
  // outer flick
  float fh;
  float fl = fSegT(q, vec2(a * 0.78, lidY * 0.55 + b * 0.12 * (1.0 - close)), vec2(a * 1.32, lidY * 0.55 + b * 0.5 - close * b * 0.25), fh);
  float flick = fCov(fl - mix(0.0032, 0.0008, fh));
  // faint lower lash at the outer corner
  float lower = fCov(abs(dE) - 0.0009) * smoothstep(0.1, 0.5, xn) * smoothstep(-0.2 * b, -0.6 * b, q.y) * 0.7 * (1.0 - close);
  float lash = max(max(upper, lidS), max(flick, lower));
  fLay(acc, F_LASH, lash * open);

  // ^^ happy arcs
  float hx = clamp(q.x, -a, a);
  float dA = length(vec2(q.x - hx, (q.y - (-0.2 * b + 0.62 * b * (1.0 - (hx / a) * (hx / a)))) * 0.8));
  fLay(acc, F_LASH, fCov(dA - 0.0027) * smoothstep(0.35, 0.8, happy));
  // >< squeezed
  vec2 tip = vec2(-0.72 * a, 0.02 * b);
  float dS = min(fSeg(q, tip, vec2(0.95 * a, 0.52 * b)), fSeg(q, tip, vec2(0.95 * a, -0.46 * b)));
  fLay(acc, F_LASH, fCov(dS - 0.0028) * smoothstep(0.35, 0.8, squeeze) * (1.0 - smoothstep(0.35, 0.8, happy)));
}

void fBrow(inout vec4 acc, float s) {
  const float EA = ${EYE_A.toFixed(4)};
  const float EB = ${EYE_B.toFixed(4)};
  vec2 q = vFace - vec2(s * ${EYE_X.toFixed(4)}, ${EYE_Y.toFixed(4)});
  q.x *= s;
  float by = uF2.x, bt = uF2.y;
  vec2 p0 = vec2(-0.6 * EA, EB + 0.0135 + by + bt * 0.0062);
  vec2 p1 = vec2(1.0 * EA, EB + 0.0155 + by - bt * 0.0035);
  float t = clamp((q.x - p0.x) / (p1.x - p0.x), 0.0, 1.0);
  float arch = 0.0032 * (1.0 - 0.6 * max(bt, 0.0));
  vec2 c = vec2(mix(p0.x, p1.x, t), mix(p0.y, p1.y, t) + arch * 4.0 * t * (1.0 - t));
  float d = length(q - c) - mix(0.0038, 0.0017, t);
  fLay(acc, F_BROW, fCov(d));
}

void fMouth(inout vec4 acc) {
  vec2 m = vFace - vec2(0.0, ${(-0.08).toFixed(4)});
  float w = ${(0.0115).toFixed(4)} * uF3.x;
  float cv = uF2.z, o = uF2.w, teeth = uF3.y;
  float t = clamp(m.x / w, -1.0, 1.0);
  float yc = cv * 0.0048 * (t * t - 0.3);
  // rounder when open (a D / an O), boxier with gritted teeth
  float H = o * 0.019 * pow(max(0.0, 1.0 - t * t), mix(0.55, 0.22, teeth));
  float yt = yc + o * 0.0016 * (1.0 - t * t);
  float yl = yc - H;
  float dIn = max(abs(m.x) - w, max(m.y - yt, yl - m.y));
  // interior: dark, a tongue at the bottom, or gritted teeth
  float inA = fCov(dIn) * smoothstep(0.02, 0.12, o);
  vec3 ci = F_MOUTH_IN;
  float H0 = o * 0.019;
  float tongue = fCov((length((m - vec2(0.0, yc - H0 * 0.95)) / vec2(w * 0.62, H0 * 0.55 + 1e-4)) - 1.0) * H0 * 0.5);
  ci = mix(ci, F_TONGUE, tongue * (1.0 - teeth));
  float mid = (yt + yl) * 0.5;
  float gap = fCov(abs(m.y - mid) - 0.00045) + fCov(abs(fract(m.x / (w * 0.5) + 0.5) - 0.5) * w * 0.5 - 0.0003) * 0.6;
  ci = mix(ci, mix(F_TEETH, F_MOUTH_IN, min(1.0, gap)), teeth);
  fLay(acc, ci, inA);
  // outline (a plain stroke when closed)
  float thM = 0.0016 * (1.0 - 0.45 * t * t) + 0.0003 * o;
  fLay(acc, F_MOUTH, fCov(abs(dIn) - thM));
}

vec4 wbFace(vec2 p) {
  vec4 acc = vec4(0.0);
  // cheeks: soft blush + a few freckles
  float blush = uF3.z;
  for (int i = 0; i < 2; i++) {
    float s = i == 0 ? 1.0 : -1.0;
    vec2 c = vec2(s * 0.077, -0.056);
    float r = length((p - c) / vec2(0.026, 0.015));
    fLay(acc, F_BLUSH, (1.0 - smoothstep(0.1, 1.0, r)) * (0.42 + 0.4 * blush));
    float fr = 1e3;
    fr = min(fr, length(p - vec2(s * 0.061, -0.04)));
    fr = min(fr, length(p - vec2(s * 0.071, -0.046)));
    fr = min(fr, length(p - vec2(s * 0.064, -0.051)));
    fLay(acc, F_FRECKLE, fCov(fr - 0.0013) * 0.55);
  }
  fEye(acc, 1.0);
  fEye(acc, -1.0);
  fBrow(acc, 1.0);
  fBrow(acc, -1.0);
  fMouth(acc);
  return vec4(acc.rgb / max(acc.a, 1e-4), acc.a);
}
`;
class HeroFace {
  mesh;
  params = neutralFace();
  u = {
    uF0: {
      value: new Vector4(),
    },
    uF1: {
      value: new Vector4(),
    },
    uF2: {
      value: new Vector4(),
    },
    uF3: {
      value: new Vector4(),
    },
  };
  constructor(ctx, mats) {
    const positions = [];
    const faceUv = [];
    const indices = [];
    const p = new Vector3();
    for (let i = 0; i <= 24; i++)
      for (let j = 0; j <= 30; j++) {
        const u = -0.118 + (0.236 * j) / 30;
        const v = -0.118 + (0.176 * i) / 24;
        headSurface(u, v, 0.0012, p);
        positions.push(p.x, p.y, p.z);
        faceUv.push(u, v);
        if (j < 30 && i < 24) {
          const i00 = i * 31 + j;
          const i01 = i00 + 1;
          const i10 = i00 + 30 + 1;
          const i11 = i10 + 1;
          indices.push(i00, i01, i10, i01, i11, i10);
        }
      }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aFace', new Float32BufferAttribute(faceUv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    {
      const position = geometry.attributes.position;
      const normal = geometry.attributes.normal;
      const nrm = new Vector3();
      for (let i = 0; i < position.count; i++) {
        p.fromBufferAttribute(position, i);
        smoothFaceNormal(p, nrm.fromBufferAttribute(normal, i));
        normal.setXYZ(i, nrm.x, nrm.y, nrm.z);
      }
    }
    geometry.computeBoundingSphere();
    const material = new MeshStandardMaterial({
      roughness: 0.7,
      metalness: 0,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    material.name = 'hero-face';
    const uniforms = this.u;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec2 aFace;
varying vec2 vFace;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vFace = aFace;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
` + FACE_GLSL,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{ vec4 wbF = wbFace(vFace); diffuseColor.rgb = wbF.rgb; diffuseColor.a *= wbF.a; if (diffuseColor.a < 0.004) discard; }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
totalEmissiveRadiance += wbFaceGlow;`,
        );
    };
    patchToonMaterial(material, ctx, {
      key: 'wb-hero-face-v1',
      rim: 0.6,
      flashColor: mats.flashColor,
      flashAmt: mats.flashAmt,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'hero-face';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
    this.mesh.position.copy(HEAD_CENTER).sub(REST_POS[BONE.head]);
    this.apply();
  }
  apply() {
    const params = this.params;
    const u = this.u;
    u.uF0.value.set(params.blink, params.happy, params.squeeze, params.widen);
    u.uF1.value.set(params.lookX, params.lookY, params.lid, params.lidTilt);
    u.uF2.value.set(params.browY, params.browTilt, params.mouthCurve, params.mouthOpen);
    u.uF3.value.set(params.mouthWidth, params.teeth, params.blush, 0);
  }
}
export class HeroModel {
  group = new Group();
  bones;
  skeleton;
  mesh;
  outline;
  pose = new Pose();
  mats;
  face;
  outfit = 'classic';
  geos;
  /** `geos`: outfit geometries to share with other heroes (they must not change their draw range). */
  constructor(ctx, geos = {}) {
    this.group.name = 'hero';
    this.bones = createBones();
    this.skeleton = new Skeleton(this.bones);
    this.geos = geos;
    const geometry = (geos.classic ??= buildHeroGeometry());
    this.mats = createHeroMaterials(ctx);
    this.mesh = new SkinnedMesh(geometry, this.mats.body);
    this.mesh.name = 'hero-body';
    this.mesh.add(this.bones[0]);
    this.mesh.bind(this.skeleton);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.outline = new SkinnedMesh(geometry, this.mats.outline);
    this.outline.name = 'hero-outline';
    this.outline.bind(this.skeleton, this.mesh.bindMatrix);
    this.outline.castShadow = false;
    this.outline.receiveShadow = false;
    this.outline.frustumCulled = false;
    this.group.add(this.mesh, this.outline);
    this.face = new HeroFace(ctx, this.mats);
    this.bones[BONE.head].add(this.face.mesh);
  }
  get bodyIndexCount() {
    return Number(this.mesh.geometry.userData?.bodyIndexCount) || 0;
  }
  setOutfit(outfit) {
    if (outfit === this.outfit) return false;
    let geometry = this.geos[outfit];
    if (!geometry)
      try {
        geometry = buildHeroGeometry(outfit);
        this.geos[outfit] = geometry;
      } catch (err) {
        console.warn('[character] outfit build failed', err);
        return false;
      }
    this.mesh.geometry = geometry;
    this.outline.geometry = geometry;
    this.outfit = outfit;
    return true;
  }
  prepareOutfit(outfit) {
    if (!this.geos[outfit])
      try {
        this.geos[outfit] = buildHeroGeometry(outfit);
      } catch {}
  }
  applyPose() {
    this.pose.apply(this.bones);
    this.face.apply();
  }
}
