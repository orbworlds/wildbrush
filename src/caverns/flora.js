/**
 * Scatters the cave's life and rock: glowcap clusters on floors and walls, giant grotto mushrooms, crystals, stalactites, stalagmites, boulders and hanging roots, keeping paths and puzzle spots clear, and collects the glow emitters to bake.
 */
import { CatmullRomCurve3, Color, IcosahedronGeometry, Matrix4, Vector3 } from 'three';
import { taperedTube } from '../shared/util.js';
import { boulderGeometry, caveRng, dripstoneGeometry } from './deco.js';
import { addCrystalCluster, addMushroom, CrystalBuilder, FungusBuilder, HUES, UP } from './fungus.js';
import { CHAMBERS, CHASM, getChamber, GIANT, OX, OY, OZ, POOL, SHAFT, SPOTS, TUNNELS } from './layout.js';
import { nearestOnPoly } from './sdf-grid.js';
const KEEP_CLEAR = [
  [SPOTS.arrive[0], SPOTS.arrive[2], 2.2],
  [SPOTS.exitA[0], SPOTS.exitA[2], 3.5],
  [SPOTS.inkChest[0], SPOTS.inkChest[2], 2.4],
  [SPOTS.heartChest[0], SPOTS.heartChest[2], 2.4],
  [SPOTS.vesselChest[0], SPOTS.vesselChest[2], 2.2],
  [SPOTS.grandChest[0], SPOTS.grandChest[2], 4.2],
  ...SPOTS.braziers.map((brazier) => [brazier[0], brazier[2], 2.4]),
  [10, -16.5, 4.5],
  [10.5, 15, 4],
  [SHAFT.x, SHAFT.z, SHAFT.r + 1.2],
  [GIANT.x, GIANT.z, GIANT.capR + 0.5],
  [POOL.x, POOL.z, 4.2],
  [SPOTS.shortcutEnd[0], SPOTS.shortcutEnd[2], 3.5],
  [SPOTS.hintA[0], SPOTS.hintA[2], 1.5],
  [SPOTS.hintB[0], SPOTS.hintB[2], 1.5],
  [SPOTS.hintC[0], SPOTS.hintC[2], 1.5],
  [SPOTS.hintD[0], SPOTS.hintD[2], 1.5],
  [SPOTS.hintE[0], SPOTS.hintE[2], 1.5],
  [SPOTS.elite[0], SPOTS.elite[2], 5],
];
function inKeepClear(p, pad = 0) {
  const lx = p.x - OX;
  const lz = p.z - OZ;
  for (const [kx, kz, kr] of KEEP_CLEAR) if ((lx - kx) ** 2 + (lz - kz) ** 2 < (kr + pad) ** 2) return true;
  return false;
}
function inChasm(p, pad = 0) {
  const lx = p.x - OX;
  const lz = p.z - OZ;
  return lx > CHASM.x0 - pad && lx < CHASM.x1 + pad && lz > CHASM.z0 - pad && lz < CHASM.z1 + pad;
}
function chamberDist2(chamber, p) {
  const cx = OX + chamber.x;
  const cz = OZ + chamber.z;
  const cy = OY + chamber.floor + 0.35 * chamber.ry;
  return ((p.x - cx) / chamber.rx) ** 2 + ((p.y - cy) / chamber.ry) ** 2 + ((p.z - cz) / chamber.rz) ** 2;
}
function chamberDistXZ(chamber, p) {
  return Math.sqrt(((p.x - OX - chamber.x) / chamber.rx) ** 2 + ((p.z - OZ - chamber.z) / chamber.rz) ** 2);
}
export function buildFlora(build, quality) {
  const rng = caveRng('flora');
  const density = quality === 'low' ? 0.6 : quality === 'medium' ? 0.85 : 1;
  const geometry = build.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const zones = {};
  const zoneOf = (p) => {
    let best = null;
    let bestK = 1.45;
    for (const chamber of CHAMBERS) {
      const k = chamberDist2(chamber, p);
      if (k < bestK) {
        bestK = k;
        best = chamber.id;
      }
    }
    if (best) return best;
    for (const tunnel of TUNNELS) {
      const poly = build.polys[tunnel.id];
      if (nearestOnPoly(poly, p.x, p.y, p.z).d < tunnel.r + 1.2) return tunnel.id;
    }
    return null;
  };
  for (let i = 0; i < position.count; i += 3) {
    const p = new Vector3().fromBufferAttribute(position, i);
    const nrm = new Vector3().fromBufferAttribute(normal, i);
    const zone = zoneOf(p);
    if (!zone) continue;
    const surfaces = (zones[zone] ??= {
      floor: [],
      wall: [],
      ceil: [],
    });
    const spot = {
      p,
      n: nrm,
      zone,
    };
    if (nrm.y > 0.8) surfaces.floor.push(spot);
    else if (nrm.y < -0.7) surfaces.ceil.push(spot);
    else if (Math.abs(nrm.y) < 0.45) surfaces.wall.push(spot);
  }
  const pick = (list, accept, tries = 60) => {
    for (let i = 0; i < tries && list.length; i++) {
      const cand = list[Math.floor(rng() * list.length)];
      if (accept(cand)) return cand;
    }
    return null;
  };
  const acc = new FungusBuilder();
  const crystalAcc = new CrystalBuilder();
  const clusters = [];
  const emitters = [];
  const solids = [];
  const pools = [];
  const tips = [];
  const placed = [];
  const hasRoom = (p, minDist) => placed.every((q) => q.distanceToSquared(p) > minDist * minDist);
  const allocCluster = (pos, nrm, radius, hue, zone) => {
    const cluster = {
      id: Math.min(clusters.length, 127),
      pos: pos.clone(),
      nrm: nrm.clone(),
      r: radius,
      hue: hue.clone(),
      base: 0.6,
      pulse: 0,
      awake: false,
      zone,
    };
    clusters.push(cluster);
    return cluster;
  };
  const pickHue = (zone) => {
    const roll = rng();
    return zone === 'F'
      ? roll < 0.45
        ? HUES.cyan
        : roll < 0.7
          ? HUES.teal
          : roll < 0.85
            ? HUES.pink
            : HUES.amber
      : zone === 'C' || zone === 'S'
        ? roll < 0.5
          ? HUES.violet
          : HUES.teal
        : zone === 'E'
          ? roll < 0.6
            ? HUES.teal
            : HUES.violet
          : zone === 'D' || zone === 'T4'
            ? roll < 0.55
              ? HUES.amber
              : HUES.teal
            : roll < 0.62
              ? HUES.cyan
              : roll < 0.88
                ? HUES.teal
                : HUES.violet;
  };
  const plantCluster = (spot, size, onWall) => {
    const hue = pickHue(spot.zone);
    const center = spot.p.clone();
    const cluster = allocCluster(center.clone().addScaledVector(spot.n, 0.3), spot.n, 1.2 + size * 1.6, hue, spot.zone);
    const count = onWall ? 3 + Math.floor(rng() * 4) : 3 + Math.floor(rng() * 6);
    const tangent = new Vector3()
      .crossVectors(spot.n, Math.abs(spot.n.y) < 0.9 ? UP : new Vector3(1, 0, 0))
      .normalize();
    const bitangent = new Vector3().crossVectors(spot.n, tangent).normalize();
    for (let i = 0; i < count; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * size * 0.9;
      const base = center
        .clone()
        .addScaledVector(tangent, Math.cos(ang) * rad)
        .addScaledVector(bitangent, Math.sin(ang) * rad)
        .addScaledVector(spot.n, -0.05);
      const scale = 0.5 + rng() * 0.8 * (i === 0 ? 1.4 : 1);
      const up = spot.n.clone();
      if (onWall) up.lerp(UP, 0.55).normalize();
      else up.add(new Vector3((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5)).normalize();
      addMushroom(acc, {
        base,
        up,
        yaw: rng() * Math.PI * 2,
        height: size * scale * (onWall ? 0.35 : 0.8),
        capR: size * scale * (onWall ? 0.5 : 0.36),
        hue,
        cluster: cluster.id,
        pivot: cluster.pos,
        bend: (rng() - 0.5) * 0.35,
        spots: rng() < 0.5 ? 3 + Math.floor(rng() * 3) : 0,
        droop: 0.12 + rng() * 0.2,
        seed: rng() * 10,
        segments: 11,
      });
    }
    emitters.push({
      x: cluster.pos.x,
      y: cluster.pos.y + 0.2,
      z: cluster.pos.z,
      r: 3.6 + size * 2.8,
      color: hue,
      k: 0.36 + size * 0.3,
    });
    placed.push(center);
  };
  for (const [zone, spec] of Object.entries({
    A: {
      floor: 5,
      wall: 3,
      size: [0.35, 0.7],
    },
    T1: {
      floor: 2,
      wall: 2,
      size: [0.3, 0.5],
    },
    B: {
      floor: 12,
      wall: 8,
      size: [0.4, 0.9],
    },
    T2: {
      floor: 2,
      wall: 3,
      size: [0.3, 0.55],
    },
    C: {
      floor: 3,
      wall: 3,
      size: [0.3, 0.6],
    },
    alcove: {
      floor: 1,
      wall: 1,
      size: [0.3, 0.45],
    },
    S: {
      floor: 2,
      wall: 2,
      size: [0.3, 0.5],
    },
    T3: {
      floor: 2,
      wall: 2,
      size: [0.3, 0.5],
    },
    D: {
      floor: 4,
      wall: 5,
      size: [0.35, 0.65],
    },
    T4: {
      floor: 1,
      wall: 2,
      size: [0.3, 0.5],
    },
    E: {
      floor: 6,
      wall: 8,
      size: [0.4, 0.8],
    },
    T5: {
      floor: 1,
      wall: 2,
      size: [0.3, 0.5],
    },
    F: {
      floor: 12,
      wall: 10,
      size: [0.4, 1],
    },
    shortcut: {
      floor: 1,
      wall: 2,
      size: [0.3, 0.5],
    },
    exitA: {
      floor: 1,
      wall: 1,
      size: [0.3, 0.45],
    },
  })) {
    const surfaces = zones[zone];
    if (!surfaces) continue;
    const chamber = CHAMBERS.find((ch) => ch.id === zone);
    const tunnel = TUNNELS.find((tn) => tn.id === zone);
    const floorCount = Math.round(spec.floor * density);
    const wallCount = Math.round(spec.wall * density);
    for (let i = 0; i < floorCount; i++) {
      const spot = pick(surfaces.floor, (cand) =>
        inKeepClear(cand.p) ||
        !hasRoom(cand.p, 2.6) ||
        (zone === 'B' && inChasm(cand.p, 0.8) && cand.p.y > OY + CHASM.floor + 1.5)
          ? false
          : chamber
            ? chamberDistXZ(chamber, cand.p) > 0.62 || (zone === 'B' && inChasm(cand.p))
            : !tunnel || nearestOnPoly(build.polys[tunnel.id], cand.p.x, cand.p.y, cand.p.z).d > tunnel.r * 0.7,
      );
      if (spot) plantCluster(spot, spec.size[0] + rng() * (spec.size[1] - spec.size[0]), false);
    }
    for (let i = 0; i < wallCount; i++) {
      const spot = pick(surfaces.wall, (cand) => {
        if (inKeepClear(cand.p, -0.5) || !hasRoom(cand.p, 2.4)) return false;
        const ground = build.groundY(cand.p.x, cand.p.z, cand.p.y + 0.2, 6);
        return ground === null || cand.p.y - ground < (zone === 'F' || zone === 'B' ? 5 : 2.2);
      });
      if (spot) plantCluster(spot, (spec.size[0] + rng() * (spec.size[1] - spec.size[0])) * 0.8, true);
    }
  }
  {
    const grotto = getChamber('F');
    const giants = [
      [-1.5, 24.5, 6.5, 3, HUES.cyan],
      [15.5, 25.5, 7.5, 3.4, HUES.teal],
      [13.5, 32.5, 5.2, 2.5, HUES.pink],
      [1.5, 33, 4.8, 2.3, HUES.amber],
      [17.5, 30.5, 3.4, 1.6, HUES.cyan],
      [-2.5, 30.5, 3, 1.5, HUES.violet],
    ];
    for (const [gx, gz, height, capR, hue] of giants) {
      const x = OX + gx;
      const z = OZ + gz;
      const gy = build.groundY(x, z, OY + grotto.floor + 3, 8) ?? OY + grotto.floor;
      const base = new Vector3(x, gy - 0.1, z);
      const cluster = allocCluster(new Vector3(x, gy + height * 0.8, z), UP, capR * 2.2, hue, 'F');
      cluster.giant = true;
      addMushroom(acc, {
        base,
        up: new Vector3((rng() - 0.5) * 0.15, 1, (rng() - 0.5) * 0.15).normalize(),
        yaw: rng() * Math.PI * 2,
        height,
        capR,
        hue,
        cluster: cluster.id,
        pivot: cluster.pos,
        bend: (rng() - 0.5) * 0.8,
        spots: 7,
        droop: 0.2,
        seed: rng() * 10,
        glow: 0.8,
        segments: 16,
      });
      emitters.push({
        x,
        y: gy + height * 0.75,
        z,
        r: 7 + capR * 1.5,
        color: hue,
        k: 0.55,
      });
      solids.push({
        x,
        y: gy + height * 0.45,
        z,
        r: Math.max(0.25, capR * 0.16 * 1.2),
        hh: height * 0.45,
        surface: 'wood',
      });
      placed.push(base);
    }
  }
  const placeCrystal = (lx, floor, lz, size, hueIndex = -1, solid = false) => {
    const x = OX + lx;
    const z = OZ + lz;
    const gy = build.groundY(x, z, OY + floor + 2.5, 8) ?? OY + floor;
    const base = new Vector3(x, gy, z);
    const hue = addCrystalCluster(
      crystalAcc,
      base,
      new Vector3((rng() - 0.5) * 0.3, 1, (rng() - 0.5) * 0.3).normalize(),
      size,
      rng,
      hueIndex,
    );
    emitters.push({
      x,
      y: gy + size * 0.8,
      z,
      r: 3.5 + size * 2.4,
      color: hue,
      k: 0.35 + size * 0.12,
    });
    if (solid)
      solids.push({
        x,
        y: gy + size * 0.6,
        z,
        r: size * 0.42,
        hh: size * 0.6,
        surface: 'stone',
      });
    placed.push(base);
  };
  placeCrystal(-20.5, 1, -27, 2.6, 0, true);
  placeCrystal(-26.5, 1, -24.5, 1.4, 1);
  placeCrystal(-14, 1, -24, 1.2, 2);
  placeCrystal(-25, 1, -32.5, 1.5, 3);
  placeCrystal(-17.5, 1, -32.5, 1.1, 0);
  placeCrystal(-28.5, 1, -28, 1, 2);
  placeCrystal(-12.5, 1, -28.5, 0.8, 1);
  placeCrystal(-9.5, 7.5, -36, 1, 3);
  placeCrystal(-5.5, 7.5, -31.5, 0.8, 0);
  placeCrystal(-31, -2, 5, 0.8, 1);
  placeCrystal(-30.5, -8, -4.5, 1, 0);
  placeCrystal(-17, -8, -0.5, 0.8, 3);
  placeCrystal(31.5, 0.5, 3, 1.2, 1);
  placeCrystal(14, 0.5, -3.5, 0.9, 0);
  placeCrystal(4, 2, -30.5, 0.7, 2);
  placeCrystal(-33, 0, 25.5, 0.7, 3);
  const galleryWalls = zones.C?.wall ?? [];
  for (let i = 0; i < Math.round(8 * density); i++) {
    const spot = pick(galleryWalls, (cand) => !inKeepClear(cand.p) && hasRoom(cand.p, 2.2));
    if (!spot) continue;
    const hue = addCrystalCluster(
      crystalAcc,
      spot.p.clone().addScaledVector(spot.n, -0.1),
      spot.n.clone().lerp(UP, 0.3),
      0.6 + rng() * 0.6,
      rng,
    );
    emitters.push({
      x: spot.p.x + spot.n.x * 0.5,
      y: spot.p.y + spot.n.y * 0.5,
      z: spot.p.z + spot.n.z * 0.5,
      r: 3.2,
      color: hue,
      k: 0.3,
    });
    placed.push(spot.p);
  }
  for (const [zone, spec] of Object.entries({
    A: {
      tites: 8,
      mites: 3,
      boulders: 3,
    },
    B: {
      tites: 16,
      mites: 4,
      boulders: 3,
    },
    C: {
      tites: 12,
      mites: 3,
      boulders: 2,
    },
    D: {
      tites: 8,
      mites: 2,
      boulders: 2,
    },
    E: {
      tites: 14,
      mites: 3,
      boulders: 3,
    },
    F: {
      tites: 10,
      mites: 2,
      boulders: 2,
    },
    S: {
      tites: 5,
      mites: 0,
      boulders: 0,
    },
    T1: {
      tites: 5,
      mites: 1,
      boulders: 1,
    },
    T2: {
      tites: 4,
      mites: 1,
      boulders: 1,
    },
    T3: {
      tites: 3,
      mites: 0,
      boulders: 1,
    },
    T4: {
      tites: 3,
      mites: 0,
      boulders: 0,
    },
    T5: {
      tites: 3,
      mites: 0,
      boulders: 0,
    },
  })) {
    const surfaces = zones[zone];
    if (!surfaces) continue;
    const chamber = CHAMBERS.find((ch) => ch.id === zone);
    for (let i = 0; i < spec.tites; i++) {
      const spot = pick(surfaces.ceil, (cand) => {
        const lx = cand.p.x - OX;
        const lz = cand.p.z - OZ;
        return (lx - SHAFT.x) ** 2 + (lz - SHAFT.z) ** 2 > (SHAFT.r + 1.5) ** 2;
      });
      if (!spot) continue;
      const len = 0.7 + rng() * (zone.startsWith('T') ? 1.4 : 3.2);
      const ground = build.groundY(spot.p.x, spot.p.z, spot.p.y - 0.3, 20);
      if ((ground === null ? 99 : spot.p.y - ground) < len + 2.6) continue;
      const tite = dripstoneGeometry(0.18 + rng() * 0.45 * (len / 3), len, true, rng() * 10);
      tite.translate(spot.p.x, spot.p.y + 0.25, spot.p.z);
      build.addDeco(tite);
      if (ground !== null)
        tips.push({
          x: spot.p.x,
          y: spot.p.y + 0.2 - len,
          z: spot.p.z,
          floor: ground,
        });
      if (rng() < 0.25)
        emitters.push({
          x: spot.p.x,
          y: spot.p.y - len,
          z: spot.p.z,
          r: 2.2,
          color: HUES.teal,
          k: 0.12,
        });
    }
    for (let i = 0; i < spec.mites; i++) {
      const spot = pick(
        surfaces.floor,
        (cand) =>
          !inKeepClear(cand.p, 0.8) &&
          !inChasm(cand.p, 1.2) &&
          (!chamber || chamberDistXZ(chamber, cand.p) > 0.72) &&
          hasRoom(cand.p, 1.6),
      );
      if (!spot) continue;
      const height = 0.8 + rng() * 1.8;
      const mite = dripstoneGeometry(0.3 + rng() * 0.35, height, false, rng() * 10);
      mite.translate(spot.p.x, spot.p.y - 0.15, spot.p.z);
      build.addDeco(mite);
      placed.push(spot.p);
    }
    for (let i = 0; i < spec.boulders; i++) {
      const spot = pick(
        surfaces.floor,
        (cand) =>
          !inKeepClear(cand.p, 1) &&
          !inChasm(cand.p, 1.5) &&
          (!chamber || chamberDistXZ(chamber, cand.p) > 0.7) &&
          hasRoom(cand.p, 2),
      );
      if (!spot) continue;
      const size = 0.5 + rng() * 0.8;
      const boulder = boulderGeometry(size, rng() * 10, 0.55 + rng() * 0.3);
      boulder.rotateY(rng() * Math.PI * 2);
      boulder.translate(spot.p.x, spot.p.y + size * 0.15, spot.p.z);
      build.addDeco(boulder);
      placed.push(spot.p);
    }
  }
  const rootCounts = {
    A: 6,
    B: 8,
    F: 8,
    T1: 3,
    E: 4,
    exitA: 2,
    shortcut: 3,
  };
  const rootColor = new Color(0.42, 0.34, 0.3);
  const mossColor = new Color(0.2, 0.36, 0.28);
  const rootClusters = {};
  for (const [zone, count] of Object.entries(rootCounts)) {
    const surfaces = zones[zone];
    if (surfaces)
      for (let i = 0; i < Math.round(count * density); i++) {
        const spot = pick([...surfaces.ceil, ...surfaces.wall.filter((s) => s.n.y < 0.1)], () => true);
        if (!spot) continue;
        const ground = build.groundY(spot.p.x, spot.p.z, spot.p.y - 0.3, 20);
        const clearance = ground === null ? 6 : spot.p.y - ground;
        if (clearance < 3.2) continue;
        const len = Math.min(clearance - 2.4, 1 + rng() * 2.4);
        const mossy = rng() < 0.45;
        const anchor = spot.p.clone().addScaledVector(spot.n, -0.2);
        const drift = new Vector3((rng() - 0.5) * 0.8, 0, (rng() - 0.5) * 0.8);
        const pts = [
          anchor,
          anchor.clone().add(new Vector3(drift.x * 0.3, -len * 0.35, drift.z * 0.3)),
          anchor.clone().add(new Vector3(drift.x, -len, drift.z)),
        ];
        const curve = new CatmullRomCurve3(pts);
        const radius = mossy ? 0.075 : 0.05 + rng() * 0.05;
        const tube = taperedTube(curve, 8, 4, (t) => radius * (1 - t * 0.7));
        const tipHue = rng() < 0.5 ? HUES.cyan : HUES.teal;
        const cluster = (rootClusters[zone] ??= allocCluster(pts[2], new Vector3(0, -1, 0), 1.2, HUES.cyan, zone));
        acc.add(
          tube,
          new Matrix4(),
          mossy ? mossColor : rootColor,
          mossy ? 5 : 4,
          cluster.id,
          0,
          tipHue,
          anchor,
          (vi) => (Math.floor(vi / 5) / 8) * Math.min(1, len / 2.5),
        );
        if (!mossy) {
          const tip = new IcosahedronGeometry(0.09 + rng() * 0.05, 1);
          tip.deleteAttribute('uv');
          tip.translate(pts[2].x, pts[2].y - 0.04, pts[2].z);
          acc.add(tip, new Matrix4(), new Color(0.9, 1, 1), 3, cluster.id, 1.3, tipHue, anchor, Math.min(1, len / 2.5));
          emitters.push({
            x: pts[2].x,
            y: pts[2].y,
            z: pts[2].z,
            r: 2.2,
            color: tipHue,
            k: 0.12,
          });
        }
      }
  }
  pools.push({
    x: OX + (CHASM.x0 + CHASM.x1) / 2,
    y: OY + CHASM.floor + 0.35,
    z: OZ + (CHASM.z0 + CHASM.z1) / 2,
    rx: (CHASM.x1 - CHASM.x0) / 2 + 0.4,
    rz: (CHASM.z1 - CHASM.z0) / 2 + 0.4,
  });
  pools.push({
    x: OX + POOL.x,
    y: OY - 0.16,
    z: OZ + POOL.z,
    rx: POOL.rx + 0.2,
    rz: POOL.rz + 0.2,
  });
  emitters.push({
    x: OX + POOL.x,
    y: OY + 0.2,
    z: OZ + POOL.z,
    r: 5,
    color: HUES.teal,
    k: 0.25,
  });
  emitters.push({
    x: OX + (CHASM.x0 + CHASM.x1) / 2,
    y: OY + CHASM.floor + 0.8,
    z: OZ + (CHASM.z0 + CHASM.z1) / 2,
    r: 8,
    color: HUES.teal,
    k: 0.22,
  });
  return {
    fungus: acc.geometry(),
    crystals: crystalAcc.geometry(),
    clusters,
    emitters,
    solids,
    pools,
    tips,
    allocCluster,
    acc,
  };
}
