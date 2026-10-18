/**
 * Ruin kit: weathered stone tints and builders for columns, fallen columns, blocks, broken walls, arches, stairways, round shrine daises, hint stones, paving, rubble and the painter statue.
 */
import { CatmullRomCurve3, Color, ConeGeometry, Euler, MathUtils, Quaternion, SphereGeometry, Vector3 } from 'three';
import {
  columnGeometry,
  displace,
  heightStats,
  lathe,
  pick,
  randRange,
  rockGeometry,
  roundedBox,
  taperedTube,
  TAU,
} from '../shared/util.js';
import { addClearing } from './site.js';
export const STONE = {
  pale: 14471350,
  marble: 15196628,
  warm: 13877406,
  rose: 14271664,
  dark: 0xb5a88f,
  grey: 13222838,
};
const STONE_TINTS = [STONE.pale, STONE.marble, STONE.warm, STONE.rose, STONE.grey];
export function stoneColor(rand, base) {
  const color = new Color(base ?? pick(rand, STONE_TINTS));
  const shade = 1 + (rand() - 0.5) * 0.08;
  return color.multiplyScalar(shade);
}
const _up = new Vector3(0, 1, 0);
const v3 = (x, y, z) => new Vector3(x, y, z);
export function localFrame(center, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return (x, y, z) => new Vector3(center.x + x * cos + z * sin, center.y + y, center.z - x * sin + z * cos);
}
export function column(site, ctx, x, z, spec, rand) {
  const radius = spec.r ?? 0.42;
  const ground = heightStats(ctx, x, z, radius * 1.4).min;
  const sink = spec.sink ?? 0.25;
  const base = v3(x, ground - sink, z);
  const geo = columnGeometry(radius, spec.h + sink, {
    capital: spec.capital,
    broken: spec.broken ?? 0,
    seed: rand() * 100,
  });
  const tilt = spec.tilt ?? (rand() - 0.5) * 0.06;
  const euler = new Euler(tilt, rand() * TAU, (rand() - 0.5) * 0.06);
  site.stone(geo, base, euler, spec.color ?? stoneColor(rand));
  if (spec.collider !== false) site.cylCol(v3(x, base.y + (spec.h + sink) / 2, z), (spec.h + sink) / 2, radius * 1.08);
  if (spec.glyph) {
    const angle = rand() * TAU;
    const dir = v3(Math.cos(angle), 0, Math.sin(angle));
    const y = base.y + sink + Math.min(spec.h * 0.55, 1.6);
    site.glyph(
      v3(x, y, z).addScaledVector(dir, radius * 0.97),
      dir,
      0.36,
      Math.floor(rand() * 15),
      spec.glyph.color,
      spec.glyph.glow,
    );
  }
  return base.y + spec.h + sink;
}
export function fallenColumn(site, ctx, x, z, yaw, radius, len, rand) {
  const dir = v3(Math.sin(yaw), 0, Math.cos(yaw));
  let along = -len / 2;
  const drums = Math.max(1, Math.round(len / randRange(rand, 1.6, 2.6)));
  const seg = len / drums;
  for (let i = 0; i < drums; i++) {
    const drumLen = seg * randRange(rand, 0.82, 0.95);
    const px = x + dir.x * (along + seg / 2) + (rand() - 0.5) * 0.3;
    const pz = z + dir.z * (along + seg / 2) + (rand() - 0.5) * 0.3;
    const ground = heightStats(ctx, px, pz, drumLen * 0.5).avg;
    const geo = columnGeometry(radius, drumLen, {
      base: i === 0 && rand() < 0.6,
      broken: 0.25,
      seed: rand() * 50,
    });
    geo.translate(0, -drumLen / 2, 0);
    const quat = new Quaternion().setFromAxisAngle(_up, yaw + (rand() - 0.5) * 0.25);
    quat.multiply(new Quaternion().setFromAxisAngle(v3(1, 0, 0), Math.PI / 2 + (rand() - 0.5) * 0.12));
    const pos = v3(px, ground + radius * 0.72, pz);
    site.stone(geo, pos, quat, stoneColor(rand));
    site.cylCol(pos, drumLen / 2, radius, quat);
    along += seg;
  }
}
export function stoneBlock(site, pos, w, h, d, rot, rand, options = {}) {
  const geo = roundedBox(w, h, d, options.round ?? Math.min(0.14, Math.min(w, h, d) * 0.3));
  displace(geo, (options.wear ?? 0.045) * Math.min(1.5, Math.max(w, h, d)), 0.9, rand() * 100);
  site.stone(geo, pos, rot, options.color ?? stoneColor(rand));
  if (options.collider !== false) site.boxCol(pos, w / 2, h / 2, d / 2, rot);
}
export function ruinWall(site, ctx, x0, z0, x1, z1, height, thick, rand, options = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const dir = v3((x1 - x0) / len, 0, (z1 - z0) / len);
  const course = 0.52;
  const courses = Math.max(1, Math.round(height / course));
  const minFrac = options.minFrac ?? 0.25;
  const phase = rand() * 10;
  const cell = 1.3;
  const cells = Math.max(1, Math.round(len / cell));
  const tops = Array(cells).fill(-Infinity);
  const bottoms = Array(cells).fill(Infinity);
  const color = options.color;
  for (let row = 0; row < courses; row++) {
    let at = row % 2 == 0 ? 0 : -0.55;
    for (; at < len;) {
      const stoneLen = randRange(rand, 0.9, 1.5);
      const from = Math.max(0, at);
      const to = Math.min(len, at + stoneLen);
      at += stoneLen;
      if (to - from < 0.3) continue;
      const mid = (from + to) / 2;
      const u2 = mid / len;
      const profile =
        minFrac + (1 - minFrac) * (0.5 + 0.5 * Math.sin(u2 * 5.3 + phase) * Math.cos(u2 * 2.1 + phase * 0.7));
      const endTaper = Math.min(1, Math.min(mid, len - mid) / 1.2 + 0.35);
      const rowsHere = Math.max(1, Math.round(courses * profile * endTaper));
      if (row >= rowsHere || (options.window && row >= 1 && row <= 2 && Math.abs(mid - len / 2) < options.window / 2))
        continue;
      const px = x0 + dir.x * mid;
      const pz = z0 + dir.z * mid;
      const ground = ctx.terrain.heightAt(px, pz);
      const y = ground - 0.3 + course * row + course / 2;
      const jitter = row === rowsHere - 1 ? 1 : 0.3;
      const euler = new Euler(
        (rand() - 0.5) * 0.04 * jitter,
        yaw + (rand() - 0.5) * 0.08 * jitter,
        (rand() - 0.5) * 0.05 * jitter,
      );
      const blockLen = to - from - 0.04;
      const geo = roundedBox(thick * randRange(rand, 0.92, 1), course * randRange(rand, 0.94, 1), blockLen, 0.09);
      displace(geo, 0.035, 1.3, rand() * 100);
      site.stone(geo, v3(px + (rand() - 0.5) * 0.04, y, pz), euler, stoneColor(rand, color));
      const cellIdx = Math.min(cells - 1, Math.floor(mid / cell));
      tops[cellIdx] = Math.max(tops[cellIdx], y + course / 2);
      bottoms[cellIdx] = Math.min(bottoms[cellIdx], ground - 0.3);
    }
  }
  for (let i = 0; i < cells; i++) {
    if (!Number.isFinite(tops[i])) continue;
    const start = i * cell;
    const end = Math.min(len, start + cell);
    const mid = (start + end) / 2;
    const halfH = (tops[i] - bottoms[i]) / 2;
    site.boxCol(v3(x0 + dir.x * mid, bottoms[i] + halfH, z0 + dir.z * mid), thick / 2, halfH, (end - start) / 2, yaw);
  }
  const debris = Math.round(len / 3);
  for (let i = 0; i < debris; i++) {
    const u2 = rand();
    const offset = (rand() < 0.5 ? -1 : 1) * randRange(rand, thick, thick + 1.4);
    const px = x0 + dir.x * len * u2 + dir.z * offset;
    const pz = z0 + dir.z * len * u2 - dir.x * offset;
    stoneBlock(
      site,
      v3(px, ctx.terrain.heightAt(px, pz) + 0.12, pz),
      randRange(rand, 0.5, 1),
      course * 0.9,
      randRange(rand, 0.4, 0.8),
      new Euler((rand() - 0.5) * 0.4, rand() * TAU, (rand() - 0.5) * 0.4),
      rand,
      {
        collider: false,
      },
    );
  }
}
export function archway(site, ctx, x, z, yaw, span, height, rand, options = {}) {
  const depth = options.depth ?? 1.4;
  const local = localFrame(v3(x, 0, z), yaw);
  const pier = 1.25;
  const pierX = span / 2 + pier / 2;
  let archTop = -Infinity;
  const bases = [];
  for (const side of [-1, 1]) {
    const at = local(side * pierX, 0, 0);
    const base = heightStats(ctx, at.x, at.z, 1.2).min - 0.4;
    bases.push(base);
  }
  const springY = Math.max(...bases) + 0.4 + height;
  for (const side of [-1, 1]) {
    const at = local(side * pierX, 0, 0);
    const base = bases[side < 0 ? 0 : 1];
    const pierH = springY - base;
    stoneBlock(site, v3(at.x, base + 0.35, at.z), 1.6, 1.1, depth + 0.35, yaw, rand, {
      color: stoneColor(rand, STONE.dark),
    });
    const blocks = Math.max(2, Math.round((pierH - 0.9) / 0.9));
    const blockH = (pierH - 0.9) / blocks;
    for (let i = 0; i < blocks; i++) {
      const y = base + 0.9 + blockH * i + blockH / 2;
      const geo = roundedBox(
        pier * randRange(rand, 0.97, 1.03),
        blockH - 0.03,
        depth * randRange(rand, 0.97, 1.02),
        0.1,
      );
      displace(geo, 0.04, 1.1, rand() * 100);
      site.stone(geo, v3(at.x, y, at.z), yaw + (rand() - 0.5) * 0.03, stoneColor(rand));
    }
    stoneBlock(site, v3(at.x, springY + 0.12, at.z), 1.55, 0.25, depth + 0.25, yaw, rand, {
      collider: false,
    });
    site.boxCol(v3(at.x, (base + springY) / 2, at.z), pier / 2, (springY - base) / 2, depth / 2, yaw);
    if (options.glyphColor !== undefined) {
      const fwd = v3(Math.sin(yaw), 0, Math.cos(yaw));
      const glyphPos = v3(at.x, base + 0.9 + (pierH - 0.9) * 0.55, at.z).addScaledVector(fwd, depth / 2 + 0.005);
      site.glyph(glyphPos, fwd, 0.55, Math.floor(rand() * 15), options.glyphColor, options.glow ?? 0);
      site.glyph(
        v3(at.x, glyphPos.y, at.z).addScaledVector(fwd, -depth / 2 - 0.005),
        fwd.clone().negate(),
        0.55,
        Math.floor(rand() * 15),
        options.glyphColor,
        options.glow ?? 0,
      );
    }
  }
  const archR = span / 2 + pier / 2;
  const gapFrom = options.broken ? 5 + Math.floor(rand() * 2) : 99;
  for (let i = 0; i < 11; i++) {
    if (options.broken && i >= gapFrom && i < 9) continue;
    const a0 = (i / 11) * Math.PI;
    const a1 = ((i + 1) / 11) * Math.PI;
    const mid = (a0 + a1) / 2;
    const ax = -Math.cos(mid) * archR;
    const ay = springY + 0.25 + Math.sin(mid) * archR * 0.92;
    const at = local(ax, 0, 0);
    const len = (a1 - a0) * archR * 0.97;
    const isKey = i === 5;
    const geo = roundedBox(len, pier * (isKey ? 1.18 : 1), depth * (isKey ? 1.08 : 1), 0.08);
    {
      const position = geo.attributes.position;
      for (let j = 0; j < position.count; j++)
        position.setX(j, position.getX(j) * (1 + position.getY(j) / archR) * 1.02);
      geo.computeVertexNormals();
    }
    displace(geo, 0.03, 1.2, rand() * 100);
    const quat = new Quaternion().setFromAxisAngle(_up, yaw);
    quat.multiply(new Quaternion().setFromAxisAngle(v3(0, 0, 1), mid - Math.PI / 2));
    const pos = v3(at.x, ay, at.z);
    site.stone(geo, pos, quat, stoneColor(rand));
    site.boxCol(pos, len / 2, pier / 2, depth / 2, quat);
    archTop = Math.max(archTop, ay + pier / 2);
    if (isKey && options.glyphColor !== undefined) {
      const fwd = v3(Math.sin(yaw), 0, Math.cos(yaw));
      site.glyph(
        pos.clone().addScaledVector(fwd, depth * 0.54 + 0.005),
        fwd,
        0.6,
        3,
        options.glyphColor,
        options.glow ?? 0,
      );
      site.glyph(
        pos.clone().addScaledVector(fwd, -depth * 0.54 - 0.005),
        fwd.clone().negate(),
        0.6,
        3,
        options.glyphColor,
        options.glow ?? 0,
      );
    }
  }
  if (options.broken)
    for (let i = 0; i < 3; i++) {
      const at = local(randRange(rand, span * 0.1, span * 0.6), 0, randRange(rand, -1.5, 1.5));
      const ground = ctx.terrain.heightAt(at.x, at.z);
      stoneBlock(
        site,
        v3(at.x, ground + 0.3, at.z),
        randRange(rand, 0.8, 1.1),
        0.9,
        depth * 0.9,
        new Euler(rand() * 0.8, rand() * TAU, rand() * 0.6),
        rand,
        {
          collider: i === 0,
        },
      );
    }
  return archTop;
}
export function stairway(site, ctx, x0, z0, x1, z1, width, rand, options = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const dx = (x1 - x0) / len;
  const dz = (z1 - z0) / len;
  const tread = 0.62;
  const steps = Math.max(2, Math.floor(len / tread));
  for (let i = 0; i <= len + 0.01; i += 2.5) addClearing(x0 + dx * i, z0 + dz * i, width / 2 + 0.7);
  let prevY = -Infinity;
  for (let i = 0; i < steps; i++) {
    const at = (i + 0.5) * tread;
    const x2 = x0 + dx * at;
    const z = z0 + dz * at;
    const stats = heightStats(ctx, x2, z, width * 0.5);
    let stepTop = ctx.terrain.heightAt(x2 + dx * tread * 0.5, z + dz * tread * 0.5) + 0.14;
    stepTop = Math.max(stepTop, prevY + 0.04);
    prevY = stepTop;
    const bottom = Math.min(stats.min, stepTop - 0.3) - 0.35;
    const h = stepTop - bottom;
    const pos = v3(x2, (stepTop + bottom) / 2, z);
    if (rand() < 0.06 && i > 1 && i < steps - 2) {
      const rock = rockGeometry(0.35, rand() * 99);
      site.stone(rock, v3(x2 + (rand() - 0.5) * width * 0.6, stepTop - 0.2, z), rand() * TAU, stoneColor(rand));
      continue;
    }
    const geo = roundedBox(width * randRange(rand, 0.94, 1), h, tread * 1.08, 0.07);
    displace(geo, 0.03, 1.4, rand() * 100);
    const euler = new Euler(0, yaw + (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.02, 'YXZ');
    site.stone(geo, pos, euler, stoneColor(rand));
    site.boxCol(pos, width / 2, h / 2, tread * 0.54, yaw);
    if (options.cheeks && i % 2 == 0)
      for (const side of [-1, 1]) {
        const cx = x2 + dz * side * (width / 2 + 0.3);
        const cz = z - dx * side * (width / 2 + 0.3);
        const ground = ctx.terrain.heightAt(cx, cz);
        const cheekH = Math.max(0.5, stepTop + 0.45 - ground);
        stoneBlock(site, v3(cx, ground + cheekH / 2 - 0.2, cz), 0.5, cheekH + 0.4, tread * 2.05, yaw, rand, {
          collider: false,
        });
      }
  }
}
function daisGeometry(radius, height, segments = 44) {
  const bevel = Math.min(0.12, height * 0.3);
  const geo = lathe(
    [
      [0, 0],
      [radius - bevel, 0],
      [radius, bevel],
      [radius, height - bevel],
      [radius - bevel * 0.6, height - bevel * 0.15],
      [radius - bevel * 1.2, height],
      [0, height],
    ],
    segments,
  );
  return displace(geo, 0.05, 0.7, radius * 13.7);
}
export function shrineDais(site, ctx, center, radius, color, glow, rand, options = {}) {
  const stats = heightStats(ctx, center.x, center.z, radius);
  const groundY = options.groundY ?? stats.max;
  const baseTop = groundY + 0.32;
  addClearing(center.x, center.z, radius + 0.6);
  const bottom = Math.min(stats.min, groundY) - 1.6;
  const geo = daisGeometry(radius, baseTop - bottom);
  site.stone(geo, v3(center.x, bottom, center.z), 0, stoneColor(rand, STONE.dark));
  site.cylCol(v3(center.x, (baseTop + bottom) / 2, center.z), (baseTop - bottom) / 2, radius);
  const innerR = radius * 0.8;
  const floorY = baseTop + 0.26;
  site.stone(daisGeometry(innerR, 0.31), v3(center.x, baseTop - 0.05, center.z), 0, stoneColor(rand, STONE.marble));
  site.cylCol(v3(center.x, baseTop + 0.13, center.z), 0.13, innerR);
  const ringR = innerR * 0.72;
  const count = Math.max(8, Math.round((TAU * ringR) / 0.85));
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    const pos = v3(center.x + Math.cos(angle) * ringR, floorY + 0.002, center.z + Math.sin(angle) * ringR);
    site.glyph(pos, _up, 0.52, i % 15, color, glow, -angle - Math.PI / 2);
  }
  for (const [lineR, lineW] of [
    [ringR - 0.42, 0.07],
    [ringR + 0.42, 0.07],
    [innerR * 0.3, 0.05],
  ]) {
    const segs = Math.max(12, Math.round((TAU * lineR) / 0.35));
    for (let i = 0; i < segs; i++) {
      const angle = ((i + 0.5) / segs) * TAU;
      const pos = v3(center.x + Math.cos(angle) * lineR, floorY + 0.003, center.z + Math.sin(angle) * lineR);
      site.glyph(pos, _up, (TAU * lineR) / segs + 0.01, 15, color, glow, -angle, lineW);
    }
  }
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * TAU + Math.PI / 4;
    const mid = (innerR * 0.3 + ringR - 0.42) / 2;
    const len = ringR - 0.42 - innerR * 0.3;
    const pos = v3(center.x + Math.cos(angle) * mid, floorY + 0.003, center.z + Math.sin(angle) * mid);
    site.glyph(pos, _up, len, 15, color, glow, -angle - Math.PI / 2, 0.05);
  }
  if (options.stepsYaw !== undefined) {
    const local = localFrame(v3(center.x, 0, center.z), options.stepsYaw);
    for (let i = 0; i < 2; i++) {
      const at = local(0, 0, radius + 0.3 + i * 0.45);
      const ground = heightStats(ctx, at.x, at.z, 1.3).min;
      const y = baseTop - 0.16 - i * 0.16;
      if (y < ground + 0.08) break;
      const h = y - ground + 0.5;
      stoneBlock(site, v3(at.x, y - h / 2, at.z), 2.6 - i * 0.2, h, 0.7, options.stepsYaw, rand, {
        round: 0.08,
      });
    }
  }
  const pedH = 1.05;
  const pedestal = lathe(
    [
      [0, 0],
      [0.72, 0],
      [0.74, 0.1],
      [0.62, 0.2],
      [0.46, 0.32],
      [0.4, 0.6],
      [0.44, 0.82],
      [0.62, 0.92],
      [0.66, 1],
      [0.6, pedH],
      [0.3, 0.9700000000000001],
      [0, 0.9500000000000001],
    ],
    28,
  );
  displace(pedestal, 0.02, 2, rand() * 10);
  site.stone(pedestal, v3(center.x, floorY - 0.02, center.z), 0, stoneColor(rand, STONE.marble));
  site.cylCol(v3(center.x, floorY + pedH / 2, center.z), pedH / 2, 0.5);
  if (!options.noPedestalGlyphs)
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * TAU + 0.3;
      const dir = v3(Math.cos(angle), 0, Math.sin(angle));
      site.glyph(
        v3(center.x, floorY + 0.48, center.z).addScaledVector(dir, 0.405),
        dir,
        0.24,
        (i * 5 + 2) % 15,
        color,
        glow,
      );
    }
  const pillars = options.pillars ?? 6;
  const pillarR = options.pillarRing ?? radius - 0.55;
  const phase = rand() * TAU;
  for (let i = 0; i < pillars; i++) {
    const angle = phase + (i / pillars) * TAU + (rand() - 0.5) * 0.2;
    if (options.stepsYaw !== undefined) {
      const delta = Math.atan2(
        Math.sin(angle - (Math.PI / 2 - options.stepsYaw)),
        Math.cos(angle - (Math.PI / 2 - options.stepsYaw)),
      );
      if (Math.abs(delta) < 0.45) continue;
    }
    const px = center.x + Math.cos(angle) * pillarR;
    const pz = center.z + Math.sin(angle) * pillarR;
    const tall = rand() < 0.35;
    column(
      site,
      ctx,
      px,
      pz,
      {
        r: 0.36,
        h: (tall ? randRange(rand, 3.4, 4.6) : randRange(rand, 0.9, 2.6)) + (baseTop - ctx.terrain.heightAt(px, pz)),
        capital: tall,
        broken: tall ? 0 : randRange(rand, 0.3, 0.7),
        glyph:
          rand() < 0.6
            ? {
                color,
                glow,
              }
            : null,
      },
      rand,
    );
  }
  return {
    top: floorY,
    pedestalTop: floorY + pedH,
  };
}
export function hintStone(site, ctx, x, z, yaw, height, rand, color, groundY) {
  const ground = groundY ?? heightStats(ctx, x, z, 0.8).min;
  const w = 1.05;
  const depth = 0.5;
  const geo = roundedBox(w, height + 0.6, depth, 0.2, 2.2);
  const position = geo.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const k = (position.getY(i) + (height + 0.6) / 2) / (height + 0.6);
    const taper = 1 - 0.22 * k * k;
    position.setX(i, position.getX(i) * taper);
    position.setZ(i, position.getZ(i) * (1 - 0.1 * k));
    if (k > 0.9) position.setY(i, position.getY(i) - (position.getX(i) + w / 2) * 0.18);
  }
  geo.computeVertexNormals();
  displace(geo, 0.05, 1.1, rand() * 100);
  const euler = new Euler((rand() - 0.5) * 0.08, yaw, (rand() - 0.5) * 0.08, 'YXZ');
  const pos = v3(x, ground - 0.4 + (height + 0.6) / 2, z);
  site.stone(geo, pos, euler, stoneColor(rand, STONE.grey));
  site.boxCol(pos, w / 2, (height + 0.6) / 2, depth / 2, yaw);
  const fwd = v3(Math.sin(yaw), 0, Math.cos(yaw));
  const front = pos.clone().addScaledVector(fwd, 0.26);
  for (let i = 0; i < 3; i++)
    site.glyph(front.clone().add(v3(0, 0.55 - i * 0.48, 0)), fwd, 0.4, Math.floor(rand() * 15), color, 0);
  site.glyph(front.clone().add(v3(0, 0.95, 0)), fwd, 0.5, 15, color, 0, 0, 0.045);
  for (let i = 0; i < 4; i++) {
    const angle = rand() * TAU;
    const px = x + Math.cos(angle) * randRange(rand, 0.8, 1.3);
    const pz = z + Math.sin(angle) * randRange(rand, 0.8, 1.3);
    site.stone(
      rockGeometry(randRange(rand, 0.18, 0.32), rand() * 99),
      v3(px, groundY ?? ctx.terrain.heightAt(px, pz), pz),
      rand() * TAU,
      stoneColor(rand),
    );
  }
  return pos;
}
export function paving(site, ctx, x2, z, radius, rand, options = {}) {
  const size = options.size ?? 1.3;
  const cells = Math.ceil(radius / size);
  addClearing(x2, z, radius * ((options.fade ?? 0.65) * 0.5 + 0.45));
  for (let i = -cells; i <= cells; i++)
    for (let j = -cells; j <= cells; j++) {
      const stagger = i % 2 == 0 ? 0 : size * 0.5;
      const px = x2 + j * size + stagger + (rand() - 0.5) * 0.15;
      const pz = z + i * size + (rand() - 0.5) * 0.15;
      const dist = Math.hypot(px - x2, pz - z);
      if (dist > radius) continue;
      const u2 = dist / radius;
      const fade = options.fade ?? 0.65;
      if (
        (u2 > fade && rand() < (u2 - fade) / (1 - fade) + 0.05) ||
        rand() < (options.gap ?? 0.05) ||
        (options.avoid && options.avoid.some((zone) => Math.hypot(px - zone.x, pz - zone.z) < zone.r))
      )
        continue;
      const w = size * randRange(rand, 0.78, 0.95);
      const d2 = size * randRange(rand, 0.78, 0.95);
      const stats = heightStats(ctx, px, pz, w * 0.5);
      const topY = stats.max + 0.035;
      const h = topY - stats.min + 0.22;
      const geo = roundedBox(w, h, d2, 0.07, 1.4);
      displace(geo, 0.025, 1.5, rand() * 100);
      site.stone(
        geo,
        v3(px, topY - h / 2, pz),
        new Euler((rand() - 0.5) * 0.02, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.02),
        stoneColor(rand, rand() < 0.5 ? STONE.pale : STONE.grey),
      );
    }
}
export function rubble(site, ctx, x, z, radius, count, rand, maxSize = 0.45) {
  for (let i = 0; i < count; i++) {
    const angle = rand() * TAU;
    const dist = Math.sqrt(rand()) * radius;
    const px = x + Math.cos(angle) * dist;
    const pz = z + Math.sin(angle) * dist;
    const size = randRange(rand, 0.15, maxSize);
    const ground = ctx.terrain.heightAt(px, pz);
    if (rand() < 0.55)
      site.stone(rockGeometry(size, rand() * 99), v3(px, ground + size * 0.2, pz), rand() * TAU, stoneColor(rand));
    else
      stoneBlock(
        site,
        v3(px, ground + size * 0.3, pz),
        size * 2.2,
        size * 1.2,
        size * 1.6,
        new Euler((rand() - 0.5) * 0.5, rand() * TAU, (rand() - 0.5) * 0.5),
        rand,
        {
          collider: size > 0.35,
        },
      );
  }
}
export function painterStatue(site, ctx, x2, z2, yaw, rand) {
  const stats = heightStats(ctx, x2, z2, 2.2);
  const local = localFrame(v3(x2, 0, z2), yaw);
  const ground = stats.max;
  const plinthH = 1.7;
  stoneBlock(
    site,
    v3(x2, stats.min - 0.5 + (ground - stats.min + 0.9) / 2, z2),
    4.4,
    ground - stats.min + 0.9,
    4.4,
    yaw,
    rand,
    {
      color: stoneColor(rand, STONE.dark),
    },
  );
  stoneBlock(site, v3(x2, ground + 0.4 + 1.2999999999999998 / 2, z2), 3.1, 1.2999999999999998, 3.1, yaw, rand, {
    color: stoneColor(rand, STONE.pale),
  });
  stoneBlock(site, v3(x2, ground + plinthH + 0.12, z2), 3.5, 0.28, 3.5, yaw, rand, {
    color: stoneColor(rand, STONE.marble),
  });
  const baseY = ground + plinthH + 0.26;
  const fwd = v3(Math.sin(yaw), 0, Math.cos(yaw));
  for (let i = 0; i < 3; i++) {
    const pos = local(-0.55 + i * 0.55, ground + 1.05, 1.56);
    site.glyph(pos, fwd, 0.42, (i * 4 + 1) % 15, [16735034, 5030911, 16766023][i], 0);
  }
  site.glyph(local(0.95, ground + 1.05, 1.56), fwd, 0.42, 8, 5822059, 0);
  site.glyph(local(0.2, ground + 1.45, 1.56), fwd, 2.2, 15, 15260072, 0, 0, 0.05);
  site.glyph(local(0.2, ground + 0.65, 1.56), fwd, 2.2, 15, 15260072, 0, 0, 0.05);
  const marble = STONE.marble;
  const robe = lathe(
    [
      [0, 0],
      [0.98, 0],
      [1, 0.12],
      [0.92, 0.6],
      [0.8, 1.3],
      [0.66, 2],
      [0.56, 2.45],
      [0.6, 2.75],
      [0.66, 3.1],
      [0.64, 3.4],
      [0.46, 3.62],
      [0.2, 3.72],
      [0, 3.74],
    ],
    30,
  );
  {
    const position = robe.attributes.position;
    for (let j = 0; j < position.count; j++) {
      const x = position.getX(j);
      const y = position.getY(j);
      const z = position.getZ(j);
      const fold = y < 2.5 ? 1 + 0.07 * Math.sin(Math.atan2(z, x) * 9 + y * 0.8) * (1 - y / 2.5) : 1;
      const depth = 0.82 + (z < 0 && y < 1.2 ? 0.25 * (1 - y / 1.2) : 0);
      position.setXYZ(j, x * fold * 1, y, z * fold * depth);
    }
    robe.computeVertexNormals();
  }
  displace(robe, 0.03, 1.6, 5);
  site.stone(robe, local(0, baseY, 0), yaw, marble);
  site.cylCol(local(0, baseY + 1.85, 0), 1.85, 0.8);
  const head = displace(new SphereGeometry(0.34, 20, 14), 0.01, 3, 2);
  site.stone(stripUv(head), local(0, baseY + 4.08, 0.05), yaw, marble, v3(0.95, 1.08, 1));
  const beret = lathe(
    [
      [0, 0],
      [0.44, 0.02],
      [0.5, 0.08],
      [0.44, 0.16],
      [0.22, 0.2],
      [0, 0.21],
    ],
    20,
  );
  site.stone(beret, local(0.06, baseY + 4.28, -0.05), new Euler(-0.2, yaw, 0.25, 'YXZ'), marble);
  {
    const nose = new ConeGeometry(0.07, 0.2, 4);
    nose.deleteAttribute('uv');
    nose.rotateX(Math.PI / 2 + 0.25);
    site.stone(nose, local(0, baseY + 4.03, 0.43), yaw, marble);
    const brow = roundedBox(0.42, 0.08, 0.12, 0.035, 3);
    site.stone(brow, local(0, baseY + 4.15, 0.36), new Euler(-0.25, yaw, 0, 'YXZ'), marble);
    const chin = stripUv(new SphereGeometry(0.12, 10, 8));
    site.stone(chin, local(0, baseY + 3.86, 0.3), yaw, marble, v3(1.1, 0.8, 0.9));
    const strap = taperedTube(
      new CatmullRomCurve3([
        local(0.5, baseY + 3.5, -0.1),
        local(0.2, baseY + 3.3, 0.5),
        local(-0.3, baseY + 2.8, 0.55),
        local(-0.62, baseY + 2.3, 0.25),
      ]),
      16,
      6,
      () => 0.05,
    );
    site.stone(strap, v3(0, 0, 0), 0, STONE.warm, v3(1, 1, 1));
    const satchel = roundedBox(0.5, 0.5, 0.22, 0.1, 3);
    site.stone(satchel, local(-0.72, baseY + 2.05, 0.1), new Euler(0, yaw - 1.2, 0.1, 'YXZ'), STONE.warm);
    const bun = stripUv(new SphereGeometry(0.17, 12, 10));
    site.stone(bun, local(0, baseY + 4.12, -0.33), yaw, marble);
    const braid = taperedTube(
      new CatmullRomCurve3([
        local(0, baseY + 4.05, -0.4),
        local(0.05, baseY + 3.6, -0.5),
        local(-0.04, baseY + 3.1, -0.52),
        local(0.03, baseY + 2.7, -0.48),
      ]),
      16,
      8,
      (u) => 0.09 * (1 - u * 0.5),
    );
    site.stone(braid, v3(0, 0, 0), 0, marble);
    const belt = lathe(
      [
        [0.58, -0.07],
        [0.64, -0.03],
        [0.64, 0.05],
        [0.58, 0.09],
      ],
      28,
    );
    site.stone(belt, local(0, baseY + 2.5, 0), yaw, STONE.warm, v3(1, 1, 0.84));
  }
  site.stone(
    lathe(
      [
        [0, 0],
        [0.16, 0],
        [0.15, 0.3],
        [0, 0.3],
      ],
      12,
    ),
    local(0, baseY + 3.62, 0.02),
    yaw,
    marble,
  );
  {
    const scarfPts = [
      local(-0.3, baseY + 3.62, 0.15),
      local(0, baseY + 3.58, 0.32),
      local(0.32, baseY + 3.62, 0.1),
      local(0.2, baseY + 3.5, -0.3),
      local(-0.1, baseY + 3.1, -0.7),
      local(-0.3, baseY + 2.6, -1),
    ];
    const scarfCurve = new CatmullRomCurve3(scarfPts);
    const scarf = taperedTube(scarfCurve, 24, 8, (u) => 0.14 * (1 - u * 0.4));
    site.stone(scarf, v3(0, 0, 0), 0, marble, v3(1, 1, 1));
  }
  const shoulderR = local(0.55, baseY + 3.4, 0);
  const elbowR = local(0.95, baseY + 3.9, 0.35);
  const handR = local(0.8, baseY + 4.6, 0.7);
  const armR = taperedTube(
    new CatmullRomCurve3([
      shoulderR,
      shoulderR
        .clone()
        .lerp(elbowR, 0.5)
        .add(v3(0, 0.05, 0)),
      elbowR,
      handR,
    ]),
    16,
    10,
    (u) => 0.2 - u * 0.08,
  );
  site.stone(armR, v3(0, 0, 0), 0, marble);
  site.stone(stripUv(new SphereGeometry(0.15, 12, 10)), handR, 0, marble);
  const brushDir = handR.clone().sub(elbowR).normalize().add(fwd.clone().multiplyScalar(0.45)).normalize();
  const brushLen = 3.2;
  const brushBase = handR.clone().addScaledVector(brushDir, -0.9);
  const handle = lathe(
    [
      [0, 0],
      [0.06, 0],
      [0.075, brushLen * 0.5],
      [0.07, 3],
      [0.11, 3.08],
      [0.11, brushLen],
      [0, brushLen],
    ],
    10,
  );
  const brushQuat = new Quaternion().setFromUnitVectors(_up, brushDir);
  site.stone(handle, brushBase, brushQuat, STONE.warm);
  const bristles = lathe(
    [
      [0, 0],
      [0.13, 0],
      [0.2, 0.2],
      [0.2, 0.45],
      [0.12, 0.7],
      [0, 0.85],
    ],
    14,
  );
  displace(bristles, 0.02, 5, 3);
  const tipPos = brushBase.clone().addScaledVector(brushDir, brushLen);
  const tip = site.stone(bristles, tipPos, brushQuat, 16777215);
  {
    const position = tip.attributes.position;
    const colors = tip.attributes.color;
    const marbleColor = new Color(marble);
    const paintColor = new Color(0xff5b3a);
    const mixed = new Color();
    const rel = new Vector3();
    for (let i = 0; i < position.count; i++) {
      rel.fromBufferAttribute(position, i).sub(tipPos);
      const k = MathUtils.clamp(rel.dot(brushDir) / 0.85, 0, 1);
      mixed.copy(marbleColor).lerp(paintColor, MathUtils.smoothstep(k, 0.35, 0.8) * 0.85);
      colors.setXYZ(i, mixed.r, mixed.g, mixed.b);
    }
  }
  const shoulderL = local(-0.55, baseY + 3.4, 0);
  const elbowL = local(-0.78, baseY + 2.8, 0.15);
  const handL = local(-0.55, baseY + 2.45, 0.55);
  site.stone(
    taperedTube(new CatmullRomCurve3([shoulderL, elbowL, handL]), 14, 10, (u) => 0.2 - u * 0.07),
    v3(0, 0, 0),
    0,
    marble,
  );
  const palette = roundedBox(1, 0.08, 0.7, 0.035, 3);
  {
    const position = palette.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const squash = 1 - 0.12 * Math.cos(Math.atan2(z, x) * 2);
      position.setXYZ(i, x * squash, position.getY(i), z * squash);
    }
    palette.computeVertexNormals();
  }
  const palettePos = local(-0.55, baseY + 2.42, 0.85);
  site.stone(palette, palettePos, new Euler(0.15, yaw + 0.4, -0.1, 'YXZ'), STONE.warm);
  const paints = [16735034, 5030911, 16766023, 5822059];
  for (let i = 0; i < 4; i++) {
    const angle = yaw + 0.4 + (i - 1.5) * 0.55;
    const dab = palettePos.clone().add(v3(Math.sin(angle) * 0.28, 0.06, Math.cos(angle) * 0.28));
    site.prop(stripUv(new SphereGeometry(0.08, 10, 6)), dab, 0, paints[i], v3(1, 0.45, 1));
  }
  return baseY + 4.6;
}
function stripUv(geometry) {
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  return geometry;
}
