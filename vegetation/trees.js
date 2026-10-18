/**
 * Trees: picks spots and species (broadleaf, conifer, birch, palm) by biome, batches tinted trunks and foliage, adds trunk colliders and canopy shade, and keeps a spatial hash for finding trees near a point.
 */
import { Color, Group, Matrix4, Quaternion, Vector3 } from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
import { fbm, makeNoise2D, makeRng, smoothstep } from '../core/math.js';
import { buildBirch, buildBroadleaf, buildConifer, buildPalm } from '../shared/tree-species.js';
import { makeRng as makeRng2 } from '../shared/veg-material.js';
import { InstanceBatcher } from './batcher.js';
const TREE_SPACING = {
  broadleaf: 5.4,
  conifer: 3.8,
  birch: 2.8,
  palm: 4.6,
};
const TREE_VARIANTS = {
  broadleaf: 4,
  conifer: 3,
  birch: 3,
  palm: 3,
};
const FOLIAGE_TINTS = {
  broadleaf: ['#86c653', '#94cc57', '#79bb5a', '#a3cd5c', '#80c04e', '#8fc463'],
  birch: ['#a8d85c', '#b6de66', '#9ed25e', '#c0e06a'],
  conifer: ['#ffffff', '#e8f6ec', '#f6fbe6', '#dfeee8'],
  palm: ['#96c55a', '#a1c95e'],
};
class SpatialHash {
  size;
  cells = new Map();
  constructor(size) {
    this.size = size;
  }
  key(cx, cz) {
    return (cx + 4096) * 8192 + (cz + 4096);
  }
  add(item) {
    const k = this.key(Math.floor(item.position.x / this.size), Math.floor(item.position.z / this.size));
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = []));
    cell.push(item);
  }
  query(x, z, radius, out = []) {
    const x0 = Math.floor((x - radius) / this.size);
    const x1 = Math.floor((x + radius) / this.size);
    const z0 = Math.floor((z - radius) / this.size);
    const z1 = Math.floor((z + radius) / this.size);
    for (let i = x0; i <= x1; i++)
      for (let j = z0; j <= z1; j++) {
        const cell = this.cells.get(this.key(i, j));
        if (cell) for (const item of cell) out.push(item);
      }
    return out;
  }
}
function placeTrees(veg, rules) {
  const { field } = veg;
  const rng = makeRng2(makeRng('veg-trees-v2'));
  const noise = makeNoise2D('veg-copse');
  const spots = [];
  const hash = new SpatialHash(8);
  const pos = new Vector3();
  const nearby = [];
  for (let i = 0; i < 90000 && spots.length < 1100; i++) {
    const x2 = rng.range(-156, 156);
    const z = rng.range(-156, 156);
    const h2 = field.heightAt(x2, z);
    if (h2 < 0.5 || field.slopeAt(x2, z) > 0.42) continue;
    const clear = rules.clearDist(x2, z);
    if (clear < 0) continue;
    const surf = rules.surface(x2, z);
    const beachD = rules.distTo('beach', x2, z);
    const onBeach = surf === 'sand' && h2 > 0.6 && h2 < 5 && beachD < 60;
    if (!onBeach && surf !== 'grass' && surf !== 'dirt') continue;
    const lakeD = rules.distTo('lake', x2, z);
    const forestD = rules.distTo('forest', x2, z) + fbm(noise, x2 * 0.03, z * 0.03, 3) * 16;
    const groveD = rules.distTo('grove', x2, z);
    let weight;
    if (onBeach) weight = 0.22 * smoothstep(60, 25, beachD);
    else {
      weight = 0.02;
      weight += smoothstep(60, 22, forestD) * 0.95;
      weight += smoothstep(32, 16, groveD) * 0.9;
      weight += smoothstep(0.3, 0.52, fbm(noise, x2 * 0.022 + 11, z * 0.022 - 7, 3)) * 0.5;
      weight += smoothstep(9, 0, Math.abs(lakeD - 50)) * 0.28 * (0.5 + 0.5 * noise(x2 * 0.05, z * 0.05));
      weight *= smoothstep(56, 30, h2) * 0.85 + 0.15;
      weight *= 1 - rules.dryMeadow(x2, z) * 0.92;
      weight *= smoothstep(0.1, 0.5, field.densityAt(x2, z)) * 0.75 + 0.25;
      const dx = x2 - rules.lm.spawn.x;
      const dz = z - rules.lm.spawn.z;
      const dist = Math.hypot(dx, dz);
      const inView = dz < 0 ? smoothstep(0.5, 0.9, -dz / Math.max(dist, 0.001)) : 0;
      weight *= smoothstep(20, 70 + inView * 40, dist) * 0.9 + 0.1;
    }
    weight *= smoothstep(0, 7, clear);
    if (rng.next() > 0.085 * Math.max(0, weight) ** 1.3) continue;
    let species;
    if (onBeach) species = 'palm';
    else {
      const high = smoothstep(16, 32, h2);
      const lakeside = smoothstep(14, 0, Math.abs(lakeD - 48));
      const forest = smoothstep(60, 22, forestD);
      const pConifer = 0.14 + high * 0.7 + forest * 0.14;
      const pBirch = 0.16 + lakeside * 0.5 + (groveD < 32 ? 0.25 : 0);
      const roll = rng.next();
      species = roll < pConifer ? 'conifer' : roll < pConifer + pBirch ? 'birch' : 'broadleaf';
    }
    if (clear < (species === 'broadleaf' || species === 'palm' ? 4 : 2.5)) continue;
    const scale = rng.range(0.82, 1.22) * (species === 'conifer' ? 1 + smoothstep(20, 45, h2) * 0.1 : 1);
    const spacing = TREE_SPACING[species] * scale;
    nearby.length = 0;
    hash.query(x2, z, 7, nearby);
    let free = true;
    for (const other of nearby)
      if (Math.hypot(other.position.x - x2, other.position.z - z) < (spacing + other.sp) * 0.5 * 0.9) {
        free = false;
        break;
      }
    if (!free || rules.nearPath(x2, z, species === 'broadleaf' ? 3.5 : 2.2)) continue;
    const ground = Math.min(
      h2,
      field.heightAt(x2 + 0.3, z),
      field.heightAt(x2 - 0.3, z),
      field.heightAt(x2, z + 0.3),
      field.heightAt(x2, z - 0.3),
    );
    hash.add({
      position: pos.set(x2, ground, z).clone(),
      sp: spacing,
    });
    spots.push({
      x: x2,
      y: ground,
      z,
      species,
      variant: Math.floor(rng.next() * TREE_VARIANTS[species]),
      scale,
      yaw: rng.range(0, Math.PI * 2),
    });
  }
  return spots;
}
export function createTrees(veg, mats, rules) {
  const { ctx, field } = veg;
  const group = new Group();
  group.name = 'vegetation-trees';
  const builders = {
    broadleaf: buildBroadleaf,
    conifer: buildConifer,
    birch: buildBirch,
    palm: buildPalm,
  };
  const models = {
    broadleaf: [],
    conifer: [],
    birch: [],
    palm: [],
  };
  for (const species of Object.keys(builders))
    for (let i = 0; i < TREE_VARIANTS[species]; i++) models[species].push(builders[species](`${species}-${i}`));
  const spots = placeTrees(veg, rules);
  const trees = [];
  const hash = new SpatialHash(10);
  const rng = makeRng2(makeRng('veg-tree-tints'));
  const quat = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const pos = new Vector3();
  const scale = new Vector3();
  const tint = new Color();
  const geos = [];
  const batcher = new InstanceBatcher(ctx.renderer);
  for (const species of Object.keys(models))
    models[species].forEach((model, i) => {
      const placed = spots.filter((spot) => spot.species === species && spot.variant === i);
      geos.push(model.trunk, model.foliage);
      if (!placed.length) return;
      const barkMat = species === 'birch' ? mats.bark.birch : species === 'palm' ? mats.bark.palm : mats.bark.brown;
      const leafMat = species === 'conifer' ? mats.solid : mats.foliage;
      const leafDepth = species === 'conifer' ? mats.solidDepth : mats.foliageDepth;
      const tints = FOLIAGE_TINTS[species];
      const matrices = [];
      const trunkColors = [];
      const leafColors = [];
      placed.forEach((spot, i) => {
        quat.setFromAxisAngle(up, spot.yaw);
        pos.set(spot.x, spot.y - 0.05, spot.z);
        scale.setScalar(spot.scale);
        matrices.push(new Matrix4().compose(pos, quat, scale));
        trunkColors.push(new Color().setScalar(rng.range(0.85, 1.1)));
        tint.set(rng.pick(tints));
        const hsl = {
          h: 0,
          s: 0,
          l: 0,
        };
        tint.getHSL(hsl);
        leafColors.push(
          new Color().setHSL(
            hsl.h + rng.range(-0.02, 0.02),
            hsl.s * rng.range(0.9, 1.08),
            hsl.l * rng.range(0.92, 1.06),
          ),
        );
        const tree = {
          id: trees.length,
          position: new Vector3(spot.x, spot.y, spot.z),
          radius: model.canopyR * spot.scale,
          height: model.height * spot.scale,
          flammable: true,
        };
        trees.push(tree);
        hash.add(tree);
        field.splatCanopy(
          spot.x,
          spot.z,
          model.canopyR * spot.scale * (species === 'birch' ? 1.2 : 1),
          species === 'palm' ? 0.35 : 0.7,
        );
        try {
          const halfH = (model.trunkH * spot.scale) / 2;
          const desc = ctx.RAPIER.ColliderDesc.cylinder(halfH, Math.max(0.12, model.trunkR * spot.scale * 0.95))
            .setTranslation(spot.x, spot.y + halfH - 0.2, spot.z)
            .setCollisionGroups(COLLISION_GROUPS.static)
            .setFriction(0.8);
          const collider = ctx.physics.createCollider(desc);
          ctx.colliders.register(collider, {
            kind: 'tree',
            surface: 'wood',
            flammable: true,
            object: group,
            data: tree,
          });
        } catch (err) {
          if (i === 0) console.warn('[vegetation] tree collider failed', err);
        }
      });
      batcher.add(`tree-${species}-trunk`, model.trunk, barkMat, mats.barkDepth, true, matrices, trunkColors);
      batcher.add(`tree-${species}-foliage`, model.foliage, leafMat, leafDepth, true, matrices, leafColors);
    });
  batcher.build(group);
  const found = [];
  return {
    group,
    multiDraw: batcher.multiDraw,
    trees,
    hash,
    treesNear(pos, radius) {
      found.length = 0;
      hash.query(pos.x, pos.z, radius + 6, found);
      return found.filter(
        (tree) => Math.hypot(tree.position.x - pos.x, tree.position.z - pos.z) <= radius + tree.radius * 0.5,
      );
    },
    dispose() {
      for (const geo of geos) geo.dispose();
    },
  };
}
