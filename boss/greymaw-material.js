/**
 * Greymaw's body material: the uniforms the boss drives each frame, the bone-skinning vertex shader with ink wobble and drips, the painted mask, jaw, stolen-colour crystals and glowing cracks in the fragment shader, a banded light ramp, and matching shadow-depth and outline materials.
 */
import {
  BackSide,
  Matrix4,
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
  Vector4,
} from 'three';
export function createGreymawUniforms() {
  const bones = [];
  for (let i = 0; i < 14; i++) bones.push(new Matrix4());
  return {
    uBones: {
      value: bones,
    },
    uP0: {
      value: new Vector4(0, 0, 0, 0),
    },
    uP1: {
      value: new Vector4(0, 1, 0, 0),
    },
    uP2: {
      value: new Vector4(0, 0, 0, 0),
    },
    uP3: {
      value: new Vector4(0, 0, 0, 0),
    },
    uP4: {
      value: new Vector4(0.37, 1, 0, 0),
    },
    uCrystal: {
      value: [0, 1, 2, 3].map(() => new Vector4(0.3, 1, 0, 0)),
    },
    uPool: {
      value: new Vector4(0, 0, -10000, 0),
    },
    uDripRate: {
      value: 0.16,
    },
    uWobble: {
      value: 0.035,
    },
  };
}
const GREYMAW_SKIN_VERTEX = `
uniform mat4 uBones[14];
uniform vec4 uP0;
uniform vec4 uP4;
uniform vec4 uCrystal[4];
uniform float uDripRate;
uniform float uWobble;
attribute vec4 aSkin;
attribute vec4 aFx;
varying vec3 vRest;
varying vec2 vFaceUv;
varying float vRough;
varying float vDripTip;
varying vec3 vBsWorld;
flat varying float vPart;
flat varying float vBone;

vec3 bsCof(mat4 m, vec3 n) {
  vec3 c0 = m[0].xyz; vec3 c1 = m[1].xyz; vec3 c2 = m[2].xyz;
  return n.x * cross(c1, c2) + n.y * cross(c2, c0) + n.z * cross(c0, c1);
}
void bsSkin(out vec3 P, out vec3 N) {
  float part = aSkin.w;
  vec3 p = position;
  float seed = uP4.x;
  float ink = (part < 0.5 || abs(part - 2.0) < 0.5 || abs(part - 3.0) < 0.5 || abs(part - 5.0) < 0.5) ? 1.0 : 0.0;
  float wob = sin(uTime * 1.9 + p.y * 1.3 + seed * 6.283) * 0.55 + sin(uTime * 2.7 + p.x * 1.7 - p.z * 1.1) * 0.45;
  p += normal * wob * uWobble * ink * (1.0 + uP0.x * 3.0 + uP0.w * 2.0 + uP4.z * 2.0);
  mat4 A = uBones[int(aSkin.x + 0.5)];
  mat4 B = uBones[int(aSkin.y + 0.5)];
  vec3 pa = (A * vec4(p, 1.0)).xyz;
  vec3 pb = (B * vec4(p, 1.0)).xyz;
  P = mix(pa, pb, aSkin.z);
  vec3 na = normalize(bsCof(A, normal));
  vec3 nb = normalize(bsCof(B, normal));
  N = normalize(mix(na, nb, aSkin.z));
  vDripTip = 0.0;
  if (aFx.w > 0.0) {
    float rate = uDripRate * (0.65 + 0.7 * fract(aFx.x * 7.13));
    float c = fract(uTime * rate + aFx.x + seed);
    float s = smoothstep(0.0, 0.82, c) * (1.0 - smoothstep(0.82, 0.87, c));
    float tip = aFx.y * aFx.y;
    P.y -= s * aFx.w * tip * (1.0 + uP4.z * 2.0 + uP0.w * 1.5);
    vDripTip = aFx.y;
  }
  // shattered crystals vanish
  if (part > 9.5) {
    int ci = int(part - 10.0 + 0.5);
    if (uCrystal[ci].y < 0.5) { P = A[3].xyz; N = vec3(0.0, 1.0, 0.0); }
  }
  vRest = position;
  vPart = part;
  vBone = aSkin.x;
  vFaceUv = uv;
  vRough = aFx.z;
  vBsWorld = P;
}
`;
const GREYMAW_PARS_FRAGMENT = `
#include <wb_common>
uniform vec4 uP0;
uniform vec4 uP1;
uniform vec4 uP2;
uniform vec4 uP3;
uniform vec4 uP4;
uniform vec4 uCrystal[4];
uniform vec4 uPool;
varying vec3 vRest;
varying vec2 vFaceUv;
varying float vRough;
varying float vDripTip;
varying vec3 vBsWorld;
flat varying float vPart;
flat varying float vBone;

float bsBayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  if (i < 0.5) return 0.0; if (i < 1.5) return 8.0; if (i < 2.5) return 2.0; if (i < 3.5) return 10.0;
  if (i < 4.5) return 12.0; if (i < 5.5) return 4.0; if (i < 6.5) return 14.0; if (i < 7.5) return 6.0;
  if (i < 8.5) return 3.0; if (i < 9.5) return 11.0; if (i < 10.5) return 1.0; if (i < 11.5) return 9.0;
  if (i < 12.5) return 15.0; if (i < 13.5) return 7.0; if (i < 14.5) return 13.0; return 5.0;
}
float bsEllipse(vec2 q, vec2 c, vec2 r) { vec2 d = (q - c) / r; return (length(d) - 1.0) * min(r.x, r.y); }
float bsBox(vec2 q, vec2 c, vec2 h) { vec2 d = abs(q - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
vec2 bsRot(vec2 q, float a) { float s = sin(a), c = cos(a); return vec2(c * q.x - s * q.y, s * q.x + c * q.y); }
vec3 bsHue(float h) {
  vec3 R = vec3(1.0, 0.105, 0.04);
  vec3 B = vec3(0.07, 0.55, 1.0);
  vec3 Y = vec3(1.0, 0.66, 0.06);
  vec3 G = vec3(0.1, 0.68, 0.14);
  h = fract(h) * 4.0;
  vec3 c = mix(R, Y, clamp(h, 0.0, 1.0));
  c = mix(c, G, clamp(h - 1.0, 0.0, 1.0));
  c = mix(c, B, clamp(h - 2.0, 0.0, 1.0));
  c = mix(c, R, clamp(h - 3.0, 0.0, 1.0));
  return c;
}
vec3 bsPaint(int i) {
  if (i == 0) return vec3(1.0, 0.1, 0.04);
  if (i == 1) return vec3(0.07, 0.55, 1.0);
  if (i == 2) return vec3(1.0, 0.66, 0.06);
  return vec3(0.1, 0.68, 0.14);
}
// counter colour: red <- frost, blue <- ember, yellow <- bloom, green <- spring
vec3 bsCounter(int i) {
  if (i == 0) return vec3(0.07, 0.55, 1.0);
  if (i == 1) return vec3(1.0, 0.1, 0.04);
  if (i == 2) return vec3(0.1, 0.68, 0.14);
  return vec3(1.0, 0.66, 0.06);
}
float bsVoronoiEdge(vec2 x) {
  vec2 n = floor(x); vec2 f = fract(x);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = wbHash22(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(f2) - sqrt(f1);
}
float bsCrackMask(vec3 p, float width) {
  vec2 cyl = vec2(atan(p.x, p.z) * 1.5, p.y * 0.45) * 2.2;
  float n = wbNoise3(p * 1.1 + uP4.x * 3.0);
  float e = bsVoronoiEdge(cyl + (n - 0.5) * 0.6);
  float keep = smoothstep(0.45, 0.6, wbNoise3(p * 0.35 + 11.0));
  return (1.0 - smoothstep(width * 0.3, width, e)) * keep;
}
// jagged crack line from a to b (distance in face space)
float bsCrackLine(vec2 q, vec2 a, vec2 b, float seed) {
  vec2 ab = b - a;
  float t = clamp(dot(q - a, ab) / dot(ab, ab), 0.0, 1.0);
  vec2 p = a + ab * t;
  vec2 nrm = normalize(vec2(-ab.y, ab.x));
  float j = (wbNoise2(vec2(t * 9.0, seed)) - 0.5) * 0.12 + (wbNoise2(vec2(t * 23.0, seed + 4.0)) - 0.5) * 0.05;
  return abs(dot(q - p, nrm) - j);
}

// Greymaw's face. q in [-1,1] (x right as seen from the front, y up).
void bsFace(inout vec3 col, inout vec3 emit, vec2 q) {
  float glow = uP1.x;
  float open = uP1.y;
  float anger = uP1.z;
  float crack = uP2.z;
  float rage = uP2.w;
  vec2 pup = uP2.xy;
  vec3 hole = vec3(0.02, 0.018, 0.028);
  vec3 paint = vec3(0.36, 0.3, 0.38);
  vec3 glowCol = vec3(1.0, 0.92, 0.72);
  float fib = wbNoise2(q * vec2(34.0, 8.0) + 3.0) * 0.5 + wbNoise2(q * 80.0) * 0.5;
  col *= 0.93 + 0.09 * fib;
  float rim = length(q * vec2(1.0, 1.08));
  float stain = smoothstep(0.66, 1.0, rim + (wbNoise2(q * 4.0 + 2.0) - 0.5) * 0.4);
  col = mix(col, vec3(0.3, 0.29, 0.34), stain * 0.55);

  float eyes = 1e5, pupils = 1e5, marks = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? 1.0 : -1.0;
    vec2 lq = q - vec2(0.43 * sx, 0.1);
    lq.x *= sx;
    lq = bsRot(lq, -0.18);
    // big almond eye hole, drooping outer corner; anger slices the inner-top
    float e = bsEllipse(lq, vec2(0.0), vec2(0.27, 0.19 * open + 0.02));
    float cut = dot(lq - vec2(0.0, 0.2 - anger * 0.16), normalize(vec2(-(0.25 + anger * 0.95), 1.0)));
    e = max(e, cut);
    eyes = min(eyes, e);
    pupils = min(pupils, length(lq - pup * vec2(0.09 * sx, 0.06) + vec2(0.02, 0.02)) - (0.05 + glow * 0.045));
    // painted brow stroke
    vec2 bq = bsRot(lq - vec2(-0.02, 0.28 - anger * 0.05), 0.2 + anger * 0.45);
    marks = min(marks, bsBox(bq, vec2(0.0), vec2(0.3, 0.035 + 0.012 * sin(bq.x * 18.0))));
    // ink tears running from the eyes
    vec2 tq = q - vec2(0.47 * sx, -0.32);
    marks = min(marks, bsBox(tq + vec2(sin(tq.y * 9.0) * 0.02, 0.0), vec2(0.0), vec2(0.03, 0.26)));
  }
  // forehead stripe + the four stolen-colour dots
  marks = min(marks, bsBox(q, vec2(0.0, 0.58), vec2(0.035, 0.18)));
  float dots = 1e5;
  vec2 dp[4];
  dp[0] = vec2(-0.12, 0.84); dp[1] = vec2(0.12, 0.84); dp[2] = vec2(-0.12, 0.68); dp[3] = vec2(0.12, 0.68);
  vec3 dotCol = vec3(0.0);
  float dotGlow = 0.0;
  for (int i = 0; i < 4; i++) {
    float d = length(q - dp[i]) - 0.055;
    if (d < dots) {
      dots = d;
      dotCol = bsPaint(i);
      dotGlow = uCrystal[i].x * uCrystal[i].y;
    }
  }
  // cracks: a few hairlines always, deep ones grow with damage
  float cr = 1e5;
  cr = min(cr, bsCrackLine(q, vec2(0.25, 1.0), vec2(0.08, 0.55), 1.0) + (1.0 - smoothstep(0.0, 0.1, crack + 0.05)));
  cr = min(cr, bsCrackLine(q, vec2(0.95, 0.35), vec2(0.62, 0.22), 2.0) + (1.0 - smoothstep(0.1, 0.2, crack)) * 0.2);
  cr = min(cr, bsCrackLine(q, vec2(0.08, 0.55), vec2(-0.05, 0.05), 3.0) + (1.0 - smoothstep(0.25, 0.4, crack)) * 0.2);
  cr = min(cr, bsCrackLine(q, vec2(-0.05, 0.05), vec2(-0.3, -0.7), 4.0) + (1.0 - smoothstep(0.45, 0.6, crack)) * 0.2);
  cr = min(cr, bsCrackLine(q, vec2(-0.95, 0.5), vec2(-0.55, 0.3), 5.0) + (1.0 - smoothstep(0.35, 0.5, crack)) * 0.2);
  cr = min(cr, bsCrackLine(q, vec2(-0.55, 0.3), vec2(-0.2, 0.42), 6.0) + (1.0 - smoothstep(0.6, 0.75, crack)) * 0.2);
  cr = min(cr, bsCrackLine(q, vec2(0.62, 0.22), vec2(0.7, -0.6), 7.0) + (1.0 - smoothstep(0.7, 0.85, crack)) * 0.2);
  float crackW = 0.012 + 0.02 * crack;
  float crackM = 1.0 - smoothstep(crackW * 0.5, crackW, cr);
  // a chunk broken out of the brow when badly cracked
  float chipK = smoothstep(0.7, 0.95, crack);
  float chip = chipK > 0.01 ? bsEllipse(bsRot(q - vec2(0.36, 0.72), 0.5), vec2(0.0), max(vec2(0.2, 0.13) * chipK, vec2(0.01))) : 1.0;

  // painted marks
  float mk = 1.0 - smoothstep(-0.01, 0.01, marks);
  col = mix(col, paint * (0.9 + 0.2 * fib), mk * 0.7);
  float dm = 1.0 - smoothstep(-0.008, 0.008, dots);
  col = mix(col, mix(vec3(0.45, 0.43, 0.47), dotCol, 0.35 + 0.65 * dotGlow), dm);
  emit += dotCol * dm * dotGlow * 1.8;
  // eye holes: dark with a lit lower lip; pupils burn when it attacks
  float eh = 1.0 - smoothstep(-0.012, 0.008, eyes);
  float lip = (1.0 - smoothstep(0.0, 0.035, abs(eyes))) * (1.0 - eh);
  col *= 1.0 - lip * 0.3;
  vec3 holeCol = mix(hole, glowCol * 1.2, glow * 0.6);
  holeCol = mix(holeCol, vec3(1.0, 0.45, 0.25), rage * 0.4);
  float pu = (1.0 - smoothstep(-0.01, 0.012, pupils)) * eh;
  holeCol = mix(holeCol, vec3(0.98, 0.95, 0.86), pu);
  col = mix(col, holeCol, eh);
  emit += eh * (glowCol * glow * 3.0 + vec3(1.0, 0.5, 0.25) * rage * 1.5) + vec3(1.0, 0.95, 0.8) * pu * (0.6 + glow * 3.5);
  // cracks: dark lines, glowing from inside as it weakens
  vec3 inner = mix(vec3(1.0, 0.85, 0.55), bsHue(q.x * 0.3 + q.y * 0.2 + uTime * 0.05), 0.35 + 0.4 * uP0.w);
  col = mix(col, vec3(0.08, 0.07, 0.1), crackM * 0.9);
  emit += inner * crackM * (smoothstep(0.35, 1.0, crack) * 2.0 + rage * 1.5 + uP0.w * 8.0);
  float ch = 1.0 - smoothstep(-0.01, 0.01, chip);
  col = mix(col, vec3(0.04), ch);
  emit += inner * ch * (1.5 + rage * 2.0 + uP0.w * 6.0);
}

void bsJaw(inout vec3 col, inout vec3 emit, vec2 q) {
  float glow = uP1.x;
  float tx = fract(q.x * 3.6 + 0.5);
  float tooth = abs(tx - 0.5) * 2.0;
  float band = q.y - (0.42 - tooth * 0.5);
  float gap = 1.0 - smoothstep(0.0, 0.06, abs(band));
  col = mix(col, vec3(0.05, 0.045, 0.06), gap * step(-0.3, q.y));
  col *= 0.92 + wbNoise2(q * vec2(30.0, 8.0)) * 0.1;
  col = mix(col, vec3(0.36, 0.3, 0.38), (1.0 - smoothstep(-0.01, 0.01, bsBox(q, vec2(0.0, -0.4), vec2(0.45, 0.05)))) * 0.6);
  emit += gap * vec3(1.0, 0.8, 0.5) * glow * 1.2;
}
`;
const GREYMAW_LIGHTS_FRAGMENT = `
float bsRamp(float ndl) {
  float band = smoothstep(-0.08, 0.26, ndl);
  float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  return mix(band, wrap * band, 0.3);
}
void RE_Direct_WBBoss( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  float ndl = dot( geometryNormal, directLight.direction );
  vec3 irradiance = bsRamp( ndl ) * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
  vec3 H = normalize( directLight.direction + geometryViewDir );
  float nh = max( dot( geometryNormal, H ), 0.0 );
  float r = material.roughness;
  float gloss = 1.0 - r;
  float lobe = smoothstep( 0.95, 0.995, nh ) * 0.03 + smoothstep( 0.9975 - r * 0.004, 0.9992, nh ) * 1.1;
  reflectedLight.directSpecular += directLight.color * lobe * gloss * gloss * smoothstep( -0.05, 0.25, ndl );
}
#undef RE_Direct
#define RE_Direct RE_Direct_WBBoss
`;
export function createGreymawMaterials(ctx, uniforms) {
  const globals = ctx.globals;
  const uni = uniforms;
  const body = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.3,
    metalness: 0,
  });
  body.name = 'greymaw-body';
  body.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uni);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
` + GREYMAW_SKIN_VERTEX,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 bsSkP; vec3 objectNormal; bsSkin(bsSkP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = bsSkP;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
` + GREYMAW_PARS_FRAGMENT,
      )
      .replace(
        '#include <lights_physical_pars_fragment>',
        `#include <lights_physical_pars_fragment>
` + GREYMAW_LIGHTS_FRAGMENT,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if ( uP4.y < 0.999 && uP4.y * 16.0 <= bsBayer4( gl_FragCoord.xy ) + 0.5 ) discard;
        // hidden below the ink-pool surface
        if ( vBsWorld.y < uPool.z && length( vBsWorld.xz - uPool.xy ) < uPool.w ) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 bsEmit = vec3(0.0);
        float bsInk = 0.0;
        float bsPaper = 0.0;
        float bsCrys = -1.0;
        {
          float part = vPart;
          if (abs(part - 1.0) < 0.5) { bsFace(diffuseColor.rgb, bsEmit, vFaceUv * 2.0 - 1.0); bsPaper = 1.0; }
          else if (abs(part - 4.0) < 0.5) { bsJaw(diffuseColor.rgb, bsEmit, vFaceUv * 2.0 - 1.0); bsPaper = 1.0; }
          else if (abs(part - 7.0) < 0.5) {
            float n = wbNoise3(vRest * 3.0);
            diffuseColor.rgb *= 0.8 + 0.35 * n;
          } else if (abs(part - 8.0) < 0.5) {
            float grain = wbNoise3(vec3(vRest.x * 20.0, vRest.y * 2.0, vRest.z * 20.0));
            diffuseColor.rgb *= 0.8 + 0.3 * grain;
          } else if (abs(part - 9.0) < 0.5) {
            float n = wbNoise3(vRest * 9.0);
            diffuseColor.rgb *= 0.75 + 0.4 * n;
          } else if (abs(part - 6.0) < 0.5) {
            // the maw: stolen colour churning inside
            float n = wbNoise3(vRest * 4.0 + vec3(0.0, uTime * 1.5, 0.0));
            bsEmit += bsHue(n * 1.4 + uTime * 0.2) * (0.08 + uP1.w * 2.8 + uP2.w) * (0.4 + n);
          } else if (part > 9.5) {
            int ci = int(part - 10.0 + 0.5);
            vec4 cs = uCrystal[ci];
            bsCrys = float(ci);
            vec3 pc = bsPaint(ci);
            vec3 cc = bsCounter(ci);
            float facet = wbNoise3(vRest * 5.0 + float(ci) * 7.0);
            float pulse = 0.65 + 0.35 * sin(uTime * (2.0 + cs.x * 4.0) + float(ci) * 1.7);
            diffuseColor.rgb = mix(pc * 0.45, pc, 0.55 + 0.45 * facet);
            bsEmit += pc * (0.25 + cs.x * 2.6 * pulse) * (0.6 + 0.6 * facet);
            // the needed colour shimmers through the facets (a readable hint)
            float veins = smoothstep(0.62, 0.78, wbNoise3(vRest * 9.0 + vec3(0.0, uTime * 0.6, 0.0)));
            bsEmit += cc * veins * cs.w * (0.9 + 0.6 * sin(uTime * 7.0));
            bsEmit += vec3(1.5) * cs.z;
          } else {
            bsInk = 1.0;
            diffuseColor.rgb *= 1.0 - vDripTip * 0.35;
            float hN = clamp(vRest.y / 8.5, 0.0, 1.0);
            float runs = wbNoise3(vRest * vec3(1.9, 0.35, 1.9) + vec3(0.0, uTime * 0.03, 0.0));
            diffuseColor.rgb *= (0.8 + 0.3 * hN) * (0.86 + 0.26 * runs);
          }
          bsEmit += diffuseColor.rgb * bsPaper * 0.14;
          // element coat (last paint that struck it)
          float coatN = wbNoise3(vRest * 0.9 + uP4.x * 5.0) * 0.7 + wbNoise3(vRest * 2.3) * 0.3;
          float coatT = 0.84 - uP3.w * 0.5;
          float coat = smoothstep(coatT, coatT + 0.05, coatN) * (1.0 - bsPaper * 0.85) * step(bsCrys, -0.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, uP3.rgb, coat);
          // fist telegraph: hot cracks spreading over the fist and forearm
          float fg = 0.0;
          if (abs(vBone - 8.0) < 0.5 || abs(vBone - 7.0) < 0.5) fg = uP0.y * (abs(vBone - 8.0) < 0.5 ? 1.0 : 0.55);
          if (abs(vBone - 11.0) < 0.5 || abs(vBone - 10.0) < 0.5) fg = uP0.z * (abs(vBone - 11.0) < 0.5 ? 1.0 : 0.55);
          if (fg > 0.001 && bsCrys < -0.5) {
            float cr = bsCrackMask(vRest * 1.6, 0.07);
            bsEmit += vec3(1.0, 0.62, 0.28) * (cr * 5.0 + 0.25) * fg;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.15, 0.08), cr * fg * 0.6);
          }
          // desperation: an inner fire leaking through the ink
          if (uP2.w > 0.001 && bsInk > 0.5) {
            float cr = bsCrackMask(vRest, 0.05);
            float bsPatch = smoothstep(0.45, 0.7, wbNoise3(vRest * 0.28 + vec3(0.0, uTime * 0.05, 3.0)));
            bsEmit += mix(vec3(1.0, 0.45, 0.2), bsHue(vRest.y * 0.1 + uTime * 0.1), 0.5) * cr * bsPatch * uP2.w * (1.6 + 0.8 * sin(uTime * 6.0 + vRest.y));
          }
          // death: vivid cracks with light pouring out
          float death = uP0.w;
          if (death > 0.001) {
            float cr = bsCrackMask(vRest, 0.05 + death * 0.2);
            vec3 hue = bsHue(vRest.y * 0.08 + atan(vRest.x, vRest.z) * 0.3 + uTime * 0.1);
            bsEmit += mix(vec3(1.0, 0.95, 0.85), hue, 0.6) * cr * death * 9.0;
            diffuseColor.rgb = mix(diffuseColor.rgb, hue, cr * death);
          }
        }`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRough;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += bsEmit;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `
        {
          vec3 bsV = normalize( vViewPosition );
          vec3 bsN = normalize( normal );
          float ndv = clamp( dot( bsN, bsV ), 0.0, 1.0 );
          float fres = pow( 1.0 - ndv, 3.0 );
          vec3 Rw = ( vec4( reflect( -bsV, bsN ), 0.0 ) * viewMatrix ).xyz;
          vec3 env = mix( uGroundColor * 0.55, uSkyColor * 1.05, smoothstep( -0.25, 0.35, Rw.y ) );
          float gloss = 1.0 - roughnessFactor;
          outgoingLight += env * ( 0.015 + 0.22 * fres ) * gloss * gloss * ( 1.0 + uP4.z * 2.0 );
          vec3 sunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
          float sunSide = clamp( dot( bsN, sunV ) * 0.7 + 0.45, 0.0, 1.0 );
          outgoingLight += ( uSunColor * 0.5 * sunSide + uSkyColor * 0.25 ) * fres * ( 0.4 + 0.6 * bsPaper + uP4.w );
          if ( bsInk > 0.5 ) {
            // the island's stolen colour, trapped in the ink, glimmering at grazing angles
            float n1 = wbNoise3( vRest * 0.45 + vec3( 0.0, uTime * 0.2, uP4.x * 7.0 ) );
            float n2 = wbNoise3( vRest * 0.8 - vec3( uTime * 0.15, 0.0, 0.0 ) );
            vec3 hue = bsHue( n1 * 1.6 + n2 * 0.5 + uTime * 0.02 );
            float veins = smoothstep( 0.45, 0.75, n2 );
            outgoingLight += hue * veins * ( fres * 0.55 + 0.04 ) * ( 0.7 + uP2.w );
            // wet sheen just above the ink line
            float wet = 1.0 - smoothstep( 0.0, 1.6, vBsWorld.y - uPool.z );
            outgoingLight += env * wet * 0.25;
          }
          if ( bsCrys > -0.5 ) outgoingLight += bsPaint( int( bsCrys + 0.5 ) ) * fres * 1.2;
          outgoingLight = mix( outgoingLight, vec3( 1.5, 1.45, 1.4 ), clamp( uP0.x, 0.0, 1.0 ) * ( bsCrys > -0.5 ? 0.25 : 0.5 ) * ( 0.35 + 0.65 * fres + bsPaper * 0.3 ) );
        }
        #include <opaque_fragment>`,
      );
  };
  body.customProgramCacheKey = () => 'wb-greymaw-body-v1';
  const depth = new MeshDepthMaterial({
    depthPacking: RGBADepthPacking,
  });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uni);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
` + GREYMAW_SKIN_VERTEX,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed; vec3 bsSkN; bsSkin(transformed, bsSkN);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec4 uPool;
varying vec3 vBsWorld;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
if ( vBsWorld.y < uPool.z && length( vBsWorld.xz - uPool.xy ) < uPool.w ) discard;`,
      );
  };
  depth.customProgramCacheKey = () => 'wb-greymaw-depth-v1';
  const outline = new MeshBasicMaterial({
    color: 0x15131a,
    side: BackSide,
  });
  outline.name = 'greymaw-outline';
  outline.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uni);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
` + GREYMAW_SKIN_VERTEX,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed; vec3 bsSkN; bsSkin(transformed, bsSkN);
        float bsOw = 0.045 * (1.0 + uP0.x * 1.5) * (abs(aSkin.w - 3.0) < 0.5 || abs(aSkin.w - 5.0) < 0.5 ? 0.35 : 1.0) * (aSkin.w > 9.5 ? 0.4 : 1.0);
        vec4 bsMv = viewMatrix * vec4(transformed, 1.0);
        bsOw *= clamp(-bsMv.z / 14.0, 1.0, 4.0);
        transformed += bsSkN * bsOw;
        vBsWorld = transformed;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec4 uPool;
uniform vec4 uP0;
uniform vec4 uP4;
varying vec3 vBsWorld;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if ( uP4.y < 0.98 ) discard;
        if ( vBsWorld.y < uPool.z + 0.05 && length( vBsWorld.xz - uPool.xy ) < uPool.w ) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.5), clamp(uP0.x, 0.0, 1.0) * 0.5);`,
      );
  };
  outline.customProgramCacheKey = () => 'wb-greymaw-outline-v1';
  return {
    body,
    depth,
    outline,
  };
}
