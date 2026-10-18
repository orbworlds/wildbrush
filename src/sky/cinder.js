/**
 * Cinder Isle, the volcanic side realm: a crater cone pours lava into a moat around the Ember Vault and out over the edge in lavafalls. Frost paint or an Ice Lance cools a lava section into obsidian crust for a while, so the hero can cross it and crumble the vault's lava curtain; spitters on basalt ledges and the Magmite elite guard the isle.
 */
import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Mesh,
  Vector3,
} from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
import { clamp, smoothstep } from '../core/math.js';
import { displace, mergeGeometries, rockGeometry, roundedBox } from '../shared/util.js';
import { buildPath, fallSheetGeometry, PAINT, peakGeometry, profileHeightAt, profileRadiusAt } from './realm-kit.js';
import { createLavaMaterial } from './realm-materials.js';
import { Realm } from './realm.js';
import { crystalGeometry, faceted, taperedBox } from './ruin-parts.js';
import { placeBoulder } from './ruins.js';
const cinderV3 = (x2, y, z) => new Vector3(x2, y, z);
const CINDER_TAU = Math.PI * 2;
const CINDER_POS = {
  x: 116,
  z: 116,
  y: 96,
};
const CONE_POS = {
  x: 5,
  z: -12,
};
const LAVA_MOAT = {
  x: -1,
  z: 7,
  r0: 6.6,
  r1: 10.8,
};
const CINDER_LANDING = {
  x: -19,
  z: 0,
};
const MAGMITE_POS = {
  x: -10,
  z: -8,
};
const HEARTS_PILLAR = {
  x: 18,
  z: 8,
};
const BASALT_LEDGES = [
  [-14, -12.5],
  [18, -5],
  [10.5, 14.5],
];
const BASALT_LEDGE_H = 2.8;
const BASALT_STEP_H = 0.9;
const CONE_PROFILE = [
  [9.9, -2.5],
  [9.4, 0.5],
  [8.6, 3.5],
  [7.6, 7],
  [6.4, 10.5],
  [5.2, 13.4],
  [4.5, 15.3],
  [4.2, 16.1],
  [3.7, 16.05],
  [3.1, 14.9],
  [2.3, 14.1],
  [0, 13.9],
];
const CRATER_LAVA_Y = 14.7;
const MOAT_SECS = 24;
const DRAIN_SEC0 = 24;
const DRAIN_SECS = 6;
const CONE_CHANNEL_SEC0 = 30;
const CONE_CHANNEL_SECS = 3;
const CRATER_SEC = 33;
const CURTAIN_SEC = 34;
const LAVAFALL_SEC = 35;
const LAVA_FREEZE_TIME = 20;
const DRAIN_ANGLE = (125 * Math.PI) / 180;
function bandMask(v, lo, hi, soft) {
  const outside = Math.max(lo - v, v - hi);
  return 1 - smoothstep(0, soft, outside);
}
function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  const t = lenSq > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / lenSq, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
const DRAIN_CHANNEL = (() => {
  const angle = DRAIN_ANGLE;
  const x = LAVA_MOAT.x + Math.cos(angle) * (LAVA_MOAT.r1 - 0.8);
  const z = LAVA_MOAT.z + Math.sin(angle) * (LAVA_MOAT.r1 - 0.8);
  return [
    [x, z],
    [x - 2.6, z + 3.2],
    [-12.4, 22.2],
    [-14.6, 25.2],
    [-16.2, 27.6],
  ];
})();
const CONE_CHANNEL = [
  [CONE_POS.x + 0.5, CONE_POS.z - 9],
  [CONE_POS.x + 0.8, CONE_POS.z - 12.2],
  [CONE_POS.x + 1.2, CONE_POS.z - 15.5],
];
const CINDER_ISLE = {
  id: 'cinder',
  name: 'Cinder Isle',
  cx: CINDER_POS.x,
  cz: CINDER_POS.z,
  y: CINDER_POS.y,
  r: 26,
  depth: 40,
  seed: 'cinder-main',
  segs: 190,
  rings: 32,
  elong: 0.08,
  elongAngle: -0.6,
  wobble: 0.1,
  relief: 0.9,
  dome: 0.7,
  bumps: [
    {
      x: -14,
      z: 14,
      r: 5,
      h: 0.9,
    },
    {
      x: 20,
      z: -14,
      r: 6,
      h: 1.4,
    },
    {
      x: -20,
      z: -16,
      r: 5,
      h: 1,
    },
  ],
  flats: [
    {
      x: LAVA_MOAT.x,
      z: LAVA_MOAT.z,
      r: LAVA_MOAT.r1 + 2.4,
      soft: 3,
    },
    {
      x: LAVA_MOAT.x,
      z: LAVA_MOAT.z,
      r: LAVA_MOAT.r0 - 0.6,
      soft: 0.8,
      lift: 0.45,
      pave: 0.85,
    },
    {
      x: CINDER_LANDING.x,
      z: CINDER_LANDING.z,
      r: 4.5,
      soft: 2.5,
      lift: 0.1,
      pave: 0.9,
    },
    {
      x: MAGMITE_POS.x,
      z: MAGMITE_POS.z,
      r: 5,
      soft: 3,
      dirt: 0.4,
    },
    {
      x: HEARTS_PILLAR.x,
      z: HEARTS_PILLAR.z,
      r: 3.2,
      soft: 2,
    },
  ],
  paths: [
    {
      pts: [
        [CINDER_LANDING.x, CINDER_LANDING.z],
        [-15, 4],
        [-12.6, 6.4],
      ],
      w: 2.2,
    },
  ],
  rocky: 0.55,
  lobes: 6,
  lobeAmp: 0.36,
  grass: 0,
  mod: (x, z, y) => {
    let carve = bandMask(Math.hypot(x - LAVA_MOAT.x, z - LAVA_MOAT.z), LAVA_MOAT.r0, LAVA_MOAT.r1, 0.9);
    for (const path of [DRAIN_CHANNEL, CONE_CHANNEL])
      for (let i = 0; i + 1 < path.length; i++) {
        const dist = distToSegment(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
        carve = Math.max(carve, 1 - smoothstep(1.7, 2.6, dist));
      }
    return y - carve * 0.95;
  },
  attr: (x, z, splat, at) => {
    const scorch = bandMask(Math.hypot(x - LAVA_MOAT.x, z - LAVA_MOAT.z), LAVA_MOAT.r0 - 1.2, LAVA_MOAT.r1 + 1.2, 1.2);
    splat[at + 2] = Math.max(splat[at + 2], scorch * 0.6);
    return 1;
  },
};
export class CinderRealm extends Realm {
  lava;
  lavaFall;
  timers = Array(48).fill(0);
  zones = [];
  cone = cinderV3(0, 0, 0);
  moatY = 0;
  door = cinderV3(0, 0, 0);
  doorDir = cinderV3(-1, 0, 0);
  vaultBox = new Box3();
  curtainCollider = null;
  curtainOpen = 0;
  curtainDry = false;
  lastSafe = cinderV3(0, 0, 0);
  hasSafe = false;
  hurtCool = 0;
  lavaFoeT = 0;
  hintLava = false;
  hintCurtain = false;
  entered = false;
  crustToast = false;
  constructor(ctx, opts) {
    super(ctx, 'cinder', 'Cinder Isle', 'Where the sky keeps its fire', [CINDER_ISLE], 2, opts, 3);
  }
  build() {
    const b2 = this.b;
    const rng = this.r;
    const rand = (lo, hi) => lo + (hi - lo) * rng();
    this.undersides([16742970, 16753226, 3811908, 16734762], {
      roots: true,
      crystalGlow: 2.2,
    });
    this.lava = createLavaMaterial(this.ctx, false);
    const fallLava = createLavaMaterial(this.ctx, true);
    fallLava.mat.uniforms.uFrz = this.lava.uniforms.uFrz;
    fallLava.mat.uniforms.uCurtainOpen = this.lava.uniforms.uCurtainOpen;
    this.lavaFall = fallLava.mat;
    this.owned.push(this.lava.mat, this.lavaFall);
    const lavaGeos = [];
    const fallGeos = [];
    const tagLava = (geo, attrAt) => {
      const position = geo.getAttribute('position');
      const data = new Float32Array(position.count * 4);
      const p = cinderV3(0, 0, 0);
      for (let i = 0; i < position.count; i++) {
        p.fromBufferAttribute(position, i);
        data.set(attrAt(i, p), i * 4);
      }
      geo.setAttribute('aLava', new BufferAttribute(data, 4));
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
      return geo;
    };
    this.cone = this.W(CONE_POS.x, CINDER_POS.y, CONE_POS.z);
    const coneGeo = peakGeometry(
      this.cone.x,
      CINDER_POS.y,
      this.cone.z,
      CONE_PROFILE,
      64,
      'cinder-cone',
      0.9,
      (angle, y) => (y > 15.6 ? 0.25 : 1),
      1,
      {
        flute: 0.9,
        ledge: 0.35,
        ledgeStep: 2.6,
      },
    );
    b2.rock(coneGeo, cinderV3(0, 0, 0), undefined, undefined, [1, 0, 0.25, 0]);
    this.trimesh(coneGeo.clone(), {
      kind: 'rock',
      surface: 'rock',
    });
    this.surfs.push({
      k: 'fn',
      x: this.cone.x,
      z: this.cone.z,
      r: CONE_PROFILE[0][0],
      f: (x, z) => {
        const h = profileHeightAt(CONE_PROFILE, Math.hypot(x - this.cone.x, z - this.cone.z));
        return h === null ? null : CINDER_POS.y + h;
      },
    });
    {
      const geometry = new CircleGeometry(3.25, 28);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(this.cone.x, CINDER_POS.y + CRATER_LAVA_Y, this.cone.z);
      lavaGeos.push(tagLava(geometry, (vi, p) => [p.x * 0.8, (p.z - this.cone.z) / 6.5 + 0.5, CRATER_SEC, 0]));
      this.zones.push({
        kind: 'disc',
        cx: this.cone.x,
        cz: this.cone.z,
        r0: 0,
        r1: 3.2,
        y: CINDER_POS.y + CRATER_LAVA_Y,
        sec0: CRATER_SEC,
        secN: 1,
      });
      this.surfs.push({
        k: 'disc',
        x: this.cone.x,
        z: this.cone.z,
        r: 3.2,
        y: CINDER_POS.y + CRATER_LAVA_Y,
      });
      const desc = this.ctx.RAPIER.ColliderDesc.cylinder(0.2, 3.3).setTranslation(
        this.cone.x,
        CINDER_POS.y + CRATER_LAVA_Y - 0.2,
        this.cone.z,
      );
      this.collider(
        desc,
        {
          kind: 'terrain',
          surface: 'rock',
        },
        COLLISION_GROUPS.terrain,
      );
      const vent = cinderV3(this.cone.x, CINDER_POS.y + 16.5, this.cone.z);
      for (let i = 0; i < (this.low ? 7 : 12); i++)
        this.puffs.push({
          c: vent.clone().add(cinderV3(rand(-1.2, 1.2), rand(-0.5, 1), rand(-1.2, 1.2))),
          size: rand(4.5, 7.5),
          kind: 2,
          op: rand(0.45, 0.65),
        });
      this.motes.push({
        x: vent.x,
        y: CINDER_POS.y + 13,
        z: vent.z,
        radius: 4,
        height: 6,
        count: 40,
        color: 0xff9a4a,
        size: 0.55,
        kind: 2,
      });
    }
    const rivuletEnds = [];
    for (const [angle, footR] of [
      [Math.PI / 2 - 0.25, 10.8],
      [-Math.PI / 2 + 0.1, 10.4],
    ]) {
      const pts = [];
      for (let i = 0; i <= 30; i++) {
        const f = i / 30;
        const h = 15.2 - f * 16.4;
        const rad = h > -0.5 ? profileRadiusAt(CONE_PROFILE, h) + 0.12 : footR;
        const ang = angle + Math.sin(f * 5 + angle) * 0.07;
        pts.push(
          cinderV3(
            this.cone.x + Math.cos(ang) * rad,
            CINDER_POS.y + Math.max(h, 0.3),
            this.cone.z + Math.sin(ang) * rad,
          ),
        );
      }
      rivuletEnds.push(pts[30]);
      const path = buildPath(pts);
      const ribbon = lavaRibbon(path, (k) => 0.75 - (k / 30) * 0.2, 0.05);
      fallGeos.push(
        tagLava(ribbon, (vi) => {
          const row = Math.floor(vi / 3);
          const col = vi % 3;
          return [path.len[Math.min(row, 30)] / Math.max(1, path.total), col / 2, LAVAFALL_SEC, 1];
        }),
      );
    }
    const moatC = this.W(LAVA_MOAT.x, 0, LAVA_MOAT.z);
    {
      const bankYs = [];
      for (let i = 0; i < 48; i++) {
        const angle = (i / 48) * CINDER_TAU;
        for (const rad of [LAVA_MOAT.r0 - 0.9, LAVA_MOAT.r1 + 0.9]) {
          const gy = this.groundAt(moatC.x + Math.cos(angle) * rad, moatC.z + Math.sin(angle) * rad);
          if (gy !== null) bankYs.push(gy);
        }
      }
      bankYs.sort((a, b) => a - b);
      const bankY = bankYs.length ? bankYs[Math.floor(bankYs.length * 0.12)] : CINDER_POS.y;
      this.moatY = bankY - 0.28;
      const pos = [];
      const index = [];
      const lava = [];
      for (let i = 0; i <= 4; i++) {
        const rad = LAVA_MOAT.r0 - 0.5 + ((LAVA_MOAT.r1 - LAVA_MOAT.r0 + 1) * i) / 4;
        for (let j = 0; j <= 96; j++) {
          const angle = (j / 96) * CINDER_TAU;
          pos.push(moatC.x + Math.cos(angle) * rad, this.moatY, moatC.z + Math.sin(angle) * rad);
          lava.push(
            angle * (LAVA_MOAT.r0 + LAVA_MOAT.r1) * 0.5,
            i / 4,
            Math.min(23, Math.floor((angle / CINDER_TAU) * MOAT_SECS)),
            0,
          );
        }
      }
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 96; j++) {
          const v = i * 97 + j;
          index.push(v, v + 1, v + 96 + 1, v + 1, v + 96 + 2, v + 96 + 1);
        }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geometry.setAttribute('aLava', new Float32BufferAttribute(lava, 4));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      lavaGeos.push(geometry);
      this.trimesh(geometry.clone(), {
        kind: 'terrain',
        surface: 'rock',
        data: {
          lava: 'moat',
        },
      });
      this.zones.push({
        kind: 'ring',
        cx: moatC.x,
        cz: moatC.z,
        r0: LAVA_MOAT.r0 - 0.35,
        r1: LAVA_MOAT.r1 + 0.35,
        y: this.moatY,
        sec0: 0,
        secN: MOAT_SECS,
      });
      this.surfs.push({
        k: 'ring',
        x: moatC.x,
        z: moatC.z,
        r0: LAVA_MOAT.r0 - 0.3,
        r1: LAVA_MOAT.r1 + 0.3,
        y: this.moatY,
      });
      this.spot(
        'cinderMoat',
        this.W(LAVA_MOAT.x - LAVA_MOAT.r1 - 1.6, this.G(LAVA_MOAT.x - LAVA_MOAT.r1 - 1.6, LAVA_MOAT.z), LAVA_MOAT.z),
      );
      this.motes.push({
        x: moatC.x,
        y: this.moatY + 0.3,
        z: moatC.z,
        radius: LAVA_MOAT.r1,
        height: 3,
        count: 50,
        color: 0xffa060,
        size: 0.4,
        kind: 2,
      });
    }
    const channel = (ctrl, sec0, secN, startY) => {
      const bed = [];
      const pts = ctrl.map(([x, z]) => this.W(x, 0, z));
      const curve = new CatmullRomCurve3(pts);
      const segs = Math.max(8, Math.round(curve.getLength() / 0.7));
      const spacedPoints = curve.getSpacedPoints(segs);
      for (let i = 1; i < spacedPoints.length; i++) {
        if (this.main.radialT(spacedPoints[i].x, spacedPoints[i].z) < 0.97) continue;
        const angle = Math.atan2(spacedPoints[i].z - this.main.cz, spacedPoints[i].x - this.main.cx);
        const normal = cinderV3(0, 0, 0);
        const lip = this.main.lipAt(angle, cinderV3(0, 0, 0), normal);
        spacedPoints.length = i;
        spacedPoints.push(lip.clone().addScaledVector(normal, 0.35));
        break;
      }
      let y = startY;
      for (const p of spacedPoints) {
        let low = Infinity;
        const probe = cinderV3(0, 0, 0);
        for (const off of [-2.3, 2.3]) {
          probe.set(p.x + off * 0.7, 0, p.z + off * 0.7);
          const gy = this.groundAt(probe.x, probe.z);
          if (gy !== null) low = Math.min(low, gy);
        }
        if (Number.isFinite(low)) y = Math.min(y, low - 0.28);
        bed.push(cinderV3(p.x, y, p.z));
      }
      const path = buildPath(bed);
      const geo = lavaRibbon(path, () => 1.95, 0);
      geo.computeVertexNormals();
      lavaGeos.push(
        tagLava(geo, (vi) => {
          const row = Math.floor(vi / 3);
          const col = vi % 3;
          const along = path.len[Math.min(row, bed.length - 1)];
          return [
            along,
            col / 2,
            sec0 + Math.min(secN - 1, Math.floor((along / Math.max(0.001, path.total)) * secN)),
            0,
          ];
        }),
      );
      this.trimesh(geo.clone(), {
        kind: 'terrain',
        surface: 'rock',
        data: {
          lava: 'channel',
        },
      });
      this.zones.push({
        kind: 'path',
        cx: 0,
        cz: 0,
        r0: 0,
        r1: 0,
        y: 0,
        path,
        hw: 2,
        sec0,
        secN,
      });
      this.surfs.push({
        k: 'fn',
        x: (pts[0].x + pts[pts.length - 1].x) / 2,
        z: (pts[0].z + pts[pts.length - 1].z) / 2,
        r: curve.getLength() / 2 + 3,
        f: (x, z) => {
          let best = null;
          for (let i = 0; i + 1 < bed.length; i++) {
            const p0 = bed[i];
            const p1 = bed[i + 1];
            if (distToSegment(x, z, p0.x, p0.z, p1.x, p1.z) <= 2) {
              const y = (p0.y + p1.y) / 2;
              if (best === null || y > best) best = y;
            }
          }
          return best;
        },
      });
      return path;
    };
    const drainPath = channel(DRAIN_CHANNEL, DRAIN_SEC0, DRAIN_SECS, this.moatY);
    const conePath = channel(CONE_CHANNEL, CONE_CHANNEL_SEC0, CONE_CHANNEL_SECS, CINDER_POS.y + 0.9);
    for (const path of [drainPath, conePath]) {
      const end = path.pts[path.pts.length - 1];
      const prev = path.pts[Math.max(0, path.pts.length - 4)];
      const dir = cinderV3(end.x - prev.x, 0, end.z - prev.z).normalize();
      const lip = end.clone().add(cinderV3(0, 0.02, 0));
      const sheet = fallSheetGeometry(lip, dir, 3.4, 46, 30, 7, 2.2, 1);
      const uv = sheet.getAttribute('uv');
      fallGeos.push(tagLava(sheet, (vi) => [uv.getY(vi), uv.getX(vi), LAVAFALL_SEC, 1]));
      const mist = lip
        .clone()
        .addScaledVector(dir, 4.5)
        .add(cinderV3(0, -44, 0));
      this.puffs.push({
        c: mist,
        size: 6,
        kind: 3,
        op: 0.3,
      });
    }
    this.spot('cinderDrain', drainPath.pts[drainPath.pts.length - 1].clone());
    {
      const floorY = this.G(LAVA_MOAT.x, LAVA_MOAT.z);
      const vault = this.W(LAVA_MOAT.x + 0.4, floorY, LAVA_MOAT.z);
      const hx = 3.1;
      const hz = 2.7;
      const wallH = 4.2;
      const wallT = 0.55;
      const tones = [4866120, 5918290, 4077118];
      const wall = (w, h, d, pos, color, rot = 0) => {
        const geo = roundedBox(w, h, d, 0.08, 1);
        displace(geo, 0.03, 1.2, pos.x + pos.z);
        b2.stone(geo, pos, rot, color);
        b2.box(pos, w / 2, h / 2, d / 2, rot);
      };
      const curtainH = 3.1;
      wall(wallT, wallH, hz * 2, vault.clone().add(cinderV3(hx - wallT / 2, wallH / 2, 0)), tones[0]);
      wall(hx * 2, wallH, wallT, vault.clone().add(cinderV3(0, wallH / 2, -2.4250000000000003)), tones[1]);
      wall(hx * 2, wallH, wallT, vault.clone().add(cinderV3(0, wallH / 2, hz - wallT / 2)), tones[1]);
      const jambW = (hz * 2 - 2.3) / 2;
      wall(wallT, wallH, jambW, vault.clone().add(cinderV3(-2.825, wallH / 2, -1.925)), tones[0]);
      wall(wallT, wallH, jambW, vault.clone().add(cinderV3(-2.825, wallH / 2, hz - jambW / 2)), tones[0]);
      wall(wallT, 1.1, 2.32, vault.clone().add(cinderV3(-2.825, 3.6500000000000004, 0)), tones[2]);
      wall(6.8, 0.5, 6, vault.clone().add(cinderV3(0, 4.45, 0)), tones[2]);
      b2.stone(
        taperedBox(hx * 2 - 0.4, hz * 2 - 0.4, hx * 1.1, hz * 1.1, 1),
        vault.clone().add(cinderV3(0, 4.7, 0)),
        0,
        tones[0],
      );
      b2.stone(taperedBox(hx * 1.1, hz * 1.1, 0.9, 0.9, 0.8), vault.clone().add(cinderV3(0, 5.7, 0)), 0, tones[1]);
      const crown = vault.clone().add(cinderV3(0, 6.5, 0));
      b2.glass(crystalGeometry(3.2, 0.5), crown, 0.4, 16742954, 3);
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * CINDER_TAU + 0.4;
        b2.glass(
          crystalGeometry(1.6, 0.26),
          crown.clone().add(cinderV3(Math.cos(angle) * 0.5, -0.05, Math.sin(angle) * 0.5)),
          new Euler(Math.sin(angle) * 0.4, 0, -Math.cos(angle) * 0.4),
          16752720,
          2.4,
        );
      }
      this.vit.restore(crown.x, crown.z, 3, 1, 0.3);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          b2.stone(taperedBox(0.9, 0.9, 0.7, 0.7, 4.5), vault.clone().add(cinderV3(sx * hx, 0, sz * hz)), 0, tones[2]);
      for (const side of [-1, 1]) {
        const geometry = new BoxGeometry(1.8, 0.35, 0.08);
        b2.glass(faceted(geometry), vault.clone().add(cinderV3(0, 3.2, side * 2.71)), 0, 16747066, 2.2);
        b2.glass(
          faceted(new BoxGeometry(1.8, 0.35, 0.08)),
          vault.clone().add(cinderV3(0, 3.2, side * 2.1400000000000006)),
          0,
          16747066,
          2,
        );
      }
      const dais = vault.clone().add(cinderV3(2.55 - 1.1, 0, 0));
      b2.stone(new CylinderGeometry(1.2, 1.3, 0.3, 16), dais.clone().add(cinderV3(0, 0.05, 0)), 0, tones[1]);
      b2.cyl(dais.clone().add(cinderV3(0, 0.1, 0)), 0.1, 1.25);
      this.surfs.push({
        k: 'disc',
        x: dais.x,
        z: dais.z,
        r: 1.2,
        y: floorY + 0.2,
      });
      for (const side of [-1, 1]) {
        const brazier = vault.clone().add(cinderV3(0.4, 0, side * 1.6500000000000004));
        b2.stone(taperedBox(0.5, 0.5, 0.7, 0.7, 0.9), brazier, 0, tones[0]);
        b2.glass(crystalGeometry(0.6, 0.22), brazier.clone().add(cinderV3(0, 0.9, 0)), 0, 16751168, 3);
      }
      const chestPos = dais.clone().setY(floorY + 0.2);
      this.chestDefs.push({
        id: 'cinder-vault',
        kind: 'vessel',
        pos: chestPos,
        facing: -Math.PI / 2,
        loot: {
          item: 'staminaVessel',
        },
      });
      this.spot('cinderChest', chestPos);
      this.spot(
        'cinderVault',
        vault
          .clone()
          .add(cinderV3(-3.1 - 2.2, 0, 0))
          .setY(floorY),
      );
      this.vaultBox.set(vault.clone().add(cinderV3(-3, -1, -2.7)), vault.clone().add(cinderV3(hx, wallH, hz)));
      this.door = vault.clone().add(cinderV3(-3.15, 0, 0));
      this.doorDir.set(-1, 0, 0);
      const spout = this.door.clone().add(cinderV3(-0.35, 3.35, 0));
      b2.stone(roundedBox(0.8, 0.45, 2.6999999999999997, 0.1, 1), spout, 0, tones[2]);
      const pos = [];
      const lava = [];
      const index = [];
      for (let i = 0; i <= 10; i++) {
        const down = i / 10;
        for (let j = 0; j <= 6; j++) {
          const across = j / 6;
          const bulge = Math.sin(across * Math.PI) * 0.12 + down * 0.15;
          pos.push(
            this.door.x - 0.55 - bulge,
            floorY + curtainH + 0.05 - down * 3.2,
            this.door.z + (across - 0.5) * 2.4,
          );
          lava.push(down, across, CURTAIN_SEC, 2);
        }
      }
      for (let i = 0; i < 10; i++)
        for (let j = 0; j < 6; j++) {
          const v = i * 7 + j;
          index.push(v, v + 6 + 1, v + 1, v + 1, v + 6 + 1, v + 6 + 2);
        }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geometry.setAttribute('aLava', new Float32BufferAttribute(lava, 4));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      lavaGeos.push(geometry);
      const curtainDesc = this.ctx.RAPIER.ColliderDesc.cuboid(0.3, curtainH / 2, 1.2).setTranslation(
        this.door.x - 0.55,
        floorY + curtainH / 2,
        this.door.z,
      );
      this.curtainCollider = this.collider(curtainDesc, {
        kind: 'structure',
        surface: 'stone',
      });
      this.clear.push({
        x: vault.x,
        z: vault.z,
        r: 4.5,
      });
      this.puffs.push({
        c: spout.clone().add(cinderV3(-0.6, 0.6, 0)),
        size: 2.2,
        kind: 3,
        op: 0.25,
      });
    }
    {
      const landing = this.P(CINDER_LANDING.x, CINDER_LANDING.z);
      this.spot('cinderLanding', landing);
      this.spot('cinder', this.P(0, 0));
      for (const [dx, dz] of [
        [2.6, -3.4],
        [3.2, 3.2],
      ]) {
        const beacon = this.P(CINDER_LANDING.x + dx, CINDER_LANDING.z + dz);
        b2.stone(taperedBox(0.6, 0.6, 0.42, 0.42, 2.2), beacon.clone().add(cinderV3(0, -0.1, 0)), 0.3, 4866120);
        b2.glass(crystalGeometry(0.9, 0.2), beacon.clone().add(cinderV3(0, 2.1, 0)), 0.2, 16752720, 2.6);
        b2.cyl(beacon.clone().add(cinderV3(0, 1.1, 0)), 1.1, 0.35);
      }
      for (const [x, z, color] of [
        [-21.5, 4.5, 'blue'],
        [-22.2, 1.8, 'blue'],
        [-20.4, 6.6, 'blue'],
        [-16.6, -3.8, 'blue'],
      ])
        this.ink.push({
          color,
          pos: this.P(x, z, -0.03),
        });
      this.clear.push({
        x: landing.x,
        z: landing.z,
        r: 4.5,
      });
    }
    const column = (pos, h, rad, color = 4077118) => {
      const geometry = new CylinderGeometry(rad, rad * 1.04, h, 6);
      geometry.translate(0, h / 2, 0);
      displace(geometry, 0.02, 1.2, pos.x);
      b2.stone(faceted(geometry), pos, rng() * CINDER_TAU, color);
    };
    BASALT_LEDGES.forEach(([x, z], i) => {
      const base = this.P(x, z, -0.4);
      const topY = base.y + BASALT_LEDGE_H;
      column(base, 2.82, 0.85, 4537412);
      for (let j = 0; j < 6; j++) {
        const ang = (j / 6) * CINDER_TAU + i;
        column(
          base.clone().add(cinderV3(Math.cos(ang) * 1.1, 0, Math.sin(ang) * 1.1)),
          BASALT_LEDGE_H - (j % 2) * 0.12,
          0.6,
          j % 2 ? 3813944 : 4866120,
        );
      }
      b2.cyl(base.clone().add(cinderV3(0, BASALT_LEDGE_H / 2, 0)), BASALT_LEDGE_H / 2, 1.65);
      this.surfs.push({
        k: 'disc',
        x: base.x,
        z: base.z,
        r: 1.65,
        y: topY,
      });
      const angle = Math.atan2(LAVA_MOAT.z - z, LAVA_MOAT.x - x);
      const step = base.clone().add(cinderV3(Math.cos(angle) * 2.2, 0, Math.sin(angle) * 2.2));
      step.y = this.G(x + Math.cos(angle) * 2.2, z + Math.sin(angle) * 2.2) - 0.4;
      column(step, 1.3, 0.6, 4866120);
      b2.cyl(step.clone().add(cinderV3(0, 1.3 / 2, 0)), 1.3 / 2, 0.62);
      this.surfs.push({
        k: 'disc',
        x: step.x,
        z: step.z,
        r: 0.6,
        y: step.y + BASALT_STEP_H + 0.4,
      });
      this.clear.push({
        x: base.x,
        z: base.z,
        r: 2.2,
      });
      this.spot(`cinderLedge${i + 1}`, cinderV3(base.x, topY, base.z));
    });
    {
      const base = this.P(HEARTS_PILLAR.x, HEARTS_PILLAR.z, -0.3);
      const h = 1.2;
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * CINDER_TAU;
        const rad = i === 0 ? 0 : 1.2;
        column(
          base.clone().add(cinderV3(Math.cos(angle) * rad, 0, Math.sin(angle) * rad)),
          h + (i % 2) * 0.06,
          0.75,
          4537412,
        );
      }
      b2.cyl(base.clone().add(cinderV3(0, h / 2, 0)), h / 2, 1.9);
      this.surfs.push({
        k: 'disc',
        x: base.x,
        z: base.z,
        r: 1.9,
        y: base.y + h,
      });
      const step = base.clone().add(cinderV3(-2.4, 0, 0));
      step.y = this.G(HEARTS_PILLAR.x - 2.4, HEARTS_PILLAR.z) - 0.3;
      column(step, 0.7, 0.6, 4866120);
      b2.cyl(step.clone().add(cinderV3(0, 0.35, 0)), 0.35, 0.62);
      const chestPos = base.clone().add(cinderV3(0.2, h, 0));
      this.chestDefs.push({
        id: 'cinder-hearts',
        kind: 'small',
        pos: chestPos,
        facing: -Math.PI / 2,
        loot: {
          hearts: 20,
          title: 'Warm Hearts',
          sub: 'The isle’s fire mends you — hearts restored!',
        },
      });
      this.spot('cinderHearts', chestPos);
    }
    [
      [-7, -17, 2.4, 3023926],
      [13, -16, 2, 16747066],
      [22, 14, 1.6, 3023926],
      [-22, 12, 1.8, 16742954],
      [8, 22, 2.2, 3023926],
      [-13, -19, 1.5, 16752720],
    ].forEach(([x, z, size, color], i) => {
      const base = this.P(x, z, -0.25);
      for (let i = 0; i < 4; i++) {
        const len = i === 0 ? size : size * rand(0.35, 0.7);
        const off = i === 0 ? cinderV3(0, 0, 0) : cinderV3(rand(-0.7, 0.7), 0, rand(-0.7, 0.7));
        b2.glass(
          crystalGeometry(len, len * 0.15),
          base.clone().add(off),
          new Euler(off.z * 0.5, rng() * CINDER_TAU, -off.x * 0.5, 'YXZ'),
          color,
          color === 3023926 ? 0.5 : 2.2,
        );
      }
      b2.cyl(base.clone().add(cinderV3(0, size * 0.4, 0)), size * 0.4, 0.6);
      this.clear.push({
        x: base.x,
        z: base.z,
        r: 1.2,
      });
    });
    for (const [x, z, s2] of [
      [-8, 19, 1],
      [16, -11, 0.9],
      [-19, -8, 1.1],
    ]) {
      const base = this.P(x, z, -0.2);
      const trunk = new CylinderGeometry(0.16 * s2, 0.34 * s2, 3.4 * s2, 7);
      trunk.translate(0, 1.7 * s2, 0);
      displace(trunk, 0.05, 2, x);
      b2.rock(trunk, base, new Euler(0.08, rng() * CINDER_TAU, -0.06), undefined, [0, 0, 0, 1]);
      for (let i = 0; i < 3; i++) {
        const branch = new CylinderGeometry(0.05 * s2, 0.1 * s2, 1.4 * s2, 5);
        branch.translate(0, 0.7 * s2, 0);
        b2.rock(
          branch,
          base.clone().add(cinderV3(0, (1.6 + i * 0.6) * s2, 0)),
          new Euler(0.9 + i * 0.2, i * 2.1 + x, 0),
          undefined,
          [0, 0, 0, 1],
        );
      }
      b2.cyl(base.clone().add(cinderV3(0, 1.6 * s2, 0)), 1.6 * s2, 0.3 * s2);
    }
    for (const [x, z] of [
      [-5, -3],
      [11, 12],
      [-14, 18],
    ]) {
      const vent = this.P(x, z);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * CINDER_TAU;
        b2.rock(
          rockGeometry(0.3, i + x, 0.6),
          vent.clone().add(cinderV3(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55)),
          rng() * CINDER_TAU,
        );
      }
      this.puffs.push(
        {
          c: vent.clone().add(cinderV3(0, 0.8, 0)),
          size: 2.2,
          kind: 3,
          op: 0.35,
        },
        {
          c: vent.clone().add(cinderV3(0.2, 1.2, 0.1)),
          size: 2.6,
          kind: 3,
          op: 0.3,
        },
      );
    }
    for (const [x, z, s] of [
      [-23, -4, 1.1],
      [23, 1, 0.9],
      [2, 24, 1],
      [-3, -24, 1.2],
      [17, 21, 0.8],
      [-10, 23, 0.8],
    ])
      placeBoulder(b2, this.cx + x, this.cz + z, this.G(x, z), s * rand(0.9, 1.2), rng);
    const lavaGeo = mergeGeometries(lavaGeos);
    lavaGeos.forEach((g) => g.dispose());
    const lavaMesh = new Mesh(lavaGeo, this.lava.mat);
    lavaMesh.name = 'cinder-lava';
    lavaMesh.matrixAutoUpdate = false;
    lavaMesh.receiveShadow = false;
    this.far.add(lavaMesh);
    const fallGeo = mergeGeometries(fallGeos);
    fallGeos.forEach((g) => g.dispose());
    const fallMesh = new Mesh(fallGeo, this.lavaFall);
    fallMesh.name = 'cinder-lavafalls';
    fallMesh.renderOrder = 2;
    fallMesh.matrixAutoUpdate = false;
    this.far.add(fallMesh);
    this.addEnemies(
      'cinder-spitters',
      BASALT_LEDGES.map(([x, z]) => ({
        kind: 'spitter',
        pos: this.P(x, z).setY(this.G(x, z) - 0.4 + BASALT_LEDGE_H),
        facing: Math.atan2(CINDER_LANDING.x - x, CINDER_LANDING.z - z),
      })),
      true,
    );
    this.addEnemies(
      'magmite',
      [
        {
          kind: 'smudgeling',
          pos: this.P(MAGMITE_POS.x, MAGMITE_POS.z),
          facing: Math.atan2(CINDER_LANDING.x - MAGMITE_POS.x, CINDER_LANDING.z - MAGMITE_POS.z),
          elite: {
            name: 'Magmite',
            element: 'red',
          },
        },
      ],
      false,
    );
    this.spot('cinderMagmite', this.P(MAGMITE_POS.x, MAGMITE_POS.z));
    this.listen('paint:splat', (splat) => {
      if (splat.color === 'blue' && this.contains(splat.position)) this.freezeAt(splat.position, 2.4);
    });
    this.listen('combat:art-impact', (hit) => {
      if (hit.art === 'iceLance' && this.contains(hit.position)) this.freezeAt(hit.position, 3.2);
    });
    if (this.opts.solved) {
      this.curtainDry = true;
      this.curtainOpen = 1;
      this.removeCollider(this.curtainCollider);
      this.curtainCollider = null;
      this.solved.add('cinder-vault');
    }
  }
  sectionsAt(x, z, pad, out) {
    out.length = 0;
    let y = null;
    for (const zone of this.zones)
      if (zone.kind === 'ring' || zone.kind === 'disc') {
        const dist = Math.hypot(x - zone.cx, z - zone.cz);
        if (dist < zone.r0 - pad || dist > zone.r1 + pad) continue;
        y = zone.y;
        if (zone.kind === 'disc') out.push(zone.sec0);
        else {
          let angle = Math.atan2(z - zone.cz, x - zone.cx);
          if (angle < 0) angle += CINDER_TAU;
          const fsec = (angle / CINDER_TAU) * zone.secN;
          const sec = Math.floor(fsec) % zone.secN;
          out.push(zone.sec0 + sec);
          const slack = pad / Math.max(1, (zone.r0 + zone.r1) / 2) / (CINDER_TAU / zone.secN);
          if (fsec - Math.floor(fsec) < slack + 0.35) out.push(zone.sec0 + ((sec - 1 + zone.secN) % zone.secN));
          if (Math.ceil(fsec) - fsec < slack + 0.35) out.push(zone.sec0 + ((sec + 1) % zone.secN));
        }
      } else if (zone.path) {
        const pts = zone.path.pts;
        for (let i = 0; i + 1 < pts.length; i++) {
          if (distToSegment(x, z, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z) > (zone.hw ?? 2) + pad) continue;
          const along = zone.path.len[i];
          const sec = Math.min(zone.secN - 1, Math.floor((along / Math.max(0.001, zone.path.total)) * zone.secN));
          if (!out.includes(zone.sec0 + sec)) out.push(zone.sec0 + sec);
          y = y === null ? pts[i].y : Math.max(y, pts[i].y);
        }
      }
    return y;
  }
  tmpS = [];
  freezeAt(pos, radius) {
    const tmpS = this.tmpS;
    const y = this.sectionsAt(pos.x, pos.z, radius, tmpS);
    let froze = false;
    if (y !== null && Math.abs(pos.y - y) < 3 && tmpS.length)
      for (const sec of tmpS)
        if (!(sec >= LAVAFALL_SEC)) {
          this.timers[sec] = LAVA_FREEZE_TIME;
          froze = true;
        }
    if (!this.curtainDry && pos.distanceTo(this.door.clone().add(cinderV3(-0.6, 1.5, 0))) < 2.8) {
      this.timers[CURTAIN_SEC] = LAVA_FREEZE_TIME;
      froze = true;
    }
    if (froze) {
      try {
        this.ctx.paint.eraseSphere(pos, 2.2, ['blue']);
      } catch {}
      this.sparkle(
        pos.clone().add(cinderV3(0, 0.4, 0)),
        22,
        3.5,
        [new Color(0.7, 0.85, 1), new Color(1, 1, 1), PAINT.blue],
        1.1,
        -1,
      );
      this.play('shrine-activate', pos, 0.35);
      try {
        this.ctx.events.emit('element:steam', {
          position: pos.clone(),
        });
      } catch {}
      if (!this.crustToast) {
        this.crustToast = true;
        this.toast('The lava cools!', 'Obsidian crust — cross quickly before it melts again', 'blue');
      }
    }
  }
  molten(sec) {
    return this.timers[sec] <= 0.6;
  }
  step(dt, near) {
    this.ctx.time.elapsed;
    const state = this.player?.state;
    const inVault = !!state && this.vaultBox.containsPoint(state.position);
    for (let i = 0; i < 48; i++) {
      if (this.timers[i] > 0) {
        if (i === CURTAIN_SEC && inVault) this.timers[i] = Math.max(this.timers[i], 3);
        this.timers[i] = Math.max(0, this.timers[i] - dt);
        if (this.timers[i] === 0 && i < LAVAFALL_SEC) this.onRemelt(i);
      }
      this.lava.frz[i] = i === CURTAIN_SEC && this.curtainDry ? 1 : Math.min(1, this.timers[i] / 5);
    }
    const opening = this.curtainDry || this.timers[CURTAIN_SEC] > 0.8;
    this.curtainOpen = clamp(this.curtainOpen + (opening ? dt / 0.9 : -dt / 1.4), 0, 1);
    this.lava.uniforms.uCurtainOpen.value = smoothstep(0.15, 1, this.curtainOpen) * 1;
    if (opening && this.curtainCollider && this.curtainOpen > 0.6) {
      this.removeCollider(this.curtainCollider);
      this.curtainCollider = null;
      this.sparkle(
        this.door.clone().add(cinderV3(-0.6, 1.6, 0)),
        30,
        4,
        [new Color(0.3, 0.28, 0.34), new Color(1, 0.5, 0.15), new Color(0.7, 0.85, 1)],
        1.2,
        -8,
      );
      this.play('barrier-down', this.door, 0.7);
      if (!this.hintCurtain) {
        this.hintCurtain = true;
        this.toast('The curtain cools and crumbles', 'Slip into the Ember Vault!', 'blue');
      }
    } else if (
      !opening &&
      !this.curtainCollider &&
      this.curtainOpen < 0.4 &&
      !this.curtainDry &&
      (!state || !this.nearDoor(state.position, 1.4))
    ) {
      const doorY = this.door.y;
      const desc = this.ctx.RAPIER.ColliderDesc.cuboid(0.3, 3.1 / 2, 1.2).setTranslation(
        this.door.x - 0.55,
        doorY + 3.1 / 2,
        this.door.z,
      );
      this.curtainCollider = this.collider(desc, {
        kind: 'structure',
        surface: 'stone',
      });
    }
    if (inVault && !this.entered) {
      this.entered = true;
      this.solve('cinder-vault', this.door, this.reach * 0.6);
    }
    if (state && !state.dead) {
      this.hurtCool -= dt;
      if (state.mode !== 'fly') {
        const tmpS = this.tmpS;
        const lavaY = this.sectionsAt(state.position.x, state.position.z, -0.15, tmpS);
        let burning = false;
        if (lavaY !== null && state.position.y < lavaY + 0.45 && state.position.y > lavaY - 1.2)
          burning = tmpS.some((sec) => sec >= LAVAFALL_SEC || this.molten(sec));
        if (!this.curtainDry && !this.curtainCollider && this.curtainOpen < 0.5 && this.nearDoor(state.position, 0.9))
          burning = true;
        if (!this.curtainDry && this.curtainCollider && this.nearDoor(state.position, 0.75)) burning = true;
        if (burning) {
          if (this.hurtCool <= 0) {
            this.hurtCool = 0.9;
            const dir = this.hasSafe
              ? cinderV3(this.lastSafe.x - state.position.x, 0, this.lastSafe.z - state.position.z)
              : cinderV3(-1, 0, 0);
            if (dir.lengthSq() < 0.0001) dir.set(-1, 0, 0);
            dir.normalize();
            try {
              this.ctx.player.damage({
                amount: 0.5,
                direction: dir,
                knockback: 11,
                source: 'lava',
              });
            } catch {}
            this.sparkle(
              state.position.clone().add(cinderV3(0, 0.4, 0)),
              18,
              4,
              [new Color(1, 0.45, 0.1), new Color(1, 0.8, 0.3)],
              0.8,
              -4,
            );
            if (!this.hintLava) {
              this.hintLava = true;
              this.toast('Too hot!', 'Paint the lava with Frost to cool it into a crust', 'blue');
            }
          }
        } else if (
          state.grounded &&
          (state.mode === 'ground' || state.mode === 'slide') &&
          (lavaY === null || !tmpS.length || state.position.y > lavaY + 0.6)
        ) {
          this.lastSafe.copy(state.position);
          this.hasSafe = true;
        }
      }
      this.lavaFoeT -= dt;
      if (near && this.lavaFoeT <= 0) {
        this.lavaFoeT = 0.45;
        let foes = [];
        try {
          foes = this.ctx.enemies.query(cinderV3(this.cx, this.baseY, this.cz), this.reach);
        } catch {
          foes = [];
        }
        for (const foe of foes) {
          if (foe.elite?.element === 'red' || foe.statuses.has('burning')) continue;
          const tmpS = this.tmpS;
          const lavaY = this.sectionsAt(foe.position.x, foe.position.z, -0.3, tmpS);
          if (!(lavaY === null || Math.abs(foe.position.y - lavaY) > 0.8 || !tmpS.some((sec) => this.molten(sec))))
            try {
              this.ctx.enemies.damage(foe.id, {
                damage: 1,
                color: 'red',
                direction: cinderV3(0, 0, 1),
                knockback: 3,
                source: 'environment',
                point: foe.position.clone(),
              });
            } catch {}
        }
      }
    }
  }
  nearDoor(pos, pad) {
    const dx = pos.x - (this.door.x - 0.55);
    const dz = pos.z - this.door.z;
    return Math.abs(dx) < pad && Math.abs(dz) < 1.25 && pos.y > this.door.y - 0.5 && pos.y < this.door.y + 3;
  }
  onRemelt(sec) {
    if (sec === CURTAIN_SEC) this.play('bramble-burn', this.door, 0.6);
  }
  onChestOpened(chest) {
    if (chest.id === 'cinder-vault') {
      this.curtainDry = true;
      this.removeCollider(this.curtainCollider);
      this.curtainCollider = null;
    }
  }
  debugState() {
    const frozen = [];
    this.timers.forEach((timer, sec) => timer > 0 && frozen.push(sec));
    return {
      frozen,
      curtainOpen: this.curtainOpen,
      curtainCollider: !!this.curtainCollider,
      entered: this.entered,
      moatY: this.moatY,
    };
  }
}
function lavaRibbon(path, halfW, lift) {
  const pos = [];
  const index = [];
  const up = cinderV3(0, 1, 0);
  const side = cinderV3(0, 0, 0);
  const len = path.pts.length;
  for (let i = 0; i < len; i++) {
    const p = path.pts[i];
    const tan = path.tan[i];
    side.set(tan.x, 0, tan.z);
    if (side.lengthSq() < 0.000001) side.set(1, 0, 0);
    side.normalize().cross(up).normalize();
    const w = halfW(i);
    for (let j = 0; j < 3; j++) {
      const off = (j - 1) * w;
      pos.push(p.x + side.x * off, p.y + lift, p.z + side.z * off);
    }
  }
  for (let i = 0; i + 1 < len; i++)
    for (let j = 0; j < 2; j++) {
      const v = i * 3 + j;
      index.push(v, v + 1, v + 3, v + 1, v + 4, v + 3);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
