/**
 * The four colour trials: Bloom on the mesa, Frost on the lake islet, Spring at the ruined tower and Ember in the grove behind the bramble gate. Builds each trial's ruins, hint stones, ink plants, warp point and Prism, shows the prompt to touch a dormant Prism and completes the trial when it is touched.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { PALETTE } from '../core/config.js';
import {
  columnGeometry,
  displace,
  heightStats,
  lathe,
  randRange,
  rng,
  roundedBox,
  safe,
  slopeAt,
  TAU,
} from '../shared/util.js';
import { Bramble } from './bramble.js';
import { Prism } from './prism.js';
import {
  archway,
  column,
  fallenColumn,
  hintStone,
  localFrame,
  paving,
  rubble,
  ruinWall,
  shrineDais,
  stairway,
  STONE,
  stoneBlock,
  stoneColor,
} from './ruin-kit.js';
import { addClearing, Site } from './site.js';
import { buildVines } from './vines.js';
export const TRIAL_DEFS = [
  {
    color: 'green',
    id: 'bloom',
    name: 'Bloom',
    landmark: 'mesa',
    glow: 1,
    line: 'Moss wakes on the old stone. The green remembers.',
  },
  {
    color: 'blue',
    id: 'frost',
    name: 'Frost',
    landmark: 'lakeIslet',
    glow: 2,
    line: 'The lake sighs, and its blue runs deep once more.',
  },
  {
    color: 'yellow',
    id: 'spring',
    name: 'Spring',
    landmark: 'tower',
    glow: 3,
    line: 'Gold leaps from the tower like the first morning light.',
  },
  {
    color: 'red',
    id: 'ember',
    name: 'Ember',
    landmark: 'grove',
    glow: 4,
    line: 'A warm glow kindles in the heart of the grove.',
  },
];
const trialVec = (x, y, z) => new Vector3(x, y, z);
const trialHex = (color) => PALETTE[color].hex;
export class Trials {
  ctx;
  mats;
  particles;
  hints;
  ink;
  trials = [];
  bramble = null;
  promptOn = false;
  onComplete = null;
  warps = {};
  constructor(ctx, mats, particles, hints, ink) {
    this.ctx = ctx;
    this.mats = mats;
    this.particles = particles;
    this.hints = hints;
    this.ink = ink;
  }
  get completeCount() {
    return this.trials.filter((trial) => trial.complete).length;
  }
  build() {
    for (const def of TRIAL_DEFS) {
      const trial = safe(`trial ${def.id}`, () => {
        switch (def.color) {
          case 'green':
            return this.buildMesa(def);
          case 'blue':
            return this.buildLake(def);
          case 'yellow':
            return this.buildTower(def);
          case 'red':
            return this.buildGrove(def);
        }
      });
      if (trial) this.trials.push(trial);
    }
  }
  makePrism(def, site, pedestalTop, touch, daisTop, warp) {
    const pos = trialVec(touch.x, pedestalTop + 1.95, touch.z);
    return {
      def,
      prism: new Prism(this.ctx, def.color, pos, this.particles, daisTop),
      site,
      touch,
      daisTop,
      complete: false,
      warp,
    };
  }
  buildMesa(def) {
    const ctx = this.ctx;
    const rand = rng('mesa');
    const mesa = ctx.terrain.landmarks.mesa.clone();
    const site = new Site(ctx, 'trial-mesa');
    const topY = heightStats(ctx, mesa.x, mesa.z, 5).max;
    const levels = shrineDais(site, ctx, trialVec(mesa.x, topY, mesa.z), 4.6, trialHex(def.color), def.glow, rand, {
      stepsYaw: 0,
      pillars: 7,
    });
    const at = localFrame(trialVec(mesa.x, 0, mesa.z), 0);
    const wallStart = at(-9, 0, -4);
    const wallEnd = at(-6, 0, -9.5);
    ruinWall(site, ctx, wallStart.x, wallStart.z, wallEnd.x, wallEnd.z, 2.8, 0.8, rand, {
      window: 1.2,
    });
    const wall2Start = at(7, 0, -8);
    const wall2End = at(10, 0, -2);
    ruinWall(site, ctx, wall2Start.x, wall2Start.z, wall2End.x, wall2End.z, 2.2, 0.8, rand);
    const archPos = at(0, 0, 8.6);
    archway(site, ctx, archPos.x, archPos.z, 0, 3.2, 3, rand, {
      glyphColor: trialHex(def.color),
      glow: def.glow,
    });
    for (const [x, z] of [
      [-8, 5],
      [8.5, 4.5],
    ]) {
      const pos = at(x, 0, z);
      column(
        site,
        ctx,
        pos.x,
        pos.z,
        {
          h: randRange(rand, 1.4, 3.2),
          broken: 0.5,
        },
        rand,
      );
    }
    const fallenPos = at(-4.5, 0, 9.5);
    fallenColumn(site, ctx, fallenPos.x, fallenPos.z, 1.2, 0.36, 4.2, rand);
    rubble(site, ctx, mesa.x, mesa.z, 11, 14, rand);
    site.build(this.mats);
    const baseSite = new Site(ctx, 'mesa-base');
    let foot = null;
    for (let d = 10; d < 45; d += 0.75) {
      const y = ctx.terrain.heightAt(mesa.x, mesa.z + d);
      if (y < mesa.y - 20 && slopeAt(ctx, mesa.x, mesa.z + d, 1.5) < 0.6) {
        foot = trialVec(mesa.x, y, mesa.z + d + 3);
        break;
      }
    }
    foot ||= trialVec(mesa.x, ctx.terrain.heightAt(mesa.x, mesa.z + 22), mesa.z + 22);
    foot.y = ctx.terrain.heightAt(foot.x, foot.z);
    const hintPos = hintStone(baseSite, ctx, foot.x + 3.2, foot.z + 1.5, Math.PI * 0.05, 2, rand, trialHex(def.color));
    this.hints.add(hintPos, 'Stone that will not be climbed... may yet be overgrown.');
    stairway(baseSite, ctx, foot.x - 1.5, foot.z + 1, foot.x - 1.5, foot.z - 3.5, 2.4, rand, {
      cheeks: true,
    });
    rubble(baseSite, ctx, foot.x - 1.5, foot.z - 4.5, 3, 10, rand, 0.5);
    column(
      baseSite,
      ctx,
      foot.x - 4.5,
      foot.z + 0.5,
      {
        h: 2.2,
        broken: 0.6,
        glyph: {
          color: trialHex(def.color),
          glow: 0,
        },
      },
      rand,
    );
    baseSite.build(this.mats);
    this.ink.add('green', foot.x + 2, foot.z + 4);
    this.ink.add('green', foot.x - 4, foot.z + 3.5);
    let inkSpot = null;
    let bestScore = Infinity;
    for (let angle = 0; angle < TAU; angle += TAU / 48)
      for (let dist = 12; dist < 26; dist += 0.75) {
        const x = mesa.x + Math.sin(angle) * dist;
        const z = mesa.z + Math.cos(angle) * dist;
        const y = ctx.terrain.heightAt(x, z);
        if (y < 21 || y > 31 || slopeAt(ctx, x, z, 0.8) > 0.35) continue;
        const score = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) + Math.abs(y - 26) * 0.05;
        if (score < bestScore) {
          bestScore = score;
          inkSpot = trialVec(x, y, z);
        }
      }
    if (inkSpot) this.ink.addAt('green', inkSpot);
    const warpPos = trialVec(foot.x, foot.y + 0.2, foot.z + 6);
    this.warps.mesa = {
      pos: warpPos,
      facing: Math.PI,
    };
    return this.makePrism(
      def,
      trialVec(mesa.x, topY, mesa.z),
      levels.pedestalTop,
      trialVec(mesa.x, 0, mesa.z),
      levels.top,
      warpPos,
    );
  }
  buildLake(def) {
    const ctx = this.ctx;
    const rand = rng('lake');
    const islet = ctx.terrain.landmarks.lakeIslet.clone();
    const waterY = ctx.water?.level ?? 0;
    const site = new Site(ctx, 'trial-lake');
    let topY = heightStats(ctx, islet.x, islet.z, 4).max;
    if (topY < waterY + 1) {
      topY = waterY + 1.2;
      const plinth = lathe(
        [
          [0, 0],
          [6.2, 0],
          [6, topY - waterY + 2.5 - 0.3],
          [5.7, topY - waterY + 2.5],
          [0, topY - waterY + 2.5],
        ],
        40,
      );
      displace(plinth, 0.12, 0.5, 3);
      site.stone(plinth, trialVec(islet.x, waterY - 2.5 - 0.35, islet.z), 0, stoneColor(rand, STONE.dark));
      site.cylCol(
        trialVec(islet.x, (waterY - 2.85 + topY - 0.35) / 2, islet.z),
        (topY - 0.35 - (waterY - 2.85)) / 2,
        6,
      );
      topY -= 0.35;
    }
    const spawn = ctx.terrain.landmarks.spawn;
    const dir = trialVec(spawn.x - islet.x, 0, spawn.z - islet.z).normalize();
    const angle = Math.atan2(dir.x, dir.z);
    const levels = shrineDais(site, ctx, trialVec(islet.x, topY, islet.z), 3.4, trialHex(def.color), def.glow, rand, {
      stepsYaw: angle,
      pillars: 5,
      groundY: Math.max(topY, waterY + 0.6),
    });
    site.build(this.mats);
    const causeway = new Site(ctx, 'lake-causeway');
    let shore = null;
    for (let d = 7; d < 70; d += 0.5) {
      const x = islet.x + dir.x * d;
      const z = islet.z + dir.z * d;
      if (ctx.terrain.heightAt(x, z) > waterY + 0.6) {
        shore = trialVec(x, ctx.terrain.heightAt(x, z), z);
        break;
      }
    }
    shore ||= trialVec(islet.x + dir.x * 35, waterY + 1, islet.z + dir.z * 35);
    const dist = Math.hypot(shore.x - islet.x, shore.z - islet.z);
    let count = 0;
    for (let d = 7.5; d < dist - 3; d += 7.2) {
      count++;
      const x = islet.x + dir.x * d + (rand() - 0.5) * 1.5;
      const z = islet.z + dir.z * d + (rand() - 0.5) * 1.5;
      const ground = ctx.terrain.heightAt(x, z);
      const height = (count % 3 == 2 ? waterY - 0.35 : waterY + randRange(rand, 0.55, 0.95)) - ground;
      if (height < 0.3) continue;
      const stepStone = lathe(
        [
          [0, 0],
          [1.25, 0],
          [1.15, height * 0.7],
          [1.05, height - 0.12],
          [0.92, height],
          [0, height],
        ],
        18,
      );
      displace(stepStone, 0.1, 0.9, count);
      causeway.stone(stepStone, trialVec(x, ground - 0.2, z), rand() * TAU, stoneColor(rand, STONE.grey));
      causeway.cylCol(trialVec(x, ground - 0.2 + height / 2, z), height / 2, 1.05);
    }
    const landing = shore.clone().addScaledVector(dir, 4);
    landing.y = ctx.terrain.heightAt(landing.x, landing.z);
    paving(causeway, ctx, landing.x, landing.z, 4.5, rand, {
      gap: 0.1,
    });
    const archPos = shore.clone().addScaledVector(dir, 2.2);
    archway(causeway, ctx, archPos.x, archPos.z, angle, 2.8, 2.6, rand, {
      broken: true,
      glyphColor: trialHex(def.color),
      glow: def.glow,
    });
    const side = trialVec(dir.z, 0, -dir.x);
    const stelePos = landing.clone().addScaledVector(side, 4.2).addScaledVector(dir, 1.5);
    const hintPos = hintStone(causeway, ctx, stelePos.x, stelePos.z, angle, 1.9, rand, trialHex(def.color));
    this.hints.add(hintPos, 'The lake is wide and cold... colder still, it would bear your weight.');
    causeway.build(this.mats);
    for (const [across, along] of [
      [-3.5, 2.5],
      [3.2, 5.5],
      [-5, 6],
    ]) {
      const pos = landing
        .clone()
        .addScaledVector(side, across)
        .addScaledVector(dir, along - 3);
      this.ink.add('blue', pos.x, pos.z);
    }
    const warpPos = landing.clone().addScaledVector(dir, 4).setY(0);
    warpPos.y = ctx.terrain.heightAt(warpPos.x, warpPos.z) + 0.2;
    this.warps.lake = {
      pos: warpPos,
      facing: Math.atan2(-dir.x, -dir.z),
    };
    this.warps.lakeIslet = {
      pos: trialVec(islet.x + dir.x * 2.5, levels.top + 0.2, islet.z + dir.z * 2.5),
      facing: Math.atan2(-dir.x, -dir.z),
    };
    return this.makePrism(
      def,
      trialVec(islet.x, topY, islet.z),
      levels.pedestalTop,
      trialVec(islet.x, 0, islet.z),
      levels.top,
      warpPos,
    );
  }
  buildTower(def) {
    const ctx = this.ctx;
    const rand = rng('tower');
    const tower = ctx.terrain.landmarks.tower.clone();
    const spawn = ctx.terrain.landmarks.spawn;
    const dir = trialVec(spawn.x - tower.x, 0, spawn.z - tower.z).normalize();
    const angle = Math.atan2(dir.x, dir.z);
    const base = trialVec(tower.x - dir.x * 2.5, 0, tower.z - dir.z * 2.5);
    const baseY = heightStats(ctx, base.x, base.z, 5).min;
    base.y = baseY;
    addClearing(base.x, base.z, 6.5);
    const at = localFrame(base, angle);
    const site = new Site(ctx, 'trial-tower');
    const hex = trialHex(def.color);
    const radial = (a) => trialVec(Math.sin(angle + a), 0, Math.cos(angle + a));
    const polar = (a, r, y) => trialVec(base.x, baseY + y, base.z).addScaledVector(radial(a), r);
    const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const core = lathe(
      [
        [0, -2.5],
        [3.88, -2.5],
        [3.88, 19.1],
        [0, 19.1],
      ],
      32,
    );
    site.stone(core, base.clone(), 0, 10721151);
    site.cylCol(trialVec(base.x, baseY + 17.5 / 2, base.z), 22.5 / 2, 4.08);
    const windows = [
      [0.95, 6.8, 1.7, 0.8],
      [2.6, 9.3, 1.5, 0.75],
      [-1.9, 13.8, 1.7, 0.8],
      [-0.7, 16.6, 1.3, 0.7],
      [3.5, 4.4, 1.3, 0.7],
      [0, 13.4, 2.1, 1.1],
    ];
    const door = [0, 1.55, 2.7, 1.5];
    const openings = [...windows, door];
    const bricks = [];
    for (let i = 0; i < 6; i++) {
      const brick = roundedBox(1, 0.7, 0.46, 0.055, 1.4);
      displace(brick, 0.03, 1.6, i * 7.3);
      bricks.push(brick);
    }
    const courseH = 0.72;
    const perCourse = Math.round((TAU * 4) / 1.35);
    for (let i = 0; i < 24; i++) {
      const y = 1.25 + i * courseH + courseH / 2;
      const stagger = (i % 2) * 0.5 + (rand() - 0.5) * 0.15;
      for (let j = 0; j < perCourse; j++) {
        const theta = ((j + stagger) / perCourse) * TAU;
        if (
          openings.some(
            ([oa, oy, oh, ow]) => angleDiff(theta, oa) < (ow / 2 + 0.55) / 4 && Math.abs(y - oy) < oh / 2 + 0.3,
          )
        )
          continue;
        const backDiff = angleDiff(theta, Math.PI);
        if ((i >= 20 && backDiff < 1.3 && rand() < 0.25 + (i - 20) * 0.2) || rand() < 0.015) continue;
        const brickW = (TAU * 4) / perCourse - 0.025;
        const brick = bricks[Math.floor(rand() * bricks.length)].clone();
        const radius = 4.14 + (rand() < 0.12 ? randRange(rand, 0.03, 0.08) : 0);
        site.stone(
          brick,
          polar(theta, radius, y),
          new Euler((rand() - 0.5) * 0.03, angle + theta + (rand() - 0.5) * 0.03, (rand() - 0.5) * 0.03, 'YXZ'),
          stoneColor(rand, rand() < 0.3 ? STONE.warm : STONE.pale),
          trialVec(brickW, 0.698, 1),
        );
      }
    }
    const plinthCount = Math.round((TAU * 4.5) / 1.9);
    for (let i = 0; i < plinthCount; i++) {
      const theta = ((i + 0.5) / plinthCount) * TAU;
      if (angleDiff(theta, 0) < 0.3) continue;
      const plinthBlock = roundedBox((TAU * 4.5) / plinthCount - 0.06, 1.9, 1, 0.12, 1.2);
      displace(plinthBlock, 0.05, 1.1, i);
      const ground = ctx.terrain.heightAt(polar(theta, 4.5, 0).x, polar(theta, 4.5, 0).z);
      site.stone(
        plinthBlock,
        polar(theta, 4.45, 0).setY(Math.min(ground, baseY) + 0.45),
        new Euler(-0.12, angle + theta, 0, 'YXZ'),
        stoneColor(rand, STONE.dark),
      );
    }
    site.cylCol(trialVec(base.x, baseY - 0.5, base.z), 1.9, 4.85);
    for (const bandY of [6.1, 11.95]) {
      const band = lathe(
        [
          [4.1, -0.16],
          [4.32, -0.06],
          [4.36, 0.08],
          [4.3, 0.16],
          [4.1, 0.2],
        ],
        48,
      );
      displace(band, 0.025, 1.5, bandY);
      site.stone(band, trialVec(base.x, baseY + bandY, base.z), 0, stoneColor(rand, STONE.marble));
      for (let i = 0; i < 20; i++) {
        const theta = (i / 20) * TAU;
        site.glyph(polar(theta, 4.365, bandY + 0.03), radial(theta), 0.22, (i * 7) % 15, hex, def.glow);
      }
    }
    for (const theta of [Math.PI - 0.95, Math.PI]) {
      const tiers = [
        [1.3, 3.6, 2.2],
        [1.05, 3, 1.5],
        [0.85, 2.4, 0.95],
      ];
      let y = -0.6;
      for (const [width, height, depth] of tiers) {
        const pos = polar(theta, 4 + depth / 2, y + height / 2);
        const tier = roundedBox(width, height, depth, 0.12, 1.1);
        displace(tier, 0.05, 1, theta + y);
        site.stone(tier, pos, angle + theta, stoneColor(rand, STONE.pale));
        site.boxCol(pos, width / 2, height / 2, depth / 2, angle + theta);
        const cap = roundedBox(width + 0.1, 0.25, depth + 0.1, 0.08, 2);
        site.stone(
          cap,
          pos.clone().add(trialVec(0, height / 2 + 0.08, 0)),
          new Euler(-0.28, angle + theta, 0, 'YXZ'),
          stoneColor(rand, STONE.marble),
        );
        y += height;
      }
    }
    for (const [theta, oy, oh, ow] of openings) {
      const low = oy < 2;
      site.prop(roundedBox(ow, oh, 0.3, 0.1, 2), polar(theta, 3.95, oy), angle + theta, 2367259);
      for (const side of [-1, 1]) {
        const pos = polar(theta, 4.18, oy).addScaledVector(
          trialVec(Math.cos(angle + theta), 0, -Math.sin(angle + theta)),
          side * (ow / 2 + 0.17),
        );
        const jamb = roundedBox(0.3, oh + 0.1, 0.55, 0.07, 2);
        displace(jamb, 0.02, 2, theta + side);
        site.stone(jamb, pos, angle + theta, stoneColor(rand, STONE.marble));
      }
      for (let i = 0; i < 5; i++) {
        const frac = (i + 0.5) / 5;
        const phi = Math.PI * (1 - frac);
        const archR = ow / 2 + 0.17;
        const across = trialVec(Math.cos(angle + theta), 0, -Math.sin(angle + theta));
        const pos = polar(theta, 4.2, oy + oh / 2)
          .addScaledVector(across, Math.cos(phi) * archR)
          .add(trialVec(0, Math.sin(phi) * archR * 0.9, 0));
        const rot = new Quaternion()
          .setFromAxisAngle(trialVec(0, 1, 0), angle + theta)
          .multiply(new Quaternion().setFromAxisAngle(trialVec(0, 0, 1), phi - Math.PI / 2));
        site.stone(roundedBox(0.32, (Math.PI * archR) / 5, 0.55, 0.06, 2), pos, rot, stoneColor(rand, STONE.marble));
      }
      if (!low)
        site.stone(
          roundedBox(ow + 0.5, 0.16, 0.6, 0.05, 2),
          polar(theta, 4.2, oy - oh / 2 - 0.08),
          angle + theta,
          stoneColor(rand, STONE.marble),
        );
    }
    {
      const doorPos = polar(0, 5.2, 0);
      rubble(site, ctx, doorPos.x, doorPos.z, 1.3, 7, rand, 0.5);
    }
    const balconyW = 5.4;
    stoneBlock(site, at(0, 12, 5.3).clone(), balconyW, 0.6, 3.8000000000000003, angle, rand, {
      color: stoneColor(rand, STONE.marble),
    });
    for (const x of [-1.8, 0, 1.8])
      for (let i = 0; i < 3; i++) {
        const depth = 0.7 + i * 0.6;
        const pos = at(x, 11.45 - i * 0.42, 4 + depth / 2 - 0.1);
        site.stone(roundedBox(0.55, 0.42, depth, 0.08, 2), pos, angle, stoneColor(rand, STONE.pale));
      }
    for (let i = 0; i <= 12; i++) {
      const x = -2.45 + (i / 12) * 4.9;
      if (Math.abs(x) < 0.9) continue;
      const pos = at(x, 12.3, 7);
      const baluster = lathe(
        [
          [0, 0],
          [0.11, 0],
          [0.07, 0.12],
          [0.1, 0.35],
          [0.06, 0.6],
          [0.1, 0.68],
          [0.1, 0.72],
          [0, 0.72],
        ],
        8,
      );
      site.stone(baluster, pos, 0, stoneColor(rand, STONE.marble));
    }
    for (const side of [-1, 1]) {
      stoneBlock(site, at(side * 1.75, 13.1, 7), 1.75, 0.16, 0.3, angle, rand);
      stoneBlock(site, at(side * (balconyW / 2 - 0.15), 12.75, 7), 0.3, 0.9, 0.3, angle, rand);
    }
    const stepDepth = 1.55;
    const spiralPoint = (a, y) => polar(a, 4.875, y + 0.01);
    const rampCollider = (from, to) => {
      const dir = to.clone().sub(from);
      const len = dir.length();
      if (len < 0.001) return;
      dir.divideScalar(len);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      const out = trialVec(mid.x - base.x, 0, mid.z - base.z).normalize();
      out.addScaledVector(dir, -out.dot(dir)).normalize();
      const up = new Vector3().crossVectors(out, dir);
      if (up.y < 0) {
        up.negate();
        out.negate();
      }
      const rot = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(dir, up, out));
      site.boxCol(mid.addScaledVector(up, -0.16), len / 2 + 0.08, 0.16, stepDepth / 2, rot);
    };
    const spiralRun = (a0, a1, y0, y1, landing) => {
      const steps = Math.max(2, Math.round((y1 - y0) / 0.3));
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const theta = a0 + (a1 - a0) * u;
        const stepY = y0 + (y1 - y0) * u;
        const isLanding = landing && i === steps;
        const depth = isLanding ? 2.6 : stepDepth;
        const width = isLanding ? 1.9 : 0.95;
        const pos = polar(theta, 4.1 + depth / 2, stepY - 0.16);
        const step = roundedBox(width, 0.34, depth, 0.06, 1.6);
        displace(step, 0.025, 1.6, theta * 10 + stepY);
        site.stone(step, pos, angle + theta, stoneColor(rand, rand() < 0.5 ? STONE.pale : STONE.warm));
        if (i === 0) site.boxCol(pos, width / 2, 0.17, depth / 2, angle + theta);
        if (isLanding) {
          const half = (width / 2 + 0.1) / 2;
          const side = trialVec(Math.cos(angle + theta), 0, -Math.sin(angle + theta)).multiplyScalar(
            Math.sign(a1 - a0),
          );
          site.boxCol(pos.clone().addScaledVector(side, width / 2 - half), half, 0.17, depth / 2, angle + theta);
        }
        if (i < steps) {
          const next = (i + 1) / steps;
          rampCollider(spiralPoint(theta, stepY), spiralPoint(a0 + (a1 - a0) * next, y0 + (y1 - y0) * next));
        }
        if (isLanding) {
          const corbel = roundedBox(0.6, 0.9, 1.6, 0.08, 1.5);
          site.stone(
            corbel,
            polar(theta, 4.8, stepY - 0.8),
            new Euler(0.45, angle + theta, 0, 'YXZ'),
            stoneColor(rand, STONE.pale),
          );
        }
      }
    };
    spiralRun(-2.45, -0.86, 3.2, 9.2, true);
    spiralRun(0.62, 1.95, 12.6, 16.8, true);
    for (const [a0, a1, y0, y1] of [
      [-3.2, -2.55, 0.9, 2.8],
      [-0.7, 0.45, 9.6, 12],
    ]) {
      const steps = Math.max(2, Math.round((y1 - y0) / 0.6));
      for (let i = 0; i <= steps; i++) {
        if (rand() < 0.35) continue;
        const frac = i / steps;
        const theta = a0 + (a1 - a0) * frac;
        if (angleDiff(theta, 0) < 0.62 && y0 > 8) continue;
        const y = y0 + (y1 - y0) * frac;
        site.stone(
          roundedBox(0.9, 0.3, 0.55, 0.06, 1.6),
          polar(theta, 4.35, y),
          new Euler((rand() - 0.5) * 0.3, angle + theta, (rand() - 0.5) * 0.3, 'YXZ'),
          stoneColor(rand),
        );
      }
    }
    for (let i = 0; i < 5; i++) {
      const theta = randRange(rand, -3.1, -1.8);
      const pos = polar(theta, 4 + randRange(rand, 1.8, 3.5), 0);
      stoneBlock(
        site,
        trialVec(pos.x, ctx.terrain.heightAt(pos.x, pos.z) + 0.15, pos.z),
        0.95,
        0.34,
        1.5,
        new Euler(rand() * 0.3, angle + theta + rand(), rand() * 0.3),
        rand,
      );
    }
    site.glyph(at(0, 12.31, 5.6), trialVec(0, 1, 0), 1, 6, hex, def.glow, -angle);
    {
      const bannerLen = 4.2;
      const banner = roundedBox(1.3, bannerLen, 0.05, 0.02, 3);
      const position = banner.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);
        const down = (bannerLen / 2 - y) / bannerLen;
        position.setZ(i, position.getZ(i) + Math.sin(down * 6 + position.getX(i) * 2) * 0.12 * down);
        if (down > 0.9) position.setY(i, y + Math.abs(Math.sin(position.getX(i) * 9)) * 0.25);
      }
      banner.computeVertexNormals();
      const bannerTheta = 2.55;
      site.prop(banner, polar(bannerTheta, 4.42, 17.3 - bannerLen / 2), angle + bannerTheta, 13212218);
      site.glyph(polar(bannerTheta, 4.47, 16), radial(bannerTheta), 0.8, 3, 16773296, 0);
      stoneBlock(site, polar(bannerTheta, 4.4, 17.4), 1.6, 0.14, 0.14, angle + bannerTheta, rand, {
        collider: false,
      });
    }
    const topY = baseY + 20;
    for (let i = 0; i < 22; i++) {
      const theta = (i / 22) * TAU;
      if (!(angleDiff(theta, Math.PI) < 0.9 && i % 3 == 0))
        site.stone(
          roundedBox(0.45, 0.8, 0.9, 0.08, 2),
          polar(theta, 4.4, 18.75),
          new Euler(0.25, angle + theta, 0, 'YXZ'),
          stoneColor(rand, STONE.pale),
        );
    }
    const deck = lathe(
      [
        [0, -0.55],
        [4.55, -0.55],
        [4.85, -0.3],
        [4.88, -0.05],
        [4.8, 0],
        [0, 0],
      ],
      44,
    );
    displace(deck, 0.04, 1.2, 3);
    site.stone(deck, trialVec(base.x, topY, base.z), 0, stoneColor(rand, STONE.marble));
    site.cylCol(trialVec(base.x, topY - 0.3, base.z), 0.3, 4.85);
    const parapetR = 4.55;
    for (let i = 0; i < 18; i++) {
      const theta = (i / 18) * TAU;
      if (angleDiff(theta, 0) < 0.6 || angleDiff(theta, 1.95) < 0.55 || rand() < 0.22) continue;
      const height = angleDiff(theta, Math.PI) < 1 ? randRange(rand, 0.35, 0.8) : randRange(rand, 0.7, 1.15);
      const width = (TAU * parapetR) / 18 - 0.1;
      stoneBlock(site, polar(theta, parapetR, 20 + height / 2), width, height, 0.5, angle + theta, rand);
    }
    for (let i = 0; i < 4; i++) {
      const pos = polar(Math.PI / 4 + (i / 4) * TAU, 2.8, 20);
      const height = i === 1 ? 1.5 : randRange(rand, 2.6, 3.4);
      const column = columnGeometry(0.2, height, {
        base: true,
        capital: i !== 1,
        broken: i === 1 ? 0.35 : 0,
        flutes: 8,
        seed: i,
      });
      site.stone(column, trialVec(pos.x, topY - 0.05, pos.z), 0, stoneColor(rand, STONE.marble));
      site.cylCol(trialVec(pos.x, topY + height / 2, pos.z), height / 2, 0.24);
    }
    for (let i = 0; i < 14; i++) {
      const theta = (i / 14) * TAU;
      site.glyph(
        trialVec(base.x + Math.cos(theta) * 2, topY + 0.003, base.z + Math.sin(theta) * 2),
        trialVec(0, 1, 0),
        0.5,
        i % 15,
        hex,
        def.glow,
        -theta - Math.PI / 2,
      );
    }
    const pedestal = lathe(
      [
        [0, 0],
        [0.6, 0],
        [0.62, 0.12],
        [0.4, 0.25],
        [0.36, 0.7],
        [0.55, 0.82],
        [0.5, 0.9],
        [0, 0.88],
      ],
      22,
    );
    site.stone(pedestal, trialVec(base.x, topY - 0.02, base.z), 0, stoneColor(rand, STONE.marble));
    site.cylCol(trialVec(base.x, topY + 0.45, base.z), 0.45, 0.45);
    for (let i = 0; i < 6; i++) {
      const pos = polar(randRange(rand, -2.4, 2.4), 4 + randRange(rand, 1.6, 5), 0);
      stoneBlock(
        site,
        trialVec(pos.x, ctx.terrain.heightAt(pos.x, pos.z) + 0.2, pos.z),
        randRange(rand, 0.8, 1.2),
        0.62,
        0.5,
        new Euler(rand() * 0.4, rand() * TAU, rand() * 0.3),
        rand,
      );
    }
    site.build(this.mats);
    for (const brick of bricks) brick.dispose();
    const courtyard = new Site(ctx, 'tower-courtyard');
    const pavePos = at(0, 0, 3);
    paving(courtyard, ctx, pavePos.x, pavePos.z, 10.5, rand, {
      avoid: [
        {
          x: base.x,
          z: base.z,
          r: 5.3,
        },
      ],
      gap: 0.03,
      fade: 0.8,
    });
    const circlePos = at(0, 0, 9.4);
    for (let i = 0; i < 20; i++) {
      const theta = (i / 20) * TAU;
      const pos = trialVec(circlePos.x + Math.cos(theta) * 1.7, 0, circlePos.z + Math.sin(theta) * 1.7);
      pos.y = heightStats(ctx, pos.x, pos.z, 0.6).max + 0.045;
      courtyard.glyph(pos, trialVec(0, 1, 0), 0.55, 15, hex, def.glow, -theta, 0.09);
    }
    for (const [x, z, h] of [
      [-8.5, 5, 3.6],
      [8.2, 6.5, 1.8],
      [-7, -3, 2.4],
      [7.5, -2.5, 4.2],
    ]) {
      const pos = at(x, 0, z);
      column(
        courtyard,
        ctx,
        pos.x,
        pos.z,
        {
          h,
          capital: h > 3.5,
          broken: h > 3.5 ? 0 : 0.5,
          glyph: {
            color: hex,
            glow: 0,
          },
        },
        rand,
      );
    }
    const fallenPos = at(-5.5, 0, 9);
    fallenColumn(courtyard, ctx, fallenPos.x, fallenPos.z, angle + 1.3, 0.4, 4.6, rand);
    const wallStart = at(6, 0, 10.5);
    const wallEnd = at(10, 0, 3);
    ruinWall(courtyard, ctx, wallStart.x, wallStart.z, wallEnd.x, wallEnd.z, 1.3, 0.7, rand, {
      minFrac: 0.4,
    });
    let cliffDist = 24;
    for (let d = 12; d < 30; d += 0.5) {
      const x = base.x + dir.x * d;
      const z = base.z + dir.z * d;
      if (ctx.terrain.heightAt(x, z) < baseY - 6.5) {
        cliffDist = d;
        break;
      }
    }
    const stairFrom = at(0.8, 0, cliffDist);
    const stairTo = at(0.8, 0, 12.8);
    stairway(courtyard, ctx, stairFrom.x, stairFrom.z, stairTo.x, stairTo.z, 2.6, rand, {
      cheeks: true,
    });
    const stelePos = at(-3.2, 0, 12.5);
    const hintPos = hintStone(courtyard, ctx, stelePos.x, stelePos.z, angle, 1.9, rand, hex);
    this.hints.add(hintPos, 'Walls too smooth to climb, a stair long fallen... Let the stone spring you skyward.');
    courtyard.build(this.mats);
    for (const [x, z] of [
      [3.5, 12],
      [-6.5, 8],
      [9, 1.5],
    ]) {
      const pos = at(x, 0, z);
      this.ink.add('yellow', pos.x, pos.z);
    }
    const warpPos = at(0, 0, 11);
    warpPos.y = ctx.terrain.heightAt(warpPos.x, warpPos.z) + 0.3;
    this.warps.tower = {
      pos: warpPos,
      facing: angle + Math.PI,
    };
    const touch = trialVec(base.x, 0, base.z);
    return this.makePrism(def, trialVec(base.x, topY, base.z), topY + 0.88, touch, topY, warpPos);
  }
  buildGrove(def) {
    const ctx = this.ctx;
    const rand = rng('grove');
    const canyon = ctx.terrain.landmarks.canyon.clone();
    const grove = ctx.terrain.landmarks.grove.clone();
    const fwd = trialVec(grove.x - canyon.x, 0, grove.z - canyon.z).normalize();
    const side = trialVec(fwd.z, 0, -fwd.x);
    const angle = Math.atan2(fwd.x, fwd.z);
    const floorY = ctx.terrain.heightAt(canyon.x, canyon.z);
    const wallDist = (sign) => {
      for (let d = 1; d < 9; d += 0.25)
        if (ctx.terrain.heightAt(canyon.x + side.x * d * sign, canyon.z + side.z * d * sign) > floorY + 3.5) return d;
      return 5.5;
    };
    const leftDist = wallDist(-1);
    const rightDist = wallDist(1);
    const width = Math.min(15, leftDist + rightDist + 2.2);
    const gatePos = trialVec(
      canyon.x + side.x * (rightDist - leftDist) * 0.5,
      floorY,
      canyon.z + side.z * (rightDist - leftDist) * 0.5,
    );
    gatePos.y = heightStats(ctx, gatePos.x, gatePos.z, 2).min;
    this.bramble = new Bramble(ctx, this.particles, gatePos, angle, width, 6.5, 3.2);
    const gateSite = new Site(ctx, 'canyon-gate');
    const stelePos = gatePos
      .clone()
      .addScaledVector(fwd, -7)
      .addScaledVector(side, Math.min(rightDist, 4.5) - 1.2);
    const hintPos = hintStone(gateSite, ctx, stelePos.x, stelePos.z, angle + Math.PI, 1.9, rand, trialHex(def.color));
    this.hints.add(hintPos, 'Thorns bar the way. They fear only the ember’s kiss.');
    for (const sign of [-1, 1]) {
      const pos = gatePos
        .clone()
        .addScaledVector(fwd, -2.8)
        .addScaledVector(side, sign * (width / 2 - 0.2));
      column(
        gateSite,
        ctx,
        pos.x,
        pos.z,
        {
          h: sign < 0 ? 4.4 : 2.6,
          capital: sign < 0,
          broken: sign < 0 ? 0 : 0.6,
          glyph: {
            color: trialHex(def.color),
            glow: def.glow,
          },
        },
        rand,
      );
    }
    gateSite.build(this.mats);
    for (const [across, along] of [
      [-2.5, -10],
      [2.5, -12],
      [0.5, -15],
    ]) {
      const pos = gatePos.clone().addScaledVector(fwd, along).addScaledVector(side, across);
      this.ink.add('red', pos.x, pos.z);
    }
    const site = new Site(ctx, 'trial-grove');
    const topY = heightStats(ctx, grove.x, grove.z, 4.5).max;
    const backAngle = Math.atan2(-fwd.x, -fwd.z);
    const levels = shrineDais(
      site,
      ctx,
      trialVec(grove.x, Math.max(topY, 0.6), grove.z),
      4.4,
      trialHex(def.color),
      def.glow,
      rand,
      {
        stepsYaw: backAngle,
        pillars: 6,
        groundY: Math.max(topY, 0.6),
      },
    );
    const archPos = grove.clone().addScaledVector(fwd, -9.5);
    archway(site, ctx, archPos.x, archPos.z, angle, 3.4, 3, rand, {
      glyphColor: trialHex(def.color),
      glow: def.glow,
    });
    const wallStart = grove.clone().addScaledVector(side, -8).addScaledVector(fwd, 3);
    const wallEnd = grove.clone().addScaledVector(side, -5).addScaledVector(fwd, 8);
    ruinWall(site, ctx, wallStart.x, wallStart.z, wallEnd.x, wallEnd.z, 2, 0.7, rand);
    const fallenPos = grove.clone().addScaledVector(side, 7).addScaledVector(fwd, 2);
    fallenColumn(site, ctx, fallenPos.x, fallenPos.z, angle + 0.4, 0.38, 4.4, rand);
    site.build(this.mats);
    for (const [across, along] of [
      [5.5, -4],
      [-6, -2],
      [4, 6],
    ]) {
      const pos = grove.clone().addScaledVector(side, across).addScaledVector(fwd, along);
      this.ink.add('red', pos.x, pos.z);
    }
    safe('grove vines', () => buildVines(ctx, grove.x, grove.z, 6, 32, 90, 'grove'));
    const canyonWarp = gatePos.clone().addScaledVector(fwd, -9);
    canyonWarp.y = ctx.terrain.heightAt(canyonWarp.x, canyonWarp.z) + 0.3;
    this.warps.canyon = {
      pos: canyonWarp,
      facing: angle,
    };
    const groveWarp = grove.clone().addScaledVector(fwd, -6);
    groveWarp.y = ctx.terrain.heightAt(groveWarp.x, groveWarp.z) + 0.3;
    this.warps.grove = {
      pos: groveWarp,
      facing: angle,
    };
    return this.makePrism(
      def,
      trialVec(grove.x, levels.top, grove.z),
      levels.pedestalTop,
      trialVec(grove.x, 0, grove.z),
      levels.top,
      canyonWarp,
    );
  }
  complete(color, instant) {
    const trial = this.trials.find((trial) => trial.def.color === color);
    if (trial && !trial.complete && trial.prism) {
      if (instant) {
        trial.prism.completeInstant();
        trial.complete = true;
        this.onComplete?.(trial, true);
        return;
      }
      trial.prism.activate(() => {
        trial.complete = true;
        this.onComplete?.(trial, false);
      });
    }
  }
  update(dt) {
    const ctx = this.ctx;
    for (const trial of this.trials)
      if (trial.prism) {
        trial.prism.update(dt);
        this.mats.siteGlow.value[trial.def.glow] = trial.prism.glow;
      }
    this.bramble?.update(dt);
    const state = ctx.player?.state;
    let near = null;
    if (state) {
      for (const trial of this.trials)
        if (
          trial.prism &&
          trial.prism.state === 'dormant' &&
          Math.hypot(state.position.x - trial.touch.x, state.position.z - trial.touch.z) < 2.7 &&
          state.position.y > trial.daisTop - 1.2 &&
          state.position.y < trial.daisTop + 4
        ) {
          near = trial;
          break;
        }
    }
    if (near) {
      if (!this.promptOn) {
        try {
          ctx.ui.showPrompt('prism', 'Touch the Prism', 'F');
        } catch {}
        this.promptOn = true;
      }
      if (ctx.input.pressed('interact')) {
        const prism = near.prism;
        try {
          ctx.audio.play('shrine-activate', {
            position: prism.position,
          });
        } catch {}
        this.complete(near.def.color, false);
      }
    } else if (this.promptOn) {
      try {
        ctx.ui.hidePrompt('prism');
      } catch {}
      this.promptOn = false;
    }
    return !!near;
  }
}
