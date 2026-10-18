/**
 * Tree species grown from a seed: broadleaf, birch, conifer and palm, each returning trunk and foliage geometry plus its size.
 */
import { Color, MathUtils } from 'three';
import { makeRng as makeRng2 } from '../core/math.js';
import { ATLAS_RECTS } from './foliage-atlas.js';
import { addCanopy, addFrond, addTube, GeoBuilder, smoothPath, v3 } from './veg-geometry.js';
import { makeRng } from './veg-material.js';
export function buildBroadleaf(seed) {
  const rng = makeRng(makeRng2(seed));
  const trunk = new GeoBuilder();
  const foliage = new GeoBuilder();
  const trunkH = rng.range(3, 4);
  const leanX = rng.range(-0.6, 0.6);
  const leanZ = rng.range(-0.6, 0.6);
  const spine = smoothPath(
    [
      v3(0, -0.3, 0),
      v3(leanX * 0.15, trunkH * 0.35, leanZ * 0.15),
      v3(leanX * 0.55, trunkH * 0.72, leanZ * 0.55),
      v3(leanX, trunkH, leanZ),
      v3(leanX * 1.1, trunkH + 1.6, leanZ * 1.1),
    ],
    14,
  );
  const trunkR = rng.range(0.3, 0.38);
  const rootPhase = rng.range(0, 6);
  const bark = new Color('#6b5443');
  addTube(
    trunk,
    spine,
    9,
    (along, ang) => {
      const flare = Math.max(0, 1 - along / 0.14) ** 2 * (0.55 + 0.45 * Math.max(0, Math.cos(ang * 3 + rootPhase)));
      return trunkR * (1 - along * 0.62) * (1 + flare * 0.9);
    },
    (along) => bark.clone().multiplyScalar(0.7 + 0.35 * along),
    {
      vScale: 1,
    },
  );
  const crown = v3(leanX, trunkH + rng.range(1.9, 2.4), leanZ);
  const canopyR = rng.range(3.1, 3.8);
  const canopyH = rng.range(2.2, 2.7);
  const extent = v3(canopyR, canopyH, canopyR);
  const clumps = [];
  clumps.push({
    c: crown.clone().add(v3(rng.range(-0.4, 0.4), canopyH * 0.55, rng.range(-0.4, 0.4))),
    r: rng.range(1.7, 2),
  });
  const sideCount = rng.pick([5, 6, 6, 7]);
  const phase = rng.range(0, 6.28);
  for (let i = 0; i < sideCount; i++) {
    const ang = phase + (i / sideCount) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const dist = canopyR * rng.range(0.55, 0.72);
    clumps.push({
      c: crown.clone().add(v3(Math.cos(ang) * dist, rng.range(-0.1, 0.55) * canopyH, Math.sin(ang) * dist)),
      r: rng.range(1.45, 1.95),
    });
  }
  const lowCount = rng.pick([3, 4, 4]);
  for (let i = 0; i < lowCount; i++) {
    const ang = phase + 0.5 + (i / lowCount) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const dist = canopyR * rng.range(0.35, 0.55);
    clumps.push({
      c: crown.clone().add(v3(Math.cos(ang) * dist, -canopyH * rng.range(0.3, 0.5), Math.sin(ang) * dist)),
      r: rng.range(1.3, 1.6),
    });
  }
  for (let i = 0; i < 4; i++) {
    const clump = clumps[1 + ((i * 2) % (clumps.length - 1))];
    const at = rng.range(0.55, 0.85);
    const branchBase = spine[Math.floor(at * (spine.length - 1))].clone();
    const branchEnd = clump.c.clone().lerp(crown, 0.25);
    addTube(
      trunk,
      smoothPath(
        [
          branchBase,
          branchBase
            .clone()
            .lerp(branchEnd, 0.5)
            .add(v3(0, 0.5, 0)),
          branchEnd,
        ],
        5,
      ),
      5,
      (along) => 0.13 * (1 - along * 0.65),
      (along) => bark.clone().multiplyScalar(0.8 + 0.2 * along),
      {
        vScale: 1,
        v0: 3,
      },
    );
  }
  addCanopy(foliage, rng, clumps, crown, extent, ATLAS_RECTS.broadleaf, 1.35, 4.6);
  return {
    species: 'broadleaf',
    trunk: trunk.build(),
    foliage: foliage.build(),
    trunkR,
    trunkH: trunkH + 0.5,
    canopyR: canopyR * 1.15,
    height: crown.y + canopyH + 1.2,
  };
}
export function buildBirch(seed) {
  const rng = makeRng(makeRng2(seed));
  const trunk = new GeoBuilder();
  const foliage = new GeoBuilder();
  const height = rng.range(7.5, 10);
  const leanX = rng.range(-0.7, 0.7);
  const leanZ = rng.range(-0.7, 0.7);
  const spine = smoothPath(
    [
      v3(0, -0.3, 0),
      v3(leanX * 0.2 + rng.range(-0.15, 0.15), height * 0.3, leanZ * 0.2),
      v3(leanX * 0.6, height * 0.65, leanZ * 0.6 + rng.range(-0.2, 0.2)),
      v3(leanX, height, leanZ),
    ],
    16,
  );
  const trunkR = rng.range(0.14, 0.18);
  const bark = new Color('#ece6d8');
  addTube(
    trunk,
    spine,
    7,
    (along) => trunkR * (1 - along * 0.7) * (1 + 0.5 * Math.max(0, 1 - along / 0.08) ** 2),
    () => bark,
    {
      vScale: 1,
    },
  );
  const clumps = [];
  const clumpCount = rng.pick([5, 6, 7]);
  for (let i = 0; i < clumpCount; i++) {
    const frac = i / (clumpCount - 1);
    const clumpY = height * (0.42 + 0.6 * frac);
    const anchor = spine[Math.min(spine.length - 1, Math.floor((clumpY / height) * (spine.length - 1)))];
    const ang = rng.range(0, 6.28);
    const off = (1 - frac) * rng.range(0.5, 1);
    clumps.push({
      c: v3(anchor.x + Math.cos(ang) * off, clumpY, anchor.z + Math.sin(ang) * off),
      r: MathUtils.lerp(1.45, 0.95, frac) * rng.range(0.9, 1.1),
    });
  }
  for (let i = 0; i < 3; i++) {
    const clump = clumps[i];
    const at = clump.c.y / height - 0.08;
    const branchBase = spine[Math.max(1, Math.floor(at * (spine.length - 1)))].clone();
    addTube(
      trunk,
      [
        branchBase,
        branchBase
          .clone()
          .lerp(clump.c, 0.5)
          .add(v3(0, 0.2, 0)),
        clump.c.clone(),
      ],
      4,
      (along) => 0.05 * (1 - along * 0.6),
      () => bark,
      {
        vScale: 1,
        v0: 2,
      },
    );
  }
  addCanopy(
    foliage,
    rng,
    clumps,
    v3(leanX * 0.8, height * 0.62, leanZ * 0.8),
    v3(2, height * 0.5, 2),
    ATLAS_RECTS.birch,
    1.3,
    6.5,
  );
  return {
    species: 'birch',
    trunk: trunk.build(),
    foliage: foliage.build(),
    trunkR: trunkR * 1.1,
    trunkH: height * 0.6,
    canopyR: 2.4,
    height: height + 1.3,
  };
}
export function buildConifer(seed) {
  const rng = makeRng(makeRng2(seed));
  const trunk = new GeoBuilder();
  const foliage = new GeoBuilder();
  const height = rng.range(9, 13);
  const trunkR = rng.range(0.24, 0.3);
  const bark = new Color('#5a4536');
  addTube(
    trunk,
    smoothPath([v3(0, -0.3, 0), v3(0, height * 0.5, 0), v3(0, height * 0.85, 0)], 6),
    7,
    (along) => trunkR * (1 - along * 0.8) * (1 + 0.6 * Math.max(0, 1 - along / 0.1) ** 2),
    () => bark,
    {
      vScale: 1,
    },
  );
  const tiers = rng.pick([6, 7, 7, 8]);
  const needle = new Color('#2c5a42');
  const needleTip = new Color('#5c8a50');
  const needleShade = new Color('#10231a');
  const baseY = rng.range(1.3, 1.8);
  for (let i = 0; i < tiers; i++) {
    const frac = i / (tiers - 1);
    const tierY = baseY + (height - baseY - 2.2) * frac ** 0.92;
    const tierR = MathUtils.lerp(3, 0.7, frac ** 0.85) * rng.range(0.92, 1.08);
    const tierH = MathUtils.lerp(2.6, 1.7, frac);
    const apexY = tierY + tierH;
    const twist = rng.range(0, 6.28);
    const tierRand = rng.next();
    const apex = foliage.vert(
      v3(0, apexY, 0),
      v3(0, 1, 0),
      0.5,
      1,
      needle.clone().multiplyScalar(0.75),
      [tierRand, 1, 0, 0],
      v3(0, apexY, 0),
    );
    const mid = [];
    const rim = [];
    const inner = [];
    for (let j = 0; j < 26; j++) {
      const ang = twist + (j / 26) * Math.PI * 2;
      const major = j % 2 == 0;
      const jitter = rng.range(0.9, 1.1);
      const reach = tierR * (major ? 1 : 0.74) * jitter;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const droop = major ? rng.range(0.35, 0.6) : 0.12;
      const outDir = v3(cosA, 0, sinA);
      const midPos = v3(cosA * reach * 0.5, tierY + tierH * 0.42, sinA * reach * 0.5);
      const midN = outDir
        .clone()
        .multiplyScalar(0.8)
        .add(v3(0, 0.75, 0))
        .normalize();
      mid.push(
        foliage.vert(
          midPos,
          midN,
          j / 26,
          0.6,
          needle.clone().multiplyScalar(0.8 + 0.25 * frac),
          [tierRand, 1, 0, 0],
          midPos,
        ),
      );
      const rimPos = v3(cosA * reach, tierY - droop, sinA * reach);
      const rimN = outDir
        .clone()
        .multiplyScalar(0.9)
        .add(v3(0, 0.45, 0))
        .normalize();
      rim.push(
        foliage.vert(
          rimPos,
          rimN,
          j / 26,
          0.2,
          major ? needleTip.clone().multiplyScalar(rng.range(0.9, 1.15)) : needle.clone().lerp(needleTip, 0.3),
          [tierRand, 1, 0, 0],
          rimPos,
        ),
      );
      const innerPos = v3(cosA * reach * 0.32, tierY + 0.35, sinA * reach * 0.32);
      const innerN = outDir
        .clone()
        .multiplyScalar(0.6)
        .add(v3(0, -0.5, 0))
        .normalize();
      inner.push(foliage.vert(innerPos, innerN, j / 26, 0, needleShade, [tierRand, 1, 0, 0], innerPos));
    }
    for (let j = 0; j < 26; j++) {
      const next = (j + 1) % 26;
      foliage.tri(apex, mid[next], mid[j]);
      foliage.tri(mid[j], mid[next], rim[j]);
      foliage.tri(rim[j], mid[next], rim[next]);
      foliage.tri(rim[j], rim[next], inner[j]);
      foliage.tri(inner[j], rim[next], inner[next]);
    }
  }
  return {
    species: 'conifer',
    trunk: trunk.build(),
    foliage: foliage.build(),
    trunkR,
    trunkH: height * 0.7,
    canopyR: 3,
    height: height + 0.4,
  };
}
export function buildPalm(seed) {
  const rng = makeRng(makeRng2(seed));
  const trunk = new GeoBuilder();
  const foliage = new GeoBuilder();
  const height = rng.range(6, 8.2);
  const lean = rng.range(1.4, 2.6);
  const spine = smoothPath(
    [v3(0, -0.3, 0), v3(lean * 0.1, height * 0.35, 0), v3(lean * 0.45, height * 0.7, 0), v3(lean, height, 0)],
    16,
  );
  const bark = new Color('#8f7a5e');
  addTube(
    trunk,
    spine,
    8,
    (along) => 0.24 * (1 - along * 0.35) * (1 + 0.5 * Math.max(0, 1 - along / 0.08) ** 2),
    (along) => bark.clone().multiplyScalar(0.8 + 0.25 * along),
    {
      vScale: 1,
      capTop: true,
    },
  );
  const crown = v3(lean, height, 0);
  const frondCount = rng.pick([10, 11, 12]);
  const frondTint = new Color('#ffffff');
  for (let i = 0; i < frondCount; i++) {
    const ang = (i / frondCount) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const rise = i % 2 == 0 ? rng.range(0.35, 0.6) : rng.range(0.05, 0.3);
    const dir = v3(Math.cos(ang), rise, Math.sin(ang));
    addFrond(
      foliage,
      crown.clone().add(v3(0, 0.1, 0)),
      dir,
      rng.range(3.4, 4.4),
      rng.range(1.7, 2),
      rng.range(0.28, 0.45),
      6,
      ATLAS_RECTS.palm,
      (along) => frondTint.clone().multiplyScalar(0.7 + 0.3 * along),
      rng.next(),
      0.55,
      0.6,
    );
  }
  for (let i = 0; i < 3; i++) {
    const ang = rng.range(0, 6.28);
    addFrond(
      foliage,
      crown.clone(),
      v3(Math.cos(ang) * 0.4, 1, Math.sin(ang) * 0.4),
      1.8,
      0.8,
      0.1,
      3,
      ATLAS_RECTS.palm,
      () => 0.85,
      rng.next(),
      0.3,
    );
  }
  return {
    species: 'palm',
    trunk: trunk.build(),
    foliage: foliage.build(),
    trunkR: 0.24,
    trunkH: height * 0.8,
    canopyR: 3.6,
    height: height + 1,
  };
}
