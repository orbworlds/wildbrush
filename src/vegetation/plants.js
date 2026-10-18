/**
 * Small plants: bushes, ferns, reeds with cattails, lily pads and mushrooms, built from seeds and scattered over the island by the placement rules.
 */
import { Color, Group, Matrix4, Quaternion, Vector3 } from 'three';
import { fbm, makeNoise2D, makeRng, smoothstep } from '../core/math.js';
import { ATLAS_RECTS } from '../shared/foliage-atlas.js';
import { addCanopy, addFrond, addTube, GeoBuilder } from '../shared/veg-geometry.js';
import { makeRng as makeRng2, toColor } from '../shared/veg-material.js';
import { InstanceBatcher } from './batcher.js';
const v3 = (x, y, z) => new Vector3(x, y, z);
function buildBush(seed) {
  const rng = makeRng2(makeRng(seed));
  const geo = new GeoBuilder();
  const clumps = [];
  const count = rng.pick([3, 4, 5]);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const dist = i === 0 ? 0 : rng.range(0.35, 0.6);
    const radius = rng.range(0.55, 0.8);
    clumps.push({
      c: v3(Math.cos(ang) * dist, radius * 0.75 + rng.range(0, 0.25), Math.sin(ang) * dist),
      r: radius,
    });
  }
  addCanopy(geo, rng, clumps, v3(0, 0.55, 0), v3(1.1, 0.7, 1.1), ATLAS_RECTS.broadleaf, 1.45, 9);
  return geo.build();
}
function buildFern(seed) {
  const rng = makeRng2(makeRng(seed));
  const geo = new GeoBuilder();
  const count = rng.pick([7, 8, 9, 10]);
  const white = new Color('#ffffff');
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const rise = rng.range(0.55, 1);
    addFrond(
      geo,
      v3(Math.cos(ang) * 0.05, 0.02, Math.sin(ang) * 0.05),
      v3(Math.cos(ang) * 0.8, rise, Math.sin(ang) * 0.8),
      rng.range(0.8, 1.15),
      rng.range(0.5, 0.62),
      rng.range(0.5, 0.8),
      4,
      ATLAS_RECTS.fern,
      (along) => white.clone().multiplyScalar(0.55 + 0.45 * along),
      rng.next(),
      0.5,
    );
  }
  return geo.build();
}
function addReedBlade(geo, root, lean, height, width, segs, rootColor, tipColor, rand) {
  const side = new Vector3(-lean.z, 0, lean.x);
  if (side.lengthSq() < 0.000001) side.set(1, 0, 0);
  side.normalize();
  const normal = new Vector3()
    .crossVectors(side, v3(0, 1, 0))
    .normalize()
    .lerp(v3(0, 1, 0), 0.5)
    .normalize();
  const base = geo.count;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const pos = root
      .clone()
      .addScaledVector(lean, t * t * height)
      .add(v3(0, t * height, 0));
    const w = width * (1 - t ** 1.3);
    const col = rootColor.clone().lerp(tipColor, t);
    geo.vert(pos.clone().addScaledVector(side, -w * 0.5), normal, 0, t, col, [rand, t, 0, 0], root);
    geo.vert(pos.clone().addScaledVector(side, w * 0.5), normal, 1, t, col, [rand, t, 0, 0], root);
  }
  for (let i = 0; i < segs; i++) {
    const row = base + i * 2;
    geo.tri(row, row + 1, row + 2);
    geo.tri(row + 2, row + 1, row + 3);
  }
}
function buildReeds(seed) {
  const rng = makeRng2(makeRng(seed));
  const geo = new GeoBuilder();
  const count = 12 + Math.floor(rng.next() * 7);
  const rootColor = toColor('#3e5e33');
  const tipColor = toColor('#9db463');
  const paleTip = toColor('#c9bf7a');
  for (let i = 0; i < count; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const dist = Math.sqrt(rng.next()) * 0.35;
    addReedBlade(
      geo,
      v3(Math.cos(ang) * dist, -0.05, Math.sin(ang) * dist),
      v3(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(rng.range(0.05, 0.3)),
      rng.range(1, 1.8),
      rng.range(0.045, 0.07),
      4,
      rootColor,
      rng.chance(0.3) ? paleTip : tipColor,
      rng.next(),
    );
  }
  const cattails = 2 + Math.floor(rng.next() * 3);
  const stemColor = toColor('#5d7a3e');
  const headColor = toColor('#6e4526');
  for (let i = 0; i < cattails; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const dist = rng.range(0, 0.25);
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    const h = rng.range(1.4, 1.9);
    const bx = rng.range(-0.1, 0.1);
    const bz = rng.range(-0.1, 0.1);
    const stem = [v3(x, -0.05, z), v3(x + bx * 0.3, h * 0.5, z + bz * 0.3), v3(x + bx, h, z + bz)];
    addTube(
      geo,
      stem,
      4,
      () => 0.012,
      () => stemColor,
      {
        rand: rng.next(),
        flex: (along) => along,
      },
    );
    const headBottom = v3(x + bx * 0.85, h * 0.8, z + bz * 0.85);
    const headTop = v3(x + bx * 0.97, h * 0.95, z + bz * 0.97);
    addTube(
      geo,
      [headBottom, headBottom.clone().lerp(headTop, 0.5), headTop],
      6,
      (along) => 0.045 * (1 - (Math.abs(along - 0.5) * 2) ** 4 * 0.5),
      () => headColor,
      {
        rand: rng.next(),
        flex: () => 0.9,
        capTop: true,
      },
    );
  }
  return geo.build();
}
function buildLilyPads(seed) {
  const rng = makeRng2(makeRng(seed));
  const geo = new GeoBuilder();
  const count = rng.pick([3, 4, 5, 6]);
  const up = v3(0, 1, 0);
  const rimColor = toColor('#3c6a2e');
  const hubColor = toColor('#6d9c45');
  const petalColor = toColor(rng.chance(0.5) ? '#f7c3d9' : '#fff4ec');
  const heartColor = toColor('#f5c842');
  for (let i = 0; i < count; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const dist = i === 0 ? 0 : rng.range(0.45, 1.2);
    const px = Math.cos(ang) * dist;
    const pz = Math.sin(ang) * dist;
    const radius = rng.range(0.22, 0.45);
    const py = i * 0.004;
    const rot = rng.range(0, Math.PI * 2);
    const hub = geo.vert(v3(px, py + 0.01, pz), up, 0.5, 0.5, hubColor, [rng.next(), 0, 0, 0], v3(px, py, pz));
    const rim = [];
    for (let j = 0; j <= 16; j++) {
      const a = rot + 0.3 + (j / 16) * (Math.PI * 2 - 0.6);
      const edgeR = radius * (0.94 + 0.06 * Math.sin(a * 5 + i));
      const shade = j % 2 == 0 ? 0.92 : 1;
      rim.push(
        geo.vert(
          v3(px + Math.cos(a) * edgeR, py, pz + Math.sin(a) * edgeR),
          up,
          0,
          0,
          rimColor.clone().multiplyScalar(shade),
          [0, 0, 0, 0],
          v3(px, py, pz),
        ),
      );
    }
    for (let j = 0; j < 16; j++) geo.tri(hub, rim[j + 1], rim[j]);
    if (rng.chance(0.35)) {
      const flower = v3(px + rng.range(-0.08, 0.08), py + 0.02, pz + rng.range(-0.08, 0.08));
      for (let j = 0; j < 2; j++) {
        const len = j === 0 ? 0.16 : 0.11;
        const lift = j === 0 ? 0.05 : 0.1;
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2 + j * 0.4;
          const dir = v3(Math.cos(ang), 0, Math.sin(ang));
          const side = v3(-dir.z, 0, dir.x).multiplyScalar(0.035);
          const tipPos = flower
            .clone()
            .addScaledVector(dir, len)
            .add(v3(0, lift, 0));
          const midPos = flower
            .clone()
            .addScaledVector(dir, len * 0.5)
            .add(v3(0, lift * 0.3, 0));
          const normal = dir.clone().multiplyScalar(-0.4).add(up).normalize();
          const iBase = geo.vert(flower, up, 0, 0, petalColor.clone().multiplyScalar(0.85), [0, 0, 0, 0], flower);
          const iLeft = geo.vert(midPos.clone().add(side), normal, 0, 0, petalColor, [0, 0, 0, 0], flower);
          const iTip = geo.vert(tipPos, normal, 0, 0, petalColor, [0, 0, 0, 0], flower);
          const iRight = geo.vert(midPos.clone().sub(side), normal, 0, 0, petalColor, [0, 0, 0, 0], flower);
          geo.tri(iBase, iLeft, iTip);
          geo.tri(iBase, iTip, iRight);
          geo.tri(iBase, iTip, iLeft);
          geo.tri(iBase, iRight, iTip);
        }
      }
      const heart = geo.vert(flower.clone().add(v3(0, 0.06, 0)), up, 0, 0, heartColor, [0, 0, 0, 0], flower);
      for (let j = 0; j < 6; j++) {
        const a0 = (j / 6) * Math.PI * 2;
        const a1 = ((j + 1) / 6) * Math.PI * 2;
        const i0 = geo.vert(
          flower.clone().add(v3(Math.cos(a0) * 0.035, 0.03, Math.sin(a0) * 0.035)),
          up,
          0,
          0,
          heartColor,
          [0, 0, 0, 0],
          flower,
        );
        const i1 = geo.vert(
          flower.clone().add(v3(Math.cos(a1) * 0.035, 0.03, Math.sin(a1) * 0.035)),
          up,
          0,
          0,
          heartColor,
          [0, 0, 0, 0],
          flower,
        );
        geo.tri(heart, i1, i0);
      }
    }
  }
  return geo.build();
}
function buildMushrooms(seed) {
  const rng = makeRng2(makeRng(seed));
  const geo = new GeoBuilder();
  const count = rng.pick([2, 3, 4, 5]);
  const spotted = rng.chance(0.55);
  const capColor = toColor(spotted ? '#d63d2a' : rng.pick(['#c89660', '#b87d4b', '#e0b77a']));
  const spotColor = toColor('#fbf4e6');
  const stemColor = toColor('#efe5cf');
  const gillColor = toColor('#d9c7a4');
  const spotNoise = makeNoise2D(seed);
  for (let i = 0; i < count; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const dist = i === 0 ? 0 : rng.range(0.08, 0.28);
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    const size = i === 0 ? 1 : rng.range(0.5, 0.85);
    const stemH = rng.range(0.1, 0.2) * size;
    const capR = rng.range(0.07, 0.11) * size;
    const lean = v3(rng.range(-0.03, 0.03), 0, rng.range(-0.03, 0.03));
    addTube(
      geo,
      [v3(x, -0.03, z), v3(x, stemH * 0.5, z).add(lean.clone().multiplyScalar(0.5)), v3(x, stemH, z).add(lean)],
      6,
      (along) => capR * (0.32 - along * 0.08),
      () => stemColor,
      {
        rand: rng.next(),
      },
    );
    const capPos = v3(x, stemH, z).add(lean);
    const base = geo.count;
    const capH = capR * rng.range(0.55, 0.8);
    for (let j = 0; j <= 5; j++) {
      const t2 = j / 5;
      const phi = t2 * Math.PI * 0.5;
      for (let k = 0; k <= 12; k++) {
        const theta = (k / 12) * Math.PI * 2;
        const rad = Math.cos(phi) * capR * (1 + 0.08 * (1 - t2));
        const pos = v3(
          capPos.x + Math.cos(theta) * rad,
          capPos.y + Math.sin(phi) * capH - 0.01,
          capPos.z + Math.sin(theta) * rad,
        );
        const normal = v3(
          Math.cos(theta) * Math.cos(phi),
          Math.sin(phi) * 1.3,
          Math.sin(theta) * Math.cos(phi),
        ).normalize();
        const spot = spotted && j > 0 && j < 5 && spotNoise(theta * 2.2 + i * 7, t2 * 5) > 0.45;
        geo.vert(
          pos,
          normal,
          0,
          0,
          spot ? spotColor : capColor.clone().multiplyScalar(0.85 + 0.25 * t2),
          [0, 0, 0, 0],
          capPos,
        );
      }
    }
    for (let j = 0; j < 5; j++)
      for (let k = 0; k < 12; k++) {
        const a = base + j * 13 + k;
        const b = a + 12 + 1;
        geo.tri(a, b, a + 1);
        geo.tri(a + 1, b, b + 1);
      }
    const hub = geo.vert(capPos.clone().add(v3(0, -0.005, 0)), v3(0, -1, 0), 0, 0, gillColor, [0, 0, 0, 0], capPos);
    for (let j = 0; j < 12; j++) geo.tri(hub, base + j, base + j + 1);
  }
  return geo.build();
}
export function createPlants(veg, mats, rules, trees) {
  const { ctx, field } = veg;
  const group = new Group();
  group.name = 'vegetation-plants';
  const rng = makeRng2(makeRng('veg-plants-v1'));
  const noise = makeNoise2D('veg-plants-noise');
  const geos = [];
  const counts = {};
  const quat = new Quaternion();
  const pos = new Vector3();
  const scale = new Vector3();
  const up = new Vector3(0, 1, 0);
  const tint = new Color();
  const waterDepth = (x, z) => {
    try {
      const d = ctx.water.depthAt(x, z);
      if (Number.isFinite(d)) return d;
    } catch {}
    return Math.max(0, 0 - field.heightAt(x, z));
  };
  const isSoil = (x, z) => {
    const surf = rules.surface(x, z);
    return surf === 'grass' || surf === 'dirt';
  };
  const batcher = new InstanceBatcher(ctx.renderer);
  const addPlants = (kind, variants, spots, material, depth, tints, castShadow) => {
    geos.push(...variants);
    counts[kind] = spots.length;
    variants.forEach((geo, variant) => {
      const placed = spots.filter((spot) => spot.v === variant);
      if (!placed.length) return;
      const matrices = [];
      const colors = [];
      for (const spot of placed) {
        quat.setFromAxisAngle(up, spot.yaw);
        matrices.push(new Matrix4().compose(pos.set(spot.x, spot.y, spot.z), quat, scale.setScalar(spot.s)));
        colors.push(tints ? tint.set(rng.pick(tints)).multiplyScalar(rng.range(0.9, 1.08)).clone() : null);
      }
      batcher.add(kind, geo, material, depth, castShadow, matrices, colors);
    });
  };
  {
    const spots = [];
    for (let i = 0; i < 40000 && spots.length < 520; i++) {
      const x = rng.range(-155, 155);
      const z = rng.range(-155, 155);
      const h = field.heightAt(x, z);
      if (h < 1 || field.slopeAt(x, z) > 0.45 || !isSoil(x, z) || rules.clearDist(x, z) < 1.5) continue;
      const canopy = field.canopyAt(x, z);
      const prob =
        0.004 +
        smoothstep(0.05, 0.3, canopy) * smoothstep(0.85, 0.45, canopy) * 0.06 +
        smoothstep(0.6, 0.8, fbm(noise, x * 0.04, z * 0.04, 2)) * 0.03;
      if (!(rng.next() > prob * (1 - rules.dryMeadow(x, z) * 0.8) || rules.nearPath(x, z, 1.4)))
        spots.push({
          x,
          y: h - 0.08,
          z,
          s: rng.range(0.75, 1.35),
          yaw: rng.range(0, 6.28),
          v: Math.floor(rng.next() * 4),
        });
    }
    addPlants(
      'bush',
      [0, 1, 2, 3].map((v) => buildBush(`bush-${v}`)),
      spots,
      mats.lowFoliage,
      mats.lowFoliageDepth,
      ['#7fbd4f', '#8cc454', '#6fae52', '#99c65a'],
      true,
    );
  }
  {
    const spots = [];
    for (let i = 0; i < 50000 && spots.length < 900; i++) {
      const x = rng.range(-155, 155);
      const z = rng.range(-155, 155);
      const canopy = field.canopyAt(x, z);
      if (canopy < 0.25) continue;
      const h = field.heightAt(x, z);
      if (!(
        h < 1 ||
        field.slopeAt(x, z) > 0.5 ||
        !isSoil(x, z) ||
        rng.next() > smoothstep(0.25, 0.7, canopy) * 0.35 ||
        rules.clearDist(x, z) < 1 ||
        rules.nearPath(x, z, 1)
      ))
        spots.push({
          x,
          y: h - 0.03,
          z,
          s: rng.range(1, 1.6),
          yaw: rng.range(0, 6.28),
          v: Math.floor(rng.next() * 3),
        });
    }
    addPlants(
      'fern',
      [0, 1, 2].map((v) => buildFern(`fern-${v}`)),
      spots,
      mats.lowFoliage,
      mats.lowFoliageDepth,
      ['#96d25e', '#86c85a', '#a4d866'],
      false,
    );
  }
  {
    const spots = [];
    for (let i = 0; i < 60000 && spots.length < 240; i++) {
      const ang = rng.range(0, Math.PI * 2);
      const dist = rng.range(15, 60);
      const x = rules.lm.lake.x + Math.cos(ang) * dist;
      const z = rules.lm.lake.z + Math.sin(ang) * dist;
      const h = field.heightAt(x, z);
      if (!(
        h < -0.5 ||
        h > 1.4 ||
        rules.clearDist(x, z) < 0.5 ||
        rng.next() > 0.15 + smoothstep(0.45, 0.7, noise(x * 0.07, z * 0.07) * 0.5 + 0.5)
      ))
        spots.push({
          x,
          y: h,
          z,
          s: rng.range(0.8, 1.2),
          yaw: rng.range(0, 6.28),
          v: Math.floor(rng.next() * 3),
        });
    }
    addPlants(
      'reeds',
      [0, 1, 2].map((v) => buildReeds(`reeds-${v}`)),
      spots,
      mats.reed,
      mats.solidDepth,
      null,
      false,
    );
  }
  {
    const spots = [];
    for (let i = 0; i < 30000 && spots.length < 90; i++) {
      const ang = rng.range(0, Math.PI * 2);
      const dist = rng.range(8, 50);
      const x = rules.lm.lake.x + Math.cos(ang) * dist;
      const z = rules.lm.lake.z + Math.sin(ang) * dist;
      const depth = waterDepth(x, z);
      if (!(
        depth < 0.35 ||
        depth > 2.6 ||
        rules.distTo('lakeIslet', x, z) < 7 ||
        rng.next() > 0.08 + smoothstep(0.4, 0.65, noise(x * 0.06 + 30, z * 0.06) * 0.5 + 0.5)
      ))
        spots.push({
          x,
          y: 0.035,
          z,
          s: rng.range(0.8, 1.3),
          yaw: rng.range(0, 6.28),
          v: Math.floor(rng.next() * 3),
        });
    }
    addPlants(
      'lily',
      [0, 1, 2].map((v) => buildLilyPads(`lily-${v}`)),
      spots,
      mats.solid,
      null,
      null,
      false,
    );
  }
  {
    const spots = [];
    for (let i = 0; i < trees.length && spots.length < 160; i++) {
      const tree = trees[(i * 7919) % trees.length];
      if (field.canopyAt(tree.position.x, tree.position.z) < 0.45 || !rng.chance(0.35)) continue;
      const ang = rng.range(0, Math.PI * 2);
      const dist = rng.range(0.7, 2.2);
      const x = tree.position.x + Math.cos(ang) * dist;
      const z = tree.position.z + Math.sin(ang) * dist;
      if (isSoil(x, z) && !rules.nearPath(x, z, 0.5))
        spots.push({
          x,
          y: field.heightAt(x, z),
          z,
          s: rng.range(0.8, 1.4),
          yaw: rng.range(0, 6.28),
          v: Math.floor(rng.next() * 4),
        });
    }
    addPlants(
      'mushroom',
      [0, 1, 2, 3].map((v) => buildMushrooms(`mush-${v}`)),
      spots,
      mats.solid,
      null,
      null,
      false,
    );
  }
  batcher.build(group);
  return {
    group,
    counts,
    dispose() {
      for (const geo of geos) geo.dispose();
    },
  };
}
