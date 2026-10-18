/**
 * The Chroma Brush model: the shared rainbow palette uniform and GLSL, toon-lit shaders for its iridescent pearl handle, gold fittings, rainbow gem and streaked twinkling bristles, lathe-built parts and a dark outline shell, shown in the hero's hand.
 */
import {
  BackSide,
  Color,
  DoubleSide,
  Euler,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  OctahedronGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, PALETTE } from '../core/config.js';
import { FADE_DISCARD_GLSL, FADE_DITHER_GLSL, heroFade } from './toon-material.js';
export function rainbowUniform() {
  return {
    value: COLORS.map((color) => new Color(PALETTE[color].hex)),
  };
}
export const RAINBOW_GLSL = `
uniform vec3 uRb[4];
vec3 wbRb(float k) {
  k = mod(k, 4.0);
  float i = floor(k);
  float f = smoothstep(0.2, 0.8, k - i);
  int a = int(i);
  int b = int(mod(i + 1.0, 4.0));
  vec3 ca = a == 0 ? uRb[0] : a == 1 ? uRb[1] : a == 2 ? uRb[2] : uRb[3];
  vec3 cb = b == 0 ? uRb[0] : b == 1 ? uRb[1] : b == 2 ? uRb[2] : uRb[3];
  return mix(ca, cb, f);
}
`;
const CHROMA_TOON_GLSL = `
vec3 wbToon(vec3 albedo, vec3 N) {
  vec3 L = normalize(uSunDir);
  float ndl = dot(N, L);
  float band = smoothstep(-0.04, 0.2, ndl);
  float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  float direct = mix(band, wrap * band, 0.25);
  vec3 amb = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5);
  return albedo * (uSunColor * 0.95 * direct + amb * 0.62);
}
`;
const CHROMA_VERTEX = `
  #include <wb_common>
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const CHROMA_FRAGMENT_HEADER = `
  #include <wb_common>
  ${FADE_DITHER_GLSL}
  ${RAINBOW_GLSL}
  ${CHROMA_TOON_GLSL}
  uniform float uGlow;
  uniform float uFlash;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vLocal;
`;
const CHROMA_FRAGMENT_OUTPUT = `
  col = mix(col, vec3(1.6, 1.55, 1.45), uFlash);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
const CHROMA_HANDLE_FRAGMENT = `${CHROMA_FRAGMENT_HEADER}
void main() {
  ${FADE_DISCARD_GLSL}
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 1.0 - abs(dot(N, V));
  float h = fres * 1.3 + vLocal.y * 1.4 + uTime * 0.06;
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (h + vec3(0.0, 0.33, 0.67)));
  vec3 pearl = vec3(0.86, 0.82, 0.95);
  vec3 albedo = mix(pearl, irid, 0.42 + 0.3 * fres);
  vec3 col = wbToon(albedo, N);
  col += irid * pow(fres, 2.0) * 0.55 * (uSunColor * 0.6 + uSkyColor * 0.5);
  float spec = pow(max(dot(reflect(-V, N), normalize(uSunDir)), 0.0), 60.0);
  col += uSunColor * spec * 0.8;
  ${CHROMA_FRAGMENT_OUTPUT}
}`;
const CHROMA_GOLD_FRAGMENT = `${CHROMA_FRAGMENT_HEADER}
void main() {
  ${FADE_DISCARD_GLSL}
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 R = reflect(-V, N);
  vec3 gold = vec3(1.0, 0.64, 0.2);
  float env = smoothstep(-0.35, 0.85, R.y);
  vec3 envC = mix(uGroundColor * 1.2, uSkyColor * 1.5 + vec3(0.25), env);
  vec3 col = gold * (wbToon(vec3(0.55), N) + envC * 0.55);
  float glint = pow(max(dot(R, normalize(uSunDir)), 0.0), 34.0);
  col += mix(gold, vec3(1.0), 0.4) * uSunColor * glint * 1.6;
  col += gold * uGlow * 0.25;
  ${CHROMA_FRAGMENT_OUTPUT}
}`;
const CHROMA_GEM_FRAGMENT = `${CHROMA_FRAGMENT_HEADER}
void main() {
  ${FADE_DISCARD_GLSL}
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 1.0 - abs(dot(N, V));
  vec3 c = wbRb(dot(N, vec3(2.1, 1.3, 1.7)) * 2.0 + uTime * 0.8);
  vec3 col = c * (0.9 + 0.8 * fres) + vec3(1.0) * pow(fres, 3.0) * 0.8 + c * uGlow;
  ${CHROMA_FRAGMENT_OUTPUT}
}`;
const CHROMA_BRISTLES_FRAGMENT = `${CHROMA_FRAGMENT_HEADER}
void main() {
  ${FADE_DISCARD_GLSL}
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 1.0 - abs(dot(N, V));
  float ang = atan(vLocal.x, vLocal.z);
  float streak = wbNoise2(vec2(ang * 5.0, vLocal.y * 34.0));
  float band = (vLocal.y - 1.03) * 11.0 + ang * 0.6366 - uTime * 1.25 + streak * 0.35;
  vec3 c = wbRb(band);
  vec3 col = wbToon(c * (0.82 + 0.3 * streak), N) + c * (0.3 + 0.7 * uGlow);
  col += c * pow(fres, 2.0) * 0.6;
  // pale luminous tip
  float tip = smoothstep(1.2, 1.335, vLocal.y);
  col = mix(col, vec3(1.35, 1.3, 1.2) + c * 0.3, tip * 0.55);
  // twinkles
  vec3 cell = floor(vLocal * vec3(70.0, 48.0, 70.0));
  float tw = wbHash13(cell + floor(uTime * 4.0) * 17.0);
  float sp = step(0.955, tw) * (0.5 + 0.5 * sin(uTime * 26.0 + tw * 40.0));
  col += vec3(1.4, 1.35, 1.2) * sp * 1.4;
  ${CHROMA_FRAGMENT_OUTPUT}
}`;
const CHROMA_OUTLINE_VERTEX = `
  #include <wb_common>
  uniform float uOutline;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);
    wp.xyz += n * uOutline;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const CHROMA_OUTLINE_FRAGMENT = `
  #include <wb_common>
  ${FADE_DITHER_GLSL}
  uniform vec3 uColor;
  void main() {
    ${FADE_DISCARD_GLSL}
    gl_FragColor = vec4(uColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
function brushLathe(profile, segments, warp) {
  const points = profile.map(([x, y]) => new Vector2(x, y));
  const geometry = new LatheGeometry(points, segments);
  geometry.deleteAttribute('uv');
  if (warp) {
    const position = geometry.attributes.position;
    for (let j = 0; j < position.count; j++) {
      const x = position.getX(j);
      const y = position.getY(j);
      const z = position.getZ(j);
      const [nx, ny, nz] = warp(x, y, z, Math.atan2(x, z));
      position.setXYZ(j, nx, ny, nz);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}
function placePart(geo, matrix) {
  geo.deleteAttribute('uv');
  if (matrix) geo.applyMatrix4(matrix);
  return geo;
}
const brushTRS = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'YXZ')),
    new Vector3(sx, sy, sz),
  );
const bristleCurve = (y) => 0.05 * Math.max(0, (y - 1.08) / 0.255) ** 2;
export class ChromaBrush {
  group = new Group();
  uniforms;
  outlineW;
  shown = false;
  constructor(ctx, outlineWidth) {
    this.group.name = 'chroma-brush';
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
    this.outlineW = {
      value: 0.01,
    };
    this.uniforms = {
      uGlow: {
        value: 0,
      },
      uFlash: {
        value: 0,
      },
      uRb: rainbowUniform(),
    };
    const uniforms = {
      ...ctx.globals,
      ...this.uniforms,
      uWbFade: heroFade,
    };
    const makeMat = (fragmentShader) =>
      new ShaderMaterial({
        uniforms,
        vertexShader: CHROMA_VERTEX,
        fragmentShader,
        side: DoubleSide,
      });
    const handleMat = makeMat(CHROMA_HANDLE_FRAGMENT);
    const goldMat = makeMat(CHROMA_GOLD_FRAGMENT);
    const gemMat = makeMat(CHROMA_GEM_FRAGMENT);
    const bristleMat = makeMat(CHROMA_BRISTLES_FRAGMENT);
    handleMat.name = 'chroma-handle';
    goldMat.name = 'chroma-gold';
    bristleMat.name = 'chroma-bristles';
    const handleGeo = brushLathe(
      [
        [0, 0.02],
        [0.019, 0.022],
        [0.02, 0.1],
        [0.0215, 0.45],
        [0.0195, 0.66],
        [0.022, 0.86],
        [0.021, 0.93],
        [0, 0.935],
      ],
      14,
      (x, y, z, ang) => {
        const ridge = 1 + 0.09 * Math.sin(ang * 3 + y * 38);
        return [x * ridge, y, z * ridge];
      },
    );
    const goldParts = [];
    goldParts.push(placePart(new SphereGeometry(0.034, 14, 10), brushTRS(0, 0.005, 0)));
    goldParts.push(placePart(new TorusGeometry(0.029, 0.007, 8, 20), brushTRS(0, 0.045, 0, Math.PI / 2)));
    for (let i = 0; i < 4; i++)
      goldParts.push(
        placePart(
          new TorusGeometry(0.0235, 0.0042, 6, 18),
          brushTRS(0, 0.09 + i * 0.06, 0, Math.PI / 2 + 0.22, i * 0.8),
        ),
      );
    goldParts.push(placePart(new TorusGeometry(0.026, 0.006, 8, 20), brushTRS(0, 0.33, 0, Math.PI / 2)));
    goldParts.push(placePart(new TorusGeometry(0.025, 0.005, 8, 20), brushTRS(0, 0.62, 0, Math.PI / 2)));
    goldParts.push(
      brushLathe(
        [
          [0.021, 0.885],
          [0.029, 0.892],
          [0.03, 0.918],
          [0.026, 0.925],
          [0.026, 0.95],
          [0.034, 0.958],
          [0.043, 0.985],
          [0.044, 1.02],
          [0.038, 1.04],
          [0.03, 1.046],
        ],
        18,
      ),
    );
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const prongGeo = new SphereGeometry(1, 10, 8);
      const matrix = new Matrix4()
        .makeRotationY(ang)
        .multiply(brushTRS(0, 0.985, 0.045, -0.75, 0, 0, 0.012, 0.055, 0.01));
      goldParts.push(placePart(prongGeo, matrix));
      const beadGeo = new SphereGeometry(0.009, 8, 6);
      goldParts.push(placePart(beadGeo, new Matrix4().makeRotationY(ang).multiply(brushTRS(0, 1.025, 0.083))));
    }
    const goldGeo = mergeGeometries(goldParts, false) ?? goldParts[0];
    const gemGeo = placePart(new OctahedronGeometry(0.026, 0), brushTRS(0, -0.028, 0, 0, 0, 0, 1, 1.5, 1));
    const bristleGeo = brushLathe(
      [
        [0.034, 1.03],
        [0.058, 1.058],
        [0.073, 1.1],
        [0.077, 1.15],
        [0.069, 1.2],
        [0.053, 1.25],
        [0.034, 1.29],
        [0.016, 1.318],
        [0, 1.338],
      ],
      22,
      (x, y, z, ang) => {
        const tuft =
          1 + (y > 1.04 && y < 1.33 ? 0.08 * Math.sin(ang * 7 + y * 9) + 0.04 * Math.sin(ang * 13 - y * 20) : 0);
        return [x * tuft, y, z * tuft * 0.94 + bristleCurve(y)];
      },
    );
    const parts = [
      [handleGeo, handleMat, 1],
      [goldGeo, goldMat, 0.8],
      [gemGeo, gemMat, 0.6],
      [bristleGeo, bristleMat, 1],
    ];
    const outlineMat = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
        uOutline: this.outlineW,
        uColor: {
          value: new Color(0x1d1424),
        },
        uWbFade: heroFade,
      },
      vertexShader: CHROMA_OUTLINE_VERTEX,
      fragmentShader: CHROMA_OUTLINE_FRAGMENT,
      side: BackSide,
    });
    for (const [geo, mat, outline] of parts) {
      const mesh = new Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      if (outline > 0) {
        const outlineMesh = new Mesh(geo, outlineMat);
        outlineMesh.frustumCulled = false;
        outlineMesh.scale.setScalar(1);
        this.group.add(outlineMesh);
      }
    }
  }
  update(matrix, shown, glow, flash, outlineWidth) {
    if (shown !== this.shown) {
      this.shown = shown;
      this.group.visible = shown;
    }
    if (shown) {
      this.group.matrix.copy(matrix);
      this.group.matrixWorld.copy(matrix);
      for (const child of this.group.children) child.updateMatrixWorld(true);
      this.uniforms.uGlow.value = glow;
      this.uniforms.uFlash.value = flash;
      this.outlineW.value = Math.max(0.004, outlineWidth * 0.8);
    }
  }
}
