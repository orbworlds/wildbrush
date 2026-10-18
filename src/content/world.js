/**
 * World dressing around the island: the painter's camp and its hint stone, ruins (a north arch, the painter statue, a colonnade, beach and lake-house ruins, summit stairs, a forest ring and a lookout), scattered ink plants, mote areas and meadows. Also builds the physics playground near spawn with a ramp, a platform, crates, barrels, a ball and a boulder.
 */
import { Euler, Vector3 } from 'three';
import { findSpot, randRange, rng, safe, TAU, yawTo } from '../shared/util.js';
import { buildPainterCamp } from './painter-camp.js';
import {
  archway,
  column,
  fallenColumn,
  hintStone,
  localFrame,
  painterStatue,
  paving,
  rubble,
  ruinWall,
  stairway,
  STONE,
  stoneBlock,
  stoneColor,
} from './ruin-kit.js';
import { addClearing, Site } from './site.js';
const worldVec = (x, y, z) => new Vector3(x, y, z);
export function buildWorld(ctx, mats, hints, ink) {
  const landmarks = ctx.terrain.landmarks;
  const out = {
    campFire: null,
    lantern: null,
    motes: [],
    meadows: [],
    statue: null,
  };
  const spawn = landmarks.spawn;
  const summit = landmarks.summit;
  safe('camp', () => {
    const campSpot =
      findSpot(ctx, spawn.x + 6, spawn.z + 1.5, {
        maxSlope: 0.3,
        footprint: 3,
        search: 10,
      }) ?? worldVec(spawn.x + 6, ctx.terrain.heightAt(spawn.x + 6, spawn.z + 1.5), spawn.z + 1.5);
    const camp = buildPainterCamp(ctx, mats, campSpot, 0);
    out.campFire = camp.fire;
    out.lantern = camp.lantern;
    const site = new Site(ctx, 'camp-hint');
    const hintSpot =
      findSpot(ctx, spawn.x - 3.5, spawn.z - 4.5, {
        maxSlope: 0.4,
        search: 6,
      }) ?? worldVec(spawn.x - 3.5, 0, spawn.z - 4.5);
    const stelePos = hintStone(
      site,
      ctx,
      hintSpot.x,
      hintSpot.z,
      yawTo(hintSpot.x, hintSpot.z, spawn.x, spawn.z + 3),
      2.1,
      rng('camp-hint'),
      15260072,
    );
    hints.add(stelePos, 'Four Prisms sleep beneath grey skies. Wake them, and colour will return.');
    site.build(mats);
    for (const [color, dx, dz] of [
      ['red', -7.5, -1.5],
      ['blue', -6.5, -5],
      ['yellow', -3.5, -7.8],
      ['green', 0.5, -9],
    ]) {
      const spot = findSpot(ctx, spawn.x + dx, spawn.z + dz, {
        maxSlope: 0.5,
        search: 5,
      });
      if (spot) ink.add(color, spot.x, spot.z);
    }
    out.motes.push({
      x: campSpot.x,
      y: campSpot.y,
      z: campSpot.z,
      radius: 9,
      height: 2.5,
      count: 26,
      color: 0xfff2c8,
      size: 0.06,
      kind: 2,
      ground: true,
    });
    out.meadows.push(worldVec(spawn.x - 6, spawn.y, spawn.z - 6), worldVec(spawn.x + 10, spawn.y, spawn.z - 10));
  });
  safe('playground', () => buildPlayground(ctx, mats, spawn));
  const southSite = new Site(ctx, 'ruins-south');
  const rand = rng('ruins');
  safe('arch-north', () => {
    const spot = findSpot(ctx, spawn.x + 3, spawn.z - 30, {
      maxSlope: 0.25,
      footprint: 4,
      search: 14,
    });
    if (!spot) return;
    const yaw = yawTo(spot.x, spot.z, summit.x, summit.z);
    archway(southSite, ctx, spot.x, spot.z, yaw, 4.2, 3.6, rand, {
      glyphColor: 0xffd447,
    });
    const at = localFrame(spot, yaw);
    for (const side of [-1, 1]) {
      const from = at(side * 4.8, 0, 0.3);
      const to = at(side * 9.5, 0, 1.2);
      ruinWall(southSite, ctx, from.x, from.z, to.x, to.z, 1.6, 0.7, rand, {
        minFrac: 0.3,
      });
    }
    const center = at(0, 0, 0);
    paving(southSite, ctx, center.x, center.z, 4.5, rand, {
      gap: 0.2,
      fade: 0.4,
    });
    out.meadows.push(at(0, 0, 8));
  });
  safe('statue', () => {
    const spot = findSpot(ctx, spawn.x - 24, spawn.z - 36, {
      maxSlope: 0.3,
      footprint: 3,
      maxFlatness: 1.6,
      search: 16,
    });
    if (!spot) return;
    const yaw = yawTo(spot.x, spot.z, spawn.x, spawn.z);
    const statueTop = painterStatue(southSite, ctx, spot.x, spot.z, yaw, rand);
    out.statue = worldVec(spot.x, statueTop, spot.z);
    const at = localFrame(spot, yaw);
    paving(southSite, ctx, spot.x, spot.z, 6.5, rand, {
      avoid: [
        {
          x: spot.x,
          z: spot.z,
          r: 2.6,
        },
      ],
      gap: 0.15,
      fade: 0.5,
    });
    for (const [dx, dz, h] of [
      [-4.5, 3.5, 2.2],
      [4.5, 3.5, 1.2],
      [-4.5, -3.5, 3.4],
      [4.5, -3.5, 2.8],
    ]) {
      const pos = at(dx, 0, dz);
      column(
        southSite,
        ctx,
        pos.x,
        pos.z,
        {
          h,
          broken: h < 3 ? 0.5 : 0,
          capital: h >= 3,
          r: 0.34,
        },
        rand,
      );
    }
    const steleAt = at(2.6, 0, 5.2);
    const stelePos = hintStone(southSite, ctx, steleAt.x, steleAt.z, yaw, 1.6, rand, 5822059);
    hints.add(stelePos, 'She painted the island awake once. Her brush still points the way — to the peak.');
    ink.add('blue', at(-3, 0, 6.5).x, at(-3, 0, 6.5).z);
  });
  southSite.build(mats);
  safe('colonnade', () => {
    const site = new Site(ctx, 'ruins-colonnade');
    const rand = rng('colonnade');
    const spot = findSpot(ctx, 58, 70, {
      maxSlope: 0.3,
      footprint: 6,
      search: 16,
    });
    if (!spot) return;
    const yaw = 0.6;
    const at = localFrame(spot, yaw);
    const heights = [];
    for (let i = 0; i < 7; i++) {
      const pos = at(0, 0, (i - 3) * 3.2);
      if (i === 2 || i === 5) {
        const fallenPos = at(2.2, 0, (i - 3) * 3.2 + 0.5);
        fallenColumn(site, ctx, fallenPos.x, fallenPos.z, yaw + Math.PI / 2 + 0.3, 0.42, 4.4, rand);
        column(
          site,
          ctx,
          pos.x,
          pos.z,
          {
            h: 0.6,
            broken: 0.3,
            r: 0.44,
          },
          rand,
        );
        heights.push(0);
        continue;
      }
      const h = i < 2 ? 4.6 : randRange(rand, 1.5, 4.6);
      heights.push(
        column(
          site,
          ctx,
          pos.x,
          pos.z,
          {
            h,
            capital: h > 4,
            broken: h > 4 ? 0 : randRange(rand, 0.3, 0.7),
            r: 0.44,
            glyph:
              rand() < 0.4
                ? {
                    color: 0x58d66b,
                    glow: 0,
                  }
                : null,
          },
          rand,
        ),
      );
    }
    const colA = at(0, 0, -9.6);
    const colB = at(0, 0, -6.4);
    const lintelY = Math.min(heights[0], heights[1]);
    if (lintelY > 3)
      stoneBlock(site, worldVec((colA.x + colB.x) / 2, lintelY + 0.3, (colA.z + colB.z) / 2), 1, 0.6, 4.4, yaw, rand, {
        color: stoneColor(rand, STONE.marble),
      });
    const pavePos = at(-3, 0, 0);
    paving(site, ctx, pavePos.x, pavePos.z, 9, rand, {
      gap: 0.3,
      fade: 0.3,
    });
    rubble(site, ctx, spot.x, spot.z, 10, 10, rand);
    site.build(mats);
    ink.add('green', at(-4, 0, 6).x, at(-4, 0, 6).z);
    out.meadows.push(at(-8, 0, 0));
  });
  safe('beach', () => {
    const site = new Site(ctx, 'ruins-beach');
    const rand = rng('beach');
    const spot = findSpot(ctx, landmarks.beach.x - 8, landmarks.beach.z - 12, {
      maxSlope: 0.3,
      footprint: 3,
      minH: 0.8,
      search: 24,
    });
    if (!spot) return;
    const yaw = yawTo(spot.x, spot.z, landmarks.beach.x + 30, landmarks.beach.z + 30);
    archway(site, ctx, spot.x, spot.z, yaw, 3.6, 2.4, rand, {
      broken: true,
      glyphColor: 0x4cc3ff,
    });
    const at = localFrame(spot, yaw);
    for (const [dx, dz] of [
      [-5.5, 3],
      [6, -2],
    ]) {
      const pos = at(dx, 0, dz);
      column(
        site,
        ctx,
        pos.x,
        pos.z,
        {
          h: randRange(rand, 1, 2),
          broken: 0.6,
          sink: 0.6,
        },
        rand,
      );
    }
    rubble(site, ctx, spot.x, spot.z, 7, 8, rand);
    site.build(mats);
    const inkPos = at(3, 0, -5);
    ink.add('yellow', inkPos.x, inkPos.z);
    out.motes.push({
      x: spot.x,
      y: spot.y,
      z: spot.z,
      radius: 14,
      height: 3,
      count: 14,
      color: 0xffffff,
      size: 0.05,
      kind: 0,
      ground: true,
    });
  });
  safe('lake-house', () => {
    const site = new Site(ctx, 'ruins-lakehouse');
    const rand = rng('lakehouse');
    const spot = findSpot(ctx, landmarks.lake.x + 30, landmarks.lake.z + 34, {
      maxSlope: 0.3,
      footprint: 5,
      minH: 1.2,
      search: 18,
    });
    if (!spot) return;
    const at = localFrame(spot, 0.4);
    const corners = [at(-3.5, 0, -3), at(3.5, 0, -3), at(3.5, 0, 3), at(-3.5, 0, 3)];
    ruinWall(site, ctx, corners[0].x, corners[0].z, corners[1].x, corners[1].z, 2.8, 0.7, rand, {
      window: 1.2,
    });
    ruinWall(site, ctx, corners[1].x, corners[1].z, corners[2].x, corners[2].z, 2.2, 0.7, rand, {
      minFrac: 0.15,
    });
    ruinWall(site, ctx, corners[3].x, corners[3].z, corners[0].x, corners[0].z, 2.4, 0.7, rand);
    paving(site, ctx, spot.x, spot.z, 3.2, rand, {
      gap: 0.35,
      fade: 0.2,
    });
    site.build(mats);
    ink.add('blue', at(0, 0, 5.5).x, at(0, 0, 5.5).z);
    out.meadows.push(at(0, 0, 8));
  });
  safe('summit', () => {
    const site = new Site(ctx, 'ruins-summit');
    const rand = rng('summit');
    const stairFoot = findSpot(ctx, summit.x + 30, summit.z + 14, {
      maxSlope: 0.5,
      search: 8,
    });
    const stairTop = findSpot(ctx, summit.x + 18, summit.z + 4, {
      maxSlope: 1.2,
      search: 6,
    });
    if (stairFoot && stairTop)
      stairway(site, ctx, stairFoot.x, stairFoot.z, stairTop.x, stairTop.z, 2.2, rand, {
        cheeks: true,
      });
    site.build(mats);
    ink.add('red', summit.x - 6, summit.z + 40);
  });
  safe('forest', () => {
    const site = new Site(ctx, 'ruins-forest');
    const rand = rng('forest');
    const spot = findSpot(ctx, landmarks.forest.x + 6, landmarks.forest.z - 8, {
      maxSlope: 0.3,
      footprint: 3,
      search: 16,
    });
    if (spot) {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * TAU;
        column(
          site,
          ctx,
          spot.x + Math.cos(angle) * 4,
          spot.z + Math.sin(angle) * 4,
          {
            h: i % 2 ? 3.8 : randRange(rand, 0.8, 2.4),
            capital: i % 2 == 1,
            broken: i % 2 ? 0 : 0.5,
            r: 0.34,
            glyph: {
              color: 0x58d66b,
              glow: 0,
            },
          },
          rand,
        );
      }
      paving(site, ctx, spot.x, spot.z, 3.6, rand, {
        gap: 0.25,
      });
      site.build(mats);
      ink.add('green', spot.x + 1, spot.z + 1);
      ink.add('red', spot.x - 6, spot.z + 3);
      out.motes.push({
        x: spot.x,
        y: spot.y,
        z: spot.z,
        radius: 12,
        height: 3,
        count: 24,
        color: 0xd9ff9a,
        size: 0.07,
        kind: 1,
        ground: true,
      });
    }
  });
  safe('west', () => {
    const site = new Site(ctx, 'ruins-west');
    const rand = rng('west');
    const spot = findSpot(ctx, -72, -28, {
      maxSlope: 0.3,
      footprint: 5,
      search: 16,
    });
    if (!spot) return;
    const at = localFrame(spot, 1.1);
    const wallFrom = at(-6, 0, 0);
    const wallTo = at(6, 0, 0);
    ruinWall(site, ctx, wallFrom.x, wallFrom.z, wallTo.x, wallTo.z, 3.2, 0.8, rand, {
      window: 1.4,
    });
    const fallenPos = at(0, 0, 4);
    fallenColumn(site, ctx, fallenPos.x, fallenPos.z, 1.5, 0.4, 5, rand);
    site.build(mats);
    ink.add('yellow', at(3, 0, -3).x, at(3, 0, -3).z);
    out.meadows.push(at(0, 0, -8));
  });
  safe('lookout', () => {
    const site = new Site(ctx, 'ruins-lookout');
    const rand = rng('lookout');
    const spot = findSpot(ctx, 118, 8, {
      maxSlope: 0.3,
      footprint: 4,
      minH: 2,
      search: 20,
    });
    if (!spot) return;
    paving(site, ctx, spot.x, spot.z, 4, rand, {
      gap: 0.1,
      fade: 0.6,
    });
    const yaw = yawTo(spot.x, spot.z, 200, 8);
    archway(site, ctx, spot.x + 2, spot.z, yaw, 2.8, 2.2, rand, {
      glyphColor: 0xff5b3a,
    });
    site.build(mats);
  });
  for (const [color, x, z] of [
    ['yellow', 30, 90],
    ['red', -35, 90],
    ['green', -50, 10],
    ['blue', 40, 35],
    ['yellow', -25, -60],
    ['red', 20, -5],
    ['green', 100, -60],
    ['blue', -100, -10],
  ]) {
    const spot = findSpot(ctx, x, z, {
      maxSlope: 0.45,
      search: 12,
    });
    if (spot) ink.add(color, spot.x, spot.z);
  }
  out.meadows.push(
    worldVec(spawn.x + 22, 0, spawn.z - 25),
    worldVec(spawn.x - 30, 0, spawn.z - 15),
    worldVec(20, 0, 20),
    worldVec(-30, 0, 40),
  );
  return out;
}
const RAMP_LENGTH = 7;
function buildPlayground(ctx, mats, spawn) {
  const rand = rng('playground');
  const spot = findSpot(ctx, spawn.x - 16, spawn.z - 3, {
    maxSlope: 0.25,
    footprint: 5,
    search: 12,
  });
  if (!spot) return;
  const yaw = 0.35;
  const at = localFrame(spot, yaw);
  const site = new Site(ctx, 'playground');
  addClearing(spot.x, spot.z, 3.2);
  {
    const deck = at(0, 0, -7 / 2 - 1.2);
    addClearing(deck.x, deck.z, 2.4);
  }
  const rampLen = RAMP_LENGTH;
  const rampRise = 1.8;
  const pitch = Math.atan2(rampRise, rampLen);
  const rampPos = at(0, 0, 0);
  const groundY = ctx.terrain.heightAt(rampPos.x, rampPos.z);
  const slopeLen = Math.hypot(rampLen, rampRise);
  const tilt = new Euler(pitch, yaw, 0, 'YXZ');
  stoneBlock(site, worldVec(rampPos.x, groundY + rampRise / 2 - 0.1, rampPos.z), 3.2, 0.35, slopeLen, tilt, rand, {
    color: stoneColor(rand, STONE.pale),
    round: 0.1,
  });
  for (let i = 0; i < 3; i++) {
    const pos = at(0, 0, -2.5 + i * 2.2);
    const floorY = ctx.terrain.heightAt(pos.x, pos.z);
    const h = Math.max(0.3, groundY - 0.1 + rampRise * (0.5 - (-2.5 + i * 2.2) / rampLen) - floorY);
    stoneBlock(site, worldVec(pos.x, floorY + h / 2 - 0.3, pos.z), 2.6, h, 0.7, yaw, rand, {
      collider: false,
    });
  }
  const deckPos = at(0, 0, -7 / 2 - 1.2);
  const deckGround = ctx.terrain.heightAt(deckPos.x, deckPos.z);
  const deckY = groundY + rampRise - 0.1 + 0.15;
  stoneBlock(
    site,
    worldVec(deckPos.x, (deckY + deckGround - 0.5) / 2, deckPos.z),
    3.2,
    deckY - deckGround + 0.5,
    2.6,
    yaw,
    rand,
    {
      color: stoneColor(rand, STONE.dark),
    },
  );
  const lipPos = at(0, 0, -3.45);
  stoneBlock(site, worldVec(lipPos.x, deckY + 0.1, lipPos.z), 1.4, 0.26, 0.35, yaw, rand);
  for (const side of [-1, 1]) {
    const postPos = at(side * 1.75, 0, -7 / 2 - 1.2);
    column(
      site,
      ctx,
      postPos.x,
      postPos.z,
      {
        h: deckY - ctx.terrain.heightAt(postPos.x, postPos.z) + 1.2,
        broken: 0.4,
        r: 0.3,
      },
      rand,
    );
  }
  const stairFrom = at(4.8, 0, -7 / 2 - 1.2);
  const stairTo = at(1.8, 0, -7 / 2 - 1.2);
  stairway(site, ctx, stairFrom.x, stairFrom.z, stairTo.x, stairTo.z, 1.6, rand);
  site.build(mats);
  const props = [];
  const ballPos = at(0, 0, -7 / 2 - 1.3);
  props.push(['ball', worldVec(ballPos.x, deckY + 0.9, ballPos.z)]);
  const cratePos = at(0, 0, 7);
  const crateY = ctx.terrain.heightAt(cratePos.x, cratePos.z);
  for (const [dx, level] of [
    [-1.1, 0],
    [0, 0],
    [1.1, 0],
    [-0.55, 1],
    [0.55, 1],
    [0, 2],
  ]) {
    const pos = at(dx, 0, 7);
    props.push(['crate', worldVec(pos.x, crateY + 0.55 + level * 1.05, pos.z)]);
  }
  for (const [dx, dz] of [
    [3.2, 2.5],
    [3.8, 4],
    [-3.4, 3.6],
  ]) {
    const pos = at(dx, 0, dz);
    props.push(['barrel', worldVec(pos.x, ctx.terrain.heightAt(pos.x, pos.z) + 0.7, pos.z)]);
  }
  const boulderPos = at(-4.5, 0, -1);
  props.push(['boulder', worldVec(boulderPos.x, ctx.terrain.heightAt(boulderPos.x, boulderPos.z) + 1.2, boulderPos.z)]);
  for (const [kind, pos] of props)
    try {
      ctx.elements.spawnProp(kind, pos);
    } catch (err) {
      console.warn('[content] spawnProp failed', err);
    }
}
