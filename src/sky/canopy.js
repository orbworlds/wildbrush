/**
 * Canopy Isle realm: the great tree with roots, decks, crow's nest bridge and crown shrine; three buds woken with Bloom grow vine ladders and leaf steps, a Spring blossom bounces the hero, and the Lost Hue leads to its hoard in the Hollow Stump.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { PALETTE } from '../core/config.js';
import { clamp, damp } from '../core/math.js';
import { displace, mergeGeometries, roundedBox, weld } from '../shared/util.js';
import { dynPart, PAINT, ropeGeometry, xform } from './realm-kit.js';
import { createDynMaterial, createLeafMaterial } from './realm-materials.js';
import { Realm } from './realm.js';
import { crystalGeometry, faceted, STONE, taperedBox } from './ruin-parts.js';
import { placeBoulder, placeLampPost } from './ruins.js';
const canopyV3 = (x2, y, z) => new Vector3(x2, y, z);
const CANOPY_TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const CANOPY_CENTER = {
  x: -116,
  z: 116,
  y: 100,
};
const CANOPY_TREE = {
  x: -3,
  z: 1,
};
const CANOPY_LANDING = {
  x: 20,
  z: -3,
};
const CANOPY_POOL = {
  x: 9,
  z: 10,
};
const CANOPY_HOLLOW = {
  x: -15,
  z: 16,
};
const CANOPY_PATROL = {
  x: 9,
  z: -14,
};
const DECK_A = {
  a: -10 * DEG,
  d: 6.3,
  h: 8,
  r: 2.8,
};
const DECK_B = {
  a: 190 * DEG,
  d: 6.5,
  h: 14,
  r: 3,
};
const DECK_C = {
  a: 260 * DEG,
  d: 6.4,
  h: 20,
  r: 2.8,
};
const NEST_DECK = {
  a: 210 * DEG,
  d: 11,
  h: 20,
  r: 2.2,
};
const CROWN_H = 25;
const CROWN_R = 5;
const trunkRadius = (h) =>
  h < 0 ? 4.3 : h < 8 ? 4.1 - h * 0.12 : h < 20 ? 3.14 - (h - 8) * 0.04 : 2.66 - (h - 20) * 0.02;
const HUE_STOPS = [
  [15.5, 6.5],
  [7, 17.5],
  [-5.5, 20.5],
  [CANOPY_HOLLOW.x + 0.3, CANOPY_HOLLOW.z - 0.2],
];
const CANOPY_ISLE = {
  id: 'canopy',
  name: 'Canopy Isle',
  cx: CANOPY_CENTER.x,
  cz: CANOPY_CENTER.z,
  y: CANOPY_CENTER.y,
  r: 26,
  depth: 36,
  seed: 'canopy-main',
  segs: 190,
  rings: 32,
  elong: 0.06,
  elongAngle: 0.4,
  wobble: 0.08,
  relief: 0.6,
  dome: 1.3,
  bumps: [
    {
      x: 14,
      z: 16,
      r: 6,
      h: 1.1,
    },
    {
      x: -18,
      z: -12,
      r: 7,
      h: 1.4,
    },
    {
      x: 12,
      z: -20,
      r: 5,
      h: 0.8,
    },
  ],
  flats: [
    {
      x: CANOPY_TREE.x,
      z: CANOPY_TREE.z,
      r: 9.5,
      soft: 3,
      dirt: 0.25,
    },
    {
      x: CANOPY_LANDING.x,
      z: CANOPY_LANDING.z,
      r: 4.5,
      soft: 2.5,
      lift: 0.1,
      pave: 0.9,
    },
    {
      x: CANOPY_POOL.x,
      z: CANOPY_POOL.z,
      r: 2.6,
      soft: 1.6,
      lift: -0.35,
    },
    {
      x: CANOPY_HOLLOW.x,
      z: CANOPY_HOLLOW.z,
      r: 4,
      soft: 2,
    },
    {
      x: CANOPY_PATROL.x,
      z: CANOPY_PATROL.z,
      r: 5,
      soft: 3,
    },
  ],
  paths: [
    {
      pts: [
        [CANOPY_LANDING.x, CANOPY_LANDING.z],
        [14, -1.5],
        [8.5, -0.5],
      ],
      w: 2,
    },
  ],
  rocky: 0.15,
  lobes: 5,
  lobeAmp: 0.3,
  grass: 1,
};
const HUE_VERTEX = `
#include <wb_common>
varying vec2 vQ;
void main() {
  vQ = position.xy / 1.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy;
  gl_Position = projectionMatrix * mv;
}
`;
const HUE_FRAGMENT = `
#include <wb_common>
uniform vec3 uHueCol;
varying vec2 vQ;
void main() {
  vec2 q = vQ;
  float r2 = dot(q, q);
  float core = exp(-r2 * 38.0);
  float halo = exp(-r2 * 5.0) * 0.45;
  // two wings flutter (squash in x with the beat)
  float flap = 0.35 + 0.65 * abs(sin(uTime * 22.0));
  vec2 w = vec2((abs(q.x) - 0.3) / (0.28 * flap), (q.y - 0.08) / 0.17);
  float wing = (1.0 - smoothstep(0.7, 1.0, length(w))) * step(0.08, abs(q.x));
  vec3 c = uHueCol * (core * 2.4 + halo + wing * 0.55) + vec3(1.0) * core * 1.2;
  float a = clamp(core + halo + wing * 0.5, 0.0, 1.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(c * a, 1.0);
}
`;
const CANOPY_PARS_VERTEX = `
uniform float uGrow[4];
uniform vec3 uOrigin[4];
uniform float uPetal;
uniform vec3 uPetalC;
uniform float uSpring;
`;
const CANOPY_POS_VERTEX = `
{
  float part = aFd.x;
  // grown pieces pop out from their bud as the growth front passes them
  if (part > 10.5 && part < 14.5) {
    int k = int(part - 11.0 + 0.5);
    float g = 0.0; vec3 o = vec3(0.0);
    for (int i = 0; i < 4; i++) { if (i == k) { g = uGrow[i]; o = uOrigin[i]; } }
    float s = smoothstep(aFd.y - 0.08, aFd.y + 0.02, g * 1.1);
    transformed = mix(o, transformed, s);
  }
  // buds swell as they wake, then open
  if (part > 0.5 && part < 3.5) {
    int k = int(part - 1.0 + 0.5);
    float g = 0.0; vec3 o = vec3(0.0);
    for (int i = 0; i < 4; i++) { if (i == k) { g = uGrow[i]; o = uOrigin[i]; } }
    float pulse = 1.0 + 0.06 * sin(uTime * 3.0 + part) * (1.0 - g);
    transformed = o + (transformed - o) * pulse * (1.0 + g * 0.35);
  }
  // shrine petals: hinged at their base, they fold open
  if (part > 19.5 && part < 20.5) {
    float a = aFd.y;
    vec3 dir = vec3(cos(a), 0.0, sin(a));
    vec3 hinge = uPetalC + dir * 1.75;
    vec3 ax = vec3(-sin(a), 0.0, cos(a));
    float ang = -uPetal * 1.3;
    vec3 rel = transformed - hinge;
    float c = cos(ang), s = sin(ang);
    rel = rel * c + cross(ax, rel) * s + ax * dot(ax, rel) * (1.0 - c);
    transformed = hinge + rel;
  }
  // the spring blossom jiggles once awake
  if (part > 3.5 && part < 4.5) {
    float j = uSpring * (0.08 * sin(uTime * 9.0) + 0.04 * sin(uTime * 14.0));
    transformed.y += (transformed.y - aFd.y) * j;
  }
}
`;
const CANOPY_PARS_FRAGMENT = `
uniform float uGrow[4];
uniform float uPetal;
uniform float uSpring;
`;
const CANOPY_COLOR_FRAGMENT = `
{
  float part = vFd.x;
  vec3 c = diffuseColor.rgb;
  vec3 N = normalize(vDN);
  vec3 V = normalize(uCameraPos - vDW);
  float fr = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0);
  if (part > 0.5 && part < 3.5) {
    int k = int(part - 1.0 + 0.5);
    float g = 0.0;
    for (int i = 0; i < 4; i++) { if (i == k) g = uGrow[i]; }
    // dormant: a pale bud with a slow green heartbeat; awake: vivid bloom
    float beat = 0.5 + 0.5 * sin(uTime * 2.4 + part * 1.7);
    vec3 dormant = mix(vec3(0.62, 0.66, 0.6), c, 0.35);
    c = mix(dormant, c * 1.15, g);
    fdEmit += vec3(0.35, 0.95, 0.4) * ((1.0 - g) * (0.55 + beat * 1.1) + fr * 0.5);
  } else if (part > 3.5 && part < 4.5) {
    c = mix(c * 0.7, vec3(1.0, 0.84, 0.28), uSpring);
    fdEmit += vec3(1.0, 0.8, 0.25) * (0.12 + uSpring * (0.5 + 0.3 * sin(uTime * 5.0)));
  } else if (part > 10.5 && part < 14.5) {
    float n = wbNoise3(vDW * 2.0);
    c = skyApplyVitRaw(c * (0.85 + 0.3 * n), vDW);
    fdEmit += c * fr * 0.25;
  } else if (part > 19.5 && part < 20.5) {
    c = skyApplyVitRaw(c, vDW);
    fdEmit += c * (0.12 + uPetal * 0.25) + vec3(1.0, 0.9, 0.7) * fr * 0.3;
  } else if (part > 20.5 && part < 21.5) {
    // glowing mushrooms in the Hollow Stump
    fdEmit += c * (0.8 + 0.2 * sin(uTime * 1.3 + vDW.x * 3.0));
  } else {
    c = skyApplyVitRaw(c, vDW);
  }
  diffuseColor.rgb = c;
}
`;
export class CanopyRealm extends Realm {
  cdU = {
    uGrow: {
      value: [0, 0, 0, 0],
    },
    uOrigin: {
      value: [canopyV3(0, 0, 0), canopyV3(0, 0, 0), canopyV3(0, 0, 0), canopyV3(0, 0, 0)],
    },
    uPetal: {
      value: 0,
    },
    uPetalC: {
      value: canopyV3(0, 0, 0),
    },
    uSpring: {
      value: 0,
    },
  };
  trunk = canopyV3(0, 0, 0);
  growths = [];
  springPad = canopyV3(0, 0, 0);
  springOn = false;
  petal = 0;
  crownOpen = false;
  awakenT = -1;
  shrine = canopyV3(0, 0, 0);
  deckB = canopyV3(0, 0, 0);
  hue = null;
  hueMat = null;
  huePos = canopyV3(0, 0, 0);
  hueFrom = canopyV3(0, 0, 0);
  hueTo = canopyV3(0, 0, 0);
  hueStage = 0;
  hueT = 1;
  hueFound = false;
  hueTrailT = 0;
  hints = {
    landing: false,
    deckB: false,
    deckC: false,
    hue: false,
  };
  constructor(ctx, opts) {
    super(ctx, 'canopy', 'Canopy Isle', 'Home of the oldest tree in the sky', [CANOPY_ISLE], 3, opts, 12);
    this.grass = true;
  }
  deckPos(deck) {
    return canopyV3(
      this.trunk.x + Math.cos(deck.a) * deck.d,
      this.trunk.y + deck.h,
      this.trunk.z + Math.sin(deck.a) * deck.d,
    );
  }
  build() {
    const b2 = this.b;
    const rng = this.r;
    const rand = (lo, hi) => lo + (hi - lo) * rng();
    this.undersides([13172708, 16769960, 14221240, 16762076], {
      roots: true,
      crystalGlow: 1.3,
    });
    this.trunk = this.W(CANOPY_TREE.x, this.G(CANOPY_TREE.x, CANOPY_TREE.z), CANOPY_TREE.z);
    const baseY = this.trunk.y;
    const dynGeos = [];
    const crownGeos = [];
    const bark = [0, 0, 0, 1];
    const plankColors = [10122322, 8806463, 11108960];
    {
      const positions = [];
      const indices = [];
      for (let i = 0; i <= 36; i++) {
        const h = -1.5 + (26.7 * i) / 36;
        for (let j = 0; j <= 40; j++) {
          const angle = (j / 40) * CANOPY_TAU;
          const twist = angle + h * 0.045;
          const ridges =
            (0.5 + 0.5 * Math.cos(twist * 11)) ** 3 * 0.5 +
            (0.5 + 0.5 * Math.cos(twist * 4 + 1.3)) ** 2 * 0.25 +
            Math.sin(twist * 23 + h * 0.4) * 0.06;
          const flare = Math.max(0, 1 - h / 3.2);
          const buttress = (0.5 + 0.5 * Math.cos(angle * 5 + 0.6)) ** 4 * flare * flare * 2.6;
          const radius = trunkRadius(h) + ridges + buttress + flare * flare * 0.9;
          positions.push(this.trunk.x + Math.cos(angle) * radius, baseY + h, this.trunk.z + Math.sin(angle) * radius);
        }
      }
      for (let i = 0; i < 36; i++)
        for (let j = 0; j < 40; j++) {
          const i0 = i * 41 + j;
          indices.push(i0, i0 + 40 + 1, i0 + 1, i0 + 1, i0 + 40 + 1, i0 + 40 + 2);
        }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      b2.rock(geometry, canopyV3(0, 0, 0), undefined, undefined, bark);
      for (const [y0, y1] of [
        [-1, 4],
        [4, 10],
        [10, 17],
        [17, 23],
        [23, 24.7],
      ]) {
        const radius = trunkRadius((y0 + y1) / 2) + 0.15;
        b2.cyl(this.trunk.clone().add(canopyV3(0, (y0 + y1) / 2, 0)), (y1 - y0) / 2, radius, undefined, {
          kind: 'tree',
          surface: 'wood',
        });
      }
      this.clear.push({
        x: this.trunk.x,
        z: this.trunk.z,
        r: 6.5,
      });
      this.surfs.push({
        k: 'disc',
        x: this.trunk.x,
        z: this.trunk.z,
        r: trunkRadius(0) + 0.3,
        y: baseY + CROWN_H,
      });
    }
    [30, 75, 122, 160, 212, 252, 300, 328].forEach((deg, i) => {
      const angle = deg * DEG + rand(-0.1, 0.1);
      const dir = canopyV3(Math.cos(angle), 0, Math.sin(angle));
      const lip = this.main.lipAt(
        Math.atan2(this.trunk.z - this.cz + dir.z * 30, this.trunk.x - this.cx + dir.x * 30),
        canopyV3(0, 0, 0),
      );
      const dist = Math.hypot(lip.x - this.trunk.x, lip.z - this.trunk.z);
      const pts = [];
      for (let j = 0; j <= 9; j++) {
        const t = j / 9;
        const along = 3.2 + (dist - 3.2) * t;
        const wiggle = canopyV3(-dir.z, 0, dir.x).multiplyScalar(Math.sin(t * 5 + i) * 0.9);
        const p = this.trunk.clone().addScaledVector(dir, along).add(wiggle);
        const ground = this.groundAt(p.x, p.z) ?? baseY;
        p.y = t < 0.15 ? baseY + 1.6 - t * 8 : ground + 0.12;
        pts.push(p);
      }
      const edge = lip.clone().addScaledVector(dir, 0.6);
      pts.push(
        edge.clone().add(canopyV3(0, -1.4, 0)),
        edge
          .clone()
          .addScaledVector(dir, 0.3)
          .add(canopyV3(0, -5, 0)),
        edge
          .clone()
          .addScaledVector(dir, -1.2)
          .add(canopyV3(rand(-1, 1), -11 - rand(0, 7), rand(-1, 1))),
      );
      const curve = new CatmullRomCurve3(pts);
      const thick = rand(0.75, 1.05);
      const geometry = new TubeGeometry(curve, 48, 1, 7, false);
      const position = geometry.attributes.position;
      const center = canopyV3(0, 0, 0);
      for (let i = 0; i <= 48; i++) {
        const t = i / 48;
        curve.getPointAt(t, center);
        const scale = thick * (1 - t * 0.75) + 0.12;
        const squash = t > 0.1 && t < 0.7916666666666666 ? 0.5 : 1;
        for (let j = 0; j <= 7; j++) {
          const vi = i * 8 + j;
          position.setXYZ(
            vi,
            center.x + (position.getX(vi) - center.x) * scale,
            center.y + (position.getY(vi) - center.y) * scale * squash,
            center.z + (position.getZ(vi) - center.z) * scale,
          );
        }
      }
      geometry.computeVertexNormals();
      b2.rock(geometry, canopyV3(0, 0, 0), undefined, undefined, bark);
      for (let i = 2; i < 9; i += 2) {
        const p = pts[i];
        const radius = thick * (1 - (i / 12) * 0.75) + 0.12;
        const desc = this.ctx.RAPIER.ColliderDesc.capsule(0.6, Math.min(radius, 0.7))
          .setTranslation(p.x, p.y - Math.min(radius, 0.7) + 0.2, p.z)
          .setRotation(
            new Quaternion().setFromUnitVectors(
              canopyV3(0, 1, 0),
              pts[i + 1]
                .clone()
                .sub(pts[i - 1])
                .setY(0)
                .normalize(),
            ),
          );
        this.collider(desc, {
          kind: 'tree',
          surface: 'wood',
        });
      }
    });
    const buildDeck = (pos, radius, yaw) => {
      const count = Math.round((radius * 2) / 0.42);
      for (let i = 0; i < count; i++) {
        const x = -radius + (i + 0.5) * ((radius * 2) / count);
        const len = 2 * Math.sqrt(Math.max(0.01, radius * radius - x * x)) - 0.1;
        const plank = roundedBox(0.38, 0.16, len, 0.04, 1);
        const rot = new Quaternion().setFromAxisAngle(canopyV3(0, 1, 0), yaw);
        const offset = canopyV3(x, 0, 0).applyQuaternion(rot);
        b2.stone(
          plank,
          pos
            .clone()
            .add(offset)
            .add(canopyV3(0, -0.08 + (i % 3) * 0.008, 0)),
          yaw,
          plankColors[i % 3],
        );
      }
      const rim = new TorusGeometry(radius, 0.13, 6, 36);
      rim.rotateX(Math.PI / 2);
      b2.rock(rim, pos.clone().add(canopyV3(0, -0.1, 0)), 0, undefined, bark);
      this.collider(this.ctx.RAPIER.ColliderDesc.cylinder(0.14, radius).setTranslation(pos.x, pos.y - 0.14, pos.z), {
        kind: 'structure',
        surface: 'wood',
      });
      this.surfs.push({
        k: 'disc',
        x: pos.x,
        z: pos.z,
        r: radius,
        y: pos.y,
      });
      for (let i = 0; i < 6; i++) {
        const angle = yaw + (i / 6) * CANOPY_TAU + 0.3;
        b2.rock(
          new CylinderGeometry(0.08, 0.1, 0.9, 6),
          pos.clone().add(canopyV3(Math.cos(angle) * (radius - 0.12), 0.35, Math.sin(angle) * (radius - 0.12))),
          0,
          undefined,
          bark,
        );
      }
    };
    const buildBranch = (from, to, r0, r1) => {
      const mid = from
        .clone()
        .lerp(to, 0.5)
        .add(canopyV3(0, -0.6, 0));
      const curve = new CatmullRomCurve3([from, mid, to]);
      const geometry = new TubeGeometry(curve, 16, 1, 7, false);
      const position = geometry.attributes.position;
      const center = canopyV3(0, 0, 0);
      for (let i = 0; i <= 16; i++) {
        curve.getPointAt(i / 16, center);
        const scale = r0 + (r1 - r0) * (i / 16);
        for (let j = 0; j <= 7; j++) {
          const vi = i * 8 + j;
          position.setXYZ(
            vi,
            center.x + (position.getX(vi) - center.x) * scale,
            center.y + (position.getY(vi) - center.y) * scale,
            center.z + (position.getZ(vi) - center.z) * scale,
          );
        }
      }
      geometry.computeVertexNormals();
      b2.rock(geometry, canopyV3(0, 0, 0), undefined, undefined, bark);
    };
    const deckDefs = [DECK_A, DECK_B, DECK_C, NEST_DECK];
    const decks = [];
    deckDefs.forEach((deck) => {
      const pos = this.deckPos(deck);
      decks.push(pos);
      buildDeck(pos, deck.r, deck.a);
      const from = canopyV3(
        this.trunk.x + Math.cos(deck.a) * (trunkRadius(deck.h) - 0.3),
        pos.y - 1.6,
        this.trunk.z + Math.sin(deck.a) * (trunkRadius(deck.h) - 0.3),
      );
      buildBranch(
        from,
        pos.clone().add(canopyV3(Math.cos(deck.a) * deck.r * 0.6, -0.55, Math.sin(deck.a) * deck.r * 0.6)),
        1,
        0.45,
      );
    });
    this.deckB = decks[1];
    this.spot('canopyDeckA', decks[0]);
    this.spot('canopyDeckB', decks[1]);
    this.spot('canopyDeckC', decks[2]);
    this.spot('canopyNest', decks[3]);
    const shrinePos = this.trunk.clone().add(canopyV3(0, CROWN_H, 0));
    this.shrine.copy(shrinePos);
    {
      buildDeck(shrinePos, CROWN_R, 0.2);
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * CANOPY_TAU + Math.PI / 4;
        const post = shrinePos.clone().add(canopyV3(Math.cos(angle) * 3.4, 0, Math.sin(angle) * 3.4));
        b2.rock(new CylinderGeometry(0.16, 0.2, 3.4, 7), post.clone().add(canopyV3(0, 1.7, 0)), 0, undefined, bark);
        b2.glass(new OctahedronGeometry(0.22, 0), post.clone().add(canopyV3(0, 3.6, 0)), 0, 16773296, 2.6);
        b2.cyl(post.clone().add(canopyV3(0, 1.7, 0)), 1.7, 0.2);
      }
      for (let i = 0; i < 4; i++) {
        const inlay = new CylinderGeometry(2.1, 2.1, 0.04, 12, 1, false, (i * Math.PI) / 2 + 0.05, Math.PI / 2 - 0.1);
        b2.glass(
          faceted(inlay),
          shrinePos.clone().add(canopyV3(0, 0.01, 0)),
          0.3,
          [PALETTE.red.hex, PALETTE.blue.hex, PALETTE.yellow.hex, PALETTE.green.hex][i],
          0.7,
        );
      }
      this.cdU.uPetalC.value.copy(shrinePos);
      for (let i = 0; i < 6; i++) {
        const angle = DECK_C.a + Math.PI / 6 + (i / 6) * CANOPY_TAU;
        const petal = new SphereGeometry(1, 14, 10, 0, Math.PI, 0, Math.PI);
        petal.scale(1.2, 2.2, 0.34);
        petal.rotateY(-Math.PI / 2);
        petal.translate(0, 2, 0);
        const rot = new Quaternion()
          .setFromAxisAngle(canopyV3(0, 1, 0), -angle + Math.PI / 2)
          .multiply(new Quaternion().setFromAxisAngle(canopyV3(1, 0, 0), -0.42));
        xform(petal, shrinePos.clone().add(canopyV3(Math.cos(angle) * 1.75, -0.05, Math.sin(angle) * 1.75)), rot);
        const color = new Color(i % 2 ? 16758996 : 16773366);
        dynGeos.push(dynPart(petal, color, 20, angle));
      }
      const chestPos = shrinePos.clone();
      this.chestDefs.push({
        id: 'canopy-crown',
        kind: 'cloud',
        pos: chestPos,
        facing: Math.atan2(Math.cos(DECK_C.a), Math.sin(DECK_C.a)),
        loot: {
          item: 'cloudstep',
        },
        lock: {
          prompt: 'Sealed in the sleeping bloom',
          toast: ['The Sleeping Bloom', 'Wake the great tree’s three glowing buds with Bloom'],
        },
      });
      this.spot('canopyShrine', shrinePos.clone().add(canopyV3(Math.cos(DECK_C.a) * 3.2, 0, Math.sin(DECK_C.a) * 3.2)));
      this.spot('canopyChest', chestPos);
    }
    const vineLadder = (base, topY, angle, width, part) => {
      const dir = canopyV3(Math.cos(angle), 0, Math.sin(angle));
      const side = canopyV3(-dir.z, 0, dir.x);
      const height = topY - base.y;
      for (let j = 0; j < 5; j++) {
        const offset = (j / 4 - 0.5) * width;
        const pts = [];
        for (let k = 0; k <= 8; k++) {
          const t2 = k / 8;
          pts.push(
            base
              .clone()
              .addScaledVector(side, offset + Math.sin(t2 * 7 + j) * 0.12)
              .addScaledVector(dir, 0.12 + Math.sin(t2 * 5 + j * 2) * 0.05)
              .add(canopyV3(0, t2 * height, 0)),
          );
        }
        const vine = new TubeGeometry(new CatmullRomCurve3(pts), 16, 0.07, 5, false);
        const position = vine.attributes.position;
        const fd = new Float32Array(position.count * 2);
        for (let j = 0; j < position.count; j++)
          fd.set([part, clamp((position.getY(j) - base.y) / height, 0, 1)], j * 2);
        dynPart(vine, 5212723, part);
        vine.setAttribute('aFd', new BufferAttribute(fd, 2));
        dynGeos.push(vine);
      }
      const leafCount = Math.round(height * width * 2.2);
      for (let i = 0; i < leafCount; i++) {
        const t = (i + rng()) / leafCount;
        const offset = (rng() - 0.5) * width * 1.1;
        const leaf = new SphereGeometry(0.22, 6, 4);
        leaf.scale(1.2, 0.3, 0.8);
        xform(
          leaf,
          base
            .clone()
            .addScaledVector(side, offset)
            .addScaledVector(dir, 0.2)
            .add(canopyV3(0, t * height, 0)),
          new Euler(rand(-0.6, 0.6), rand(0, CANOPY_TAU), rand(-0.6, 0.6)),
        );
        dynPart(leaf, rng() < 0.12 ? 16763104 : rng() < 0.5 ? 6270533 : 8176720, part, t);
        dynGeos.push(leaf);
      }
      return () => {
        const center = base
          .clone()
          .add(canopyV3(0, height / 2, 0))
          .addScaledVector(dir, -0.12);
        const rot = new Quaternion().setFromAxisAngle(canopyV3(0, 1, 0), -angle);
        this.collider(
          this.ctx.RAPIER.ColliderDesc.cuboid(0.18, height / 2, width / 2 + 0.1)
            .setTranslation(center.x, center.y, center.z)
            .setRotation({
              x: rot.x,
              y: rot.y,
              z: rot.z,
              w: rot.w,
            }),
          {
            kind: 'structure',
            surface: 'wood',
          },
        );
        try {
          for (let y = 0.4; y < height; y += 0.7)
            for (const dx of [-width * 0.3, 0, width * 0.3])
              this.ctx.paint.paintSphere(
                base
                  .clone()
                  .addScaledVector(side, dx)
                  .addScaledVector(dir, 0.1)
                  .add(canopyV3(0, y, 0)),
                0.75,
                'green',
                1,
              );
        } catch {}
      };
    };
    const addBud = (pos, part) => {
      const bud = new SphereGeometry(0.42, 12, 10);
      bud.scale(1, 1.35, 1);
      dynGeos.push(dynPart(xform(bud, pos.clone().add(canopyV3(0, 0.55, 0))), 7327856, part));
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * CANOPY_TAU;
        const sepal = new SphereGeometry(0.3, 8, 6);
        sepal.scale(0.55, 1.2, 0.3);
        xform(
          sepal,
          pos.clone().add(canopyV3(Math.cos(angle) * 0.28, 0.45, Math.sin(angle) * 0.28)),
          new Euler(Math.sin(angle) * 0.5, -angle, -Math.cos(angle) * 0.5, 'YXZ'),
        );
        dynGeos.push(dynPart(sepal, 5212723, part));
      }
      const stem = new CylinderGeometry(0.06, 0.1, 0.5, 6);
      dynGeos.push(dynPart(xform(stem, pos.clone().add(canopyV3(0, 0.2, 0))), 5212723, part));
    };
    {
      const angle = DECK_A.a;
      const dist = DECK_A.d + DECK_A.r - 0.05;
      const foot = canopyV3(this.trunk.x + Math.cos(angle) * dist, 0, this.trunk.z + Math.sin(angle) * dist);
      foot.y = this.groundAt(foot.x, foot.z) ?? baseY;
      const build = vineLadder(foot, baseY + DECK_A.h, angle, 1.9, 11);
      const budPos = foot.clone().add(canopyV3(Math.cos(angle) * 0.9, 0, Math.sin(angle) * 0.9));
      budPos.y = this.groundAt(budPos.x, budPos.z) ?? baseY;
      addBud(budPos, 1);
      this.cdU.uOrigin.value[0].copy(budPos);
      this.growths.push({
        id: 'A',
        bud: budPos,
        grow: 0,
        target: 0,
        build,
        grown: false,
      });
      this.spot('canopyBudA', budPos);
    }
    {
      const a0 = DECK_A.a + 0.25;
      const a1 = DECK_B.a - 0.25;
      const y0 = DECK_A.h;
      const y1 = DECK_B.h;
      const radius = trunkRadius(11) + 1.15;
      const steps = [];
      for (let i = 0; i <= 22; i++) {
        const t = i / 22;
        const angle = a0 + (a1 - a0) * t;
        steps.push(
          canopyV3(
            this.trunk.x + Math.cos(angle) * radius,
            baseY + y0 + (y1 - y0) * t,
            this.trunk.z + Math.sin(angle) * radius,
          ),
        );
      }
      for (let i = 0; i <= 22; i++) {
        const t = i / 22;
        const angle = a0 + (a1 - a0) * t;
        const pad = new SphereGeometry(1, 12, 6, 0, CANOPY_TAU, 0, Math.PI / 2);
        pad.scale(1.05, 0.14, 0.75);
        xform(pad, steps[i].clone().add(canopyV3(0, -0.12, 0)), new Euler(0, -angle + Math.PI / 2, 0));
        dynGeos.push(dynPart(pad, i % 3 == 0 ? 7127114 : i % 3 == 1 ? 5942850 : 8178776, 12, t));
        const stalk = new CylinderGeometry(0.07, 0.07, 1.4, 5);
        stalk.rotateZ(Math.PI / 2);
        xform(
          stalk,
          steps[i]
            .clone()
            .addScaledVector(canopyV3(Math.cos(angle), 0, Math.sin(angle)), -1)
            .add(canopyV3(0, -0.25, 0)),
          -angle,
        );
        dynGeos.push(dynPart(stalk, 5212723, 12, t));
      }
      const build = () => {
        for (let i = 0; i < 22; i++) {
          const p0 = steps[i];
          const p1 = steps[i + 1];
          const mid = p0
            .clone()
            .lerp(p1, 0.5)
            .add(canopyV3(0, -0.14, 0));
          const len = p0.distanceTo(p1) + 0.25;
          const dir = p1.clone().sub(p0).normalize();
          const rot = new Quaternion().setFromEuler(
            new Euler(-Math.asin(clamp(dir.y, -1, 1)), Math.atan2(dir.x, dir.z), 0, 'YXZ'),
          );
          this.collider(
            this.ctx.RAPIER.ColliderDesc.cuboid(0.95, 0.14, len / 2)
              .setTranslation(mid.x, mid.y, mid.z)
              .setRotation({
                x: rot.x,
                y: rot.y,
                z: rot.z,
                w: rot.w,
              }),
            {
              kind: 'structure',
              surface: 'wood',
            },
          );
        }
      };
      const isGrown = () => this.growths[1]?.grown ?? false;
      for (let i = 0; i < 22; i++) {
        const p0 = steps[i];
        const p1 = steps[i + 1];
        this.surfs.push({
          k: 'ramp',
          x0: p0.x,
          z0: p0.z,
          y0: p0.y,
          x1: p1.x,
          z1: p1.z,
          y1: p1.y,
          hw: 0.95,
          on: isGrown,
        });
      }
      const budPos = canopyV3(
        this.trunk.x + Math.cos(DECK_A.a) * (trunkRadius(DECK_A.h) + 0.95),
        decks[0].y,
        this.trunk.z + Math.sin(DECK_A.a) * (trunkRadius(DECK_A.h) + 0.95),
      );
      addBud(budPos, 2);
      this.cdU.uOrigin.value[1].copy(budPos);
      this.growths.push({
        id: 'B',
        bud: budPos,
        grow: 0,
        target: 0,
        build,
        grown: false,
      });
      this.spot('canopyBudB', budPos);
    }
    {
      const dir = decks[2].clone().sub(decks[1]).setY(0).normalize();
      const pad = decks[1].clone().addScaledVector(dir, DECK_B.r - 1.25);
      this.springPad.copy(pad);
      const blossom = new SphereGeometry(1.05, 18, 8, 0, CANOPY_TAU, 0, Math.PI / 2);
      blossom.scale(1, 0.28, 1);
      dynGeos.push(dynPart(xform(blossom, pad.clone().add(canopyV3(0, 0.02, 0))), 15260064, 4, pad.y));
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * CANOPY_TAU;
        const stamen = new SphereGeometry(0.12, 6, 4);
        stamen.scale(1, 0.4, 1);
        dynGeos.push(
          dynPart(
            xform(stamen, pad.clone().add(canopyV3(Math.cos(angle) * 0.55, 0.28, Math.sin(angle) * 0.55))),
            16774864,
            4,
            pad.y,
          ),
        );
      }
      this.collider(this.ctx.RAPIER.ColliderDesc.cylinder(0.12, 1).setTranslation(pad.x, pad.y + 0.12, pad.z), {
        kind: 'structure',
        surface: 'wood',
      });
      this.surfs.push({
        k: 'disc',
        x: pad.x,
        z: pad.z,
        r: 1,
        y: pad.y + 0.24,
      });
      this.spot('canopyBlossom', pad);
    }
    {
      const angle = DECK_C.a;
      const build = vineLadder(
        canopyV3(this.trunk.x + Math.cos(angle) * 4.95, decks[2].y, this.trunk.z + Math.sin(angle) * 4.95),
        shrinePos.y,
        angle,
        1.8,
        13,
      );
      const budPos = canopyV3(this.trunk.x + Math.cos(angle) * 5.9, decks[2].y, this.trunk.z + Math.sin(angle) * 5.9);
      addBud(budPos, 3);
      this.cdU.uOrigin.value[2].copy(budPos);
      this.growths.push({
        id: 'C',
        bud: budPos,
        grow: 0,
        target: 0,
        build,
        grown: false,
      });
      this.spot('canopyBudC', budPos);
    }
    {
      const deckC = decks[2];
      const nest = decks[3];
      const dir = nest.clone().sub(deckC).setY(0);
      dir.length();
      dir.normalize();
      const start = deckC.clone().addScaledVector(dir, DECK_C.r - 0.3);
      const end = nest.clone().addScaledVector(dir, -(NEST_DECK.r - 0.3));
      const span = start.distanceTo(end);
      const yaw = Math.atan2(dir.x, dir.z);
      const count = Math.round(span / 0.45);
      for (let i = 0; i <= count; i++) {
        const t2 = i / count;
        const p = start
          .clone()
          .lerp(end, t2)
          .add(canopyV3(0, -Math.sin(t2 * Math.PI) * 0.25 - 0.05, 0));
        b2.stone(roundedBox(1.4, 0.1, 0.34, 0.03, 1), p, yaw, plankColors[i % 3]);
      }
      const side = canopyV3(dir.z, 0, -dir.x);
      for (const offset of [-0.75, 0.75]) {
        b2.rock(
          ropeGeometry(
            start
              .clone()
              .addScaledVector(side, offset)
              .add(canopyV3(0, 0.9, 0)),
            end
              .clone()
              .addScaledVector(side, offset)
              .add(canopyV3(0, 0.9, 0)),
            0.4,
            0.04,
          ),
          canopyV3(0, 0, 0),
          undefined,
          undefined,
          bark,
        );
        for (const anchor of [start, end])
          b2.rock(
            new CylinderGeometry(0.07, 0.09, 1.2, 6),
            anchor
              .clone()
              .addScaledVector(side, offset)
              .add(canopyV3(0, 0.5, 0)),
            0,
            undefined,
            bark,
          );
      }
      const mid = start
        .clone()
        .lerp(end, 0.5)
        .add(canopyV3(0, -0.22, 0));
      const rot = new Quaternion().setFromAxisAngle(canopyV3(0, 1, 0), yaw);
      this.collider(
        this.ctx.RAPIER.ColliderDesc.cuboid(0.7, 0.1, span / 2 + 0.2)
          .setTranslation(mid.x, mid.y - 0.05, mid.z)
          .setRotation({
            x: rot.x,
            y: rot.y,
            z: rot.z,
            w: rot.w,
          }),
        {
          kind: 'structure',
          surface: 'wood',
        },
      );
      for (const offset of [-0.8, 0.8]) {
        const p = mid
          .clone()
          .addScaledVector(side, offset)
          .add(canopyV3(0, 0.5, 0));
        this.collider(
          this.ctx.RAPIER.ColliderDesc.cuboid(0.05, 0.5, span / 2)
            .setTranslation(p.x, p.y, p.z)
            .setRotation({
              x: rot.x,
              y: rot.y,
              z: rot.z,
              w: rot.w,
            }),
          {
            kind: 'structure',
            surface: 'wood',
          },
        );
      }
      this.surfs.push({
        k: 'ramp',
        x0: start.x,
        z0: start.z,
        y0: start.y - 0.1,
        x1: end.x,
        z1: end.z,
        y1: end.y - 0.1,
        hw: 0.7,
      });
      const chestPos = nest.clone().addScaledVector(dir, 0.6);
      this.chestDefs.push({
        id: 'canopy-nest',
        kind: 'small',
        pos: chestPos,
        facing: yaw + Math.PI,
        loot: {
          ink: true,
          title: 'Crow’s Nest Cache',
          sub: 'The lookout’s paints — every colour of ink is full!',
        },
      });
      this.spot('canopyNestChest', chestPos);
    }
    {
      const crown = this.trunk.clone().add(canopyV3(0, 32, 0));
      const clumps = [];
      const count = this.low ? 20 : 30;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * CANOPY_TAU * 2.618;
        const radial = Math.sqrt((i + 0.5) / count);
        const dist = 3 + radial * 9.5;
        const dy = 3.5 - radial * radial * 5.5 + rand(-0.6, 0.8);
        clumps.push([
          crown.clone().add(canopyV3(Math.cos(angle) * dist, dy, Math.sin(angle) * dist)),
          rand(3.2, 4.6) * (1.1 - radial * 0.25),
        ]);
      }
      clumps.push([crown.clone().add(canopyV3(0, 4.5, 0)), 5.2]);
      clumps.forEach(([pos, size], i) => {
        const clump = weld(new IcosahedronGeometry(1, 3));
        const position = clump.attributes.position;
        for (let j = 0; j < position.count; j++) {
          const x = position.getX(j);
          const y = position.getY(j);
          const z = position.getZ(j);
          const bump =
            1 +
            0.16 * Math.sin(x * 3.1 + i) * Math.cos(z * 2.7 - i) +
            0.1 * Math.sin(y * 4.3 + i * 2) +
            0.06 * Math.sin(x * 9.1 + z * 7.3 + i);
          position.setXYZ(j, x * bump, y * bump * 0.74 - (y < 0 ? y * 0.18 : 0), z * bump);
        }
        clump.computeVertexNormals();
        xform(clump, pos, rand(0, CANOPY_TAU), size);
        const color = new Color(i % 7 == 0 ? 11130986 : i % 3 == 0 ? 6268997 : 7649362);
        const colors = new Float32Array(position.count * 3);
        const leafAttr = new Float32Array(position.count * 4);
        for (let j = 0; j < position.count; j++) {
          colors.set([color.r, color.g, color.b], j * 3);
          leafAttr.set([pos.x, pos.y, pos.z, 0.6 + (i % 4) * 0.2], j * 4);
        }
        clump.setAttribute('color', new BufferAttribute(colors, 3));
        clump.setAttribute('aLeaf', new BufferAttribute(leafAttr, 4));
        if (clump.getAttribute('uv')) clump.deleteAttribute('uv');
        crownGeos.push(clump);
        const dist = Math.hypot(pos.x - this.trunk.x, pos.z - this.trunk.z);
        if (i % 4 == 1 && dist > 7.5) {
          const dir = canopyV3(pos.x - this.trunk.x, 0, pos.z - this.trunk.z).normalize();
          const from = this.trunk
            .clone()
            .addScaledVector(dir, trunkRadius(23) - 0.3)
            .add(canopyV3(0, 22.8, 0));
          const elbow = this.trunk
            .clone()
            .addScaledVector(dir, 6.2)
            .add(canopyV3(0, 23.8, 0));
          const to = pos.clone().add(canopyV3(0, -size * 0.45, 0));
          const curve = new CatmullRomCurve3([
            from,
            elbow,
            elbow
              .clone()
              .lerp(to, 0.5)
              .add(canopyV3(0, 0.4, 0)),
            to,
          ]);
          const bough = new TubeGeometry(curve, 20, 1, 7, false);
          const position = bough.attributes.position;
          const center = canopyV3(0, 0, 0);
          for (let i = 0; i <= 20; i++) {
            curve.getPointAt(i / 20, center);
            const scale = 0.62 - (i / 20) * 0.42;
            for (let j = 0; j <= 7; j++) {
              const vi = i * 8 + j;
              position.setXYZ(
                vi,
                center.x + (position.getX(vi) - center.x) * scale,
                center.y + (position.getY(vi) - center.y) * scale,
                center.z + (position.getZ(vi) - center.z) * scale,
              );
            }
          }
          bough.computeVertexNormals();
          b2.rock(bough, canopyV3(0, 0, 0), undefined, undefined, bark);
        }
      });
      for (let i = 0; i < (this.low ? 8 : 14); i++) {
        const angle = (i / 14) * CANOPY_TAU + rand(-0.15, 0.15);
        const hang = crown.clone().add(canopyV3(Math.cos(angle) * rand(9, 12), -2.2, Math.sin(angle) * rand(9, 12)));
        const len = rand(3, 7);
        const pts = [
          hang,
          hang.clone().add(canopyV3(rand(-0.3, 0.3), -len * 0.5, rand(-0.3, 0.3))),
          hang.clone().add(canopyV3(rand(-0.5, 0.5), -len, rand(-0.5, 0.5))),
        ];
        const vine = new TubeGeometry(new CatmullRomCurve3(pts), 8, 0.045, 4, false);
        const position = vine.attributes.position;
        const colors = new Float32Array(position.count * 3);
        const leafAttr = new Float32Array(position.count * 4);
        const color = new Color(0x4f9a3a);
        for (let j = 0; j < position.count; j++) {
          colors.set([color.r, color.g, color.b], j * 3);
          leafAttr.set([hang.x, hang.y, hang.z, clamp((hang.y - position.getY(j)) / len, 0, 1) * 1.6], j * 4);
        }
        vine.setAttribute('color', new BufferAttribute(colors, 3));
        vine.setAttribute('aLeaf', new BufferAttribute(leafAttr, 4));
        vine.deleteAttribute('uv');
        crownGeos.push(vine);
      }
      this.motes.push({
        x: crown.x,
        y: crown.y - 8,
        z: crown.z,
        radius: 12,
        height: 10,
        count: 50,
        color: 0xfff2a0,
        size: 0.5,
        kind: 1,
      });
    }
    {
      const stump = this.P(CANOPY_HOLLOW.x, CANOPY_HOLLOW.z);
      const doorAngle = Math.atan2(this.cz - stump.z, this.cx - stump.x) + 0.9;
      const innerR = 2.45;
      const outerR = 3.35;
      const doorArc = 1.1;
      const parts = [];
      for (const [radius, sign] of [
        [outerR, 1],
        [innerR, -1],
      ]) {
        const wall = new CylinderGeometry(
          radius,
          radius * 1.08,
          3,
          28,
          4,
          true,
          Math.PI / 2 - doorAngle + doorArc / 2,
          CANOPY_TAU - doorArc,
        );
        if (sign < 0 && wall.index) {
          const array = wall.index.array;
          for (let i = 0; i < array.length; i += 3) {
            const tmp = array[i + 1];
            array[i + 1] = array[i + 2];
            array[i + 2] = tmp;
          }
          wall.computeVertexNormals();
        }
        wall.translate(0, 3 / 2 - 0.3, 0);
        displace(wall, 0.12, 0.8, radius);
        parts.push(wall);
      }
      const rim = new RingGeometry(innerR, outerR, 28, 1, -doorAngle + doorArc / 2, CANOPY_TAU - doorArc);
      rim.rotateX(-Math.PI / 2);
      rim.translate(0, 2.7, 0);
      parts.push(rim);
      for (const part of parts) b2.rock(part, stump, 0, undefined, bark);
      for (let i = 0; i < 10; i++) {
        const angle = doorAngle + doorArc / 2 + 0.12 + ((CANOPY_TAU - doorArc - 0.24) * (i + 0.5)) / 10;
        const pos = stump
          .clone()
          .add(
            canopyV3((Math.cos(angle) * 5.800000000000001) / 2, 3 / 2 - 0.3, (Math.sin(angle) * 5.800000000000001) / 2),
          );
        const rot = new Quaternion().setFromAxisAngle(canopyV3(0, 1, 0), -angle);
        this.collider(
          this.ctx.RAPIER.ColliderDesc.cuboid(0.35, 3 / 2, ((CANOPY_TAU - doorArc) * outerR) / 10 / 2 + 0.05)
            .setTranslation(pos.x, pos.y, pos.z)
            .setRotation({
              x: rot.x,
              y: rot.y,
              z: rot.z,
              w: rot.w,
            }),
          {
            kind: 'tree',
            surface: 'wood',
          },
        );
      }
      for (let i = 0; i < 9; i++) {
        const angle = rand(0, CANOPY_TAU);
        const dist = rand(0.6, 2.0500000000000003);
        const pos = stump.clone().add(canopyV3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist));
        const size = rand(0.12, 0.3);
        const stalk = new CylinderGeometry(size * 0.35, size * 0.45, size * 1.6, 6);
        dynGeos.push(dynPart(xform(stalk, pos.clone().add(canopyV3(0, size * 0.8, 0))), 15919832, 21));
        const cap = new SphereGeometry(size, 10, 6, 0, CANOPY_TAU, 0, Math.PI / 2);
        cap.scale(1, 0.6, 1);
        dynGeos.push(
          dynPart(xform(cap, pos.clone().add(canopyV3(0, size * 1.55, 0))), [10479871, 16756960, 12124080][i % 3], 21),
        );
      }
      const rockPos = stump
        .clone()
        .add(
          canopyV3(
            Math.cos(doorAngle) * 4.95 + Math.cos(doorAngle + 1.4) * 1.2,
            0,
            Math.sin(doorAngle) * 4.95 + Math.sin(doorAngle + 1.4) * 1.2,
          ),
        );
      placeBoulder(b2, rockPos.x, rockPos.z, this.groundAt(rockPos.x, rockPos.z) ?? stump.y, 1.1, rng);
      const chestPos = stump.clone().add(canopyV3(-Math.cos(doorAngle) * 0.8, 0, -Math.sin(doorAngle) * 0.8));
      this.chestDefs.push({
        id: 'canopy-hollow',
        kind: 'small',
        pos: chestPos,
        facing: Math.atan2(Math.cos(doorAngle), Math.sin(doorAngle)),
        loot: {
          hearts: 20,
          title: 'The Lost Hue’s Hoard',
          sub: 'Warm little hearts, saved just for you!',
        },
        lock: {
          prompt: 'A tiny light is missing from here…',
          toast: ['Something is missing', 'A shy little light lives here. Have you seen it?'],
        },
      });
      this.spot('canopyHollow', stump.clone().add(canopyV3(Math.cos(doorAngle) * 4.55, 0, Math.sin(doorAngle) * 4.55)));
      this.spot('canopyHollowChest', chestPos);
      this.clear.push({
        x: stump.x,
        z: stump.z,
        r: 3.75,
      });
    }
    {
      const landing = this.P(CANOPY_LANDING.x, CANOPY_LANDING.z);
      this.spot('canopyLanding', landing);
      this.spot('canopy', this.P(0, 8));
      placeLampPost(
        b2,
        this.cx + CANOPY_LANDING.x - 2.8,
        this.cz + CANOPY_LANDING.z - 3.4,
        this.G(CANOPY_LANDING.x - 2.8, CANOPY_LANDING.z - 3.4),
        rng,
        13172656,
      );
      placeLampPost(
        b2,
        this.cx + CANOPY_LANDING.x - 3,
        this.cz + CANOPY_LANDING.z + 3.4,
        this.G(CANOPY_LANDING.x - 3, CANOPY_LANDING.z + 3.4),
        rng,
        13172656,
      );
      this.clear.push({
        x: landing.x,
        z: landing.z,
        r: 4.2,
      });
      for (const [x, z, color] of [
        [16.5, 2.5, 'green'],
        [17.8, 4.8, 'green'],
        [15.2, 4.2, 'yellow'],
      ])
        this.ink.push({
          color,
          pos: this.P(x, z, -0.03),
        });
      const poolPos = this.P(CANOPY_POOL.x, CANOPY_POOL.z);
      this.pools.push({
        pos: poolPos.clone().add(canopyV3(0, 0.22, 0)),
        r: 2.3,
      });
      const angle = Math.atan2(CANOPY_POOL.z + 9, CANOPY_POOL.x + 7);
      const dir = canopyV3(0, 0, 0);
      const lip = this.main.lipAt(angle, canopyV3(0, 0, 0), dir);
      this.falls.push({
        lip,
        dir,
        width: 2.4,
        from: poolPos.clone().add(canopyV3(0, 0.22, 0)),
        drop: 48,
      });
      this.spot('canopyFall', lip.clone());
      for (let i = 0; i < 9; i++) {
        const theta = (i / 9) * CANOPY_TAU + 0.2;
        if (!(Math.abs(((theta - angle + CANOPY_TAU + Math.PI) % CANOPY_TAU) - Math.PI) < 0.5))
          placeBoulder(
            b2,
            poolPos.x + Math.cos(theta) * 2.6,
            poolPos.z + Math.sin(theta) * 2.6,
            this.groundAt(poolPos.x + Math.cos(theta) * 2.6, poolPos.z + Math.sin(theta) * 2.6) ?? poolPos.y,
            rand(0.35, 0.6),
            rng,
            false,
          );
      }
      this.clear.push(
        {
          x: poolPos.x,
          z: poolPos.z,
          r: 2.9,
        },
        {
          x: (poolPos.x + lip.x) / 2,
          z: (poolPos.z + lip.z) / 2,
          r: 1.4,
        },
      );
    }
    for (const [x, z, scale] of [
      [18, -14, 0.85],
      [22, 10, 0.8],
      [2, 22, 0.9],
      [-20, 4, 0.85],
      [-12, -18, 0.9],
      [4, -21, 0.75],
      [15, 18, 0.7],
    ])
      this.trees.push({
        x: this.cx + x,
        z: this.cz + z,
        s: scale,
        sp: 'oak',
      });
    this.trees.push(
      {
        x: this.cx - 21,
        z: this.cz - 6,
        s: 0.7,
        sp: 'oak',
      },
      {
        x: this.cx + 12,
        z: this.cz + 21,
        s: 0.65,
        sp: 'oak',
      },
    );
    for (const [x, z, size] of [
      [-22, 12, 1],
      [23, -8, 0.8],
      [-8, -23, 0.9],
      [8, 23, 0.7],
      [-18, 20, 0.8],
    ])
      placeBoulder(b2, this.cx + x, this.cz + z, this.G(x, z), size * rand(0.9, 1.2), rng);
    {
      const stonePos = this.P(12.5, -7);
      b2.stone(taperedBox(0.9, 0.6, 0.6, 0.4, 2.6), stonePos.clone().add(canopyV3(0, -0.2, 0)), 0.4, STONE.pale);
      b2.glass(crystalGeometry(0.5, 0.18), stonePos.clone().add(canopyV3(0, 2.4, 0)), 0, 10485663, 2);
      b2.box(stonePos.clone().add(canopyV3(0, 1.1, 0)), 0.45, 1.3, 0.3, 0.4);
    }
    this.motes.push({
      x: this.cx,
      y: CANOPY_CENTER.y + 0.4,
      z: this.cz,
      radius: 22,
      height: 4,
      count: 70,
      color: 0xf6ffb0,
      size: 0.4,
      kind: 2,
    });
    const dynGeo = mergeGeometries(dynGeos);
    dynGeos.forEach((geo) => geo.dispose());
    const dynMat = createDynMaterial(this.ctx, this.vit, {
      key: 'canopy',
      uniforms: this.cdU,
      vertPars: CANOPY_PARS_VERTEX,
      vertPos: CANOPY_POS_VERTEX,
      fragPars: CANOPY_PARS_FRAGMENT,
      fragColor: CANOPY_COLOR_FRAGMENT,
      side: DoubleSide,
    });
    const mesh = new Mesh(dynGeo, dynMat);
    mesh.name = 'canopy-dyn';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.far.add(mesh);
    this.owned.push(dynMat);
    const crownGeo = mergeGeometries(crownGeos);
    crownGeos.forEach((geo) => geo.dispose());
    const leafMat = createLeafMaterial(this.ctx, this.vit);
    const crownMesh = new Mesh(crownGeo, leafMat);
    crownMesh.name = 'canopy-crown';
    crownMesh.castShadow = true;
    crownMesh.receiveShadow = true;
    crownMesh.matrixAutoUpdate = false;
    this.far.add(crownMesh);
    this.owned.push(leafMat);
    {
      const group = new Group();
      group.name = 'canopy-lost-hue';
      const geometry = new PlaneGeometry(2, 2);
      this.hueMat = new ShaderMaterial({
        uniforms: {
          ...this.ctx.globals,
          uHueCol: {
            value: new Color(1, 1, 1),
          },
        },
        vertexShader: HUE_VERTEX,
        fragmentShader: HUE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geometry, this.hueMat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      group.add(mesh);
      this.owned.push(this.hueMat, geometry);
      this.hue = group;
      this.near.add(group);
      const start = this.P(HUE_STOPS[0][0], HUE_STOPS[0][1], 1.1);
      this.huePos.copy(start);
      this.hueTo.copy(start);
      this.hueFrom.copy(start);
      group.position.copy(start);
      this.spot('canopyHue', start);
    }
    this.addEnemies(
      'canopy-patrol',
      [
        {
          kind: 'smudgeling',
          pos: this.P(CANOPY_PATROL.x - 1.5, CANOPY_PATROL.z),
        },
        {
          kind: 'smudgeling',
          pos: this.P(CANOPY_PATROL.x + 1.8, CANOPY_PATROL.z + 1.2),
        },
        {
          kind: 'spitter',
          pos: this.P(CANOPY_PATROL.x + 0.5, CANOPY_PATROL.z - 2.5),
        },
        {
          kind: 'brute',
          pos: this.P(CANOPY_PATROL.x - 2, CANOPY_PATROL.z - 2),
        },
      ],
      true,
    );
    this.spot('canopyPatrol', this.P(CANOPY_PATROL.x, CANOPY_PATROL.z));
    const onPaint = (pos, color, radius) => {
      if (color === 'green')
        this.growths.forEach((growth) => {
          if (!(growth.target > 0.5))
            if (Math.hypot(pos.x - growth.bud.x, pos.z - growth.bud.z) < radius && Math.abs(pos.y - growth.bud.y) < 2.5)
              this.wake(growth);
        });
      else if (
        color === 'yellow' &&
        !this.springOn &&
        Math.hypot(pos.x - this.springPad.x, pos.z - this.springPad.z) < radius + 0.4 &&
        Math.abs(pos.y - this.springPad.y) < 2.5
      )
        this.wakeSpring();
    };
    this.listen('paint:splat', (splat) => {
      if (this.contains(splat.position)) onPaint(splat.position, splat.color, 2);
    });
    this.listen('combat:art-impact', (hit) => {
      if (this.contains(hit.position))
        if (hit.art === 'vineLash') onPaint(hit.position, 'green', 2.8);
        else if (hit.art === 'bounceOrb') onPaint(hit.position, 'yellow', 2.4);
    });
    if (this.opts.solved) {
      for (const growth of this.growths) {
        growth.target = 1;
        growth.grow = 1;
        growth.grown = true;
        growth.build();
      }
      this.cdU.uGrow.value = [1, 1, 1, 0];
      this.crownOpen = true;
      this.petal = 1;
      this.cdU.uPetal.value = 1;
      this.chests?.unlock('canopy-crown');
      this.solved.add('canopy-crown');
      this.hueStage = 3;
      this.hueFound = true;
    }
  }
  finish() {
    super.finish();
    if (this.opts.solved) {
      this.chests?.unlock('canopy-crown');
      this.chests?.unlock('canopy-hollow');
    }
  }
  wake(growth) {
    growth.target = 1;
    this.play('shrine-activate', growth.bud, 0.8);
    this.sparkle(
      growth.bud.clone().add(canopyV3(0, 0.8, 0)),
      40,
      5,
      [PAINT.green, new Color(1, 0.8, 0.9), new Color(1, 1, 0.8)],
      1.4,
      -3,
    );
    this.vit.bloom(growth.bud.x, growth.bud.z, 9, 1.8, 0.9);
    const awakeCount = this.growths.filter((growth) => growth.target > 0.5).length;
    const text =
      growth.id === 'A'
        ? 'A vine ladder grows up to the first deck!'
        : growth.id === 'B'
          ? 'Leaf steps spiral up the trunk!'
          : 'A vine ladder climbs to the crown!';
    this.toast(`The tree stirs (${awakeCount}/3)`, text, 'green');
  }
  wakeSpring() {
    this.springOn = true;
    this.play('shrine-activate', this.springPad, 0.6);
    this.sparkle(this.springPad.clone().add(canopyV3(0, 0.5, 0)), 30, 5, [PAINT.yellow, new Color(1, 1, 0.8)], 1.2, -3);
    try {
      this.ctx.paint.paintSphere(this.springPad.clone().add(canopyV3(0, 0.2, 0)), 1.4, 'yellow', 1);
    } catch {}
  }
  awaken() {
    this.crownOpen = true;
    this.awakenT = 0;
    this.chests?.unlock('canopy-crown');
    this.play('chest-appear', this.shrine, 1);
    this.play('shrine-complete', this.shrine, 0.9);
    this.swirl(this.shrine.clone().add(canopyV3(0, 1.5, 0)), 50, 3.5, new Color(1, 0.9, 0.95), 3);
    this.sparkle(
      this.shrine.clone().add(canopyV3(0, 2, 0)),
      90,
      8,
      [PAINT.red, PAINT.blue, PAINT.yellow, PAINT.green, new Color(1, 1, 1)],
      2,
      -2,
      0.18,
    );
    this.solve('canopy-crown', this.shrine, this.reach * 1.3);
    this.toast('The great tree awakens!', 'Its treetop bloom has opened — climb to the crown', 'green');
  }
  hueUpdate(dt, near) {
    const hue = this.hue;
    if (!hue || !this.hueMat) return;
    const elapsed = this.ctx.time.elapsed;
    const phase = (((elapsed * 0.35) % 4) + 4) % 4;
    const cycle = Number.isFinite(phase) ? phase : 0;
    const idx = Math.min(3, Math.max(0, Math.floor(cycle)));
    const order = ['red', 'yellow', 'green', 'blue'];
    const col = PAINT[order[idx]]
      .clone()
      .lerp(PAINT[order[(idx + 1) % 4]], cycle - idx)
      .lerp(new Color(1, 1, 1), 0.25);
    this.hueMat.uniforms.uHueCol.value.copy(col);
    if (this.hueT < 1) {
      this.hueT = Math.min(1, this.hueT + dt / 1.6);
      const ease = this.hueT * this.hueT * (3 - 2 * this.hueT);
      this.huePos.copy(this.hueFrom).lerp(this.hueTo, ease);
      this.huePos.y += Math.sin(this.hueT * Math.PI) * 3.2;
      this.huePos.x += Math.sin(this.hueT * CANOPY_TAU * 1.5) * 0.8 * (1 - this.hueT);
      this.hueTrailT -= dt;
      if (this.hueTrailT <= 0 && this.particles) {
        this.hueTrailT = 0.03;
        this.keepFx(2);
        try {
          this.particles.spawn({
            x: this.huePos.x,
            y: this.huePos.y,
            z: this.huePos.z,
            vx: (Math.random() - 0.5) * 0.6,
            vy: 0.3,
            vz: (Math.random() - 0.5) * 0.6,
            color: col.clone(),
            size: 0.16,
            life: 0.9,
            drag: 1,
            gravity: -0.4,
            bright: 2.4,
          });
        } catch {}
      }
    }
    hue.position
      .copy(this.huePos)
      .add(canopyV3(Math.sin(elapsed * 1.7) * 0.15, Math.sin(elapsed * 2.3) * 0.18, Math.cos(elapsed * 1.3) * 0.15));
    hue.visible = near && this.ctx.camera.position.distanceTo(this.huePos) < 60;
    const state = this.player?.state;
    if (!state || this.hueT < 1) return;
    const dist = Math.hypot(state.position.x - this.huePos.x, state.position.z - this.huePos.z);
    if (!this.hueFound && this.hueStage < 3) {
      if (!this.hints.hue && dist < 12 && state.mode !== 'fly') {
        this.hints.hue = true;
        this.toast('A Lost Hue!', 'A shy little colour spirit… follow it!', 'yellow');
      }
      if (dist < 6 && state.mode !== 'fly') {
        this.hueStage++;
        this.hueFrom.copy(this.huePos);
        const [x, z] = HUE_STOPS[this.hueStage];
        this.hueTo.copy(this.P(x, z, this.hueStage === 3 ? 2.3 : 1.1));
        this.hueT = 0;
        this.play('pickup', this.huePos, 0.5);
        this.sparkle(this.huePos, 16, 3, [col], 0.8, -1);
      }
    } else if (!this.hueFound && this.hueStage >= 3 && dist < 3 && Math.abs(state.position.y - this.huePos.y) < 3.5) {
      this.hueFound = true;
      this.chests?.unlock('canopy-hollow');
      this.swirl(state.position.clone().add(canopyV3(0, 1, 0)), 40, 1.6, col, 2.5);
      this.sparkle(this.huePos, 50, 5, [PAINT.red, PAINT.yellow, PAINT.green, PAINT.blue], 1.6, -2);
      this.play('secret', this.huePos, 0.9);
      this.solve('canopy-hue', this.huePos, this.reach * 0.9);
      this.toast('You found the Lost Hue!', 'It glows with joy — and shows you its little hoard', 'yellow');
    }
  }
  step(dt, near) {
    const blend = damp(2.2, dt);
    this.growths.forEach((growth, i) => {
      if (growth.target > growth.grow) {
        growth.grow = Math.min(1, growth.grow + dt / 2.6);
        if (growth.grow > 0.35 && !growth.grown) {
          growth.grown = true;
          growth.build();
        }
      }
      this.cdU.uGrow.value[i] = growth.grow;
    });
    if (!this.crownOpen && this.growths.length === 3 && this.growths.every((growth) => growth.grow >= 1)) this.awaken();
    if (this.crownOpen) this.petal = Math.min(1, this.petal + dt / 3);
    this.cdU.uPetal.value = this.petal * this.petal * (3 - 2 * this.petal);
    this.cdU.uSpring.value += (+!!this.springOn - this.cdU.uSpring.value) * blend;
    if (this.awakenT >= 0 && this.awakenT < 4) {
      this.awakenT += dt;
      this.keepFx(2);
    }
    this.hueUpdate(dt, near);
    const state = this.player?.state;
    if (near && state && state.mode !== 'fly') {
      if (
        !this.hints.landing &&
        this.visited &&
        this.growths[0] &&
        this.growths[0].target < 0.5 &&
        state.position.distanceTo(this.growths[0].bud) < 14
      ) {
        this.hints.landing = true;
        this.toast('The great tree sleeps', 'Its dormant buds glow green — wake them with Bloom', 'green');
      }
      if (!this.hints.deckB && state.position.distanceTo(this.deckB) < 3.4) {
        this.hints.deckB = true;
        if (!this.springOn)
          this.toast('The spring blossom', 'Paint it with Spring, then jump high to the next deck!', 'yellow');
      }
    }
  }
  debugState() {
    return {
      grow: this.growths.map((growth) => +growth.grow.toFixed(2)),
      spring: this.springOn,
      crown: this.crownOpen,
      petal: +this.petal.toFixed(2),
      hue: this.hueStage,
      hueFound: this.hueFound,
    };
  }
}
