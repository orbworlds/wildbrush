/**
 * Treasure chests for the sky islands and caverns: five chest styles merged into one mesh whose lids hinge open in the vertex shader. Handles the open prompt, the opening cinematic with light rays and bursts, loot, locks and the storm seal over the grand chest.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Quaternion,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { COLLISION_GROUPS, COLORS, PALETTE } from '../core/config.js';
import { clamp, smoothstep } from '../core/math.js';
import { ParticleMode } from './particles.js';
import { mergeGeometries } from './util.js';
const MAX_CHESTS = 8;
const TAU = Math.PI * 2;
const MAT_WOOD = 0;
const MAT_METAL = 1;
const MAT_GLOW = 2;
const MAT_SEAM = 3;
const MAT_VELVET = 4;
const CHEST_STYLES = {
  small: {
    W: 1.25,
    D: 0.82,
    H: 0.62,
    wood: 0x9a6a42,
    woodDark: 0x6c4830,
    metal: 0xb8bcc4,
    metalDark: 0x80858f,
    gems: [0x9fe0ff],
  },
  vessel: {
    W: 1.55,
    D: 1,
    H: 0.8,
    wood: 0x7fa6d6,
    woodDark: 0x5a7fb2,
    metal: 0xf0cf72,
    metalDark: 0xc49a3a,
    gems: [0xbfeaff, 0xffffff, 0xbfeaff],
  },
  grand: {
    W: 2.3,
    D: 1.45,
    H: 1.05,
    wood: 0x3d56b0,
    woodDark: 0x2c3f88,
    metal: 0xf2cf6a,
    metalDark: 0xc39838,
    gems: [PALETTE.red.hex, PALETTE.blue.hex, PALETTE.yellow.hex, PALETTE.green.hex],
  },
  heart: {
    W: 1.7,
    D: 1.1,
    H: 0.86,
    wood: 0xc2455c,
    woodDark: 0x92304a,
    metal: 0xe8eef6,
    metalDark: 0xa9b3c4,
    gems: [0xffc2d0, 0xff5b7a, 0xffc2d0],
  },
  cloud: {
    W: 2.2,
    D: 1.4,
    H: 1,
    wood: 0xf1ede4,
    woodDark: 0xd9d2c4,
    metal: 0xf4d270,
    metalDark: 0xc79a3a,
    gems: [PALETTE.red.hex, PALETTE.blue.hex, PALETTE.yellow.hex, PALETTE.green.hex],
  },
};
function roundedBox(w2, h, d2, radius) {
  const geometry = new BoxGeometry(w2, h, d2, 5, 3, 3);
  const position = geometry.getAttribute('position');
  const p = new Vector3();
  const hx = w2 / 2 - radius;
  const hy = h / 2 - radius;
  const hz = d2 / 2 - radius;
  const core = new Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    core.set(clamp(p.x, -hx, hx), clamp(p.y, -hy, hy), clamp(p.z, -hz, hz));
    const offset = p.clone().sub(core);
    if (offset.lengthSq() > 1e-8) offset.normalize().multiplyScalar(radius);
    p.copy(core).add(offset);
    position.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}
const trs = (x, y, z, rx = 0, ry = 0, rz = 0, scale = 1) =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'YXZ')),
    new Vector3(scale, scale, scale),
  );
function part(geometry, hex, mat, lid, matrix) {
  if (matrix) geometry.applyMatrix4(matrix);
  if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const count = geo.getAttribute('position').count;
  const color = new Color(hex);
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) data.set([color.r, color.g, color.b], i * 3);
  geo.setAttribute('color', new BufferAttribute(data, 3));
  geo.setAttribute('aGlow', new BufferAttribute(new Float32Array(count).fill(mat), 1));
  geo.setAttribute('aLid', new BufferAttribute(new Float32Array(count).fill(lid), 1));
  return geo;
}
function gemGeometry(size) {
  const geometry = new OctahedronGeometry(size, 0);
  geometry.scale(1, 1.25, 0.45);
  return geometry;
}
function chestParts(kind) {
  const style = CHEST_STYLES[kind];
  const { W: w, D: d2, H: h2 } = style;
  const lidR = d2 / 2;
  const parts = [];
  const rimH = (w / 2.1) * 0.12;
  parts.push(part(roundedBox(w, h2, d2, 0.06), style.wood, MAT_WOOD, 0, trs(0, h2 / 2 + 0.08, 0)));
  parts.push(part(new BoxGeometry(w - 0.2, 0.04, d2 - 0.2), 2759184, MAT_VELVET, 0, trs(0, h2 + 0.06, 0)));
  parts.push(part(roundedBox(w + 0.07, rimH, d2 + 0.07, 0.03), style.metal, MAT_METAL, 0, trs(0, h2 + 0.05, 0)));
  parts.push(part(roundedBox(w + 0.09, rimH * 1.1, d2 + 0.09, 0.03), style.metalDark, MAT_METAL, 0, trs(0, 0.12, 0)));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      parts.push(
        part(
          roundedBox(0.13, h2 + 0.06, 0.13, 0.03),
          style.metal,
          MAT_METAL,
          0,
          trs((w / 2) * sx, h2 / 2 + 0.08, (d2 / 2) * sz),
        ),
      );
      if (kind !== 'small')
        parts.push(
          part(
            new SphereGeometry((w / 2) * 0.1, 8, 6),
            style.metalDark,
            MAT_METAL,
            0,
            trs(sx * (w / 2 - 0.1), 0.07, sz * (d2 / 2 - 0.08)),
          ),
        );
    }
  for (const fx of [-0.28, 0.28])
    parts.push(part(new BoxGeometry(0.1, h2, d2 + 0.05), style.metalDark, MAT_METAL, 0, trs(fx * w, h2 / 2 + 0.08, 0)));
  parts.push(
    part(
      roundedBox((w / 1.6) * 0.34, (h2 / 0.8) * 0.4, 0.07, 0.025),
      style.metal,
      MAT_METAL,
      0,
      trs(0, h2 - 0.1, d2 / 2 + 0.03),
    ),
  );
  parts.push(
    part(
      new CylinderGeometry(0.04, 0.04, 0.04, 8),
      16773312,
      MAT_SEAM,
      0,
      trs(0, h2 - 0.08, d2 / 2 + 0.07, Math.PI / 2),
    ),
  );
  style.gems.forEach((gem, index) => {
    const len = style.gems.length;
    const x = len === 1 ? -w * 0.32 : (index / (len - 1) - 0.5) * w * 0.72;
    if (!(Math.abs(x) < 0.25))
      parts.push(part(gemGeometry(0.08 + (w / 2) * 0.02), gem, MAT_GLOW, 0, trs(x, h2 * 0.55, d2 / 2 + 0.04)));
  });
  parts.push(part(new BoxGeometry(w + 0.01, 0.025, d2 + 0.01), 16769696, MAT_SEAM, 0, trs(0, h2 + 0.105, 0)));
  const hingeY = h2 + 0.1;
  const hingeZ = -d2 / 2;
  const geometry = new CylinderGeometry(lidR, lidR, w, 20, 1, false, 0, Math.PI);
  parts.push(part(geometry, style.woodDark, MAT_WOOD, 1, trs(0, hingeY, hingeZ + d2 / 2, 0, 0, Math.PI / 2)));
  parts.push(
    part(new BoxGeometry(w - 0.05, 0.04, d2 - 0.05), 2759184, MAT_VELVET, 1, trs(0, hingeY + 0.02, hingeZ + d2 / 2)),
  );
  const bands = kind === 'small' ? [-0.8, 0.8] : [-0.95, -0.5, 0, 0.5, 0.95];
  for (const fx of bands) {
    const geometry = new TorusGeometry(lidR + 0.02, fx === 0 ? 0.05 : 0.038, 5, 18, Math.PI);
    parts.push(
      part(
        geometry,
        fx === 0 ? style.metal : style.metalDark,
        MAT_METAL,
        1,
        trs((w / 2) * fx, hingeY, hingeZ + d2 / 2, 0, Math.PI / 2, 0),
      ),
    );
  }
  if (kind === 'grand') {
    parts.push(
      part(
        new SphereGeometry(0.16, 12, 9),
        16773572,
        MAT_GLOW,
        1,
        trs(0, hingeY + lidR * 0.72, hingeZ + d2 / 2 + lidR * 0.7),
      ),
    );
    COLORS.forEach((color, i) => {
      const x = (i - 1.5) * 0.46;
      parts.push(
        part(
          gemGeometry(0.09),
          PALETTE[color].hex,
          MAT_GLOW,
          1,
          trs(x, hingeY + lidR + 0.02, hingeZ + d2 / 2, -Math.PI / 2),
        ),
      );
    });
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const geometry = new ConeGeometry(0.07, 0.55 - i * 0.1, 4);
        parts.push(
          part(
            geometry,
            style.metal,
            MAT_METAL,
            1,
            trs(
              side * (0.25 + i * 0.16),
              hingeY + lidR * 0.82,
              hingeZ + d2 / 2 + lidR * 0.5,
              1.2,
              0,
              side * (0.9 + i * 0.25),
            ),
          ),
        );
      }
  } else if (kind === 'vessel') {
    const geometry = new TorusGeometry(0.16, 0.03, 5, 16, Math.PI * 1.5);
    parts.push(
      part(geometry, 15398655, MAT_GLOW, 1, trs(0, hingeY + lidR * 0.7, hingeZ + d2 / 2 + lidR * 0.72, -0.8, 0, 0)),
    );
  } else if (kind === 'heart') {
    const shape = new Shape();
    shape.moveTo(0, -0.16);
    shape.bezierCurveTo(-0.2, -0.02, -0.2, 0.16, -0.08, 0.16);
    shape.bezierCurveTo(-0.02, 0.16, 0, 0.1, 0, 0.07);
    shape.bezierCurveTo(0, 0.1, 0.02, 0.16, 0.08, 0.16);
    shape.bezierCurveTo(0.2, 0.16, 0.2, -0.02, 0, -0.16);
    const geometry = new ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
      curveSegments: 8,
    });
    geometry.translate(0, 0, -0.03);
    parts.push(
      part(
        geometry,
        16732014,
        MAT_GLOW,
        1,
        trs(0, hingeY + lidR * 0.66, hingeZ + d2 / 2 + lidR * 0.76, -0.75, 0, 0, 1.25),
      ),
    );
    for (const side of [-1, 1])
      parts.push(
        part(
          gemGeometry(0.07),
          16766944,
          MAT_GLOW,
          1,
          trs(side * 0.42, hingeY + lidR * 0.82, hingeZ + d2 / 2 + lidR * 0.5, -1),
        ),
      );
  } else if (kind === 'cloud') {
    for (let i = 0; i < 7; i++) {
      const x = (i / 6 - 0.5) * w * 0.9;
      const puffR = 0.13 + 0.05 * Math.sin(i * 2.1 + 1);
      parts.push(
        part(
          new SphereGeometry(puffR, 10, 8),
          16775406,
          MAT_GLOW,
          1,
          trs(x, hingeY + lidR * 0.96, hingeZ + d2 / 2 - 0.05 + (i % 2) * 0.12),
        ),
      );
    }
    parts.push(
      part(
        new OctahedronGeometry(0.2, 0),
        16643839,
        MAT_GLOW,
        1,
        trs(0, hingeY + lidR * 0.72, hingeZ + d2 / 2 + lidR * 0.74, -0.8, 0, 0),
      ),
    );
    COLORS.forEach((color, i) => {
      const angle = (i / 4) * TAU + Math.PI / 4;
      parts.push(
        part(
          gemGeometry(0.07),
          PALETTE[color].hex,
          MAT_GLOW,
          1,
          trs(
            Math.cos(angle) * 0.3,
            hingeY + lidR * 0.72 + Math.sin(angle) * 0.3 * 0.7,
            hingeZ + d2 / 2 + lidR * 0.7,
            -0.8,
          ),
        ),
      );
    });
    for (const side of [-1, 1])
      for (let j = 0; j < 4; j++) {
        const geometry = new ConeGeometry(0.06, 0.62 - j * 0.1, 4);
        parts.push(
          part(
            geometry,
            j % 2 ? 16777215 : style.metal,
            MAT_METAL,
            0,
            trs(side * (w / 2 + 0.05), h2 * 0.6 + j * 0.05, -0.1 + j * 0.14, 0.4, 0, side * (1.2 + j * 0.22)),
          ),
        );
      }
  }
  return parts;
}
const CHEST_COMMON_VERTEX = `
#include <wb_common>
attribute float aGlow;
attribute float aLid;
attribute float aChest;
attribute vec4 aHinge; // xyz hinge (world), w yaw
uniform float uLid[${MAX_CHESTS}];
uniform float uOpen[${MAX_CHESTS}];
uniform float uSeam[${MAX_CHESTS}];
varying float vGlow;
varying vec3 vCp;
varying float vOpen;
varying float vSeam;
vec3 chRot(vec3 v, vec3 ax, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c);
}
`;
const CHEST_NORMAL_VERTEX = `
int chI = int(aChest + 0.5);
float chLid = 0.0;
float chOpen = 0.0;
float chSeam = 0.0;
for (int i = 0; i < ${MAX_CHESTS}; i++) { if (i == chI) { chLid = uLid[i]; chOpen = uOpen[i]; chSeam = uSeam[i]; } }
vec3 chAx = vec3(cos(aHinge.w), 0.0, -sin(aHinge.w));
if (aLid > 0.5) objectNormal = chRot(objectNormal, chAx, -chLid);
`;
const CHEST_BEGIN_VERTEX = `
if (aLid > 0.5) transformed = aHinge.xyz + chRot(transformed - aHinge.xyz, chAx, -chLid);
vGlow = aGlow;
vOpen = chOpen;
vSeam = chSeam;
vCp = chRot(position - aHinge.xyz, vec3(0.0, 1.0, 0.0), -aHinge.w);
`;
const CHEST_COMMON_FRAGMENT = `
#include <wb_common>
varying float vGlow;
varying vec3 vCp;
varying float vOpen;
varying float vSeam;
`;
const CHEST_COLOR_FRAGMENT = `
float chMetal = 0.0;
vec3 chEmit = vec3(0.0);
{
  float g = vGlow;
  if (g < 0.5) {
    float plank = abs(fract(vCp.y * 3.4 + vCp.x * 0.02) - 0.5);
    float grain = wbNoise3(vec3(vCp.x * 26.0, vCp.y * 2.5, vCp.z * 26.0));
    diffuseColor.rgb *= 0.8 + 0.26 * grain;
    diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.05, 0.5 - plank)) * 0.35;
  } else if (g < 1.5) {
    chMetal = 1.0;
    diffuseColor.rgb *= 0.85 + 0.3 * wbNoise3(vCp * 14.0);
  } else if (g < 2.5) {
    chEmit += diffuseColor.rgb * (0.9 + 0.5 * sin(uTime * 2.3 + vCp.x * 4.0)) * (0.55 + vOpen * 1.2);
  } else if (g < 3.5) {
    chEmit += vec3(1.0, 0.8, 0.4) * (vSeam * (1.1 + 0.4 * sin(uTime * 3.0)) + vOpen * 3.0);
  } else {
    // velvet-lined interior, warmly lit by the treasure's glow
    float plank = smoothstep(0.0, 0.06, abs(fract(vCp.x * 2.6) - 0.5) - 0.44);
    float soft = wbNoise3(vCp * 4.0);
    diffuseColor.rgb = mix(vec3(0.22, 0.08, 0.12), vec3(0.34, 0.14, 0.18), soft) * (1.0 - plank * 0.4);
    chEmit += vec3(1.0, 0.7, 0.4) * vOpen * (0.18 + 0.1 * soft);
  }
}
`;
const RAYS_VERTEX = `
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const RAYS_FRAGMENT = `
#include <wb_common>
uniform float uRays;
uniform vec3 uRayColor;
varying vec2 vUv;
varying float vSeed;
void main() {
  float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float along = (1.0 - vUv.y) * smoothstep(0.0, 0.08, vUv.y);
  float flick = 0.7 + 0.3 * sin(uTime * (3.0 + vSeed * 5.0) + vSeed * 30.0);
  float a = across * across * along * flick * uRays;
  gl_FragColor = vec4(uRayColor * a * 1.4, a);
}
`;
const SEAL_VERTEX = `
#include <wb_common>
attribute float aKind;
attribute vec2 aUv;
uniform float uSeal;
varying vec2 vUv;
varying float vKind;
varying vec3 vW;
varying vec3 vN;
void main() {
  vUv = aUv;
  vKind = aKind;
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const SEAL_FRAGMENT = `
#include <wb_common>
uniform float uSeal;
uniform float uBreak;
varying vec2 vUv;
varying float vKind;
varying vec3 vW;
varying vec3 vN;
void main() {
  vec3 V = normalize(uCameraPos - vW);
  vec3 N = normalize(vN);
  float t = uTime;
  vec3 storm = vec3(0.62, 0.52, 1.0);
  vec3 gold = vec3(1.0, 0.82, 0.45);
  vec3 c;
  float a;
  if (vKind < 0.5) {
    float fr = pow(1.0 - abs(dot(N, V)), 2.2);
    // painterly brush-stroke lattice sweeping over the dome
    float s1 = wbNoise2(vec2(vUv.x * 18.0 + t * 0.3, vUv.y * 9.0 - t * 0.6));
    float s2 = wbNoise2(vec2(vUv.x * 42.0 - t * 0.5, vUv.y * 22.0 + t * 0.4));
    float strokes = smoothstep(0.55, 0.75, s1 * 0.7 + s2 * 0.3);
    float band = 1.0 - smoothstep(0.0, 0.04, abs(fract(vUv.y * 6.0 - t * 0.35) - 0.5) - 0.44);
    float glow = fr * 0.85 + strokes * 0.4 + band * 0.25;
    float n = wbNoise2(vUv * vec2(13.0, 7.0) + 3.0);
    float vis = smoothstep(n - 0.06, n + 0.06, uSeal * 1.1);
    a = (0.08 + glow * 0.55) * vis * (0.8 + 0.2 * sin(t * 2.1));
    c = mix(storm, gold, strokes * 0.6 + band * 0.3) * (1.0 + uBreak * 2.0) + vec3(0.25, 0.2, 0.45) * fr;
  } else {
    // glowing chain links (vUv.y = metres along the chain)
    float link = abs(fract(vUv.y * 2.2) - 0.5) * 2.0;
    float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float lit = smoothstep(0.1, 0.9, link) * 0.7 + 0.3;
    float gap = smoothstep(0.08, 0.2, link);
    a = (0.55 + 0.45 * lit) * gap * smoothstep(0.0, 0.35, uSeal);
    c = mix(storm * 0.85, gold, smoothstep(0.4, 1.0, link) * 0.7) * (1.0 + 0.25 * sin(t * 3.0 + vUv.y * 2.0) + uBreak * 2.0);
  }
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
}
`;
const _fwd = new Vector3();
const _side = new Vector3();
export class SkyChests {
  ctx;
  opts;
  group = new Group();
  chests = [];
  mesh;
  uni = {
    uLid: {
      value: Array(MAX_CHESTS).fill(0),
    },
    uOpen: {
      value: Array(MAX_CHESTS).fill(0),
    },
    uSeam: {
      value: Array(MAX_CHESTS).fill(0.3),
    },
  };
  rays;
  rayUni;
  seal = null;
  barrier = null;
  sealUni = {
    uSeal: {
      value: 1,
    },
    uBreak: {
      value: 0,
    },
  };
  sealed;
  unsealT = -1;
  mode = 'idle';
  active = null;
  t = 0;
  fired = new Set();
  itemGiven = false;
  itemWait = 0;
  promptOn = null;
  shot = {
    position: new Vector3(),
    target: new Vector3(),
    blend: 0.7,
  };
  shotOn = false;
  controlLocked = false;
  constructor(ctx, defs, opts) {
    this.ctx = ctx;
    this.opts = opts;
    this.sealed = opts.sealed;
    this.group.name = 'sky-chests';
    const parts = [];
    defs.slice(0, MAX_CHESTS).forEach((def, i) => {
      const style = CHEST_STYLES[def.kind];
      const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), def.facing);
      const matrix = new Matrix4().compose(def.pos, quat, new Vector3(1, 1, 1));
      const hinge = new Vector3(0, style.H + 0.1, -style.D / 2).applyQuaternion(quat).add(def.pos);
      for (const geo of chestParts(def.kind)) {
        geo.applyMatrix4(matrix);
        const count = geo.getAttribute('position').count;
        geo.setAttribute('aChest', new BufferAttribute(new Float32Array(count).fill(i), 1));
        const hinges = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) hinges.set([hinge.x, hinge.y, hinge.z, def.facing], i * 4);
        geo.setAttribute('aHinge', new BufferAttribute(hinges, 4));
        parts.push(geo);
      }
      const chest = {
        def,
        index: i,
        style,
        lid: 0,
        open: 0,
        seam: def.kind === 'grand' || def.lock ? 0.1 : 0.35,
        opened: false,
        collider: null,
        locked: !!def.lock,
      };
      this.chests.push(chest);
      try {
        const desc = ctx.RAPIER.ColliderDesc.cuboid(style.W / 2 + 0.04, (style.H + 0.4) / 2, style.D / 2 + 0.04)
          .setTranslation(def.pos.x, def.pos.y + (style.H + 0.4) / 2, def.pos.z)
          .setRotation({
            x: quat.x,
            y: quat.y,
            z: quat.z,
            w: quat.w,
          })
          .setCollisionGroups(COLLISION_GROUPS.static);
        chest.collider = ctx.physics.createCollider(desc);
        ctx.colliders.register(chest.collider, {
          kind: 'structure',
          surface: 'wood',
          object: this.group,
          data: {
            chest: true,
            sky: def.id,
          },
        });
      } catch (err) {
        console.warn('[sky] chest collider failed', err);
      }
    });
    const merged = mergeGeometries(parts);
    parts.forEach((geo) => geo.dispose());
    const globals = ctx.globals;
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      metalness: 0,
    });
    material.name = 'sky-chest';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, globals, this.uni);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${CHEST_COMMON_VERTEX}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${CHEST_NORMAL_VERTEX}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${CHEST_BEGIN_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${CHEST_COMMON_FRAGMENT}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${CHEST_COLOR_FRAGMENT}`)
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
metalnessFactor = chMetal * 0.85;`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.3, chMetal);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
totalEmissiveRadiance += chEmit;`,
        )
        .replace(
          '#include <opaque_fragment>',
          `{ vec3 chV = normalize(vViewPosition); vec3 chN = normalize(normal);
             float fr = pow(1.0 - clamp(dot(chN, chV), 0.0, 1.0), 3.0);
             outgoingLight += (uSkyColor * 0.35 + uSunColor * 0.25) * fr * (0.4 + chMetal); }
           #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () => 'wb-sky-chest-v1';
    this.mesh = new Mesh(merged, material);
    this.mesh.name = 'sky-chests';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.group.add(this.mesh);
    for (const chest of this.chests) this.uni.uSeam.value[chest.index] = chest.seam;
    this.rayUni = {
      ...globals,
      uRays: {
        value: 0,
      },
      uRayColor: {
        value: new Color(1, 0.85, 0.5),
      },
    };
    const rayGeos = [];
    for (let i = 0; i < 14; i++) {
      const yaw = (i / 14) * TAU;
      const len = 6 + (i % 4) * 1.4;
      const geometry = new PlaneGeometry(0.5 + (i % 3) * 0.22, len, 1, 1);
      geometry.translate(0, len / 2, 0);
      geometry.setAttribute('aSeed', new BufferAttribute(new Float32Array(4).fill(i / 14), 1));
      geometry.applyMatrix4(trs(0, 0, 0, 0.35 + (i % 2) * 0.25, yaw, 0));
      rayGeos.push(geometry.toNonIndexed());
    }
    const rayGeometry = mergeGeometries(rayGeos);
    rayGeos.forEach((geo) => geo.dispose());
    this.rays = new Mesh(
      rayGeometry,
      new ShaderMaterial({
        uniforms: this.rayUni,
        vertexShader: RAYS_VERTEX,
        fragmentShader: RAYS_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    );
    this.rays.name = 'sky-chest-rays';
    this.rays.visible = false;
    this.rays.renderOrder = 5;
    this.group.add(this.rays);
    const grand = this.chests.find((chest) => chest.def.kind === 'grand');
    if (
      grand &&
      ((this.seal = this.buildSeal(grand, opts.lenses)),
      (this.seal.visible = this.sealed),
      this.group.add(this.seal),
      this.sealed || (this.sealUni.uSeal.value = 0),
      this.sealed)
    )
      try {
        const desc = ctx.RAPIER.ColliderDesc.cylinder(1.2, 2.2)
          .setTranslation(grand.def.pos.x, grand.def.pos.y + 1.2, grand.def.pos.z)
          .setCollisionGroups(COLLISION_GROUPS.static);
        this.barrier = ctx.physics.createCollider(desc);
        ctx.colliders.register(this.barrier, {
          kind: 'structure',
          surface: 'stone',
          object: this.group,
          data: {
            sky: 'seal',
          },
        });
      } catch (err) {
        console.warn('[sky] seal collider failed', err);
      }
    ctx.scene.add(this.group);
  }
  buildSeal(grand, lenses) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const kinds = [];
    const indices = [];
    const center = grand.def.pos.clone().add(new Vector3(0, 0.1, 0));
    const radius = 2.05;
    for (let i = 0; i <= 12; i++) {
      const phi = (i / 12) * (Math.PI / 2);
      for (let j = 0; j <= 36; j++) {
        const theta = (j / 36) * TAU;
        const dir = new Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(phi), Math.sin(theta) * Math.cos(phi));
        positions.push(center.x + dir.x * radius * 1.12, center.y + dir.y * radius * 0.95, center.z + dir.z * radius);
        normals.push(dir.x, dir.y, dir.z);
        uvs.push(j / 36, i / 12);
        kinds.push(0);
      }
    }
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 36; j++) {
        const i0 = 0 + i * 37 + j;
        const i1 = i0 + 1;
        const i2 = i0 + 36 + 1;
        const i3 = i2 + 1;
        indices.push(i0, i2, i1, i1, i2, i3);
      }
    const apex = center.clone().add(new Vector3(0, grand.style.H + 0.5, 0));
    for (const lens of lenses) {
      const ctrl = lens
        .clone()
        .lerp(apex, 0.5)
        .add(new Vector3(0, -0.9, 0));
      const curve = new QuadraticBezierCurve3(lens.clone(), ctrl, apex.clone());
      const thick = 0.07;
      const len = curve.getLength();
      const base = positions.length / 3;
      const frenetFrames = curve.computeFrenetFrames(28, false);
      for (let i = 0; i <= 28; i++) {
        const u = i / 28;
        const point = curve.getPointAt(u);
        for (let j = 0; j <= 5; j++) {
          const angle = (j / 5) * TAU;
          const normal = frenetFrames.normals[i]
            .clone()
            .multiplyScalar(Math.cos(angle))
            .addScaledVector(frenetFrames.binormals[i], Math.sin(angle));
          positions.push(point.x + normal.x * thick, point.y + normal.y * thick, point.z + normal.z * thick);
          normals.push(normal.x, normal.y, normal.z);
          uvs.push(j / 5, u * len);
          kinds.push(1);
        }
      }
      for (let i = 0; i < 28; i++)
        for (let j = 0; j < 5; j++) {
          const a = base + i * 6 + j;
          const b = a + 5 + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('aUv', new Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aKind', new Float32BufferAttribute(kinds, 1));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const material = new ShaderMaterial({
      uniforms: {
        ...this.ctx.globals,
        ...this.sealUni,
      },
      vertexShader: SEAL_VERTEX,
      fragmentShader: SEAL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'sky-seal';
    mesh.renderOrder = 6;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
  unseal(instant = false) {
    if (!this.sealed) return;
    this.sealed = false;
    if (this.barrier) {
      try {
        this.ctx.colliders.unregister(this.barrier);
        this.ctx.physics.removeCollider(this.barrier, false);
      } catch {}
      this.barrier = null;
    }
    if (instant || !this.seal) {
      this.sealUni.uSeal.value = 0;
      if (this.seal) this.seal.visible = false;
      return;
    }
    this.unsealT = 0;
    const grand = this.chests.find((chest) => chest.def.kind === 'grand');
    if (grand) {
      this.play('barrier-down', grand.def.pos, 1);
      this.burst(grand.def.pos.clone().add(new Vector3(0, 1.4, 0)), 70, 7, true);
    }
  }
  update(dt, realDt, canInteract) {
    const ctx = this.ctx;
    if (this.unsealT >= 0 && this.seal) {
      this.unsealT += realDt;
      const progress = clamp(this.unsealT / 1.6, 0, 1);
      this.sealUni.uBreak.value = Math.sin(Math.min(1, this.unsealT / 0.4) * Math.PI) * 0.8;
      this.sealUni.uSeal.value = 1 - smoothstep(0.1, 1, progress);
      if (progress >= 1) {
        this.seal.visible = false;
        this.unsealT = -1;
      }
    }
    for (const chest of this.chests) {
      if (chest.opened) continue;
      const target =
        chest.def.kind === 'grand'
          ? this.sealed
            ? 0.05
            : 0.55
          : chest.locked
            ? 0.05
            : chest.def.kind === 'cloud' || chest.def.kind === 'heart'
              ? 0.6
              : 0.35;
      chest.seam += (target - chest.seam) * Math.min(1, dt * 2);
      this.uni.uSeam.value[chest.index] = chest.seam;
    }
    if (this.mode === 'opening') {
      this.stepOpening(realDt);
      return;
    }
    if (!canInteract) {
      this.setPrompt(null);
      return;
    }
    const state = ctx.player?.state;
    if (!state || state.dead) return this.setPrompt(null);
    let nearest = null;
    let nearestDist = Infinity;
    for (const chest of this.chests) {
      if (chest.opened) continue;
      const dx = state.position.x - chest.def.pos.x;
      const dz = state.position.z - chest.def.pos.z;
      const dy = state.position.y - chest.def.pos.y;
      if (Math.abs(dy) > 1.6) continue;
      const dist = Math.hypot(dx, dz);
      const fx = Math.sin(chest.def.facing);
      const fz = Math.cos(chest.def.facing);
      if (!((dx * fx + dz * fz) / Math.max(dist, 0.001) < -0.2))
        if (
          dist < (chest.def.kind === 'grand' && this.sealed ? 3.4 : chest.style.W * 0.5 + 1.9) &&
          dist < nearestDist
        ) {
          nearestDist = dist;
          nearest = chest;
        }
    }
    if (!nearest || state.mode !== 'ground' || state.itemHold) return this.setPrompt(null);
    if (nearest.locked && nearest.def.lock) {
      this.setPrompt('locked', nearest.def.lock.prompt);
      if (ctx.input.pressed('interact') && nearest.def.lock.toast)
        try {
          ctx.ui.toast(nearest.def.lock.toast[0], nearest.def.lock.toast[1]);
        } catch {}
      return;
    }
    if (nearest.def.kind === 'grand' && this.sealed) {
      this.setPrompt('sealed');
      if (ctx.input.pressed('interact'))
        try {
          ctx.ui.toast('Sealed by the storm', 'Defeat the two Stormborne guardians of the Aerie');
        } catch {}
      return;
    }
    this.setPrompt('open');
    if (ctx.input.pressed('interact')) this.begin(nearest);
  }
  sealedCount = 0;
  setGuardians(sealedCount) {
    this.sealedCount = sealedCount;
    if (this.promptOn === 'sealed') this.promptOn = null;
  }
  lockText = '';
  setPrompt(kind, text = '') {
    if (kind !== this.promptOn || (kind === 'locked' && text !== this.lockText)) {
      this.promptOn = kind;
      this.lockText = text;
      try {
        if (kind === 'open') this.ctx.ui.showPrompt('chest', 'Open', 'F');
        else if (kind === 'locked') this.ctx.ui.showPrompt('chest', text);
        else if (kind === 'sealed')
          this.ctx.ui.showPrompt('chest', `Sealed by the storm (${Math.min(2, this.sealedCount)}/2 guardians)`);
        else this.ctx.ui.hidePrompt('chest');
      } catch {}
    }
  }
  begin(chest) {
    const ctx = this.ctx;
    this.mode = 'opening';
    this.active = chest;
    this.t = 0;
    this.fired.clear();
    this.itemGiven = false;
    this.itemWait = 0;
    this.setPrompt(null);
    try {
      ctx.player.setControlEnabled(false);
      this.controlLocked = true;
    } catch {}
    const fwd = _fwd.set(Math.sin(chest.def.facing), 0, Math.cos(chest.def.facing));
    const stand = chest.def.pos.clone().addScaledVector(fwd, chest.style.D / 2 + 0.95);
    stand.y = chest.def.pos.y + 0.05;
    try {
      ctx.player.teleport(stand, chest.def.facing + Math.PI);
    } catch {}
    if (chest.def.kind === 'grand' || chest.def.kind === 'cloud' || chest.def.kind === 'heart') {
      const side = _side.set(fwd.z, 0, -fwd.x);
      const zoom = 1.25;
      this.shot.position
        .copy(chest.def.pos)
        .addScaledVector(fwd, 4.2 * zoom)
        .addScaledVector(side, 2.4 * zoom)
        .setY(chest.def.pos.y + 2.2 * zoom);
      this.shot.target.copy(chest.def.pos).setY(chest.def.pos.y + 0.9 * zoom);
      this.shot.blend = 0.7;
      try {
        ctx.player.setCinematic(this.shot);
        this.shotOn = true;
      } catch {}
    }
    this.rays.position.copy(chest.def.pos).add(new Vector3(0, chest.style.H + 0.1, 0));
    this.rays.scale.setScalar(
      chest.def.kind === 'grand' || chest.def.kind === 'cloud' ? 1.2 : chest.def.kind === 'small' ? 0.6 : 0.85,
    );
    this.rayUni.uRayColor.value.set(
      chest.def.kind === 'vessel'
        ? 12577023
        : chest.def.kind === 'heart'
          ? 16756932
          : chest.def.kind === 'cloud'
            ? 16773848
            : 16767370,
    );
  }
  once(key, t, at) {
    return t >= at && !this.fired.has(key) && (this.fired.add(key), true);
  }
  stepOpening(dt) {
    const chest = this.active;
    if (!chest) {
      this.mode = 'idle';
      return;
    }
    this.t += dt;
    const t = this.t;
    const big = chest.def.kind !== 'small';
    const scale = big ? 1 : 0.6;
    const creakAt = 0.45 * scale;
    const popAt = 0.95 * scale;
    let lid = 0;
    if (t > creakAt) lid = 0.14 * easeOut(clamp((t - creakAt) / 0.25, 0, 1));
    if (t > popAt) lid = 0.14 + 1.76 * easeOut(clamp((t - popAt) / 0.7, 0, 1));
    chest.lid = lid;
    chest.open = smoothstep(popAt - 0.4, popAt + 0.5, t);
    this.uni.uLid.value[chest.index] = lid;
    this.uni.uOpen.value[chest.index] = chest.open;
    const rays = chest.open * (1 - smoothstep(4.5, 6.5, t));
    this.rayUni.uRays.value = rays;
    this.rays.visible = rays > 0.002;
    this.rays.rotation.y = this.ctx.time.elapsed * 0.15;
    if (this.once('creak', t, creakAt)) this.play('chest-open', chest.def.pos, big ? 1 : 0.8);
    if (this.once('burst', t, popAt)) {
      const burstPos = chest.def.pos.clone().add(new Vector3(0, chest.style.H + 0.5, 0));
      this.burst(burstPos, big ? 50 : 24, big ? 5 : 3, false);
      if (chest.def.kind === 'cloud') {
        this.burst(burstPos, 60, 7, false);
        this.burst(burstPos, 30, 3, true);
      }
      if ('item' in chest.def.loot)
        try {
          this.ctx.events.emit('chest:open', {
            position: chest.def.pos.clone(),
            item: chest.def.loot.item,
          });
        } catch {}
    }
    if (this.shotOn) {
      const fwd = _fwd.set(Math.sin(chest.def.facing), 0, Math.cos(chest.def.facing));
      const side = _side.set(fwd.z, 0, -fwd.x);
      const zoom = chest.def.kind === 'grand' || chest.def.kind === 'cloud' ? 1.25 : 0.9;
      const goal = new Vector3()
        .copy(chest.def.pos)
        .addScaledVector(fwd, 3.7 * zoom)
        .addScaledVector(side, 2.1 * zoom)
        .setY(chest.def.pos.y + 2 * zoom);
      this.shot.position.lerp(goal, Math.min(1, dt * 1.5));
    }
    if (this.once('give', t, big ? 1.9 : 1.15)) {
      this.itemGiven = true;
      this.itemWait = 0;
      this.grant(chest);
    }
    if (this.itemGiven) {
      this.itemWait += dt;
      const itemHold = this.ctx.player?.state?.itemHold;
      const minWait = big ? 1 : 0.5;
      if ((this.itemWait > minWait && !itemHold) || this.itemWait > 9) this.finish(chest);
    }
  }
  grant(chest) {
    const ctx = this.ctx;
    const loot = chest.def.loot;
    try {
      if ('item' in loot) ctx.player.giveItem(loot.item);
      else if ('ink' in loot) {
        for (const color of COLORS) ctx.paint.addInk(color, ctx.paint.inkMax ?? 100);
        const pos = chest.def.pos.clone().add(new Vector3(0, 1, 0));
        ctx.events.emit('content:ink-refill', {
          color: 'blue',
          amount: ctx.paint.inkMax ?? 100,
          position: pos,
        });
        this.play('ink-refill', pos, 1);
        ctx.ui.toast(loot.title ?? "Painter's Ink Cache", loot.sub ?? 'Every colour of ink is full');
      } else if ('hearts' in loot) {
        ctx.player.heal(loot.hearts);
        const pos = chest.def.pos.clone().add(new Vector3(0, 1, 0));
        ctx.events.emit('pickup', {
          kind: 'heart',
          position: pos,
          amount: loot.hearts,
        });
        this.play('pickup', pos, 1);
        ctx.ui.toast(loot.title ?? 'Sky Blossom Hearts', loot.sub ?? 'Your hearts are restored');
      }
    } catch (err) {
      console.warn('[sky] chest reward failed', err);
    }
  }
  finish(chest) {
    chest.opened = true;
    this.mode = 'idle';
    this.active = null;
    this.rays.visible = false;
    this.rayUni.uRays.value = 0;
    if (this.shotOn) {
      try {
        this.ctx.player.setCinematic(null);
      } catch {}
      this.shotOn = false;
    }
    if (this.controlLocked) {
      try {
        this.ctx.player.setControlEnabled(true);
      } catch {}
      this.controlLocked = false;
    }
    this.opts.onOpened?.(chest.def);
  }
  unlock(id) {
    const chest = this.chests.find((c) => c.def.id === id);
    if (chest && chest.locked) {
      chest.locked = false;
      if (this.promptOn === 'locked') this.promptOn = null;
    }
  }
  isLocked(id) {
    return !!this.chests.find((chest) => chest.def.id === id)?.locked;
  }
  isOpened(id) {
    return !!this.chests.find((chest) => chest.def.id === id)?.opened;
  }
  openInstant(id) {
    const chest = this.chests.find((c) => c.def.id === id);
    if (chest) {
      chest.opened = true;
      chest.lid = 1.9;
      chest.open = 0.3;
      this.uni.uLid.value[chest.index] = chest.lid;
      this.uni.uOpen.value[chest.index] = chest.open;
    }
  }
  burst(pos, count, power, storm) {
    const particles = this.opts.particles;
    if (!particles) return;
    const palette = storm
      ? [new Color(0.7, 0.6, 1), new Color(1, 0.85, 0.5)]
      : COLORS.map((c) => new Color(PALETTE[c].hex));
    const gold = new Color(1, 0.85, 0.5);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const lift = 0.4 + Math.random() * 0.9;
      const speed = power * (0.4 + Math.random() * 0.6);
      try {
        particles.spawn({
          x: pos.x,
          y: pos.y,
          z: pos.z,
          vx: Math.cos(angle) * speed * 0.6,
          vy: speed * lift,
          vz: Math.sin(angle) * speed * 0.6,
          color: i % 3 == 0 ? gold : palette[i % palette.length],
          size: 0.12 + Math.random() * 0.14,
          life: 0.8 + Math.random() * 0.9,
          drag: 1.4,
          gravity: -3,
          mode: ParticleMode.Ballistic,
          bright: 2.2,
        });
      } catch {
        return;
      }
    }
  }
  play(sound, position, volume) {
    try {
      this.ctx.audio.play(sound, {
        position,
        volume,
      });
    } catch {}
  }
  abort() {
    if (this.active) this.finish(this.active);
    this.setPrompt(null);
  }
  get busy() {
    return this.mode === 'opening';
  }
  get fxActive() {
    return this.mode === 'opening' || this.unsealT >= 0;
  }
  get prompting() {
    return this.promptOn !== null;
  }
  dispose() {
    this.abort();
    this.ctx.scene.remove(this.group);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.rays.geometry.dispose();
    this.rays.material.dispose();
    if (this.seal) {
      this.seal.geometry.dispose();
      this.seal.material.dispose();
    }
    for (const chest of this.chests)
      if (chest.collider)
        try {
          this.ctx.colliders.unregister(chest.collider);
          this.ctx.physics.removeCollider(chest.collider, false);
        } catch {}
  }
}
function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}
