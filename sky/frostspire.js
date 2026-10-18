/**
 * Frostspire and its little Floe islet: Frost paint glazes the Frost Run chute spiralling down the peak into ice for sliding, and the Frozen Giant's four seals must be melted with Ember in the order the obelisks show before it wakes and gives up its heart container.
 */
import {
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Mesh,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { PALETTE } from '../core/config.js';
import { clamp, damp, smoothstep } from '../core/math.js';
import { displace, mergeGeometries, rockGeometry, roundedBox } from '../shared/util.js';
import {
  addFacets,
  buildPath,
  closestPathPoint,
  dynPart,
  fallSheetGeometry,
  icicleGeometry,
  PAINT,
  pathHeightAt,
  peakGeometry,
  profileHeightAt,
  profileRadiusAt,
  runeParts,
  sweepPath,
  xform,
} from './realm-kit.js';
import { createDynMaterial, createIceShellMaterial } from './realm-materials.js';
import { Realm } from './realm.js';
import { crystalGeometry, faceted, STONE, taperedBox } from './ruin-parts.js';
import { placeBoulder, placeLampPost } from './ruins.js';
const frostV3 = (x2, y, z) => new Vector3(x2, y, z);
const FROST_TAU = Math.PI * 2;
const FROSTSPIRE_POS = {
  x: -116,
  z: -116,
  y: 112,
};
const PEAK_POS = {
  x: -9.5,
  z: -9.5,
};
const GIANT_PLAZA = {
  x: 10,
  z: -5,
};
const FROST_LANDING = {
  x: 11,
  z: 16,
};
const FROSTMAW_FIELD = {
  x: 21,
  z: 5,
};
const FROST_PACK_POS = {
  x: 1,
  z: 12,
};
const PEAK_PROFILE = [
  [10.2, -2.5],
  [9.6, 0.5],
  [8.9, 3.5],
  [8.3, 6.5],
  [7.7, 9.5],
  [7.2, 12.5],
  [6.7, 15.5],
  [6.3, 18.5],
  [5.9, 21.2],
  [5.65, 23.2],
  [5.5, 24.1],
  [5.35, 24.35],
  [0, 24.5],
];
const SUMMIT_H = 24.35;
const CHUTE_HW = 1.4;
const SEAL_COLORS = ['red', 'blue', 'green', 'yellow'];
const SEAL_ORDER = ['blue', 'yellow', 'green', 'red'];
const SEAL_COLOR_WORDS = {
  red: 'red',
  blue: 'blue',
  yellow: 'yellow',
  green: 'green',
};
const SEAL_ORDINALS = ['first', 'second', 'third', 'last'];
const FROSTSPIRE_ISLE = {
  id: 'frostspire',
  name: 'Frostspire',
  cx: FROSTSPIRE_POS.x,
  cz: FROSTSPIRE_POS.z,
  y: FROSTSPIRE_POS.y,
  r: 27,
  depth: 44,
  seed: 'frostspire-main',
  segs: 180,
  rings: 30,
  elong: 0.1,
  elongAngle: 0.79,
  wobble: 0.08,
  relief: 0.7,
  dome: 1.1,
  bumps: [
    {
      x: 17,
      z: -16,
      r: 6,
      h: 1.3,
    },
    {
      x: -19,
      z: 9,
      r: 6,
      h: 1,
    },
    {
      x: 22,
      z: 13,
      r: 5,
      h: 0.9,
    },
    {
      x: -1,
      z: -21,
      r: 6,
      h: 1,
    },
  ],
  flats: [
    {
      x: GIANT_PLAZA.x,
      z: GIANT_PLAZA.z,
      r: 8.8,
      soft: 3,
      pave: 0.5,
    },
    {
      x: FROST_LANDING.x,
      z: FROST_LANDING.z,
      r: 4.6,
      soft: 2.5,
      lift: 0.15,
      pave: 0.9,
    },
    {
      x: FROSTMAW_FIELD.x,
      z: FROSTMAW_FIELD.z,
      r: 5.5,
      soft: 3,
    },
    {
      x: FROST_PACK_POS.x,
      z: FROST_PACK_POS.z,
      r: 5,
      soft: 3,
    },
  ],
  paths: [
    {
      pts: [
        [FROST_LANDING.x, FROST_LANDING.z],
        [10.5, 9],
        [10, 4],
      ],
      w: 2.2,
    },
  ],
  rocky: 0.22,
  lobes: 5,
  lobeAmp: 0.32,
  grass: 0,
  taper: 1.05,
};
const FLOE_ISLE = {
  id: 'frost-floe',
  name: 'The Floe',
  cx: FROSTSPIRE_POS.x - 2.5,
  cz: FROSTSPIRE_POS.z + 42.5,
  y: 101,
  r: 8,
  depth: 17,
  seed: 'frostspire-floe',
  segs: 96,
  rings: 10,
  elong: 0.12,
  elongAngle: 0.2,
  wobble: 0.09,
  relief: 0.3,
  dome: 0.6,
  bumps: [],
  flats: [
    {
      x: 0,
      z: 0.5,
      r: 3.8,
      soft: 2,
    },
  ],
  paths: [],
  rocky: 0.2,
  lobes: 3,
  lobeAmp: 0.3,
  grass: 0,
  taper: 1.2,
};
const SEAL_MELT_PARS_VERTEX = `
uniform float uMelt[4];
`;
const SEAL_MELT_VERTEX = `
{
  float part = aFd.x;
  int k = -1;
  if (part > 0.5 && part < 4.5) k = int(part - 1.0 + 0.5);
  else if (part > 20.5 && part < 24.5) k = int(part - 21.0 + 0.5);
  if (k >= 0) {
    float m = 0.0;
    for (int i = 0; i < 4; i++) { if (i == k) m = uMelt[i]; }
    transformed.y = aFd.y + (transformed.y - aFd.y) * (1.0 - m * 0.96);
  }
}
`;
const FROSTSPIRE_PARS_FRAGMENT = `
uniform float uGlazeFrom;
uniform float uGlazeFront;
uniform float uGlazeAmt;
uniform float uGlazeMax;
uniform float uRune[4];
uniform float uObel[4];
uniform float uWake;
uniform float uGlyph;
`;
const FROSTSPIRE_FRAGMENT = `
{
  float part = vFd.x;
  vec3 c = diffuseColor.rgb;
  vec3 N = normalize(vDN);
  vec3 V = normalize(uCameraPos - vDW);
  float fr = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0);
  if (part > 9.5 && part < 11.5) {
    // the Frost Run: packed snow that glazes into glassy ice where Frost paint sweeps it
    float n = wbNoise2(vDW.xz * 1.3) * 0.6 + wbNoise2(vDW.xz * 4.1 + 3.0) * 0.4;
    vec3 snow = mix(vec3(0.8, 0.86, 0.95), vec3(0.97, 0.98, 1.0), n) * c;
    float d = abs(vFd.y - uGlazeFrom);
    float g = (1.0 - smoothstep(uGlazeFront - 2.5, uGlazeFront, d)) * uGlazeAmt;
    if (part > 10.5) g *= 0.55 * smoothstep(-0.2, 0.4, N.y);
    float streak = wbNoise2(vec2(vFd.y * 0.4, (vDW.x - vDW.z) * 2.2));
    // Frost ice is paint-magic: vivid even while the isle is still drained
    vec3 ice = mix(vec3(0.24, 0.52, 0.86), vec3(0.66, 0.88, 1.0), streak);
    c = mix(skyApplyVitRaw(snow, vDW), ice, g);
    fdRough = mix(0.88, 0.08, g);
    fdEmit += vec3(0.3, 0.6, 1.0) * g * (0.18 + fr * 0.9);
    float fw = (1.0 - smoothstep(0.0, 1.2, abs(d - uGlazeFront))) * uGlazeAmt * (1.0 - step(uGlazeMax, uGlazeFront));
    fdEmit += vec3(0.75, 0.92, 1.0) * fw * 2.0;
  } else if (part > 0.5 && part < 4.5) {
    // seal crystals
    float n = wbNoise3(vDW * 2.0);
    c = mix(c, vec3(0.86, 0.95, 1.0), fr * 0.7) * (0.85 + 0.25 * n);
    fdRough = 0.18;
    fdEmit += c * (0.14 + fr * 0.8) * vec3(0.6, 0.85, 1.0);
  } else if (part > 4.5 && part < 8.5) {
    int k = int(part - 5.0 + 0.5);
    float rg = 0.0;
    for (int i = 0; i < 4; i++) { if (i == k) rg = uRune[i]; }
    fdEmit += c * (0.2 + rg * 3.0);
  } else if (part > 11.5 && part < 15.5) {
    int k = int(part - 12.0 + 0.5);
    float og = 0.0;
    for (int i = 0; i < 4; i++) { if (i == k) og = uObel[i]; }
    fdEmit += c * (0.4 + og * 2.2) * (0.85 + 0.15 * sin(uTime * 2.0 + part));
  } else if (part > 15.5 && part < 16.5) {
    fdEmit += c * (0.15 + uWake * 3.5);
  } else if (part > 16.5 && part < 17.5) {
    fdEmit += c * uGlyph * (0.9 + 0.4 * sin(uTime * 3.0));
  } else if (part > 20.5) {
    fdRough = 0.2;
    fdEmit += vec3(0.45, 0.8, 1.0) * (0.12 + fr * 0.6);
  }
  diffuseColor.rgb = c;
}
`;
export class FrostspireRealm extends Realm {
  peak = frostV3(0, 0, 0);
  summitY = 0;
  path;
  chuteInfo = {
    kind: 'terrain',
    surface: 'snow',
  };
  fdU = {
    uMelt: {
      value: [0, 0, 0, 0],
    },
    uGlazeFrom: {
      value: 0,
    },
    uGlazeFront: {
      value: 0,
    },
    uGlazeAmt: {
      value: 0,
    },
    uGlazeMax: {
      value: 1,
    },
    uRune: {
      value: [0.35, 0.35, 0.35, 0.35],
    },
    uObel: {
      value: [0, 0, 0, 0],
    },
    uWake: {
      value: 0,
    },
    uGlyph: {
      value: 1,
    },
  };
  shell = null;
  shellMat = null;
  shellCollider = null;
  seals = [];
  obelisks = [];
  stepN = 0;
  free = false;
  shatterT = -1;
  crack = 0;
  wake = 0;
  glazed = false;
  glazeFront = 0;
  glazeAmt = 0;
  glazeUntil = 0;
  glazeToasted = false;
  hintHollow = false;
  hintSummit = false;
  wrongToastAt = -99;
  runePrompt = -1;
  giant = frostV3(0, 0, 0);
  chestPos = frostV3(0, 0, 0);
  constructor(ctx, opts) {
    super(
      ctx,
      'frostspire',
      'Frostspire',
      'The peak where winter keeps its colours',
      [FROSTSPIRE_ISLE, FLOE_ISLE],
      1,
      opts,
      4,
    );
  }
  build() {
    const b2 = this.b;
    const rng = this.r;
    const rand = (lo, hi) => lo + (hi - lo) * rng();
    this.undersides([13628671, 15005439, 11067647, 14472447], {
      roots: false,
      crystalGlow: 1.6,
    });
    this.peak = this.W(PEAK_POS.x, FROSTSPIRE_POS.y, PEAK_POS.z);
    this.summitY = FROSTSPIRE_POS.y + SUMMIT_H;
    const dynParts = [];
    const chuteHeightAt = (angle) => {
      let a = angle;
      for (; a < Math.PI;) a += FROST_TAU;
      for (; a > 2.5 * Math.PI;) a -= FROST_TAU;
      return a < Math.PI ? null : SUMMIT_H - 17.3 * ((2.5 * Math.PI - a) / (1.5 * Math.PI)) ** 1.25;
    };
    const peakGeo = peakGeometry(
      this.peak.x,
      FROSTSPIRE_POS.y,
      this.peak.z,
      PEAK_PROFILE,
      72,
      'frostspire-peak',
      1.1,
      (angle, y) => {
        if (y > 23.85) return 0;
        const chuteY = chuteHeightAt(angle);
        if (chuteY === null) return 1;
        const dy = y - chuteY;
        return dy > -4.5 && dy < 1.6 ? -0.4 : dy >= 1.6 && dy < 3 ? 0.4 : 1;
      },
      0.8,
      {
        flute: 1.3,
        ledge: 0.9,
        ledgeStep: 3.3,
      },
    );
    b2.rock(peakGeo, frostV3(0, 0, 0), undefined, undefined, [1, 0, 0, 0]);
    this.trimesh(peakGeo.clone(), {
      kind: 'rock',
      surface: 'snow',
    });
    this.surfs.push({
      k: 'fn',
      x: this.peak.x,
      z: this.peak.z,
      r: PEAK_PROFILE[0][0],
      f: (x, z) => {
        const h = profileHeightAt(PEAK_PROFILE, Math.hypot(x - this.peak.x, z - this.peak.z));
        return h === null ? null : FROSTSPIRE_POS.y + h;
      },
    });
    {
      const summit = frostV3(this.peak.x, this.summitY, this.peak.z);
      const summitCrystal = crystalGeometry(5.4, 0.62);
      b2.glass(summitCrystal, summit.clone().add(frostV3(0, -0.2, 0)), new Euler(0.04, 0.3, -0.05), 12580095, 3.2);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * FROST_TAU + 0.4;
        const len = rand(1.4, 2.8);
        b2.glass(
          crystalGeometry(len, len * 0.15),
          summit.clone().add(frostV3(Math.cos(angle) * 0.75, -0.2, Math.sin(angle) * 0.75)),
          new Euler(Math.cos(angle) * 0.35, rand(0, FROST_TAU), -Math.sin(angle) * 0.35, 'YXZ'),
          i % 2 ? 14217471 : 11069183,
          2.4,
        );
      }
      this.b.cyl(summit.clone().add(frostV3(0, 1.3, 0)), 1.3, 0.75, undefined, {
        kind: 'structure',
        surface: 'ice',
      });
      for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * FROST_TAU;
        if (
          Math.abs(((angle - Math.PI / 2 + FROST_TAU) % FROST_TAU) - 0) < 0.5 ||
          Math.abs(((angle - Math.PI / 2 + FROST_TAU) % FROST_TAU) - FROST_TAU) < 0.5
        )
          continue;
        const pebble = rockGeometry(0.34, i * 3.1, 0.7);
        b2.rock(
          pebble,
          summit.clone().add(frostV3(Math.cos(angle) * 2.75, 0.02, Math.sin(angle) * 2.75)),
          rng() * FROST_TAU,
        );
      }
      this.surfs.push({
        k: 'disc',
        x: this.peak.x,
        z: this.peak.z,
        r: 3,
        y: this.summitY,
      });
      this.spot('frostspireSummit', frostV3(this.peak.x - 1.6, this.summitY, this.peak.z - 1.2));
      this.vit.restore(summit.x, summit.z, 4.5, 1, 0.3);
      this.puffs.push(
        {
          c: summit.clone().add(frostV3(0.5, 1.2, 0)),
          size: 3.2,
          kind: 3,
          op: 0.3,
        },
        {
          c: summit.clone().add(frostV3(-0.6, 0.8, 0.4)),
          size: 3.8,
          kind: 3,
          op: 0.26,
        },
      );
      this.motes.push({
        x: summit.x,
        y: summit.y + 0.5,
        z: summit.z,
        radius: 5,
        height: 7,
        count: 34,
        color: 0xcff4ff,
        size: 0.55,
        kind: 0,
      });
    }
    [
      [-9.5, -20.5, 7.5],
      [-17.5, -16.5, 5.5],
      [-1.5, -18.8, 4.2],
      [-4, -22.5, 3.2],
      [-20.5, -9, 3.6],
      [-14, -21, 3.4],
      [23, -9, 3],
    ].forEach(([x, z, h], i) => {
      const spike = crystalGeometry(h, h * 0.22, 0.34, 5);
      displace(spike, h * 0.03, 0.7, i * 3.3);
      const angle = Math.atan2(z - PEAK_POS.z, x - PEAK_POS.x);
      const tilt = new Euler(Math.sin(angle) * 0.28, rng() * FROST_TAU, -Math.cos(angle) * 0.28, 'YXZ');
      const base = this.P(x, z, -0.6);
      b2.rock(spike, base, tilt, undefined, [1, 0, 0, 0]);
      const proxy = new CylinderGeometry(h * 0.16, h * 0.22, h * 0.8, 6);
      proxy.translate(0, h * 0.4, 0);
      xform(proxy, base, tilt);
      b2.hull(
        proxy,
        {
          kind: 'rock',
          surface: 'rock',
        },
        24,
      );
      proxy.dispose();
      this.clear.push({
        x: base.x,
        z: base.z,
        r: h * 0.25,
      });
    });
    {
      const hw = CHUTE_HW;
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const f = i / 120;
        const angle = 2.5 * Math.PI - f * 1.5 * Math.PI;
        const h = SUMMIT_H - 17.3 * f ** 1.25;
        const rad = profileRadiusAt(PEAK_PROFILE, h) + hw - 0.15;
        pts.push(
          frostV3(this.peak.x + Math.cos(angle) * rad, FROSTSPIRE_POS.y + h, this.peak.z + Math.sin(angle) * rad),
        );
      }
      const spiralEnd = pts[120];
      const lipN = frostV3(0, 0, 0);
      const angle = Math.atan2(25.8, -7.8);
      const lip = this.main.lipAt(angle, frostV3(0, 0, 0), lipN);
      const dir = frostV3(lip.x - spiralEnd.x, 0, lip.z - spiralEnd.z).normalize();
      const launch = lip.clone().addScaledVector(dir, 0.7);
      const drop = 5.2;
      const slopePt = (u, k) =>
        frostV3(
          spiralEnd.x + (launch.x - spiralEnd.x) * u,
          spiralEnd.y - drop * k,
          spiralEnd.z + (launch.z - spiralEnd.z) * u,
        );
      const ctrl = [
        spiralEnd.clone(),
        frostV3(spiralEnd.x + 0.2, spiralEnd.y - drop * 0.14, spiralEnd.z + 5),
        slopePt(0.4, 0.45),
        slopePt(0.7, 0.75),
        launch
          .clone()
          .addScaledVector(dir, -5)
          .setY(spiralEnd.y - drop * 0.9),
        launch.clone().setY(spiralEnd.y - drop),
      ];
      const curve = new CatmullRomCurve3(ctrl, false, 'centripetal');
      const segs = Math.max(24, Math.round(curve.getLength() / 0.6));
      const spacedPoints = curve.getSpacedPoints(segs);
      for (let i = 1; i < spacedPoints.length; i++) {
        const p = spacedPoints[i];
        const gy = this.groundAt(p.x, p.z) ?? p.y;
        p.y = Math.max(p.y, gy + 0.35);
        pts.push(p);
      }
      const path = buildPath(pts);
      this.path = path;
      const gapAt = path.len[120] + (path.total - path.len[120]) * 0.42;
      let gapI = 120;
      for (; gapI < path.len.length - 1 && path.len[gapI] < gapAt;) gapI++;
      const gapFade = (i) => smoothstep(1.3, 2.3, Math.abs(path.len[i] - gapAt));
      const spiralK = (i) => (i <= 120 ? 1 : 1 - smoothstep(0, 10, i - 120));
      const side = frostV3(0, 0, 0);
      const up = frostV3(0, 1, 0);
      const depthAt = (i2, off) => {
        const p = path.pts[i2];
        const tan = path.tan[i2];
        side.set(tan.x, 0, tan.z).normalize().cross(up).normalize();
        const x = p.x + side.x * off;
        const z = p.z + side.z * off;
        const floor = Math.max(
          this.groundAt(x, z) ?? p.y - 3,
          profileHeightAt(PEAK_PROFILE, Math.hypot(x - this.peak.x, z - this.peak.z)) === null
            ? -1000000000
            : FROSTSPIRE_POS.y + (profileHeightAt(PEAK_PROFILE, Math.hypot(x - this.peak.x, z - this.peak.z)) ?? 0),
        );
        return clamp(p.y - floor + 0.5, 0.6, 14);
      };
      const blendProfile = (rock, free, k) =>
        rock.map(([x, y], j) => [x * k + free[j][0] * (1 - k), y * k + free[j][1] * (1 - k)]);
      const chuteGeo = sweepPath(
        path,
        (i2) => {
          const k = spiralK(i2);
          const lipH = i2 <= 120 ? 0.6 * smoothstep(6, 18, i2) : 0.6;
          const rockIn = [
            [-1.4 - 1.7, -2.8],
            [-1.9, lipH - 0.05],
            [-1.48, lipH],
            [-1.4, 0],
          ];
          const rockOut = [
            [hw, 0],
            [1.5, 1],
            [1.95, 1.1],
            [2.12, -0.8],
            [-1.9, -4.4],
          ];
          const depthIn = depthAt(i2, -2);
          const depthOut = depthAt(i2, 2.0999999999999996);
          const wallK = i2 > 120 ? gapFade(i2) : 1;
          const freeIn = [
            [-2.02, -depthIn],
            [-1.95, 0.85 * wallK],
            [-1.5, 0.9 * wallK],
            [-1.4, 0],
          ];
          const freeOut = [
            [hw, 0],
            [1.5, 0.95],
            [1.95, 1],
            [2.02, Math.max(-0.3, -depthOut + 0.2)],
            [2.12, -depthOut],
          ];
          return [
            blendProfile(rockIn, freeIn, k),
            [
              [-1.4, 0],
              [0, -0.1],
              [hw, 0],
            ],
            blendProfile(rockOut, freeOut, k),
          ];
        },
        (i, strip) => [strip === 1 ? 10 : 11, path.len[i]],
        (i, strip, k) =>
          strip === 1 ? new Color(0.95, 0.97, 1) : k >= 3 ? new Color(0.86, 0.9, 0.97) : new Color(0.92, 0.95, 1),
      );
      dynParts.push(chuteGeo);
      this.trimesh(chuteGeo.clone(), this.chuteInfo);
      this.fdU.uGlazeMax.value = path.total + 3;
      this.surfs.push({
        k: 'fn',
        x: this.peak.x + 4,
        z: this.peak.z + 16,
        r: 46,
        f: (x, z) => pathHeightAt(path, x, z, 1.48, 2),
      });
      {
        const p = path.pts[4];
        const tan = path.tan[4];
        const angle = Math.atan2(tan.x, tan.z);
        for (const part of runeParts('blue')) {
          part.scale(1.6, 1.6, 1.6);
          part.rotateX(-Math.PI / 2);
          xform(part, p.clone().add(frostV3(0, 0.06, 0)), angle);
          dynParts.push(dynPart(part, PALETTE.blue.hex, 17));
        }
      }
      for (let dist = 8; dist < path.total - 4; dist += 9) {
        let k = 0;
        for (; k < path.len.length - 1 && path.len[k] < dist;) k++;
        const p = path.pts[k];
        const tan = path.tan[k];
        side.set(tan.x, 0, tan.z).normalize().cross(up).normalize();
        const post = p
          .clone()
          .addScaledVector(side, 1.75)
          .add(frostV3(0, 1, 0));
        b2.stone(taperedBox(0.22, 0.22, 0.16, 0.16, 1.2), post, Math.atan2(tan.x, tan.z), 10126962);
        b2.glass(new OctahedronGeometry(0.16, 0), post.clone().add(frostV3(0, 1.35, 0)), 0, 10478847, 2.6);
      }
      {
        const p2 = path.pts[gapI];
        const tan = path.tan[gapI];
        side.set(tan.x, 0, tan.z).normalize().cross(up).normalize();
        const out = side.clone().negate();
        const rampTop = p2.clone().addScaledVector(out, 1.7);
        let reach = 3;
        let gy = rampTop.y;
        for (; reach < 16; reach += 0.25) {
          const probe = rampTop.clone().addScaledVector(out, reach);
          gy = this.groundAt(probe.x, probe.z) ?? gy;
          if (rampTop.y - gy <= reach * Math.tan((20 * Math.PI) / 180)) break;
        }
        const rampFoot = rampTop.clone().addScaledVector(out, reach);
        rampFoot.y = gy;
        const mid = rampTop.clone().lerp(rampFoot, 0.5);
        const len = rampTop.distanceTo(rampFoot);
        const yaw = Math.atan2(out.x, out.z);
        const pitch = Math.atan2(rampTop.y - rampFoot.y, reach);
        const rot = new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, 'YXZ'));
        b2.box(mid.clone().add(frostV3(0, -0.12, 0)), 1.25, 0.12, len / 2 + 0.3, rot, {
          kind: 'structure',
          surface: 'wood',
        });
        const planks = Math.max(4, Math.round(len / 0.42));
        for (let i = 0; i < planks; i++) {
          const f = (i + 0.5) / planks;
          const at = rampTop.clone().lerp(rampFoot, f);
          b2.stone(
            roundedBox(2.4, 0.12, 0.38, 0.03, 1),
            at.add(frostV3(0, 0.02, 0)),
            new Euler(pitch, yaw, 0, 'YXZ'),
            [10122322, 8806463, 11108960][i % 3],
          );
        }
        const across = frostV3(out.z, 0, -out.x);
        for (const off of [-1.25, 1.25]) {
          for (const f of [0.08, 0.5, 0.92]) {
            const post = rampTop.clone().lerp(rampFoot, f).addScaledVector(across, off);
            b2.stone(taperedBox(0.14, 0.14, 0.12, 0.12, 1), post, yaw, 8806463);
          }
          b2.stone(
            roundedBox(0.1, 0.1, len, 0.03, 1),
            mid
              .clone()
              .addScaledVector(across, off)
              .add(frostV3(0, 0.95, 0)),
            new Euler(pitch, yaw, 0, 'YXZ'),
            10122322,
          );
        }
        this.surfs.push({
          k: 'ramp',
          x0: rampFoot.x,
          z0: rampFoot.z,
          y0: rampFoot.y,
          x1: rampTop.x,
          z1: rampTop.z,
          y1: rampTop.y,
          hw: 1.2,
        });
        this.spot('frostspireBoardwalk', rampFoot);
      }
      const chuteEnd = path.pts[Math.max(0, path.pts.length - 8)];
      this.spot('frostspireChute', chuteEnd);
      this.spot('frostspireChuteTop', path.pts[6]);
    }
    const plaza = this.P(GIANT_PLAZA.x, GIANT_PLAZA.z);
    {
      const floorY = plaza.y;
      const giant = this.W(GIANT_PLAZA.x, floorY, GIANT_PLAZA.z - 3.8);
      this.giant.copy(giant);
      const at = (x, y, z) => giant.clone().add(frostV3(x, y, z));
      const tones = [14147046, 13226461, 14870252];
      const block = (w, h, d, pos, rot, color) => {
        const geo = roundedBox(w, h, d, Math.min(w, h, d) * 0.3, 1.2);
        displace(geo, 0.05, 1.1, pos.x + pos.z);
        b2.stone(geo, pos, rot, color);
        return geo;
      };
      const limb = (from, to, rad, color) => {
        const len = from.distanceTo(to);
        const geometry = new CapsuleGeometry(rad, Math.max(0.01, len - rad * 0.6), 4, 10);
        displace(geometry, 0.04, 1.3, len);
        const rot = new Quaternion().setFromUnitVectors(frostV3(0, 1, 0), to.clone().sub(from).normalize());
        b2.stone(geometry, from.clone().lerp(to, 0.5), rot, color);
      };
      for (const side of [-1, 1]) {
        block(1.15, 0.95, 2.9, at(side * 1.3, 0.45, -0.4), new Euler(0, 0, 0), tones[1]);
        block(1.25, 1.25, 2.3, at(side * 1.25, 1.5, 0.1), new Euler(-0.62, side * 0.05, 0), tones[0]);
        const shoulder = at(side * 2.15, 4.85, -0.55);
        const elbow = at(side * 2.45, 2.65, 1.25);
        const wrist = at(side * 1.75, 0.7, 2.95);
        limb(shoulder, elbow, 0.62, tones[0]);
        limb(elbow, wrist, 0.52, tones[2]);
        block(1.1, 0.42, 1.5, at(side * 1.6, 0.22, 3.55), new Euler(0, side * -0.25, 0), tones[2]);
        for (let i = 0; i < 4; i++) {
          const finger = new CapsuleGeometry(0.13, 0.45, 3, 6);
          b2.stone(
            finger,
            at(side * (1.25 + i * 0.24), 0.45, 4.25 - Math.abs(i - 1.5) * 0.08),
            new Euler(0.9, 0, side * 0.2),
            tones[1],
          );
        }
      }
      block(3.4, 3.1, 2.1, at(0, 3.25, -0.9), new Euler(0.18, 0, 0), tones[0]);
      block(4.1, 1.25, 2.2, at(0, 4.85, -0.5), new Euler(0.22, 0, 0), tones[2]);
      block(1.65, 1.75, 1.6, at(0, 6.05, 0.1), new Euler(0.35, 0, 0), tones[1]);
      const beret = new CylinderGeometry(1.05, 1.15, 0.36, 18);
      b2.stone(beret, at(0.18, 6.95, -0.05), new Euler(0.25, 0, -0.18), 11043482);
      const beretNub = new SphereGeometry(0.14, 8, 6);
      b2.stone(beretNub, at(0.3, 7.2, -0.05), undefined, 11043482);
      for (const side of [-1, 1]) {
        const eye = new SphereGeometry(0.17, 10, 8);
        dynParts.push(dynPart(xform(eye, at(side * 0.38, 6.05, 0.86)), 10479871, 16));
      }
      {
        const handleFoot = at(4.3, -0.2, -2.4);
        const handleTop = at(2.8, 7.4, -0.9);
        const handle = new CylinderGeometry(0.16, 0.2, handleFoot.distanceTo(handleTop), 10);
        const rot = new Quaternion().setFromUnitVectors(
          frostV3(0, 1, 0),
          handleTop.clone().sub(handleFoot).normalize(),
        );
        b2.rock(handle, handleFoot.clone().lerp(handleTop, 0.5), rot, undefined, [0, 0, 0, 1]);
        const bristles = new ConeGeometry(0.55, 1.5, 12);
        bristles.rotateX(Math.PI);
        b2.stone(bristles, handleTop.clone().add(frostV3(-0.12, 0.5, 0.08)), rot, 15328474);
        const ferrule = new CylinderGeometry(0.28, 0.24, 0.5, 12);
        b2.stone(ferrule, handleTop.clone(), rot, 13017690);
      }
      b2.box(at(0, 3.4, -0.8), 1.8, 3.4, 1.3, new Euler(0.18, 0, 0));
      for (const side of [-1, 1]) b2.box(at(side * 1.3, 0.8, -0.2), 0.6, 0.8, 1.6);
      b2.cyl(at(4, 3, -2.2), 3, 0.3, new Euler(0.2, 0, 0.18));
      this.clear.push({
        x: giant.x,
        z: giant.z,
        r: 4,
      });
      this.chestPos = this.W(GIANT_PLAZA.x, floorY, GIANT_PLAZA.z - 3.8 + 4.2);
      this.chestPos.y = this.G(GIANT_PLAZA.x, GIANT_PLAZA.z + 0.4);
      this.chestDefs.push({
        id: 'frost-giant',
        kind: 'heart',
        pos: this.chestPos.clone(),
        facing: 0,
        loot: {
          item: 'heartContainer',
        },
        lock: {
          prompt: 'Frozen in the giant’s ice',
          toast: ['The Frozen Giant', 'Melt its four seals with Ember — the obelisks show the order'],
        },
      });
      this.spot('frostspireChest', this.chestPos);
      this.spot('frostspireGiant', this.W(GIANT_PLAZA.x, floorY, GIANT_PLAZA.z + 4.5));
      const shellC = at(0, 3.1, 1.2);
      const shellCore = new IcosahedronGeometry(1, 3);
      const position = shellCore.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const wobble = 1 + 0.1 * Math.sin(x * 5.1 + y * 3.3) + 0.08 * Math.sin(z * 6.7 - x * 2.1);
        position.setXYZ(i, x * 4.05 * wobble, y * 4.35 * wobble, z * 4.15 * wobble);
      }
      shellCore.translate(shellC.x, shellC.y, shellC.z);
      const shellParts = [shellCore];
      for (let i = 0; i < 9; i++) {
        const yaw = (i / 9) * FROST_TAU + rand(-0.2, 0.2);
        const pitch = rand(0.25, 0.9);
        const dir = frostV3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
        const len = rand(1.6, 3.2);
        const spike = crystalGeometry(len, len * 0.16);
        const rot = new Quaternion().setFromUnitVectors(frostV3(0, 1, 0), dir);
        xform(spike, shellC.clone().add(frostV3(dir.x * 3.4, dir.y * 3.7, dir.z * 3.5)), rot);
        shellParts.push(spike);
      }
      const shellGeo = addFacets(mergeGeometries(shellParts.map((g) => (g.index ? g.toNonIndexed() : g))), rng);
      this.shellMat = createIceShellMaterial(this.ctx, shellC);
      this.shell = new Mesh(shellGeo, this.shellMat);
      this.shell.name = 'frostspire-shell';
      this.shell.renderOrder = 4;
      this.near.add(this.shell);
      this.owned.push(this.shellMat);
      const hullPts = [];
      const corePos = shellCore.attributes.position;
      for (let i = 0; i < corePos.count; i += 3) hullPts.push(corePos.getX(i), corePos.getY(i), corePos.getZ(i));
      const hullDesc = this.ctx.RAPIER.ColliderDesc.convexHull(new Float32Array(hullPts));
      if (hullDesc)
        this.shellCollider = this.collider(hullDesc, {
          kind: 'structure',
          surface: 'ice',
        });
      shellParts.forEach((g) => g.dispose());
      [-0.75 * Math.PI, -0.25 * Math.PI, 0.25 * Math.PI, 0.75 * Math.PI].forEach((angle, i) => {
        const sx = GIANT_PLAZA.x + Math.cos(angle) * 6.2;
        const sz = GIANT_PLAZA.z + Math.sin(angle) * 6.2;
        const baseY = this.G(sx, sz);
        const pos = this.W(sx, baseY, sz);
        const color = SEAL_COLORS[i];
        const plinth = new CylinderGeometry(1.05, 1.2, 0.5, 14);
        b2.stone(displace(faceted(plinth), 0.03, 1.4, i), pos.clone().add(frostV3(0, 0.1, 0)), 0, STONE.sky);
        b2.cyl(pos.clone().add(frostV3(0, 0.15, 0)), 0.2, 1.15);
        const topY = baseY + 0.35;
        const tint = new Color(0xcfe8ff).lerp(new Color(PALETTE[color].hex), 0.28);
        for (let j = 0; j < 5; j++) {
          const len = j === 0 ? 2.7 : rand(1.1, 2);
          const crystalGeo = crystalGeometry(len, len * (j === 0 ? 0.2 : 0.17));
          const off = j === 0 ? frostV3(0, 0, 0) : frostV3(Math.cos(j * 1.3) * 0.45, 0, Math.sin(j * 1.3) * 0.45);
          const rot =
            j === 0
              ? new Euler(0, rng() * FROST_TAU, 0)
              : new Euler(off.z * 0.7, rng() * FROST_TAU, -off.x * 0.7, 'YXZ');
          xform(
            crystalGeo,
            pos
              .clone()
              .add(off)
              .setY(topY - 0.15),
            rot,
          );
          dynParts.push(dynPart(crystalGeo, tint, 1 + i, topY - 0.2));
        }
        const ring = new TorusGeometry(0.98, 0.07, 6, 32);
        ring.rotateX(Math.PI / 2);
        dynParts.push(dynPart(xform(ring, pos.clone().setY(baseY + 0.37)), PALETTE[color].hex, 5 + i, baseY));
        for (const part of runeParts(color, false)) {
          part.scale(0.7, 0.7, 0.7);
          part.rotateX(-Math.PI / 2);
          const yaw = Math.atan2(plaza.x - pos.x, plaza.z - pos.z) + Math.PI;
          dynParts.push(
            dynPart(
              xform(
                part,
                pos
                  .clone()
                  .setY(baseY + 0.37)
                  .add(frostV3(Math.sin(yaw) * 0.72, 0, Math.cos(yaw) * 0.72)),
                yaw,
              ),
              PALETTE[color].hex,
              5 + i,
              baseY,
            ),
          );
        }
        for (let j = 0; j < 2; j++) {
          const end = shellC.clone().add(frostV3((pos.x - shellC.x) * 0.55, 0, (pos.z - shellC.z) * 0.55));
          end.y = this.G(end.x - this.cx, end.z - this.cz) + 0.1;
          const bend = pos
            .clone()
            .lerp(end, 0.5)
            .add(frostV3(rand(-0.8, 0.8), 0.25, rand(-0.8, 0.8)));
          bend.y = this.G(bend.x - this.cx, bend.z - this.cz) + 0.2;
          const start = pos.clone().add(frostV3(0, 0.3, 0));
          const curve = new CatmullRomCurve3([start, bend, end]);
          const vein = new TubeGeometry(curve, 14, 0.12, 5, false);
          dynParts.push(dynPart(vein, 14217983, 21 + i, baseY));
        }
        const collider = this.collider(
          this.ctx.RAPIER.ColliderDesc.cylinder(1.2, 0.85).setTranslation(pos.x, topY + 1.2, pos.z),
          {
            kind: 'structure',
            surface: 'ice',
          },
        );
        this.seals.push({
          color,
          pos,
          base: baseY,
          collider,
          target: 0,
          cool: 0,
          pendingCollider: false,
        });
        this.clear.push({
          x: pos.x,
          z: pos.z,
          r: 1.4,
        });
      });
      [150, 115, 65, 30].forEach((deg, i) => {
        const angle = (deg * Math.PI) / 180;
        const ox = GIANT_PLAZA.x + Math.cos(angle) * 9.5;
        const oz = GIANT_PLAZA.z + Math.sin(angle) * 9.5;
        const gy = this.G(ox, oz);
        const pos = this.W(ox, gy, oz);
        const yaw = Math.atan2(plaza.x - pos.x, plaza.z - pos.z) + Math.PI;
        const shaftH = 4.4;
        b2.stone(taperedBox(1.15, 1.15, 1.05, 1.05, 0.35), pos.clone().add(frostV3(0, -0.15, 0)), yaw, STONE.marble);
        b2.stone(taperedBox(0.95, 0.95, 0.55, 0.55, shaftH), pos.clone().add(frostV3(0, 0.15, 0)), yaw, STONE.pale);
        b2.stone(taperedBox(0.62, 0.62, 0.02, 0.02, 0.75), pos.clone().add(frostV3(0, 4.5, 0)), yaw, STONE.marble);
        b2.box(pos.clone().add(frostV3(0, shaftH / 2, 0)), 0.45, shaftH / 2, 0.45, yaw);
        const face = frostV3(Math.sin(yaw), 0, Math.cos(yaw));
        const color = SEAL_ORDER[i];
        for (const part of runeParts(color)) {
          part.scale(0.62, 0.62, 0.62);
          dynParts.push(
            dynPart(
              xform(
                part,
                pos
                  .clone()
                  .add(frostV3(0, 2.9, 0))
                  .addScaledVector(face, 0.3931818181818182),
                yaw,
              ),
              PALETTE[color].hex,
              12 + i,
            ),
          );
        }
        for (let j = 0; j <= i; j++) {
          const pip = new SphereGeometry(0.085, 8, 6);
          const y = 1.65 - j * 0.26;
          const inset = (0.95 + (y / shaftH) * (0.55 - 0.95)) / 2 + 0.04;
          dynParts.push(
            dynPart(
              xform(
                pip,
                pos
                  .clone()
                  .add(frostV3(0, y, 0))
                  .addScaledVector(face, inset),
              ),
              15398655,
              12 + i,
            ),
          );
        }
        this.obelisks.push({
          pos,
          n: i,
        });
        this.clear.push({
          x: pos.x,
          z: pos.z,
          r: 1.2,
        });
      });
      this.vit.restore(plaza.x, plaza.z, 3, 0.35, 0.5);
    }
    {
      const landing = this.P(FROST_LANDING.x, FROST_LANDING.z);
      this.spot('frostspireLanding', landing);
      this.spot('frostspire', this.P(0, 0));
      placeLampPost(
        b2,
        this.cx + FROST_LANDING.x - 3.2,
        this.cz + FROST_LANDING.z - 3,
        this.G(FROST_LANDING.x - 3.2, FROST_LANDING.z - 3),
        rng,
        12577535,
      );
      placeLampPost(
        b2,
        this.cx + FROST_LANDING.x + 3.3,
        this.cz + FROST_LANDING.z - 2.6,
        this.G(FROST_LANDING.x + 3.3, FROST_LANDING.z - 2.6),
        rng,
        12577535,
      );
      for (let i = 0; i < 4; i++) {
        const angle = Math.PI * (0.15 + i * 0.2);
        const x = FROST_LANDING.x + Math.cos(angle) * 5.6;
        const z = FROST_LANDING.z + Math.sin(angle) * 5.6;
        placeBoulder(b2, this.cx + x, this.cz + z, this.G(x, z), rand(0.45, 0.75), rng);
      }
      this.clear.push({
        x: landing.x,
        z: landing.z,
        r: 4.6,
      });
      for (const [x, z, color] of [
        [5.8, 17.4, 'red'],
        [6.8, 20.2, 'red'],
        [4.6, 19.6, 'red'],
        [15.8, 19.4, 'blue'],
      ])
        this.ink.push({
          color,
          pos: this.P(x, z, -0.03),
        });
    }
    for (const [x, z, s] of [
      [2, -19.5, 1],
      [7.5, -21, 0.9],
      [15, -18, 1.05],
      [21, -11, 0.85],
      [24.5, -3.5, 0.95],
      [25, 10, 0.9],
      [21.5, 16.5, 0.8],
      [-4.2, 9.8, 1],
      [-1.2, 17.6, 0.9],
      [6.2, 16.2, 0.75],
      [5.4, 7.4, 0.85],
      [16.8, 22.2, 0.8],
      [-2, -17.5, 0.8],
    ])
      this.trees.push({
        x: this.cx + x,
        z: this.cz + z,
        s: s * 0.95,
        sp: 'pine',
      });
    for (const [x, z, s] of [
      [18, -7, 1.1],
      [-3, 21, 0.9],
      [26, 1, 0.8],
      [13, -21, 0.9],
      [-6, -20, 1.2],
      [19, 20, 0.7],
    ])
      placeBoulder(b2, this.cx + x, this.cz + z, this.G(x, z), s * rand(0.9, 1.2), rng);
    for (const angle of [-1.38, -0.42]) {
      const out = frostV3(0, 0, 0);
      const lip = this.main.lipAt(angle, frostV3(0, 0, 0), out);
      const sheet = fallSheetGeometry(lip.clone().add(frostV3(0, 0.15, 0)), out, 2.6, 30, 24, 7, 1.2, 0.5);
      b2.glass(faceted(sheet), frostV3(0, 0, 0), undefined, 14086399, 0.55);
      const pond = lip.clone().addScaledVector(out, -2.4);
      pond.y = (this.groundAt(pond.x, pond.z) ?? pond.y) + 0.04;
      const geometry = new CylinderGeometry(2.1, 2.1, 0.08, 20);
      b2.glass(faceted(geometry), pond, 0, 13167871, 0.45);
      this.clear.push({
        x: pond.x,
        z: pond.z,
        r: 2.4,
      });
      for (let i = 0; i < 7; i++) {
        const icicleGeo = icicleGeometry(rand(0.12, 0.22), rand(1.2, 3.2), i);
        b2.glass(
          icicleGeo,
          lip
            .clone()
            .addScaledVector(out, 0.3)
            .add(frostV3(rand(-1.4, 1.4) * out.z, -0.4, rand(-1.4, 1.4) * -out.x)),
          rng() * FROST_TAU,
          14742783,
          0.4,
        );
      }
    }
    for (const isle of this.isles) {
      const count = Math.round(isle.def.r * 1.9);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * FROST_TAU + rand(-0.05, 0.05);
        const at = isle.undersideAt(angle, 1 + Math.floor(rng() * 2), frostV3(0, 0, 0));
        b2.glass(
          icicleGeometry(rand(0.1, 0.24), rand(0.8, 2.8), i),
          at.add(frostV3(0, 0.2, 0)),
          rng() * FROST_TAU,
          15136511,
          0.35,
        );
      }
    }
    {
      const floe = this.isles[1];
      const center = frostV3(floe.cx, this.groundAt(floe.cx, floe.cz) ?? floe.def.y, floe.cz);
      this.spot('frostspireFloe', center);
      const snowman = frostV3(floe.cx - 3, this.groundAt(floe.cx - 3, floe.cz + 2.2) ?? center.y, floe.cz + 2.2);
      const snow = 15922682;
      b2.stone(new SphereGeometry(0.85, 16, 12), snowman.clone().add(frostV3(0, 0.65, 0)), 0, snow);
      b2.stone(new SphereGeometry(0.62, 16, 12), snowman.clone().add(frostV3(0, 1.75, 0)), 0, snow);
      b2.stone(new SphereGeometry(0.44, 14, 10), snowman.clone().add(frostV3(0, 2.6, 0)), 0, snow);
      const angle = Math.atan2(this.cx - snowman.x, this.cz - snowman.z);
      const fwd = frostV3(Math.sin(angle), 0, Math.cos(angle));
      const side = frostV3(fwd.z, 0, -fwd.x);
      for (const sign of [-1, 1])
        b2.stone(
          new SphereGeometry(0.06, 6, 5),
          snowman
            .clone()
            .add(frostV3(0, 2.72, 0))
            .addScaledVector(fwd, 0.4)
            .addScaledVector(side, sign * 0.15),
          0,
          2763312,
        );
      const nose = new ConeGeometry(0.07, 0.42, 8);
      nose.rotateX(Math.PI / 2);
      b2.glass(
        nose,
        snowman
          .clone()
          .add(frostV3(0, 2.6, 0))
          .addScaledVector(fwd, 0.58),
        angle,
        16747066,
        0.6,
      );
      const hat = new CylinderGeometry(0.3, 0.26, 0.42, 14);
      b2.stone(hat, snowman.clone().add(frostV3(0, 3.18, 0)), new Euler(0, 0, 0.15), 13003354);
      b2.glass(
        new SphereGeometry(0.12, 8, 6),
        snowman.clone().add(frostV3(0.12, 3.02, 0.22)),
        0,
        PALETTE.blue.hex,
        1.2,
      );
      for (const sign of [-1, 1]) {
        const arm = new CylinderGeometry(0.035, 0.05, 1.1, 5);
        arm.rotateZ(sign * 0.8);
        b2.rock(
          arm,
          snowman
            .clone()
            .add(frostV3(0, 1.85, 0))
            .addScaledVector(side, sign * 0.9),
          angle,
          undefined,
          [0, 0, 0, 1],
        );
      }
      b2.cyl(snowman.clone().add(frostV3(0, 1.4, 0)), 1.4, 0.75);
      this.clear.push({
        x: snowman.x,
        z: snowman.z,
        r: 1.2,
      });
      const cachePos = frostV3(floe.cx + 1.6, 0, floe.cz - 1.4);
      cachePos.y = this.groundAt(cachePos.x, cachePos.z) ?? center.y;
      this.chestDefs.push({
        id: 'frost-floe',
        kind: 'small',
        pos: cachePos,
        facing: Math.atan2(this.cx - cachePos.x, this.cz - cachePos.z),
        loot: {
          ink: true,
          title: 'Frost Run Cache',
          sub: 'A gift for brave sliders — every colour of ink is full!',
        },
      });
      this.spot('frostspireFloeChest', cachePos);
      this.trees.push({
        x: floe.cx + 3.2,
        z: floe.cz - 2.4,
        s: 0.6,
        sp: 'pine',
      });
    }
    this.motes.push({
      x: this.cx,
      y: FROSTSPIRE_POS.y + 0.5,
      z: this.cz,
      radius: 24,
      height: 12,
      count: 150,
      color: 0xe2f4ff,
      size: 0.45,
      kind: 0,
    });
    const dynGeo = mergeGeometries(dynParts);
    dynParts.forEach((g) => g.dispose());
    const dynMat = createDynMaterial(this.ctx, this.vit, {
      key: 'frost',
      uniforms: this.fdU,
      vertPars: SEAL_MELT_PARS_VERTEX,
      vertPos: SEAL_MELT_VERTEX,
      fragPars: FROSTSPIRE_PARS_FRAGMENT,
      fragColor: FROSTSPIRE_FRAGMENT,
    });
    const mesh = new Mesh(dynGeo, dynMat);
    mesh.name = 'frostspire-dyn';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.far.add(mesh);
    this.owned.push(dynMat);
    this.addEnemies(
      'frost-pack',
      [
        {
          kind: 'smudgeling',
          pos: this.P(FROST_PACK_POS.x - 1, FROST_PACK_POS.z - 1.5),
        },
        {
          kind: 'smudgeling',
          pos: this.P(FROST_PACK_POS.x + 2, FROST_PACK_POS.z + 0.5),
        },
        {
          kind: 'spitter',
          pos: this.P(FROST_PACK_POS.x - 1.5, FROST_PACK_POS.z + 2.5),
        },
      ],
      true,
    );
    this.addEnemies(
      'frostmaw',
      [
        {
          kind: 'brute',
          pos: this.P(FROSTMAW_FIELD.x, FROSTMAW_FIELD.z),
          facing: Math.atan2(FROST_LANDING.x - FROSTMAW_FIELD.x, FROST_LANDING.z - FROSTMAW_FIELD.z),
          elite: {
            name: 'Frostmaw',
            element: 'blue',
          },
        },
      ],
      false,
    );
    this.spot('frostspireField', this.P(FROSTMAW_FIELD.x, FROSTMAW_FIELD.z));
    this.listen('paint:splat', (splat) => {
      if (this.contains(splat.position))
        if (splat.color === 'red') this.emberAt(splat.position, 2.3);
        else if (splat.color === 'blue') this.frostAt(splat.position);
    });
    this.listen('combat:art-impact', (hit) => {
      if (this.contains(hit.position) && hit.art === 'fireball') this.emberAt(hit.position, 3.4);
    });
    this.listen('fire:ignite', (ignite) => {
      if (this.contains(ignite.position)) this.emberAt(ignite.position, 2.4);
    });
    if (this.opts.solved) this.solveInstant();
  }
  emberAt(pos, radius) {
    if (!this.free)
      this.seals.forEach((seal, i) => {
        if (!(
          Math.hypot(pos.x - seal.pos.x, pos.z - seal.pos.z) > radius ||
          pos.y < seal.base - 1.5 ||
          pos.y > seal.base + 4.5
        ))
          this.hitSeal(i);
      });
  }
  hitSeal(i2) {
    const seal = this.seals[i2];
    const elapsed = this.ctx.time.elapsed;
    if (seal.target > 0.5 || elapsed < seal.cool || this.free) return;
    seal.cool = elapsed + 0.8;
    const fxAt = seal.pos.clone().add(frostV3(0, 1.6, 0));
    if (seal.color === SEAL_ORDER[this.stepN]) {
      seal.target = 1;
      this.stepN++;
      this.removeCollider(seal.collider);
      seal.collider = null;
      this.fdU.uRune.value[i2] = 1.6;
      this.sparkle(fxAt, 36, 5, [PAINT[seal.color], new Color(0.85, 0.95, 1), PAINT.red], 1.4, -3);
      this.play('shrine-activate', seal.pos, 0.9);
      this.vit.bloom(seal.pos.x, seal.pos.z, 7, 1.4, 0.8);
      if (this.stepN >= 4) this.shatterT = -1.3;
    } else {
      this.fdU.uRune.value[i2] = 2.4;
      this.sparkle(fxAt, 24, 3, [new Color(0.8, 0.92, 1), new Color(1, 1, 1)], 1, -1);
      this.play('barrier-up', seal.pos, 0.8);
      let refroze = false;
      this.seals.forEach((seal) => {
        if (seal.target > 0.5) {
          seal.target = 0;
          seal.pendingCollider = true;
          refroze = true;
          this.sparkle(seal.pos.clone().add(frostV3(0, 1.2, 0)), 16, 2.5, [new Color(0.8, 0.92, 1)], 1, -1);
        }
      });
      this.stepN = 0;
      if (elapsed - this.wrongToastAt > 8) {
        this.wrongToastAt = elapsed;
        this.toast(
          refroze ? 'The seals froze over again!' : 'The ice resists',
          `Follow the obelisks: melt the ${SEAL_COLOR_WORDS[SEAL_ORDER[0]]} seal first`,
          'blue',
        );
      }
    }
  }
  solveInstant() {
    this.stepN = 4;
    this.free = true;
    this.seals.forEach((seal) => {
      seal.target = 1;
      this.removeCollider(seal.collider);
      seal.collider = null;
    });
    this.fdU.uMelt.value = [1, 1, 1, 1];
    this.fdU.uRune.value = [1, 1, 1, 1];
    this.removeCollider(this.shellCollider);
    this.shellCollider = null;
    if (this.shell) this.shell.visible = false;
    this.wake = 1;
    this.fdU.uWake.value = 1;
    this.chests?.unlock('frost-giant');
    this.solved.add('frostspire-giant');
  }
  breakFree() {
    this.free = true;
    this.shatterT = 0;
    this.removeCollider(this.shellCollider);
    this.shellCollider = null;
    this.chests?.unlock('frost-giant');
    const center = this.giant.clone().add(frostV3(0, 3, 1.2));
    this.sparkle(
      center,
      80,
      9,
      [new Color(0.8, 0.94, 1), new Color(1, 1, 1), PAINT.blue, PAINT.red, PAINT.yellow, PAINT.green],
      1.8,
      -6,
      0.18,
    );
    this.swirl(center, 30, 4, new Color(0.9, 0.97, 1), 2.5);
    this.play('barrier-down', center, 1);
    this.play('chest-appear', this.chestPos, 0.9);
    try {
      this.ctx.events.emit('camera:shake', {
        strength: 0.6,
        position: center.clone(),
      });
    } catch {}
    this.solve('frostspire-giant', this.chestPos, this.reach * 0.9);
    this.toast('The giant wakes!', 'Its gift is yours — open the chest in its hands', 'red');
  }
  frostAt(pos) {
    const path = this.path;
    if (!path) return;
    const near = closestPathPoint(path, pos.x, pos.z, 2);
    const p = path.pts[near.i];
    if (near.d > 2.7 || Math.abs(pos.y - p.y) > 2.6) return;
    const elapsed = this.ctx.time.elapsed;
    this.glazeUntil = elapsed + 45;
    if (!this.glazed) {
      this.glazed = true;
      this.glazeFront = 0;
      this.fdU.uGlazeFrom.value = path.len[near.i];
      this.chuteInfo.surface = 'ice';
      this.play('shrine-activate', p, 0.6);
      this.sparkle(p.clone().add(frostV3(0, 0.5, 0)), 24, 4, [PAINT.blue, new Color(0.9, 0.97, 1)], 1.2, -2);
      if (!this.glazeToasted) {
        this.glazeToasted = true;
        this.toast('The Frost Run', 'The chute is ice! Slide down — and fly off the ramp at the end', 'blue');
        this.solve('frostspire-run', p, 0);
      }
    }
  }
  onChute(pos) {
    const path = this.path;
    if (!path) return false;
    const near = closestPathPoint(path, pos.x, pos.z, 2);
    return near.d < 2 && Math.abs(pos.y - path.pts[near.i].y) < 1.6;
  }
  step(dt, near) {
    const elapsed = this.ctx.time.elapsed;
    const ease = damp(3, dt);
    this.seals.forEach((seal, index) => {
      const uMelt = this.fdU.uMelt.value;
      uMelt[index] += (seal.target - uMelt[index]) * damp(seal.target > uMelt[index] ? 1.6 : 4, dt);
      const uRune = this.fdU.uRune.value;
      const glow = seal.target > 0.5 ? 1 : 0.35 + 0.1 * Math.sin(elapsed * 2 + index);
      uRune[index] += (glow - uRune[index]) * damp(2.5, dt);
      if (seal.pendingCollider && seal.target < 0.5) {
        const state = this.player?.state;
        if (!state || Math.hypot(state.position.x - seal.pos.x, state.position.z - seal.pos.z) > 1.6) {
          seal.pendingCollider = false;
          seal.collider = this.collider(
            this.ctx.RAPIER.ColliderDesc.cylinder(1.2, 0.85).setTranslation(seal.pos.x, seal.base + 1.55, seal.pos.z),
            {
              kind: 'structure',
              surface: 'ice',
            },
          );
        }
      }
    });
    const progress = this.stepN / 4;
    this.crack += (progress - this.crack) * ease;
    if (this.shellMat) this.shellMat.uniforms.uCrack.value = this.crack;
    if (this.shatterT < 0 && this.shatterT > -9 && this.stepN >= 4 && !this.free) {
      this.shatterT += dt;
      if (this.shatterT >= 0) this.breakFree();
    } else if (this.shatterT >= 0 && this.shell && this.shell.visible) {
      this.shatterT += dt;
      const shatter = clamp(this.shatterT / 1.8, 0, 1);
      if (this.shellMat) this.shellMat.uniforms.uShatter.value = shatter;
      if (shatter >= 1) this.shell.visible = false;
      this.keepFx(2);
    }
    if (this.free) this.wake = Math.min(1, this.wake + dt * 0.5);
    this.fdU.uWake.value = this.wake;
    const path = this.path;
    const state = this.player?.state;
    if (this.glazed && path) {
      this.glazeFront = Math.min(path.total + 3, this.glazeFront + dt * 38);
      this.glazeAmt = Math.min(1, this.glazeAmt + dt * 4);
      if (state && elapsed > this.glazeUntil - 1 && this.onChute(state.position)) this.glazeUntil = elapsed + 4;
      if (elapsed > this.glazeUntil) {
        this.glazed = false;
        this.chuteInfo.surface = 'snow';
      }
    } else {
      this.glazeAmt = Math.max(0, this.glazeAmt - dt * 0.5);
      if (this.glazeAmt <= 0) this.glazeFront = 0;
    }
    this.fdU.uGlazeFront.value = this.glazeFront;
    this.fdU.uGlazeAmt.value = this.glazeAmt;
    this.fdU.uGlyph.value += ((this.glazed ? 0.15 : 1) - this.fdU.uGlyph.value) * ease;
    if (!near || !state) {
      if (this.runePrompt >= 0) this.hideRune();
      return;
    }
    let nearest = -1;
    let best = 3;
    this.obelisks.forEach((obelisk, i) => {
      const dist = Math.hypot(state.position.x - obelisk.pos.x, state.position.z - obelisk.pos.z);
      const lit = +(dist < 7);
      this.fdU.uObel.value[i] += (lit - this.fdU.uObel.value[i]) * ease;
      if (dist < best && Math.abs(state.position.y - obelisk.pos.y) < 3) {
        best = dist;
        nearest = i;
      }
    });
    if (nearest !== this.runePrompt) {
      if (nearest >= 0 && !this.free) {
        const color = SEAL_ORDER[nearest];
        try {
          this.ctx.ui.showPrompt(
            'frost-rune',
            `Obelisk ${nearest + 1}: melt the ${SEAL_COLOR_WORDS[color]} seal ${SEAL_ORDINALS[nearest]}`,
          );
        } catch {}
        this.runePrompt = nearest;
      } else this.hideRune();
    }
    const dist = Math.hypot(state.position.x - this.giant.x, state.position.z - this.giant.z);
    if (
      !this.hintHollow &&
      !this.free &&
      dist < 13 &&
      Math.abs(state.position.y - this.giant.y) < 4 &&
      state.mode !== 'fly'
    ) {
      this.hintHollow = true;
      this.toast(
        'The Frozen Giant',
        'Four seals bind it. Melt them with Ember — in the order the obelisks show',
        'red',
      );
    }
    if (
      !this.hintSummit &&
      Math.hypot(state.position.x - this.peak.x, state.position.z - this.peak.z) < 3.6 &&
      Math.abs(state.position.y - this.summitY) < 2 &&
      state.mode !== 'fly'
    ) {
      this.hintSummit = true;
      if (!this.glazed)
        this.toast('The Frost Run', 'Paint the chute with Frost to turn it to ice — then slide!', 'blue');
    }
  }
  hideRune() {
    this.runePrompt = -1;
    try {
      this.ctx.ui.hidePrompt('frost-rune');
    } catch {}
  }
  debugState() {
    return {
      step: this.stepN,
      free: this.free,
      glazed: this.glazed,
      surface: this.chuteInfo.surface,
      melt: [...this.fdU.uMelt.value],
      chuteLen: this.path?.total,
    };
  }
}
