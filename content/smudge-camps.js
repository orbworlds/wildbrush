/**
 * Smudge camps: ink stains, fire pits, ward banners, stakes, bones, ribcages and inked rocks dress each camp site, then the camp table is placed on the island, a hint stone is raised near the first camp and the enemies system spawns each camp's Smudges.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Euler,
  Float32BufferAttribute,
  LineCurve3,
  Vector3,
} from 'three';
import {
  displace,
  findSpot,
  lathe,
  randRange,
  rng,
  rockGeometry,
  roundedBox,
  safe,
  taperedTube,
  TAU,
  yawTo,
} from '../shared/util.js';
import { hintStone, localFrame, STONE, stoneColor } from './ruin-kit.js';
import { addClearing, Site } from './site.js';
const vec = (x, y, z) => new Vector3(x, y, z);
const CAMP_INK = new Color(0x26252d);
const CAMP_INK_RIM = new Color(0x34323d);
const CAMP_CLOTH = new Color(0x8d8a86);
const CAMP_CLOTH_DARK = new Color(0x5b5957);
const CAMP_MASK = new Color(0xf1ece0);
const CAMP_BONE = new Color(0xe2dac8);
const CAMP_WOOD = new Color(0x3d322a);
const CAMP_CHAR = new Color(0x1f1c1b);
function shadeVertices(geometry, shade) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  const pos = new Vector3();
  const nrm = new Vector3(0, 1, 0);
  const color = new Color();
  for (let i = 0; i < position.count; i++) {
    pos.fromBufferAttribute(position, i);
    if (normal) nrm.fromBufferAttribute(normal, i);
    shade(pos, nrm, color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}
function inkStain(site, ctx, x, z, radius, rand) {
  const lobes = [];
  for (let i = 0; i < 5; i++)
    lobes.push({
      a: rand() * TAU,
      s: randRange(rand, 0.12, 0.38),
      w: randRange(rand, 0.25, 0.6),
    });
  const edge = (angle) => {
    let k = 0.78 + 0.08 * Math.sin(angle * 3 + rand() * 0.1) + 0.05 * Math.sin(angle * 7.3);
    for (const lobe of lobes) {
      let d = angle - lobe.a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      k += lobe.s * Math.exp(-((d / lobe.w) ** 2));
    }
    return k * radius;
  };
  const blot = (cx, cz, radiusAt, rings, segs) => {
    const positions = [];
    const colors = [];
    const indices = [];
    const color = new Color();
    const y = ctx.terrain.heightAt(cx, cz) + 0.05;
    positions.push(cx, y, cz);
    color.copy(CAMP_INK).multiplyScalar(0.85);
    colors.push(color.r, color.g, color.b);
    for (let i = 1; i <= rings; i++)
      for (let j = 0; j < segs; j++) {
        const angle = (j / segs) * TAU;
        const rad = radiusAt(angle) * (i / rings);
        const px = cx + Math.cos(angle) * rad;
        const pz = cz + Math.sin(angle) * rad;
        positions.push(px, ctx.terrain.heightAt(px, pz) + 0.05, pz);
        color.copy(CAMP_INK).lerp(CAMP_INK_RIM, i === rings ? 0.9 : (i / rings) * 0.4 + 0.2 * Math.sin(j * 1.7 + i));
        colors.push(color.r, color.g, color.b);
      }
    for (let i = 0; i < segs; i++) indices.push(0, 1 + ((i + 1) % segs), 1 + i);
    for (let i = 1; i < rings; i++) {
      const inner = 1 + (i - 1) * segs;
      const outer = 1 + i * segs;
      for (let j = 0; j < segs; j++) {
        const i0 = inner + j;
        const i1 = inner + ((j + 1) % segs);
        const o0 = outer + j;
        const o1 = outer + ((j + 1) % segs);
        indices.push(i0, i1, o1, i0, o1, o0);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    site.add('prop', geometry, vec(0, 0, 0));
  };
  blot(x, z, edge, 4, 44);
  for (let i = 0; i < 7; i++) {
    const angle = rand() * TAU;
    const dist = radius * randRange(rand, 1.1, 1.5);
    const size = randRange(rand, 0.12, 0.35);
    blot(x + Math.cos(angle) * dist, z + Math.sin(angle) * dist, () => size, 1, 10);
  }
}
function firePit(site, ctx, center, rand) {
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * TAU + rand() * 0.2;
    const px = center.x + Math.cos(angle) * 0.78;
    const pz = center.z + Math.sin(angle) * 0.78;
    const stone = shadeVertices(rockGeometry(randRange(rand, 0.15, 0.21), rand() * 99, 0.6), (pos, nrm, col) =>
      col
        .copy(stoneColor(rand, STONE.grey))
        .multiplyScalar(0.55)
        .lerp(CAMP_CHAR, nrm.y < 0.2 ? 0.2 : 0.55),
    );
    site.add('prop', stone, vec(px, ctx.terrain.heightAt(px, pz) + 0.04, pz), rand() * TAU);
  }
  site.add(
    'prop',
    lathe(
      [
        [0, 0],
        [0.72, 0],
        [0.62, 0.035],
        [0, 0.05],
      ],
      16,
    ),
    vec(center.x, ctx.terrain.heightAt(center.x, center.z) - 0.005, center.z),
    0,
    1,
    2762792,
  );
  for (let i = 0; i < 4; i++) {
    const log = lathe(
      [
        [0, 0],
        [0.08, 0],
        [0.09, 0.85],
        [0, 0.85],
      ],
      7,
    );
    displace(log, 0.015, 5, i);
    log.translate(0, -0.42, 0);
    const euler = new Euler(Math.PI / 2 - 0.25 - rand() * 0.2, (i / 4) * TAU + rand() * 0.5, 0, 'YXZ');
    site.add(
      'prop',
      log,
      vec(center.x, ctx.terrain.heightAt(center.x, center.z) + 0.15, center.z),
      euler,
      1,
      i % 2 ? CAMP_CHAR : 2827296,
    );
  }
}
function wardBanner(site, ctx, x2, z2, yaw, height, rand) {
  const ground = ctx.terrain.heightAt(x2, z2);
  const axis = vec(randRange(rand, -0.12, 0.12), 1, randRange(rand, -0.12, 0.12)).normalize();
  const base = vec(x2, ground - 0.25, z2);
  const poleTop = base.clone().addScaledVector(axis, height + 0.25);
  site.prop(
    taperedTube(new LineCurve3(base, poleTop), 3, 6, (u) => 0.055 - u * 0.02),
    vec(0, 0, 0),
    0,
    CAMP_WOOD,
  );
  site.cylCol(base.clone().lerp(poleTop, 0.5), (height + 0.25) / 2, 0.08);
  const across = vec(Math.cos(yaw), 0, -Math.sin(yaw));
  const barPos = poleTop.clone().addScaledVector(axis, -0.12);
  site.prop(
    taperedTube(
      new LineCurve3(barPos.clone().addScaledVector(across, -0.62), barPos.clone().addScaledVector(across, 0.62)),
      2,
      5,
      () => 0.03,
    ),
    vec(0, 0, 0),
    0,
    CAMP_WOOD,
  );
  const clothW = 0.9;
  const clothH = height * 0.62;
  const cloth = roundedBox(clothW, clothH, 0.03, 0.01, 7);
  const position = cloth.attributes.position;
  const phase = rand() * 10;
  const tatter = (x) => Math.abs(Math.sin(x * 6.2 + phase)) * 0.55 + Math.abs(Math.sin(x * 15 + phase * 2)) * 0.18;
  const notchY = randRange(rand, -0.1, 0.2) * clothH;
  const notchSide = rand() < 0.5 ? -1 : 1;
  for (let i = 0; i < position.count; i++) {
    let px = position.getX(i);
    let py = position.getY(i);
    const k = (clothH / 2 - py) / clothH;
    if (k > 0.45) py += tatter(px) * (k - 0.45) * clothH * 0.9;
    if (Math.sign(px) === notchSide && Math.abs(px) > clothW * 0.3)
      px -= notchSide * Math.max(0, 0.16 - Math.abs(py - notchY) * 0.6);
    const wave = Math.sin(k * 4.2 + px * 2 + phase) * 0.11 * k + Math.sin(px * 6 + phase) * 0.03;
    position.setXYZ(i, px + k * k * 0.12, py, position.getZ(i) + wave);
  }
  cloth.computeVertexNormals();
  shadeVertices(cloth, (pos, nrm, col) => {
    const k = (clothH / 2 - pos.y) / clothH;
    col.copy(CAMP_CLOTH).lerp(CAMP_CLOTH_DARK, Math.min(1, k * 0.9));
    const drip = Math.max(0, Math.sin(pos.x * 9 + phase) - 0.55) * 2.2 * Math.max(0, k - 0.35);
    col.lerp(CAMP_INK, Math.min(0.9, drip));
  });
  const clothPos = barPos
    .clone()
    .add(vec(0, -clothH / 2 - 0.05, 0))
    .addScaledVector(vec(Math.sin(yaw), 0, Math.cos(yaw)), 0.07);
  site.add('prop', cloth, clothPos, yaw);
  const fwd = vec(Math.sin(yaw), 0, Math.cos(yaw));
  const maskPos = clothPos
    .clone()
    .add(vec(0, clothH * 0.12, 0))
    .addScaledVector(fwd, 0.04);
  const mask = lathe(
    [
      [0, 0],
      [0.24, 0],
      [0.26, 0.015],
      [0.2, 0.035],
      [0, 0.04],
    ],
    18,
  );
  mask.scale(1, 1, 1.18);
  site.add('prop', mask, maskPos, new Euler(Math.PI / 2, yaw, 0, 'YXZ'), 1, CAMP_MASK);
  for (const side of [-1, 1]) {
    const eye = roundedBox(0.1, 0.045, 0.02, 0.01, 3);
    site.add(
      'prop',
      eye,
      maskPos
        .clone()
        .add(vec(0, 0.06, 0))
        .addScaledVector(across, side * 0.09)
        .addScaledVector(fwd, 0.04),
      new Euler(0, yaw, side * 0.35, 'YXZ'),
      1,
      CAMP_INK,
    );
  }
  site.add(
    'prop',
    roundedBox(0.14, 0.03, 0.02, 0.01, 3),
    maskPos
      .clone()
      .add(vec(0, -0.09, 0))
      .addScaledVector(fwd, 0.04),
    new Euler(0, yaw, 0.1, 'YXZ'),
    1,
    CAMP_INK,
  );
}
function stake(site, ctx, x, z2, outward, rand) {
  const base = vec(x, ctx.terrain.heightAt(x, z2) - 0.2, z2);
  const len = randRange(rand, 1.3, 1.9);
  const dir = outward
    .clone()
    .setY(0)
    .normalize()
    .multiplyScalar(randRange(rand, 0.35, 0.6))
    .add(vec(0, 1, 0))
    .normalize();
  const tip = base.clone().addScaledVector(dir, len);
  site.prop(
    taperedTube(new LineCurve3(base, tip), 3, 6, (u) => (u < 0.8 ? 0.065 : 0.065 * (1 - (u - 0.8) / 0.2) + 0.004)),
    vec(0, 0, 0),
    0,
    CAMP_WOOD,
  );
  site.prop(
    taperedTube(new LineCurve3(base.clone().lerp(tip, 0.82), tip), 2, 6, (u) => 0.045 * (1 - u) + 0.004),
    vec(0, 0, 0),
    0,
    CAMP_INK,
  );
}
function bone(site, ctx, x, z, rand, scale = 1) {
  const len = randRange(rand, 0.45, 0.75) * scale;
  const geo = lathe(
    [
      [0, 0],
      [0.05 * scale, 0],
      [0.075 * scale, 0.03 * scale],
      [0.05 * scale, 0.08 * scale],
      [0.035 * scale, 0.2 * len],
      [0.035 * scale, len - 0.12 * scale],
      [0.05 * scale, len - 0.07 * scale],
      [0.075 * scale, len - 0.03 * scale],
      [0.05 * scale, len],
      [0, len],
    ],
    8,
  );
  geo.translate(0, -len / 2, 0);
  const inkSide = rand() < 0.5 ? -1 : 1;
  shadeVertices(geo, (pos, nrm, col) =>
    col.copy(CAMP_BONE).lerp(CAMP_INK, Math.max(0, Math.min(0.85, ((pos.y * inkSide) / (len / 2)) * 1.6 - 0.5))),
  );
  site.add(
    'prop',
    geo,
    vec(x, ctx.terrain.heightAt(x, z) + 0.05 * scale, z),
    new Euler(0, rand() * TAU, Math.PI / 2 + randRange(rand, -0.12, 0.12), 'YXZ'),
  );
}
function ribcage(site, ctx, x, z2, yaw, rand) {
  const along = vec(Math.sin(yaw), 0, Math.cos(yaw));
  const across = vec(Math.cos(yaw), 0, -Math.sin(yaw));
  for (let i = 0; i < 4; i++) {
    const root = vec(x, 0, z2).addScaledVector(along, (i - 1.5) * 0.55);
    const ribH = 1.3 - Math.abs(i - 1.5) * 0.25;
    const ribW = 0.9 - Math.abs(i - 1.5) * 0.12;
    const pts = [];
    for (let j = 0; j <= 8; j++) {
      const angle = (j / 8) * Math.PI * 0.8 + 0.1;
      const p = root.clone().addScaledVector(across, Math.cos(angle) * ribW);
      p.y = ctx.terrain.heightAt(p.x, p.z) - 0.15 + Math.sin(angle) * ribH;
      pts.push(p);
    }
    const tube = taperedTube(new CatmullRomCurve3(pts), 12, 6, (u) => 0.06 - u * 0.025);
    shadeVertices(tube, (pos, nrm, col) =>
      col.copy(CAMP_BONE).lerp(CAMP_INK, Math.max(0, 0.7 - (pos.y - ctx.terrain.heightAt(pos.x, pos.z)) * 0.9)),
    );
    site.add('prop', tube, vec(0, 0, 0));
  }
}
function inkRock(site, ctx, x, z, radius, rand) {
  const geo = rockGeometry(radius, rand() * 999, 0.75);
  const tint = stoneColor(rand, STONE.grey).multiplyScalar(0.8);
  const phase = rand() * 10;
  shadeVertices(geo, (pos, nrm, col) => {
    const upFacing = +(nrm.y > 0.35);
    const streak =
      Math.max(0, Math.sin(Math.atan2(pos.z, pos.x) * 5 + phase) - 0.3) * Math.max(0, pos.y / radius + 0.2);
    col.copy(tint).lerp(CAMP_INK, Math.min(0.92, upFacing * 0.9 + streak));
  });
  const y = ctx.terrain.heightAt(x, z) + radius * 0.2;
  site.add('prop', geo, vec(x, y, z), rand() * TAU);
  if (radius > 0.4) site.ballCol(vec(x, y, z), radius * 0.8);
}
function dressCamp(site, ctx, center, yaw, radius, dress, rand) {
  const local = localFrame(center, yaw);
  if (dress.stain) inkStain(site, ctx, center.x, center.z, dress.stain, rand);
  if (dress.pit) firePit(site, ctx, center, rand);
  const wards = dress.wards ?? 0;
  for (let i = 0; i < wards; i++) {
    const pos = local(
      (wards === 1 ? (rand() < 0.5 ? -1 : 1) : i % 2 ? 1 : -1) * randRange(rand, 2.4, 3.4),
      0,
      radius + randRange(rand, 6, 9) + Math.floor(i / 2) * 4,
    );
    wardBanner(site, ctx, pos.x, pos.z, yaw + randRange(rand, -0.3, 0.3), randRange(rand, 2.4, 3), rand);
  }
  for (let i = 0; i < (dress.stakes ?? 0); i++) {
    const angle = randRange(rand, -1.2, 1.2) + (i % 2 ? Math.PI * 0.5 : -Math.PI * 0.5);
    const pos = local(Math.sin(angle) * (radius + 1.6), 0, Math.cos(angle) * (radius + 1.6));
    stake(site, ctx, pos.x, pos.z, pos.clone().sub(center), rand);
  }
  for (let i = 0; i < (dress.bones ?? 0); i++) {
    const angle = rand() * TAU;
    const dist = randRange(rand, 1.1, radius + 0.8);
    bone(
      site,
      ctx,
      center.x + Math.cos(angle) * dist,
      center.z + Math.sin(angle) * dist,
      rand,
      randRange(rand, 0.8, 1.3),
    );
  }
  if (dress.ribs) {
    const pos = local(radius * 0.8, 0, -radius * 0.5);
    ribcage(site, ctx, pos.x, pos.z, yaw + 0.8, rand);
  }
  for (let i = 0; i < (dress.rocks ?? 0); i++) {
    const angle = rand() * TAU;
    const dist = randRange(rand, radius * 0.8, radius + 1.8);
    inkRock(
      site,
      ctx,
      center.x + Math.cos(angle) * dist,
      center.z + Math.sin(angle) * dist,
      randRange(rand, 0.3, 0.6),
      rand,
    );
  }
}
function towerFrame(ctx) {
  const tower = ctx.terrain.landmarks.tower;
  const spawn = ctx.terrain.landmarks.spawn;
  const dir = vec(spawn.x - tower.x, 0, spawn.z - tower.z).normalize();
  const yaw = Math.atan2(dir.x, dir.z);
  return {
    f: localFrame(vec(tower.x - dir.x * 2.5, 0, tower.z - dir.z * 2.5), yaw),
    yaw,
  };
}
const SMUDGE_CAMPS = [
  {
    id: 'meadow',
    kinds: ['smudgeling', 'smudgeling'],
    radius: 3.2,
    respawn: false,
    place: (ctx) => {
      const spawn = ctx.terrain.landmarks.spawn;
      return {
        x: spawn.x + 30,
        z: spawn.z - 25,
        yaw: yawTo(spawn.x + 30, spawn.z - 25, spawn.x + 14, spawn.z - 22),
      };
    },
    spot: {
      maxSlope: 0.3,
      footprint: 4,
      search: 4,
    },
    treeClear: 2.5,
    dress: {
      stain: 2.1,
      wards: 1,
      stakes: 2,
      bones: 3,
      rocks: 2,
    },
  },
  {
    id: 'lakeshore',
    kinds: ['smudgeling', 'smudgeling', 'smudgeling', 'spitter'],
    radius: 4.8,
    place: (ctx) => {
      const lake = ctx.terrain.landmarks.lake;
      return {
        x: lake.x + 41,
        z: lake.z + 7,
        yaw: yawTo(lake.x + 41, lake.z + 7, lake.x + 60, lake.z + 40),
      };
    },
    spot: {
      maxSlope: 0.35,
      footprint: 5,
      minH: 0.9,
      search: 12,
    },
    dress: {
      stain: 2.9,
      wards: 2,
      stakes: 3,
      bones: 4,
      ribs: true,
      rocks: 3,
    },
  },
  {
    id: 'tower',
    kinds: ['brute', 'smudgeling', 'smudgeling'],
    radius: 4.5,
    place: (ctx) => {
      const { f, yaw } = towerFrame(ctx);
      const pos = f(0, 0, 8.5);
      return {
        x: pos.x,
        z: pos.z,
        yaw,
      };
    },
    spot: {
      maxSlope: 0.6,
      footprint: 2,
      search: 3,
    },
    dress: {
      wards: 2,
      bones: 5,
      rocks: 2,
    },
  },
  {
    id: 'canyon-w',
    kinds: ['spitter'],
    radius: 1.6,
    place: (ctx) => {
      const canyon = ctx.terrain.landmarks.canyon;
      return {
        x: canyon.x - 9,
        z: canyon.z - 4,
        yaw: yawTo(canyon.x - 9, canyon.z - 4, canyon.x, canyon.z + 20),
      };
    },
    spot: {
      maxSlope: 0.75,
      footprint: 1.5,
      minH: 16,
      search: 8,
    },
    dress: {
      rocks: 2,
      bones: 1,
    },
  },
  {
    id: 'canyon-e',
    kinds: ['spitter'],
    radius: 1.6,
    place: (ctx) => {
      const canyon = ctx.terrain.landmarks.canyon;
      return {
        x: canyon.x + 13,
        z: canyon.z - 6,
        yaw: yawTo(canyon.x + 13, canyon.z - 6, canyon.x, canyon.z + 20),
      };
    },
    spot: {
      maxSlope: 0.75,
      footprint: 1.5,
      minH: 16,
      search: 8,
    },
    dress: {
      bones: 2,
      rocks: 1,
    },
  },
  {
    id: 'forest',
    kinds: ['smudgeling', 'spitter', 'smudgeling'],
    radius: 3.4,
    place: (ctx) => {
      const forest = ctx.terrain.landmarks.forest;
      return {
        x: forest.x - 2,
        z: forest.z,
        yaw: yawTo(forest.x - 2, forest.z, forest.x - 8, forest.z + 4),
      };
    },
    spot: {
      maxSlope: 0.35,
      footprint: 3,
      search: 6,
    },
    treeClear: 0.5,
    dress: {
      stain: 2.6,
      wards: 1,
      stakes: 3,
      bones: 3,
      rocks: 3,
    },
  },
  {
    id: 'mesa',
    kinds: ['smudgeling', 'smudgeling'],
    radius: 3.4,
    place: (ctx) => {
      const mesa = ctx.terrain.landmarks.mesa;
      return {
        x: mesa.x - 15,
        z: mesa.z + 34,
        yaw: yawTo(mesa.x - 15, mesa.z + 34, mesa.x + 5, mesa.z + 58),
      };
    },
    spot: {
      maxSlope: 0.35,
      footprint: 4,
      search: 8,
    },
    dress: {
      stain: 2.3,
      wards: 1,
      stakes: 2,
      bones: 3,
      rocks: 2,
    },
  },
];
export function buildSmudgeCamps(ctx, mats, hints) {
  const camps = [];
  const site = new Site(ctx, 'smudge-camps');
  for (const def of SMUDGE_CAMPS)
    safe(`camp ${def.id}`, () => {
      const placed = def.place(ctx);
      if (!placed) return;
      const avoid = [...(def.spot?.avoid ?? [])];
      if (def.treeClear !== undefined)
        try {
          for (const tree of ctx.vegetation?.treesNear?.(vec(placed.x, 0, placed.z), (def.spot?.search ?? 18) + 12) ??
            [])
            avoid.push({
              x: tree.position.x,
              z: tree.position.z,
              r: tree.radius + def.treeClear,
            });
        } catch {}
      const center =
        findSpot(ctx, placed.x, placed.z, {
          ...def.spot,
          avoid,
        }) ??
        findSpot(ctx, placed.x, placed.z, def.spot) ??
        vec(placed.x, ctx.terrain.heightAt(placed.x, placed.z), placed.z);
      const rand = rng(`smudge-camp-${def.id}`);
      addClearing(center.x, center.z, def.clear ?? def.radius + 1.6);
      dressCamp(site, ctx, center, placed.yaw, def.radius, def.dress, rand);
      const forward = vec(Math.sin(placed.yaw), 0, Math.cos(placed.yaw));
      const warpPos = center.clone().addScaledVector(forward, def.radius + 13);
      warpPos.y = Math.max(ctx.terrain.heightAt(warpPos.x, warpPos.z), ctx.water?.level ?? 0) + 0.4;
      camps.push({
        id: def.id,
        center,
        kinds: def.kinds,
        radius: def.radius,
        respawn: def.respawn ?? true,
        warp: {
          pos: warpPos,
          facing: yawTo(warpPos.x, warpPos.z, center.x, center.z),
        },
      });
    });
  safe('camp hint', () => {
    const meadow = camps.find((camp) => camp.id === 'meadow');
    const spawn = ctx.terrain.landmarks.spawn;
    const spot = findSpot(ctx, spawn.x + 6, spawn.z - 19, {
      maxSlope: 0.4,
      search: 5,
      avoid: [
        {
          x: spawn.x + 1,
          z: spawn.z - 21,
          r: 2.2,
        },
      ],
    });
    if (!spot) return;
    const yaw = meadow ? yawTo(spot.x, spot.z, spawn.x, spawn.z) : 0;
    const stonePos = hintStone(site, ctx, spot.x, spot.z, yaw, 1.9, rng('camp-hint-stone'), 15260072);
    hints.add(
      stonePos,
      'Grey Smudges gather where colour has drained. Fix your gaze on one, strike true — and when it lunges, step aside.',
    );
  });
  site.build(mats);
  return camps;
}
export function spawnSmudgeCamps(ctx, camps) {
  const nocombat = ctx.params.get('nocombat');
  if (nocombat !== null && nocombat !== '0' && nocombat !== 'false') return;
  const enemies = ctx.enemies;
  if (enemies && typeof enemies.spawnCamp == 'function')
    for (const camp of camps)
      try {
        enemies.spawnCamp(`camp-${camp.id}`, camp.center.clone(), camp.kinds.slice(), {
          radius: camp.radius,
          respawn: camp.respawn,
        });
      } catch (err) {
        console.warn(`[content] spawnCamp ${camp.id} failed`, err);
      }
}
