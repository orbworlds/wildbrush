/**
 * Generates the island heightmap on a 321 by 321 grid from signed-distance landforms: coastline and sea cliffs, the summit and its ridges, the south slope, mesa, tower hill, canyon, grove, lake and islet, rock spires, sea stacks and dirt paths. Also bakes the masks the surface pass needs and exports the key plateau heights.
 */
import { DRY_MEADOW, LANDMARKS } from '../core/config.js';
import { clamp, fbm, lerp, makeNoise2D, smoothstep } from '../core/math.js';
export const TERRAIN_RES = 321;
const RES = TERRAIN_RES;
const HALF = 160;
const hypot = Math.hypot;
const gauss = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
function smin(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}
const smax = (a, b, k) => -smin(-a, -b, k);
let segT = 0;
let segTRaw = 0;
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  segTRaw = ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz);
  const t = clamp(segTRaw, 0, 1);
  segT = t;
  return hypot(px - ax - dx * t, pz - az - dz * t);
}
class Polyline {
  pts;
  cum = [0];
  length;
  constructor(pts) {
    this.pts = pts;
    for (let i = 1; i < pts.length; i++)
      this.cum.push(this.cum[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.length = this.cum[this.cum.length - 1];
  }
  t = 0;
  dist(x, z) {
    let best = Infinity;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a2 = this.pts[i];
      const b = this.pts[i + 1];
      const d = segDist(x, z, a2[0], a2[1], b[0], b[1]);
      if (d < best) {
        best = d;
        this.t = (this.cum[i] + segT * (this.cum[i + 1] - this.cum[i])) / this.length;
      }
    }
    return best;
  }
}
function catmullRom(pts, spacing) {
  const out = [];
  const at = (idx) => pts[clamp(idx, 0, pts.length - 1)];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const len = hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(2, Math.ceil(len / spacing));
    for (let j = 0; j < steps; j++) {
      const t2 = j / steps;
      const t2_2 = t2 * t2;
      const t3 = t2_2 * t2;
      const coord = (k) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t2 +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2_2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([coord(0), coord(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const coastNoise = makeNoise2D('wb-coast');
const coastNoise2 = makeNoise2D('wb-coast-2');
const baseNoise = makeNoise2D('wb-base');
const baseNoise2 = makeNoise2D('wb-base-2');
const warpNoise = makeNoise2D('wb-warp');
const cragNoise = makeNoise2D('wb-crag');
const mesaNoise = makeNoise2D('wb-mesa');
const ridgeNoise = makeNoise2D('wb-ridge');
const lakeNoise = makeNoise2D('wb-lake');
const detailNoise = makeNoise2D('wb-detail');
const pathNoise = makeNoise2D('wb-path');
const maskNoise = makeNoise2D('wb-mask');
const ridgedFbm = (noise, x, z, octaves) => {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const v = 1 - Math.abs(noise(x * freq, z * freq));
    sum += v * v * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
};
const LM = LANDMARKS;
function cliffMask(x2, z) {
  let mask = smoothstep(-72, -108, z);
  mask = Math.max(mask, smoothstep(-45, -80, z) * smoothstep(-30, -70, x2));
  mask = Math.max(mask, 0.95 * gauss(x2, z, -138, -45, 34));
  mask = Math.max(mask, 0.8 * gauss(x2, z, 142, -48, 30));
  mask = Math.max(mask, 0.55 * gauss(x2, z, -122, 60, 20));
  mask += fbm(maskNoise, x2 * 0.02 + 3, z * 0.02, 3) * 0.3;
  mask *= smoothstep(92, 45, z);
  return clamp(mask, 0, 1);
}
function coastDist(x2, z, cliff) {
  let d = 124 * (1 - hypot((x2 - 3) / 126, (z - 0) / 124));
  d = smax(d, 24 - hypot(x2 - 74, z - 106), 14);
  d = smax(d, 36 - hypot(x2 - 2, z - 100), 16);
  d = smax(d, 24 - hypot(x2 - 62, z + 121), 12);
  d = smax(d, 17 - segDist(x2, z, 78, -100, 114, -88), 10);
  d = smax(d, 60 - hypot(x2 + 66, z + 82), 16);
  d = smax(d, 30 - hypot(x2 + 18, z + 110), 14);
  d = smax(d, 26 - hypot(x2 + 118, z - 24), 12);
  d = smax(d, 20 - hypot(x2 - 120, z - 40), 12);
  d = smin(d, hypot(x2 + 46, z - 140) - 17, 10);
  d = smin(d, hypot(x2 - 146, z - 4) - 15, 8);
  d = smin(d, hypot(x2 + 128, z + 114) - 24, 10);
  d = smax(d, 32 - hypot(x2 + 94, z - 70), 12);
  d = smin(d, hypot(x2 + 140, z - 104) - 16, 9);
  d = smin(d, hypot(x2 - 16, z + 150) - 16, 8);
  d += fbm(coastNoise, x2 * 0.017, z * 0.017, 4) * 9 + coastNoise2(x2 * 0.06, z * 0.06) * 2.2;
  const edge = HALF - (Math.abs(x2) ** 5 + Math.abs(z) ** 5) ** 0.2;
  d = smin(d, edge - lerp(22, 10, cliff) + coastNoise2(x2 * 0.03 + 9, z * 0.03) * 4, 10);
  return d;
}
const SUMMIT_TOP = 68;
const SUMMIT_RIDGES = [
  {
    ex: 44,
    ez: 6,
    endH: 13,
    pw: 1.05,
    side: 0.95,
  },
  {
    ex: -20,
    ez: -10,
    endH: 14,
    pw: 1.25,
    side: 0.72,
    bump: [0.55, 4],
  },
  {
    ex: -40,
    ez: -62,
    endH: 22,
    pw: 0.85,
    side: 0.85,
    bump: [0.28, 7],
  },
  {
    ex: -2,
    ez: -104,
    endH: 16,
    pw: 1,
    side: 0.8,
  },
  {
    ex: 36,
    ez: -88,
    endH: 29,
    pw: 0.95,
    side: 0.9,
  },
  {
    ex: 62,
    ez: -30,
    endH: 12,
    pw: 1.3,
    side: 1,
    bump: [0.42, 8],
  },
  {
    ex: 32,
    ez: -18,
    endH: 34,
    pw: 0.8,
    side: 1.3,
    bump: [0.75, 4],
  },
];
function summitHeight(x, z) {
  const sx = LM.summit.x;
  const sz = LM.summit.z;
  const dist = hypot(x - sx, z - sz);
  if (dist > 120) return -Infinity;
  const warp = 8 * smoothstep(6, 34, dist);
  const wx = x + warpNoise(x * 0.02, z * 0.02) * warp;
  const wz = z + warpNoise(x * 0.02 + 41, z * 0.02 - 7) * warp;
  let h = -Infinity;
  for (let i = 0; i < SUMMIT_RIDGES.length; i++) {
    const ridge = SUMMIT_RIDGES[i];
    const off = segDist(wx, wz, sx, sz, ridge.ex, ridge.ez);
    const along = segT;
    const len = hypot(ridge.ex - sx, ridge.ez - sz);
    const before = Math.max(0, -segTRaw) * len;
    const past = Math.max(0, segTRaw - 1) * len;
    let crest = ridge.endH + (63 - ridge.endH) * (1 - along) ** ridge.pw;
    crest +=
      (ridgedFbm(cragNoise, wx * 0.07 + i * 13.1, wz * 0.07, 2) - 0.5) *
      6 *
      smoothstep(0.05, 0.25, along) *
      (1 - along * 0.6);
    if (ridge.bump) crest += ridge.bump[1] * Math.exp(-(((along - ridge.bump[0]) / 0.1) ** 2));
    const steep = ridge.side * lerp(1.3, 0.7, along);
    const ridgeH = crest - steep * (off < 14 ? off : 14 + (off - 14) * 0.78) - before * 1.1 - past * 0.35;
    h = h === -Infinity ? ridgeH : smax(h, ridgeH, 5);
  }
  const north = smoothstep(0, -1, (z - sz) / Math.max(dist, 0.001));
  const fromTop = Math.max(0, dist - 2.6);
  const cone = SUMMIT_TOP - fromTop * lerp(1.75, 2.6, north) - fromTop * fromTop * 0.006 - dist * 0.08;
  h = smax(h, cone, 2.5);
  const crag = ridgedFbm(cragNoise, x * 0.05, z * 0.05, 3);
  h += (crag - 0.45) * 8 * smoothstep(28, 52, h) * smoothstep(3, 12, dist);
  return Math.min(h, 68.3);
}
function southSlope(x2, z) {
  let h = 8 + 27 * clamp((30 - z) / 60, 0, 1.25) ** 1.4;
  h -= (Math.abs(x2 - DRY_MEADOW.x - 2) / 48) ** 2 * 16;
  h += fbm(baseNoise2, x2 * 0.03, z * 0.03, 3) * 1.4;
  return h;
}
function spireHeight(x, z, cx, cz, radius, topH, base, seed) {
  const dx = x - cx;
  const dz = z - cz;
  const dist = hypot(dx, dz);
  if (dist > radius + 14) return -Infinity;
  const angle = Math.atan2(dz, dx);
  const edge = dist - (radius + mesaNoise(Math.cos(angle) * 1.3 + seed, Math.sin(angle) * 1.3) * radius * 0.18);
  if (edge <= 0) return topH - 0.6 * smoothstep(-2, 0, edge) + detailNoise(x * 0.3, z * 0.3) * 0.15;
  const foot = base + 3.5;
  const wallW = Math.max(0.8, (topH - foot) / 7.5);
  if (edge < wallW) return lerp(topH, foot, edge / wallW);
  const t = clamp((edge - wallW) / 8, 0, 1);
  return foot - 3.5 * (1 - (1 - t) * (1 - t)) - 1.5 * t;
}
const MESA_TOP = 46;
const MESA_LEDGE = 26;
function mesaRadiusAt(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dent = Math.abs(mesaNoise(c * 4.5 + 20, s * 4.5));
  return (
    15 +
    mesaNoise(c * 1.1, s * 1.1) * 2.6 +
    mesaNoise(c * 2.8 + 5, s * 2.8) * 1.2 -
    dent * 1.6 +
    Math.cos(angle * 3 + 0.7) * 0.8
  );
}
function mesaHeight(x, z, base) {
  const dx = x - LM.mesa.x;
  const dz = z - LM.mesa.z;
  const dist = hypot(dx, dz);
  if (dist > 42) return -Infinity;
  const angle = Math.atan2(dz, dx);
  const edge = dist - mesaRadiusAt(angle);
  const notch = smoothstep(0.35, 0.8, mesaNoise(Math.cos(angle) * 6 + 40, Math.sin(angle) * 6)) * 5.5;
  let topH = MESA_TOP + detailNoise(x * 0.09, z * 0.09) * 0.45 + 1.2 * gauss(x, z, LM.mesa.x + 7, LM.mesa.z - 6, 4);
  topH -= notch * smoothstep(-3.5, 0, edge) + 0.6 * smoothstep(-2.5, 0, edge);
  if (edge <= 0) return topH;
  const foot = base + 7;
  const wallW = (MESA_TOP - foot) / 6.2;
  const wall = (d, h0, w) => {
    if (d < w) return lerp(h0, foot, d / w);
    const t = clamp((d - w) / 13, 0, 1);
    return foot - 7 * (1 - (1 - t) * (1 - t)) - 1.2 * t;
  };
  let h2 = wall(edge, topH, wallW);
  const terrace = smoothstep(0.55, 0.9, Math.cos(angle - Math.PI * 1.08));
  if (terrace > 0) {
    const terraceW = 7 * terrace + mesaNoise(x * 0.2 + 3, z * 0.2) * 1.5 * terrace;
    const terraceTop = 37.5 + detailNoise(x * 0.2, z * 0.2) * 0.4;
    const terraceH =
      edge < 1
        ? lerp(topH, terraceTop, edge)
        : edge < 1 + terraceW
          ? terraceTop - (edge - 1) * 0.12
          : wall(edge - 1 - terraceW, terraceTop, (terraceTop - foot) / 6.2);
    h2 = lerp(h2, Math.min(topH, terraceH), terrace);
  }
  const south = Math.cos(angle - Math.PI / 2);
  const ledge = smoothstep(0.82, 0.95, south);
  if (ledge <= 0) return h2;
  const ledgeW = 5.8 * ledge + mesaNoise(x * 0.25, z * 0.25) * 0.8 * ledge;
  let ledgeH;
  ledgeH =
    edge < 1.1
      ? lerp(topH, 26.3, edge / 1.1)
      : edge < 1.1 + ledgeW
        ? 26.3 - (edge - 1.1) * 0.06 + detailNoise(x * 0.5, z * 0.5) * 0.08
        : wall(edge - 1.1 - ledgeW, MESA_LEDGE, (MESA_LEDGE - foot) / 6.2);
  return lerp(h2, ledgeH, ledge);
}
const TOWER_TOP = 15.5;
function towerHeight(x, z) {
  const dx = x - LM.tower.x;
  const dz = z - LM.tower.z;
  const dist = hypot(dx, dz);
  if (dist > 60) return -Infinity;
  const angle = Math.atan2(dz, dx);
  const topR = 12.5 + mesaNoise(Math.cos(angle) * 1.5 + 20, Math.sin(angle) * 1.5) * 1;
  const gentle = smoothstep(0.55, 0.95, Math.cos(angle - 1.95));
  const slope = lerp(1.35, 0.3, gentle);
  const beyond = Math.max(0, dist - topR);
  let h = TOWER_TOP - beyond * slope - beyond * beyond * 0.004;
  h += (ridgedFbm(cragNoise, x * 0.09, z * 0.09, 2) - 0.5) * 1.6 * smoothstep(0, 4, beyond) * (1 - gentle);
  if (beyond <= 0) h = TOWER_TOP + detailNoise(x * 0.15, z * 0.15) * 0.12;
  return h;
}
const CANYON_LINE = new Polyline([
  [55, -74],
  [54.5, -85],
  [56.5, -95],
  [59.5, -103],
  [60, -110],
]);
const APPROACH_LINE = new Polyline([
  [57, -72],
  [63, -66],
  [72, -55],
  [74, -38],
  [76, -20],
]);
const GROVE_FLOOR = 8.5;
const CANYON_FLOOR = 11.2;
const RIDGE_LINE = new Polyline([
  [14, -84],
  [34, -89],
  [54, -91],
  [76, -99],
  [96, -103],
  [114, -90],
]);
function ridgeHeight(x2, z) {
  const lineD = RIDGE_LINE.dist(x2, z);
  const along = RIDGE_LINE.t;
  const ringD = Math.abs(hypot(x2 - 60.5, z + 121) - 21);
  const d = smin(lineD, ringD, 5) + ridgeNoise(x2 * 0.05, z * 0.05) * 2.5;
  if (d > 45) return -Infinity;
  let h =
    31 + (ridgedFbm(ridgeNoise, x2 * 0.03 + 9, z * 0.03, 3) - 0.5) * 7 + fbm(ridgeNoise, x2 * 0.012, z * 0.012, 2) * 4;
  h +=
    4 * gauss(x2, z, 86, -104, 12) + 3 * gauss(x2, z, 40, -133, 10) - 3 * smoothstep(0.85, 1, along) * (lineD < ringD);
  return h - d * 0.3 - Math.max(0, d - 4) * 1.1 - Math.max(0, d - 12) * 0.6;
}
function groveRadiusAt(angle) {
  return 13.5 + lakeNoise(Math.cos(angle) * 1.2 + 11, Math.sin(angle) * 1.2) * 2.2;
}
const LAKE_RADIUS = 35.5;
function lakeRadiusAt(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return (
    LAKE_RADIUS +
    lakeNoise(c * 0.9, s * 0.9) * 4.5 +
    lakeNoise(c * 2.2 + 7, s * 2.2) * 2 +
    lakeNoise(c * 5 + 3, s * 5) * 0.7
  );
}
const ISLET_TOP = 3.2;
function lakeHeight(x, z) {
  const dx = x - LM.lake.x;
  const dz = z - LM.lake.z;
  const dist = hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const edge = dist - lakeRadiusAt(angle);
  const gentle = smoothstep(0.55, 0.95, Math.cos(angle - 0.8));
  const bluff = smoothstep(0.25, 0.6, lakeNoise(Math.cos(angle) * 2.5 + 60, Math.sin(angle) * 2.5));
  const slope = lerp(0.55 + bluff * 0.6, 0.22, gentle);
  let basin = edge >= 0 ? edge * slope : -Math.min(5.4, (-edge) ** 1.12 * 0.42);
  basin += detailNoise(x * 0.15, z * 0.15) * 0.25;
  const isletR = 6 + lakeNoise(Math.cos(angle) * 1.6 + 30, Math.sin(angle) * 1.6) * 0.9;
  let islet;
  if (dist < isletR + 1) {
    const t = dist / isletR;
    const fall = smoothstep(0.5, 1.05, t) ** 1.4;
    islet = ISLET_TOP + detailNoise(x * 0.4, z * 0.4) * 0.12 - fall * 3.8;
    islet +=
      (ridgedFbm(cragNoise, x * 0.3, z * 0.3, 2) - 0.45) *
      1.4 *
      smoothstep(0.45, 0.8, t) *
      (1 - smoothstep(0.9, 1.1, t));
    for (let i = 0; i < 4; i++) {
      const ang = i * 1.7 + 0.4;
      const bx = LM.lake.x + Math.cos(ang) * isletR * 0.78;
      const bz = LM.lake.z + Math.sin(ang) * isletR * 0.78;
      islet = Math.max(islet, 4.300000000000001 + (i % 2) * 0.7 - hypot(x - bx, z - bz) * 1.3);
    }
    if (dist >= isletR) islet = Math.min(islet, -0.2 - (dist - isletR) * 1.25 + 1.25);
  } else islet = -0.2 - (dist - isletR) * 1.25;
  return Math.max(basin, islet);
}
const PATHS = [
  [
    [0, 110],
    [2, 94],
    [-3, 76],
    [1, 58],
    [7, 40],
    [8, 24],
    [17, 14],
    [6, 3],
    [15, -7],
    [10, -15],
  ],
  [
    [0, 108],
    [13, 114],
    [30, 117],
    [47, 120],
    [62, 121],
  ],
  [
    [1, 84],
    [18, 76],
    [38, 67],
    [58, 60],
    [77, 54],
    [90, 40],
    [96, 22],
    [92, 6],
    [86, -6],
    [86, -14],
  ],
  [
    [88, 2],
    [79, -12],
    [75, -32],
    [72, -52],
    [65, -67],
    [57, -78],
    [55, -88],
    [57, -96],
    [60, -104],
    [60, -113],
  ],
  [
    [-1, 97],
    [-17, 87],
    [-32, 73],
    [-42, 61],
    [-49, 51],
  ],
  [
    [-47, 45],
    [-40, 26],
    [-43, 5],
    [-51, -16],
    [-57, -36],
    [-60, -49],
  ],
  [
    [1, 58],
    [-18, 42],
    [-33, 30],
    [-41, 24],
  ],
];
export function generateHeightmap() {
  const count = RES * RES;
  const heights = new Float32Array(count);
  const coast = new Float32Array(count);
  const cliff = new Float32Array(count);
  const path = new Float32Array(count);
  const dry = new Float32Array(count);
  const rockBias = new Float32Array(count);
  const sandstone = new Float32Array(count);
  const lush = new Float32Array(count);
  const pad = new Float32Array(count);
  const lakeMask = new Float32Array(count);
  const summit = LM.summit;
  const mesa = LM.mesa;
  const tower = LM.tower;
  const grove = LM.grove;
  const lake = LM.lake;
  for (let row = 0; row < RES; row++) {
    const z2 = row - HALF;
    for (let col = 0; col < RES; col++) {
      const x2 = col - HALF;
      const idx = row * RES + col;
      let h2 = 5.6;
      h2 += 8.5 * smoothstep(22, -112, z2);
      h2 += fbm(baseNoise, x2 * 0.011, z2 * 0.011, 4) * 4.2;
      h2 += fbm(baseNoise2, x2 * 0.034, z2 * 0.034, 3) * 1.1;
      h2 += 3.2 * gauss(x2, z2, LM.spawn.x, LM.spawn.z + 6, 34) - 2.4 * gauss(x2, z2, 4, 62, 34);
      h2 +=
        7 * gauss(x2, z2, 100, 64, 20) +
        6 * gauss(x2, z2, 68, 30, 16) +
        5 * gauss(x2, z2, 114, 24, 15) +
        4 * gauss(x2, z2, 58, 82, 15) +
        4 * gauss(x2, z2, 118, -2, 14);
      h2 +=
        6 * gauss(x2, z2, -22, -118, 16) +
        5 * gauss(x2, z2, 22, -112, 13) +
        4 * gauss(x2, z2, -10, -82, 12) -
        3 * gauss(x2, z2, 0, -100, 14);
      h2 += (ridgedFbm(ridgeNoise, x2 * 0.03 + 3, z2 * 0.03 + 8, 3) - 0.45) * 5 * smoothstep(-60, -100, z2);
      const lakeD = hypot(x2 - lake.x, z2 - lake.z);
      h2 = lerp(h2, 3.8 + fbm(baseNoise2, x2 * 0.05, z2 * 0.05, 2) * 0.9, smoothstep(78, 44, lakeD));
      const summitH = summitHeight(x2, z2);
      if (summitH > -Infinity) h2 = smax(h2, summitH, 6);
      const slopeH = southSlope(x2, z2);
      h2 = smax(h2, slopeH, 5);
      const ridgeH = ridgeHeight(x2, z2);
      if (ridgeH > -Infinity) h2 = smax(h2, ridgeH, 4);
      const approachD = APPROACH_LINE.dist(x2, z2);
      if (approachD < 50) {
        const floor = lerp(11, 12.5, APPROACH_LINE.t) + detailNoise(x2 * 0.06, z2 * 0.06) * 0.6;
        const halfW = lerp(5, 7, smoothstep(0, 0.3, APPROACH_LINE.t)) - lerp(0, 1, APPROACH_LINE.t);
        const beyond = Math.max(0, approachD - halfW);
        h2 = smin(h2, floor + beyond * 0.42 + beyond * beyond * 0.012, 4);
      }
      const towerH = towerHeight(x2, z2);
      if (towerH > -Infinity) h2 = smax(h2, towerH, 3);
      const base = h2;
      const mesaH = mesaHeight(x2, z2, base);
      if (mesaH > h2) h2 = mesaH;
      const spireA = spireHeight(x2, z2, -86, -50, 5.5, 25, base, 1);
      if (spireA > h2) h2 = spireA;
      const spireB = spireHeight(x2, z2, -34, -100, 4.5, 21, base, 2);
      if (spireB > h2) h2 = spireB;
      const spireC = spireHeight(x2, z2, -92, -96, 3.5, 17, base, 3);
      if (spireC > h2) h2 = spireC;
      const groveD = hypot(x2 - grove.x, z2 - grove.z);
      if (groveD < 60) {
        const rimR = groveRadiusAt(Math.atan2(z2 - grove.z, x2 - grove.x));
        const floor =
          GROVE_FLOOR + detailNoise(x2 * 0.1, z2 * 0.1) * 0.5 - 0.6 * gauss(x2, z2, grove.x + 4, grove.z - 3, 6);
        const beyond = Math.max(0, groveD - rimR);
        const bowl = floor + Math.min(beyond, 2.6) * 5.5 + Math.max(0, beyond - 2.6) * 1.7;
        h2 = smin(h2, bowl, 1.5);
      }
      const canyonD = CANYON_LINE.dist(x2, z2);
      if (canyonD < 40) {
        const along = CANYON_LINE.t;
        const floor = lerp(CANYON_FLOOR, 8.8, smoothstep(0, 1, along)) + detailNoise(x2 * 0.2, z2 * 0.2) * 0.2;
        const halfW = 3.4 + ridgeNoise(x2 * 0.08 + 50, z2 * 0.08) * 0.6;
        const beyond = Math.max(0, canyonD - halfW);
        const carve = floor + beyond * 7 + Math.max(0, beyond - 2.5) * -2.5;
        h2 = smin(h2, carve, 0.8);
      }
      if (lakeD < 90) {
        const basin = lakeHeight(x2, z2) + Math.max(0, lakeD - LAKE_RADIUS - 8) ** 2 * 0.045;
        h2 = smin(h2, basin, 0.2 + 2.8 * smoothstep(LAKE_RADIUS, 55.5, lakeD));
        lakeMask[idx] = smoothstep(52, 40, lakeD);
      }
      const cliffAmt = cliffMask(x2, z2);
      const coastD = coastDist(x2, z2, cliffAmt);
      cliff[idx] = cliffAmt;
      coast[idx] = coastD;
      if (coastD >= 0) {
        const rise = lerp(0.2, 3.4, cliffAmt);
        const knee = lerp(11, 2, cliffAmt);
        const cap =
          coastD * rise +
          (1 - cliffAmt) * 0.35 * smoothstep(0, 3, coastD) +
          Math.max(0, coastD - knee) ** 2 * lerp(0.035, 0.5, cliffAmt);
        h2 = smin(h2, cap, lerp(2.2, 0.6, cliffAmt));
      } else {
        const offshore = -coastD;
        const shelf = -(offshore < 7 ? offshore * 0.17 : 1.19 + (offshore - 7) * 0.58);
        const drop = -offshore * 2.6;
        h2 = lerp(shelf, drop, cliffAmt);
        h2 += fbm(detailNoise, x2 * 0.05, z2 * 0.05, 2) * 0.8 * smoothstep(3, 12, offshore);
      }
      const stackA = spireHeight(x2, z2, -104, -129, 4, 19, -10, 4);
      const stackB = spireHeight(x2, z2, -84, -141, 2.8, 11, -10, 5);
      const stackC = spireHeight(x2, z2, 128, -95, 3.5, 14, -10, 6);
      const stackD = spireHeight(x2, z2, -140, -30, 3, 9, -10, 7);
      h2 = Math.max(h2, stackA, stackB, stackC, stackD);
      h2 = Math.max(h2, 0.7 - hypot(x2 - 96, z2 - 132) * 0.55, 0.3 - hypot(x2 - 84, z2 - 140) * 0.6);
      heights[idx] = clamp(h2, -13.5, 71);
      const dryD = hypot(x2 - DRY_MEADOW.x, z2 - DRY_MEADOW.z) + fbm(maskNoise, x2 * 0.05, z2 * 0.05, 3) * 9;
      dry[idx] =
        (1 - smoothstep(DRY_MEADOW.radius - 8, DRY_MEADOW.radius + 3, dryD)) * (1 - smoothstep(34, 42, heights[idx]));
      let rockV = 0;
      const mesaD = hypot(x2 - mesa.x, z2 - mesa.z);
      if (mesaD < 40) {
        const rimR = mesaRadiusAt(Math.atan2(z2 - mesa.z, x2 - mesa.x));
        rockV = Math.max(
          rockV,
          smoothstep(rimR - 1.2, rimR + 0.2, mesaD) * (1 - smoothstep(rimR + 14, rimR + 22, mesaD)),
        );
        sandstone[idx] = Math.max(sandstone[idx], 1 - smoothstep(rimR + 12, rimR + 22, mesaD));
      }
      for (const [sx, sz, sr] of [
        [-86, -50, 5.5],
        [-34, -100, 4.5],
        [-92, -96, 3.5],
        [-104, -129, 4],
        [-84, -141, 2.8],
        [128, -95, 3.5],
        [-140, -30, 3],
      ]) {
        const d = hypot(x2 - sx, z2 - sz);
        if (d < sr + 10) {
          rockV = Math.max(rockV, 1 - smoothstep(sr + 3, sr + 7, d));
          if (sx < 0 && sz > -120) sandstone[idx] = Math.max(sandstone[idx], 1 - smoothstep(sr + 5, sr + 10, d));
        }
      }
      const summitD = hypot(x2 - summit.x, z2 - summit.z);
      rockV = Math.max(
        rockV,
        smoothstep(38, 50, h2 + fbm(maskNoise, x2 * 0.06, z2 * 0.06, 2) * 8) *
          (0.65 + 0.35 * smoothstep(0.4, 0.6, ridgedFbm(cragNoise, x2 * 0.08, z2 * 0.08, 2))),
      );
      if (lakeD < 12) rockV = Math.max(rockV, 1 - smoothstep(5, 7.5, lakeD));
      const towerD = hypot(x2 - tower.x, z2 - tower.z);
      if (towerD < 40) {
        const gentle = smoothstep(0.55, 0.95, Math.cos(Math.atan2(z2 - tower.z, x2 - tower.x) - 1.95));
        rockV = Math.max(rockV, smoothstep(12.5, 14, towerD) * (1 - smoothstep(19, 26, towerD)) * (1 - gentle) * 0.95);
      }
      rockBias[idx] = clamp(rockV, 0, 1);
      let lushV = 1;
      lushV *= lerp(1, 0.75, gauss(x2, z2, 88, 45, 38));
      lushV *= lerp(1, 0.8, smoothstep(-60, -110, z2));
      lushV *= smoothstep(-2, 10, coastD);
      lushV = Math.max(lushV, gauss(x2, z2, grove.x, grove.z, 14));
      lush[idx] = clamp(lushV, 0, 1);
      let padV = 0;
      padV = Math.max(padV, 1 - smoothstep(4, 6.5, mesaD));
      padV = Math.max(padV, (1 - smoothstep(10, 13, towerD)) * 0.8);
      padV = Math.max(padV, 1 - smoothstep(4, 7, lakeD));
      padV = Math.max(padV, 1 - smoothstep(3, 5, groveD));
      padV = Math.max(padV, 1 - smoothstep(3, 6, summitD));
      pad[idx] = padV;
    }
  }
  for (const route of PATHS) {
    const pts = catmullRom(route, 0.5);
    for (let i = 0; i < pts.length; i++) {
      const px = pts[i][0];
      const pz = pts[i][1];
      const along = i / (pts.length - 1);
      const radius = 1.05 + pathNoise(px * 0.06, pz * 0.06) * 0.3 - 0.35 * smoothstep(0.85, 1, along);
      const reach = Math.ceil(radius + 1.5);
      const gx = Math.round(px + HALF);
      const gz = Math.round(pz + HALF);
      for (let j = -reach; j <= reach; j++)
        for (let k = -reach; k <= reach; k++) {
          const ix = gx + k;
          const iz = gz + j;
          if (ix < 0 || iz < 0 || ix >= RES || iz >= RES) continue;
          const d2 = hypot(ix - HALF - px, iz - HALF - pz);
          const w = 1 - smoothstep(radius - 0.7, radius + 0.7, d2);
          const idx = iz * RES + ix;
          if (w > path[idx]) path[idx] = w;
        }
    }
  }
  {
    const src = heights.slice();
    for (let i = 2; i < RES - 2; i++)
      for (let j = 2; j < RES - 2; j++) {
        const idx = i * RES + j;
        const w = path[idx];
        if (w <= 0 || src[idx] < 0.3) continue;
        let sum = 0;
        for (let k = -2; k <= 2; k++) for (let l = -2; l <= 2; l++) sum += src[idx + k * RES + l];
        heights[idx] = lerp(src[idx], sum / 25, w * 0.85) - 0.12 * w;
      }
    for (let i = 0; i < count; i++) if (heights[i] < 0.6) path[i] *= smoothstep(0.1, 0.6, heights[i]);
  }
  return {
    heights,
    coast,
    cliff,
    path,
    dry,
    rockBias,
    sandstone,
    lush,
    pad,
    lake: lakeMask,
  };
}
export const HEIGHTS = {
  MESA_TOP,
  MESA_LEDGE,
  TOWER_TOP,
  ISLET_TOP,
  GROVE_FLOOR,
};
