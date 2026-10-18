/**
 * Ruins of the Painted Aerie: the undersides of every isle (stalactites, roots, hanging crystals, floating debris), the main isle's tiered temple with stairs, lens obelisks, colonnade, easel circle and rose gate, and the stepstone, cascade, stormcrag and highwind ruins. Also collects the platforms, falls, pools, trees and ink plants they add.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { makeRng } from '../core/math.js';
import { columnGeometry, displace, mergeGeometries, rockGeometry, roundedBox, taperedTube } from '../shared/util.js';
import { toQuat } from './builder.js';
import {
  buildArch,
  crystalGeometry,
  faceted,
  gemGeometry,
  PAINT_COLORS,
  PASTELS,
  STONE,
  STONE_TINTS,
  taperedBox,
  tierGeometry,
  TWO_PI,
  UP,
  v3,
} from './ruin-parts.js';
export function buildAerieRuins(b, isles, heightAt, quality) {
  const out = {
    platforms: [],
    haloGeo: null,
    grand: {
      pos: v3(0, 0, 0),
      facing: 0,
    },
    lenses: [],
    falls: [],
    pools: [],
    clear: [],
    trees: [],
    ink: [],
  };
  const rng = makeRng('aerie-ruins');
  const low = quality === 'low';
  for (const isle of isles.values()) buildUnderside(b, isle, rng, low);
  const main = isles.get('main');
  if (main) buildMainRuins(b, main, heightAt, rng, out);
  const stepstone = isles.get('stepstone');
  if (stepstone) buildStepstoneRuins(b, stepstone, heightAt, rng, out);
  const cascade = isles.get('cascade');
  if (cascade) buildCascadeRuins(b, cascade, heightAt, rng, out);
  const stormcrag = isles.get('stormcrag');
  if (stormcrag) buildStormcragRuins(b, stormcrag, heightAt, rng, out);
  const highwind = isles.get('highwind');
  if (highwind) buildHighwindRuins(b, highwind, heightAt, rng, out);
  return out;
}
export function buildUnderside(b, isle, rng, low, crystalColors = PASTELS, options = {}) {
  const def = isle.def;
  const rand = (lo, hi) => lo + (hi - lo) * rng();
  const tmp = v3(0, 0, 0);
  const spikeCount = Math.round(3 + def.r / 5);
  for (let i = 0; i < spikeCount; i++) {
    const angle = rng() * TWO_PI;
    const radial = rand(0.22, 0.62);
    isle.undersideBelow(angle, radial, tmp);
    const len = def.depth * rand(0.3, 0.62);
    const radius = def.r * rand(0.07, 0.14);
    const geometry = new ConeGeometry(radius, len, 7, 6);
    geometry.rotateX(Math.PI);
    geometry.translate(0, -len / 2 + 1.2, 0);
    displace(geometry, radius * 0.22, 0.9 / radius, rng() * 99);
    b.rock(geometry, tmp.clone(), rand(0, TWO_PI), undefined, [1, 0, 0, 0]);
  }
  const boulderCount = Math.round(4 + def.r * 0.3);
  for (let i = 0; i < boulderCount; i++) {
    const angle = rng() * TWO_PI;
    const radial = rand(0.45, 0.95);
    isle.undersideBelow(angle, radial, tmp);
    const size = def.r * rand(0.1, 0.2);
    const rock = rockGeometry(size, rng() * 100, rand(0.7, 1.1));
    const outward = v3(tmp.x - isle.cx, 0, tmp.z - isle.cz)
      .normalize()
      .multiplyScalar(size * 0.15);
    b.rock(
      rock,
      tmp
        .clone()
        .add(outward)
        .add(v3(0, size * 0.2, 0)),
      new Euler(rand(-0.4, 0.4), rng() * TWO_PI, rand(-0.4, 0.4)),
    );
  }
  const rootCount = options.roots === false ? 0 : Math.round((low ? 0.5 : 1) * (6 + def.r * 0.8));
  for (let i = 0; i < rootCount; i++) {
    const angle = rng() * TWO_PI;
    const start = isle.undersideAt(angle, 1 + Math.floor(rng() * 2), v3(0, 0, 0));
    const outDir = v3(start.x - isle.cx, 0, start.z - isle.cz).normalize();
    const drop = rand(2, 7.5);
    const pts = [start.clone().addScaledVector(outDir, -0.4)];
    const side = v3(-outDir.z, 0, outDir.x);
    let cur = start.clone();
    for (let j = 1; j <= 5; j++) {
      cur = cur
        .clone()
        .add(v3(0, -drop / 5, 0))
        .addScaledVector(outDir, j === 1 ? 0.35 : rand(-0.2, 0.25))
        .addScaledVector(side, rand(-0.35, 0.35));
      pts.push(cur);
    }
    const curve = new CatmullRomCurve3(pts);
    const thick = rand(0.09, 0.22);
    const root = taperedTube(curve, 10, 5, (t) => thick * (1 - t * 0.85) + 0.015);
    b.rock(root, v3(0, 0, 0), undefined, undefined, [0, 0, 0, 1]);
  }
  const clusterCount = Math.round(2 + def.r / 8);
  for (let i = 0; i < clusterCount; i++) {
    const angle = rng() * TWO_PI;
    const radial = rand(0.35, 0.8);
    isle.undersideBelow(angle, radial, tmp);
    const color = crystalColors[Math.floor(rng() * crystalColors.length)];
    const shardCount = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < shardCount; j++) {
      const len = rand(0.8, 2.6) * (j === 0 ? 1.4 : 1);
      const shard = crystalGeometry(len, len * rand(0.12, 0.18));
      const euler = new Euler(Math.PI + rand(-0.5, 0.5), rand(0, TWO_PI), rand(-0.5, 0.5), 'YXZ');
      b.glass(
        shard,
        tmp.clone().add(v3(rand(-0.8, 0.8), 0.25, rand(-0.8, 0.8))),
        euler,
        color,
        options.crystalGlow ?? 1.2,
      );
    }
  }
  const debrisCount = Math.round((low ? 0.5 : 1) * (2 + def.r * 0.22));
  for (let i = 0; i < debrisCount; i++) {
    const angle = rng() * TWO_PI;
    const lip = isle.lipAt(angle, v3(0, 0, 0), tmp);
    const outDir = tmp.clone();
    const dist = rand(4, 10 + def.r * 0.35);
    const size = rand(0.3, 0.8) * (i % 4 == 0 ? 2 : 1);
    const pos = lip
      .clone()
      .addScaledVector(outDir, dist)
      .add(v3(0, rand(-10, 3), 0));
    const rock = rockGeometry(size, rng() * 100, 0.7);
    b.rock(
      rock,
      pos,
      new Euler(rand(-0.3, 0.3), rand(0, TWO_PI), rand(-0.3, 0.3)),
      undefined,
      [size > 1.2 ? 0.55 : 1, 0, 0, 0],
      0.05 + rng() * 0.95,
    );
  }
}
export function placeBoulder(b, x, z, y, size, rng, solid = true) {
  const rock = rockGeometry(size, rng() * 100, 0.62 + rng() * 0.2);
  const pos = v3(x, y - size * 0.25, z);
  b.rock(rock, pos, new Euler((rng() - 0.5) * 0.3, rng() * TWO_PI, (rng() - 0.5) * 0.3));
  if (solid && size > 0.45)
    b.hull(rock, {
      kind: 'rock',
      surface: 'rock',
    });
}
export function placeLampPost(b, x, z, y, rng, color = 16769704) {
  b.stone(
    columnGeometry(0.2, 2.4, {
      capital: true,
      flutes: 8,
      seed: rng() * 50,
      segments: 12,
    }),
    v3(x, y - 0.15, z),
    rng() * TWO_PI,
    STONE.pale,
  );
  b.stone(taperedBox(0.55, 0.55, 0.36, 0.36, 0.18), v3(x, y + 2.3, z), 0, STONE.marble);
  b.glass(gemGeometry(0.24, 1.5), v3(x, y + 2.85, z), rng() * TWO_PI, color, 2.2);
  b.stone(taperedBox(0.5, 0.5, 0.02, 0.02, 0.45), v3(x, y + 3.25, z), Math.PI / 4, STONE.marble);
  b.cyl(v3(x, y + 1.3, z), 1.3, 0.3);
}
function placeWindChime(b, pos, count, radius, rng, colors = PASTELS) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TWO_PI + rng() * 0.3;
    const hang = pos.clone().add(v3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    const len = 0.5 + rng() * 0.8;
    const thread = new CylinderGeometry(0.008, 0.008, 0.35, 3, 1);
    thread.translate(0, -0.175, 0);
    b.glass(thread, hang.clone(), 0, 14540253, 0.1, {
      pivot: hang.clone(),
      amount: 0.22,
    });
    const rod = new CylinderGeometry(0.045, 0.045, len, 6, 1);
    rod.translate(0, -0.35 - len / 2, 0);
    b.glass(rod, hang.clone(), 0, colors[i % colors.length], 1.4, {
      pivot: hang.clone(),
      amount: 0.22 + rng() * 0.1,
    });
  }
  const clapper = new SphereGeometry(0.07, 6, 5);
  clapper.translate(0, -0.7, 0);
  b.glass(clapper, pos.clone(), 0, 16773320, 1.6, {
    pivot: pos.clone(),
    amount: 0.3,
  });
}
function buildMainRuins(b2, isle, heightAt, rng, out) {
  const cx = isle.cx;
  const cz = isle.cz;
  const rand = (lo, hi) => lo + (hi - lo) * rng();
  const groundAt = (dx, dz) => heightAt(cx + dx, cz + dz, isle.def.y);
  const at = (dx, y, dz) => v3(cx + dx, y, cz + dz);
  const baseY = groundAt(0, 0);
  const tiers = [
    {
      r: 9.4,
      h: 1.3,
    },
    {
      r: 6.9,
      h: 1.3,
    },
    {
      r: 4.6,
      h: 1.2,
    },
  ];
  let tierTop = baseY;
  tiers.forEach((tier, i) => {
    const y0 = i === 0 ? baseY - 0.8 : tierTop - 0.1;
    const tierH = tierTop + tier.h - y0;
    const tierGeo = tierGeometry(tier.r, tierH, i * 7.1);
    b2.stone(tierGeo, at(0, y0, 0), 0, i === 1 ? STONE.marble : STONE.pale);
    const hullPts = [];
    for (let i = 0; i < 8; i++) {
      const angle = -Math.PI / 8 + (i * Math.PI) / 4;
      for (const y of [y0, y0 + tierH]) hullPts.push(cx + Math.sin(angle) * tier.r, y, cz + Math.cos(angle) * tier.r);
    }
    const hullGeo = new BufferGeometry();
    hullGeo.setAttribute('position', new Float32BufferAttribute(hullPts, 3));
    b2.hull(
      hullGeo,
      {
        kind: 'structure',
        surface: 'stone',
      },
      64,
    );
    hullGeo.dispose();
    tierTop = y0 + tierH;
    out.platforms.push({
      kind: 'disc',
      x: cx,
      z: cz,
      r: tier.r * Math.cos(Math.PI / 8) - 0.1,
      y: tierTop,
    });
    const apothem = tier.r * Math.cos(Math.PI / 8);
    if (i < 2)
      for (let j = 1; j < 8; j++) {
        const angle = (j * Math.PI) / 4;
        const dir = v3(Math.sin(angle), 0, Math.cos(angle));
        const panelPos = at(dir.x * (apothem + 0.02), tierTop - tier.h * 0.55, dir.z * (apothem + 0.02));
        const pane = new BoxGeometry(tier.r * 0.42, tier.h * 0.42, 0.08);
        b2.glass(faceted(pane), panelPos, angle, PAINT_COLORS[(j + i) % 4], 0.9);
        const sill = roundedBox(tier.r * 0.5, 0.1, 0.16, 0.03, 1);
        b2.stone(sill, panelPos.clone().add(v3(0, tier.h * 0.25, 0)), angle, STONE.marble);
        b2.stone(
          roundedBox(tier.r * 0.5, 0.1, 0.16, 0.03, 1),
          panelPos.clone().add(v3(0, -tier.h * 0.25, 0)),
          angle,
          STONE.marble,
        );
      }
  });
  const topY = tierTop;
  const dais = new CylinderGeometry(2.5, 2.7, 0.4, 24, 1);
  dais.translate(0, 0.2, 0);
  b2.stone(displace(faceted(dais), 0.015, 1.5, 3), at(0, topY - 0.05, 0), 0, STONE.marble);
  b2.cyl(at(0, topY + 0.15, 0), 0.2, 2.6);
  const daisY = topY + 0.35;
  out.platforms.push({
    kind: 'disc',
    x: cx,
    z: cz,
    r: 2.5,
    y: daisY,
  });
  for (let i = 0; i < 4; i++) {
    const inlay = new CylinderGeometry(2.2, 2.2, 0.03, 12, 1, false, (i * Math.PI) / 2 + 0.04, Math.PI / 2 - 0.08);
    b2.glass(faceted(inlay), at(0, daisY + 0.005, 0), 0, PAINT_COLORS[i], 0.6);
  }
  out.grand.pos = at(0, daisY, 0);
  out.grand.facing = 0;
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.sin(angle) * 3.65;
    const z = Math.cos(angle) * 3.65;
    const obeliskH = 6.4;
    b2.stone(taperedBox(0.8, 0.8, 0.42, 0.42, obeliskH), at(x, topY - 0.05, z), angle, STONE.pale);
    b2.stone(taperedBox(1, 1, 1, 1, 0.25), at(x, topY - 0.05, z), angle, STONE.marble);
    b2.stone(taperedBox(0.62, 0.62, 0.56, 0.56, 0.2), at(x, topY + obeliskH * 0.62, z), angle, STONE.marble);
    b2.stone(taperedBox(0.56, 0.56, 0.02, 0.02, 0.9), at(x, topY + obeliskH - 0.1, z), angle, STONE.marble);
    const lensPos = at(x, topY + obeliskH * 0.62 + 0.75, z);
    b2.glass(gemGeometry(0.4, 1.5), lensPos, angle, PAINT_COLORS[i], 2.2);
    out.lenses.push(lensPos);
    b2.box(at(x, topY + obeliskH / 2, z), 0.38, obeliskH / 2, 0.38, angle);
  }
  {
    const topZ = tiers[2].r * Math.cos(Math.PI / 8);
    const rise = (topY - baseY) / 12;
    const run = 0.72;
    const width = 3.4;
    for (let i = 0; i < 12; i++) {
      const z = topZ + (11 - i) * run;
      const stepH = baseY + (i + 1) * rise - (baseY - 0.6);
      const step = roundedBox(width, stepH, 0.77, 0.04, 0.8);
      displace(step, 0.015, 1.5, i);
      b2.stone(step, at(0, baseY - 0.6 + stepH / 2, z + run / 2), 0, i % 3 == 0 ? STONE.marble : STONE.pale);
    }
    const footZ = topZ + 12 * run;
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const z0 = topZ + (12 * run * (2 - i)) / 3;
        const z1 = z0 + (12 * run) / 3;
        const wallH = baseY + (12 - (z1 - topZ) / run + 4) * rise + 0.55 - (baseY - 0.5);
        const wall = roundedBox(0.45, wallH, z1 - z0 + 0.02, 0.06, 1);
        displace(wall, 0.02, 1.3, i + side);
        b2.stone(wall, at(side * 1.92, baseY - 0.5 + wallH / 2, (z0 + z1) / 2), 0, STONE.marble);
        b2.box(at(side * 1.92, baseY - 0.5 + wallH / 2, (z0 + z1) / 2), 0.22, wallH / 2, (z1 - z0) / 2);
      }
    placeLampPair(b2, at(-1.95, 0, footZ + 0.4), at(1.95, 0, footZ + 0.4), heightAt, isle.def.y, rng);
    const rampY0 = baseY + rise * 0.5;
    const rampY1 = topY + 0.02;
    const rampZ0 = footZ;
    const rampZ1 = topZ - 0.05;
    const rampLen = Math.hypot(rampZ0 - rampZ1, rampY1 - rampY0);
    const slope = Math.atan2(rampY1 - rampY0, rampZ0 - rampZ1);
    const rampUp = v3(0, Math.cos(slope), Math.sin(slope));
    const rampDir = v3(0, -Math.sin(slope), Math.cos(slope));
    const rampCenter = at(0, (rampY0 + rampY1) / 2, (rampZ0 + rampZ1) / 2)
      .addScaledVector(rampUp, -0.15)
      .addScaledVector(rampDir, 0.25);
    b2.box(rampCenter, width / 2, 0.15, rampLen / 2 + 0.25, new Euler(slope, 0, 0));
    out.platforms.push({
      kind: 'ramp',
      x0: cx,
      z0: cz + rampZ0,
      y0: baseY,
      x1: cx,
      z1: cz + rampZ1,
      y1: topY,
      hw: width / 2,
    });
    out.clear.push({
      x: cx,
      z: cz + (rampZ0 + rampZ1) / 2,
      r: 3.2,
    });
  }
  out.clear.push({
    x: cx,
    z: cz,
    r: 10.2,
  });
  out.haloGeo = haloGeometry(rng);
  {
    const angles = [];
    for (let deg = 228; deg <= 312; deg += 12) angles.push((deg * Math.PI) / 180);
    const tops = [];
    angles.forEach((angle, i) => {
      const x = Math.cos(angle) * 15;
      const z = Math.sin(angle) * 15;
      const y = groundAt(x, z);
      const brokenH = i === 2 || i === 5 ? rand(1.6, 2.8) : i === 7 ? 3.4 : 0;
      const height = brokenH || 5.2;
      const column = columnGeometry(0.46, height + 0.3, {
        capital: !brokenH,
        broken: brokenH ? 0.4 : 0,
        seed: i * 13.1,
        flutes: 14,
      });
      b2.stone(
        column,
        at(x, y - 0.3, z),
        new Euler((rng() - 0.5) * 0.03, rng() * TWO_PI, (rng() - 0.5) * 0.03),
        STONE_TINTS[i % STONE_TINTS.length],
      );
      b2.cyl(at(x, y + height / 2, z), height / 2, 0.5);
      tops.push(brokenH ? null : at(x, y + height, z));
      out.clear.push({
        x: cx + x,
        z: cz + z,
        r: 1,
      });
      if (brokenH) {
        const fallAngle = angle + (rng() - 0.5) * 0.6;
        const fx = x + Math.cos(fallAngle) * 2.2;
        const fz = z + Math.sin(fallAngle) * 2.2;
        const fy = groundAt(fx, fz);
        const drum = columnGeometry(0.44, 1.2, {
          base: false,
          broken: 0.2,
          seed: i * 3.3,
          flutes: 14,
        });
        drum.translate(0, -0.6, 0);
        const rot = new Quaternion()
          .setFromAxisAngle(UP, rng() * TWO_PI)
          .multiply(new Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2));
        b2.stone(drum, v3(cx + fx, fy + 0.35, cz + fz), rot, STONE.pale);
        b2.cyl(v3(cx + fx, fy + 0.35, cz + fz), 0.6, 0.44, rot);
      }
    });
    for (let i = 0; i + 1 < tops.length; i++) {
      const topA = tops[i];
      const topB = tops[i + 1];
      if (!topA || !topB) continue;
      const mid = topA.clone().add(topB).multiplyScalar(0.5);
      const span = topA.distanceTo(topB) + 1.1;
      const yaw = Math.atan2(topB.x - topA.x, topB.z - topA.z) + Math.PI / 2;
      const lintel = roundedBox(span, 0.55, 0.95, 0.08, 1);
      displace(lintel, 0.03, 1.1, i);
      b2.stone(lintel, mid.clone().add(v3(0, 0.28, 0)), yaw, STONE.marble);
      if (i % 2 == 0) placeWindChime(b2, mid.clone().add(v3(0, -0.02, 0)), 5, 0.22, rng);
    }
  }
  {
    const designs = [0, 1, 2, 3, 4];
    [70, 125, 180, 235, 290].forEach((deg, i) => {
      const angle = (deg * Math.PI) / 180;
      const x = -22 + Math.cos(angle) * 12.4;
      const z = 2 + Math.sin(angle) * 12.4;
      const y = groundAt(x, z);
      const facing = Math.atan2(-22 - x, 2 - z);
      placeEasel(b2, at(x, y, z), facing, designs[i], rng, 1.25);
      out.clear.push({
        x: cx + x,
        z: cz + z,
        r: 2.6,
      });
    });
    const centerY = groundAt(-22, 2);
    for (let i = 0; i < 4; i++) {
      const inlay = new CylinderGeometry(2.6, 2.6, 0.06, 16, 1, false, (i * Math.PI) / 2 + 0.05, Math.PI / 2 - 0.1);
      b2.glass(faceted(inlay), at(-22, centerY + 0.01, 2), Math.PI / 4, PAINT_COLORS[i], 0.45);
    }
    const ring = new TorusGeometry(2.75, 0.14, 5, 32);
    ring.rotateX(Math.PI / 2);
    b2.stone(faceted(ring), at(-22, centerY + 0.02, 2), 0, STONE.marble);
    out.clear.push({
      x: cx + -22,
      z: cz + 2,
      r: 3.2,
    });
  }
  {
    [-65, -25, 20, 60, 100, 245, 290].forEach((deg, i) => {
      const angle = (deg * Math.PI) / 180;
      const x = 22 + Math.cos(angle) * rand(11.2, 12.4);
      const z = -5 + Math.sin(angle) * rand(11.2, 12.4);
      const y = groundAt(x, z);
      placeCrystalCluster(b2, at(x, y, z), angle, PAINT_COLORS[i % 4], rand(2.2, 4.4), rng);
      out.clear.push({
        x: cx + x,
        z: cz + z,
        r: 2.2,
      });
    });
    const gateAngle = 0.05;
    const gx = 22 + Math.cos(gateAngle) * 11.5;
    const gz = -5 + Math.sin(gateAngle) * 11.5;
    placeRoseGate(b2, at(gx, groundAt(gx, gz), gz), Math.PI / 2 + gateAngle, rng);
    out.clear.push({
      x: cx + gx,
      z: cz + gz,
      r: 3.5,
    });
    for (let i = 0; i < 14; i++) {
      const angle = rng() * TWO_PI;
      const dist = rand(3, 10);
      const x = 22 + Math.cos(angle) * dist;
      const z = -5 + Math.sin(angle) * dist;
      const shard = crystalGeometry(rand(0.3, 0.8), rand(0.06, 0.12));
      b2.glass(
        shard,
        at(x, groundAt(x, z) - 0.05, z),
        new Euler(rand(-0.5, 0.5), rng() * TWO_PI, rand(-0.5, 0.5)),
        PAINT_COLORS[i % 4],
        1,
      );
    }
  }
  placeLampPair(b2, at(-8.4, 0, 21.8), at(-1.6, 0, 21.4), heightAt, isle.def.y, rng);
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI * (0.22 + i * 0.19) + (rng() - 0.5) * 0.1;
    const x = -5 + Math.cos(angle) * 6.2;
    const z = 25 + Math.sin(angle) * 6.2;
    placeBoulder(b2, cx + x, cz + z, groundAt(x, z), rand(0.45, 0.8), rng);
  }
  out.clear.push({
    x: cx + -5,
    z: cz + 25,
    r: 5.5,
  });
  {
    const poolY = groundAt(13, 25);
    out.pools.push({
      pos: at(13, poolY + 0.22, 25),
      r: 2.1,
    });
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * TWO_PI + 0.3;
      if (Math.abs(((angle - 1.2 + TWO_PI) % TWO_PI) - Math.PI) > Math.PI - 0.45) continue;
      const x = 13 + Math.cos(angle) * 2.5;
      const z = 25 + Math.sin(angle) * 2.5;
      placeBoulder(b2, cx + x, cz + z, groundAt(x, z), rand(0.45, 0.8), rng, false);
    }
    const angle = Math.atan2(25, 13);
    const dir = v3(0, 0, 0);
    const lip = isle.lipAt(angle, v3(0, 0, 0), dir);
    out.falls.push({
      lip,
      dir,
      width: 3.2,
      from: at(13, poolY + 0.22, 25),
      drop: 50,
    });
    out.clear.push({
      x: cx + 13,
      z: cz + 25,
      r: 2.8,
    });
    out.clear.push({
      x: (cx + 13 + lip.x) / 2,
      z: (cz + 25 + lip.z) / 2,
      r: 1.6,
    });
  }
  for (const [x, z, size] of [
    [-30, -14, 1.4],
    [-27, -19, 0.9],
    [26, 12, 1.2],
    [29, 9, 0.8],
    [8, -30, 1.1],
    [-10, -30, 0.9],
    [22, 23, 0.9],
    [-24, 19, 1],
    [-14, 28, 0.7],
    [31, -12, 0.8],
    [-3, -31, 0.7],
    [17, -27, 1],
  ])
    placeBoulder(b2, cx + x, cz + z, groundAt(x, z), size * rand(0.9, 1.25), rng);
  for (const [x, z, scale, species] of [
    [-14, -21, 1, 'blossom'],
    [12, -22, 0.95, 'blossom'],
    [-24, -13, 0.9, 'birch'],
    [-20, -24, 0.85, 'birch'],
    [5, -27, 0.8, 'birch'],
    [26, 17, 0.9, 'blossom'],
    [-15, 20, 0.95, 'blossom'],
    [7, 21, 0.8, 'birch'],
    [-27, 17, 0.8, 'birch'],
    [30, -21, 0.85, 'blossom'],
  ])
    out.trees.push({
      x: cx + x,
      z: cz + z,
      s: scale,
      sp: species,
    });
}
function haloGeometry(rng) {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    if (i === 3 || i === 7) continue;
    const start = (i / 9) * TWO_PI + 0.05;
    const arc = TWO_PI / 9 - 0.1 - rng() * 0.08;
    const torus = new TorusGeometry(4.2, 0.34, 6, 10, arc);
    torus.rotateZ(start);
    const seg = faceted(torus);
    displace(seg, 0.05, 1.2, i);
    const color = new Color(STONE_TINTS[i % STONE_TINTS.length]);
    const colors = new Float32Array(seg.attributes.position.count * 3);
    for (let j = 0; j < seg.attributes.position.count; j++) colors.set([color.r, color.g, color.b], j * 3);
    seg.setAttribute('color', new BufferAttribute(colors, 3));
    parts.push(seg);
    const mid = start + arc / 2;
    const octa = new OctahedronGeometry(0.34, 0);
    octa.translate(Math.cos(mid) * 4.2, Math.sin(mid) * 4.2, 0);
    const gem = faceted(octa);
    const gemColor = new Color(PAINT_COLORS[i % 4]);
    const gemColors = new Float32Array(gem.attributes.position.count * 3);
    for (let j = 0; j < gem.attributes.position.count; j++) gemColors.set([gemColor.r, gemColor.g, gemColor.b], j * 3);
    gem.setAttribute('color', new BufferAttribute(gemColors, 3));
    parts.push(gem);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}
function placeLampPair(b, left, right, heightAt, baseY, rng) {
  for (const pos of [left, right]) placeLampPost(b, pos.x, pos.z, heightAt(pos.x, pos.z, baseY), rng);
}
function placeEasel(b2, pos, yaw, design, rng, scale = 1) {
  const rot = toQuat(yaw);
  const at = (x, y, z) =>
    v3(x * scale, y * scale, z * scale)
      .applyQuaternion(rot)
      .add(pos);
  const lean = 0.17;
  const legLen = 8.2;
  for (const side of [-1, 1]) {
    const leg = taperedBox(0.4, 0.34, 0.26, 0.24, legLen);
    const legRot = rot.clone().multiply(new Quaternion().setFromEuler(new Euler(-0.17, 0, side * 0.12)));
    const legPos = at(side * 1.85, -0.3, 0.55);
    b2.stone(leg, legPos, legRot, STONE.warm, scale);
    const legMid = v3(0, (legLen * scale) / 2, 0)
      .applyQuaternion(legRot)
      .add(legPos);
    b2.box(legMid, 0.2 * scale, (legLen * scale) / 2, 0.17 * scale, legRot);
  }
  {
    const backLeg = taperedBox(0.34, 0.3, 0.22, 0.22, legLen * 0.98);
    const backRot = rot.clone().multiply(new Quaternion().setFromEuler(new Euler(0.38, 0, 0)));
    const backPos = at(0, -0.3, -2.7);
    b2.stone(backLeg, backPos, backRot, STONE.warm, scale);
  }
  const tray = roundedBox(4.6, 0.28, 0.62, 0.06, 1);
  b2.stone(
    tray,
    at(0, 2, 0.1),
    rot.clone().multiply(new Quaternion().setFromEuler(new Euler(-0.17, 0, 0))),
    STONE.pale,
    scale,
  );
  const canvasH = 4.8;
  const geometry = new BoxGeometry(4, canvasH, 0.24, 14, 16, 1);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  const linen = new Color(0xe9dfca);
  const palette = CANVAS_PALETTES[design % CANVAS_PALETTES.length];
  const phase = rng() * 10;
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) / 4 + 0.5;
    const v2 = position.getY(i) / canvasH + 0.5;
    if (!(position.getZ(i) > 0.05)) color.copy(linen).multiplyScalar(0.92);
    else {
      const painted =
        u * 0.7 + (1 - v2) * 0.45 + Math.sin(v2 * 9 + phase) * 0.06 + Math.sin(u * 13 + phase) * 0.04 < 0.78;
      const band = Math.min(
        palette.length - 1,
        Math.max(0, Math.floor((1 - v2) * palette.length + Math.sin(u * 5 + phase) * 0.6)),
      );
      color.set(palette[band]);
      const shade = 0.9 + 0.2 * Math.sin(u * 23 + v2 * 7 + phase);
      color.multiplyScalar(shade);
      if (!painted)
        color.copy(linen).lerp(new Color(0x8a7e70), Math.abs(Math.sin(u * 11 + v2 * 17 + phase)) > 0.97 ? 0.8 : 0);
    }
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const canvasRot = rot.clone().multiply(new Quaternion().setFromEuler(new Euler(-0.17, 0, 0)));
  const canvasPos = at(0, 2.15 + (canvasH / 2) * Math.cos(lean), 0.1 - (Math.sin(lean) * canvasH) / 2);
  const canvas = faceted(geometry);
  b2.stone(canvas, canvasPos, canvasRot, 16777215, scale);
  b2.box(canvasPos, 2 * scale, (canvasH / 2) * scale, 0.14 * scale, canvasRot);
  b2.stone(
    roundedBox(1, 0.3, 0.5, 0.06, 1),
    at(0, 2.2 + canvasH * Math.cos(lean) + 0.1, 0.1 - Math.sin(lean) * canvasH - 0.05),
    canvasRot,
    STONE.pale,
    scale,
  );
}
const CANVAS_PALETTES = [
  [4157400, 7317740, 15904964, 16173434, 15764043, 12865386],
  [8308976, 12445431, 8372074, 5151306, 3832460, 3103352],
  [16244874, 15905626, 15234122, 12143724, 7097498, 3816056],
  [16735034, 16766023, 5822059, 5030911, 10780640, 16735034],
  [13625591, 10473711, 16777215, 15004152, 9225454, 6266838],
];
function placeCrystalCluster(b, pos, lean, color, size, rng) {
  const rand = (lo, hi) => lo + (hi - lo) * rng();
  const count = 4 + Math.floor(rng() * 3);
  const leanX = Math.cos(lean);
  const leanZ = Math.sin(lean);
  for (let i = 0; i < count; i++) {
    const len = i === 0 ? size : size * rand(0.35, 0.75);
    const shard = crystalGeometry(len, len * rand(0.1, 0.14));
    const offset = v3(rand(-0.7, 0.7), -0.25, rand(-0.7, 0.7));
    const euler = new Euler(rand(-0.25, 0.25) + leanZ * 0.25, rng() * TWO_PI, rand(-0.25, 0.25) - leanX * 0.25, 'YXZ');
    b.glass(shard, pos.clone().add(offset), euler, color, 1.1);
  }
  const base = rockGeometry(0.9, rng() * 50, 0.45);
  b.rock(base, pos.clone().add(v3(0, -0.15, 0)), rng() * TWO_PI);
  b.cyl(pos.clone().add(v3(0, size * 0.4, 0)), size * 0.4, 0.75, undefined, {
    kind: 'structure',
    surface: 'stone',
  });
}
function placeRoseGate(b2, pos, yaw, rng) {
  const rot = toQuat(yaw);
  const at = (x, y, z) => v3(x, y, z).applyQuaternion(rot).add(pos);
  const pillarH = 4.4;
  for (const side of [-1, 1]) {
    const pillar = roundedBox(0.9, 4.800000000000001, 1, 0.08, 1);
    displace(pillar, 0.03, 1.2, side + 3);
    b2.stone(pillar, at(side * 2.6500000000000004, pillarH / 2 - 0.2, 0), rot, STONE.marble);
    b2.box(at(side * 2.6500000000000004, pillarH / 2 - 0.2, 0), 0.45, 2.4000000000000004, 0.5, rot);
  }
  buildArch(b2, at(0, pillarH, 0), yaw, 4.4, 0.8, 1, 9, rng, STONE.pale);
  const roseCenter = at(0, 4.2, 0);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TWO_PI;
    const petal = new CylinderGeometry(0.62, 0.62, 0.07, 10, 1);
    petal.rotateX(Math.PI / 2);
    const petalPos = v3(Math.cos(angle) * 1.25, Math.sin(angle) * 1.25, 0)
      .applyQuaternion(rot)
      .add(roseCenter);
    b2.glass(faceted(petal), petalPos, rot, PAINT_COLORS[i % 4], 1.1);
  }
  const hub = new CylinderGeometry(0.7, 0.7, 0.08, 12, 1);
  hub.rotateX(Math.PI / 2);
  b2.glass(faceted(hub), roseCenter, rot, 16773832, 1.6);
  const rim = new TorusGeometry(1.98, 0.12, 5, 24);
  b2.stone(faceted(rim), roseCenter, rot, STONE.marble);
  const veil = new BoxGeometry(4.1000000000000005, 1.9, 0.06);
  b2.glass(faceted(veil), at(0, 1, 0), rot, 13625087, 0.5);
}
function buildStepstoneRuins(b, isle, heightAt, rng, out) {
  const cx = isle.cx;
  const cz = isle.cz;
  const groundAt = (dx, dz) => heightAt(cx + dx, cz + dz, isle.def.y);
  const at = (dx, y, dz) => v3(cx + dx, y, cz + dz);
  const yaw = Math.atan2(10 - (cx + -4), -40 - (cz + 4)) + Math.PI / 2;
  const rot = toQuat(yaw);
  const gatePos = at(-4, groundAt(-4, 4), 4);
  const pillarH = 3.2;
  for (const side of [-1, 1]) {
    const pillarPos = v3(side * 2.2, 0, 0)
      .applyQuaternion(rot)
      .add(gatePos);
    const column = columnGeometry(0.38, 3.5, {
      capital: true,
      flutes: 10,
      seed: side * 7,
    });
    b.stone(column, pillarPos.clone().add(v3(0, -0.3, 0)), yaw, STONE.pale);
    b.cyl(pillarPos.clone().add(v3(0, pillarH / 2, 0)), pillarH / 2, 0.42);
  }
  buildArch(b, gatePos.clone().add(v3(0, pillarH, 0)), yaw, 4.4, 0.55, 0.7, 7, rng, STONE.marble);
  placeWindChime(b, gatePos.clone().add(v3(0, 5.4 - 0.05, 0)), 6, 0.25, rng);
  out.clear.push({
    x: gatePos.x,
    z: gatePos.z,
    r: 3,
  });
  for (const [x, z, color] of [
    [-3, -5.2, 'red'],
    [-5.2, -2.6, 'blue'],
    [-1.4, -7.4, 'yellow'],
    [-6.6, -0.6, 'red'],
    [-4.4, -7.2, 'blue'],
    [0.6, -8.4, 'red'],
    [-7.4, 2.2, 'yellow'],
  ])
    out.ink.push({
      color,
      pos: at(x, groundAt(x, z) - 0.03, z),
    });
  placeBoulder(b, cx + 6, cz + 5, groundAt(6, 5), 1, rng);
  placeBoulder(b, cx - 8.2, cz - 4.6, groundAt(-8.2, -4.6), 0.8, rng);
  out.trees.push({
    x: cx + 5.5,
    z: cz - 5.5,
    s: 0.75,
    sp: 'blossom',
  });
  const fallAngle = Math.PI * 1.05;
  const dir = v3(0, 0, 0);
  const lip = isle.lipAt(fallAngle, v3(0, 0, 0), dir);
  out.falls.push({
    lip: lip.add(v3(0, -1.6, 0)),
    dir,
    width: 0.9,
    from: lip.clone(),
    drop: 28,
  });
}
function buildCascadeRuins(b, isle, heightAt, rng, out) {
  const cx = isle.cx;
  const cz = isle.cz;
  const groundAt = (dx, dz) => heightAt(cx + dx, cz + dz, isle.def.y);
  const at = (dx, y, dz) => v3(cx + dx, y, cz + dz);
  const poolZ = 1.5;
  const poolY = groundAt(1, poolZ);
  out.pools.push({
    pos: at(1, poolY + 0.25, poolZ),
    r: 2.7,
  });
  out.clear.push({
    x: cx + 1,
    z: cz + poolZ,
    r: 3.3,
  });
  for (const angle of [Math.PI * 0.5, Math.PI * 0.05]) {
    const dir = v3(0, 0, 0);
    const lip = isle.lipAt(angle, v3(0, 0, 0), dir);
    out.falls.push({
      lip,
      dir,
      width: angle > 1 ? 2.6 : 2,
      from: at(1, poolY + 0.25, poolZ),
      drop: 58,
    });
    out.clear.push({
      x: (cx + 1 + lip.x) / 2,
      z: (cz + poolZ + lip.z) / 2,
      r: 1.4,
    });
  }
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * TWO_PI;
    if (Math.abs(angle - Math.PI * 0.5) < 0.4 || Math.abs(angle - Math.PI * 0.05) < 0.35 || angle > TWO_PI - 0.25)
      continue;
    const x = 1 + Math.cos(angle) * 3;
    const z = poolZ + Math.sin(angle) * 3;
    placeBoulder(b, cx + x, cz + z, groundAt(x, z), 0.45 + rng() * 0.3, rng, false);
  }
  placeBoulder(b, cx - 5, cz + 3, groundAt(-5, 3), 0.9, rng);
  out.trees.push({
    x: cx - 4.5,
    z: cz - 1.5,
    s: 0.7,
    sp: 'blossom',
  });
}
function buildStormcragRuins(b, isle, heightAt, rng, out) {
  const cx = isle.cx;
  const cz = isle.cz;
  const groundAt = (dx, dz) => heightAt(cx + dx, cz + dz, isle.def.y);
  const at = (dx, y, dz) => v3(cx + dx, y, cz + dz);
  for (const [x, z, size] of [
    [-7, -5, 1.6],
    [-8.5, -1.5, 1.1],
    [5, -6.5, 1.4],
    [8, -3, 1],
    [8, 5, 1.3],
    [-3, 9, 1],
    [-9, 5, 0.9],
    [4, 9.5, 0.8],
    [-1.8, -8.8, 0.9],
    [1.9, -9, 0.95],
    [0, -10.4, 0.8],
  ])
    placeBoulder(b, cx + x, cz + z, groundAt(x, z), size, rng);
  for (const [x, z, size] of [
    [-6, 2, 2.6],
    [6, 1, 2],
    [3, 7, 1.6],
  ]) {
    placeCrystalCluster(b, at(x, groundAt(x, z), z), Math.atan2(z, x), 8023295, size, rng);
    out.clear.push({
      x: cx + x,
      z: cz + z,
      r: 1.8,
    });
  }
  const column = columnGeometry(0.4, 3.2, {
    base: false,
    broken: 0.3,
    seed: 4.4,
    flutes: 12,
  });
  column.translate(0, -1.6, 0);
  const rot = new Quaternion()
    .setFromAxisAngle(UP, 0.7)
    .multiply(new Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2));
  const pos = at(-4, groundAt(-4, 5) + 0.3, 5);
  b.stone(column, pos, rot, STONE.sky);
  b.cyl(pos, 1.6, 0.4, rot);
}
function buildHighwindRuins(b, isle, heightAt, rng, out) {
  const cx = isle.cx;
  const cz = isle.cz;
  const groundAt = (dx, dz) => heightAt(cx + dx, cz + dz, isle.def.y);
  const at = (dx, y, dz) => v3(cx + dx, y, cz + dz);
  const baseY = groundAt(0, 0);
  let stackY = baseY - 0.3;
  [0.95, 0.8, 0.68, 0.56, 0.46].forEach((radius, i) => {
    const drumH = 1.3 - i * 0.08;
    const drum = columnGeometry(radius, drumH, {
      base: i === 0,
      broken: 0,
      seed: i * 5.5,
      flutes: 12,
      capital: false,
    });
    b.stone(drum, at(0, stackY, 0), rng() * 0.3, STONE_TINTS[i % STONE_TINTS.length]);
    stackY += drumH;
  });
  b.cyl(at(0, (baseY + stackY) / 2, 0), (stackY - baseY) / 2 + 0.3, 0.9);
  const ring = new TorusGeometry(1.2, 0.1, 6, 28);
  ring.rotateX(Math.PI / 2);
  b.stone(faceted(ring), at(0, stackY + 0.35, 0), 0, STONE.marble);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * TWO_PI + Math.PI / 4;
    const spoke = roundedBox(1.3, 0.12, 0.14, 0.03, 1);
    b.stone(spoke, at(Math.cos(angle) * 0.6, stackY + 0.3, Math.sin(angle) * 0.6), -angle, STONE.marble);
  }
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TWO_PI;
    placeWindChime(b, at(Math.cos(angle) * 1.2, stackY + 0.25, Math.sin(angle) * 1.2), 3, 0.14, rng, [
      PASTELS[i % 5],
      PAINT_COLORS[i % 4],
      16777215,
    ]);
  }
  b.glass(gemGeometry(0.42, 1.6), at(0, stackY + 1.1, 0), 0, 15267583, 2.4);
  out.clear.push({
    x: cx,
    z: cz,
    r: 1.6,
  });
  placeBoulder(b, cx - 3.5, cz - 2, groundAt(-3.5, -2), 0.7, rng);
}
